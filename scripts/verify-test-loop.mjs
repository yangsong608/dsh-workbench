
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `tl-${process.pid}`); mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg=[]; const tools=[]
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer:{register(r){reg.push(r)}}, tools:{register(t){tools.push(t)}} })
const route = reg.find(r=>r.path==='/workbench-api')
const call=(m,u,b)=>new Promise(res=>{const req={url:`/workbench-api${u}`,method:m,json:async()=>b??{}};route.handler(req,{status:0,writeHead(s){this.status=s},end(p){res({status:this.status,body:p?JSON.parse(p):null})}})})
let pass=0,fail=0; const check=(n,ok,d='')=>{if(ok){pass++;console.log('  ✓',n)}else{fail++;console.log('  ✗',n,d)}}

const P=(await call('POST','/projects',{project:{name:'闭环测试',workspacePath:tmp}})).body.project
const TP=(await call('POST','/tests/projects',{project:{name:'闭环测试项目',workspacePath:tmp}})).body.project
const plan=(await call('POST','/tests/plans',{plan:{projectId:P.id,name:'闭环回归'}})).body.plan
// 建两条用例（带追溯）
const c1=(await call('POST','/tests/cases',{case:{projectId:TP.id,title:'用例A·通过',planId:plan.id,uiDesignId:'uid-x',pageId:'page-home',designVersion:'v1'}})).body.case
const c2=(await call('POST','/tests/cases',{case:{projectId:TP.id,title:'用例B·失败',planId:plan.id,uiDesignId:'uid-x',pageId:'page-orders',designVersion:'v1'}})).body.case
// 建一次执行
const run=(await call('POST','/tests/runs',{run:{projectId:TP.id,planId:plan.id,name:'首轮',status:'running',results:[],summary:{}}})).body.run
check('建执行', run && run.id!==undefined)

const resultTool = tools.find(t=>t.name==='workbench_test_result_publish')
check('结果工具已注册', resultTool!==undefined)
// A 通过
const r1 = await resultTool.execute({projectId:TP.id,runId:run.id,caseId:c1.id,status:'pass',note:'符合预期'})
check('用例A pass', r1.ok===true, JSON.stringify(r1).slice(0,80))
// B 失败 + 自动建 Bug
const r2 = await resultTool.execute({projectId:TP.id,runId:run.id,caseId:c2.id,status:'fail',note:'空态按钮缺失',bugTitle:'订单筛选空态缺按钮',bugDescription:'用例B失败'})
check('用例B fail 并建 Bug', r2.ok===true && (r2.bug?.id!==undefined || r2.result?.bugId!==''), JSON.stringify(r2).slice(0,150))
// Bug 应关联到用例
const cases=(await call('GET',`/tests?projectId=${TP.id}`)).body.cases
const bCase=cases.find(c=>c.id===c2.id)
check('失败用例已关联 bugId', (bCase?.bugId??'')!=='', String(bCase?.bugId))
// Bug → resolved → 自动排队回归
const bp=(await call('GET','/bugs')).body.projects[0]
const bugIdToUse = r2?.bug?.id ?? bCase?.bugId
await call('POST','/bugs',{bug:{id:bugIdToUse,projectId:bp.id,title:'订单筛选空态缺按钮',status:'resolved'}})
// 直接查库确认
const pend=(await call('GET',`/tests/pending-regression?projectId=${P.id}`)).body.cases
check('Bug resolved → 用例排队回归', pend.some(x=>x.id===c2.id), JSON.stringify(pend.map(x=>x.id)))
// 回归通过后应回到 active
const r3 = await resultTool.execute({projectId:TP.id,runId:run.id,caseId:c2.id,status:'pass',note:'回归通过'})
check('回归执行成功', r3.ok===true)
const after=(await call('GET',`/tests?projectId=${TP.id}`)).body.cases.find(c=>c.id===c2.id)
check('回归通过后状态回到 active', after?.status==='active', String(after?.status))
console.log(`\n${pass}/${pass+fail} 通过`)
process.exit(fail>0?1:0)
