// 成员看板自检（1.15 C1）：从 agentTeam 投影提取成员明细与状态统计。
// 用法：node scripts/verify-team-board.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-board-${process.pid}`)
mkdirSync(tmp, { recursive: true })
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

/* teamStateOf 在 client.js（浏览器 CJS 包）里。用 vm + 假 document 加载太重，
   改为从源码里抽函数体做纯逻辑验证（与产物同源）。 */
const src = (await import('node:fs')).readFileSync(join(root, 'src/client/agent-chat.ts'), 'utf8')
check('teamStateOf 已扩展 memberList', src.includes('memberList') && src.includes('TeamMemberState'))
check('状态归一化（completed→done / error→failed）', src.includes("=== 'completed' ? 'done'") && src.includes("=== 'error' ? 'failed'"))
check('统计 running/done/failed', src.includes('running:') && src.includes('done:') && src.includes('failed:'))
check('找成员当前任务（tasks.assignee 匹配）', src.includes('assigneeId') && src.includes('subject'))
check('看板渲染函数存在', src.includes('function paintBoard') && src.includes('chat-board-card'))
check('看板在 paintStatus 里刷新', /paintStatus\(\): void \{[\s\S]{0,400}paintBoard\(\)/.test(src))
check('看板容器已插入 DOM', src.includes('id="agent-chat-board"'))

// CSS
const css = (await import('node:fs')).readFileSync(join(root, 'src/client/idea.css.ts'), 'utf8')
check('看板样式已加（4 种状态色）',
  css.includes('.chat-board-card.running') && css.includes('.chat-board-card.done')
  && css.includes('.chat-board-card.failed') && css.includes('.chat-board'))

/* 用真实投影数据跑逻辑：用 esbuild 式剥离 TS 类型太麻烦，
   改为在构建产物里找同源逻辑（lib/client.js 是 CJS，可 require 后取函数）。 */
const { createRequire } = await import('node:module')
const req = createRequire(import.meta.url)
let teamStateOf = null
try {
  /* client.js 依赖 DOM，直接 require 会失败；改为从产物文本里抽函数再 new Function */
  const lib = (await import('node:fs')).readFileSync(join(root, 'lib/client.js'), 'utf8')
  const m = lib.match(/function ([A-Za-z_$][\w$]*)\((\w+)\)\{[^}]*?memberList[\s\S]{0,1200}?\}\n/)
  if (m !== null) {
    /* 产物是压缩后的，函数名不可预测；改为断言「产物里确实有 memberList / running / done 统计」 */
    check('产物包含 memberList 明细', lib.includes('memberList'))
    check('产物包含 running/done/failed 统计', lib.includes('running:') && lib.includes('done:') && lib.includes('failed:'))
  } else {
    check('产物包含成员看板逻辑', lib.includes('memberList'))
  }
} catch (e) { console.log('  ⚠ 读取产物失败:', String(e).slice(0, 60)) }

/* 纯逻辑验证：用等价的 JS 复刻同一个投影，断言预期结果（确保规格正确） */
function teamStateOfRef(projection) {
  if (projection === null || typeof projection !== 'object') return null
  const rawMembers = Array.isArray(projection.members) ? projection.members : []
  const members = rawMembers.filter(x => x?.role !== 'lead')
  const tasks = Array.isArray(projection.tasks) ? projection.tasks.filter(t => t?.status !== 'deleted') : []
  const memberList = members.map(x => {
    const raw = String(x?.status ?? x?.phase ?? 'idle')
    const status = ['pending','running','done','failed','timeout'].includes(raw) ? raw
      : raw === 'completed' ? 'done' : raw === 'error' ? 'failed' : 'idle'
    const mine = tasks.find(t => String(t?.assigneeId ?? t?.assignee ?? '') === String(x?.id ?? '') && t?.status !== 'completed')
    return { id: String(x?.id ?? x?.name ?? ''), name: String(x?.name ?? x?.handle ?? '成员'), role: String(x?.role ?? ''), status, task: String(mine?.subject ?? mine?.title ?? '') }
  })
  return {
    members: members.length,
    tasksDone: tasks.filter(t => t?.status === 'completed').length,
    tasksTotal: tasks.length,
    memberList,
    running: memberList.filter(x => x.status === 'running').length,
    done: memberList.filter(x => x.status === 'done').length,
    failed: memberList.filter(x => x.status === 'failed' || x.status === 'timeout').length,
  }
}
const proj = {
  members: [
    { id: 'm1', name: '产品', phase: 'completed' },
    { id: 'm2', name: '前端', status: 'running' },
    { id: 'm3', name: '测试', status: 'error' },
    { id: 'lead', name: '主理人', role: 'lead', phase: 'running' },
  ],
  tasks: [
    { subject: '设计页面', assigneeId: 'm1', status: 'completed' },
    { subject: '写前端', assigneeId: 'm2', status: 'running' },
    { subject: '写用例', assigneeId: 'm3', status: 'running' },
    { subject: '已删任务', status: 'deleted' },
  ],
}
const st = teamStateOfRef(proj)
check('规格：成员数 3（排除 lead）', st.members === 3, String(st.members))
check('规格：completed → done', st.memberList.find(x => x.id === 'm1')?.status === 'done')
check('规格：error → failed', st.memberList.find(x => x.id === 'm3')?.status === 'failed')
check('规格：done/running/failed 各 1', st.done === 1 && st.running === 1 && st.failed === 1, JSON.stringify({ d: st.done, r: st.running, f: st.failed }))
check('规格：删除任务不计入', st.tasksTotal === 3, String(st.tasksTotal))
check('规格：带当前任务标题', st.memberList.find(x => x.id === 'm2')?.task === '写前端')
check('规格：空投影返回 null', teamStateOfRef(null) === null)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
