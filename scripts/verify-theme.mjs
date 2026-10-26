// 主题库自检：12 套内置、平台过滤、令牌校验、内置保护、自定义 CRUD。
// 用法：node scripts/verify-theme.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-theme-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register() {} } })
const route = reg.find(r => r.path === '/workbench-api')
const call = (m,u,b)=>new Promise(res=>{ const req={url:`/workbench-api${u}`,method:m,json:async()=>b??{}}; route.handler(req,{status:0,writeHead(s){this.status=s},end(p){res({status:this.status,body:p?JSON.parse(p):null})}}) })
let pass=0,fail=0; const check=(n,ok,d='')=>{ if(ok){pass++;console.log('  ✓',n)}else{fail++;console.log('  ✗',n,d)} }

// 列表
const list = await call('GET','/themes')
check('GET /themes 返回 12 套', list.body.themes.length===12)
check('返回含 tokens 对象与 spec', typeof list.body.themes[0].tokens==='object' && list.body.themes[0].spec.length>0)

// 平台过滤
const mob = await call('GET','/themes?platform=mobile')
check('按平台过滤（mobile + all）', mob.body.themes.every(t=>t.platform==='mobile'||t.platform==='all') && mob.body.themes.length<12, `${mob.body.themes.length}`)

// 新建自定义主题
const created = await call('POST','/themes',{theme:{id:'my-dark-orange',name:'暗橙',tokens:{bg:'#111',surface:'#1a1a1a',text:'#eee',accent:'#ff6b35',radius:8},spec:'暗色 + 橙色强调',source:'text'}})
check('新建自定义主题', created.status===200 && created.body.theme.id==='my-dark-orange' && created.body.theme.builtin===false)

// 非法令牌
const bad1 = await call('POST','/themes',{theme:{id:'bad1',name:'坏1',tokens:{bg:'#fff',surface:'#fff',accent:'#000',text:'#000',radius:'abc'}}})
check('radius 非数值被拒', bad1.status===400)
const bad2 = await call('POST','/themes',{theme:{id:'bad2',name:'坏2',tokens:{surface:'#fff',text:'#000',accent:'#000',radius:8}}})
check('缺 bg 被拒', bad2.status===400)

// 内置主题：不可删
const delBuiltin = await call('DELETE','/themes/glass')
check('内置主题不可删除', delBuiltin.status===400 && delBuiltin.body.error==='builtin_locked')

// 内置主题：改 tokens 应被忽略（只改 spec/hint）
const updBuiltin = await call('POST','/themes',{theme:{id:'glass',name:'玻璃拟态',tokens:{bg:'#000000',surface:'#000',text:'#fff',accent:'#f00',radius:2},spec:'改过的说明'}})
const glass = (await call('GET','/themes')).body.themes.find(t=>t.id==='glass')
check('内置主题 tokens 不被覆盖', glass.tokens.accent==='#7aa2ff', JSON.stringify(glass.tokens.accent))
check('内置主题 spec 可更新', glass.spec==='改过的说明')

// 自定义主题可删
const del = await call('DELETE','/themes/my-dark-orange')
check('自定义主题可删除', del.status===200 && !(await call('GET','/themes')).body.themes.some(t=>t.id==='my-dark-orange'))

console.log(`\n${pass}/${pass+fail} 通过`)
process.exit(fail>0?1:0)
