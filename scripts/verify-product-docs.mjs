// 设计文档能力自检：doc_key 幂等 / kind 归类 / 归档（lib/index.js + 临时 SQLite）。
// 用法：node scripts/verify-product-docs.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-pdoc-verify-${process.pid}`)
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

const p = (await call('POST', '/products', { product: { name: '文档测试', workspacePath: tmp } })).body.product
const mapId = (await call('GET', `/products/maps?productId=${p.id}`)).body.maps[0].id
// 建一个模块
const mod = (await call('POST', '/modules', { module: { productId: p.id, mapId, name: '排班', kind: 'module' } })).body.module

// 1) 同一模块的设计文档：两次保存应更新同一篇（doc_key=md:<moduleId>）
const saveNote = async (title, content) => {
  const n = (await call('POST', '/notes', { note: { notebookId: p.notebookId, title, content, kind: 'module_design', moduleId: mod.id, mapId, tags: ['模块设计'] } })).body.note
  return n
}
const d1 = await saveNote('排班 · 业务模块设计', 'v1 内容')
const d2 = await saveNote('排班 · 业务模块设计', 'v2 内容')
check('模块设计文档幂等（重跑更新同一篇）', d1.id === d2.id && d2.content === 'v2 内容', `${d1.id} vs ${d2.id}`)
check('doc_key 自动生成', String(d2.docKey).startsWith('md:'), d2.docKey)

// 2) 设计文档清单按 kind 分组
const docs = (await call('GET', `/products/design-docs?productId=${p.id}`)).body.docs
check('设计文档按 kind 归类', Array.isArray(docs.module_design) && docs.module_design.length === 1)

// 3) 产品级文档（无 moduleId）：同一产品只应有一篇
const pd1 = (await call('POST', '/notes', { note: { notebookId: p.notebookId, title: '产品设计', content: 'A', kind: 'product_design', mapId, productId: p.id } })).body.note
const pd2 = (await call('POST', '/notes', { note: { notebookId: p.notebookId, title: '产品设计', content: 'B', kind: 'product_design', mapId, productId: p.id } })).body.note
check('产品设计文档幂等（单份）', pd1.id === pd2.id && pd2.content === 'B', `${pd1.id} vs ${pd2.id}`)

// 4) 归档
await call('POST', '/archive', { target: 'modules', id: mod.id, archived: true })
const mods = (await call('GET', `/modules?productId=${p.id}`)).body.modules
check('模块归档写入 archivedAt', (mods[0].archivedAt ?? '') !== '', JSON.stringify(mods[0].archivedAt))
await call('POST', '/archive', { target: 'notes', id: d1.id, archived: true })
const notes = (await call('GET', '/notes')).body.notes
check('笔记归档写入 archivedAt', (notes.find(n => n.id === d1.id)?.archivedAt ?? '') !== '')

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
