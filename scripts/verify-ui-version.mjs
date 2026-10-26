// UI 设计版本自检（1.14）：改主题/改名不建版本、改页面才建；用例按版本 id 判定过期。
// 背景：此前用 ui_designs.updatedAt 当版本基线，导致「只改主题」也会被判定为过期而误删测试用例。
// 用法：node scripts/verify-ui-version.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-uiver-verify-${process.pid}`)
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

const P = (await call('POST', '/projects', { project: { name: '版本测试', workspacePath: tmp } })).body.project
const pages1 = [{ id: 'page-home', name: '首页', route: '/home', blocks: [{ id: 'b1', role: 'header', desc: 'x' }] }]
const d = (await call('POST', '/ui-designs', { design: { projectId: P.id, name: 'UI', themeId: 'glass', pages: pages1 } })).body.design

// 1) 创建即有一个版本
let vers = (await call('GET', `/ui-designs/${d.id}/versions`)).body.versions
check('创建 UI 设计后自动有 v1', vers.length === 1 && vers[0].seq === 1, JSON.stringify(vers.map(v => v.seq)))
const v1 = vers[0].id

// 2) 只改主题 → 不建新版本（这是修复的核心）
await call('POST', '/ui-designs', { design: { id: d.id, projectId: P.id, name: 'UI', themeId: 'clean', pages: pages1 } })
vers = (await call('GET', `/ui-designs/${d.id}/versions`)).body.versions
check('只改主题不建新版本', vers.length === 1, `versions=${vers.length}`)

// 3) 只改名 → 不建新版本
await call('POST', '/ui-designs', { design: { id: d.id, projectId: P.id, name: 'UI 改名', themeId: 'clean', pages: pages1 } })
vers = (await call('GET', `/ui-designs/${d.id}/versions`)).body.versions
check('只改名不建新版本', vers.length === 1, `versions=${vers.length}`)

// 4) 改页面 → 建 v2
const pages2 = [...pages1, { id: 'page-order', name: '订单', route: '/orders', blocks: [{ id: 'b2', role: 'list', desc: 'y' }] }]
await call('POST', '/ui-designs', { design: { id: d.id, projectId: P.id, name: 'UI 改名', themeId: 'clean', pages: pages2 } })
vers = (await call('GET', `/ui-designs/${d.id}/versions`)).body.versions
check('改页面后建 v2', vers.length === 2 && vers[0].seq === 2, JSON.stringify(vers.map(v => v.seq)))
const v2 = vers[0].id
check('v2 记录了页面数与区块数', vers[0].pageCount === 2 && vers[0].blockCount === 2, JSON.stringify({ p: vers[0].pageCount, b: vers[0].blockCount }))

// 5) 建两条用例：一条基于 v1（旧）、一条基于 v2（当前）
const TP = (await call('POST', '/tests/projects', { project: { name: 'TP', workspacePath: tmp } })).body.project
await call('POST', '/tests/cases', { case: { projectId: TP.id, title: '旧版用例', uiDesignId: d.id, pageId: 'page-home', designVersion: v1 } })
await call('POST', '/tests/cases', { case: { projectId: TP.id, title: '新版用例', uiDesignId: d.id, pageId: 'page-home', designVersion: v2 } })

// 6) 按当前版本 v2 清理 → 只删 v1 那条
const purged = (await call('POST', '/tests/purge-stale', { uiDesignId: d.id, keepVersion: v2 })).body
check('只删旧版本用例（删 1 条）', purged.removed === 1, JSON.stringify(purged))
const left = (await call('GET', `/tests?projectId=${TP.id}`)).body.cases
check('当前版本用例保留', left.length === 1 && left[0].title === '新版用例', JSON.stringify(left.map(c => c.title)))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
