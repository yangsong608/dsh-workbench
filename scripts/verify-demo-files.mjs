// 文件树自检：只读浏览、版本目录、路径穿越防护、数量/深度限制。
// 用法：node scripts/verify-demo-files.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-demofiles-verify-${process.pid}`)
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

const project = (await call('POST', '/projects', { project: { name: '文件树测试', workspacePath: tmp } })).body.project
const demo = (await call('POST', '/demos', { demo: { projectId: project.id, title: '文件树 Demo', themeId: 'clean', layoutMode: 'multi' } })).body.demo

// 造产物：v1（旧）、v2（新，含 pages/assets）
const v1 = join(tmp, '.dsh-workbench', 'demos', demo.id, 'v1')
mkdirSync(v1, { recursive: true })
writeFileSync(join(v1, 'index.html'), '<!doctype html><p>v1</p>')
const v2 = join(tmp, '.dsh-workbench', 'demos', demo.id, 'v2')
mkdirSync(join(v2, 'pages'), { recursive: true })
mkdirSync(join(v2, 'assets'), { recursive: true })
writeFileSync(join(v2, 'index.html'), '<!doctype html><p>v2 入口</p>')
writeFileSync(join(v2, 'pages', 'page-login.html'), '<div data-page="page-login">登录</div>')
writeFileSync(join(v2, 'pages', 'page-home.html'), '<div data-page="page-home">首页</div>')
writeFileSync(join(v2, 'assets', 'logo.svg'), '<svg/>')

// 1) 默认返回最新版本
const tree = await call('GET', `/files/tree?projectId=${project.id}&demoId=${demo.id}`)
check('返回最新版本（v2）', tree.body.ok === true && tree.body.root.endsWith('v2'), tree.body.root)
const paths = tree.body.files.map(f => f.path)
check('列出 index 与页面文件', paths.includes('index.html') && paths.includes('pages/page-login.html'), JSON.stringify(paths))
check('assets 也被列出', paths.includes('assets/logo.svg'))
const roles = Object.fromEntries(tree.body.files.map(f => [f.path, f.role]))
check('角色识别：entry/page/asset', roles['index.html'] === 'entry' && roles['pages/page-login.html'] === 'page' && roles['assets/logo.svg'] === 'asset', JSON.stringify(roles))

// 2) 指定版本
const treeV1 = await call('GET', `/files/tree?projectId=${project.id}&demoId=${demo.id}&version=v1`)
check('可指定旧版本', treeV1.body.root.endsWith('v1') && treeV1.body.files.length === 1)

// 3) 路径穿越防护：demoId 带 ../
const evil1 = await call('GET', `/files/tree?projectId=${project.id}&demoId=${encodeURIComponent('../../etc')}`)
check('demoId 穿越被拒', evil1.status === 400 || evil1.body.files.length === 0, JSON.stringify(evil1.body).slice(0, 100))

// 4) 版本穿越
const evil2 = await call('GET', `/files/tree?projectId=${project.id}&demoId=${demo.id}&version=${encodeURIComponent('../../')}`)
check('version 穿越被拒或忽略', evil2.status === 400 || evil2.body.ok === true, `${evil2.status}`)

// 5) 不存在的工作区
const noWs = (await call('POST', '/projects', { project: { name: '无工作区', workspacePath: '' } })).body.project
const evil3 = await call('GET', `/files/tree?projectId=${noWs.id}&demoId=${demo.id}`)
check('无工作区报错', evil3.status === 400)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
