// 生成上下文自检（B4）：素材/主题/UI 设计一次取齐，缺失时降级不报错。
// 用法：node scripts/verify-gen-context.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-genctx-verify-${process.pid}`)
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

const project = (await call('POST', '/projects', { project: { name: '上下文测试', workspacePath: tmp } })).body.project
const product = (await call('POST', '/products', { product: { name: '上下文产品', workspacePath: tmp } })).body.product

// 素材：链接 + 截图
await call('POST', '/products/inputs', { productId: product.id, kind: 'url', url: 'https://example.com/ref' })
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUCB1jYGD4DwABBAEAcCBlCwAAAABJRU5ErkJggg=='
await call('POST', '/products/inputs', { productId: product.id, kind: 'image', dataUrl: png, label: '参考截图', width: 1, height: 1 })

// 建一份 UI 设计便于校验 designs 字段
await call('POST', '/ui-designs', { design: { projectId: project.id, name: '上下文 UI', pages: [{ id: 'page-a', name: 'A', route: '/a', blocks: [{ id: 'b1', role: 'header', desc: 'x' }] }] } })

// 1) 完整上下文
const ctx = await call('GET', `/ui-demo/context?projectId=${project.id}&productId=${product.id}`)
const body = ctx.body
check('返回项目与产品', body.project?.id === project.id && body.product?.id === product.id)
check('素材含链接与截图', Array.isArray(body.inputs) && body.inputs.length === 2 && body.inputs.some(i => i.kind === 'url') && body.inputs.some(i => i.kind === 'image'))
check('截图带 filePath（AI 可读图）', body.inputs.filter(i => i.kind === 'image').every(i => String(i.filePath).length > 0))
check('主题含 spec 与 tokens', Array.isArray(body.themes) && body.themes.length >= 12 && body.themes.every(t => typeof t.tokens === 'object'))
check('UI 设计含页面清单', Array.isArray(body.designs) && body.designs[0]?.pages?.length === 1)

// 2) 无产品：素材为空但不报错
const ctx2 = await call('GET', `/ui-demo/context?projectId=${project.id}`)
check('无产品时降级（素材空、不报错）', ctx2.status === 200 && Array.isArray(ctx2.body.inputs) && ctx2.body.inputs.length === 0)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
