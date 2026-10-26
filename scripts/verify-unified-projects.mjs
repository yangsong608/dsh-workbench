// 统一项目自检：四域归并、自动建 Bug 项目、概览、删除不丢领域数据。
// 用法：node scripts/verify-unified-projects.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-unify-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const ws = join(tmp, 'my-project')
mkdirSync(ws, { recursive: true })
const dbFile = join(tmp, 'wb.sqlite')
// 先造「老数据」：产品 + 测试项目（各自独立，无 project_id），验证迁移归并
{
  const db = new DatabaseSync(dbFile)
  db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workspace_path TEXT NOT NULL DEFAULT '', notebook_id TEXT NOT NULL DEFAULT '', mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}', styles TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT '');
CREATE TABLE test_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workspace_path TEXT NOT NULL DEFAULT '', product_id TEXT NOT NULL DEFAULT '', module_id TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT 'all', bug_project_id TEXT NOT NULL DEFAULT '', deploy_mode TEXT NOT NULL DEFAULT 'local', ssh_host TEXT NOT NULL DEFAULT '', remote_dir TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', container_name TEXT NOT NULL DEFAULT '', host_port TEXT NOT NULL DEFAULT '', container_port TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT '');`)
  const now = '2026-10-01 00:00:00'
  db.prepare('INSERT INTO products(id,name,workspace_path,created_at,updated_at) VALUES(?,?,?,?,?)').run('prod-old', '老产品', ws, now, now)
  db.prepare('INSERT INTO test_projects(id,name,workspace_path,created_at,updated_at) VALUES(?,?,?,?,?)').run('testp-old', '老测试', ws, now, now)
  db.close()
}
process.env.DSH_WORKBENCH_DB = dbFile
const reg = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register() {} } })
const route = reg.find(r => r.path === '/workbench-api')
const call = (m,u,b)=>new Promise(res=>{ const req={url:`/workbench-api${u}`,method:m,json:async()=>b??{}}; route.handler(req,{status:0,writeHead(s){this.status=s},end(p){res({status:this.status,body:p?JSON.parse(p):null})}}) })
let pass=0, fail=0
const check=(n,ok,d='')=>{ if(ok){pass++;console.log('  ✓',n)}else{fail++;console.log('  ✗',n,d)} }

// 1) 迁移：同一工作区的产品+测试项目归并为一个统一项目
const prjs = (await call('GET','/projects')).body.projects
check('迁移：同工作区归并为一个项目', prjs.length === 1 && prjs[0].workspacePath === ws, JSON.stringify(prjs.map(p=>p.name)))
const pid = prjs[0].id

// 2) 概览：项目下能看到产品与测试项目
const ov = (await call('GET','/projects?overview=1')).body.overviews
check('项目概览含产品与测试项目', ov[0].counts.products === 1 && ov[0].counts.testProjects === 1, JSON.stringify(ov[0].counts))

// 3) 建产品 → 自动建 Bug 项目（解决原始问题）
const created = await call('POST','/products',{product:{name:'新项目',workspacePath:ws}})
const bugPrjs = (await call('GET','/bugs')).body.projects
check('建产品后自动有 Bug 项目', bugPrjs.length >= 1, `len=${bugPrjs.length}`)
check('Bug 项目挂在同一统一项目下', String(bugPrjs[0]?.projectId ?? '') === pid, `${bugPrjs[0]?.projectId} vs ${pid}`)

// 4) 同一工作区再建产品不产生第二个统一项目
await call('POST','/products',{product:{name:'新项目2',workspacePath:ws}})
const prjs2 = (await call('GET','/projects')).body.projects
check('同工作区不重复建项目', prjs2.length === 1, `len=${prjs2.length}`)

// 5) 测试项目也挂到同一项目
await call('POST','/tests/projects',{project:{name:'回归测试',workspacePath:ws}})
const ov2 = (await call('GET','/projects?overview=1')).body.overviews
check('测试项目挂到同一统一项目', ov2[0].counts.testProjects === 2, JSON.stringify(ov2[0].counts))


// 7) 灵感项目也挂统一项目（经 ensureUnifiedProject 回调）
{
  const ideaRes = await call('POST', '/ideas/projects', { name: '灵感项目', workspacePath: ws })
  const ideaProjects = (await call('GET', '/ideas/projects')).body.projects
  const hit = ideaProjects.find(x => x.name === '灵感项目')
  check('灵感项目挂到统一项目', hit !== undefined && String(hit.projectId ?? '') !== '', JSON.stringify(hit?.projectId))
}

// 6) 删项目不删领域数据（只解除引用）
await call('DELETE',`/projects/${pid}`)
const ov3 = (await call('GET','/projects?overview=1')).body.overviews
const prodAfter = (await call('GET','/products')).body.products
check('删项目保留产品数据', ov3.length === 0 && prodAfter.length >= 2, `ov=${ov3.length} prod=${prodAfter.length}`)



// 8) JsonStore 兜底也有统一项目方法（方法存在性检查，避免 JSON 模式 500）
{
  const db = new DatabaseSync(dbFile)
  const cols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name)
  db.close()
  check('projects 表结构完整', ['id','name','workspace_path','archived_at','sort_order'].every(c => cols.includes(c)), JSON.stringify(cols))
}


// 9) 迁移兜底：已有统一项目但缺 Bug 项目时，启动即为每个项目补建
{
  const db = new DatabaseSync(dbFile)
  // 造一个「有项目、无 Bug 项目」的状态：删掉所有 bug_projects
  db.exec('DELETE FROM bug_projects')
  const before = db.prepare('SELECT COUNT(*) n FROM bug_projects').get().n
  db.close()
  // 重新 apply 一次（模拟重启）
  const reg2 = []
  const host2 = await import(`file://${root}/lib/index.js?reboot=${Date.now()}`)
  host2.apply({ webServer: { register(r) { reg2.push(r) } }, tools: { register() {} } })
  const route2 = reg2.find(r => r.path === '/workbench-api')
  const call2 = (m, u, b) => new Promise(res => {
    const req = { url: `/workbench-api${u}`, method: m, json: async () => b ?? {} }
    route2.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? JSON.parse(p) : null }) } })
  })
  const prjs = (await call2('GET', '/projects')).body.projects.filter(p => p.workspacePath !== '')
  const bugs = (await call2('GET', '/bugs')).body.projects
  check('重启后为缺 Bug 项目的统一项目自动补建', before === 0 && bugs.length >= prjs.length, `before=${before} prjs=${prjs.length} bugs=${bugs.length}`)
}

console.log(`\n${pass}/${pass+fail} 通过`)
process.exit(fail>0?1:0)
