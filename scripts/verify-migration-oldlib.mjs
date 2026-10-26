// 旧库升级自检：用「1.13 时代」的库结构验证 1.14 能正常启动（补列 + 建表 + 建索引顺序）。
// 背景：SCHEMA 里若有「CREATE INDEX ON test_cases(ui_design_id)」，而旧库还没补列，
// db.exec(SCHEMA) 会抛 no such column 导致整个插件启动失败（P0）。
// 用法：node scripts/verify-migration-oldlib.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-oldlib-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const dbFile = join(tmp, 'old.sqlite')

// 造 1.13 时代的测试表（无 1.14 新列、无 test_plans）
{
  const db = new DatabaseSync(dbFile)
  db.exec(`CREATE TABLE test_projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workspace_path TEXT NOT NULL DEFAULT '', product_id TEXT NOT NULL DEFAULT '', module_id TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT 'all', bug_project_id TEXT NOT NULL DEFAULT '', deploy_mode TEXT NOT NULL DEFAULT 'local', ssh_host TEXT NOT NULL DEFAULT '', remote_dir TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '', container_name TEXT NOT NULL DEFAULT '', host_port TEXT NOT NULL DEFAULT '', container_port TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT '');
CREATE TABLE test_cases (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, precondition TEXT NOT NULL DEFAULT '', steps TEXT NOT NULL DEFAULT '[]', expected TEXT NOT NULL DEFAULT '', priority TEXT NOT NULL DEFAULT 'P2', type TEXT NOT NULL DEFAULT 'functional', source TEXT NOT NULL DEFAULT 'manual', module_id TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT 'all', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE test_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', results TEXT NOT NULL DEFAULT '[]', summary TEXT NOT NULL DEFAULT '{}', deploy_log TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, finished_at TEXT);`)
  db.prepare('INSERT INTO test_projects(id,name,created_at,updated_at) VALUES(?,?,?,?)').run('tp-old', '旧测试项目', '2026-10-01 00:00:00', '2026-10-01 00:00:00')
  db.prepare('INSERT INTO test_cases(id,project_id,title,created_at,updated_at) VALUES(?,?,?,?,?)').run('tc-old', 'tp-old', '旧用例', '2026-10-01 00:00:00', '2026-10-01 00:00:00')
  db.close()
}

process.env.DSH_WORKBENCH_DB = dbFile
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

let started = true
try {
  const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
  host.apply({ webServer: { register() {} }, tools: { register() {} } })
} catch (cause) {
  started = false
  console.log('  ✗ 旧库启动失败:', String(cause).slice(0, 200))
}
check('旧库能正常启动（不抛 no such column）', started)

if (started) {
  const db = new DatabaseSync(dbFile)
  const caseCols = db.prepare('PRAGMA table_info(test_cases)').all().map(c => String(c.name))
  const need = ['plan_id', 'ui_design_id', 'demo_id', 'page_id', 'block_id', 'role', 'status', 'bug_id', 'design_version']
  check('test_cases 已补齐 9 个新列', need.every(c => caseCols.includes(c)), `缺: ${need.filter(c => !caseCols.includes(c)).join(',')}`)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => String(r.name))
  check('test_plans 表已补建', tables.includes('test_plans'))
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r => String(r.name))
  check('idx_test_cases_scope 索引已建', indexes.includes('idx_test_cases_scope'))
  const oldCase = db.prepare('SELECT * FROM test_cases WHERE id = ?').get('tc-old')
  check('旧用例数据保留', oldCase !== undefined && oldCase.title === '旧用例')
  db.close()
}

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
