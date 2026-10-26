// 页内会话干预自检（1.15 D1）：补发消息到 Lead 会话、停止、时间线三个入口。
// 用法：node scripts/verify-session-intervene.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }
const app = readFileSync(join(root, 'src/client/app.ts'), 'utf8')
const chat = readFileSync(join(root, 'src/client/agent-chat.ts'), 'utf8')
const lib = readFileSync(join(root, 'lib/client.js'), 'utf8')

// 1) 会话组件提供三个干预接口
check('会话有输入框（补发指令）', chat.includes('id="agent-chat-input"') && chat.includes('placeholder="追加指令'))
check('会话有发送按钮', chat.includes('data-chat-act="send"') && chat.includes('deps.onSend(text)'))
check('Enter 发送 / Shift+Enter 换行', /Enter/.test(chat) && /shiftKey/.test(chat))
check('会话有停止按钮', chat.includes('data-chat-act="stop"') && chat.includes('deps.onStop()'))
check('会话有重试按钮', chat.includes('data-chat-act="retry"') && chat.includes('deps.onRetry()'))
check('会话有时间线按钮', chat.includes('data-chat-act="timeline"') && chat.includes('deps.onTimeline'))

// 2) app 侧把 onSend 接到真实会话（不是空实现）
check('onSend 真正发消息到会话', /onSend:\s*text\s*=>\s*\{[^}]*sendToSession\(/.test(app), '未找到 sendToSession 调用')
check('onStop 接取消派发', /onStop:\s*\(\)\s*=>\s*\{\s*void\s+stopProductDispatch/.test(app))
check('onTimeline 接时间线', /onTimeline:\s*\(\)\s*=>\s*\{[^}]*openDispatchTimeline/.test(app))
check('onRetry 接重新生成', /onRetry:\s*\(\)\s*=>\s*\{\s*void\s+generateProductModules/.test(app))

// 3) 停止走新 /cancel 端点（保留部分结果）
check('cancelDispatch 走 /cancel 端点', app.includes("/cancel`") || app.includes('/cancel"'), '未找到 /cancel 调用')
check('停止后提示保留部分结果', app.includes('保留部分结果') || app.includes('data.note'))

// 4) 产出物包含这些能力
for (const [label, token] of [
  ['产物含 agent-chat-input', 'agent-chat-input'],
  ['产物含 追加指令', '追加指令'],
  ['产物含 时间线按钮', 'timeline'],
]) check(label, lib.includes(token), token)

// 5) 会话被 4 个以上视图复用
const chatUses = (app.match(/ensureProductChat\(\)/g) ?? []).length
check(`会话被多个视图复用（${chatUses} 处）`, chatUses >= 4, String(chatUses))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
