// UI 设计/DEMO/主题 三个 Agent 工具自检：锚点校验、产物落盘、版本与文件索引。
// 用法：node scripts/verify-ui-demo-tools.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-uitools-verify-${process.pid}`)
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
const tool = name => tools.find(t => t.name === name)

check('三个工具都已注册', ['workbench_ui_doc_publish', 'workbench_demo_publish', 'workbench_theme_publish'].every(n => tool(n) !== undefined))

const project = (await call('POST', '/projects', { project: { name: '工具测试', workspacePath: tmp } })).body.project

// 1) 主题工具
const themeRes = await tool('workbench_theme_publish').execute({
  id: 'tool-theme', name: '工具主题', spec: '## 1. 色彩体系\n主色 #ff6b35',
  tokens: { bg: '#111', surface: '#1a1a1a', text: '#eee', accent: '#ff6b35', radius: 8 }, source: 'text',
})
check('主题工具保存成功', themeRes.ok === true, JSON.stringify(themeRes))

// 2) UI 设计工具
const pages = [
  { id: 'page-login', name: '登录', route: '/login', blocks: [{ id: 'blk-1', role: 'header', desc: '品牌' }] },
  { id: 'page-home', name: '首页', route: '/home', blocks: [{ id: 'blk-2', role: 'list', desc: '列表' }] },
]
const uiRes = await tool('workbench_ui_doc_publish').execute({
  projectId: project.id, name: '工具 UI 设计', themeId: 'tool-theme', platform: 'all',
  spec: '# 规范\n\n## 1. 色彩体系\n', pages,
})
check('UI 设计工具写入成功', uiRes.ok === true && uiRes.pageCount === 2, JSON.stringify(uiRes))
check('规范写成 ui_design 笔记', String(uiRes.noteId ?? '') !== '')

// 3) 建 DEMO（单文件）
const demo = (await call('POST', '/demos', { demo: { projectId: project.id, uiDesignId: uiRes.uiDesignId, title: '工具 Demo', themeId: 'tool-theme', layoutMode: 'single' } })).body.demo
check('创建 DEMO', demo !== undefined)

// 4) 交付：缺锚点应被拒绝
const badHtml = '<!doctype html><div>没有 data-page</div>'
const badRes = await tool('workbench_demo_publish').execute({ demoId: demo.id, html: badHtml })
check('缺 data-page 锚点被拒', badRes.ok === false && String(badRes.error).includes('data-page'), JSON.stringify(badRes))

// 5) 交付：锚点齐全应成功并落盘
const goodHtml = `<!doctype html><html><body>
<div data-page="page-login">登录页</div>
<div data-page="page-home">首页</div>
</body></html>`
const okRes = await tool('workbench_demo_publish').execute({ demoId: demo.id, html: goodHtml, label: 'AI 生成' })
check('锚点齐全交付成功', okRes.ok === true && okRes.pageCount === 2, JSON.stringify(okRes))
check('产物写入磁盘', existsSync(okRes.entryPath) && readFileSync(okRes.entryPath, 'utf8').includes('data-page="page-login"'))

// 6) 多文件模式：缺 index.html 应被拒
const multi = (await call('POST', '/demos', { demo: { projectId: project.id, uiDesignId: uiRes.uiDesignId, title: '多文件 Demo', themeId: 'tool-theme', layoutMode: 'multi' } })).body.demo
const noIndex = await tool('workbench_demo_publish').execute({ demoId: multi.id, files: [{ path: 'pages/page-login.html', html: '<div data-page="page-login">x</div>' }] })
check('多文件缺 index.html 被拒', noIndex.ok === false)

// 7) 多文件模式：正常交付
const multiRes = await tool('workbench_demo_publish').execute({
  demoId: multi.id,
  files: [
    { path: 'index.html', html: '<!doctype html><a href="pages/page-login.html">登录</a>' },
    { path: 'pages/page-login.html', html: '<div data-page="page-login">登录</div>' },
    { path: 'pages/page-home.html', html: '<div data-page="page-home">首页</div>' },
  ],
})
check('多文件交付成功（2 页）', multiRes.ok === true && multiRes.pageCount === 2, JSON.stringify(multiRes))

// 8) 路径穿越防护
const evil = await tool('workbench_demo_publish').execute({ demoId: multi.id, files: [{ path: '../../evil.html', html: 'x' }] })
check('路径穿越被拒', evil.ok === false)

// 9) 文件索引已写入
const detail = (await call('GET', `/demos/${multi.id}`)).body.demo
check('文件索引写入 demo_files', Array.isArray(detail.versions) && detail.versions.length === 1)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
