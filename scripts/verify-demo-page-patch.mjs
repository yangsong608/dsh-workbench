// 按页优化自检（D4）：只改目标页、其它页不变、非法返回拒绝、失败不落库。
// 用法：node scripts/verify-demo-page-patch.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-pagepatch-verify-${process.pid}`)
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

const project = (await call('POST', '/projects', { project: { name: '按页优化测试', workspacePath: tmp } })).body.project
const demo = (await call('POST', '/demos', { demo: { projectId: project.id, title: '按页优化 Demo', themeId: 'clean', layoutMode: 'single' } })).body.demo

// 造产物：两页
const dir = join(tmp, '.dsh-workbench', 'demos', demo.id, 'v1')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'index.html')
const pageA = '<div data-page="page-a"><h2>A</h2><p>原 A</p></div>'
const pageB = '<div data-page="page-b"><h2>B</h2><p>原 B</p></div>'
writeFileSync(entry, `<!doctype html><html><body>${pageA}${pageB}</body></html>`)
await call('POST', '/demos/versions', { demoId: demo.id, entryPath: entry, label: 'AI 生成', source: 'ai', pageCount: 2 })

// 1) 提取目标页
const got = await call('GET', `/demos/${demo.id}/pages/page-a`)
check('提取目标页片段', got.body.ok === true && String(got.body.html).includes('原 A') && !String(got.body.html).includes('原 B'))

// 2) 正常替换
const newA = '<div data-page="page-a"><h2>A</h2><p>改过的 A</p></div>'
const patched = await call('PATCH', `/demos/${demo.id}/pages/page-a`, { html: newA })
check('按页优化成功', patched.body.ok === true && patched.body.seq === 2, JSON.stringify(patched.body).slice(0, 120))
const afterHtml = readFileSync(entry, 'utf8')
check('目标页已更新', afterHtml.includes('改过的 A'))
check('其它页字节级不变', afterHtml.includes('原 B') && afterHtml.includes('<div data-page="page-b">'))

// 3) 拒绝：返回整份文档
const wholeDoc = '<!doctype html><html><body><div data-page="page-a">x</div></body></html>'
const rej1 = await call('PATCH', `/demos/${demo.id}/pages/page-a`, { html: wholeDoc })
check('拒绝整份文档', rej1.status === 400 && String(rej1.body.message).includes('片段'), JSON.stringify(rej1.body))

// 4) 拒绝：丢了 data-page
const rej2 = await call('PATCH', `/demos/${demo.id}/pages/page-a`, { html: '<div>没有锚点</div>' })
check('拒绝丢失 data-page', rej2.status === 400)

// 5) 拒绝后不落库（文件未变）
check('拒绝时不写文件', readFileSync(entry, 'utf8').includes('改过的 A'))

// 6) 不存在的页面
const rej3 = await call('GET', `/demos/${demo.id}/pages/page-ghost`)
check('不存在的页面报错', rej3.status === 400)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
