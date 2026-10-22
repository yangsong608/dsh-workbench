/**
 * 智能体团队宿主端到端（mock ctx + 临时 SQLite）：node scripts/verify-agent-host.mjs
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'dsh-workbench-agent-host-'))
process.env.DSH_HOME = dir
process.env.DSH_WORKBENCH_DB = join(dir, 'workbench.sqlite')

let pass = 0
let fail = 0
const check = (name, ok) => { if (ok) { pass += 1; console.log(`  ✓ ${name}`) } else { fail += 1; console.log(`  ✗ ${name}`) } }

const mod = await import('../lib/index.js')
let route = null
const tools = {}
const ctx = {
  effect: cb => { try { cb() } catch { /* ignore */ } return () => {} },
  tools: { register: tool => { tools[tool.name] = tool; return () => {} } },
  webServer: { register: r => { route = r; return () => {} }, tapIndex: () => () => {} },
  get: () => undefined,
}
mod.apply(ctx)

function call(method, path, body) {
  return new Promise(resolve => {
    let last = { status: 0 }
    const req = { url: `/workbench-api${path}`, method, json: async () => body ?? {}, on() {} }
    const res = { writeHead(status) { last.status = status }, end(payload) { if (payload !== undefined) { try { last.body = JSON.parse(String(payload)) } catch { last.body = String(payload) } } resolve(last) } }
    route.handler(req, res)
  })
}

const teamRes = await call('GET', '/agents/teams')
const team = teamRes.body.teams[0]
check('默认团队与 7 名成员', teamRes.status === 200 && team.name === '产品研发' && team.memberCount === 7)

const detail = await call('GET', `/agents/teams/${team.id}`)
check('团队详情含成员权限', detail.body.team.members.length === 7 && detail.body.team.members.some(m => m.fileWrite === 'write'))

const created = await call('POST', '/agents/members', { member: { name: '合规', role: 'custom', fileWrite: 'read', intro: '合规' } })
check('新建成员', created.status === 200 && created.body.member.id.startsWith('am-'))
const added = await call('POST', `/agents/teams/${team.id}/members`, { memberId: created.body.member.id })
check('成员加入团队', added.body.team.memberCount === 8)

const dispatch = await call('POST', '/agents/dispatches', { ideaId: 'idea-1', runId: 'run-1', teamId: team.id, goal: '发散', ideaTitle: 'AI 陪练', ideaBrief: '语音', workspacePath: '/tmp/ws' })
check('派发创建 + kickoff', dispatch.status === 200 && String(dispatch.body.kickoff).includes('spawn_teammate'))
check('kickoff 含 7 人权限与写回工具', String(dispatch.body.kickoff).includes('workbench_idea_expand') && String(dispatch.body.kickoff).includes('不超过 3'))
const dispatchId = dispatch.body.dispatch.id
const conflict = await call('POST', '/agents/dispatches', { ideaId: 'idea-1', teamId: team.id, goal: 'again' })
check('同灵感二次派发 409', conflict.status === 409)

const running = await call('PATCH', `/agents/dispatches/${dispatchId}`, { sessionId: 's1', status: 'running' })
check('挂会话并置 running', running.body.dispatch.status === 'running' && running.body.dispatch.sessionId === 's1')
await call('POST', `/agents/dispatches/${dispatchId}/events`, { kind: 'member', member: 'product', payload: { status: 'ok' } })
const events = await call('GET', `/agents/dispatches/${dispatchId}`)
check('事件可回读', events.body.events.length === 1 && events.body.events[0].member === 'product')
const done = await call('PATCH', `/agents/dispatches/${dispatchId}`, { status: 'done' })
check('完成写入 finishedAt', done.body.dispatch.status === 'done' && done.body.dispatch.finishedAt !== '')

const tool = tools['workbench_team_list']
const out = tool === undefined ? null : await tool.execute({})
check('工具登记与读取', out !== null && out.ok === true && out.teams.length === 1 && out.teams[0].memberCount === 8)

const bad = await call('GET', '/agents/teams/..%2Fetc')
check('非法 id 拒绝', bad.status === 400)

/* 记忆与知识 */
const ws = join(dir, 'ws')
mkdirSync(join(ws, 'docs'), { recursive: true })
writeFileSync(join(ws, 'docs', 'spec.md'), '# 交付\n交付证据必须与 PPT 一致，禁止自造百分比。')
const memory = await call('POST', '/agents/memory', { scope: 'project', content: '交付口径必须与 PPT 一致', projectPath: ws, teamId: team.id })
check('记忆写入/读取', memory.status === 200 && String(memory.body.memory.id).startsWith('mem-'))
const memories = await call('GET', `/agents/memory?projectPath=${encodeURIComponent(ws)}`)
check('记忆按项目过滤', memories.body.memories.length >= 1)
const indexed = await call('POST', '/agents/knowledge/index', { projectPath: ws })
check('知识索引', indexed.status === 200 && indexed.body.result.docs >= 1)
const search = await call('GET', `/agents/knowledge/search?projectPath=${encodeURIComponent(ws)}&q=${encodeURIComponent('交付证据')}`)
check('知识检索命中', search.status === 200 && search.body.hits.length >= 1 && search.body.hits[0].path.includes('spec.md'))
const injected = await call('POST', '/agents/dispatches', { ideaId: 'idea-2', runId: 'run-2', teamId: team.id, goal: '交付复盘', ideaTitle: '交付证据', ideaBrief: '', workspacePath: ws })
const kickoff = String(injected.body.kickoff ?? '')
check('派发自动注入记忆与知识', kickoff.includes('交付口径必须与 PPT 一致') && kickoff.includes('spec.md'))
const toolNames = ['workbench_memory_search', 'workbench_memory_write', 'workbench_knowledge_search']
check('记忆/知识工具已注册', toolNames.every(name => tools[name] !== undefined))

rmSync(dir, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '全部通过' : '存在失败'}：${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
