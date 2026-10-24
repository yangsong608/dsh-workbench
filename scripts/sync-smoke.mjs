#!/usr/bin/env node
/**
 * 增量同步冒烟测试（P1-1）。
 *
 * 做法：不监听端口。用临时 SQLite 库调用宿主 bundle 的 apply()，拿到 /workbench-api
 * 路由处理器，再用假的 req/res 直接调用，等价于 HTTP 请求（含路径解析、JSON 读写）。
 *
 * 覆盖：
 *   1. PUT /state 造 3 条任务 → delta 分页（limit=2 → more=true）→ delta 取剩余；
 *   2. 快照删掉 1 条任务 → delta(since=0) 得到 3 条 upsert + 1 条 delete 墓碑；
 *   3. POST /sync/push 更新一条任务 → 再 delta 能取到新行；
 *   4. POST /sync/push 带旧 updated_at → 返回 conflict（带 current 行）；
 *   5. push 删除一条任务 → delta 拿到 delete；
 *   6. 笔记 / 笔记本 / 新闻订阅的删除入口都留下墓碑；
 *   7. GET /sync/meta 计数正确；未知 entity 返回 400。
 *
 * 运行前先构建：pnpm run bundle:host
 * 然后：node scripts/sync-smoke.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-wb-sync-'))
process.env.DSH_HOME = tempRoot
process.env.DSH_WORKBENCH_DB = join(tempRoot, 'workbench.sqlite')

const { apply } = await import('../lib/index.js')

/* ------------------------------------------------------------------ */
/* 最小 HTTP 桩                                                        */
/* ------------------------------------------------------------------ */

let route = null
const ctx = {
  webServer: { register(value) { route = value; return () => {} } },
  tools: { register() { /* 冒烟测试不关心工具注册 */ } },
}

apply(ctx)
if (route === null) {
  console.error('[sync-smoke] apply() 没有注册 /workbench-api 路由')
  process.exit(1)
}

/** 调一次端点，返回 { status, body }。 */
function call(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = {
      url: `/workbench-api${path}`,
      method,
      json: async () => body,
    }
    const res = {
      status: 0,
      writeHead(status) { this.status = status },
      end(payload) {
        let parsed = null
        try { parsed = typeof payload === 'string' ? JSON.parse(payload) : payload } catch { parsed = payload }
        resolve({ status: this.status, body: parsed })
      },
    }
    try { route.handler(req, res) } catch (cause) { reject(cause) }
  })
}

const get = (path) => call('GET', path)
const post = (path, body) => call('POST', path, body)
const put = (path, body) => call('PUT', path, body)
const del = (path) => call('DELETE', path)

/* ------------------------------------------------------------------ */
/* 断言                                                                */
/* ------------------------------------------------------------------ */

let failed = 0
function check(name, ok, detail = '') {
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  (${detail})`}`)
}

const tasksOf = (body) => (body?.changes ?? []).filter((c) => c.entity === 'tasks')
const changesOf = (body, entity) => (body?.changes ?? []).filter((c) => c.entity === entity)

/* ------------------------------------------------------------------ */
/* 准备：清空宿主构造函数里播种的示例数据                              */
/* ------------------------------------------------------------------ */

{
  const raw = new DatabaseSync(process.env.DSH_WORKBENCH_DB)
  raw.exec(`DELETE FROM tombstones;
    DELETE FROM subtasks; DELETE FROM attachments; DELETE FROM logs; DELETE FROM tasks;
    DELETE FROM spaces; DELETE FROM focus_sessions; DELETE FROM settings;
    DELETE FROM notes; DELETE FROM notebooks; DELETE FROM news_topics; DELETE FROM news_items;`)
  raw.close()
}

const at = (time) => `2026-01-01 ${time}`
function task(id, title, updatedAt) {
  return {
    id, title, desc: '', note: '', space: 's1', projectPath: '', status: 'next', priority: 'normal',
    tags: [], date: null, start: '', end: '', duration: 0, group: '',
    createdAt: at('00:00:00'), updatedAt, completedAt: null,
    subtasks: [{ id: `sub-${id}`, title: '子待办', done: false, start: '', end: '', note: '' }],
  }
}

const spaces = [{ id: 's1', name: '生活', color: '#5b5bd6' }]
const t1 = task('t1', '任务一', at('00:00:01'))
const t2 = task('t2', '任务二', at('00:00:02'))
const t3 = task('t3', '任务三', at('00:00:03'))

/* ------------------------------------------------------------------ */
/* 1. 快照造 3 条任务 + delta 分页                                     */
/* ------------------------------------------------------------------ */

let response = await put('/state', {
  state: {
    spaces, tasks: [t1, t2, t3],
    focus: [{ id: 'f1', taskId: 't2', startedAt: '2026-01-01 01:00:00', minutes: 25, completed: true }],
    settings: {},
  },
})
check('PUT /state 写入 3 条任务', response.status === 200 && typeof response.body.revision === 'number')

response = await get('/sync/delta?since=0&entity=tasks&limit=200')
const created = tasksOf(response.body)
check('delta(since=0) 首次全量得到 3 条 upsert', created.length === 3 && created.every((c) => c.op === 'upsert' && c.row !== undefined),
  JSON.stringify(created.map((c) => `${c.op}:${c.id}`)))
check('upsert 行带完整任务字段（含 subtasks）',
  created.every((c) => typeof c.row?.title === 'string' && Array.isArray(c.row?.subtasks)) && created[0].updatedAt === at('00:00:01'))
const createdCursor = response.body.cursor

response = await get('/sync/delta?since=0&entity=tasks&limit=2')
check('delta 首页 limit=2 返回 2 条且 more=true', tasksOf(response.body).length === 2 && response.body.more === true,
  `changes=${(response.body?.changes ?? []).length} more=${response.body?.more}`)
const pageCursor = response.body.cursor

response = await get(`/sync/delta?since=${encodeURIComponent(pageCursor)}&entity=tasks&limit=2`)
check('delta 次页拿到剩余 1 条且 more=false', tasksOf(response.body).length === 1 && response.body.more === false && tasksOf(response.body)[0].id === 't3')

/* ------------------------------------------------------------------ */
/* 2. 快照删掉 t2 → 墓碑可见                                           */
/* ------------------------------------------------------------------ */

response = await put('/state', { state: { spaces, tasks: [t1, t3], focus: [], settings: {} } })
check('PUT /state 删除 t2 成功', response.status === 200)

response = await get('/sync/delta?since=0&entity=tasks&limit=200')
const allTasks = tasksOf(response.body)
const upserts = allTasks.filter((c) => c.op === 'upsert')
const deletes = allTasks.filter((c) => c.op === 'delete')
/* 物理删除后行已不存在：since=0 是「现存行 + 墓碑」，所以是 2 条 upsert + 1 条 delete。 */
check('delta(since=0) 得到 2 条现存 upsert（t1/t3）+ 1 条 delete 墓碑（t2）',
  upserts.length === 2 && upserts.map((c) => c.id).sort().join(',') === 't1,t3' &&
  deletes.length === 1 && deletes[0].id === 't2', JSON.stringify(allTasks.map((c) => `${c.op}:${c.id}`)))
const afterDeleteCursor = response.body.cursor

response = await get(`/sync/delta?since=${encodeURIComponent(createdCursor)}&entity=tasks`)
const sincePage = tasksOf(response.body)
check('删除后从旧游标拉增量只包含 t2 墓碑（未变化的行不重复）',
  sincePage.length === 1 && sincePage[0].op === 'delete' && sincePage[0].id === 't2', JSON.stringify(sincePage.map((c) => `${c.op}:${c.id}`)))

/* 快照删除的子待办 / 专注记录同样要记墓碑（delta 不单独下发 subtasks，但表里必须有账）。 */
{
  const raw = new DatabaseSync(process.env.DSH_WORKBENCH_DB)
  const pairs = raw.prepare('SELECT entity, id FROM tombstones ORDER BY entity, id').all().map((r) => `${r.entity}:${r.id}`)
  raw.close()
  check('快照删除子待办留下 subtasks 墓碑', pairs.includes('subtasks:sub-t2'), JSON.stringify(pairs))
  check('快照删除专注记录留下 focus_sessions 墓碑', pairs.includes('focus_sessions:f1'), JSON.stringify(pairs))
  check('未变化的子待办不记墓碑', !pairs.includes('subtasks:sub-t1') && !pairs.includes('subtasks:sub-t3'))
}

/* `focus` 是 focus_sessions 的兼容别名，delta 也认。 */
response = await get('/sync/delta?since=0&entity=focus')
check('delta 接受 focus 别名并返回 focus_sessions 墓碑',
  changesOf(response.body, 'focus_sessions').some((c) => c.op === 'delete' && c.id === 'f1'),
  JSON.stringify(changesOf(response.body, 'focus_sessions').map((c) => `${c.op}:${c.id}`)))

/* ------------------------------------------------------------------ */
/* 3. push 更新 → delta 能取到                                        */
/* ------------------------------------------------------------------ */

response = await post('/sync/push', {
  changes: [{ entity: 'tasks', id: 't1', op: 'upsert', updatedAt: '2030-01-01 00:00:00', row: { title: '任务一（手机改）', status: 'doing' } }],
})
check('push 更新被接受', response.status === 200 && response.body.accepted.includes('t1') && response.body.conflicts.length === 0,
  JSON.stringify(response.body))

response = await get(`/sync/delta?since=${encodeURIComponent(afterDeleteCursor)}&entity=tasks`)
check('push 后再 delta 取到 t1 upsert',
  tasksOf(response.body).length === 1 && tasksOf(response.body)[0].id === 't1' && tasksOf(response.body)[0].row.title === '任务一（手机改）')
check('push 的 updatedAt 成为该行时间戳', tasksOf(response.body)[0]?.updatedAt === '2030-01-01 00:00:00')

response = await get('/state')
const stateTask = response.body.tasks.find((t) => t.id === 't1')
check('push 后 GET /state 反映新标题/状态/空间',
  stateTask?.title === '任务一（手机改）' && stateTask?.status === 'doing' && stateTask?.space === 's1', JSON.stringify(stateTask))
check('state 中 t1 的子待办未被 partial row 清空', stateTask?.subtasks?.[0]?.id === 'sub-t1')

/* ------------------------------------------------------------------ */
/* 4. push 旧 updated_at → conflict                                    */
/* ------------------------------------------------------------------ */

response = await post('/sync/push', {
  changes: [{ entity: 'tasks', id: 't1', op: 'upsert', updatedAt: '2026-02-01 00:00:00', row: { title: '旧数据' } }],
})
check('push 旧时间戳返回 conflict', response.status === 200 && response.body.accepted.length === 0 && response.body.conflicts.length === 1,
  JSON.stringify(response.body))
const conflict = response.body.conflicts?.[0]
check('conflict 带 current 行', conflict?.entity === 'tasks' && conflict?.id === 't1' && conflict?.current?.title === '任务一（手机改）')

response = await get('/state')
check('conflict 不落库（标题仍是新的）', response.body.tasks.find((t) => t.id === 't1')?.title === '任务一（手机改）')

/* ------------------------------------------------------------------ */
/* 5. push 删除 → delta 拿到 delete                                    */
/* ------------------------------------------------------------------ */

response = await post('/sync/push', { changes: [{ entity: 'tasks', id: 't3', op: 'delete', updatedAt: '2030-02-01 00:00:00' }] })
check('push delete 被接受', response.body.accepted.includes('t3') && response.body.conflicts.length === 0)

response = await get('/sync/delta?since=2030-01-01%2000%3A00%3A00&entity=tasks')
const afterPushDelete = tasksOf(response.body)
check('push delete 后 delta 返回 t3 墓碑', afterPushDelete.length === 1 && afterPushDelete[0].op === 'delete' && afterPushDelete[0].id === 't3',
  JSON.stringify(afterPushDelete.map((c) => `${c.op}:${c.id}`)))

response = await get('/state')
check('push delete 是物理删除（state 只剩 t1）', response.body.tasks.length === 1 && response.body.tasks[0].id === 't1')

/* ------------------------------------------------------------------ */
/* 6. 笔记 / 笔记本 / 新闻订阅：删除入口留墓碑                          */
/* ------------------------------------------------------------------ */

response = await post('/notes', { title: '同步测试笔记', content: '正文' })
const noteId = response.body.note?.id
check('POST /notes 创建笔记', typeof noteId === 'string' && noteId !== '')
response = await del(`/notes/${encodeURIComponent(noteId)}`)
check('DELETE /notes/:id 成功', response.status === 200)
response = await get('/sync/delta?since=0&entity=notes')
const noteChanges = changesOf(response.body, 'notes')
check('笔记删除留下墓碑', noteChanges.some((c) => c.op === 'delete' && c.id === noteId), JSON.stringify(noteChanges.map((c) => `${c.op}:${c.id}`)))

response = await post('/notebooks', { notebook: { name: '临时笔记本' } })
const notebookId = response.body.notebook?.id
response = await del(`/notebooks/${encodeURIComponent(notebookId)}`)
check('DELETE /notebooks/:id 成功', response.status === 200)
response = await get('/sync/delta?since=0&entity=notebooks')
const notebookChanges = changesOf(response.body, 'notebooks')
check('笔记本删除留下墓碑', notebookChanges.some((c) => c.op === 'delete' && c.id === notebookId),
  JSON.stringify(notebookChanges.map((c) => `${c.op}:${c.id}`)))

response = await post('/news/topics', { topic: { title: '同步订阅', query: 'DeepSeek' } })
const topicId = response.body.topic?.id
response = await del(`/news/topics/${encodeURIComponent(topicId)}`)
check('DELETE /news/topics/:id 成功', response.status === 200)
response = await get('/sync/delta?since=0&entity=news_topics')
const topicChanges = changesOf(response.body, 'news_topics')
check('新闻订阅删除留下墓碑', topicChanges.some((c) => c.op === 'delete' && c.id === topicId),
  JSON.stringify(topicChanges.map((c) => `${c.op}:${c.id}`)))

/* ------------------------------------------------------------------ */
/* 7. meta 与错误处理                                                  */
/* ------------------------------------------------------------------ */

response = await get('/sync/meta')
check('GET /sync/meta 返回全部实体', response.status === 200 &&
  ['tasks', 'notes', 'notebooks', 'news_topics', 'focus_sessions', 'spaces'].every((name) => response.body?.entities?.[name] !== undefined),
  JSON.stringify(response.body?.entities))
check('meta 任务计数 = 1（t1）', response.body?.entities?.tasks?.count === 1, String(response.body?.entities?.tasks?.count))
check('meta 提供 focus 别名（与 focus_sessions 一致）',
  response.body?.entities?.focus?.count === response.body?.entities?.focus_sessions?.count &&
  response.body?.entities?.focus?.maxUpdatedAt === response.body?.entities?.focus_sessions?.maxUpdatedAt)
check('meta 带 maxUpdatedAt', response.body?.entities?.tasks?.maxUpdatedAt === '2030-01-01 00:00:00', String(response.body?.entities?.tasks?.maxUpdatedAt))

response = await get('/sync/delta?entity=bogus')
check('未知 entity 返回 400 bad_request', response.status === 400 && response.body?.error === 'bad_request', JSON.stringify(response.body))

/* ------------------------------------------------------------------ */

rmSync(tempRoot, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项失败`}`)
process.exitCode = failed === 0 ? 0 : 1
