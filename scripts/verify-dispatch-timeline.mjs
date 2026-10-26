// 派发时间线自检（1.15 C2）：事件记录、事件查询、按成员聚合、耗时计算。
// 用法：node scripts/verify-dispatch-timeline.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-timeline-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register() {} } })
const route = reg.find(r => r.path === '/workbench-api')
const call = (m, u, b) => new Promise(res => {
  const req = { url: `/workbench-api${u}`, method: m, json: async () => b ?? {} }
  route.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? JSON.parse(p) : null }) } })
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

// 造派发
const raw = new DatabaseSync(join(tmp, 'wb.sqlite'))
const did = 'ad-timeline-test'
const now = new Date().toISOString()
raw.prepare(`INSERT INTO agent_dispatches(id,idea_id,run_id,team_id,session_id,status,goal,workspace_path,timeout_ms,member_count,kickoff,started_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(did, '', '', 'at-x', '', 'running', '时间线测试目标', tmp, 60000, 0, '', now)
raw.close()

// 1) POST 事件
const e1 = await call('POST', `/agents/dispatches/${did}/events`, { kind: 'member/start', member: '产品', payload: { step: 1 } })
check('写入事件', e1.status === 200 && e1.body?.ok === true, JSON.stringify(e1.body))
await call('POST', `/agents/dispatches/${did}/events`, { kind: 'tool/result', member: '产品', payload: { ok: true } })
await call('POST', `/agents/dispatches/${did}/events`, { kind: 'member/failed', member: '前端', payload: { error: 'x' } })

// 2) GET 事件
const got = await call('GET', `/agents/dispatches/${did}/events`)
const events = got.body?.events ?? []
check('事件已记录（3 条）', events.length === 3, String(events.length))
check('事件带 kind', events.every(e => String(e.kind ?? e.type ?? '') !== ''), JSON.stringify(events.map(e => e.kind ?? e.type)))
check('事件带 member', events.some(e => String(e.member ?? '') === '产品') && events.some(e => String(e.member ?? '') === '前端'))

// 3) 派发详情里也带 events
const det = await call('GET', `/agents/dispatches/${did}`)
check('详情端点同时返回 events', Array.isArray(det.body?.events) && det.body.events.length === 3, String(det.body?.events?.length))
check('详情带 startedAt 与 status', det.body?.dispatch?.startedAt !== undefined && det.body?.dispatch?.status === 'running',
  JSON.stringify({ s: det.body?.dispatch?.startedAt, st: det.body?.dispatch?.status }))

// 4) 前端时间线渲染结构（源码断言）
const app = readFileSync(join(root, 'src/client/app.ts'), 'utf8')
check('openDispatchTimeline 已实现', app.includes('function openDispatchTimeline'))
check('按成员聚合事件数', app.includes('byMember') && app.includes('条事件'))
check('耗时计算（finished - started）', app.includes('new Date(finished).getTime() - new Date(started).getTime()'))
check('失败事件高亮', app.includes('fail|error|timeout'))
check('事件绑定 dispatch-timeline', app.includes("act === 'dispatch-timeline'"))
const chat = readFileSync(join(root, 'src/client/agent-chat.ts'), 'utf8')
check('会话面板有「时间线」按钮', chat.includes('data-chat-act="timeline"') && chat.includes('onTimeline'))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
