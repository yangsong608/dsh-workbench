/**
 * 智能体团队纯函数 + 存储自检：node scripts/verify-agent.mjs
 * 不依赖 DSH 运行时；用临时 SQLite 验证建表、种子、校验与 kickoff。
 */
import { stripTypeScriptTypes } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'dsh-workbench-agent-'))
let pass = 0
let fail = 0
function check(name, ok) { if (ok) { pass += 1; console.log(`  ✓ ${name}`) } else { fail += 1; console.log(`  ✗ ${name}`) } }

function stage(source, target) {
  const code = stripTypeScriptTypes(readFileSync(join(root, source), 'utf8'))
    .replace(/from '\.\/agent-model\.js'/g, "from './agent-model.mjs'")
  writeFileSync(join(temp, target), code)
}
stage('src/host/agent-model.ts', 'agent-model.mjs')
stage('src/host/agent-store.ts', 'agent-store.mjs')

const model = await import(join(temp, 'agent-model.mjs'))
const { AgentStore } = await import(join(temp, 'agent-store.mjs'))

console.log('[1] 默认团队种子')
{
  const db = new DatabaseSync(join(temp, 'agent.sqlite'))
  const store = new AgentStore(db)
  const teams = store.listTeams()
  check('首次启动有一支默认团队', teams.length === 1 && teams[0].name === '产品研发' && teams[0].isDefault === true)
  const team = store.getTeam(teams[0].id)
  check('默认团队 7 名成员', team.members.length === 7)
  check('主理人是 lead 且只读', team.members[0].role === 'lead' && team.members[0].fileWrite === 'read')
  check('前端/后端可写，测试只读', team.members.filter(m => m.fileWrite === 'write').length === 2 && team.members.find(m => m.role === 'qa').fileWrite === 'read')
  check('handle 唯一且合法', new Set(team.members.map(m => m.handle)).size === 7 && team.members.every(m => /^[a-z][a-z0-9-]{1,23}$/.test(m.handle)))
  db.close()
}

console.log('[2] 成员校验')
{
  const seeds = model.defaultMembers().map((m, i) => ({ ...m, id: `m${i}` }))
  const ok = model.validateMember({ name: '合规', role: 'custom', fileWrite: 'read' }, seeds)
  check('中文名生成 handle', ok.member !== null && /^m-[a-z0-9]+$/.test(ok.member.handle))
  const dup = model.validateMember({ name: '产品' }, seeds)
  check('团内重名被拒', dup.member === null && dup.issues.some(i => i.code === 'MEMBER_DUPLICATE'))
  const empty = model.validateMember({ name: '' }, seeds)
  check('空名称被拒', empty.member === null && empty.issues.some(i => i.code === 'NAME_REQUIRED'))
  const long = model.validateMember({ name: '测试员', systemPrompt: 'x'.repeat(9000) }, seeds)
  check('提示词裁剪到 4000', long.member.systemPrompt.length === 4000)
  const roleDefault = model.validateMember({ name: '前端二', role: 'frontend' }, seeds)
  check('role=frontend 默认 write', roleDefault.member.fileWrite === 'write')
}

console.log('[3] kickoff 契约')
{
  const seeds = model.defaultMembers().map((m, i) => ({ ...m, id: `m${i}` }))
  const text = model.buildTeamKickoff({
    team: { name: '产品研发', desc: '' }, members: seeds,
    goal: '发散', idea: { title: 'AI 陪练', brief: '语音' },
    ideaId: 'idea-1', runId: 'run-1', workspacePath: '/tmp/ws', timeoutMinutes: 15,
    memory: '- 记住：不要编造数据', knowledge: '[1] path/a.md',
  })
  check('包含 ideaId/runId', text.includes('idea-1') && text.includes('run-1'))
  check('包含 7 名成员与权限', seeds.every(m => text.includes(`handle="${m.handle}"`)) && text.includes('fileWrite=write'))
  check('包含写回工具与 final', text.includes('workbench_idea_expand') && text.includes('workbench_idea_progress'))
  check('包含并发与超时约束', text.includes('不超过 3') && text.includes('15 分钟'))
  check('注入记忆与知识', text.includes('不要编造数据') && text.includes('path/a.md'))
  check('提示不能改无关文件', text.includes('无关的文件'))
}

console.log('[4] 派发状态收敛')
{
  check('running → done', model.nextDispatchStatus('running', 'done') === 'done')
  check('done 不被覆盖', model.nextDispatchStatus('done', 'failed') === 'done')
  check('cancelled 不被覆盖', model.nextDispatchStatus('cancelled', 'running') === 'cancelled')
  check('dispatching 接收 failed', model.nextDispatchStatus('dispatching', 'failed') === 'failed')
  check('isRunning 判定', model.isRunning('dispatching') && model.isRunning('running') && !model.isRunning('done'))
}

console.log('[5] 存储 CRUD')
{
  const db = new DatabaseSync(join(temp, 'agent2.sqlite'))
  const store = new AgentStore(db)
  const team = store.listTeams()[0]
  const saved = store.saveMember({ name: '合规', role: 'custom', fileWrite: 'read' })
  check('新建成员', saved.member !== null && saved.issues.length === 0)
  store.addMemberToTeam(team.id, saved.member.id)
  check('加入团队', (store.getTeam(team.id)?.members ?? []).length === 8)
  store.setTeamMember(team.id, saved.member.id, { fileWrite: 'write' })
  check('团队级权限覆盖', store.getTeam(team.id).members.find(m => m.id === saved.member.id).fileWrite === 'write')
  const dispatch = store.createDispatch({ ideaId: 'i1', runId: 'r1', teamId: team.id, goal: 'g', memberCount: 8, members: [{ id: saved.member.id, name: '合规', handle: 'hegui', fileWrite: 'write' }] })
  check('派发创建与成员快照', dispatch.status === 'dispatching' && dispatch.members.length === 1)
  check('同灵感运行中可检测', store.runningDispatchForIdea('i1') !== null)
  const done = store.updateDispatch(dispatch.id, { status: 'done', sessionId: 's1' })
  check('完成写 finishedAt', done.status === 'done' && done.finishedAt !== '' && done.sessionId === 's1')
  store.appendEvent(dispatch.id, 'member', 'product', { status: 'ok' })
  check('事件记录', store.listEvents(dispatch.id).length === 1)
  check('FTS5 可用', store.searchable === true)
  db.close()
}

rmSync(temp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '全部通过' : '存在失败'}：${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
