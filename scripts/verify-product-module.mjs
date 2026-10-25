// 产品模块 CRUD + 生成进度自检（lib/index.js + 临时 SQLite，mock webServer 走真实 REST 分发）。
// 用法：node scripts/verify-product-module.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-pmod-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const registered = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { registered.push(r) } }, tools: { register() {} } })
const route = registered.find(r => r.path === '/workbench-api')
const call = (method, url, body) => new Promise(res => {
  const req = { url: `/workbench-api${url}`, method, json: async () => body ?? {} }
  route.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? JSON.parse(p) : null }) } })
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

const p = (await call('POST', '/products', { product: { name: '模块测试', workspacePath: tmp } })).body.product
const maps = (await call('GET', `/products/maps?productId=${p.id}`)).body.maps
const mapId = maps[0].id

// 1. 手工新建模块（带 nodeId）
const created = await call('POST', '/modules', { module: { productId: p.id, mapId, name: '预约排班', kind: 'module', platform: 'pc', nodeId: 'pn-x1', description: '手工建的' } })
check('POST /modules 手工新建', created.status === 200 && created.body.module.name === '预约排班' && created.body.module.nodeId === 'pn-x1')
const mid = created.body.module.id

// 2. 编辑（PATCH 局部更新，不冲掉 nodeId）
const edited = await call('PATCH', `/modules/${mid}`, { module: { name: '预约与排班', platform: 'mobile', description: '改过了' } })
check('PATCH /modules 局部编辑', edited.status === 200 && edited.body.module.name === '预约与排班' && edited.body.module.platform === 'mobile' && edited.body.module.nodeId === 'pn-x1', JSON.stringify(edited.body.module))

// 3. 幂等：同名同 kind 再 POST 不新增
const again = await call('POST', '/modules', { module: { productId: p.id, mapId, name: '预约与排班', kind: 'module' } })
const all = await call('GET', `/modules?productId=${p.id}`)
check('同名同 kind 幂等 upsert', again.body.module.id === mid && all.body.modules.length === 1, `len=${all.body.modules.length}`)

// 4. 进度：写 running → 读回 → 写 done 累积日志
await call('POST', '/products/progress', { progress: { productId: p.id, kind: 'modules', step: 1, total: 4, status: 'running', message: '拆模块' } })
await call('POST', '/products/progress', { progress: { productId: p.id, kind: 'modules', step: 2, total: 4, status: 'running', message: '写笔记' } })
const prog = await call('GET', `/products/progress?productId=${p.id}&kind=modules`)
check('进度 upsert + 日志累积', prog.body.progress.step === 2 && prog.body.progress.log.length === 2, JSON.stringify(prog.body.progress?.log))
await call('POST', '/products/progress', { progress: { productId: p.id, kind: 'modules', step: 4, total: 4, status: 'done', message: '完成' } })
const done = await call('GET', `/products/progress?productId=${p.id}&kind=modules`)
check('进度转 done', done.body.progress.status === 'done' && done.body.progress.log.length === 3)

// 5. 删除模块
const del = await call('DELETE', `/modules/${mid}`)
const after = await call('GET', `/modules?productId=${p.id}`)
check('DELETE /modules', del.status === 200 && after.body.modules.length === 0)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
