// 测试计划自检（1.14）：计划 CRUD、用例追溯链、旧版用例硬删、Bug→回归排队。
// 用法：node scripts/verify-test-plan.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-testplan-verify-${process.pid}`)
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

const P = (await call('POST', '/projects', { project: { name: '测试计划项目', workspacePath: tmp } })).body.project
const TP = (await call('POST', '/tests/projects', { project: { name: '回归测试', workspacePath: tmp } })).body.project

// 1) 建计划（T1：范围=页面列表）
const plan = (await call('POST', '/tests/plans', { plan: { projectId: P.id, name: 'v1.0 回归', scopePages: ['page-home', 'page-order'], priority: 'P1', status: 'ready', sourceUiDesignId: 'uid-1' } })).body.plan
check('创建测试计划', plan && plan.name === 'v1.0 回归' && plan.scopePages.length === 2)
check('计划列表', (await call('GET', `/tests/plans?projectId=${P.id}`)).body.plans.length === 1)

// 2) 用例带追溯链（T2）
const c = (await call('POST', '/tests/cases', { case: { projectId: TP.id, title: '首页空态显示引导', planId: plan.id, uiDesignId: 'uid-1', pageId: 'page-home', blockId: 'b1', role: '新用户', designVersion: 'v1' } })).body.case
check('用例带追溯字段', c && c.pageId === 'page-home' && c.role === '新用户' && c.planId === plan.id && c.blockId === 'b1', JSON.stringify(c ?? {}).slice(0, 120))
check('计划详情含用例', ((await call('GET', `/tests/plans/${plan.id}`)).body.plan.cases || []).length === 1)

// 3) 旧版用例硬删（T4/T5）
const purged = (await call('POST', '/tests/purge-stale', { uiDesignId: 'uid-1', keepVersion: 'v2' })).body
check('清理旧版用例（v1 被删）', purged.removed === 1, JSON.stringify(purged))
check('用例已删除', (await call('GET', `/tests?projectId=${TP.id}`)).body.cases.length === 0)

// 4) Bug → 回归排队（T10）
const bp = (await call('GET', '/bugs')).body.projects[0]
const bug = (await call('POST', '/bugs', { bug: { projectId: bp.id, title: '首页空态缺失', status: 'open' } })).body.bug
const c2 = (await call('POST', '/tests/cases', { case: { projectId: TP.id, title: '用例2', bugId: bug.id, designVersion: 'v2' } })).body.case
await call('POST', '/bugs', { bug: { id: bug.id, projectId: bp.id, title: '首页空态缺失', status: 'resolved' } })
const pend = (await call('GET', '/tests/pending-regression')).body.cases
check('Bug resolved → 用例排队回归', pend.length === 1 && pend[0].id === c2.id, JSON.stringify(pend.map(x => x.id)))

// 5) 删计划解绑用例（不删用例）
await call('DELETE', `/tests/plans/${plan.id}`)
const c3 = (await call('GET', `/tests?projectId=${TP.id}`)).body.cases
check('删计划后用例保留且解绑', c3.length >= 1 && c3.every(x => x.planId === ''))

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
