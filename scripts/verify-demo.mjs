// DEMO 自检：创建、layout_mode 不可变、版本、回滚、归档、view 端点。
// 用法：node scripts/verify-demo.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-demo-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register() {} } })
const route = reg.find(r => r.path === '/workbench-api')
const call = (m, u, b) => new Promise(res => {
  const req = { url: `/workbench-api${u}`, method: m, json: async () => b ?? {} }
  route.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? p : '' }) } })
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }
const j = r => { try { return JSON.parse(r.body) } catch { return {} } }

const project = j(await call('POST', '/projects', { project: { name: 'DEMO 测试', workspacePath: tmp } })).project

// 1) 创建（单文件）
const created = j(await call('POST', '/demos', { demo: { projectId: project.id, title: '收银台 Demo', themeId: 'glass', layoutMode: 'single', platform: 'pc' } }))
check('创建 DEMO（单文件）', created.demo && created.demo.layoutMode === 'single')
const id = created.demo.id

// 2) D5：layout_mode 不可变
const tryChange = await call('POST', '/demos', { demo: { id, title: '收银台 Demo', themeId: 'glass', layoutMode: 'multi' } })
const changeBody = j(tryChange)
check('改 layout_mode 被拒（D5）', tryChange.status === 400 && changeBody.error === 'layout_mode_immutable', `${tryChange.status} ${JSON.stringify(changeBody)}`)

// 3) 不改 mode 的更新应成功
const upd = j(await call('POST', '/demos', { demo: { id, title: '收银台 Demo v2', themeId: 'clean' } }))
check('不改 mode 可更新', upd.demo && upd.demo.title === '收银台 Demo v2' && upd.demo.layoutMode === 'single' && upd.demo.themeId === 'clean')

// 4) 版本：写产物文件 + 建版本
const dir = join(tmp, '.dsh-workbench', 'demos', id, 'v1')
mkdirSync(dir, { recursive: true })
const entry = join(dir, 'index.html')
writeFileSync(entry, '<!doctype html><div data-page="page-login">v1</div>')
const v1 = j(await call('POST', '/demos/versions', { demoId: id, entryPath: entry, label: 'AI 生成', source: 'ai', pageCount: 1 }))
check('创建版本 v1', v1.version && v1.version.seq === 1, JSON.stringify(v1).slice(0, 120))

// 5) 第二个版本
const dir2 = join(tmp, '.dsh-workbench', 'demos', id, 'v2')
mkdirSync(dir2, { recursive: true })
const entry2 = join(dir2, 'index.html')
writeFileSync(entry2, '<!doctype html><div data-page="page-login">v2 改过</div>')
const v2 = j(await call('POST', '/demos/versions', { demoId: id, entryPath: entry2, label: '按页优化 · 登录', source: 'page-patch', targetPage: 'page-login', pageCount: 1 }))
check('创建版本 v2', v2.version && v2.version.seq === 2 && v2.version.targetPage === 'page-login')

// 6) 回滚 → 新建 restore 版本
const rb = j(await call('POST', `/demos/${id}/rollback`, { versionId: v1.version.id }))
check('回滚生成新版本（历史不丢）', rb.version && rb.version.seq === 3 && rb.version.source === 'restore')

// 7) 当前版本指向回滚后的版本，且 entry 指向 v1 文件
const detail = j(await call('GET', `/demos/${id}`)).demo
check('current=回滚版本', detail.currentVersionId === rb.version.id)
check('entry 指回 v1 文件', detail.entryPath === entry, detail.entryPath)

// 8) 不能删当前版本 / 不能删最后一个
const delCur = await call('DELETE', `/demos/${id}/versions/${rb.version.id}`)
check('不能删当前版本', delCur.status === 400)

// 9) view 端点返回 HTML
const view = await call('GET', `/demos/${id}/view`)
check('view 返回 HTML', String(view.body).includes('v1'))

// 10) 归档
await call('POST', '/demos/archive', { id, archived: true })
const hidden = j(await call('GET', `/demos?projectId=${project.id}`)).demos
const shown = j(await call('GET', `/demos?projectId=${project.id}&archived=1`)).demos
check('归档后默认隐藏', hidden.length === 0 && shown.length === 1)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
