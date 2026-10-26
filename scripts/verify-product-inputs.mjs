// 导图素材源与节点写入自检：链接/截图上传落盘、节点工具写入与幂等。
// 用法：node scripts/verify-product-inputs.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-pinputs-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg = []
const tools = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register(t) { tools.push(t) } } })
const route = reg.find(r => r.path === '/workbench-api')
const call = (m, u, b) => new Promise(res => {
  const req = { url: `/workbench-api${u}`, method: m, json: async () => b ?? {} }
  route.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? JSON.parse(p) : null }) } })
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

console.log('· 素材源（链接 / 截图）')
const p = (await call('POST', '/products', { product: { name: '素材测试', workspacePath: tmp } })).body.product
const u1 = await call('POST', '/products/inputs', { productId: p.id, kind: 'url', url: 'https://example.com/product' })
check('新增链接素材', u1.status === 200 && u1.body.input.kind === 'url')
const bad = await call('POST', '/products/inputs', { productId: p.id, kind: 'url', url: 'ftp://x' })
check('非法链接被拒', bad.status === 400)
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUCB1jYGD4DwABBAEAcCBlCwAAAABJRU5ErkJggg=='
const img = await call('POST', '/products/inputs', { productId: p.id, kind: 'image', dataUrl: png, label: '首页截图', width: 1, height: 1 })
check('截图上传落盘', img.status === 200 && String(img.body.input.filePath).includes('.dsh-workbench/products/'))
check('截图文件确实写入磁盘', existsSync(img.body.input.filePath))
const list = await call('GET', `/products/inputs?productId=${p.id}`)
check('素材列表含链接与截图', list.body.inputs.length === 2)
const del = await call('DELETE', `/products/inputs/${img.body.input.id}`)
check('删除素材并清理文件', del.status === 200 && !existsSync(img.body.input.filePath))

// 节点写入工具
console.log('· 导图节点写入（workbench_map_node_publish）')
check('已注册节点写入工具', tools.some(t => t.name === 'workbench_map_node_publish'))
const map = (await call('GET', `/products/maps?productId=${p.id}`)).body.maps[0]
const tool = tools.find(t => t.name === 'workbench_map_node_publish')
const r1 = await tool.execute({ productId: p.id, mapId: map.id, name: '预约排班', kind: 'module' })
check('工具写入模块节点', r1.ok === true, JSON.stringify(r1))
const after1 = (await call('GET', `/products/maps?productId=${p.id}`)).body.maps[0]
check('节点已落库', after1.graph.nodes.length === 2, `len=${after1.graph.nodes.length}`)
const modNode = after1.graph.nodes.find(n => n.label === '预约排班')
const r2 = await tool.execute({ productId: p.id, mapId: map.id, name: '时段选择', kind: 'feature', parentId: modNode.id })
const after2 = (await call('GET', `/products/maps?productId=${p.id}`)).body.maps[0]
const child = after2.graph.nodes.find(n => n.label === '时段选择')
check('子节点挂到父节点下', r2.ok === true && child?.parentId === modNode.id)
await tool.execute({ productId: p.id, mapId: map.id, name: '时段选择', kind: 'feature', parentId: modNode.id })
const after3 = (await call('GET', `/products/maps?productId=${p.id}`)).body.maps[0]
check('同名同父幂等', after3.graph.nodes.length === 3, `len=${after3.graph.nodes.length}`)
const r4 = await tool.execute({ productId: p.id, mapId: 'map-ghost', name: 'X', kind: 'feature' })
check('不存在的导图报错', r4.ok === false)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
