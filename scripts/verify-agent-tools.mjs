// 团队工具注册自检：全部工具必须声明 output { schema, render }。
// 背景：DSH 0.2.1-rc.3+ 要求 tools.register 的每个工具声明 output，
// 缺失会抛 TypeError 并导致该工具（乃至整个 registerTools 循环）注册失败。
// 用法：node scripts/verify-agent-tools.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-agenttools-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')

const tools = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register() {} }, tools: { register(t) { tools.push(t) } } })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

check('工具总数为正', tools.length > 0, `tools=${tools.length}`)

// 1) 每个工具都必须有 output.render
const missing = tools.filter(t => t.output === undefined || typeof t.output.render !== 'function')
check('全部工具声明了 output.render', missing.length === 0, `缺失: ${missing.map(t => t.name).join(', ')}`)

// 2) 每个工具必须有 name / description / parameters / execute
const bad = tools.filter(t => !t.name || !t.description || t.parameters === undefined || typeof t.execute !== 'function')
check('全部工具字段完整（name/description/parameters/execute）', bad.length === 0, bad.map(t => t.name).join(', '))

// 3) 团队 4 个工具必须在册（曾因缺 output 全部注册失败）
const teamTools = ['workbench_memory_search', 'workbench_memory_write', 'workbench_knowledge_search', 'workbench_team_list']
for (const n of teamTools) check(`团队工具 ${n} 已注册`, tools.some(t => t.name === n))

// 4) 1.13 新增的 3 个 UI/DEMO 工具
for (const n of ['workbench_ui_doc_publish', 'workbench_demo_publish', 'workbench_theme_publish']) {
  check(`UI/DEMO 工具 ${n} 已注册`, tools.some(t => t.name === n))
}

// 5) render 可调用且不抛错（用最小返回值探针）
let renderOk = true
for (const t of tools) {
  try {
    const out = t.output.render({}, { ok: false, error: 'probe' })
    if (!Array.isArray(out) || out.length === 0) { renderOk = false; console.log('    render 返回异常:', t.name) }
  } catch (cause) { renderOk = false; console.log('    render 抛错:', t.name, String(cause).slice(0, 80)) }
}
check('全部 render 可调用且返回非空数组', renderOk)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
