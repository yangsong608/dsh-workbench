/** 页内会话纯函数自检：聊天事件归一化 + 轻量 Markdown 转义。 */
import { stripTypeScriptTypes } from 'node:module'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'dsh-workbench-chat-'))
const code = stripTypeScriptTypes(readFileSync(join(root, 'src/client/agent-chat.ts'), 'utf8'))
writeFileSync(join(temp, 'agent-chat.mjs'), code)
const { chatItemOf, renderMarkdown, teamStateOf } = await import(join(temp, 'agent-chat.mjs'))

let pass = 0
let fail = 0
const check = (name, ok) => { if (ok) { pass += 1; console.log(`  ✓ ${name}`) } else { fail += 1; console.log(`  ✗ ${name}`) } }
const esc = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))

const user = chatItemOf({ type: 'user/message', time: 1, data: { message: { content: [{ type: 'text', text: '你好' }] } } })
check('用户消息', user?.kind === 'user' && user.text === '你好')
const assistant = chatItemOf({ type: 'assistant/message', time: 2, data: { message: { content: [{ type: 'text', text: '收到' }], source: { name: '产品' } } } })
check('主理人/成员消息带名字', assistant?.kind === 'assistant' && assistant.who === '产品')
const tool = chatItemOf({ type: 'tool/call', time: 3, data: { name: 'workbench_idea_expand', arguments: '{"nodes":[]}' } })
check('工具调用独立成卡', tool?.kind === 'tool-call' && tool.who === 'workbench_idea_expand' && tool.text.includes('nodes'))
const failed = chatItemOf({ type: 'tool/result', time: 4, data: { message: { isError: true }, reason: '写库失败' } })
check('工具失败可识别', failed?.kind === 'tool-result' && failed.failed === true && failed.text === '写库失败')
const aborted = chatItemOf({ type: 'turn/end', time: 5, data: { reason: 'aborted' } })
check('中止系统行', aborted?.kind === 'system')
check('未知事件忽略', chatItemOf({ type: 'step/start', data: {} }) === null)

const team = teamStateOf({ members: [{ role: 'lead' }, { role: 'teammate' }, { role: 'teammate', phase: 'failed' }], tasks: [{ status: 'completed' }, { status: 'pending' }, { status: 'deleted' }] })
check('投影提取成员/任务计数', team !== null && team.members === 3 && team.tasksDone === 1 && team.tasksTotal === 2)
check('无投影返回 null', teamStateOf(null) === null && teamStateOf({}) !== null)

const md = renderMarkdown('# 标题\n- 列表 `code`\n```\nconst a = 1\n```\n<b>x</b>', esc)
check('标题/列表/代码块渲染', md.includes('chat-h') && md.includes('chat-li') && md.includes('<pre>'))
check('HTML 先转义', md.includes('&lt;b&gt;x&lt;/b&gt;') && !md.includes('<b>x</b>'))
check('行内代码', md.includes('<code>code</code>'))

rmSync(temp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '全部通过' : '存在失败'}：${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
