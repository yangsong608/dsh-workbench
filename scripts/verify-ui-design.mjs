// UI 设计自检：页面 schema、幂等键、按页更新隔离、归档。
// 用法：node scripts/verify-ui-design.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-uidesign-verify-${process.pid}`)
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

const project = (await call('POST', '/projects', { project: { name: 'UI 测试项目', workspacePath: tmp } })).body.project
const pages = [
  { id: 'page-login', name: '登录', route: '/login', goal: '进入', blocks: [{ id: 'blk-1', role: 'header', desc: '品牌' }, { id: 'blk-2', role: 'form', desc: '表单' }], states: ['默认', '错误'], interactions: ['提交'] },
  { id: 'page-home', name: '首页', route: '/home', goal: '总览', blocks: [{ id: 'blk-3', role: 'list', desc: '列表' }], states: ['默认'], interactions: [] },
]

// 1) 创建
const created = await call('POST', '/ui-designs', { design: { projectId: project.id, name: '收银台 UI', pages, themeId: 'glass', status: 'ready' } })
check('创建 UI 设计', created.status === 200 && created.body.design.pages.length === 2)
const id = created.body.design.id

// 2) schema 校验
const badNoRoute = await call('POST', '/ui-designs', { design: { projectId: project.id, name: 'bad', pages: [{ id: 'p1', blocks: [{ id: 'b1' }] }] } })
check('缺 route 被拒', badNoRoute.status === 400)
const badNoBlock = await call('POST', '/ui-designs', { design: { projectId: project.id, name: 'bad2', pages: [{ id: 'p2', route: '/x', blocks: [] }] } })
check('无区块被拒', badNoBlock.status === 400)
const badDup = await call('POST', '/ui-designs', { design: { projectId: project.id, name: 'bad3', pages: [{ id: 'dup', route: '/a', blocks: [{ id: 'b' }] }, { id: 'dup', route: '/b', blocks: [{ id: 'b2' }] }] } })
check('页面 id 重复被拒', badDup.status === 400)

// 3) 幂等键：同 project+mapId 再创建应更新而非新增
const again = await call('POST', '/ui-designs', { design: { projectId: project.id, name: '收银台 UI v2', pages, themeId: 'glass' } })
const all = (await call('GET', `/ui-designs?projectId=${project.id}`)).body.designs
check('同 doc_key 幂等（不新增）', all.length === 1 && again.body.design.id === id, `len=${all.length}`)

// 4) 按页更新：只改目标页
const patched = await call('PATCH', `/ui-designs/${id}/pages/page-login`, { patch: { goal: '改过的目标' } })
const pageLogin = patched.body.design.pages.find(p => p.id === 'page-login')
const pageHome = patched.body.design.pages.find(p => p.id === 'page-home')
check('按页更新生效', pageLogin.goal === '改过的目标')
check('其它页未受影响', pageHome.goal === '总览' && pageHome.blocks.length === 1)

// 5) 不存在的页面
const notFound = await call('PATCH', `/ui-designs/${id}/pages/page-nope`, { patch: { goal: 'x' } })
check('更新不存在的页面被拒', notFound.status === 400)

// 6) 主题不存在
const badTheme = await call('POST', '/ui-designs', { design: { projectId: project.id, name: 't', mapId: 'm1', pages, themeId: 'no-such' } })
check('引用不存在的主题被拒', badTheme.status === 400)

// 7) 归档
await call('POST', '/ui-designs/archive', { id, archived: true })
const afterArchive = (await call('GET', `/ui-designs?projectId=${project.id}`)).body.designs
const withArchived = (await call('GET', `/ui-designs?projectId=${project.id}&archived=1`)).body.designs
check('归档后默认隐藏', afterArchive.length === 0 && withArchived.length === 1)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
