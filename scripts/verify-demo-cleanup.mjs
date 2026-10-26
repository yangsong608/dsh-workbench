// 旧 Demo 清理自检（C1）：备份存在、库行清零、文件删除、标记只写一次。
// 用法：node scripts/verify-demo-cleanup.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-cleanup-verify-${process.pid}`)
mkdirSync(tmp, { recursive: true })
const ws = join(tmp, 'ws'); mkdirSync(ws, { recursive: true })
const dbFile = join(tmp, 'wb.sqlite')

// 造旧数据：product + product_demos + product_demo_progress + 产物文件
{
  const db = new DatabaseSync(dbFile)
  db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workspace_path TEXT NOT NULL DEFAULT '', notebook_id TEXT NOT NULL DEFAULT '', mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}', styles TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT NOT NULL DEFAULT '');
CREATE TABLE product_demos (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, style TEXT NOT NULL, scope TEXT NOT NULL, feature_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, file_path TEXT NOT NULL, created_at TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'all', kind TEXT NOT NULL DEFAULT 'page', status TEXT NOT NULL DEFAULT 'ready');
CREATE TABLE product_demo_progress (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, demo_id TEXT NOT NULL DEFAULT '', step INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running', message TEXT NOT NULL DEFAULT '', log TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL);`)
  const now = '2026-10-01 00:00:00'
  db.prepare('INSERT INTO products(id,name,workspace_path,created_at,updated_at) VALUES(?,?,?,?,?)').run('prod-old', '旧产品', ws, now, now)
  db.prepare('INSERT INTO product_demos(id,product_id,style,scope,title,file_path,created_at) VALUES(?,?,?,?,?,?,?)').run('demo-old-1', 'prod-old', 'clean', 'all', '旧 Demo 1', join(ws, '.dsh-workbench/products/prod-old/demo/clean/a.html'), now)
  db.prepare('INSERT INTO product_demos(id,product_id,style,scope,title,file_path,created_at) VALUES(?,?,?,?,?,?,?)').run('demo-old-2', 'prod-old', 'glass', 'all', '旧 Demo 2', join(ws, '.dsh-workbench/products/prod-old/demo/glass/b.html'), now)
  db.prepare('INSERT INTO product_demo_progress(id,product_id,demo_id,step,total,status,updated_at) VALUES(?,?,?,?,?,?,?)').run('pdp-1', 'prod-old', 'demo-old-1', 1, 3, 'done', now)
  db.close()
  const demoDir = join(ws, '.dsh-workbench', 'products', 'prod-old', 'demo', 'clean')
  mkdirSync(demoDir, { recursive: true })
  writeFileSync(join(demoDir, 'a.html'), '<html>old a</html>')
  const glassDir = join(ws, '.dsh-workbench', 'products', 'prod-old', 'demo', 'glass')
  mkdirSync(glassDir, { recursive: true })
  writeFileSync(join(glassDir, 'b.html'), '<html>old b</html>')
}

process.env.DSH_WORKBENCH_DB = dbFile
const reg = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register() {} } })

let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

const db = new DatabaseSync(dbFile)
// 1) 库行清零
check('product_demos 已清空', db.prepare('SELECT COUNT(*) n FROM product_demos').get().n === 0)
check('product_demo_progress 已清空', db.prepare('SELECT COUNT(*) n FROM product_demo_progress').get().n === 0)
// 2) 表结构保留（避免旧引用崩）
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
check('空表结构保留', tables.includes('product_demos') && tables.includes('product_demo_progress'))
// 3) 文件已删除
check('产物文件已删除', !existsSync(join(ws, '.dsh-workbench', 'products', 'prod-old', 'demo')))
// 4) 备份存在且可解析
const backupRoot = join(dirname(dbFile), 'backup')
const dirs = existsSync(backupRoot) ? readdirSync(backupRoot).filter(n => n.startsWith('demo-')) : []
check('备份目录已创建', dirs.length >= 1, JSON.stringify(dirs))
if (dirs.length > 0) {
  const dir = join(backupRoot, dirs[0])
  const json = JSON.parse(readFileSync(join(dir, 'demos.json'), 'utf8'))
  check('备份含 2 条记录', Array.isArray(json.demos) && json.demos.length === 2)
  check('备份含文件副本', existsSync(join(dir, 'files', 'prod-old')))
  check('备份含 MANIFEST', existsSync(join(dir, 'MANIFEST.txt')))
}
// 5) 标记已写
const meta = db.prepare('SELECT value FROM meta WHERE key = ?').get('demo_cleanup_done')
check('清理标记已写', meta?.value === '1', JSON.stringify(meta))
db.close()

// 6) 幂等：重启不再执行
const reg2 = []
const host2 = await import(pathToFileURL(join(root, 'lib/index.js')).href + `?r=${Date.now()}`)
host2.apply({ webServer: { register(r) { reg2.push(r) } }, tools: { register() {} } })
const backupRoot2 = join(dirname(dbFile), 'backup')
const dirs2 = existsSync(backupRoot2) ? readdirSync(backupRoot2).filter(n => n.startsWith('demo-')) : []
check('重启不重复备份', dirs2.length === dirs.length, `${dirs.length} → ${dirs2.length}`)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
