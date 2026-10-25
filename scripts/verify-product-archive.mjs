// 归档与设计文档键自检：归档过滤 / archived=1 / 分册与模块设计不撞键。
// 用法：node scripts/verify-product-archive.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-parch-verify-${process.pid}`)
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
let pass=0, fail=0
const check=(n,ok,d='')=>{ if(ok){pass++;console.log('  ✓',n)}else{fail++;console.log('  ✗',n,d)} }


const p = (await call('POST','/products',{product:{name:'归档测试',workspacePath:tmp}})).body.product
const mapId = (await call('GET',`/products/maps?productId=${p.id}`)).body.maps[0].id
const mod = (await call('POST','/modules',{module:{productId:p.id,mapId,name:'模块甲',kind:'module'}})).body.module

// 1) 分册 doc_key 不与模块设计撞键
const md = (await call('POST','/notes',{note:{notebookId:p.notebookId,title:'模块甲 · 业务模块设计',content:'A',kind:'module_design',moduleId:mod.id,mapId,productId:p.id}})).body.note
const pd = (await call('POST','/notes',{note:{notebookId:p.notebookId,title:'模块甲 · 产品设计分册',content:'B',kind:'product_design',moduleId:mod.id,mapId,productId:p.id}})).body.note
check('分册产品设计与模块设计不撞键', md.id !== pd.id && md.docKey !== pd.docKey, `${md.docKey} / ${pd.docKey}`)

// 2) 归档后默认列表不含，archived=1 时含
await call('POST','/archive',{target:'modules',id:mod.id,archived:true})
const def = (await call('GET',`/modules?productId=${p.id}`)).body.modules
const all = (await call('GET',`/modules?productId=${p.id}&archived=1`)).body.modules
check('归档模块默认不出现', def.length === 0, `len=${def.length}`)
check('archived=1 时可见', all.length === 1)

await call('POST','/archive',{target:'notes',id:md.id,archived:true})
const nDef = (await call('GET','/notes')).body.notes
const nAll = (await call('GET','/notes?archived=1')).body.notes
check('归档笔记默认不出现', !nDef.some(n=>n.id===md.id))
check('archived=1 时笔记可见', nAll.some(n=>n.id===md.id))

await call('POST','/archive',{target:'products',id:p.id,archived:true})
const pDef = (await call('GET','/products')).body.products
const pAll = (await call('GET','/products?archived=1')).body.products
check('归档产品默认不出现', !pDef.some(x=>x.id===p.id))
check('archived=1 时产品可见', pAll.some(x=>x.id===p.id))

// 3) 取消归档恢复
await call('POST','/archive',{target:'modules',id:mod.id,archived:false})
const back = (await call('GET',`/modules?productId=${p.id}`)).body.modules
check('取消归档后恢复可见', back.length === 1)

console.log(`\n${pass}/${pass+fail} 通过`)
process.exit(fail>0?1:0)
