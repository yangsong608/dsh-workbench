// DEMO 发布工具自检：单/多文件交付、锚点校验、路径穿越防护、落盘、版本、预览、按页优化。
// 用法：node scripts/verify-demo-publish.mjs
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `vdp-${process.pid}`); mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg=[]; const tools=[]
const host = await import(`file://${root}/lib/index.js`)
host.apply({ webServer:{register(r){reg.push(r)}}, tools:{register(t){tools.push(t)}} })
const route = reg.find(r=>r.path==='/workbench-api')
const call=(m,u,b)=>new Promise(res=>{const req={url:`/workbench-api${u}`,method:m,json:async()=>b??{}};route.handler(req,{status:0,writeHead(s){this.status=s},end(p){res({status:this.status,body:p?JSON.parse(p):null})}})})
let pass=0,fail=0; const check=(n,ok,d='')=>{if(ok){pass++;console.log('  ✓',n)}else{fail++;console.log('  ✗',n,d)}}

const P=(await call('POST','/projects',{project:{name:'发布测试',workspacePath:tmp}})).body.project
const D=(await call('POST','/ui-designs',{design:{projectId:P.id,name:'X',pages:[
  {id:'page-home',name:'首页',route:'/home',blocks:[{id:'b1',role:'header',desc:'x'}]},
  {id:'page-order',name:'订单',route:'/order',blocks:[{id:'b2',role:'list',desc:'y'}]},
]}})).body.design
const tpl=(await call('POST','/demos',{demo:{projectId:P.id,uiDesignId:D.id,title:'单',themeId:'clean',layoutMode:'single'}})).body.demo
const tpm=(await call('POST','/demos',{demo:{projectId:P.id,uiDesignId:D.id,title:'多',themeId:'clean',layoutMode:'multi'}})).body.demo
const tool=tools.find(t=>t.name==='workbench_demo_publish')
check('工具已注册', tool!==undefined)

// 1) 单文件：缺锚点拒绝
const bad=await tool.execute({demoId:tpl.id,html:'<html><body>no anchors</body></html>'})
check('单文件缺锚点被拒', bad.ok===false, String(bad.error).slice(0,60))
// 2) 单文件：锚点齐全
const good=await tool.execute({demoId:tpl.id,html:'<html><body><div data-page="page-home">H</div><div data-page="page-order">O</div></body></html>'})
check('单文件交付成功', good.ok===true && good.pageCount===2, JSON.stringify(good).slice(0,80))
check('产物落盘', existsSync(good.entryPath))
check('版本 v1', good.seq===1)
// 3) 多文件：缺 index 拒绝
const bad2=await tool.execute({demoId:tpm.id,files:[{path:'pages/page-home.html',html:'<div data-page="page-home">x</div>'}]})
check('多文件缺 index 被拒', bad2.ok===false)
// 4) 多文件：正常
const good2=await tool.execute({demoId:tpm.id,files:[
  {path:'index.html',html:'<html><a href="pages/page-home.html">H</a></html>'},
  {path:'pages/page-home.html',html:'<div data-page="page-home">H</div>'},
  {path:'pages/page-order.html',html:'<div data-page="page-order">O</div>'},
]})
check('多文件交付成功', good2.ok===true && good2.pageCount===2, JSON.stringify(good2).slice(0,80))
// 5) 路径穿越
const evil=await tool.execute({demoId:tpm.id,files:[{path:'../../x.html',html:'x'}]})
check('路径穿越被拒', evil.ok===false)
// 6) 文件索引
const det=(await call('GET',`/demos/${tpm.id}`)).body.demo
check('版本已记录', (det.versions||[]).length===1)
// 7) view 返回 HTML
const view=await new Promise(res=>{const req={url:`/workbench-api/demos/${tpl.id}/view`,method:'GET',json:async()=>({})};
 route.handler(req,{status:0,writeHead(s){this.status=s},end(p){res(p)}})})
check('view 返回 HTML', String(view).includes('data-page="page-home"'))
// 8) 按页优化
const patch=await call('PATCH',`/demos/${tpl.id}/pages/page-home`,{html:'<div data-page="page-home">H2</div>'})
check('按页优化成功', patch.body.ok===true && patch.body.seq===2, JSON.stringify(patch.body).slice(0,80))
const after=readFileSync(good.entryPath,'utf8')
check('其它页未变', after.includes('>O<') && after.includes('H2'))
console.log(`\n${pass}/${pass+fail} 通过`)
process.exit(fail>0?1:0)
