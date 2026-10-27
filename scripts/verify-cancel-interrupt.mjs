// 取消真中断自检（1.15）：验证 ctx.reflect.get 能拿到 agents 并真正调用 agent.cancel。
// 背景：插件 inject 未声明 agents，直接 ctx.agents 会抛 'cannot get property "agents" without inject'，
// 导致中断永远走不到 agent.cancel（实测 note 报该错误）。
// 用法：node scripts/verify-cancel-interrupt.mjs
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { dirname, join as pjoin } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `tr-${process.pid}`); mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg = []
let captured = null
// 造一个带 reflect.get 的假 ctx，模拟 cordis
const fakeAgents = { get: (sid) => ({ cancel: (o) => { captured = { called: 'cancel', args: o } }, id: sid }) }
const ctx = {
  webServer: { register(r) { reg.push(r) } },
  tools: { register() {} },
  reflect: { get: (name, throwOnMissing) => name === 'agents' ? fakeAgents : (throwOnMissing ? (() => { throw new Error('missing') })() : undefined) },
  get: (name) => { if (name === 'agents') throw new Error('cannot get property "agents" without inject'); return undefined },
  effect: (fn) => fn?.(),
}
const host = await import(`file://${pjoin(root, 'lib/index.js')}`)
host.apply(ctx)
const route = reg.find(r => r.path === '/workbench-api')
const call = (m, u, b) => new Promise(res => {
  const req = { url: `/workbench-api${u}`, method: m, json: async () => b ?? {} }
  route.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? JSON.parse(p) : null }) } })
})
const { DatabaseSync } = await import('node:sqlite')
const raw = new DatabaseSync(process.env.DSH_WORKBENCH_DB)
raw.prepare(`INSERT INTO agent_dispatches(id,idea_id,run_id,team_id,session_id,status,goal,workspace_path,timeout_ms,member_count,kickoff,started_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run('ad-reflect-test','','','at-x','session-abc123','running','T',tmp,60000,0,'',new Date().toISOString())
raw.close()
const r = await call('POST', '/agents/dispatches/ad-reflect-test/cancel', { reason: '验证真中断' })
let pass=0, fail=0
const check=(n,ok,d='')=>{if(ok){pass++;console.log('  ✓',n)}else{fail++;console.log('  ✗',n,d)}}
check('interrupted = true', r.body?.interrupted === true, String(r.body?.interrupted))
check('note 说明已中断 AI', String(r.body?.note ?? '').includes('已中断'), String(r.body?.note))
check('agent.cancel({kind:user}) 被调用', captured !== null && captured.args?.kind === 'user', JSON.stringify(captured))


console.log(`\n${pass}/${pass+fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
