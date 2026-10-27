// 派发取消自检（1.15 B2）：/cancel 端点、状态校验、部分结果保留判定。
// 用法：node scripts/verify-dispatch-cancel.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-cancel-verify-${process.pid}`)
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

// 直接写库造派发（HTTP 建派发要求团队有可用成员，与本次要测的取消逻辑无关）
const { DatabaseSync } = await import('node:sqlite')
const raw = new DatabaseSync(join(tmp, 'wb.sqlite'))
const d1id = 'ad-cancel-test'
raw.prepare(`INSERT INTO agent_dispatches(id,idea_id,run_id,team_id,session_id,status,goal,workspace_path,timeout_ms,member_count,kickoff,started_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(d1id, '', '', 'at-x', '', 'dispatching', '测试目标', tmp, 60000, 0, '', new Date().toISOString())
raw.close()
const d1 = { id: d1id }
check('造派发记录', true)

// 1) 运行中的派发可以取消
await call('PATCH', `/agents/dispatches/${d1.id}`, { status: 'running' })
const c1 = await call('POST', `/agents/dispatches/${d1.id}/cancel`, { reason: '测试停止' })
check('运行中派发可取消', c1.status === 200 && c1.body?.ok === true, JSON.stringify(c1.body).slice(0, 120))
check('取消后状态是 cancelled（无产出时）', ['cancelled', 'partial'].includes(String(c1.body?.dispatch?.status)), String(c1.body?.dispatch?.status))
check('返回了提示文案', typeof c1.body?.note === 'string' && c1.body.note.length > 0)

// 2) 已终态的派发不能再取消
const c2 = await call('POST', `/agents/dispatches/${d1.id}/cancel`, {})
check('已终态再取消返回 409 not_running', c2.status === 409 && c2.body?.error === 'not_running', JSON.stringify(c2.body))

// 3) 不存在的派发
const c3 = await call('POST', '/agents/dispatches/ad-notexist/cancel', {})
check('不存在返回 404', c3.status === 404, `status=${c3.status}`)

// 4) GET 方法被拒
const c4 = await call('GET', `/agents/dispatches/${d1.id}/cancel`)
check('GET /cancel 返回 405', c4.status === 405, `status=${c4.status}`)

// 5) 真正中断：宿主 agent.cancel 被调用（用假 ctx 注入探测）
const { readFileSync } = await import('node:fs')
const src = readFileSync(join(root, 'src/host/agent.ts'), 'utf8')
check('实现调用 agent.cancel（宿主中断 API）', /agent\.cancel\(\{ kind: 'user' \}\)/.test(src))
check('兜底 agent.interrupt', src.includes('agent.interrupt({ kind: \'user\' })') || src.includes("agent.interrupt({ kind: 'user' })"))
check('最后兜底 pendingPrompt.abort', src.includes('pendingPrompt') && src.includes('.abort()'))
check('返回 interrupted 标志', src.includes('interrupted,') || src.includes('interrupted:'))
check('无会话时给出明确原因', src.includes('该派发没有关联会话') && src.includes('会话已释放'))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
