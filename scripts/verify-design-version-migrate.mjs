// design_version 迁移自检（1.15）：旧值（时间戳/v1）→ 真实版本 id，避免首轮清理误删。
// 用法：node scripts/verify-design-version-migrate.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-dvmig-${process.pid}`)
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

// 建项目 / UI 设计（带 v1、v2）/ 测试项目
const P = (await call('POST', '/projects', { project: { name: '迁移项目', workspacePath: tmp } })).body.project
const D = (await call('POST', '/ui-designs', { design: { projectId: P.id, name: 'UI', themeId: 'glass', pages: [{ id: 'page-a', name: 'A', route: '/a', blocks: [{ id: 'b-a1', role: 'header', desc: 'x' }] }] } })).body.design
await call('POST', '/ui-designs', { design: { id: D.id, projectId: P.id, name: 'UI', themeId: 'glass', pages: [{ id: 'page-a', name: 'A', route: '/a', blocks: [{ id: 'b-a1', role: 'header', desc: 'x' }] }, { id: 'page-b', name: 'B', route: '/b', blocks: [{ id: 'b-b1', role: 'list', desc: 'y' }] }] } })
const vers = (await call('GET', `/ui-designs/${D.id}/versions`)).body.versions
check('已有 v1 与 v2', vers.length === 2)
const oldestId = vers[1].id
const T = (await call('POST', '/tests/projects', { project: { name: 'TP', workspacePath: tmp } })).body.project

// 造三条「旧格式」用例：时间戳 / v1 / 已是 uidv-
const raw = new DatabaseSync(join(tmp, 'wb.sqlite'))
const now = new Date().toISOString()
const ins = raw.prepare(`INSERT INTO test_cases(id,project_id,title,precondition,steps,expected,priority,type,source,module_id,platform,
  plan_id,ui_design_id,demo_id,page_id,block_id,role,status,bug_id,design_version,archived_at,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
ins.run('tc-old-ts', T.id, '旧时间戳用例', '', '[]', '', 'P2', 'functional', 'ai', '', 'all', '', D.id, '', 'page-a', '', '', 'active', '', '2026-10-27 03:00:00', '', now, now)
ins.run('tc-old-v1', T.id, '旧v1用例', '', '[]', '', 'P2', 'functional', 'ai', '', 'all', '', D.id, '', 'page-a', '', '', 'active', '', 'v1', '', now, now)
ins.run('tc-new', T.id, '新格式用例', '', '[]', '', 'P2', 'functional', 'ai', '', 'all', '', D.id, '', 'page-a', '', '', 'active', '', oldestId, '', now, now)
raw.close()

// 重新加载触发迁移（关掉旧实例不可能，直接调 store 方法找不到 → 用重新 apply 的方式）
// 简化：通过再 import 一次同一模块不会重跑构造，所以改为直接断言迁移逻辑存在 + 手工调用 REST 触发路径
const src = (await import('node:fs')).readFileSync(join(root, 'src/host/index.ts'), 'utf8')
check('实现 migrateDesignVersionToId', src.includes('migrateDesignVersionToId'))
check('只迁移非 uidv- 的值', src.includes("startsWith('uidv-')"))
check('取最早版本映射', src.includes('vers[vers.length - 1]'))
check('挂到启动迁移链', /migrateDesignVersionToId\(\)/.test(src))

// 真正的迁移在下次启动时跑：这里用「新进程加载同一库」验证
const { execFileSync } = await import('node:child_process')
const probe = `
process.env.DSH_WORKBENCH_DB = ${JSON.stringify(join(tmp, 'wb.sqlite'))};
const host = await import(${JSON.stringify(pathToFileURL(join(root, 'lib/index.js')).href)});
host.apply({ webServer: { register() {} }, tools: { register() {} } });
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(process.env.DSH_WORKBENCH_DB);
const rows = db.prepare("SELECT id, design_version FROM test_cases WHERE ui_design_id != ''").all();
console.log('PROBE:' + JSON.stringify(rows));
db.close();
`
let probeOut = ''
try {
  probeOut = execFileSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8', env: { ...process.env } })
} catch (e) { probeOut = 'ERR:' + String(e).slice(0, 120) }
const m = probeOut.match(/PROBE:(\[.*\])/)
if (m !== null) {
  const rows = JSON.parse(m[1])
  const byId = new Map(rows.map(r => [r.id, String(r.design_version)]))
  check('旧时间戳已迁移为版本 id', String(byId.get('tc-old-ts') ?? '').startsWith('uidv-'), byId.get('tc-old-ts'))
  check('旧 v1 已迁移为版本 id', String(byId.get('tc-old-v1') ?? '').startsWith('uidv-'), byId.get('tc-old-v1'))
  check('已是 uidv- 的不被动', byId.get('tc-new') === oldestId, `${byId.get('tc-new')} vs ${oldestId}`)
  check('都映射到最早版本', byId.get('tc-old-ts') === oldestId && byId.get('tc-old-v1') === oldestId)
} else {
  console.log('  ⚠ 子进程探测失败:', probeOut.slice(0, 120))
  fail++
}

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
