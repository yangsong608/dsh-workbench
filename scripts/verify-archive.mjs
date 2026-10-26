// 归档统一化自检（1.15 A1/A2）：11 类对象的归档 → 列表消失 → 恢复 → 出现 → 彻底删除。
// 另验证：未归档对象不允许硬删（must_archive_first）。
// 用法：node scripts/verify-archive.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-archive-verify-${process.pid}`)
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

// 建基础对象
const P = (await call('POST', '/projects', { project: { name: '归档项目', workspacePath: tmp } })).body.project
const TP = (await call('POST', '/tests/projects', { project: { name: '归档测试项目', workspacePath: tmp } })).body.project
const NOTE = (await call('POST', '/notes', { note: { title: '归档笔记', content: 'x' } })).body.note
const BUGP = (await call('GET', '/bugs')).body.projects[0]
const BUG = (await call('POST', '/bugs', { bug: { projectId: BUGP.id, title: '归档Bug' } })).body.bug
const CASE = (await call('POST', '/tests/cases', { case: { projectId: TP.id, title: '归档用例' } })).body.case
const PLAN = (await call('POST', '/tests/plans', { plan: { projectId: P.id, name: '归档计划' } })).body.plan
const DEMO = (await call('POST', '/demos', { demo: { projectId: P.id, title: '归档DEMO', themeId: 'clean', layoutMode: 'single' } })).body.demo
const UID = (await call('POST', '/ui-designs', { design: { projectId: P.id, name: '归档UI', pages: [] } })).body.design
const THEME = (await call('POST', '/themes', { theme: { id: 't-arch', name: '归档主题', projectId: P.id, tokens: { bg: '#0c1222', surface: '#161e33', text: '#eef4ff', accent: '#7aa2ff', radius: 12 } } })).body.theme
const PROD = (await call('POST', '/products', { product: { name: '归档产品', workspacePath: tmp } })).body.product
const MODULE = (await call('POST', '/modules', { module: { productId: PROD.id, name: '归档模块', kind: 'module' } })).body.module

const items = [
  { table: 'notes', id: NOTE.id, list: '/notes', key: 'notes' },
  { table: 'bugs', id: BUG.id, list: '/bugs', key: 'bugs' },
  { table: 'test_cases', id: CASE.id, list: `/tests?projectId=${TP.id}`, key: 'cases' },
  { table: 'test_projects', id: TP.id, list: '/tests', key: 'projects' },
  { table: 'test_plans', id: PLAN.id, list: `/tests/plans?projectId=${P.id}`, key: 'plans' },
  { table: 'demos', id: DEMO.id, list: '/demos', key: 'demos' },
  { table: 'ui_designs', id: UID.id, list: '/ui-designs', key: 'designs' },
  { table: 'themes', id: THEME.id, list: '/themes', key: 'themes' },
  { table: 'modules', id: MODULE.id, list: `/modules?productId=${PROD.id}`, key: 'modules' },
]

// 逐类验证：归档 → 列表消失 → 恢复 → 出现
for (const it of items) {
  const before = (await call('GET', it.list)).body
  const has0 = (before[it.key] ?? []).some(x => x.id === it.id)
  await call('POST', '/archive', { table: it.table, id: it.id, archived: true })
  const after = (await call('GET', it.list)).body
  const gone = !(after[it.key] ?? []).some(x => x.id === it.id)
  const inArch = ((await call('GET', `/archive?table=${it.table}`)).body.rows ?? []).some(x => x.id === it.id)
  await call('POST', '/archive', { table: it.table, id: it.id, archived: false })
  const restored = (await call('GET', it.list)).body
  const back = (restored[it.key] ?? []).some(x => x.id === it.id)
  check(`${it.table}：归档→消失→在归档列表→恢复→回来`, has0 && gone && inArch && back,
    JSON.stringify({ has0, gone, inArch, back }))
}

// 硬删保护
const r1 = await call('DELETE', '/archive', { table: 'notes', id: NOTE.id })
check('未归档对象禁止硬删（409 must_archive_first）', r1.status === 409 && r1.body?.error === 'must_archive_first', JSON.stringify(r1))
// 归档后可硬删
await call('POST', '/archive', { table: 'notes', id: NOTE.id, archived: true })
const r2 = await call('DELETE', '/archive', { table: 'notes', id: NOTE.id })
check('已归档对象可硬删', r2.status === 200 && r2.body?.ok === true, JSON.stringify(r2))
check('硬删后确实没了', !((await call('GET', '/notes')).body.notes ?? []).some(n => n.id === NOTE.id))

// 白名单防护
const bad = await call('POST', '/archive', { table: 'sqlite_master', id: 'x', archived: true })
check('非白名单表被拒绝', bad.status >= 400, `status=${bad.status}`)

// 归档中心（一次拿全部）
await call('POST', '/archive', { table: 'bugs', id: BUG.id, archived: true })
const center = (await call('GET', '/archive')).body.groups ?? {}
check('归档中心按表分组返回', Object.keys(center).length >= 1 && (center.bugs ?? []).some(b => b.id === BUG.id), JSON.stringify(Object.keys(center)))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
