/**
 * dsh-workbench · 宿主半侧
 *
 * 职责：
 *  - 本地 SQLite 轻量库（node:sqlite，WAL）持久化整份工作台状态；
 *  - 在 webServer 上挂 /workbench-api 路由，供浏览器半侧读写；
 *  - 首次启动写入一组最小示例数据（3 空间 + 7 任务），并带乐观版本号。
 *
 * 数据按实体分表（spaces / tasks / subtasks / attachments / logs / focus_sessions），
 * 写入按「整份快照」在一个事务里替换：单用户本地工作台，数据量小、语义简单，
 * 换来的是永不出现半写状态。读侧一次组装成前端直接可用的 JSON。
 */
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { accessSync, constants as fsConstants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createIdeaModule, buildIdeaPrompt } from './idea.js'
import { createAgentModule } from './agent.js'
import { syncDelta, syncMeta, syncPush, writeTombstone, type SyncHooks } from './sync.js'
import {
  clampText as clampGraphText, normalizeProductGraph, parseExternalRef, productGraphBytes,
  productGraphFromV1, productGraphToV1, PRODUCT_GRAPH_LIMITS, type ProductMapGraph, type ProductMapNode,
} from '../shared/product-graph-model.js'

const require = createRequire(import.meta.url)

/** 可选：若运行环境没有 node:sqlite，降级为同目录 JSON 文件（保持接口不变）。 */
let DatabaseSync: any = null
try {
  DatabaseSync = require('node:sqlite').DatabaseSync
} catch (cause) {
  console.warn(`[dsh-workbench] node:sqlite 不可用，降级为 JSON 存储：${String(cause)}`)
}

const PREFIX = '/workbench-api'
const MAX_BODY_BYTES = 8 * 1024 * 1024
const MAX_TASKS = 50_000

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function isoDate(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function isoDateTime(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${isoDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function isoDateTimeSeconds(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${isoDateTime(d)}:${p(d.getSeconds())}`
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  dt.setDate(dt.getDate() + delta)
  return isoDate(dt)
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, 20_000) : fallback
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

/** SQLite 里 JSON 列读出来是字符串，统一解析成数组。 */
function jsonList(value: unknown): any[] {
  if (Array.isArray(value)) return value
  const text = str(value).trim()
  if (text === '') return []
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function dataDir(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/* ------------------------------------------------------------------ */
/* 存储                                                                */
/* ------------------------------------------------------------------ */

interface State {
  spaces: any[]
  tasks: any[]
  focus: any[]
  settings: Record<string, unknown>
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  descr TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  space_id TEXT NOT NULL,
  project_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  date TEXT,
  start TEXT,
  end TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  grp TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  planned_start TEXT,
  planned_end TEXT,
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  size INTEGER,
  path TEXT
);
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'edit',
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  started_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  query TEXT NOT NULL,
  schedule_kind TEXT NOT NULL DEFAULT 'daily',
  times TEXT NOT NULL DEFAULT '[]',
  weekday INTEGER NOT NULL DEFAULT 1,
  custom_cron TEXT NOT NULL DEFAULT '',
  schedule_text TEXT NOT NULL DEFAULT '',
  cron_task_ids TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  count INTEGER NOT NULL DEFAULT 6,
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bug_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'minor',
  priority TEXT NOT NULL DEFAULT 'P2',
  planned_date TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT '',
  ai_thread_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  assignee TEXT NOT NULL DEFAULT '我',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id, status, updated_at);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  bug_project_id TEXT NOT NULL DEFAULT '',
  deploy_mode TEXT NOT NULL DEFAULT 'local',
  ssh_host TEXT NOT NULL DEFAULT '',
  remote_dir TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_name TEXT NOT NULL DEFAULT '',
  host_port TEXT NOT NULL DEFAULT '',
  container_port TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  precondition TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  expected TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2',
  type TEXT NOT NULL DEFAULT 'functional',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  results TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  deploy_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  notebook_id TEXT NOT NULL DEFAULT '',
  mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}',
  styles TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_demos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  style TEXT NOT NULL,
  scope TEXT NOT NULL,
  feature_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all',
  kind TEXT NOT NULL DEFAULT 'page',
  status TEXT NOT NULL DEFAULT 'ready'
);
CREATE TABLE IF NOT EXISTS product_demo_progress (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  demo_id TEXT NOT NULL DEFAULT '',
  step INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT NOT NULL DEFAULT '',
  log TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL,
  hash TEXT NOT NULL,
  UNIQUE(topic_id, hash)
);
CREATE TABLE IF NOT EXISTS tombstones (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(entity, id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_news_items_topic ON news_items(topic_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tombstones_time ON tombstones(deleted_at);
`

class SqliteStore {
  readonly engine = 'sqlite'
  readonly file: string
  private db: any
  private revision = 0

  /** 灵感模块复用同一连接：同一 SQLite 文件只留一个写者，避免锁竞争。 */
  connection(): any { return this.db }

  constructor(file: string) {
    this.file = file
    mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec(SCHEMA)
    this.migrateNews()
    this.migrateTasks()
    this.migrateProductMaps()
    this.ensureNotebooks()
    this.ensureProducts()
    this.ensureTests()
    this.migrateUnifiedProjects()
    this.seedNotes()
    this.revision = Number(this.readMeta('revision') ?? 0)
    const seeded = Number(this.readMeta('seeded') ?? 0) === 1
    if (!seeded) {
      this.writeState(seedState())
      this.writeMeta('seeded', '1')
      this.writeMeta('revision', '1')
      this.revision = 1
    }
  }

  /** 旧库升级：补 news_topics.count / news_items.ai_summary 两列。 */
  private migrateNews(): void {
    const columns = (table: string): string[] => (this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => String(c.name))
    if (!columns('news_topics').includes('count')) this.db.exec('ALTER TABLE news_topics ADD COLUMN count INTEGER NOT NULL DEFAULT 6')
    if (!columns('news_items').includes('ai_summary')) this.db.exec("ALTER TABLE news_items ADD COLUMN ai_summary TEXT NOT NULL DEFAULT ''")
    if (!columns('notes').includes('map_id')) this.db.exec("ALTER TABLE notes ADD COLUMN map_id TEXT NOT NULL DEFAULT ''")
    /* 设计文档升级：把「笔记」区分为 业务模块设计 / 产品设计 / 功能设计，并带上稳定的幂等键
       - kind：module_design（按模块）/ product_design（产品级）/ feature_design（按节点）
       - node_id / module_id：明确的归属外键（不再只靠 tags 猜）
       - doc_key：同一 scope 的文档唯一（重跑 = 更新，不新增） */
    for (const [col, sql] of [
      ['kind', "TEXT NOT NULL DEFAULT ''"],
      ['node_id', "TEXT NOT NULL DEFAULT ''"],
      ['module_id', "TEXT NOT NULL DEFAULT ''"],
      ['doc_key', "TEXT NOT NULL DEFAULT ''"],
    ] as Array<[string, string]>) {
      if (!columns('notes').includes(col)) this.db.exec(`ALTER TABLE notes ADD COLUMN ${col} ${sql}`)
    }
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_doc_key ON notes(doc_key) WHERE doc_key <> ''")
    /* 产品素材源：竞品网站 / 截图 / 文字，作为 AI 提炼导图的输入（挂在产品上，可跨导图复用） */
    this.db.exec(`CREATE TABLE IF NOT EXISTS product_inputs (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, map_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'url', url TEXT NOT NULL DEFAULT '', file_path TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_product_inputs ON product_inputs(product_id, created_at)')
    /* 归档：三处统一用 archived_at（空=未归档），列表默认过滤、可切换查看 */
    for (const table of ['products', 'modules', 'notes']) {
      if (!columns(table).includes('archived_at')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''`)
    }
  }

  /**
   * 旧库升级：一个产品可拥有多张导图。
   * - 新建 product_maps 表；每个产品的旧 products.mindmap 迁成一张「主导图」。
   * - modules / product_demos 增加 map_id，并回填到产品的第一张导图。
   * products.mindmap 保留为第一张导图的镜像（旧版本仍能读到导图）。
   */
  private migrateProductMaps(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS product_maps (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '主导图',
      description TEXT NOT NULL DEFAULT '', mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}',
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      graph_json TEXT NOT NULL DEFAULT '', draft_rev INTEGER NOT NULL DEFAULT 0,
      current_version_id TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT ''
    )`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS product_map_versions (
      id TEXT PRIMARY KEY, map_id TEXT NOT NULL, seq INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual', source_ref TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
      graph_json TEXT NOT NULL, node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`)
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_map_versions ON product_map_versions(map_id, seq)')
    const columns = (table: string): string[] => (this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => String(c.name))
    for (const table of ['modules', 'product_demos']) {
      if (!columns(table).includes('map_id')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN map_id TEXT NOT NULL DEFAULT ''`)
    }
    const now = isoDateTimeSeconds()
    const products = this.db.prepare('SELECT id, name, mindmap, created_at FROM products').all() as any[]
    for (const product of products) {
      const existing = this.db.prepare('SELECT id FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at LIMIT 1').get(product.id) as any
      let mapId = existing?.id as string | undefined
      if (mapId === undefined) {
        mapId = `map-${randomUUID().slice(0, 12)}`
        this.db.prepare('INSERT INTO product_maps(id, product_id, name, description, mindmap, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(mapId, product.id, '主导图', '', String(product.mindmap ?? '{"nodes":[]}'), 0, product.created_at ?? now, now)
      }
      for (const table of ['modules', 'product_demos']) {
        this.db.prepare(`UPDATE ${table} SET map_id = ? WHERE product_id = ? AND map_id = ''`).run(mapId, product.id)
      }
      if (existing === undefined) {
        const saved = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
        this.writeMapFile(product.id, saved)
      }
    }
    this.migrateProductMapGraphs()
  }

  /**
   * 导图 v2 升级：mindmap(v1) → graph_json(v2 图模型)，节点 id 原样保留（featureId 不悬空）。
   * 升级后立即存档 v1 版本（source=migration），此后每张导图有独立版本序列。
   * mindmap 列继续作为 v1 向后兼容镜像（由 v2 反向导出）。
   */
  private migrateProductMapGraphs(): void {
    const columns = (table: string): string[] => (this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => String(c.name))
    const mapCols = columns('product_maps')
    const add = (name: string, sql: string): void => {
      if (!mapCols.includes(name)) this.db.exec(`ALTER TABLE product_maps ADD COLUMN ${name} ${sql}`)
    }
    add('graph_json', "TEXT NOT NULL DEFAULT ''")
    add('draft_rev', 'INTEGER NOT NULL DEFAULT 0')
    add('current_version_id', "TEXT NOT NULL DEFAULT ''")
    add('source', "TEXT NOT NULL DEFAULT 'manual'")
    add('source_ref', "TEXT NOT NULL DEFAULT ''")
    add('summary', "TEXT NOT NULL DEFAULT ''")
    const now = isoDateTimeSeconds()
    const rows = this.db.prepare("SELECT * FROM product_maps WHERE graph_json IS NULL OR graph_json = ''").all() as any[]
    for (const row of rows) {
      const product = this.db.prepare('SELECT name FROM products WHERE id = ?').get(row.product_id) as any
      const { graph } = productGraphFromV1(row.mindmap, String(product?.name ?? '产品'))
      const graphJson = JSON.stringify(graph)
      this.db.prepare("UPDATE product_maps SET graph_json=?, mindmap=?, updated_at=? WHERE id=?")
        .run(graphJson, productGraphToV1(graph), now, row.id)
      const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM product_map_versions WHERE map_id = ?').get(row.id) as any)?.n ?? 0)
      if (count === 0) {
        const versionId = `mv-${randomUUID().slice(0, 12)}`
        this.db.prepare('INSERT INTO product_map_versions(id, map_id, seq, label, source, source_ref, summary, graph_json, node_count, edge_count, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run(versionId, row.id, 1, 'v1 迁移', 'migration', '', '从 v1 导图迁移', graphJson, graph.nodes.length, graph.edges.length, now)
        this.db.prepare('UPDATE product_maps SET current_version_id=? WHERE id=?').run(versionId, row.id)
      }
    }
  }

  /** 旧库升级：任务补 project_path（项目 / 工作区绝对路径；空串表示未归属）。 */
  private migrateTasks(): void {
    const cols = (this.db.prepare('PRAGMA table_info(tasks)').all() as any[]).map(c => String(c.name))
    if (!cols.includes('project_path')) this.db.exec("ALTER TABLE tasks ADD COLUMN project_path TEXT NOT NULL DEFAULT ''")
  }

  private readMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value?: string } | undefined
    return row?.value ?? null
  }

  private writeMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
  }

  /** 快照写入前先记下旧 id 集合，用于识别「原有但新快照里不存在」的删除项。 */
  private idsOf(table: string): string[] {
    return (this.db.prepare(`SELECT id FROM ${table}`).all() as any[]).map(row => String(row.id))
  }

  /** 读整份状态（一次组装，任务内嵌子待办/附件/记录）。 */
  readState(): State & { revision: number } {
    const spaces = this.db.prepare('SELECT * FROM spaces ORDER BY sort, created_at').all()
    const tasks = this.db.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort, created_at').all()
    const subtasks = this.db.prepare('SELECT * FROM subtasks ORDER BY sort, id').all()
    const attachments = this.db.prepare('SELECT * FROM attachments ORDER BY id').all()
    const logs = this.db.prepare('SELECT * FROM logs ORDER BY at DESC, id').all()
    const focus = this.db.prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC').all()
    const settings: Record<string, unknown> = {}
    for (const row of this.db.prepare('SELECT key, value FROM settings').all()) {
      try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
    }
    const subBy = groupBy(subtasks, 'task_id')
    const attBy = groupBy(attachments, 'task_id')
    const logBy = groupBy(logs, 'task_id')
    return {
      revision: this.revision,
      spaces: spaces.map((s: any) => ({ id: s.id, name: s.name, color: s.color })),
      tasks: tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        desc: t.descr ?? '',
        note: t.note ?? '',
        space: t.space_id,
        projectPath: t.project_path ?? '',
        status: t.status,
        priority: t.priority ?? 'normal',
        tags: safeJson(t.tags, []),
        date: t.date ?? null,
        start: t.start ?? '',
        end: t.end ?? '',
        duration: Number(t.duration ?? 0),
        group: t.grp ?? '',
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        completedAt: t.completed_at ?? null,
        subtasks: (subBy.get(t.id) ?? []).map(toSubtask),
        attachments: (attBy.get(t.id) ?? []).map(toAttachment),
        logs: (logBy.get(t.id) ?? []).map(l => ({ at: l.at, type: l.type, text: l.text })),
      })),
      focus: focus.map((f: any) => ({ id: f.id, taskId: f.task_id, startedAt: f.started_at, minutes: Number(f.minutes), completed: Number(f.completed) === 1 })),
      settings,
    }
  }

  /** 整份快照写入：一个事务内清空 + 全量插入；失败回滚。 */
  writeState(state: State): number {
    const now = isoDateTime()
    const tasks = list(state.tasks).slice(0, MAX_TASKS)
    const spaces = list(state.spaces)
    const byId = new Map<string, any>()
    for (const task of tasks) {
      const id = str(task?.id)
      if (id !== '' && !byId.has(id)) byId.set(id, task)
    }
    const taskIds = new Set(byId.keys())

    this.db.exec('BEGIN IMMEDIATE')
    try {
      /* 先读旧 id：整份快照是「全清重插」，只有对比旧集合才能识别删除项并记墓碑。 */
      const oldTaskIds = this.idsOf('tasks')
      const oldSubtaskIds = this.idsOf('subtasks')
      const oldFocusIds = this.idsOf('focus_sessions')
      const oldSpaceIds = this.idsOf('spaces')
      const newSubtaskIds = new Set<string>()
      const newFocusIds = new Set<string>()
      const newSpaceIds = new Set<string>()

      this.db.exec('DELETE FROM subtasks; DELETE FROM attachments; DELETE FROM logs; DELETE FROM tasks; DELETE FROM spaces; DELETE FROM focus_sessions; DELETE FROM settings;')
      const insSpace = this.db.prepare('INSERT INTO spaces(id, name, color, sort, created_at, updated_at) VALUES(?,?,?,?,?,?)')
      spaces.forEach((space, index) => {
        const id = str(space?.id)
        if (id === '') return
        newSpaceIds.add(id)
        insSpace.run(id, str(space.name, id), str(space.color, '#5b5bd6'), index, now, now)
      })

      const insTask = this.db.prepare(`INSERT INTO tasks(id, title, descr, note, space_id, project_path, status, priority, date, start, end, duration, tags, grp, sort, created_at, updated_at, completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      const insSub = this.db.prepare('INSERT INTO subtasks(id, task_id, title, done, planned_start, planned_end, note, sort) VALUES(?,?,?,?,?,?,?,?)')
      const insAtt = this.db.prepare('INSERT INTO attachments(id, task_id, name, kind, size, path) VALUES(?,?,?,?,?,?)')
      const insLog = this.db.prepare('INSERT INTO logs(id, task_id, at, type, text) VALUES(?,?,?,?,?)')

      let taskIndex = 0
      for (const task of byId.values()) {
        const id = str(task.id)
        insTask.run(
          id,
          str(task.title, '未命名任务'),
          str(task.desc),
          str(task.note),
          str(task.space, 'life'),
          str(task.projectPath),
          str(task.status, 'next'),
          str(task.priority, 'normal'),
          task.date ? str(task.date) : null,
          task.start ? str(task.start) : null,
          task.end ? str(task.end) : null,
          Math.max(0, Math.round(num(task.duration))),
          JSON.stringify(list(task.tags).map(t => str(t)).filter(Boolean)),
          task.group ? str(task.group) : null,
          taskIndex++,
          str(task.createdAt, now),
          str(task.updatedAt, now),
          task.completedAt ? str(task.completedAt) : null,
        )
        list(task.subtasks).slice(0, 500).forEach((sub, i) => {
          const sid = str(sub?.id)
          if (sid === '') return
          newSubtaskIds.add(sid)
          insSub.run(sid, id, str(sub.title, '子待办'), sub.done ? 1 : 0,
            sub.start ? str(sub.start) : null, sub.end ? str(sub.end) : null, sub.note ? str(sub.note) : null, i)
        })
        list(task.attachments).slice(0, 200).forEach(a => {
          const aid = str(a?.id)
          if (aid === '') return
          insAtt.run(aid, id, str(a.name, '附件'), str(a.kind, 'other'), a.size === undefined ? null : Math.round(num(a.size)), null)
        })
        list(task.logs).slice(0, 2000).forEach((log, i) => {
          insLog.run(`${id}:log:${i}`, id, str(log?.at, now), str(log?.type, 'edit'), str(log?.text))
        })
      }

      const insFocus = this.db.prepare('INSERT INTO focus_sessions(id, task_id, started_at, minutes, completed) VALUES(?,?,?,?,?)')
      list(state.focus).slice(0, 50_000).forEach((f, i) => {
        const id = str(f?.id, `focus:${i}`)
        const taskId = str(f.taskId)
        newFocusIds.add(id)
        insFocus.run(id, taskIds.has(taskId) ? taskId : null, str(f.startedAt, now), Math.max(0, Math.round(num(f.minutes))), f.completed === false ? 0 : 1)
      })

      const insSetting = this.db.prepare('INSERT INTO settings(key, value) VALUES(?,?)')
      const settings = state.settings && typeof state.settings === 'object' ? state.settings : {}
      for (const [key, value] of Object.entries(settings)) {
        insSetting.run(str(key).slice(0, 120), JSON.stringify(value))
      }

      /* 删除记账：旧有而新快照中不存在的 id 写墓碑（同一事务内，失败一起回滚）。 */
      const deletedAt = isoDateTimeSeconds()
      for (const id of oldTaskIds) if (!taskIds.has(id)) writeTombstone(this.db, 'tasks', id, deletedAt)
      for (const id of oldSubtaskIds) if (!newSubtaskIds.has(id)) writeTombstone(this.db, 'subtasks', id, deletedAt)
      for (const id of oldFocusIds) if (!newFocusIds.has(id)) writeTombstone(this.db, 'focus_sessions', id, deletedAt)
      for (const id of oldSpaceIds) if (!newSpaceIds.has(id)) writeTombstone(this.db, 'spaces', id, deletedAt)

      this.revision += 1
      this.writeMeta('revision', String(this.revision))
      this.db.exec('COMMIT')
    } catch (cause) {
      try { this.db.exec('ROLLBACK') } catch { /* 已回滚 */ }
      throw cause
    }
    return this.revision
  }

  /** 新闻：订阅 + 条目（与任务快照分开，避免工作台整份保存覆盖异步写入的新闻）。 */
  listNews(): { topics: any[]; items: any[] } {
    const topics = this.db.prepare('SELECT * FROM news_topics ORDER BY created_at').all().map(toNewsTopic)
    const items = this.db.prepare('SELECT * FROM news_items ORDER BY fetched_at DESC, id DESC LIMIT 400').all().map(toNewsItem)
    return { topics, items }
  }

  saveNewsTopic(input: any): any {
    const now = isoDateTime()
    const id = str(input?.id) || `news-${randomUUID().slice(0, 12)}`
    const title = str(input?.title).trim()
    const query = str(input?.query).trim() || title
    if (title === '') throw new Error('主题名称不能为空')
    const kind = ['daily', 'workdays', 'weekly', 'custom'].includes(str(input?.scheduleKind)) ? str(input?.scheduleKind) : 'daily'
    const times = cleanTimes(input?.times)
    const weekday = Math.max(0, Math.min(6, Math.round(num(input?.weekday, 1))))
    const customCron = str(input?.customCron).trim()
    const scheduleText = str(input?.scheduleText) || customCron || times.join(' / ')
    const cronTaskIds = list(input?.cronTaskIds).map(x => str(x)).filter(Boolean)
    const enabled = input?.enabled === false ? 0 : 1
    const count = Math.max(1, Math.min(20, Math.round(num(input?.count, 6))))
    const existing = this.db.prepare('SELECT id, created_at FROM news_topics WHERE id = ?').get(id) as any
    const createdAt = existing?.created_at ?? now
    if (existing) {
      this.db.prepare(`UPDATE news_topics SET title=?, query=?, schedule_kind=?, times=?, weekday=?, custom_cron=?, schedule_text=?, cron_task_ids=?, enabled=?, count=?, updated_at=? WHERE id=?`)
        .run(title, query, kind, JSON.stringify(times), weekday, customCron, scheduleText, JSON.stringify(cronTaskIds), enabled, count, now, id)
    } else {
      this.db.prepare(`INSERT INTO news_topics(id, title, query, schedule_kind, times, weekday, custom_cron, schedule_text, cron_task_ids, enabled, count, last_run_at, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, title, query, kind, JSON.stringify(times), weekday, customCron, scheduleText, JSON.stringify(cronTaskIds), enabled, count, null, createdAt, now)
    }
    return toNewsTopic(this.db.prepare('SELECT * FROM news_topics WHERE id = ?').get(id))
  }

  deleteNewsTopic(id: string): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM news_items WHERE topic_id = ?').run(id)
      this.db.prepare('DELETE FROM news_topics WHERE id = ?').run(id)
      writeTombstone(this.db, 'news_topics', id)
      this.db.exec('COMMIT')
    } catch (cause) {
      try { this.db.exec('ROLLBACK') } catch { /* ignore */ }
      throw cause
    }
  }

  /** 供 workbench_news_publish 工具调用：按 URL/title 去重写入。 */
  publishNews(topicId: string, rawItems: any[]): { ok: boolean; inserted: number; skipped: number; error?: string } {
    const topic = this.db.prepare('SELECT id, title, count FROM news_topics WHERE id = ?').get(topicId) as any
    if (!topic) return { ok: false, inserted: 0, skipped: 0, error: `未知订阅：${topicId}` }
    const now = isoDateTimeSeconds()
    const limit = Math.max(1, Math.min(20, Math.round(Number(topic.count ?? 6))))
    const rows = cleanNewsItems(rawItems).slice(0, limit)
    let inserted = 0
    let skipped = 0
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const ins = this.db.prepare('INSERT OR IGNORE INTO news_items(id, topic_id, title, url, source, published_at, summary, ai_summary, fetched_at, hash) VALUES(?,?,?,?,?,?,?,?,?,?)')
      for (const item of rows) {
        const result = ins.run(`ni-${randomUUID().slice(0, 16)}`, topicId, item.title, item.url, item.source, item.publishedAt, item.summary, item.aiSummary, now, item.hash)
        if (Number(result?.changes ?? 0) > 0) inserted += 1
        else skipped += 1
      }
      this.db.prepare('UPDATE news_topics SET last_run_at = ?, updated_at = ? WHERE id = ?').run(now, now, topicId)
      this.db.prepare(`DELETE FROM news_items WHERE topic_id = ? AND id NOT IN (SELECT id FROM news_items WHERE topic_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 200)`).run(topicId, topicId)
      this.db.exec('COMMIT')
    } catch (cause) {
      try { this.db.exec('ROLLBACK') } catch { /* ignore */ }
      throw cause
    }
    return { ok: true, inserted, skipped }
  }

  private ensureNotebooks(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS bug_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'minor',
  priority TEXT NOT NULL DEFAULT 'P2',
  planned_date TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT '',
  ai_thread_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  assignee TEXT NOT NULL DEFAULT '我',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id, status, updated_at);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  bug_project_id TEXT NOT NULL DEFAULT '',
  deploy_mode TEXT NOT NULL DEFAULT 'local',
  ssh_host TEXT NOT NULL DEFAULT '',
  remote_dir TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_name TEXT NOT NULL DEFAULT '',
  host_port TEXT NOT NULL DEFAULT '',
  container_port TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  precondition TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  expected TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2',
  type TEXT NOT NULL DEFAULT 'functional',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  results TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  deploy_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  notebook_id TEXT NOT NULL DEFAULT '',
  mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}',
  styles TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_demos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  style TEXT NOT NULL,
  scope TEXT NOT NULL,
  feature_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all',
  kind TEXT NOT NULL DEFAULT 'page',
  status TEXT NOT NULL DEFAULT 'ready'
);
CREATE TABLE IF NOT EXISTS product_demo_progress (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  demo_id TEXT NOT NULL DEFAULT '',
  step INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT NOT NULL DEFAULT '',
  log TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    const cols = this.db.prepare('PRAGMA table_info(notes)').all() as any[]
    if (!cols.some(c => c.name === 'notebook_id')) {
      this.db.exec("ALTER TABLE notes ADD COLUMN notebook_id TEXT NOT NULL DEFAULT ''")
    }
    if (!cols.some(c => c.name === 'file_path')) {
      this.db.exec("ALTER TABLE notes ADD COLUMN file_path TEXT NOT NULL DEFAULT ''")
    }
    const nbCols = this.db.prepare('PRAGMA table_info(notebooks)').all() as any[]
    if (!nbCols.some(c => c.name === 'workspace_path')) {
      this.db.exec("ALTER TABLE notebooks ADD COLUMN workspace_path TEXT NOT NULL DEFAULT ''")
    }
    let def = this.db.prepare('SELECT id FROM notebooks ORDER BY created_at, id LIMIT 1').get() as any
    if (!def) {
      const now = isoDateTimeSeconds()
      this.db.prepare('INSERT INTO notebooks(id, name, created_at, updated_at) VALUES(?,?,?,?)').run('nb-default', '随手记', now, now)
      def = { id: 'nb-default' }
    }
    this.db.prepare("UPDATE notes SET notebook_id=? WHERE notebook_id IS NULL OR notebook_id=''").run(def.id)
  }

  private ensureTests(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'module', platform TEXT NOT NULL DEFAULT 'all',
      description TEXT NOT NULL DEFAULT '', note_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'designing',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '', product_id TEXT NOT NULL DEFAULT '',
      bug_project_id TEXT NOT NULL DEFAULT '', deploy_mode TEXT NOT NULL DEFAULT 'local',
      ssh_host TEXT NOT NULL DEFAULT '', remote_dir TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
      container_name TEXT NOT NULL DEFAULT '', host_port TEXT NOT NULL DEFAULT '', container_port TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      precondition TEXT NOT NULL DEFAULT '', steps TEXT NOT NULL DEFAULT '[]', expected TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'P2', type TEXT NOT NULL DEFAULT 'functional',
      source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running', results TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '{}', deploy_log TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, finished_at TEXT
    )`)
    const addCol = (table: string, name: string, sql: string): void => {
      const cols = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]
      if (!cols.some(c => c.name === name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sql}`)
    }
    addCol('bugs', 'module_id', "TEXT NOT NULL DEFAULT ''"); addCol('bugs', 'platform', "TEXT NOT NULL DEFAULT 'all'")
    addCol('test_projects', 'module_id', "TEXT NOT NULL DEFAULT ''"); addCol('test_projects', 'platform', "TEXT NOT NULL DEFAULT 'all'")
    addCol('test_cases', 'module_id', "TEXT NOT NULL DEFAULT ''"); addCol('test_cases', 'platform', "TEXT NOT NULL DEFAULT 'all'")
  }

  private ensureProducts(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  bug_project_id TEXT NOT NULL DEFAULT '',
  deploy_mode TEXT NOT NULL DEFAULT 'local',
  ssh_host TEXT NOT NULL DEFAULT '',
  remote_dir TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_name TEXT NOT NULL DEFAULT '',
  host_port TEXT NOT NULL DEFAULT '',
  container_port TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  precondition TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  expected TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2',
  type TEXT NOT NULL DEFAULT 'functional',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  results TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  deploy_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '', notebook_id TEXT NOT NULL DEFAULT '',
      mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}', styles TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS product_demos (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, style TEXT NOT NULL, scope TEXT NOT NULL,
      feature_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, file_path TEXT NOT NULL, created_at TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'all', kind TEXT NOT NULL DEFAULT 'page', status TEXT NOT NULL DEFAULT 'ready'
    )`)
    this.db.exec(`CREATE TABLE IF NOT EXISTS product_demo_progress (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, demo_id TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running',
      message TEXT NOT NULL DEFAULT '', log TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
    )`)
    const cols = this.db.prepare('PRAGMA table_info(products)').all() as any[]
    const add = (name: string, sql: string): void => {
      if (!cols.some(c => c.name === name)) this.db.exec(`ALTER TABLE products ADD COLUMN ${name} ${sql}`)
    }
    add('description', "TEXT NOT NULL DEFAULT ''")
    add('workspace_path', "TEXT NOT NULL DEFAULT ''")
    add('notebook_id', "TEXT NOT NULL DEFAULT ''")
    add('mindmap', `TEXT NOT NULL DEFAULT '{"nodes":[]}'`)
    add('styles', "TEXT NOT NULL DEFAULT '[]'")
    // demo 扩展列（旧库升级）
    const demoCols = this.db.prepare('PRAGMA table_info(product_demos)').all() as any[]
    const addDemo = (name: string, sql: string): void => {
      if (!demoCols.some(c => c.name === name)) this.db.exec(`ALTER TABLE product_demos ADD COLUMN ${name} ${sql}`)
    }
    addDemo('platform', "TEXT NOT NULL DEFAULT 'all'")
    addDemo('kind', "TEXT NOT NULL DEFAULT 'page'")
    addDemo('status', "TEXT NOT NULL DEFAULT 'ready'")
    /* 模块 ↔ 导图节点：有了 node_id 才能在导图节点与模块之间双向跳转、改名同步 */
    const moduleCols = this.db.prepare('PRAGMA table_info(modules)').all() as any[]
    if (!moduleCols.some(c => c.name === 'node_id')) this.db.exec("ALTER TABLE modules ADD COLUMN node_id TEXT NOT NULL DEFAULT ''")
    if (!moduleCols.some(c => c.name === 'sort_order')) this.db.exec('ALTER TABLE modules ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
    /* 模块 / 笔记生成本身的进度（与 Demo 的 product_demo_progress 同构） */
    this.db.exec(`CREATE TABLE IF NOT EXISTS product_progress (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'modules',
      demo_id TEXT NOT NULL DEFAULT '', map_id TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running', message TEXT NOT NULL DEFAULT '',
      log TEXT NOT NULL DEFAULT '[]', session_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`)
  }

  private defaultNotebookId(): string {
    let row = this.db.prepare('SELECT id FROM notebooks ORDER BY created_at, id LIMIT 1').get() as any
    if (!row) {
      const now = isoDateTimeSeconds()
      this.db.prepare('INSERT INTO notebooks(id, name, created_at, updated_at) VALUES(?,?,?,?)').run('nb-default', '随手记', now, now)
      row = { id: 'nb-default' }
    }
    return String(row.id)
  }

  private seedNotes(): void {
    const notebookId = this.defaultNotebookId()
    if (this.readMeta('notes_seeded') !== '1') {
      this.writeMeta('notes_seeded', '1')
      const row = this.db.prepare('SELECT COUNT(*) AS n FROM notes').get() as any
      if (Number(row?.n ?? 0) === 0) {
        const note = welcomeNote()
        this.db.prepare('INSERT INTO notes(id, notebook_id, title, content, tags, pinned, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(note.id, notebookId, note.title, note.content, JSON.stringify(note.tags), 1, note.createdAt, note.updatedAt)
      }
    }
  }

  /** 记事本：与任务/新闻分开的独立表。 */
  listNotes(includeArchived = false): any[] {
    const sql = includeArchived
      ? 'SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC'
      : "SELECT * FROM notes WHERE archived_at = '' ORDER BY pinned DESC, updated_at DESC"
    return this.db.prepare(sql).all().map(toNote)
  }

  listNotebooks(): any[] {
    const rows = this.db.prepare(`SELECT nb.*, (SELECT COUNT(*) FROM notes n WHERE n.notebook_id = nb.id) AS count
      FROM notebooks nb ORDER BY nb.created_at, nb.id`).all() as any[]
    return rows.map(row => ({ id: row.id, name: row.name, workspacePath: row.workspace_path ?? '', count: Number(row.count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at }))
  }

  saveNotebook(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `nb-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 80)
    if (name === '') throw new Error('笔记本名称不能为空')
    const workspacePath = str(input?.workspacePath).trim()
    const existing = this.db.prepare('SELECT id, created_at FROM notebooks WHERE id = ?').get(id) as any
    if (existing) this.db.prepare('UPDATE notebooks SET name=?, workspace_path=?, updated_at=? WHERE id=?').run(name, workspacePath, now, id)
    else this.db.prepare('INSERT INTO notebooks(id, name, workspace_path, created_at, updated_at) VALUES(?,?,?,?,?)').run(id, name, workspacePath, existing?.created_at ?? now, now)
    const row = this.db.prepare('SELECT * FROM notebooks WHERE id = ?').get(id) as any
    return { id: row.id, name: row.name, workspacePath: row.workspace_path ?? '', count: 0, createdAt: row.created_at, updatedAt: row.updated_at }
  }

  deleteNotebook(id: string): any {
    const nb = this.db.prepare('SELECT id FROM notebooks WHERE id = ?').get(id) as any
    if (!nb) throw new Error('笔记本不存在')
    const other = this.db.prepare('SELECT id FROM notebooks WHERE id <> ? ORDER BY created_at, id LIMIT 1').get(id) as any
    if (!other) throw new Error('至少保留一个笔记本')
    const moved = Number((this.db.prepare('SELECT COUNT(*) AS n FROM notes WHERE notebook_id = ?').get(id) as any)?.n ?? 0)
    this.db.prepare('UPDATE notes SET notebook_id = ? WHERE notebook_id = ?').run(other.id, id)
    this.db.prepare('DELETE FROM notebooks WHERE id = ?').run(id)
    writeTombstone(this.db, 'notebooks', id)
    return { ok: true, moved, notebookId: other.id }
  }

  saveNote(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `note-${randomUUID().slice(0, 12)}`
    const title = str(input?.title).trim().slice(0, 200) || '未命名笔记'
    const content = str(input?.content).slice(0, 500_000)
    const tags = cleanTags(input?.tags)
    const pinned = input?.pinned === true ? 1 : 0
    const wanted = str(input?.notebookId)
    const notebook = this.db.prepare('SELECT id, name, workspace_path FROM notebooks WHERE id = ?').get(wanted) as any
    const notebookId = notebook?.id ? String(notebook.id) : this.defaultNotebookId()
    const nb = notebook?.id ? notebook : this.db.prepare('SELECT id, name, workspace_path FROM notebooks WHERE id = ?').get(notebookId) as any
    const mapId = str(input?.mapId)
    const kind = ['module_design', 'product_design', 'feature_design'].includes(str(input?.kind)) ? str(input.kind) : ''
    const nodeId = str(input?.nodeId).slice(0, 64)
    const moduleId = str(input?.moduleId).slice(0, 64)
    /* doc_key：同 scope 的唯一键（重跑生成 = 更新同一篇）。未显式给出时按 kind+归属自动推导。 */
    let docKey = str(input?.docKey).slice(0, 160)
    if (docKey === '' && kind !== '') {
      if (kind === 'module_design' && moduleId !== '') docKey = `md:${moduleId}`
      else if (kind === 'feature_design' && nodeId !== '') docKey = `fd:${mapId}:${nodeId}`
      else if (kind === 'product_design') {
        /* 产品设计：单份用 pd:<产品>；分册用 pd:<产品>:<模块>，避免与模块设计文档的 md:<模块> 撞键 */
        const pid = str(input?.productId) || 'all'
        docKey = moduleId !== '' ? `pd:${pid}:${moduleId}` : `pd:${pid}`
      }
    }
    let existing = this.db.prepare('SELECT id, created_at, file_path FROM notes WHERE id = ?').get(id) as any
    /* 有 doc_key 时按它找既有笔记：幂等，避免 AI 重跑堆重复文档 */
    if (existing === undefined && docKey !== '') {
      existing = this.db.prepare('SELECT id, created_at, file_path FROM notes WHERE doc_key = ?').get(docKey) as any
    }
    const finalId = existing?.id !== undefined ? String(existing.id) : id
    const createdAt = existing?.created_at ?? now
    let filePath = ''
    try {
      filePath = syncNoteFile({ id, title, content }, nb)
    } catch (cause) {
      console.warn(`[dsh-workbench] 笔记文件写入失败：${String(cause)}`)
    }
    if (existing) {
      this.db.prepare('UPDATE notes SET notebook_id=?, title=?, content=?, tags=?, pinned=?, file_path=?, map_id=?, kind=?, node_id=?, module_id=?, doc_key=?, updated_at=? WHERE id=?')
        .run(notebookId, title, content, JSON.stringify(tags), pinned, filePath, mapId, kind, nodeId, moduleId, docKey, now, finalId)
      if (existing.file_path && existing.file_path !== filePath) removeFile(existing.file_path)
    } else {
      this.db.prepare('INSERT INTO notes(id, notebook_id, title, content, tags, pinned, file_path, map_id, kind, node_id, module_id, doc_key, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(finalId, notebookId, title, content, JSON.stringify(tags), pinned, filePath, mapId, kind, nodeId, moduleId, docKey, createdAt, now)
    }
    return toNote(this.db.prepare('SELECT * FROM notes WHERE id = ?').get(finalId))
  }

  deleteNote(id: string): void {
    const row = this.db.prepare('SELECT file_path FROM notes WHERE id = ?').get(id) as any
    if (row?.file_path) removeFile(String(row.file_path))
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    if (row !== undefined) writeTombstone(this.db, 'notes', id)
  }

  getExportConfig(): { exportDir: string; defaultExportDir: string } {
    return { exportDir: str(this.readMeta('export_dir')) || homedir(), defaultExportDir: homedir() }
  }

  setExportDir(raw: string): { exportDir: string; defaultExportDir: string } {
    const dir = normalizeExportDir(raw)
    this.writeMeta('export_dir', dir)
    return this.getExportConfig()
  }

  /**
   * 统一项目（projects 主表）。
   *
   * 背景：产品 / Bug / 测试 / 灵感原本各有一张「项目」表，字段几乎相同（name + workspace_path），
   * 但互不相通——门户按 workspace_path 只读聚合，用户在门户建了「产品」，进 Bug 页还要再建一次。
   *
   * 现在统一为一张 `projects` 主表：
   *  - 产品 / Bug 项目 / 测试项目 / 灵感项目 通过各自的 `project_id` 指向它（保留原表作为领域数据容器）；
   *  - 老数据迁移时按 workspace_path + name 归并，保证同一个工作区只对应一个统一项目；
   *  - 门户、Bug、测试、灵感的「项目」列表都从 `projects` 读，只有一份。
   */
  private migrateUnifiedProjects(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '', workspace_name TEXT NOT NULL DEFAULT '',
      archived_at TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_ws ON projects(workspace_path) WHERE workspace_path <> ''")
    /* 领域表挂统一项目 id（products 复用自身 id 作为 project_id，保持兼容） */
    const cols = (table: string): string[] => (this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => String(c.name))
    for (const table of ['products', 'bug_projects', 'test_projects']) {
      if (!cols(table).includes('project_id')) this.db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`)
    }
    const now = isoDateTimeSeconds()
    /* 收集四域的「项目」候选：按 workspace_path 归并（空路径按 name 归并） */
    const candidates: Array<{ name: string; workspacePath: string; createdAt?: string }> = []
    for (const row of this.db.prepare("SELECT name, workspace_path, created_at FROM products WHERE archived_at = ''").all() as any[]) {
      candidates.push({ name: String(row.name), workspacePath: String(row.workspace_path ?? ''), createdAt: row.created_at })
    }
    for (const row of this.db.prepare('SELECT name, workspace_path, created_at FROM bug_projects').all() as any[]) {
      const name = String(row.name).replace(/^测试：/, '')
      candidates.push({ name, workspacePath: String(row.workspace_path ?? ''), createdAt: row.created_at })
    }
    for (const row of this.db.prepare('SELECT name, workspace_path, created_at FROM test_projects').all() as any[]) {
      candidates.push({ name: String(row.name), workspacePath: String(row.workspace_path ?? ''), createdAt: row.created_at })
    }
    /* 灵感项目在独立库（idea-store）里；这里只处理主库三域，灵感侧在 idea 模块里对齐 */
    const byKey = new Map<string, { id: string; name: string; workspacePath: string; createdAt: string }>()
    for (const item of candidates) {
      const key = item.workspacePath !== '' ? `ws:${item.workspacePath}` : `name:${item.name}`
      if (byKey.has(key)) continue
      const existing = this.db.prepare(
        item.workspacePath !== ''
          ? 'SELECT id FROM projects WHERE workspace_path = ?'
          : 'SELECT id FROM projects WHERE workspace_path = \'\' AND name = ?',
      ).get(...(item.workspacePath !== '' ? [item.workspacePath] : [item.name])) as any
      if (existing !== undefined) { byKey.set(key, { id: String(existing.id), name: item.name, workspacePath: item.workspacePath, createdAt: item.createdAt ?? now }); continue }
      const id = `prj-${randomUUID().slice(0, 12)}`
      this.db.prepare('INSERT INTO projects(id, name, description, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, item.name.slice(0, 100), '', item.workspacePath, basename(item.workspacePath || ''), item.createdAt ?? now, now)
      byKey.set(key, { id, name: item.name, workspacePath: item.workspacePath, createdAt: item.createdAt ?? now })
    }
    /* 回填各域 project_id */
    const pick = (workspacePath: string, name: string): string => {
      const key = workspacePath !== '' ? `ws:${workspacePath}` : `name:${name}`
      return byKey.get(key)?.id ?? ''
    }
    for (const row of this.db.prepare("SELECT id, name, workspace_path, project_id FROM products WHERE project_id = ''").all() as any[]) {
      const pid = pick(String(row.workspace_path ?? ''), String(row.name))
      if (pid !== '') this.db.prepare('UPDATE products SET project_id = ? WHERE id = ?').run(pid, row.id)
    }
    for (const row of this.db.prepare("SELECT id, name, workspace_path, project_id FROM bug_projects WHERE project_id = ''").all() as any[]) {
      const pid = pick(String(row.workspace_path ?? ''), String(row.name).replace(/^测试：/, ''))
      if (pid !== '') this.db.prepare('UPDATE bug_projects SET project_id = ? WHERE id = ?').run(pid, row.id)
    }
    for (const row of this.db.prepare("SELECT id, name, workspace_path, project_id FROM test_projects WHERE project_id = ''").all() as any[]) {
      const pid = pick(String(row.workspace_path ?? ''), String(row.name))
      if (pid !== '') this.db.prepare('UPDATE test_projects SET project_id = ? WHERE id = ?').run(pid, row.id)
    }
    /* 关键：为每个「有工作区但还没有 Bug 项目」的统一项目补建一个 Bug 项目。
       否则迁移完门户能选项目、Bug 页却是空的（用户还得手建）。每次启动都检查，兼顾存量数据。 */
    for (const project of this.db.prepare("SELECT id, name, workspace_path FROM projects WHERE workspace_path <> '' AND archived_at = ''").all() as any[]) {
      const has = this.db.prepare('SELECT id FROM bug_projects WHERE project_id = ? LIMIT 1').get(project.id) as any
      if (has !== undefined) continue
      const ts = isoDateTimeSeconds()
      this.db.prepare('INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(`bugp-${randomUUID().slice(0, 12)}`, String(project.name), String(project.workspace_path), basename(String(project.workspace_path)), String(project.id), ts, ts)
    }
  }

  /* ---------- 统一项目 CRUD ---------- */
  listProjects(includeArchived = false): any[] {
    const sql = includeArchived
      ? 'SELECT * FROM projects ORDER BY sort_order, created_at'
      : "SELECT * FROM projects WHERE archived_at = '' ORDER BY sort_order, created_at"
    return (this.db.prepare(sql).all() as any[]).map(toProject)
  }

  getProject(id: string): any | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(str(id)) as any
    return row === undefined ? undefined : toProject(row)
  }

  /** 按工作区路径取/建统一项目（产品、Bug、测试、灵感建域对象时共用）。 */
  ensureProject(workspacePath: string, name: string): any {
    /* 路径校验失败时降级为「无工作区项目」，避免历史坏路径把产品/测试的保存整体搞挂 */
    let ws = ''
    try { ws = normalizeWorkspacePath(workspacePath) } catch { ws = '' }
    const existing = ws !== ''
      ? this.db.prepare('SELECT * FROM projects WHERE workspace_path = ?').get(ws) as any
      : this.db.prepare("SELECT * FROM projects WHERE workspace_path = '' AND name = ?").get(str(name).slice(0, 100)) as any
    if (existing !== undefined) return toProject(existing)
    const now = isoDateTimeSeconds()
    const id = `prj-${randomUUID().slice(0, 12)}`
    this.db.prepare('INSERT INTO projects(id, name, description, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, str(name).slice(0, 100) || '未命名项目', '', ws, basename(ws), now, now)
    return toProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
  }

  /** 保存统一项目；改名会同步到各域展示（各域仍保留自己的 name 作领域内叫法）。 */
  saveProject(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id)
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('项目名称不能为空')
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    const existing = id !== '' ? this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any : undefined
    if (existing !== undefined) {
      this.db.prepare('UPDATE projects SET name=?, description=?, workspace_path=?, workspace_name=?, sort_order=?, updated_at=? WHERE id=?')
        .run(name, str(input?.description).slice(0, 5000), workspacePath, basename(workspacePath), Math.max(0, Math.round(Number(input?.sortOrder) || 0)), now, id)
      return toProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id))
    }
    /* 同工作区已存在则复用（避免门户与领域各建一个） */
    const dup = workspacePath !== '' ? this.db.prepare('SELECT * FROM projects WHERE workspace_path = ?').get(workspacePath) as any : undefined
    if (dup !== undefined) {
      if (str(input?.description) !== '') this.db.prepare('UPDATE projects SET description=?, updated_at=? WHERE id=?').run(str(input.description).slice(0, 5000), now, dup.id)
      return toProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(dup.id))
    }
    const newId = id !== '' ? id : `prj-${randomUUID().slice(0, 12)}`
    this.db.prepare('INSERT INTO projects(id, name, description, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(newId, name, str(input?.description).slice(0, 5000), workspacePath, basename(workspacePath), now, now)
    return toProject(this.db.prepare('SELECT * FROM projects WHERE id = ?').get(newId))
  }

  deleteProject(id: string): void {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(str(id)) as any
    if (row === undefined) return
    /* 解除各域引用（不删领域数据），避免悬空 */
    for (const table of ['products', 'bug_projects', 'test_projects']) {
      this.db.prepare(`UPDATE ${table} SET project_id = '' WHERE project_id = ?`).run(str(id))
    }
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(str(id))
  }

  /** 项目概览：统一项目 → 各域对象与计数（门户卡片直接用这个）。 */
  listProjectOverviews(includeArchived = false): any[] {
    const projects = this.listProjects(includeArchived)
    return projects.map(project => {
      const products = (this.db.prepare('SELECT * FROM products WHERE project_id = ?').all(project.id) as any[]).map(toProduct)
      const bugProjects = (this.db.prepare('SELECT * FROM bug_projects WHERE project_id = ?').all(project.id) as any[]).map(toBugProject)
      const testProjects = (this.db.prepare('SELECT * FROM test_projects WHERE project_id = ?').all(project.id) as any[]).map(toTestProject)
      const bugCount = Number((this.db.prepare('SELECT COUNT(*) AS n FROM bugs WHERE project_id IN (SELECT id FROM bug_projects WHERE project_id = ?)').get(project.id) as any)?.n ?? 0)
      return { project, products, bugProjects, testProjects, counts: { products: products.length, bugProjects: bugProjects.length, testProjects: testProjects.length, bugs: bugCount } }
    })
  }

  /* ---------- 产品（导图 / 设计笔记 / Demo） ---------- */
  listProducts(includeArchived = false): any[] {
    const sql = includeArchived
      ? 'SELECT * FROM products ORDER BY updated_at DESC, id'
      : "SELECT * FROM products WHERE archived_at = '' ORDER BY updated_at DESC, id"
    return this.db.prepare(sql).all().map(toProduct)
  }

  saveProduct(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `prod-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('产品名称不能为空')
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    const existing = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any
    let notebookId = str(input?.notebookId) || str(existing?.notebook_id)
    if (notebookId === '') {
      const nb = this.saveNotebook({ name: `产品：${name}`, workspacePath })
      notebookId = nb.id
    } else {
      this.saveNotebook({ id: notebookId, name: `产品：${name}`, workspacePath })
    }
    let mindmap = typeof input?.mindmap === 'string' ? input.mindmap : (existing?.mindmap ?? '{"nodes":[]}')
    try {
      const parsed = JSON.parse(mindmap) as any
      if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        parsed.nodes = [{ id: 'root', label: name, type: 'root', parentId: null, note: '' }]
        mindmap = JSON.stringify(parsed)
      }
    } catch { mindmap = JSON.stringify({ nodes: [{ id: 'root', label: name, type: 'root', parentId: null, note: '' }] }) }
    const styles = Array.isArray(input?.styles) ? input.styles : safeJson(existing?.styles, [])
    if (existing) {
      this.db.prepare('UPDATE products SET name=?, description=?, workspace_path=?, notebook_id=?, mindmap=?, styles=?, updated_at=? WHERE id=?')
        .run(name, str(input?.description).slice(0, 5000), workspacePath, notebookId, mindmap, JSON.stringify(styles), now, id)
    } else {
      this.db.prepare('INSERT INTO products(id, name, description, workspace_path, notebook_id, mindmap, styles, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, name, str(input?.description).slice(0, 5000), workspacePath, notebookId, mindmap, JSON.stringify(styles), existing?.created_at ?? now, now)
    }
    /* 统一项目：产品建/改时确保同一工作区有对应 project，并回填 project_id */
    try {
      const unified = this.ensureProject(workspacePath, name)
      this.db.prepare('UPDATE products SET project_id = ? WHERE id = ?').run(unified.id, id)
      /* 同一项目下若还没有 Bug 项目，顺手建一个（修掉「门户建了项目，Bug 页还要再建」） */
      const hasBug = this.db.prepare('SELECT id FROM bug_projects WHERE project_id = ? LIMIT 1').get(unified.id) as any
      if (hasBug === undefined && workspacePath !== '') {
        const bugId = `bugp-${randomUUID().slice(0, 12)}`
        const ts = isoDateTimeSeconds()
        this.db.prepare('INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
          .run(bugId, name, workspacePath, basename(workspacePath), unified.id, ts, ts)
      }
    } catch (cause) { console.warn(`[dsh-workbench] 统一项目关联失败：${String(cause)}`) }
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any
    /* 新产品即有首张导图（v2 图），避免「导图列表为空」的空窗 */
    if (this.defaultMapId(id) === '') {
      this.saveProductMap({ productId: id, name: '主导图', description: '', graph: productGraphFromV1(mindmap, name).graph })
    }
    this.saveProductMindmapFile(row)
    return toProduct(row)
  }

  private saveProductMindmapFile(product: any): void {
    try {
      const workspace = str(product?.workspace_path).trim()
      if (workspace === '') return
      const dir = join(workspace, '.dsh-workbench', 'products', product.id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'mindmap.json'), String(product.mindmap ?? '{"nodes":[]}'), 'utf8')
      // 多导图：每张导图各自一份 maps/<mapId>.json
      for (const map of this.listProductMaps(product.id)) this.writeMapFile(product.id, map)
    } catch (cause) {
      console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`)
    }
  }

  saveProductMindmap(productId: string, mindmap: string): any {
    const product = this.db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any
    if (!product) throw new Error('产品不存在')
    const mapId = this.defaultMapId(productId)
    const map = mapId === '' ? undefined : this.getProductMap(mapId)
    if (map !== undefined) {
      /* v1 端点与第一张导图双向镜像：转成 v2 图写入导图，products.mindmap 由镜像回写 */
      this.saveProductMap({ id: map.id, productId, name: map.name, description: map.description, graph: productGraphFromV1(mindmap, product.name).graph })
    } else {
      const now = isoDateTimeSeconds()
      this.db.prepare('UPDATE products SET mindmap=?, updated_at=? WHERE id=?').run(mindmap, now, productId)
    }
    const next = this.db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any
    this.saveProductMindmapFile(next)
    return toProduct(next)
  }

  /* ---------- 多导图（一个产品可有多张导图） ---------- */
  listProductMaps(productId: string): any[] {
    return (this.db.prepare('SELECT * FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at').all(productId) as any[]).map(toProductMap)
  }
  getProductMap(mapId: string): any | undefined {
    const row = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
    return row === undefined ? undefined : toProductMap(row)
  }
  /** 产品的默认导图（第一张），供未指定 mapId 的旧调用使用。 */
  defaultMapId(productId: string): string {
    const row = this.db.prepare('SELECT id FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at LIMIT 1').get(productId) as any
    return String(row?.id ?? '')
  }
  saveProductMap(input: any): any {
    const now = isoDateTimeSeconds()
    const productId = str(input?.productId)
    const product = this.db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any
    if (!product) throw new Error('产品不存在')
    const name = str(input?.name).trim().slice(0, 80) || '未命名导图'
    const description = str(input?.description).slice(0, 2000)
    let id = str(input?.id)
    const existing = id === '' ? undefined : this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(id) as any
    /* 形状守卫：调用方误把 { graph, issues } 之类包装对象当图传入时，normalize 会静默退化成
       「只剩根节点」（2026-10-26 导入空图 bug 的放大器）。这里显式报错，避免数据被悄悄写空。 */
    if (input?.graph !== undefined && input?.graph !== null && !Array.isArray(input.graph?.nodes)) {
      throw new Error('导图 graph 形状不正确：缺少 nodes 数组（是否误传了 { graph, issues } 包装对象？）')
    }
    /* 图：v2 graph 优先；旧客户端传 mindmap(v1) 就转换；都没传沿用既有图。 */
    const incoming = input?.graph ?? (typeof input?.mindmap === 'string' ? productGraphFromV1(input.mindmap, name).graph : undefined)
    const base = incoming ?? (existing !== undefined ? mapGraphOf(existing) : productGraphFromV1(normalizeMindmap(undefined, name), name).graph)
    const normalized = normalizeProductGraph(base, { title: name })
    if (normalized.issues.length > 0) console.warn(`[dsh-workbench] 导图规范化：${normalized.issues.map(i => i.message).join('；')}`)
    const graph = this.pruneExternalRefs(productId, normalized.graph)
    const graphJson = JSON.stringify(graph)
    const mindmap = productGraphToV1(graph)
    const source = str(input?.source).trim().slice(0, 12) || str(existing?.source) || 'manual'
    const sourceRef = str(input?.sourceRef).trim().slice(0, 120) || str(existing?.source_ref) || ''
    const summary = str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary) || str(existing?.summary) || ''
    if (existing === undefined) {
      id = `map-${randomUUID().slice(0, 12)}`
      const order = Number((this.db.prepare('SELECT COUNT(*) AS n FROM product_maps WHERE product_id = ?').get(productId) as any)?.n ?? 0)
      this.db.prepare(`INSERT INTO product_maps(id, product_id, name, description, mindmap, sort_order, created_at, updated_at, graph_json, draft_rev, current_version_id, source, source_ref, summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, productId, name, description, mindmap, order, now, now, graphJson, 0, '', source, sourceRef, summary)
    } else {
      this.db.prepare('UPDATE product_maps SET name=?, description=?, mindmap=?, graph_json=?, source=?, source_ref=?, summary=?, updated_at=? WHERE id=?')
        .run(name, description, mindmap, graphJson, source, sourceRef, summary, now, id)
    }
    this.syncFirstMapMirror(productId)
    const saved = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(id) as any
    this.writeMapFile(productId, saved)
    this.cleanInboundRefs(productId, id, graph)
    return toProductMap(saved)
  }

  /** 跨图引用校验：relate 边指向 <mapId>:<nodeId> 时，目标导图必须是同产品的另一张图。 */
  private pruneExternalRefs(productId: string, graph: ProductMapGraph): ProductMapGraph {
    const ids = new Set((this.db.prepare('SELECT id FROM product_maps WHERE product_id = ?').all(productId) as any[]).map(r => String(r.id)))
    const edges = graph.edges.filter(edge => {
      if (edge.kind !== 'relate') return true
      const ref = parseExternalRef(String(edge.to))
      if (ref === null) return true
      if (!ids.has(ref.mapId)) {
        console.warn(`[dsh-workbench] 跨图引用目标不存在，已丢弃：${edge.to}`)
        return false
      }
      return true
    })
    return edges.length === graph.edges.length ? graph : { ...graph, edges }
  }

  /** 入向跨图引用清理：本图删掉节点后，其他导图指向 <mapId>:<nodeId> 的引用一并移除，不留悬空。 */
  private cleanInboundRefs(productId: string, mapId: string, graph: ProductMapGraph): void {
    try {
      const alive = new Set(graph.nodes.map(n => n.id))
      const others = this.db.prepare('SELECT * FROM product_maps WHERE product_id = ? AND id <> ?').all(productId, mapId) as any[]
      for (const other of others) {
        const g = mapGraphOf(other)
        const edges = g.edges.filter(e => !(e.kind === 'relate' && String(e.to).startsWith(`${mapId}:`) && !alive.has(String(e.to).slice(mapId.length + 1))))
        if (edges.length !== g.edges.length) {
          const next = { ...g, edges }
          this.db.prepare('UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=draft_rev+1, updated_at=? WHERE id=?')
            .run(JSON.stringify(next), productGraphToV1(next), isoDateTimeSeconds(), other.id)
          this.writeMapFile(productId, { id: other.id, graph_json: JSON.stringify(next), mindmap: productGraphToV1(next) })
        }
      }
    } catch (cause) { console.warn(`[dsh-workbench] 入向引用清理失败：${String(cause)}`) }
  }

  /**
   * 追加/更新一个导图节点（供 AI 工具调用）。
   * 语义：按 parentId 挂到树上；同名同 kind 且同父则更新，否则新增。
   * 走 saveMapDraft，保证 draft_rev / 版本镜像 / 文件镜像一致。
   */
  addMapNode(input: any): any {
    const productId = str(input?.productId)
    const mapId = str(input?.mapId)
    const row = this.db.prepare('SELECT * FROM product_maps WHERE id = ? AND product_id = ?').get(mapId, productId) as any
    if (row === undefined) throw new Error('导图不存在或不属于该产品')
    const name = str(input?.name).trim().slice(0, 24)
    if (name === '') throw new Error('节点名称不能为空')
    const kind = (['module', 'business', 'feature', 'requirement'].includes(str(input?.kind)) ? str(input.kind) : 'feature') as ProductMapNode['kind']
    const platform = ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input.platform) as NonNullable<ProductMapNode['platform']> : undefined
    const parentId = str(input?.parentId)
    const graph = mapGraphOf(row)
    const existing = graph.nodes.find(n => n.label === name && n.kind === kind
      && (parentId === '' ? (n.parentId === null || n.parentId === graph.rootId) : n.parentId === parentId))
    if (existing !== undefined) {
      if (platform !== undefined) existing.platform = platform as any
      if (str(input?.detail) !== '') existing.detail = str(input.detail).slice(0, 200)
      return this.saveMapDraft({ mapId, graph }).map
    }
    const id = `pn-${randomUUID().slice(2, 8)}`
    graph.nodes.push({
      id, label: name, kind,
      parentId: parentId === '' ? graph.rootId : parentId,
      status: 'kept',
      ...(platform === undefined ? {} : { platform }),
      ...(str(input?.detail) === '' ? {} : { detail: str(input.detail).slice(0, 200) }),
    })
    return this.saveMapDraft({ mapId, graph }).map
  }

  /** 草稿保存：乐观并发（rev 不一致抛 draft_conflict，携带当前草稿）。 */
  saveMapDraft(input: any): { rev: number; map: any } {
    const mapId = str(input?.mapId)
    const row = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
    if (!row) throw new Error('导图不存在')
    const current = Number(row.draft_rev ?? 0)
    if (input?.rev !== undefined && Number(input.rev) !== current) {
      const error: any = new Error('draft_conflict')
      error.code = 'draft_conflict'
      error.current = toProductMap(row)
      throw error
    }
    if (input?.graph !== undefined && input?.graph !== null && !Array.isArray(input.graph?.nodes)) {
      throw new Error('导图 graph 形状不正确：缺少 nodes 数组（是否误传了 { graph, issues } 包装对象？）')
    }
    const normalized = normalizeProductGraph(input?.graph, { title: row.name })
    const graph = this.pruneExternalRefs(row.product_id, normalized.graph)
    if (productGraphBytes(graph) > PRODUCT_GRAPH_LIMITS.graph) throw new Error('导图数据过大')
    const next = current + 1
    this.db.prepare('UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(graph), productGraphToV1(graph), next, isoDateTimeSeconds(), mapId)
    this.syncFirstMapMirror(row.product_id)
    const saved = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
    this.writeMapFile(row.product_id, saved)
    this.cleanInboundRefs(row.product_id, mapId, graph)
    return { rev: next, map: toProductMap(saved) }
  }

  /* ------------------------------ 导图版本（参照灵感） ------------------------------ */

  private mapVersionRow(row: any): any {
    return {
      id: row.id,
      mapId: row.map_id,
      seq: Number(row.seq ?? 0),
      label: row.label ?? `v${row.seq}`,
      source: row.source ?? 'manual',
      sourceRef: row.source_ref ?? '',
      summary: row.summary ?? '',
      nodeCount: Number(row.node_count ?? 0),
      edgeCount: Number(row.edge_count ?? 0),
      createdAt: row.created_at,
    }
  }

  listMapVersions(mapId: string): any[] {
    return (this.db.prepare('SELECT * FROM product_map_versions WHERE map_id = ? ORDER BY seq DESC').all(mapId) as any[]).map(row => this.mapVersionRow(row))
  }

  getMapVersion(id: string): any | undefined {
    const row = this.db.prepare('SELECT * FROM product_map_versions WHERE id = ?').get(id) as any
    if (row === undefined) return undefined
    let graph: ProductMapGraph
    try { graph = JSON.parse(String(row.graph_json)) as ProductMapGraph } catch { graph = productGraphFromV1('{"nodes":[]}').graph }
    return { ...this.mapVersionRow(row), graph }
  }

  /** 存档版本：图写入版本序列并成为当前草稿（手动 / 导入 / AI / 回滚统一走这里）。 */
  createMapVersion(input: any): any {
    const mapId = str(input?.mapId)
    const row = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
    if (!row) throw new Error('导图不存在')
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM product_map_versions WHERE map_id = ?').get(mapId) as any)?.n ?? 0)
    if (count >= PRODUCT_GRAPH_LIMITS.versions) throw new Error(`每个导图最多 ${PRODUCT_GRAPH_LIMITS.versions} 个版本，请先删除旧版本`)
    if (input?.graph !== undefined && input?.graph !== null && !Array.isArray(input.graph?.nodes)) {
      throw new Error('导图 graph 形状不正确：缺少 nodes 数组（是否误传了 { graph, issues } 包装对象？）')
    }
    const normalized = normalizeProductGraph(input?.graph ?? mapGraphOf(row), { title: row.name })
    const graph = this.pruneExternalRefs(row.product_id, normalized.graph)
    if (productGraphBytes(graph) > PRODUCT_GRAPH_LIMITS.graph) throw new Error('导图数据过大')
    const graphJson = JSON.stringify(graph)
    const seq = Number((this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM product_map_versions WHERE map_id = ?').get(mapId) as any)?.s ?? 0) + 1
    const id = `mv-${randomUUID().slice(0, 12)}`
    const ts = isoDateTimeSeconds()
    this.db.prepare('INSERT INTO product_map_versions(id, map_id, seq, label, source, source_ref, summary, graph_json, node_count, edge_count, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        id, mapId, seq,
        clampGraphText(input?.label, PRODUCT_GRAPH_LIMITS.labelLong) || `v${seq}`,
        ['manual', 'outline', 'idea', 'ai', 'rollback', 'migration'].includes(str(input?.source)) ? str(input?.source) : 'manual',
        str(input?.sourceRef).slice(0, 120),
        str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary),
        graphJson, graph.nodes.length, graph.edges.length, ts,
      )
    this.db.prepare('UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=draft_rev+1, current_version_id=?, updated_at=? WHERE id=?')
      .run(graphJson, productGraphToV1(graph), id, ts, mapId)
    this.syncFirstMapMirror(row.product_id)
    const saved = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
    this.writeMapFile(row.product_id, saved)
    this.cleanInboundRefs(row.product_id, mapId, graph)
    return this.mapVersionRow(this.db.prepare('SELECT * FROM product_map_versions WHERE id = ?').get(id))
  }

  deleteMapVersion(id: string): void {
    const row = this.db.prepare('SELECT * FROM product_map_versions WHERE id = ?').get(id) as any
    if (!row) return
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM product_map_versions WHERE map_id = ?').get(row.map_id) as any)?.n ?? 0)
    if (count <= 1) throw new Error('至少保留一个版本')
    this.db.prepare('DELETE FROM product_map_versions WHERE id = ?').run(id)
    const map = this.db.prepare('SELECT current_version_id FROM product_maps WHERE id = ?').get(row.map_id) as any
    if (map?.current_version_id === id) {
      const latest = this.db.prepare('SELECT id FROM product_map_versions WHERE map_id = ? ORDER BY seq DESC LIMIT 1').get(row.map_id) as any
      this.db.prepare('UPDATE product_maps SET current_version_id = ? WHERE id = ?').run(latest?.id ?? '', row.map_id)
    }
  }

  /** 回滚：把该版本图写回草稿并记一条 rollback 版本，历史不丢。 */
  rollbackMapVersion(mapId: string, versionId: string): any {
    const version = this.getMapVersion(versionId)
    if (!version || version.mapId !== mapId) throw new Error('版本不存在')
    return this.createMapVersion({
      mapId,
      graph: version.graph,
      source: 'rollback',
      label: `回滚到 v${version.seq}`,
      summary: `从 v${version.seq} 恢复`,
    })
  }

  /** 每张导图镜像到工作区 maps/<mapId>.json（v2 图；mindmap.json 仍是 v1 兼容镜像）。 */
  private writeMapFile(productId: string, map: any): void {
    try {
      const product = this.db.prepare('SELECT workspace_path FROM products WHERE id = ?').get(productId) as any
      const workspace = str(product?.workspace_path).trim()
      if (workspace === '' || !map) return
      const dir = join(workspace, '.dsh-workbench', 'products', productId, 'maps')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${map.id}.json`), JSON.stringify(mapGraphOf(map)), 'utf8')
    } catch (cause) { console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`) }
  }
  deleteProductMap(mapId: string): void {
    const row = this.db.prepare('SELECT * FROM product_maps WHERE id = ?').get(mapId) as any
    if (!row) return
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM product_maps WHERE product_id = ?').get(row.product_id) as any)?.n ?? 0)
    if (count <= 1) throw new Error('至少保留一张导图')
    this.db.prepare('DELETE FROM product_maps WHERE id = ?').run(mapId)
    this.db.prepare('DELETE FROM product_map_versions WHERE map_id = ?').run(mapId)
    /* 归属清理：模块/笔记/Demo 失去导图归属（置空 map_id，而不是留下悬空 id） */
    for (const table of ['modules', 'product_demos', 'notes']) {
      this.db.prepare(`UPDATE ${table} SET map_id = '' WHERE map_id = ?`).run(mapId)
    }
    /* 跨图引用级联清理：其他导图里指向本图的引用边一并移除，不留悬空。 */
    const others = this.db.prepare('SELECT * FROM product_maps WHERE product_id = ?').all(row.product_id) as any[]
    for (const other of others) {
      const graph = mapGraphOf(other)
      const edges = graph.edges.filter(e => !(e.kind === 'relate' && String(e.to).startsWith(`${mapId}:`)))
      if (edges.length !== graph.edges.length) {
        const next = { ...graph, edges }
        this.db.prepare('UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=draft_rev+1, updated_at=? WHERE id=?')
          .run(JSON.stringify(next), productGraphToV1(next), isoDateTimeSeconds(), other.id)
        /* 同步文件镜像，避免工作区里留着指向已删导图的悬空引用 */
        this.writeMapFile(row.product_id, { id: other.id, graph_json: JSON.stringify(next), mindmap: productGraphToV1(next) })
      }
    }
    this.syncFirstMapMirror(row.product_id)
    try {
      const product = this.db.prepare('SELECT workspace_path FROM products WHERE id = ?').get(row.product_id) as any
      const workspace = str(product?.workspace_path).trim()
      if (workspace !== '') removeFile(join(workspace, '.dsh-workbench', 'products', row.product_id, 'maps', `${mapId}.json`))
    } catch { /* 文件删除失败不影响库 */ }
  }
  /** products.mindmap 作为第一张导图的镜像，旧版本读取时仍能拿到导图。 */
  private syncFirstMapMirror(productId: string): void {
    const first = this.db.prepare('SELECT mindmap FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at LIMIT 1').get(productId) as any
    if (first) this.db.prepare('UPDATE products SET mindmap = ? WHERE id = ?').run(first.mindmap, productId)
  }

  deleteProduct(id: string): void {
    const product = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any
    if (product?.workspace_path) {
      try { rmSync(join(str(product.workspace_path), '.dsh-workbench', 'products', id), { recursive: true, force: true }) } catch { /* ignore */ }
    }
    this.db.prepare('DELETE FROM product_demos WHERE product_id = ?').run(id)
    this.db.prepare('DELETE FROM product_demo_progress WHERE product_id = ?').run(id)
    this.db.prepare('DELETE FROM product_map_versions WHERE map_id IN (SELECT id FROM product_maps WHERE product_id = ?)').run(id)
    this.db.prepare('DELETE FROM product_maps WHERE product_id = ?').run(id)
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id)
  }

  listProductDemos(productId?: string, mapId?: string): any[] {
    const map = str(mapId)
    const rows = productId
      ? (map === '' || map === 'all'
        ? this.db.prepare('SELECT * FROM product_demos WHERE product_id = ? ORDER BY created_at DESC').all(productId)
        : this.db.prepare('SELECT * FROM product_demos WHERE product_id = ? AND map_id = ? ORDER BY created_at DESC').all(productId, map))
      : this.db.prepare('SELECT * FROM product_demos ORDER BY created_at DESC').all()
    return rows.map(toProductDemo)
  }

  getProductDemo(id: string): any {
    const row = this.db.prepare('SELECT * FROM product_demos WHERE id = ?').get(id) as any
    return row ? toProductDemo(row) : undefined
  }

  saveProductDemo(input: any): any {
    const product = this.db.prepare('SELECT * FROM products WHERE id = ?').get(str(input?.productId)) as any
    if (!product) throw new Error('产品不存在')
    const mapId = str(input?.mapId) || this.defaultMapId(product.id)
    const workspace = str(product.workspace_path).trim()
    if (workspace === '') throw new Error('产品未关联工作区')
    const style = str(input?.style).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'clean'
    const scope = str(input?.scope) === 'feature' ? 'feature' : 'all'
    const featureId = scope === 'feature' ? str(input?.featureId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) : ''
    const platform = ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all'
    const kind = str(input?.kind) === 'system' ? 'system' : 'page'
    const html = str(input?.html)
    if (html.trim() === '') throw new Error('Demo HTML 为空')
    const id = `demo-${randomUUID().slice(0, 12)}`
    const dir = join(workspace, '.dsh-workbench', 'products', product.id, 'demo', style)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${scope === 'feature' ? featureId : 'all'}-${id.slice(-6)}.html`)
    writeFileSync(path, html.slice(0, 2_000_000), 'utf8')
    const now = isoDateTimeSeconds()
    this.db.prepare('INSERT INTO product_demos(id, product_id, style, scope, feature_id, title, file_path, created_at, platform, kind, status, map_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, product.id, style, scope, featureId, str(input?.title) || `${product.name} · ${style} · ${scope}`, path, now, platform, kind, 'ready', mapId)
    return toProductDemo(this.db.prepare('SELECT * FROM product_demos WHERE id = ?').get(id))
  }

  /* ---------- Demo 进度 ---------- */

  getDemoProgress(productId: string): any {
    const row = this.db.prepare('SELECT * FROM product_demo_progress WHERE product_id = ?').get(str(productId)) as any
    return row ? toDemoProgress(row) : undefined
  }

  saveDemoProgress(input: any): any {
    const productId = str(input?.productId)
    if (productId === '') throw new Error('缺少 productId')
    const id = `dp-${productId}`
    const now = isoDateTimeSeconds()
    const status = ['running', 'done', 'failed'].includes(str(input?.status)) ? str(input?.status) : 'running'
    const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0)
    const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0)
    const message = str(input?.message).slice(0, 500)
    const existing = this.db.prepare('SELECT log FROM product_demo_progress WHERE id = ?').get(id) as any
    const log = jsonList(existing?.log)
    if (message !== '') log.push({ step, message, at: now })
    const capped = JSON.stringify(log.slice(-50))
    this.db.prepare(`INSERT INTO product_demo_progress(id, product_id, demo_id, step, total, status, message, log, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET demo_id=excluded.demo_id, step=excluded.step, total=excluded.total, status=excluded.status, message=excluded.message, log=excluded.log, updated_at=excluded.updated_at`)
      .run(id, productId, str(input?.demoId).slice(0, 60), step, total, status, message, capped, now)
    return toDemoProgress(this.db.prepare('SELECT * FROM product_demo_progress WHERE id = ?').get(id))
  }

  deleteProductDemo(id: string): void {
    const row = this.db.prepare('SELECT * FROM product_demos WHERE id = ?').get(id) as any
    if (row?.file_path) { try { rmSync(str(row.file_path), { force: true }) } catch { /* ignore */ } }
    this.db.prepare('DELETE FROM product_demos WHERE id = ?').run(id)
  }

  /** 设计文档清单：按 kind 分组（module_design / product_design / feature_design）。 */
  listDesignDocs(productId: string): any {
    const rows = this.db.prepare("SELECT * FROM notes WHERE kind <> '' AND notebook_id IN (SELECT notebook_id FROM products WHERE id = ?) ORDER BY kind, updated_at DESC").all(str(productId)) as any[]
    const map = { module_design: [] as any[], product_design: [] as any[], feature_design: [] as any[] }
    for (const row of rows) {
      const note = toNote(row)
      const bucket = map[note.kind as keyof typeof map]
      if (bucket !== undefined) bucket.push(note)
    }
    return map
  }

  publishProductNote(input: any): any {
    const product = this.db.prepare('SELECT * FROM products WHERE id = ?').get(str(input?.productId)) as any
    if (!product) throw new Error('产品不存在')
    const featureId = str(input?.featureId)
    const moduleId = str(input?.moduleId)
    const kind = ['module_design', 'product_design', 'feature_design'].includes(str(input?.kind))
      ? str(input.kind)
      : (moduleId !== '' ? 'module_design' : featureId !== '' ? 'feature_design' : 'product_design')
    const mapId = str(input?.mapId) || this.defaultMapId(product.id)
    const tags = cleanTags([
      ...(list(input?.tags)), '产品', product.name,
      ...(featureId ? [featureId] : []), ...(moduleId ? [moduleId] : []),
      ...(str(input?.platform) ? [`platform:${str(input.platform)}`] : []),
      `design:${kind}`,
    ])
    const note = this.saveNote({
      notebookId: product.notebook_id,
      title: str(input?.title) || (kind === 'module_design' ? '模块设计文档' : kind === 'product_design' ? '产品设计文档' : '产品设计笔记'),
      content: str(input?.content),
      tags, mapId, kind,
      nodeId: featureId, moduleId,
      productId: product.id,
    })
    if (moduleId !== '') {
      this.db.prepare('UPDATE modules SET note_id=?, status=?, updated_at=? WHERE id=? AND product_id=?')
        .run(note.id, 'designed', isoDateTimeSeconds(), moduleId, product.id)
    }
    return note
  }

  /** 归档 / 取消归档：products / modules / notes 通用。 */
  setArchived(target: 'products' | 'modules' | 'notes', id: string, archived: boolean): void {
    const table = target === 'products' ? 'products' : target === 'modules' ? 'modules' : 'notes'
    if (!this.db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(str(id))) throw new Error('目标不存在')
    this.db.prepare(`UPDATE ${table} SET archived_at=?, updated_at=? WHERE id=?`)
      .run(archived ? isoDateTimeSeconds() : '', isoDateTimeSeconds(), str(id))
  }

  /* ---------- 产品素材源（网站 / 截图 / 文字）：AI 提炼导图的输入 ---------- */
  listProductInputs(productId: string, mapId = ''): any[] {
    const rows = str(mapId) === '' || str(mapId) === 'all'
      ? this.db.prepare('SELECT * FROM product_inputs WHERE product_id = ? ORDER BY created_at').all(str(productId))
      : this.db.prepare('SELECT * FROM product_inputs WHERE product_id = ? AND (map_id = ? OR map_id = \'\') ORDER BY created_at').all(str(productId), str(mapId))
    return (rows as any[]).map(row => ({
      id: row.id, productId: row.product_id, mapId: row.map_id ?? '', kind: row.kind,
      url: row.url ?? '', filePath: row.file_path ?? '', note: row.note ?? '', label: row.label ?? '',
      mime: row.mime ?? '', width: Number(row.width ?? 0), height: Number(row.height ?? 0),
      size: Number(row.size ?? 0), createdAt: row.created_at,
    }))
  }

  /** 新增素材：url / image（已落盘的截图）/ text */
  addProductInput(input: any): any {
    const productId = str(input?.productId)
    if (!this.db.prepare('SELECT id FROM products WHERE id = ?').get(productId)) throw new Error('产品不存在')
    const kind = ['url', 'image', 'text'].includes(str(input?.kind)) ? str(input?.kind) : 'url'
    const url = str(input?.url).slice(0, 1000)
    if (kind === 'url') {
      if (!/^https?:\/\//i.test(url)) throw new Error('链接必须以 http(s):// 开头')
    }
    if (kind === 'image' && str(input?.filePath) === '') throw new Error('截图缺少文件路径')
    const id = `pin-${randomUUID().slice(0, 12)}`
    const now = isoDateTimeSeconds()
    this.db.prepare(`INSERT INTO product_inputs(id, product_id, map_id, kind, url, file_path, note, label, mime, width, height, size, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, productId, str(input?.mapId), kind, url, str(input?.filePath), str(input?.note).slice(0, 2000),
           str(input?.label).slice(0, 120), str(input?.mime).slice(0, 60),
           Math.max(0, Math.round(Number(input?.width) || 0)), Math.max(0, Math.round(Number(input?.height) || 0)),
           Math.max(0, Math.round(Number(input?.size) || 0)), now)
    return this.listProductInputs(productId).find(item => item.id === id)
  }

  deleteProductInput(id: string): void {
    const row = this.db.prepare('SELECT file_path FROM product_inputs WHERE id = ?').get(str(id)) as any
    if (row?.file_path) removeFile(String(row.file_path))
    this.db.prepare('DELETE FROM product_inputs WHERE id = ?').run(str(id))
  }

  /* ---------- 统一模块 / 业务 / 端 ---------- */
  listModules(productId?: string, mapId?: string, includeArchived = false): any[] {
    const map = str(mapId)
    const arch = includeArchived ? '' : " AND archived_at = ''"
    const rows = productId
      ? (map === '' || map === 'all'
        ? this.db.prepare(`SELECT * FROM modules WHERE product_id = ?${arch} ORDER BY created_at, id`).all(productId)
        : this.db.prepare(`SELECT * FROM modules WHERE product_id = ? AND map_id = ?${arch} ORDER BY created_at, id`).all(productId, map))
      : this.db.prepare(`SELECT * FROM modules WHERE 1=1${arch} ORDER BY created_at, id`).all()
    return rows.map(toModule)
  }

  saveModule(input: any): any {
    const now = isoDateTimeSeconds()
    const productId = str(input?.productId)
    if (!this.db.prepare('SELECT id FROM products WHERE id = ?').get(productId)) throw new Error('产品不存在')
    const name = str(input?.name).trim().slice(0, 120)
    if (name === '') throw new Error('模块名称不能为空')
    const kind = ['module', 'business', 'feature', 'requirement'].includes(str(input?.kind)) ? str(input?.kind) : 'module'
    const platform = ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all'
    const mapId = str(input?.mapId) || this.defaultMapId(productId)
    // 幂等：未显式给 id 时按 (product_id, map_id, name, kind) upsert，AI 重跑不产生重复模块；同名模块可分属不同导图
    let id = str(input?.id)
    if (id === '') {
      const dup = this.db.prepare('SELECT id FROM modules WHERE product_id=? AND map_id=? AND name=? AND kind=?').get(productId, mapId, name, kind) as any
      id = dup?.id ?? `mod-${randomUUID().slice(0, 12)}`
    }
    const existing = this.db.prepare('SELECT * FROM modules WHERE id = ?').get(id) as any
    /* 局部更新：编辑模块时只改传进来的字段，避免把 note_id/status/node_id 冲掉 */
    const patch = input?.patch === true
    const nodeId = input?.nodeId !== undefined ? str(input.nodeId) : str(existing?.node_id)
    const parentId = input?.parentId !== undefined ? str(input.parentId) : str(existing?.parent_id)
    const description = input?.description !== undefined ? str(input.description).slice(0, 8000) : str(existing?.description)
    const noteId = input?.noteId !== undefined ? str(input.noteId) : str(existing?.note_id)
    const status = input?.status !== undefined ? str(input.status).slice(0, 24) : (str(existing?.status) || 'designing')
    const sortOrder = input?.sortOrder !== undefined ? Math.max(0, Math.round(Number(input.sortOrder) || 0)) : Number(existing?.sort_order ?? 0)
    if (existing) {
      this.db.prepare('UPDATE modules SET product_id=?, map_id=?, parent_id=?, name=?, kind=?, platform=?, description=?, note_id=?, status=?, node_id=?, sort_order=?, updated_at=? WHERE id=?')
        .run(productId, mapId, parentId, name, kind, platform, description, noteId, status, nodeId, sortOrder, now, id)
    } else {
      this.db.prepare('INSERT INTO modules(id, product_id, map_id, parent_id, name, kind, platform, description, note_id, status, node_id, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, productId, mapId, parentId, name, kind, platform, description, noteId, status, nodeId, sortOrder, now, now)
    }
    void patch
    return toModule(this.db.prepare('SELECT * FROM modules WHERE id = ?').get(id))
  }

  /** 删模块：连带把挂在该模块上的笔记解除 moduleId 标记（笔记本身保留）。 */
  deleteModule(id: string): void {
    const row = this.db.prepare('SELECT id, note_id FROM modules WHERE id = ?').get(str(id)) as any
    if (row === undefined) return
    this.db.prepare('DELETE FROM modules WHERE id = ?').run(str(id))
  }

  /* ---------- 模块/笔记生成进度（与 Demo 进度同构） ---------- */
  getProductProgress(productId: string, kind = 'modules'): any {
    const row = this.db.prepare('SELECT * FROM product_progress WHERE product_id = ? AND kind = ?').get(str(productId), str(kind) || 'modules') as any
    return row === undefined ? undefined : toProductProgress(row)
  }

  saveProductProgress(input: any): any {
    const productId = str(input?.productId)
    if (productId === '') throw new Error('缺少 productId')
    const kind = ['modules', 'notes', 'demo'].includes(str(input?.kind)) ? str(input.kind) : 'modules'
    const id = `pp-${productId}-${kind}`
    const now = isoDateTimeSeconds()
    const status = ['running', 'done', 'failed'].includes(str(input?.status)) ? str(input.status) : 'running'
    const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0)
    const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0)
    const message = str(input?.message).slice(0, 500)
    const existing = this.db.prepare('SELECT log FROM product_progress WHERE id = ?').get(id) as any
    const log = jsonList(existing?.log)
    if (message !== '') log.push({ step, message, at: now })
    this.db.prepare(`INSERT INTO product_progress(id, product_id, kind, demo_id, map_id, step, total, status, message, log, session_id, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET demo_id=excluded.demo_id, map_id=excluded.map_id, step=excluded.step, total=excluded.total,
        status=excluded.status, message=excluded.message, log=excluded.log, session_id=excluded.session_id, updated_at=excluded.updated_at`)
      .run(id, productId, kind, str(input?.demoId).slice(0, 60), str(input?.mapId).slice(0, 64), step, total, status, message, JSON.stringify(log.slice(-50)), str(input?.sessionId).slice(0, 64), now)
    return toProductProgress(this.db.prepare('SELECT * FROM product_progress WHERE id = ?').get(id))
  }

  /* ---------- 测试 ---------- */
  listTestProjects(): any[] {
    const rows = this.db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM test_cases c WHERE c.project_id = p.id) AS case_count,
      (SELECT COUNT(*) FROM test_runs r WHERE r.project_id = p.id) AS run_count
      FROM test_projects p ORDER BY p.updated_at DESC, p.id`).all() as any[]
    return rows.map(row => ({ ...toTestProject(row), caseCount: Number(row.case_count ?? 0), runCount: Number(row.run_count ?? 0) }))
  }

  saveTestProject(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `testp-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('测试项目名称不能为空')
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    const existing = this.db.prepare('SELECT * FROM test_projects WHERE id = ?').get(id) as any
    let bugProjectId = str(input?.bugProjectId) || str(existing?.bug_project_id)
    if (bugProjectId === '') {
      const bug = this.saveBugProject({ name: `测试：${name}`, workspacePath })
      bugProjectId = bug.id
    }
    const fields = {
      name, description: input?.description !== undefined ? str(input?.description).slice(0, 5000) : (existing?.description ?? ''), workspacePath,
      productId: str(input?.productId), moduleId: str(input?.moduleId), platform: ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all', bugProjectId,
      deployMode: input?.deployMode !== undefined ? (str(input?.deployMode) === 'ssh' ? 'ssh' : 'local') : (existing?.deploy_mode ?? 'local'),
      sshHost: input?.sshHost !== undefined ? str(input?.sshHost) : (existing?.ssh_host ?? ''),
      remoteDir: input?.remoteDir !== undefined ? str(input?.remoteDir) : (existing?.remote_dir ?? ''),
      image: input?.image !== undefined ? str(input?.image) : (existing?.image ?? ''),
      containerName: input?.containerName !== undefined ? str(input?.containerName) : (existing?.container_name ?? ''),
      hostPort: input?.hostPort !== undefined ? str(input?.hostPort) : (existing?.host_port ?? ''),
      containerPort: input?.containerPort !== undefined ? str(input?.containerPort) : (existing?.container_port ?? ''),
    }
    const unifiedTest = this.ensureProject(workspacePath, name)
    /* 同一统一项目下若还没有 Bug 项目，一并建好（与产品域一致） */
    if (workspacePath !== '') {
      const hasBug = this.db.prepare('SELECT id FROM bug_projects WHERE project_id = ? LIMIT 1').get(unifiedTest.id) as any
      if (hasBug === undefined) {
        const bugId = `bugp-${randomUUID().slice(0, 12)}`
        const ts = isoDateTimeSeconds()
        this.db.prepare('INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
          .run(bugId, name, workspacePath, basename(workspacePath), unifiedTest.id, ts, ts)
      }
    }
    if (existing) {
      this.db.prepare(`UPDATE test_projects SET name=?, description=?, workspace_path=?, product_id=?, module_id=?, platform=?, bug_project_id=?,
        deploy_mode=?, ssh_host=?, remote_dir=?, image=?, container_name=?, host_port=?, container_port=?, project_id=?, updated_at=? WHERE id=?`)
        .run(fields.name, fields.description, fields.workspacePath, fields.productId, fields.moduleId, fields.platform, fields.bugProjectId, fields.deployMode, fields.sshHost, fields.remoteDir, fields.image, fields.containerName, fields.hostPort, fields.containerPort, unifiedTest.id, now, id)
    } else {
      this.db.prepare(`INSERT INTO test_projects(id, name, description, workspace_path, product_id, module_id, platform, bug_project_id,
        deploy_mode, ssh_host, remote_dir, image, container_name, host_port, container_port, project_id, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, fields.name, fields.description, fields.workspacePath, fields.productId, fields.moduleId, fields.platform, fields.bugProjectId, fields.deployMode, fields.sshHost, fields.remoteDir, fields.image, fields.containerName, fields.hostPort, fields.containerPort, unifiedTest.id, existing?.created_at ?? now, now)
    }
    return toTestProject(this.db.prepare('SELECT * FROM test_projects WHERE id = ?').get(id))
  }

  deleteTestProject(id: string): void {
    this.db.prepare('DELETE FROM test_cases WHERE project_id = ?').run(id)
    this.db.prepare('DELETE FROM test_runs WHERE project_id = ?').run(id)
    this.db.prepare('DELETE FROM test_projects WHERE id = ?').run(id)
  }

  listTestCases(projectId?: string): any[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM test_cases WHERE project_id = ? ORDER BY created_at, id').all(projectId)
      : this.db.prepare('SELECT * FROM test_cases ORDER BY created_at, id').all()
    return rows.map(toTestCase)
  }

  saveTestCase(input: any): any {
    const now = isoDateTimeSeconds()
    const projectId = str(input?.projectId)
    if (!this.db.prepare('SELECT id FROM test_projects WHERE id = ?').get(projectId)) throw new Error('测试项目不存在')
    const title = str(input?.title).trim().slice(0, 300)
    if (title === '') throw new Error('用例标题不能为空')
    const steps = list(input?.steps).map(x => str(x)).filter(Boolean).slice(0, 30)
    // 幂等：未显式给 id 时按 (project_id, title) upsert，AI 重跑不产生重复用例
    let id = str(input?.id)
    if (id === '') {
      const dup = this.db.prepare('SELECT id FROM test_cases WHERE project_id=? AND title=?').get(projectId, title) as any
      id = dup?.id ?? `tc-${randomUUID().slice(0, 12)}`
    }
    const existing = this.db.prepare('SELECT id, created_at FROM test_cases WHERE id = ?').get(id) as any
    const priority = ['P0', 'P1', 'P2', 'P3'].includes(str(input?.priority)) ? str(input?.priority) : 'P2'
    if (existing) {
      this.db.prepare('UPDATE test_cases SET project_id=?, title=?, precondition=?, steps=?, expected=?, priority=?, type=?, source=?, module_id=?, platform=?, updated_at=? WHERE id=?')
        .run(projectId, title, str(input?.precondition), JSON.stringify(steps), str(input?.expected), priority, str(input?.type) || 'functional', str(input?.source) || 'manual', str(input?.moduleId), ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all', now, id)
    } else {
      this.db.prepare('INSERT INTO test_cases(id, project_id, title, precondition, steps, expected, priority, type, source, module_id, platform, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, projectId, title, str(input?.precondition), JSON.stringify(steps), str(input?.expected), priority, str(input?.type) || 'functional', str(input?.source) || 'manual', str(input?.moduleId), ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all', existing?.created_at ?? now, now)
    }
    const result = toTestCase(this.db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id))
    const project = this.db.prepare('SELECT * FROM test_projects WHERE id = ?').get(projectId) as any
    writeTestCasesSnapshot(project, this.listTestCases(projectId))
    return result
  }

  deleteTestCase(id: string): void {
    const row = this.db.prepare('SELECT project_id FROM test_cases WHERE id = ?').get(id) as any
    this.db.prepare('DELETE FROM test_cases WHERE id = ?').run(id)
    if (row?.project_id) {
      const project = this.db.prepare('SELECT * FROM test_projects WHERE id = ?').get(String(row.project_id)) as any
      writeTestCasesSnapshot(project, this.listTestCases(String(row.project_id)))
    }
  }

  listTestRuns(projectId?: string): any[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM test_runs WHERE project_id = ? ORDER BY created_at DESC').all(projectId)
      : this.db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC').all()
    return rows.map(toTestRun)
  }

  saveTestRun(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `run-${randomUUID().slice(0, 12)}`
    const projectId = str(input?.projectId)
    if (!this.db.prepare('SELECT id FROM test_projects WHERE id = ?').get(projectId)) throw new Error('测试项目不存在')
    const results = list(input?.results)
    const status = ['running', 'passed', 'failed', 'blocked'].includes(str(input?.status)) ? str(input?.status) : 'running'
    const summary = input?.summary && typeof input.summary === 'object' ? input.summary : {}
    const existing = this.db.prepare('SELECT id, created_at FROM test_runs WHERE id = ?').get(id) as any
    const finished = status === 'running' ? null : (str(input?.finishedAt) || now)
    if (existing) {
      this.db.prepare('UPDATE test_runs SET project_id=?, name=?, status=?, results=?, summary=?, deploy_log=?, finished_at=? WHERE id=?')
        .run(projectId, str(input?.name) || '测试运行', status, JSON.stringify(results), JSON.stringify(summary), str(input?.deployLog), finished, id)
    } else {
      this.db.prepare('INSERT INTO test_runs(id, project_id, name, status, results, summary, deploy_log, created_at, finished_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, projectId, str(input?.name) || '测试运行', status, JSON.stringify(results), JSON.stringify(summary), str(input?.deployLog), existing?.created_at ?? now, finished)
    }
    const result = toTestRun(this.db.prepare('SELECT * FROM test_runs WHERE id = ?').get(id))
    const project = this.db.prepare('SELECT * FROM test_projects WHERE id = ?').get(projectId) as any
    writeTestRunSnapshot(project, result)
    return result
  }

  deleteTestRun(id: string): void {
    this.db.prepare('DELETE FROM test_runs WHERE id = ?').run(id)
  }

  saveTestReport(projectId: string, runId: string, html: string): string {
    const project = this.db.prepare('SELECT * FROM test_projects WHERE id = ?').get(projectId) as any
    if (!project?.workspace_path) throw new Error('测试项目未关联工作区')
    const dir = join(project.workspace_path, '.dsh-workbench', 'tests', projectId, 'reports')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${sanitizeFilename(runId)}.html`)
    writeFileSync(path, html.slice(0, 5_000_000), 'utf8')
    return path
  }

  /* ---------- Bug 管理 ---------- */
  listBugProjects(): any[] {
    const rows = this.db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM bugs b WHERE b.project_id = p.id) AS count
      FROM bug_projects p ORDER BY p.created_at, p.id`).all() as any[]
    return rows.map(row => ({
      id: row.id, name: row.name, workspacePath: row.workspace_path ?? '', workspaceName: row.workspace_name ?? '',
      projectId: row.project_id ?? '',
      count: Number(row.count ?? 0), createdAt: row.created_at, updatedAt: row.updated_at,
    }))
  }

  saveBugProject(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `bugp-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('项目名称不能为空')
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    const workspaceName = str(input?.workspaceName).trim() || (workspacePath === '' ? '' : basename(workspacePath))
    const existing = this.db.prepare('SELECT id, created_at FROM bug_projects WHERE id = ?').get(id) as any
    const unified = this.ensureProject(workspacePath, name.replace(/^测试：/, ''))
    if (existing) {
      this.db.prepare('UPDATE bug_projects SET name=?, workspace_path=?, workspace_name=?, project_id=?, updated_at=? WHERE id=?')
        .run(name, workspacePath, workspaceName, unified.id, now, id)
    } else {
      this.db.prepare('INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, name, workspacePath, workspaceName, unified.id, existing?.created_at ?? now, now)
    }
    return this.listBugProjects().find(p => p.id === id)
  }

  deleteBugProject(id: string): void {
    this.db.prepare('DELETE FROM bugs WHERE project_id = ?').run(id)
    this.db.prepare('DELETE FROM bug_projects WHERE id = ?').run(id)
  }

  listBugs(): any[] {
    return this.db.prepare('SELECT * FROM bugs ORDER BY updated_at DESC').all().map(toBug)
  }

  saveBug(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `bug-${randomUUID().slice(0, 12)}`
    const projectId = str(input?.projectId)
    const project = this.db.prepare('SELECT id FROM bug_projects WHERE id = ?').get(projectId) as any
    if (!project) throw new Error('请选择项目')
    const title = str(input?.title).trim().slice(0, 300)
    if (title === '') throw new Error('Bug 标题不能为空')
    const existing = this.db.prepare('SELECT * FROM bugs WHERE id = ?').get(id) as any
    const status = ['open', 'doing', 'verify', 'resolved'].includes(str(input?.status)) ? str(input?.status) : 'open'
    const severity = ['blocker', 'major', 'minor', 'trivial'].includes(str(input?.severity)) ? str(input?.severity) : 'minor'
    const priority = ['P0', 'P1', 'P2', 'P3'].includes(str(input?.priority)) ? str(input?.priority) : 'P2'
    const plannedDate = str(input?.plannedDate).trim().slice(0, 10)
    const tags = cleanTags(input?.tags)
    const verification = str(input?.verification).slice(0, 20_000)
    const aiThreadId = str(input?.aiThreadId)
    const moduleId = str(input?.moduleId)
    const platform = ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all'
    const assignee = str(input?.assignee).trim().slice(0, 40) || '我'
    const code = str(input?.code) || existing?.code || `BUG-${randomUUID().slice(0, 4).toUpperCase()}`
    const resolvedAt = status === 'resolved' ? (existing?.resolved_at || now) : null
    if (existing) {
      this.db.prepare(`UPDATE bugs SET project_id=?, title=?, description=?, status=?, severity=?, priority=?, planned_date=?, tags=?, verification=?, ai_thread_id=?, module_id=?, platform=?, assignee=?, updated_at=?, resolved_at=? WHERE id=?`)
        .run(projectId, title, str(input?.description).slice(0, 50_000), status, severity, priority, plannedDate, JSON.stringify(tags), verification, aiThreadId, moduleId, platform, assignee, now, resolvedAt, id)
    } else {
      this.db.prepare(`INSERT INTO bugs(id, project_id, code, title, description, status, severity, priority, planned_date, tags, verification, ai_thread_id, module_id, platform, assignee, created_at, updated_at, resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, projectId, code, title, str(input?.description).slice(0, 50_000), status, severity, priority, plannedDate, JSON.stringify(tags), verification, aiThreadId, moduleId, platform, assignee, existing?.created_at ?? now, now, resolvedAt)
    }
    return toBug(this.db.prepare('SELECT * FROM bugs WHERE id = ?').get(id))
  }

  updateBug(input: any): any {
    const bug = this.db.prepare('SELECT * FROM bugs WHERE id = ?').get(str(input?.bugId)) as any
    if (!bug) throw new Error('Bug 不存在')
    return this.saveBug({
      ...toBug(bug),
      status: str(input?.status) || bug.status,
      verification: appendVerification(bug.verification, input?.verification),
      aiThreadId: str(input?.aiThreadId) || bug.ai_thread_id,
    })
  }

  deleteBug(id: string): void {
    this.db.prepare('DELETE FROM bugs WHERE id = ?').run(id)
  }

  stats(): { tasks: number; spaces: number; focus: number } {
    const one = (sql: string): number => Number((this.db.prepare(sql).get() as any)?.n ?? 0)
    return {
      tasks: one('SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL'),
      spaces: one('SELECT COUNT(*) AS n FROM spaces'),
      focus: one('SELECT COUNT(*) AS n FROM focus_sessions'),
    }
  }

  sqliteVersion(): string {
    try { return String((this.db.prepare('SELECT sqlite_version() AS v').get() as any)?.v ?? '') } catch { return '' }
  }
}

/** JSON 降级实现：接口与 SqliteStore 一致，整份状态写文件。 */
class JsonStore {
  readonly engine = 'json'
  readonly file: string
  private revision = 0
  private state: State
  private newsTopics: any[] = []
  private newsItems: any[] = []
  private notes: any[] = []
  private notebooks: any[] = []
  private notesSeeded = false
  private exportDir = ''
  private bugProjects: any[] = []
  private bugs: any[] = []
  private products: any[] = []
  private productDemos: any[] = []
  private productMaps: any[] = []
  private productMapVersions: any[] = []
  private demoProgress: any[] = []
  private modules: any[] = []
  private productProgress: any[] = []
  private productInputs: any[] = []
  private unifiedProjects: any[] = []
  private testProjects: any[] = []
  private testCases: any[] = []
  private testRuns: any[] = []

  constructor(file: string) {
    this.file = file
    mkdirSync(dirname(file), { recursive: true })
    const { readFileSync, writeFileSync, existsSync } = require('node:fs') as typeof import('node:fs')
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'))
        this.state = { spaces: list(parsed.spaces), tasks: list(parsed.tasks), focus: list(parsed.focus), settings: parsed.settings ?? {} }
        this.newsTopics = list(parsed.newsTopics)
        this.newsItems = list(parsed.newsItems)
        this.notes = list(parsed.notes)
        this.notebooks = list(parsed.notebooks)
        this.notesSeeded = parsed.notesSeeded === true
        this.exportDir = str(parsed.exportDir)
        this.bugProjects = list(parsed.bugProjects)
        this.bugs = list(parsed.bugs)
        this.products = list(parsed.products)
        this.productDemos = list(parsed.productDemos)
        this.productMaps = list(parsed.productMaps)
        this.productMapVersions = list(parsed.productMapVersions)
        this.productProgress = list(parsed.productProgress)
        this.productInputs = list(parsed.productInputs)
        this.unifiedProjects = list(parsed.unifiedProjects)
        this.demoProgress = list(parsed.demoProgress)
        this.modules = list(parsed.modules)
        this.testProjects = list(parsed.testProjects)
        this.testCases = list(parsed.testCases)
        this.testRuns = list(parsed.testRuns)
        this.revision = Number(parsed.revision ?? 0)
        this.backfillProductMaps()
        this.seedNotebooks()
        this.seedNotes()
      } catch {
        this.state = seedState()
        this.revision = 0
      }
    } else {
      this.state = seedState()
      this.revision = 1
      this.seedNotes()
    }
  }

  private seedNotebooks(): void {
    if (this.notebooks.length === 0) {
      const now = isoDateTimeSeconds()
      this.notebooks.push({ id: 'nb-default', name: '随手记', createdAt: now, updatedAt: now })
    }
    const def = this.notebooks[0].id
    for (const note of this.notes) {
      if (!note.notebookId) note.notebookId = def
    }
  }

  private seedNotes(): void {
    this.seedNotebooks()
    if (!this.notesSeeded) {
      this.notesSeeded = true
      if (this.notes.length === 0) this.notes.push(welcomeNote())
    }
    this.persistNews()
  }

  readState(): State & { revision: number } {
    return { ...this.state, revision: this.revision }
  }

  writeState(state: State): number {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    this.state = { spaces: list(state.spaces), tasks: list(state.tasks), focus: list(state.focus), settings: state.settings ?? {} }
    this.revision += 1
    writeFileSync(this.file, JSON.stringify({ ...this.state, revision: this.revision, newsTopics: this.newsTopics, newsItems: this.newsItems, notes: this.notes, notebooks: this.notebooks, notesSeeded: this.notesSeeded, exportDir: this.exportDir, bugProjects: this.bugProjects, bugs: this.bugs, products: this.products, productDemos: this.productDemos, productMaps: this.productMaps, productMapVersions: this.productMapVersions, demoProgress: this.demoProgress, productProgress: this.productProgress, productInputs: this.productInputs, unifiedProjects: this.unifiedProjects, modules: this.modules, testProjects: this.testProjects, testCases: this.testCases, testRuns: this.testRuns }, null, 2))
    return this.revision
  }

  /** 新闻：与任务快照同文件，但由独立方法读写，任务快照保存不会覆盖它。 */
  listNews(): { topics: any[]; items: any[] } {
    const topics = this.newsTopics.map(t => ({ ...t, count: Number(t.count ?? 6), times: list(t.times), cronTaskIds: list(t.cronTaskIds) }))
    const items = this.newsItems.slice().sort((x, y) => String(y.fetchedAt).localeCompare(String(x.fetchedAt))).slice(0, 400)
      .map(i => ({ ...i, aiSummary: String(i.aiSummary ?? '') }))
    return { topics, items }
  }

  saveNewsTopic(input: any): any {
    const now = isoDateTime()
    const id = str(input?.id) || `news-${randomUUID().slice(0, 12)}`
    const title = str(input?.title).trim()
    const query = str(input?.query).trim() || title
    if (title === '') throw new Error('主题名称不能为空')
    const existing = this.newsTopics.find(t => t.id === id)
    const topic = {
      id,
      title,
      query,
      scheduleKind: ['daily', 'workdays', 'weekly', 'custom'].includes(str(input?.scheduleKind)) ? str(input?.scheduleKind) : 'daily',
      times: cleanTimes(input?.times),
      weekday: Math.max(0, Math.min(6, Math.round(num(input?.weekday, 1)))),
      customCron: str(input?.customCron).trim(),
      scheduleText: str(input?.scheduleText) || str(input?.customCron).trim() || cleanTimes(input?.times).join(' / '),
      cronTaskIds: list(input?.cronTaskIds).map(x => str(x)).filter(Boolean),
      enabled: input?.enabled !== false,
      count: Math.max(1, Math.min(20, Math.round(num(input?.count, 6)))),
      lastRunAt: existing?.lastRunAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (existing) Object.assign(existing, topic)
    else this.newsTopics.push(topic)
    this.persistNews()
    return topic
  }

  deleteNewsTopic(id: string): void {
    this.newsTopics = this.newsTopics.filter(t => t.id !== id)
    this.newsItems = this.newsItems.filter(i => i.topicId !== id)
    this.persistNews()
  }

  publishNews(topicId: string, rawItems: any[]): { ok: boolean; inserted: number; skipped: number; error?: string } {
    const topic = this.newsTopics.find(t => t.id === topicId)
    if (!topic) return { ok: false, inserted: 0, skipped: 0, error: `未知订阅：${topicId}` }
    const now = isoDateTimeSeconds()
    const rows = cleanNewsItems(rawItems)
    let inserted = 0
    let skipped = 0
    for (const item of rows) {
      if (this.newsItems.some(i => i.topicId === topicId && i.hash === item.hash)) { skipped += 1; continue }
      this.newsItems.push({ id: `ni-${randomUUID().slice(0, 16)}`, topicId, title: item.title, url: item.url, source: item.source, publishedAt: item.publishedAt, summary: item.summary, aiSummary: item.aiSummary, fetchedAt: now, hash: item.hash })
      inserted += 1
    }
    topic.lastRunAt = now
    topic.updatedAt = now
    const own = this.newsItems.filter(i => i.topicId === topicId).sort((x, y) => String(y.fetchedAt).localeCompare(String(x.fetchedAt)))
    const keep = new Set(own.slice(0, 200).map(i => i.id))
    this.newsItems = this.newsItems.filter(i => i.topicId !== topicId || keep.has(i.id))
    this.persistNews()
    return { ok: true, inserted, skipped }
  }

  private persistNews(): void {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(this.file, JSON.stringify({ ...this.state, revision: this.revision, newsTopics: this.newsTopics, newsItems: this.newsItems, notes: this.notes, notebooks: this.notebooks, notesSeeded: this.notesSeeded, exportDir: this.exportDir, bugProjects: this.bugProjects, bugs: this.bugs, products: this.products, productDemos: this.productDemos, productMaps: this.productMaps, productMapVersions: this.productMapVersions, demoProgress: this.demoProgress, productProgress: this.productProgress, productInputs: this.productInputs, unifiedProjects: this.unifiedProjects, modules: this.modules, testProjects: this.testProjects, testCases: this.testCases, testRuns: this.testRuns }, null, 2))
  }

  /** 记事本（JSON 降级）。 */
  listNotes(): any[] {
    return this.notes.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  listNotebooks(): any[] {
    return this.notebooks.map(nb => ({ ...nb, count: this.notes.filter(n => n.notebookId === nb.id).length }))
  }

  saveNotebook(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `nb-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 80)
    const workspacePath = str(input?.workspacePath).trim()
    if (name === '') throw new Error('笔记本名称不能为空')
    const existing = this.notebooks.find(n => n.id === id)
    if (existing) { existing.name = name; existing.workspacePath = workspacePath; existing.updatedAt = now }
    else this.notebooks.push({ id, name, workspacePath, createdAt: now, updatedAt: now })
    this.persistNews()
    return { ...(existing ?? this.notebooks[this.notebooks.length - 1]), count: this.notes.filter(n => n.notebookId === id).length }
  }

  deleteNotebook(id: string): any {
    const nb = this.notebooks.find(n => n.id === id)
    if (!nb) throw new Error('笔记本不存在')
    const other = this.notebooks.find(n => n.id !== id)
    if (!other) throw new Error('至少保留一个笔记本')
    let moved = 0
    for (const note of this.notes) {
      if (note.notebookId === id) { note.notebookId = other.id; moved += 1 }
    }
    this.notebooks = this.notebooks.filter(n => n.id !== id)
    this.persistNews()
    return { ok: true, moved, notebookId: other.id }
  }

  saveNote(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `note-${randomUUID().slice(0, 12)}`
    const title = str(input?.title).trim().slice(0, 200) || '未命名笔记'
    const content = str(input?.content).slice(0, 500_000)
    const tags = cleanTags(input?.tags)
    const pinned = input?.pinned === true
    const wanted = str(input?.notebookId)
    const notebookId = this.notebooks.some(n => n.id === wanted) ? wanted : (this.notebooks[0]?.id ?? 'nb-default')
    const nb = this.notebooks.find(n => n.id === notebookId)
    const existing = this.notes.find(n => n.id === id)
    let filePath = ''
    try { filePath = syncNoteFile({ id, title, content }, nb) } catch (cause) { console.warn(`[dsh-workbench] 笔记文件写入失败：${String(cause)}`) }
    const note = { id, notebookId, title, content, tags, pinned, filePath, createdAt: existing?.createdAt ?? now, updatedAt: now }
    if (existing) {
      if (existing.filePath && existing.filePath !== filePath) removeFile(existing.filePath)
      Object.assign(existing, note)
    } else this.notes.push(note)
    this.persistNews()
    return note
  }

  deleteNote(id: string): void {
    const note = this.notes.find(n => n.id === id)
    if (note?.filePath) removeFile(note.filePath)
    this.notes = this.notes.filter(n => n.id !== id)
    this.persistNews()
  }

  getExportConfig(): { exportDir: string; defaultExportDir: string } {
    return { exportDir: this.exportDir || homedir(), defaultExportDir: homedir() }
  }

  setExportDir(raw: string): { exportDir: string; defaultExportDir: string } {
    this.exportDir = normalizeExportDir(raw)
    this.persistNews()
    return this.getExportConfig()
  }

  listProducts(includeArchived = false): any[] {
    return this.products
      .filter((p: any) => includeArchived || !p.archivedAt)
      .slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  saveProduct(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `prod-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('产品名称不能为空')
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    const existing = this.products.find(p => p.id === id)
    let notebookId = str(input?.notebookId) || existing?.notebookId || ''
    if (notebookId === '') notebookId = this.saveNotebook({ name: `产品：${name}`, workspacePath }).id
    else this.saveNotebook({ id: notebookId, name: `产品：${name}`, workspacePath })
    let mindmap = typeof input?.mindmap === 'string' ? input.mindmap : (existing?.mindmap ?? '{"nodes":[]}')
    try {
      const parsed = JSON.parse(mindmap) as any
      if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
        parsed.nodes = [{ id: 'root', label: name, type: 'root', parentId: null, note: '' }]
        mindmap = JSON.stringify(parsed)
      }
    } catch { mindmap = JSON.stringify({ nodes: [{ id: 'root', label: name, type: 'root', parentId: null, note: '' }] }) }
    const product = {
      id, name, description: input?.description !== undefined ? str(input?.description).slice(0, 5000) : (existing?.description ?? ''), workspacePath, notebookId,
      mindmap,
      styles: Array.isArray(input?.styles) ? input.styles : (existing?.styles ?? []),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    if (existing) Object.assign(existing, product)
    else this.products.push(product)
    this.persistNews()
    this.writeProductMindmapFile(product)
    /* 新产品即有首张导图（v2 图），避免「导图列表为空」的空窗 */
    if (this.listProductMaps(product.id).length === 0) {
      this.saveProductMap({ productId: product.id, name: '主导图', description: '', graph: productGraphFromV1(product.mindmap, name).graph })
    }
    return product
  }

  private writeProductMindmapFile(product: any): void {
    if (!product?.workspacePath) return
    try {
      const dir = join(product.workspacePath, '.dsh-workbench', 'products', product.id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'mindmap.json'), String(product.mindmap ?? '{"nodes":[]}'), 'utf8')
    } catch (cause) { console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`) }
  }

  /** 旧 JSON 数据升级：每个产品的 mindmap 迁成「主导图」，artefact 回填 mapId；导图补 v2 图与版本。 */
  private backfillProductMaps(): void {
    const now = isoDateTimeSeconds()
    for (const product of this.products) {
      let first = this.productMaps.find(m => m.productId === product.id)
      if (first === undefined) {
        first = { id: `map-${randomUUID().slice(0, 12)}`, productId: product.id, name: '主导图', description: '', mindmap: String(product.mindmap ?? '{"nodes":[]}'), sortOrder: 0, createdAt: product.createdAt ?? now, updatedAt: now }
        this.productMaps.push(first)
      }
      for (const item of [...this.modules, ...this.productDemos]) {
        if (item.productId === product.id && !item.mapId) item.mapId = first.id
      }
    }
    for (const map of this.productMaps) {
      if (map.graph === undefined || map.graph === null) {
        const { graph } = productGraphFromV1(map.mindmap ?? '{"nodes":[]}', map.name ?? '产品')
        map.graph = graph
        map.mindmap = productGraphToV1(graph)
        map.graphRev = Number(map.graphRev ?? 0)
        map.currentVersionId = str(map.currentVersionId)
        map.source = str(map.source) || 'manual'
        map.sourceRef = str(map.sourceRef)
        map.summary = str(map.summary)
        map.updatedAt = map.updatedAt ?? now
      }
      if (!this.productMapVersions.some(v => v.mapId === map.id)) {
        const version = {
          id: `mv-${randomUUID().slice(0, 12)}`, mapId: map.id, seq: 1, label: 'v1 迁移',
          source: 'migration', sourceRef: '', summary: '从 v1 导图迁移',
          graph: map.graph, nodeCount: map.graph.nodes.length, edgeCount: map.graph.edges.length, createdAt: now,
        }
        this.productMapVersions.push(version)
        if (!map.currentVersionId) map.currentVersionId = version.id
      }
    }
  }
  /** JSON 存储的导图图：对象直接挂 graph 字段（v2），缺失时从 v1 兜底转换。 */
  private jsonMapGraph(map: any): ProductMapGraph {
    if (map?.graph !== undefined && map?.graph !== null && Array.isArray(map.graph.nodes)) return map.graph as ProductMapGraph
    return productGraphFromV1(map?.mindmap ?? '{"nodes":[]}', map?.name ?? '产品').graph
  }
  private pruneExternalRefsJson(productId: string, graph: ProductMapGraph): ProductMapGraph {
    const ids = new Set(this.productMaps.filter(m => m.productId === productId).map(m => String(m.id)))
    const edges = graph.edges.filter(edge => {
      if (edge.kind !== 'relate') return true
      const ref = parseExternalRef(String(edge.to))
      if (ref === null) return true
      if (!ids.has(ref.mapId)) { console.warn(`[dsh-workbench] 跨图引用目标不存在，已丢弃：${edge.to}`); return false }
      return true
    })
    return edges.length === graph.edges.length ? graph : { ...graph, edges }
  }
  /** 入向跨图引用清理：本图删掉节点后，其他导图指向 <mapId>:<nodeId> 的引用一并移除。 */
  private cleanInboundRefsJson(productId: string, mapId: string, graph: ProductMapGraph): void {
    const alive = new Set(graph.nodes.map(n => n.id))
    for (const other of this.productMaps.filter(m => m.productId === productId && m.id !== mapId)) {
      const g = this.jsonMapGraph(other)
      const edges = g.edges.filter(e => !(e.kind === 'relate' && String(e.to).startsWith(`${mapId}:`) && !alive.has(String(e.to).slice(mapId.length + 1))))
      if (edges.length !== g.edges.length) {
        other.graph = { ...g, edges }
        other.mindmap = productGraphToV1(other.graph)
        other.graphRev = Number(other.graphRev ?? 0) + 1
        this.writeProductMapFile(other)
      }
    }
  }
  listProductMaps(productId: string): any[] {
    return this.productMaps.filter(m => m.productId === productId).sort((a, b) => a.sortOrder - b.sortOrder)
  }
  getProductMap(mapId: string): any | undefined {
    return this.productMaps.find(m => m.id === mapId)
  }
  defaultMapId(productId: string): string {
    return this.listProductMaps(productId)[0]?.id ?? ''
  }
  saveProductMap(input: any): any {
    const productId = str(input?.productId)
    if (!this.products.some(p => p.id === productId)) throw new Error('产品不存在')
    const now = isoDateTimeSeconds()
    const name = str(input?.name).trim().slice(0, 80) || '未命名导图'
    const description = str(input?.description).slice(0, 2000)
    let id = str(input?.id)
    let map = id === '' ? undefined : this.productMaps.find(m => m.id === id)
    const incoming = input?.graph ?? (typeof input?.mindmap === 'string' ? productGraphFromV1(input.mindmap, name).graph : undefined)
    const base = incoming ?? (map !== undefined ? this.jsonMapGraph(map) : productGraphFromV1(normalizeMindmap(undefined, name), name).graph)
    const normalized = normalizeProductGraph(base, { title: name })
    const graph = this.pruneExternalRefsJson(productId, normalized.graph)
    if (map === undefined) {
      id = `map-${randomUUID().slice(0, 12)}`
      map = {
        id, productId, name, description, mindmap: productGraphToV1(graph), graph,
        graphRev: 0, currentVersionId: '', source: str(input?.source) || 'manual', sourceRef: str(input?.sourceRef), summary: str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary),
        sortOrder: this.listProductMaps(productId).length, createdAt: now, updatedAt: now,
      }
      this.productMaps.push(map)
    } else {
      map.name = name
      map.description = description
      map.graph = graph
      map.mindmap = productGraphToV1(graph)
      map.source = str(input?.source) || str(map.source) || 'manual'
      map.sourceRef = str(input?.sourceRef) || str(map.sourceRef) || ''
      map.summary = str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary) || str(map.summary) || ''
      map.updatedAt = now
    }
    this.syncFirstMapMirror(productId)
    this.writeProductMapFile(map)
    this.cleanInboundRefsJson(map.productId, map.id, map.graph)
    this.persistNews()
    return map
  }
  saveMapDraft(input: any): { rev: number; map: any } {
    const map = this.productMaps.find(m => m.id === str(input?.mapId))
    if (!map) throw new Error('导图不存在')
    const current = Number(map.graphRev ?? 0)
    if (input?.rev !== undefined && Number(input.rev) !== current) {
      const error: any = new Error('draft_conflict')
      error.code = 'draft_conflict'
      error.current = map
      throw error
    }
    const normalized = normalizeProductGraph(input?.graph, { title: map.name })
    const graph = this.pruneExternalRefsJson(map.productId, normalized.graph)
    map.graph = graph
    map.mindmap = productGraphToV1(graph)
    map.graphRev = current + 1
    map.updatedAt = isoDateTimeSeconds()
    this.syncFirstMapMirror(map.productId)
    this.writeProductMapFile(map)
    this.cleanInboundRefsJson(map.productId, map.id, map.graph)
    this.persistNews()
    return { rev: map.graphRev, map }
  }
  listMapVersions(mapId: string): any[] {
    return this.productMapVersions.filter(v => v.mapId === mapId).sort((a, b) => b.seq - a.seq)
  }
  getMapVersion(id: string): any | undefined {
    return this.productMapVersions.find(v => v.id === id)
  }
  createMapVersion(input: any): any {
    const map = this.productMaps.find(m => m.id === str(input?.mapId))
    if (!map) throw new Error('导图不存在')
    const mine = this.productMapVersions.filter(v => v.mapId === map.id)
    if (mine.length >= PRODUCT_GRAPH_LIMITS.versions) throw new Error(`每个导图最多 ${PRODUCT_GRAPH_LIMITS.versions} 个版本，请先删除旧版本`)
    const normalized = normalizeProductGraph(input?.graph ?? this.jsonMapGraph(map), { title: map.name })
    const graph = this.pruneExternalRefsJson(map.productId, normalized.graph)
    const seq = Math.max(0, ...mine.map(v => Number(v.seq ?? 0))) + 1
    const version = {
      id: `mv-${randomUUID().slice(0, 12)}`, mapId: map.id, seq,
      label: str(input?.label).slice(0, PRODUCT_GRAPH_LIMITS.labelLong) || `v${seq}`,
      source: ['manual', 'outline', 'idea', 'ai', 'rollback', 'migration'].includes(str(input?.source)) ? str(input?.source) : 'manual',
      sourceRef: str(input?.sourceRef).slice(0, 120), summary: str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary),
      graph, nodeCount: graph.nodes.length, edgeCount: graph.edges.length, createdAt: isoDateTimeSeconds(),
    }
    this.productMapVersions.push(version)
    map.graph = graph
    map.mindmap = productGraphToV1(graph)
    map.graphRev = Number(map.graphRev ?? 0) + 1
    map.currentVersionId = version.id
    map.updatedAt = version.createdAt
    this.syncFirstMapMirror(map.productId)
    this.writeProductMapFile(map)
    this.cleanInboundRefsJson(map.productId, map.id, map.graph)
    this.persistNews()
    return version
  }
  deleteMapVersion(id: string): void {
    const version = this.productMapVersions.find(v => v.id === id)
    if (!version) return
    const mine = this.productMapVersions.filter(v => v.mapId === version.mapId)
    if (mine.length <= 1) throw new Error('至少保留一个版本')
    this.productMapVersions = this.productMapVersions.filter(v => v.id !== id)
    const map = this.productMaps.find(m => m.id === version.mapId)
    if (map?.currentVersionId === id) {
      const latest = this.productMapVersions.filter(v => v.mapId === version.mapId).sort((a, b) => b.seq - a.seq)[0]
      map.currentVersionId = latest?.id ?? ''
    }
    this.persistNews()
  }
  rollbackMapVersion(mapId: string, versionId: string): any {
    const version = this.getMapVersion(versionId)
    if (!version || version.mapId !== mapId) throw new Error('版本不存在')
    return this.createMapVersion({ mapId, graph: version.graph, source: 'rollback', label: `回滚到 v${version.seq}`, summary: `从 v${version.seq} 恢复` })
  }
  private writeProductMapFile(map: any): void {
    try {
      const product = this.products.find(p => p.id === map.productId)
      const workspace = str(product?.workspacePath).trim()
      if (workspace === '') return
      const dir = join(workspace, '.dsh-workbench', 'products', map.productId, 'maps')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${map.id}.json`), JSON.stringify(this.jsonMapGraph(map)), 'utf8')
    } catch (cause) { console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`) }
  }
  deleteProductMap(mapId: string): void {
    const map = this.productMaps.find(m => m.id === mapId)
    if (!map) return
    if (this.listProductMaps(map.productId).length <= 1) throw new Error('至少保留一张导图')
    this.productMaps = this.productMaps.filter(m => m.id !== mapId)
    this.productMapVersions = this.productMapVersions.filter(v => v.mapId !== mapId)
    /* 归属清理 + 跨图引用级联清理 */
    for (const item of [...this.modules, ...this.productDemos, ...this.notes]) {
      if (item.mapId === mapId) item.mapId = ''
    }
    for (const other of this.productMaps.filter(m => m.productId === map.productId)) {
      const graph = this.jsonMapGraph(other)
      const edges = graph.edges.filter(e => !(e.kind === 'relate' && String(e.to).startsWith(`${mapId}:`)))
      if (edges.length !== graph.edges.length) {
        other.graph = { ...graph, edges }
        other.mindmap = productGraphToV1(other.graph)
        other.graphRev = Number(other.graphRev ?? 0) + 1
        this.writeProductMapFile(other)
      }
    }
    this.syncFirstMapMirror(map.productId)
    this.persistNews()
  }
  private syncFirstMapMirror(productId: string): void {
    const product = this.products.find(p => p.id === productId)
    const first = this.listProductMaps(productId)[0]
    if (product && first) product.mindmap = first.mindmap
  }

  saveProductMindmap(productId: string, mindmap: string): any {
    const product = this.products.find(p => p.id === productId)
    if (!product) throw new Error('产品不存在')
    const map = this.listProductMaps(productId)[0]
    if (map !== undefined) {
      this.saveProductMap({ id: map.id, productId, name: map.name, description: map.description, graph: productGraphFromV1(mindmap, product.name).graph })
    } else {
      product.mindmap = mindmap
      product.updatedAt = isoDateTimeSeconds()
      this.persistNews()
    }
    this.writeProductMindmapFile(product)
    return product
  }

  deleteProduct(id: string): void {
    const product = this.products.find(p => p.id === id)
    if (product?.workspacePath) {
      try { rmSync(join(product.workspacePath, '.dsh-workbench', 'products', id), { recursive: true, force: true }) } catch { /* ignore */ }
    }
    this.productDemos = this.productDemos.filter(d => d.productId !== id)
    const doomedMaps = new Set(this.productMaps.filter(m => m.productId === id).map(m => m.id))
    this.productMapVersions = this.productMapVersions.filter(v => !doomedMaps.has(v.mapId))
    this.productMaps = this.productMaps.filter(m => m.productId !== id)
    this.demoProgress = this.demoProgress.filter(p => p.productId !== id)
    this.products = this.products.filter(p => p.id !== id)
    this.persistNews()
  }

  listProductDemos(productId?: string, mapId?: string): any[] {
    if (productId && mapId && mapId !== 'all') return this.productDemos.filter(d => d.productId === productId && d.mapId === mapId)
    return this.productDemos.filter(d => productId === undefined || d.productId === productId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  getProductDemo(id: string): any {
    return this.productDemos.find(d => d.id === id)
  }

  saveProductDemo(input: any): any {
    const product = this.products.find(p => p.id === str(input?.productId))
    if (!product) throw new Error('产品不存在')
    const mapId = str(input?.mapId) || this.defaultMapId(product.id)
    if (!product.workspacePath) throw new Error('产品未关联工作区')
    const style = str(input?.style).replace(/[^a-z0-9-]/gi, '').slice(0, 24) || 'clean'
    const scope = str(input?.scope) === 'feature' ? 'feature' : 'all'
    const featureId = scope === 'feature' ? str(input?.featureId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) : ''
    const platform = ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all'
    const kind = str(input?.kind) === 'system' ? 'system' : 'page'
    const html = str(input?.html)
    if (html.trim() === '') throw new Error('Demo HTML 为空')
    const id = `demo-${randomUUID().slice(0, 12)}`
    const dir = join(product.workspacePath, '.dsh-workbench', 'products', product.id, 'demo', style)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${scope === 'feature' ? featureId : 'all'}-${id.slice(-6)}.html`)
    writeFileSync(path, html.slice(0, 2_000_000), 'utf8')
    const demo = { id, productId: product.id, mapId, style, scope, featureId, title: str(input?.title) || `${product.name} · ${style} · ${scope}`, filePath: path, createdAt: isoDateTimeSeconds(), platform, kind, status: 'ready' }
    this.productDemos.push(demo)
    this.persistNews()
    return demo
  }

  /* ---------- 产品灵感 / Demo 进度 ---------- */

  getDemoProgress(productId: string): any {
    return this.demoProgress.find(p => p.productId === str(productId))
  }

  saveDemoProgress(input: any): any {
    const productId = str(input?.productId)
    if (productId === '') throw new Error('缺少 productId')
    const now = isoDateTimeSeconds()
    const status = ['running', 'done', 'failed'].includes(str(input?.status)) ? str(input?.status) : 'running'
    const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0)
    const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0)
    const message = str(input?.message).slice(0, 500)
    const existing = this.demoProgress.find(p => p.productId === productId)
    const log = list(existing?.log)
    if (message !== '') log.push({ step, message, at: now })
    const record = {
      id: existing?.id ?? `dp-${productId}`,
      productId,
      demoId: str(input?.demoId).slice(0, 60),
      step, total, status, message,
      log: log.slice(-50),
      updatedAt: now,
    }
    if (existing) Object.assign(existing, record)
    else this.demoProgress.push(record)
    this.persistNews()
    return record
  }

  deleteProductDemo(id: string): void {
    const demo = this.productDemos.find(d => d.id === id)
    if (demo?.filePath) { try { rmSync(str(demo.filePath), { force: true }) } catch { /* ignore */ } }
    this.productDemos = this.productDemos.filter(d => d.id !== id)
    this.persistNews()
  }

  publishProductNote(input: any): any {
    const product = this.products.find(p => p.id === str(input?.productId))
    if (!product) throw new Error('产品不存在')
    const featureId = str(input?.featureId)
    const tags = cleanTags([...(list(input?.tags)), '产品', product.name, ...(featureId ? [featureId] : []), ...(str(input?.moduleId) ? [str(input.moduleId)] : []), ...(str(input?.platform) ? [`platform:${str(input.platform)}`] : [])])
    const note = this.saveNote({ notebookId: product.notebookId, title: str(input?.title) || '产品设计笔记', content: str(input?.content), tags })
    const module = this.modules.find(m => m.id === str(input?.moduleId) && m.productId === product.id)
    if (module) { module.noteId = note.id; module.status = 'designed'; module.updatedAt = isoDateTimeSeconds(); this.persistNews() }
    return note
  }

  listModules(productId?: string, mapId?: string, includeArchived = false): any[] {
    const keep = (m: any): boolean => includeArchived || !m.archivedAt
    if (productId && mapId && mapId !== 'all') return this.modules.filter(m => keep(m) && m.productId === productId && m.mapId === mapId)
    return this.modules.filter(m => keep(m) && (productId === undefined || m.productId === productId))
  }

  saveModule(input: any): any {
    const now = isoDateTimeSeconds()
    const productId = str(input?.productId)
    if (!this.products.some(p => p.id === productId)) throw new Error('产品不存在')
    const name = str(input?.name).trim().slice(0, 120)
    if (name === '') throw new Error('模块名称不能为空')
    const kind = ['module', 'business', 'feature', 'requirement'].includes(str(input?.kind)) ? str(input?.kind) : 'module'
    const platform = ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all'
    const mapId = str(input?.mapId) || this.defaultMapId(productId)
    // 幂等：未显式给 id 时按 (productId, mapId, name, kind) upsert；同名模块可分属不同导图
    let id = str(input?.id)
    if (id === '') {
      const dup = this.modules.find(m => m.productId === productId && m.mapId === mapId && m.name === name && m.kind === kind)
      id = dup?.id ?? `mod-${randomUUID().slice(0, 12)}`
    }
    const existing = this.modules.find(m => m.id === id)
    const module = {
      id, productId, mapId,
      parentId: input?.parentId !== undefined ? str(input.parentId) : str(existing?.parentId),
      name, kind, platform,
      description: input?.description !== undefined ? str(input.description).slice(0, 8000) : str(existing?.description),
      noteId: input?.noteId !== undefined ? str(input.noteId) : str(existing?.noteId),
      status: input?.status !== undefined ? str(input.status).slice(0, 24) : (str(existing?.status) || 'designing'),
      nodeId: input?.nodeId !== undefined ? str(input.nodeId) : str(existing?.nodeId),
      sortOrder: input?.sortOrder !== undefined ? Math.max(0, Math.round(Number(input.sortOrder) || 0)) : Number(existing?.sortOrder ?? 0),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    if (existing) Object.assign(existing, module)
    else this.modules.push(module)
    this.persistNews()
    return this.modules.find(m => m.id === id) ?? module
  }

  deleteModule(id: string): void {
    this.modules = this.modules.filter(m => m.id !== str(id))
    this.persistNews()
  }

  /* ---------- 统一项目（JSON 兜底实现） ---------- */
  listProjects(includeArchived = false): any[] {
    return (this.unifiedProjects ?? [])
      .filter((p: any) => includeArchived || !p.archivedAt)
      .slice().sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)))
  }

  getProject(id: string): any | undefined {
    return (this.unifiedProjects ?? []).find((p: any) => p.id === str(id))
  }

  ensureProject(workspacePath: string, name: string): any {
    const raw = str(workspacePath).trim()
    const ws = raw
    const existing = ws !== ''
      ? (this.unifiedProjects ?? []).find((p: any) => p.workspacePath === ws)
      : (this.unifiedProjects ?? []).find((p: any) => p.workspacePath === '' && p.name === str(name).slice(0, 100))
    if (existing !== undefined) return existing
    const now = isoDateTimeSeconds()
    const project = {
      id: `prj-${randomUUID().slice(0, 12)}`, name: str(name).slice(0, 100) || '未命名项目', description: '',
      workspacePath: ws, workspaceName: ws === '' ? '' : basename(ws), archivedAt: '', sortOrder: 0,
      createdAt: now, updatedAt: now,
    }
    this.unifiedProjects = this.unifiedProjects ?? []
    this.unifiedProjects.push(project)
    this.persistNews()
    return project
  }

  saveProject(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id)
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('项目名称不能为空')
    this.unifiedProjects = this.unifiedProjects ?? []
    const existing = id !== '' ? this.unifiedProjects.find((p: any) => p.id === id) : undefined
    if (existing !== undefined) {
      Object.assign(existing, { name, description: str(input?.description).slice(0, 5000), workspacePath: str(input?.workspacePath), workspaceName: basename(str(input?.workspacePath)), updatedAt: now })
      this.persistNews()
      return existing
    }
    const project = { id: id || `prj-${randomUUID().slice(0, 12)}`, name, description: str(input?.description).slice(0, 5000), workspacePath: str(input?.workspacePath), workspaceName: basename(str(input?.workspacePath)), archivedAt: '', sortOrder: 0, createdAt: now, updatedAt: now }
    this.unifiedProjects.push(project)
    this.persistNews()
    return project
  }

  deleteProject(id: string): void {
    this.unifiedProjects = (this.unifiedProjects ?? []).filter((p: any) => p.id !== str(id))
    for (const item of [...this.products, ...this.bugProjects, ...this.testProjects]) {
      if (item.projectId === str(id)) item.projectId = ''
    }
    this.persistNews()
  }

  listProjectOverviews(includeArchived = false): any[] {
    return this.listProjects(includeArchived).map((project: any) => {
      const products = this.products.filter((p: any) => p.projectId === project.id)
      const bugProjects = this.bugProjects.filter((p: any) => p.projectId === project.id)
      const testProjects = this.testProjects.filter((p: any) => p.projectId === project.id)
      const bugs = this.bugs.filter((b: any) => bugProjects.some((p: any) => p.id === b.projectId))
      return { project, products, bugProjects, testProjects, counts: { products: products.length, bugProjects: bugProjects.length, testProjects: testProjects.length, bugs: bugs.length } }
    })
  }

  listProductInputs(productId: string, mapId = ''): any[] {
    const map = str(mapId)
    return this.productInputs.filter(i => i.productId === str(productId) && (map === '' || map === 'all' || i.mapId === '' || i.mapId === map))
  }

  addProductInput(input: any): any {
    const productId = str(input?.productId)
    if (!this.products.some(p => p.id === productId)) throw new Error('产品不存在')
    const kind = ['url', 'image', 'text'].includes(str(input?.kind)) ? str(input.kind) : 'url'
    const url = str(input?.url).slice(0, 1000)
    if (kind === 'url' && !/^https?:\/\//i.test(url)) throw new Error('链接必须以 http(s):// 开头')
    if (kind === 'image' && str(input?.filePath) === '') throw new Error('截图缺少文件路径')
    const item = {
      id: `pin-${randomUUID().slice(0, 12)}`, productId, mapId: str(input?.mapId), kind, url,
      filePath: str(input?.filePath), note: str(input?.note).slice(0, 2000), label: str(input?.label).slice(0, 120),
      mime: str(input?.mime).slice(0, 60), width: Math.max(0, Math.round(Number(input?.width) || 0)),
      height: Math.max(0, Math.round(Number(input?.height) || 0)), size: Math.max(0, Math.round(Number(input?.size) || 0)),
      createdAt: isoDateTimeSeconds(),
    }
    this.productInputs.push(item)
    this.persistNews()
    return item
  }

  deleteProductInput(id: string): void {
    const row = this.productInputs.find(i => i.id === str(id))
    if (row?.filePath) removeFile(String(row.filePath))
    this.productInputs = this.productInputs.filter(i => i.id !== str(id))
    this.persistNews()
  }

  addMapNode(input: any): any {
    const productId = str(input?.productId)
    const mapId = str(input?.mapId)
    const map = this.productMaps.find(m => m.id === mapId && m.productId === productId)
    if (map === undefined) throw new Error('导图不存在或不属于该产品')
    const name = str(input?.name).trim().slice(0, 24)
    if (name === '') throw new Error('节点名称不能为空')
    const kind = (['module', 'business', 'feature', 'requirement'].includes(str(input?.kind)) ? str(input.kind) : 'feature') as ProductMapNode['kind']
    const parentId = str(input?.parentId)
    const graph = this.jsonMapGraph(map)
    const existing = graph.nodes.find(n => n.label === name && n.kind === kind
      && (parentId === '' ? (n.parentId === null || n.parentId === graph.rootId) : n.parentId === parentId))
    if (existing !== undefined) return this.saveMapDraft({ mapId, graph: this.jsonMapGraph(map) }).map
    graph.nodes.push({
      id: `pn-${randomUUID().slice(2, 8)}`, label: name, kind,
      parentId: parentId === '' ? graph.rootId : parentId, status: 'kept',
    })
    return this.saveMapDraft({ mapId, graph }).map
  }

  /** 设计文档清单（JSON 兜底实现，语义与 SqliteStore 一致）。 */
  listDesignDocs(productId: string): any {
    const product = this.products.find(p => p.id === str(productId))
    const map = { module_design: [] as any[], product_design: [] as any[], feature_design: [] as any[] }
    if (product === undefined) return map
    for (const note of this.notes) {
      if (note.notebookId !== product.notebookId) continue
      const bucket = map[note.kind as keyof typeof map]
      if (bucket !== undefined) bucket.push(note)
    }
    return map
  }

  setArchived(target: 'products' | 'modules' | 'notes', id: string, archived: boolean): void {
    const list = target === 'products' ? this.products : target === 'modules' ? this.modules : this.notes
    const found = list.find((x: any) => x.id === str(id))
    if (found === undefined) throw new Error('目标不存在')
    found.archivedAt = archived ? isoDateTimeSeconds() : ''
    found.updatedAt = isoDateTimeSeconds()
    this.persistNews()
  }

  getProductProgress(productId: string, kind = 'modules'): any {
    return this.productProgress.find(p => p.productId === str(productId) && p.kind === (str(kind) || 'modules')) ?? undefined
  }

  saveProductProgress(input: any): any {
    const productId = str(input?.productId)
    if (productId === '') throw new Error('缺少 productId')
    const kind = ['modules', 'notes', 'demo'].includes(str(input?.kind)) ? str(input.kind) : 'modules'
    const id = `pp-${productId}-${kind}`
    const now = isoDateTimeSeconds()
    const status = ['running', 'done', 'failed'].includes(str(input?.status)) ? str(input.status) : 'running'
    const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0)
    const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0)
    const message = str(input?.message).slice(0, 500)
    const existing = this.productProgress.find(p => p.id === id)
    const log = Array.isArray(existing?.log) ? existing!.log.slice() : []
    if (message !== '') log.push({ step, message, at: now })
    const progress = {
      id, productId, kind, demoId: str(input?.demoId).slice(0, 60), mapId: str(input?.mapId).slice(0, 64),
      step, total, status, message, log: log.slice(-50), sessionId: str(input?.sessionId).slice(0, 64), updatedAt: now,
    }
    if (existing) Object.assign(existing, progress)
    else this.productProgress.push(progress)
    this.persistNews()
    return progress
  }

  listTestProjects(): any[] {
    return this.testProjects.map(p => ({ ...p, caseCount: this.testCases.filter(c => c.projectId === p.id).length, runCount: this.testRuns.filter(r => r.projectId === p.id).length }))
  }

  saveTestProject(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `testp-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('测试项目名称不能为空')
    const existing = this.testProjects.find(p => p.id === id)
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    let bugProjectId = str(input?.bugProjectId) || existing?.bugProjectId || ''
    if (bugProjectId === '') bugProjectId = this.saveBugProject({ name: `测试：${name}`, workspacePath }).id
    const project = {
      id, name, description: str(input?.description).slice(0, 5000), workspacePath,
      productId: str(input?.productId), moduleId: str(input?.moduleId), platform: ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all', bugProjectId,
      deployMode: input?.deployMode !== undefined ? (str(input?.deployMode) === 'ssh' ? 'ssh' : 'local') : (existing?.deployMode ?? 'local'),
      sshHost: input?.sshHost !== undefined ? str(input?.sshHost) : (existing?.sshHost ?? ''),
      remoteDir: input?.remoteDir !== undefined ? str(input?.remoteDir) : (existing?.remoteDir ?? ''),
      image: input?.image !== undefined ? str(input?.image) : (existing?.image ?? ''),
      containerName: input?.containerName !== undefined ? str(input?.containerName) : (existing?.containerName ?? ''),
      hostPort: input?.hostPort !== undefined ? str(input?.hostPort) : (existing?.hostPort ?? ''),
      containerPort: input?.containerPort !== undefined ? str(input?.containerPort) : (existing?.containerPort ?? ''),
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    if (existing) Object.assign(existing, project)
    else this.testProjects.push(project)
    this.persistNews()
    return project
  }

  deleteTestProject(id: string): void {
    this.testCases = this.testCases.filter(c => c.projectId !== id)
    this.testRuns = this.testRuns.filter(r => r.projectId !== id)
    this.testProjects = this.testProjects.filter(p => p.id !== id)
    this.persistNews()
  }

  listTestCases(projectId?: string): any[] {
    return this.testCases.filter(c => projectId === undefined || c.projectId === projectId)
  }

  saveTestCase(input: any): any {
    const now = isoDateTimeSeconds()
    const projectId = str(input?.projectId)
    if (!this.testProjects.some(p => p.id === projectId)) throw new Error('测试项目不存在')
    const title = str(input?.title).trim().slice(0, 300)
    if (title === '') throw new Error('用例标题不能为空')
    const steps = list(input?.steps).map(x => str(x)).filter(Boolean).slice(0, 30)
    // 幂等：未显式给 id 时按 (projectId, title) upsert
    let id = str(input?.id)
    if (id === '') {
      const dup = this.testCases.find(c => c.projectId === projectId && c.title === title)
      id = dup?.id ?? `tc-${randomUUID().slice(0, 12)}`
    }
    const existing = this.testCases.find(c => c.id === id)
    const testCase = {
      id, projectId, title, precondition: str(input?.precondition), steps, expected: str(input?.expected),
      priority: ['P0', 'P1', 'P2', 'P3'].includes(str(input?.priority)) ? str(input?.priority) : 'P2',
      type: str(input?.type) || 'functional', source: str(input?.source) || 'manual',
      moduleId: str(input?.moduleId), platform: ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all',
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    }
    if (existing) Object.assign(existing, testCase)
    else this.testCases.push(testCase)
    this.persistNews()
    writeTestCasesSnapshot(this.testProjects.find(p => p.id === projectId), this.testCases.filter(c => c.projectId === projectId))
    return testCase
  }

  deleteTestCase(id: string): void {
    const found = this.testCases.find(c => c.id === id)
    this.testCases = this.testCases.filter(c => c.id !== id)
    this.persistNews()
    if (found) writeTestCasesSnapshot(this.testProjects.find(p => p.id === found.projectId), this.testCases.filter(c => c.projectId === found.projectId))
  }

  listTestRuns(projectId?: string): any[] {
    return this.testRuns.filter(r => projectId === undefined || r.projectId === projectId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  saveTestRun(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `run-${randomUUID().slice(0, 12)}`
    const projectId = str(input?.projectId)
    if (!this.testProjects.some(p => p.id === projectId)) throw new Error('测试项目不存在')
    const status = ['running', 'passed', 'failed', 'blocked'].includes(str(input?.status)) ? str(input?.status) : 'running'
    const existing = this.testRuns.find(r => r.id === id)
    const run = {
      id, projectId, name: str(input?.name) || '测试运行', status,
      results: list(input?.results), summary: input?.summary && typeof input.summary === 'object' ? input.summary : {},
      deployLog: str(input?.deployLog), createdAt: existing?.createdAt ?? now,
      finishedAt: status === 'running' ? null : (str(input?.finishedAt) || now),
    }
    if (existing) Object.assign(existing, run)
    else this.testRuns.push(run)
    this.persistNews()
    writeTestRunSnapshot(this.testProjects.find(p => p.id === projectId), run)
    return run
  }

  deleteTestRun(id: string): void {
    this.testRuns = this.testRuns.filter(r => r.id !== id)
    this.persistNews()
  }

  saveTestReport(projectId: string, runId: string, html: string): string {
    const project = this.testProjects.find(p => p.id === projectId)
    if (!project?.workspacePath) throw new Error('测试项目未关联工作区')
    const dir = join(project.workspacePath, '.dsh-workbench', 'tests', projectId, 'reports')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${sanitizeFilename(runId)}.html`)
    writeFileSync(path, html.slice(0, 5_000_000), 'utf8')
    return path
  }

  listBugProjects(): any[] {
    return this.bugProjects.map(project => ({
      ...project,
      count: this.bugs.filter(b => b.projectId === project.id).length,
    }))
  }

  saveBugProject(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `bugp-${randomUUID().slice(0, 12)}`
    const name = str(input?.name).trim().slice(0, 100)
    if (name === '') throw new Error('项目名称不能为空')
    const workspacePath = normalizeWorkspacePath(input?.workspacePath)
    const workspaceName = str(input?.workspaceName).trim() || (workspacePath === '' ? '' : basename(workspacePath))
    const existing = this.bugProjects.find(p => p.id === id)
    if (existing) Object.assign(existing, { name, workspacePath, workspaceName, updatedAt: now })
    else this.bugProjects.push({ id, name, workspacePath, workspaceName, createdAt: now, updatedAt: now })
    this.persistNews()
    return this.listBugProjects().find(p => p.id === id)
  }

  deleteBugProject(id: string): void {
    this.bugs = this.bugs.filter(b => b.projectId !== id)
    this.bugProjects = this.bugProjects.filter(p => p.id !== id)
    this.persistNews()
  }

  listBugs(): any[] {
    return this.bugs.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  saveBug(input: any): any {
    const now = isoDateTimeSeconds()
    const id = str(input?.id) || `bug-${randomUUID().slice(0, 12)}`
    const projectId = str(input?.projectId)
    if (!this.bugProjects.some(p => p.id === projectId)) throw new Error('请选择项目')
    const title = str(input?.title).trim().slice(0, 300)
    if (title === '') throw new Error('Bug 标题不能为空')
    const existing = this.bugs.find(b => b.id === id)
    const status = ['open', 'doing', 'verify', 'resolved'].includes(str(input?.status)) ? str(input?.status) : 'open'
    const severity = ['blocker', 'major', 'minor', 'trivial'].includes(str(input?.severity)) ? str(input?.severity) : 'minor'
    const priority = ['P0', 'P1', 'P2', 'P3'].includes(str(input?.priority)) ? str(input?.priority) : 'P2'
    const bug = {
      id,
      projectId,
      code: str(input?.code) || existing?.code || `BUG-${randomUUID().slice(0, 4).toUpperCase()}`,
      title,
      description: str(input?.description).slice(0, 50_000),
      status,
      severity,
      priority,
      plannedDate: str(input?.plannedDate).trim().slice(0, 10),
      tags: cleanTags(input?.tags),
      verification: str(input?.verification).slice(0, 20_000),
      aiThreadId: str(input?.aiThreadId),
      moduleId: str(input?.moduleId),
      platform: ['pc', 'mobile', 'tablet', 'all'].includes(str(input?.platform)) ? str(input?.platform) : 'all',
      assignee: str(input?.assignee).trim().slice(0, 40) || '我',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      resolvedAt: status === 'resolved' ? (existing?.resolvedAt ?? now) : null,
    }
    if (existing) Object.assign(existing, bug)
    else this.bugs.push(bug)
    this.persistNews()
    return bug
  }

  updateBug(input: any): any {
    const bug = this.bugs.find(b => b.id === str(input?.bugId))
    if (!bug) throw new Error('Bug 不存在')
    return this.saveBug({
      ...bug,
      status: str(input?.status) || bug.status,
      verification: appendVerification(bug.verification, input?.verification),
      aiThreadId: str(input?.aiThreadId) || bug.aiThreadId,
    })
  }

  deleteBug(id: string): void {
    this.bugs = this.bugs.filter(b => b.id !== id)
    this.persistNews()
  }

  stats(): { tasks: number; spaces: number; focus: number } {
    return { tasks: this.state.tasks.length, spaces: this.state.spaces.length, focus: this.state.focus.length }
  }

  sqliteVersion(): string { return '' }
}

function safeJson(raw: unknown, fallback: unknown): unknown {
  if (typeof raw !== 'string') return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}

function toSubtask(s: any): unknown {
  return { id: s.id, title: s.title, done: Number(s.done) === 1, start: s.planned_start ?? '', end: s.planned_end ?? '', note: s.note ?? '' }
}

function toAttachment(a: any): unknown {
  return { id: a.id, name: a.name, kind: a.kind, size: a.size ?? null }
}

function groupBy(rows: any[], key: string): Map<string, any[]> {
  const map = new Map<string, any[]>()
  for (const row of rows) {
    const value = row[key]
    const bucket = map.get(value)
    if (bucket) bucket.push(row)
    else map.set(value, [row])
  }
  return map
}

function toNewsTopic(row: any): any {
  return {
    id: row.id,
    title: row.title,
    query: row.query,
    scheduleKind: row.schedule_kind,
    times: safeJson(row.times, []),
    weekday: Number(row.weekday ?? 1),
    customCron: row.custom_cron ?? '',
    scheduleText: row.schedule_text ?? '',
    cronTaskIds: safeJson(row.cron_task_ids, []),
    enabled: Number(row.enabled) === 1,
    count: Number(row.count ?? 6),
    lastRunAt: row.last_run_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toNewsItem(row: any): any {
  return {
    id: row.id,
    topicId: row.topic_id,
    title: row.title,
    url: row.url,
    source: row.source ?? '',
    publishedAt: row.published_at ?? '',
    summary: row.summary ?? '',
    aiSummary: row.ai_summary ?? '',
    fetchedAt: row.fetched_at,
  }
}

function cleanTimes(value: unknown): string[] {
  const out: string[] = []
  for (const raw of list(value)) {
    const text = str(raw).trim()
    const m = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
    if (m) out.push(`${m[1]}:${m[2]}`)
  }
  return Array.from(new Set(out)).sort()
}

function cleanNewsItems(value: unknown): Array<{ title: string; url: string; source: string; publishedAt: string; summary: string; aiSummary: string; hash: string }> {
  const out: Array<{ title: string; url: string; source: string; publishedAt: string; summary: string; aiSummary: string; hash: string }> = []
  for (const raw of list(value).slice(0, 20)) {
    const title = str(raw?.title).trim().slice(0, 300)
    const urlText = str(raw?.url).trim()
    if (title === '' || urlText === '') continue
    let url = ''
    try {
      const parsed = new URL(urlText)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') url = parsed.toString().slice(0, 2000)
    } catch { /* 非法 URL 丢弃 */ }
    if (url === '') continue
    const source = str(raw?.source).trim().slice(0, 120)
    const publishedAt = str(raw?.publishedAt).trim().slice(0, 40)
    const summary = str(raw?.summary).trim().slice(0, 600)
    const aiSummary = str(raw?.aiSummary).trim().slice(0, 1600)
    const hash = createHash('sha256').update(url.toLowerCase()).digest('hex').slice(0, 32)
    out.push({ title, url, source, publishedAt, summary, aiSummary, hash })
    if (out.length >= 20) break
  }
  return out
}

function normalizeExportDir(raw: string): string {
  let dir = str(raw).trim()
  if (dir === '' || dir === '~') dir = homedir()
  else if (dir.startsWith('~/')) dir = join(homedir(), dir.slice(2))
  if (!isAbsolute(dir)) dir = resolve(homedir(), dir)
  dir = resolve(dir)
  try {
    mkdirSync(dir, { recursive: true })
    if (!statSync(dir).isDirectory()) throw new Error('不是目录')
    accessSync(dir, fsConstants.W_OK)
  } catch (cause) {
    throw new Error(`保存目录不可写：${dir}（${String((cause as Error)?.message ?? cause)}）`)
  }
  return dir
}

function sanitizeFilename(raw: string): string {
  const cleaned = str(raw).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70)
  return cleaned === '' ? '未命名笔记' : cleaned
}

function uniqueExportPath(dir: string, base: string, ext: string): string {
  let path = join(dir, `${base}${ext}`)
  let i = 2
  while (existsSync(path)) { path = join(dir, `${base} (${i})${ext}`); i += 1 }
  return path
}

/** 工作区路径校验：非空时必须是存在且可写的绝对路径（防止 .dsh-workbench 写进 DSH 进程 cwd）。 */
function normalizeWorkspacePath(raw: unknown): string {
  const path = str(raw).trim()
  if (path === '') return ''
  if (!isAbsolute(path)) throw new Error(`工作区路径必须是绝对路径：${path}`)
  const resolved = resolve(path)
  if (!existsSync(resolved)) throw new Error(`工作区路径不存在：${resolved}`)
  try {
    if (!statSync(resolved).isDirectory()) throw new Error('不是目录')
    accessSync(resolved, fsConstants.W_OK)
  } catch (cause) {
    throw new Error(`工作区路径不可用：${resolved}（${String((cause as Error)?.message ?? cause)}）`)
  }
  return resolved
}

/** 追加式验证记录：保留历史，每条带时间戳。 */
function appendVerification(previous: unknown, addition: unknown): string {
  const prev = str(previous).trimEnd()
  const add = str(addition).trim()
  if (add === '') return prev
  if (prev === '') return `[${isoDateTimeSeconds()}]\n${add}`
  return `${prev}\n\n[${isoDateTimeSeconds()}]\n${add}`
}

function escapeHtmlHost(text: string): string {
  return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try { if (existsSync(candidate)) return candidate } catch { /* ignore */ }
  }
  return null
}

async function runChromePdf(chrome: string, htmlPath: string, pdfPath: string): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-wb-chrome-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-crash-reporter',
    '--no-pdf-header-footer', '--virtual-time-budget=1200',
    `--user-data-dir=${profile}`, `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
  ]
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ }; reject(new Error('Chrome 打印超时')) }, 45_000)
      child.stderr?.on('data', chunk => { stderr = `${stderr}${String(chunk)}`.slice(-1200) })
      child.on('error', cause => { clearTimeout(timer); reject(cause) })
      child.on('close', code => {
        clearTimeout(timer)
        if (code === 0) resolvePromise()
        else reject(new Error(`Chrome 退出 ${code}：${stderr.replace(/\s+/g, ' ').slice(-300)}`))
      })
    })
  } finally {
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  if (!existsSync(pdfPath) || statSync(pdfPath).size === 0) throw new Error('Chrome 没有生成 PDF')
}

async function printHtmlToPdf(html: string, pdfPath: string): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-wb-pdf-'))
  const htmlPath = join(tmp, 'note.html')
  writeFileSync(htmlPath, html, 'utf8')
  try {
    const chrome = findChrome()
    if (chrome !== null) {
      try {
        await runChromePdf(chrome, htmlPath, pdfPath)
        if (existsSync(pdfPath) && statSync(pdfPath).size > 0) return
      } catch (cause) {
        console.warn(`[dsh-workbench] Chrome PDF 失败，尝试 Electron：${String(cause)}`)
      }
    }
    // Electron 内置回退（宿主在 Electron 主进程时可 用）
    const electron = require('electron')
    if (electron?.BrowserWindow === undefined) throw new Error('当前环境没有可用的 PDF 渲染器')
    const win = new electron.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } })
    try {
      await win.loadFile(htmlPath)
      const data = await win.webContents.printToPDF({
        printBackground: true, pageSize: 'A4', landscape: false, displayHeaderFooter: false,
        margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      })
      writeFileSync(pdfPath, data)
    } finally {
      try { win.destroy() } catch { /* ignore */ }
    }
    if (!existsSync(pdfPath) || statSync(pdfPath).size === 0) throw new Error('Electron 没有生成 PDF')
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

function notePdfHtml(note: any, notebookName: string, bodyHtml: string): string {
  const tags = cleanTags(note.tags)
  let safeBody = String(bodyHtml ?? '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  const heading = safeBody.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (heading) {
    const plain = heading[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
    if (plain === note.title.trim()) safeBody = safeBody.slice(heading[0].length)
  }
  const body = safeBody.trim() === '' ? `<pre>${escapeHtmlHost(note.content)}</pre>` : safeBody
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtmlHost(note.title)}</title>
<style>
@page{size:A4;margin:18mm 16mm}
*{box-sizing:border-box}
body{margin:0;color:#1f1f1f;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:11.5pt;line-height:1.75;-webkit-print-color-adjust:exact}
h1{font-size:23pt;line-height:1.3;margin:0 0 8pt;color:#111}
h1,h2,h3,h4{break-after:avoid}
h2{font-size:15.5pt;margin:16pt 0 6pt;border-bottom:1px solid #e7e2da;padding-bottom:4pt}
h3{font-size:13pt;margin:12pt 0 4pt}
p{margin:5pt 0;color:#333}
ul,ol{margin:5pt 0;padding-left:18pt}
li{margin:2pt 0}
blockquote{margin:8pt 0;padding:6pt 10pt;border-left:3px solid #c2410c;background:#faf7f2;color:#555}
code{font-family:"SFMono-Regular",Menlo,monospace;font-size:9.5pt;background:#f3f1ed;padding:1pt 3pt;border-radius:3pt}
pre{background:#f7f5f1;border:1px solid #e7e2da;border-radius:5pt;padding:8pt 10pt;white-space:pre-wrap;word-break:break-word}
pre code{background:none;padding:0}
a{color:#b45309;text-decoration:none}
img{max-width:100%;border-radius:5pt}
hr{border:0;border-top:1px solid #e7e2da;margin:12pt 0}
.meta{color:#777;font-size:9.5pt;margin:0 0 14pt;padding-bottom:8pt;border-bottom:1px solid #e7e2da}
.md-check{color:#c2410c;margin-right:3pt}
</style></head><body>
<h1>${escapeHtmlHost(note.title)}</h1>
<div class="meta">笔记本：${escapeHtmlHost(notebookName)}${tags.length > 0 ? ` · 标签：${escapeHtmlHost(tags.map(t => `#${t}`).join(' '))}` : ''} · 导出：${escapeHtmlHost(isoDateTimeSeconds())}</div>
${body}
</body></html>`
}

async function revealExportPath(store: SqliteStore | JsonStore, rawPath: string): Promise<any> {
  const config = store.getExportConfig()
  const dir = normalizeExportDir(config.exportDir)
  const target = resolve(str(rawPath))
  if (!existsSync(target)) throw new Error('文件或目录不存在')
  const rel = relative(dir, target)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('只能打开保存目录中的文件')
  const stat = statSync(target)
  const directory = stat.isDirectory() ? target : dirname(target)

  try {
    const electron = require('electron')
    const shell = electron?.shell
    if (shell?.showItemInFolder !== undefined && stat.isFile()) {
      shell.showItemInFolder(target)
      return { ok: true, path: target, directory }
    }
    if (shell?.openPath !== undefined) {
      const error = await shell.openPath(directory)
      if (!error) return { ok: true, path: target, directory }
    }
  } catch { /* Electron 不可用，走系统命令 */ }

  const [cmd, args] = process.platform === 'darwin'
    ? ['open', stat.isFile() ? ['-R', target] : [directory]]
    : process.platform === 'win32'
      ? ['explorer.exe', stat.isFile() ? [`/select,${target}`] : [directory]]
      : ['xdg-open', [directory]]
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'ignore' })
    const timer = setTimeout(() => { try { child.kill() } catch { /* ignore */ }; reject(new Error('打开文件夹超时')) }, 10_000)
    child.on('error', cause => { clearTimeout(timer); reject(cause) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`打开文件夹失败（退出 ${code}）`))
    })
  })
  return { ok: true, path: target, directory }
}

async function exportNoteFile(store: SqliteStore | JsonStore, noteId: string, format: string, bodyHtml: string): Promise<any> {
  const note = store.listNotes().find((n: any) => n.id === noteId)
  if (!note) throw new Error('笔记不存在')
  const notebook = store.listNotebooks().find((n: any) => n.id === note.notebookId)
  const notebookName = notebook?.name ?? '未分类'
  const config = store.getExportConfig()
  const dir = normalizeExportDir(config.exportDir)
  const base = sanitizeFilename(note.title || '未命名笔记')
  const isPdf = format === 'pdf'
  const ext = isPdf ? '.pdf' : '.md'
  const path = uniqueExportPath(dir, base, ext)
  if (isPdf) {
    try {
      await printHtmlToPdf(notePdfHtml(note, notebookName, bodyHtml), path)
    } catch (cause) {
      try { if (existsSync(path)) rmSync(path, { force: true }) } catch { /* ignore */ }
      throw cause
    }
  } else {
    let content = String(note.content ?? '')
    const title = note.title.trim() || '未命名笔记'
    const firstLine = content.split('\n')[0] ?? ''
    if (/^#\s+/.test(firstLine) && firstLine.replace(/^#\s+/, '').trim() === title) {
      content = content.split('\n').slice(1).join('\n').replace(/^\n+/, '')
    }
    const tags = cleanTags(note.tags)
    const meta = `> 笔记本：${notebookName}${tags.length > 0 ? ` · 标签：${tags.map(t => `#${t}`).join(' ')}` : ''} · 导出：${isoDateTimeSeconds()}\n\n`
    writeFileSync(path, `<!-- 由 dsh-workbench 导出 -->\n# ${title}\n\n${meta}${content}\n`, 'utf8')
  }
  return { ok: true, path, filename: basename(path), format: isPdf ? 'pdf' : 'md', dir }
}

function syncNoteFile(note: { id: string; title: string; content: string }, notebook: any): string {
  const workspace = str(notebook?.workspace_path).trim()
  if (workspace === '') return ''
  const dir = join(workspace, '.dsh-workbench', 'notes', sanitizeFilename(str(notebook?.name) || '笔记本'))
  mkdirSync(dir, { recursive: true })
  const suffix = note.id.slice(-6)
  const path = join(dir, `${sanitizeFilename(note.title)}-${suffix}.md`)
  writeFileSync(path, `# ${note.title}\n\n${note.content}\n`, 'utf8')
  return path
}

function removeFile(path: string): void {
  try { if (existsSync(path)) rmSync(path, { force: true }) } catch { /* ignore */ }
}

function toBug(row: any): any {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code ?? '',
    title: row.title,
    description: row.description ?? '',
    status: row.status ?? 'open',
    severity: row.severity ?? 'minor',
    priority: row.priority ?? 'P2',
    plannedDate: row.planned_date ?? '',
    tags: safeJson(row.tags, []),
    verification: row.verification ?? '',
    aiThreadId: row.ai_thread_id ?? '',
    moduleId: row.module_id ?? '',
    platform: row.platform ?? 'all',
    assignee: row.assignee ?? '我',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? null,
  }
}

function writeTestCasesSnapshot(project: any, cases: any[]): void {
  try {
    const workspace = str(project?.workspace_path ?? project?.workspacePath).trim()
    if (workspace === '') return
    const dir = join(workspace, '.dsh-workbench', 'tests', project.id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases, null, 2), 'utf8')
    writeFileSync(join(dir, 'project.json'), JSON.stringify(toTestProject(project), null, 2), 'utf8')
  } catch (cause) { console.warn(`[dsh-workbench] 测试快照写入失败：${String(cause)}`) }
}

function writeTestRunSnapshot(project: any, run: any): void {
  try {
    const workspace = str(project?.workspace_path ?? project?.workspacePath).trim()
    if (workspace === '') return
    const dir = join(workspace, '.dsh-workbench', 'tests', project.id, 'runs')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${run.id}.json`), JSON.stringify(run, null, 2), 'utf8')
  } catch (cause) { console.warn(`[dsh-workbench] 测试运行快照写入失败：${String(cause)}`) }
}

function toProject(row: any): any {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    workspacePath: row.workspace_path ?? '',
    workspaceName: row.workspace_name ?? '',
    archivedAt: row.archived_at ?? '',
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toBugProject(row: any): any {
  return {
    id: row.id,
    name: row.name,
    workspacePath: row.workspace_path ?? '',
    workspaceName: row.workspace_name ?? '',
    projectId: row.project_id ?? '',
    count: Number(row.count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toTestProject(row: any): any {
  return {
    id: row.id, name: row.name, description: row.description ?? '', workspacePath: row.workspace_path ?? '',
    productId: row.product_id ?? '', moduleId: row.module_id ?? '', platform: row.platform ?? 'all', bugProjectId: row.bug_project_id ?? '',
    deployMode: row.deploy_mode ?? 'local', sshHost: row.ssh_host ?? '', remoteDir: row.remote_dir ?? '',
    image: row.image ?? '', containerName: row.container_name ?? '', hostPort: row.host_port ?? '', containerPort: row.container_port ?? '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function toTestCase(row: any): any {
  return {
    id: row.id, projectId: row.project_id, title: row.title, precondition: row.precondition ?? '',
    steps: safeJson(row.steps, []), expected: row.expected ?? '', priority: row.priority ?? 'P2',
    type: row.type ?? 'functional', source: row.source ?? 'manual', moduleId: row.module_id ?? '', platform: row.platform ?? 'all', createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function toTestRun(row: any): any {
  return {
    id: row.id, projectId: row.project_id, name: row.name, status: row.status ?? 'running',
    results: safeJson(row.results, []), summary: safeJson(row.summary, {}), deployLog: row.deploy_log ?? '',
    createdAt: row.created_at, finishedAt: row.finished_at ?? null,
  }
}

function toModule(row: any): any {
  return {
    id: row.id, productId: row.product_id, mapId: row.map_id ?? '', parentId: row.parent_id ?? '', name: row.name,
    kind: row.kind ?? 'module', platform: row.platform ?? 'all', description: row.description ?? '',
    noteId: row.note_id ?? '', status: row.status ?? 'designing',
    nodeId: row.node_id ?? '', sortOrder: Number(row.sort_order ?? 0),
    archivedAt: row.archived_at ?? '',
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function toProductProgress(row: any): any {
  return {
    id: row.id, productId: row.product_id, kind: row.kind ?? 'modules', demoId: row.demo_id ?? '',
    mapId: row.map_id ?? '', step: Number(row.step ?? 0), total: Number(row.total ?? 0),
    status: row.status ?? 'running', message: row.message ?? '', log: jsonList(row.log),
    sessionId: row.session_id ?? '', updatedAt: row.updated_at,
  }
}

function toProduct(row: any): any {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    workspacePath: row.workspace_path ?? '',
    notebookId: row.notebook_id ?? '',
    mindmap: row.mindmap ?? '{"nodes":[]}',
    styles: safeJson(row.styles, []),
    archivedAt: row.archived_at ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 行 → v2 图：graph_json 优先；旧数据就地从 v1 mindmap 转（不写库，只读侧兼容）。 */
function mapGraphOf(row: any): ProductMapGraph {
  const raw = String(row?.graph_json ?? '').trim()
  if (raw !== '') {
    try { return (JSON.parse(raw) as ProductMapGraph) } catch { /* 回退 v1 转换 */ }
  }
  return productGraphFromV1(row?.mindmap ?? '{"nodes":[]}', '产品').graph
}

function toProductMap(row: any): any {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    description: row.description ?? '',
    mindmap: row.mindmap ?? '{"nodes":[]}',
    graph: mapGraphOf(row),
    graphRev: Number(row.draft_rev ?? 0),
    currentVersionId: row.current_version_id ?? '',
    source: row.source ?? 'manual',
    sourceRef: row.source_ref ?? '',
    summary: row.summary ?? '',
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 截图 dataURL 解码：只放行常见图片格式，单张上限 2MB。 */
function decodeImageDataUrl(dataUrl: unknown): { mime: string; buffer: Buffer } | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) return null
  const mime = match[1].toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) return null
  return { mime, buffer }
}

/** 产品素材目录：<工作区>/.dsh-workbench/products/<产品id>/inputs */
function productInputDir(product: any): string {
  const workspace = str(product?.workspace_path ?? product?.workspacePath).trim()
  if (workspace === '') throw new Error('产品未关联工作区，无法保存截图')
  return join(workspace, '.dsh-workbench', 'products', str(product?.id), 'inputs')
}

/** 导图 JSON 规范化：保证有 nodes 数组且至少有一个根节点。 */
function normalizeMindmap(raw: unknown, fallbackName: string): string {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as any : raw as any
    if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) return JSON.stringify(parsed)
  } catch { /* 回退到默认根节点 */ }
  return JSON.stringify({ nodes: [{ id: 'root', label: fallbackName, type: 'root', parentId: null, note: '' }] })
}

function toProductDemo(row: any): any {
  return {
    id: row.id,
    productId: row.product_id,
    mapId: row.map_id ?? '',
    style: row.style,
    scope: row.scope,
    featureId: row.feature_id ?? '',
    title: row.title,
    filePath: row.file_path,
    createdAt: row.created_at,
    platform: row.platform ?? 'all',
    kind: row.kind ?? 'page',
    status: row.status ?? 'ready',
  }
}


function toDemoProgress(row: any): any {
  return {
    id: row.id,
    productId: row.product_id,
    demoId: row.demo_id ?? '',
    step: Number(row.step ?? 0),
    total: Number(row.total ?? 0),
    status: row.status ?? 'running',
    message: row.message ?? '',
    log: jsonList(row.log),
    updatedAt: row.updated_at,
  }
}

/** 灵感 URL 校验：只放行 http/https，防止 javascript: 等注入。 */
function normalizeHttpUrl(raw: unknown): string {
  const url = str(raw).trim()
  if (url === '') return ''
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error(`链接无效：${url}`) }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('链接只支持 http/https')
  return parsed.toString().slice(0, 500)
}

function toNote(row: any): any {
  return {
    id: row.id,
    notebookId: row.notebook_id ?? '',
    title: row.title,
    content: row.content ?? '',
    tags: safeJson(row.tags, []),
    pinned: Number(row.pinned) === 1,
    filePath: row.file_path ?? '',
    mapId: row.map_id ?? '',
    kind: row.kind ?? '',
    nodeId: row.node_id ?? '',
    moduleId: row.module_id ?? '',
    docKey: row.doc_key ?? '',
    archivedAt: row.archived_at ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function cleanTags(value: unknown): string[] {
  const out: string[] = []
  for (const raw of list(value)) {
    const tag = str(raw).trim().replace(/^#/, '').slice(0, 24)
    if (tag !== '' && !out.includes(tag)) out.push(tag)
    if (out.length >= 20) break
  }
  return out
}

function welcomeNote(): any {
  const now = isoDateTimeSeconds()
  return {
    id: 'note-welcome',
    notebookId: 'nb-default',
    title: '欢迎使用记事本',
    tags: ['指南'],
    pinned: true,
    createdAt: now,
    updatedAt: now,
    content: `# 欢迎使用记事本

这是工作台里的随手记，和任务、新闻放在一起，数据保存在本机 SQLite。

## 能做什么

- **自动保存**：停止输入后写入本机，不需要手动保存
- **Markdown**：标题、列表、引用、代码块、链接、图片
- **笔记本 / 标签 / 收藏 / 搜索**：按笔记本分类，快速找回
- **另存 / PDF**：导出 Markdown 或 PDF 到设置里的保存目录
- **转为任务**：把一条笔记一键变成看板任务

## 小技巧

> 右侧切到「预览」可以看 Markdown 渲染效果。

\`\`\`js
const note = 'hello workbench'
console.log(note)
\`\`\`

祝记录顺利。`,
  }
}

/* ------------------------------------------------------------------ */
/* 首次示例数据                                                        */
/* ------------------------------------------------------------------ */

function seedState(): State {
  const today = isoDate()
  const now = isoDateTime()
  const spaces = [
    { id: 'work', name: '工作', color: '#d97706' },
    { id: 'study', name: '学习', color: '#0f9f6e' },
    { id: 'life', name: '生活', color: '#2563eb' },
  ]
  const task = (id: string, title: string, space: string, status: string, opts: Record<string, unknown> = {}): any => ({
    id, title, desc: '', note: '', space, status, priority: 'normal', tags: [], date: today,
    start: '', end: '', duration: 0, group: '', createdAt: now, updatedAt: now, completedAt: null,
    subtasks: [], attachments: [], logs: [], ...opts,
  })
  const tasks = [
    task('seed-1', '学习 Excel 条件求和', 'study', 'doing', {
      desc: '上次：已读第 3 节讲义，接下来：完成函数练习，再整理易错点。',
      note: '上次：已读第 3 节讲义。\n接下来：完成函数练习，再整理易错点。\n\n打开讲义，完成 SUMIF 与 SUMIFS 组合练习。',
      priority: 'high', tags: ['个人学习'], start: '14:00', end: '14:45', duration: 45, group: 'Excel 学习',
      subtasks: [
        { id: 'seed-1-s1', title: '读完函数讲义', done: true, start: '14:00', end: '14:20', note: '' },
        { id: 'seed-1-s2', title: '完成函数练习', done: false, start: '14:35', end: '14:45', note: '' },
        { id: 'seed-1-s3', title: '整理两个易错点', done: false, start: '14:45', end: '15:00', note: '' },
      ],
      attachments: [
        { id: 'seed-1-a1', name: '1.pdf', kind: 'pdf' },
        { id: 'seed-1-a2', name: '表.csv', kind: 'csv' },
      ],
      logs: [
        { at: `${today} 14:02`, type: 'status', text: '开始执行' },
        { at: `${today} 13:58`, type: 'edit', text: '设置时间 14:00–14:45' },
        { at: `${today} 13:55`, type: 'created', text: '创建任务' },
      ],
    }),
    task('seed-2', '预约体检时间', 'life', 'next', { desc: '先看可预约日期，再确认检查前注意事项。', start: '15:00', end: '15:10', duration: 10 }),
    task('seed-3', '整理本月支出', 'life', 'next', { desc: '核对本账记录，补上漏记的支出。', start: '16:00', end: '16:20', duration: 20 }),
    task('seed-4', '列出周一要处理的三件事', 'work', 'next', { desc: '只列需要先动手的三件事。', start: '17:30', end: '17:40', duration: 10 }),
    task('seed-5', '复习昨天的两个错题', 'study', 'next', { desc: '先独立重做一遍，再对照答案。', start: '19:30', end: '19:50', duration: 20 }),
    task('seed-6', '等报销审核结果', 'life', 'waiting', { desc: '已提交资料，周一查看审核进度。', start: '08:00', end: '18:00', duration: 600 }),
    task('seed-7', '整理本周工作记录', 'work', 'done', {
      desc: '把本周工作记录归档，并补上遗漏项。', start: '09:00', end: '09:30', duration: 30, completedAt: `${today} 09:31`,
      logs: [{ at: `${today} 09:31`, type: 'completed', text: '完成任务' }],
    }),
    task('seed-8', '整理文件与备份', 'life', 'done', {
      desc: '把本周文件按项目归档并备份。', start: '20:00', end: '20:30', duration: 30, completedAt: `${today} 20:32`,
      logs: [{ at: `${today} 20:32`, type: 'completed', text: '完成任务' }],
    }),
    task('seed-9', '整理会议记录', 'work', 'next', {
      desc: '整理周会记录，提取三条行动项。', date: addDays(today, 1), start: '09:30', end: '10:00', duration: 30,
    }),
    task('seed-10', '练习公式一组', 'study', 'next', {
      desc: 'VLOOKUP + IF 嵌套，先看例题再独立完成。', date: addDays(today, 2), start: '14:00', end: '14:40', duration: 40,
    }),
  ]
  return { spaces, tasks, focus: [], settings: { theme: 'auto', weekStart: 'sun' } }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

interface RouteRequest {
  url?: string
  method?: string
  on?: (event: string, cb: (...args: any[]) => void) => void
  json?: () => Promise<unknown>
}
interface RouteResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: unknown): void
}
interface WebServerFace {
  register(route: { kind: string; path: string; handler: (req: RouteRequest, res: RouteResponse) => void }): () => void
}

function send(res: RouteResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(body)
}

function readJson(req: RouteRequest): Promise<any> {
  if (typeof req.json === 'function') return req.json()
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    if (typeof req.on !== 'function') { reject(new Error('请求体不可读')); return }
    req.on('data', chunk => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BODY_BYTES) { reject(new Error('请求体过大')); return }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (cause) { reject(cause) }
    })
    req.on('error', reject)
  })
}

function normalizeState(raw: any): State {
  if (!raw || typeof raw !== 'object') throw new Error('缺少 state')
  return {
    spaces: list(raw.spaces),
    tasks: list(raw.tasks),
    focus: list(raw.focus),
    settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
  }
}

let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

/**
 * 给定时任务里的 DSH agent 暴露一个「写入新闻」工具。
 * 工具只做一件事：校验 + 去重 + 落库，避免让模型直接操作数据库。
 */
function registerNewsTool(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') {
    console.warn('[dsh-workbench] tools 服务不可用：workbench_news_publish 未注册')
    return
  }
  const tool = {
    name: 'workbench_news_publish',
    description: '把一次新闻检索的结果写入个人工作台的新闻订阅。'
      + '仅用于定时新闻任务：传入订阅 id 与新闻数组（title/source/url/publishedAt/summary）。'
      + '服务端会按 URL 去重；没有新闻时传空数组。不要用它写其他内容。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        topicId: { type: 'string', description: '新闻订阅 id（由任务提示词给出）。' },
        items: {
          type: 'array',
          description: '最多 20 条新闻；没有合适新闻时传空数组。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', description: '新闻标题（准确标题或准确译名）。' },
              url: { type: 'string', description: 'http/https 原文链接，不得编造。' },
              source: { type: 'string', description: '来源媒体名。' },
              publishedAt: { type: 'string', description: '发布时间 YYYY-MM-DD，可留空。' },
              summary: { type: 'string', description: '中文一句话摘要，不超过 60 字。' },
              aiSummary: { type: 'string', description: 'AI 总结：100–180 字中文，说明事件、关键数据与影响/看点；卡片会直接展示。' },
            },
            required: ['title', 'url'],
          },
        },
      },
      required: ['topicId', 'items'],
    },
    output: {
      schema: {},
      render: (_args: unknown, value: any) => {
        if (value?.ok) return [{ type: 'text', text: `已写入 ${value.inserted} 条新闻，跳过重复 ${value.skipped} 条。` }]
        return [{ type: 'text', text: `写入失败：${String(value?.error ?? 'unknown')}` }]
      },
    },
    async execute(args: any): Promise<any> {
      try {
        const topicId = str(args?.topicId).trim()
        if (topicId === '') return { ok: false, inserted: 0, skipped: 0, error: 'topicId 不能为空' }
        const items = list(args?.items)
        return await serialized(() => store.publishNews(topicId, items))
      } catch (cause) {
        return { ok: false, inserted: 0, skipped: 0, error: String((cause as Error)?.message ?? cause) }
      }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), 'workbench: news publish tool')
  else ctx.tools.register(tool)
  console.log('[dsh-workbench] 已注册工具 workbench_news_publish')
}

function registerBugTool(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') {
    console.warn('[dsh-workbench] tools 服务不可用：workbench_bug_update 未注册')
    return
  }
  const tool = {
    name: 'workbench_bug_update',
    description: '更新个人工作台里 Bug 的状态与验证说明。仅用于 Bug 修复任务：修复并在工作区验证后调用；status 取 open/doing/verify/resolved，verified 才设 resolved。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        bugId: { type: 'string', description: 'Bug id（任务提示词里给出的 id）。' },
        status: { type: 'string', enum: ['open', 'doing', 'verify', 'resolved'], description: '新状态。' },
        verification: { type: 'string', description: '验证方式与结果（测试/构建/复现步骤），会显示在 Bug 详情里。' },
        note: { type: 'string', description: '可选补充说明。' },
      },
      required: ['bugId', 'status'],
    },
    output: {
      schema: {},
      render: (_args: unknown, value: any) => {
        if (value?.ok) return [{ type: 'text', text: `已更新 ${value.bug?.code ?? value.bug?.id} → ${value.bug?.status}` }]
        return [{ type: 'text', text: `更新失败：${String(value?.error ?? 'unknown')}` }]
      },
    },
    async execute(args: any): Promise<any> {
      try {
        const bugId = str(args?.bugId).trim()
        if (bugId === '') return { ok: false, error: 'bugId 不能为空' }
        const verification = [str(args?.verification), str(args?.note)].filter(Boolean).join('\n')
        const bug = await serialized(() => store.updateBug({ bugId, status: args?.status, verification }))
        return { ok: true, bug }
      } catch (cause) {
        return { ok: false, error: String((cause as Error)?.message ?? cause) }
      }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), 'workbench: bug update tool')
  else ctx.tools.register(tool)
  console.log('[dsh-workbench] 已注册工具 workbench_bug_update')
}

function registerModuleTool(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') return
  const tool = {
    name: 'workbench_module_publish',
    description: '写入产品模块/业务/功能/需求节点；kind=module|business|feature|requirement，platform=pc|mobile|tablet|all。AI 拆分产品模块时逐条调用。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        productId: { type: 'string' }, mapId: { type: 'string', description: '导图 id（不传则归到该产品第一张导图）。' },
        parentId: { type: 'string', description: '父级模块 id（顶层留空）' },
        nodeId: { type: 'string', description: '对应的导图节点 id（可选，便于导图与模块互相跳转）' },
        name: { type: 'string' },
        kind: { type: 'string', enum: ['module', 'business', 'feature', 'requirement'] },
        platform: { type: 'string', enum: ['pc', 'mobile', 'tablet', 'all'] },
        description: { type: 'string' }, noteId: { type: 'string' }, status: { type: 'string' },
      },
      required: ['productId', 'name', 'kind'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已写入${v.module?.kind ?? '模块'}「${v.module?.name ?? ''}」` : `写入失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try { return { ok: true, module: await serialized(() => store.saveModule(args)) } }
      catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), 'workbench: module tool')
  else ctx.tools.register(tool)
  console.log('[dsh-workbench] 已注册工具 workbench_module_publish')

  /* 模块/笔记生成进度上报：让产品页的进度条真正动起来（与 demo 进度同构） */
  const progressTool = {
    name: 'product_progress_publish',
    description: '产品模块/笔记生成进度上报。开始时 step=0 status=running；每写完一个模块调用一次（step 递增）；结束 status=done；失败 status=failed 并说明原因。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        productId: { type: 'string' },
        kind: { type: 'string', enum: ['modules', 'notes'], description: '生成的是模块还是设计笔记' },
        mapId: { type: 'string' },
        step: { type: 'number' }, total: { type: 'number' },
        status: { type: 'string', enum: ['running', 'done', 'failed'] },
        message: { type: 'string' },
      },
      required: ['productId', 'step', 'total', 'status', 'message'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `进度 ${v.progress?.step ?? 0}/${v.progress?.total ?? 0} 已记录` : `上报失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try { return { ok: true, progress: await serialized(() => store.saveProductProgress(args)) } }
      catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(progressTool), 'workbench: product progress tool')
  else ctx.tools.register(progressTool)
  console.log('[dsh-workbench] 已注册工具 product_progress_publish')

  /* 导图节点写入：把 AI 从素材提炼出的结构落成导图节点（走草稿保存，版本与镜像一致） */
  const nodeTool = {
    name: 'workbench_map_node_publish',
    description: '向产品导图写入一个节点（模块/业务/功能/需求）。AI 从素材提炼导图结构时逐条调用；同名同 kind 同父会更新而非新增。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        productId: { type: 'string' },
        mapId: { type: 'string', description: '目标导图 id（必填，不要新建导图）' },
        parentId: { type: 'string', description: '父节点 id；根节点留空' },
        name: { type: 'string', description: '节点名称（≤12 字）' },
        kind: { type: 'string', enum: ['module', 'business', 'feature', 'requirement'] },
        platform: { type: 'string', enum: ['pc', 'mobile', 'tablet', 'all'] },
        detail: { type: 'string', description: '一句话说明（可选，≤200 字）' },
      },
      required: ['productId', 'mapId', 'name', 'kind'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已写入节点「${v.name ?? ''}」` : `写入失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        const map = await serialized(() => store.addMapNode(args))
        return { ok: true, name: args?.name, nodes: Array.isArray(map?.graph?.nodes) ? map.graph.nodes.length : undefined }
      } catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(nodeTool), 'workbench: map node tool')
  else ctx.tools.register(nodeTool)
  console.log('[dsh-workbench] 已注册工具 workbench_map_node_publish')
}

function registerTestCaseTool(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') return
  const tool = {
    name: 'workbench_testcase_publish',
    description: '把 AI 生成的一条测试用例写入指定测试项目。按功能/需求逐条调用；支持需求文本、产品设计笔记、Demo 页面来源。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        projectId: { type: 'string' }, title: { type: 'string' },
        precondition: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } },
        expected: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        type: { type: 'string' }, source: { type: 'string' },
        moduleId: { type: 'string' }, platform: { type: 'string', enum: ['pc', 'mobile', 'tablet', 'all'] },
      },
      required: ['projectId', 'title', 'steps', 'expected'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已写入用例「${v.case?.title ?? ''}」` : `写入失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try { return { ok: true, case: await serialized(() => store.saveTestCase(args)) } }
      catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), 'workbench: test case tool')
  else ctx.tools.register(tool)
  console.log('[dsh-workbench] 已注册工具 workbench_testcase_publish')
}

function registerTestFlowTools(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') return
  const register = (tool: any, label: string): void => {
    if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), `workbench: ${label}`)
    else ctx.tools.register(tool)
    console.log(`[dsh-workbench] 已注册工具 ${tool.name}`)
  }
  const resultTool = {
    name: 'workbench_test_result_publish',
    description: '把一条测试用例的执行结果写入测试运行（AI 自动化测试的唯一回写通道）。runId 为空时自动新建一次运行。失败/阻塞时请同时给出 bugTitle，自动录入 Bug。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        projectId: { type: 'string', description: '测试项目 id。' },
        runId: { type: 'string', description: '测试运行 id；留空自动新建。' },
        caseId: { type: 'string', description: '用例 id。' },
        status: { type: 'string', enum: ['pass', 'fail', 'blocked', 'pending'] },
        note: { type: 'string', description: '实际结果 / 证据。' },
        bugTitle: { type: 'string', description: 'status=fail/blocked 时录入 Bug 的标题（可选）。' },
        bugDescription: { type: 'string', description: 'Bug 描述（可选）。' },
      },
      required: ['projectId', 'caseId', 'status'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已记录 ${v.result?.status ?? ''}${v.bug ? `，录 Bug ${v.bug.code ?? ''}` : ''}` : `记录失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        return await serialized(() => {
          const projectId = str(args?.projectId)
          const cases = store.listTestCases(projectId)
          const testCase = cases.find((c: any) => c.id === str(args?.caseId))
          if (!testCase) throw new Error('用例不存在')
          let runId = str(args?.runId)
          let run: any = runId ? store.listTestRuns(projectId).find((r: any) => r.id === runId) : undefined
          if (!run) {
            run = store.saveTestRun({ projectId, name: `AI 测试 ${new Date().toLocaleString()}`, status: 'running', results: cases.map((c: any) => ({ caseId: c.id, status: 'pending', note: '', bugId: '' })), summary: {} })
          }
          const results = (run.results as any[]).map((r: any) => r.caseId === testCase.id ? { ...r, status: str(args?.status) || 'fail', note: str(args?.note) || r.note } : r)
          let bug: any
          const bugTitle = str(args?.bugTitle).trim()
          if (bugTitle !== '' && (str(args?.status) === 'fail' || str(args?.status) === 'blocked')) {
            const projects = store.listBugProjects()
            const testProject = store.listTestProjects().find((p: any) => p.id === projectId) as any
            const bugProject = projects.find((p: any) => p.id === testProject?.bugProjectId) ?? projects[0]
            if (bugProject) {
              bug = store.saveBug({
                projectId: bugProject.id, title: bugTitle,
                description: str(args?.bugDescription) || `来源：AI 自动化测试 / ${testCase.title}`,
                status: 'open', severity: testCase.priority === 'P0' ? 'blocker' : testCase.priority === 'P1' ? 'major' : 'minor',
                priority: testCase.priority, platform: testCase.platform || 'all', moduleId: testCase.moduleId || '',
                tags: ['测试', testCase.id],
              })
              for (const r of results) if (r.caseId === testCase.id) r.bugId = bug.id
            }
          }
          run = store.saveTestRun({ ...run, results })
          return { ok: true, result: results.find((r: any) => r.caseId === testCase.id), runId: run.id, bug }
        })
      } catch (cause) {
        return { ok: false, error: String((cause as Error)?.message ?? cause) }
      }
    },
  }
  const bugTool = {
    name: 'workbench_bug_publish',
    description: '在 Bug 项目里新建一条 Bug（AI 测试发现问题或用户要求录 Bug 时使用）。修复回写请用 workbench_bug_update。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        projectId: { type: 'string', description: 'Bug 项目 id（测试项目自动建的「测试：X」项目可在上下文中找到）。' },
        title: { type: 'string' },
        description: { type: 'string' },
        severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'trivial'] },
        priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
        platform: { type: 'string', enum: ['pc', 'mobile', 'tablet', 'all'] },
        moduleId: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['projectId', 'title'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已录 Bug ${v.bug?.code ?? ''}「${v.bug?.title ?? ''}」` : `录入失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        const bug = await serialized(() => store.saveBug({ ...args, status: 'open' }))
        return { ok: true, bug }
      } catch (cause) {
        return { ok: false, error: String((cause as Error)?.message ?? cause) }
      }
    },
  }
  register(resultTool, 'test result tool')
  register(bugTool, 'bug publish tool')
}

async function runDockerDeploy(project: any): Promise<{ ok: boolean; log: string }> {
  const image = str(project.image) || 'dsh-workbench-test'
  const container = str(project.containerName) || 'dsh-workbench-test'
  const hostPort = str(project.hostPort) || '8080'
  const containerPort = str(project.containerPort) || '80'
  const lines: string[] = []
  const run = (cmd: string, args: string[], cwd?: string): Promise<boolean> => new Promise(resolve => {
    lines.push(`$ ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { cwd, shell: false, env: process.env })
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; lines.push('TIMEOUT'); child.kill('SIGKILL'); resolve(false) } }, 120_000)
    child.stdout.on('data', d => lines.push(String(d).trimEnd()))
    child.stderr.on('data', d => lines.push(String(d).trimEnd()))
    child.on('error', cause => { lines.push(String(cause)); if (!done) { done = true; clearTimeout(timer); resolve(false) } })
    child.on('close', code => { if (!done) { done = true; clearTimeout(timer); lines.push(`exit ${code}`); resolve(code === 0) } })
  })
  if (project.deployMode === 'ssh') {
    if (!str(project.sshHost)) return { ok: false, log: '未配置 SSH 主机' }
    // 防命令注入：拼进远端 shell 的字段全部走白名单校验，非法即拒绝
    const safeToken = (value: string, label: string, pattern: RegExp): string => {
      const v = value.trim()
      if (v === '') return ''
      if (!pattern.test(v)) throw new Error(`${label} 含非法字符：${v}`)
      return v
    }
    let remote: string
    try {
      const sshHost = safeToken(str(project.sshHost), 'SSH 主机', /^[A-Za-z0-9_.@:-]+$/)
      const remoteDir = safeToken(str(project.remoteDir) || '.', '远端目录', /^[A-Za-z0-9_./-]+$/)
      const image2 = safeToken(image, '镜像名', /^[A-Za-z0-9_.:-]+$/)
      const container2 = safeToken(container, '容器名', /^[A-Za-z0-9_.-]+$/)
      const hostPort2 = safeToken(hostPort, '宿主端口', /^\d{1,5}$/)
      const containerPort2 = safeToken(containerPort, '容器端口', /^\d{1,5}$/)
      remote = `cd ${remoteDir} && docker build -t ${image2} . ; docker rm -f ${container2} ; docker run -d --name ${container2} -p ${hostPort2}:${containerPort2} ${image2}`
      const ok = await run('ssh', [sshHost, remote])
      return { ok, log: lines.join('\n') }
    } catch (cause) {
      return { ok: false, log: `部署参数非法，已阻止执行：${String((cause as Error)?.message ?? cause)}` }
    }
  }
  const workspace = str(project.workspacePath)
  const built = await run('docker', ['build', '-t', image, workspace || '.'], workspace || undefined)
  if (!built) return { ok: false, log: lines.join('\n') }
  await run('docker', ['rm', '-f', container])
  const started = await run('docker', ['run', '-d', '--name', container, '-p', `${hostPort}:${containerPort}`, image])
  return { ok: started, log: lines.join('\n') }
}

function registerNoteTool(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') return
  const tool = {
    name: 'workbench_note_update',
    description: '用 AI 完善后的完整 Markdown 更新一篇工作台笔记；保留所属笔记本、标签与收藏，只改标题/正文。仅用于工作台笔记完善。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        noteId: { type: 'string', description: '笔记 id。' },
        title: { type: 'string', description: '可选新标题；不传保留原标题。' },
        content: { type: 'string', description: '完整改进后的 Markdown 正文。' },
      },
      required: ['noteId', 'content'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已更新笔记「${v.note?.title ?? ''}」` : `更新失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        const noteId = str(args?.noteId)
        const existing = store.listNotes().find((n: any) => n.id === noteId)
        if (!existing) return { ok: false, error: '笔记不存在' }
        const note = await serialized(() => store.saveNote({
          ...existing,
          title: str(args?.title) || existing.title,
          content: str(args?.content),
        }))
        return { ok: true, note }
      } catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), 'workbench: note update tool')
  else ctx.tools.register(tool)
  console.log('[dsh-workbench] 已注册工具 workbench_note_update')
}

function registerProductTools(ctx: any, store: SqliteStore | JsonStore): void {
  if (ctx?.tools === undefined || typeof ctx.tools.register !== 'function') {
    console.warn('[dsh-workbench] tools 服务不可用：产品工具未注册')
    return
  }
  const noteTool = {
    name: 'workbench_product_note_publish',
    description: '把一条产品设计笔记写入工作台的产品笔记本（走现有 notes 保存与工作区 Markdown 镜像）。产品 AI 生成 PRD 时按功能/需求逐条调用。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        productId: { type: 'string', description: '产品 id。' },
        mapId: { type: 'string', description: '导图 id（不传则归到该产品第一张导图）。' },
        featureId: { type: 'string', description: '导图节点 id（功能/需求）。' },
        moduleId: { type: 'string', description: '模块/业务节点 id。' },
        platform: { type: 'string', enum: ['pc', 'mobile', 'tablet', 'all'], description: '端。' },
        title: { type: 'string', description: '笔记标题。' },
        content: { type: 'string', description: '完整设计笔记 Markdown（背景/目标/用户故事/流程/交互/边界/验收）。' },
        tags: { type: 'array', items: { type: 'string' }, description: '可选标签。' },
      },
      required: ['productId', 'title', 'content'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已写入笔记「${v.note?.title ?? ''}」` : `写入失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        const note = await serialized(() => store.publishProductNote(args))
        return { ok: true, note }
      } catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  const demoTool = {
    name: 'workbench_product_demo_publish',
    description: '把产品设计笔记/灵感生成的自包含 HTML Demo 写入工作区并登记，供工作台预览。支持单页（kind=page）与多页产品系统（kind=system，单文件内用导航切页）。style 取值见工作台主题库（clean/editorial/neo/glass/dashboard/bento/tech/cream/aurora/clay/brutal 等）。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        productId: { type: 'string' },
        mapId: { type: 'string', description: '导图 id（不传则归到该产品第一张导图）。' },
        scope: { type: 'string', enum: ['feature', 'all'] },
        kind: { type: 'string', enum: ['page', 'system'], description: 'page=单页面原型；system=带导航的多页产品系统。' },
        platform: { type: 'string', enum: ['pc', 'mobile', 'tablet', 'all'], description: '目标端，影响布局与主题。' },
        style: { type: 'string', description: '主题 id：clean | editorial | neo | glass | dashboard | bento | tech | cream | aurora | clay | brutal | padflow' },
        featureId: { type: 'string', description: 'scope=feature 时的导图节点 id。' },
        title: { type: 'string' },
        html: { type: 'string', description: '完整单文件 HTML（内联 CSS/JS，无外部依赖）。' },
      },
      required: ['productId', 'scope', 'style', 'html'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已生成 Demo「${v.demo?.title ?? ''}」` : `生成失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        const demo = await serialized(() => store.saveProductDemo(args))
        return { ok: true, demo }
      } catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  const progressTool = {
    name: 'workbench_demo_progress_publish',
    description: 'Demo 生成过程中的进度上报。开始时 step=0 status=running；每个里程碑调用一次；结束时 status=done；失败时 status=failed 并说明原因。工作台 Demo 页会实时展示。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        productId: { type: 'string' },
        demoId: { type: 'string', description: 'Demo id（若已有）。' },
        step: { type: 'number', description: '当前步（从 1 开始）。' },
        total: { type: 'number', description: '总步数。' },
        status: { type: 'string', enum: ['running', 'done', 'failed'] },
        message: { type: 'string', description: '当前步骤说明（做了什么/正在做什么）。' },
      },
      required: ['productId', 'step', 'total', 'status', 'message'],
    },
    output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `进度 ${v.progress?.step ?? 0}/${v.progress?.total ?? 0} 已记录` : `上报失败：${String(v?.error ?? '')}` }] },
    async execute(args: any): Promise<any> {
      try {
        const progress = await serialized(() => store.saveDemoProgress(args))
        return { ok: true, progress }
      } catch (cause) { return { ok: false, error: String((cause as Error)?.message ?? cause) } }
    },
  }
  const register = (tool: any, label: string): void => {
    if (typeof ctx.effect === 'function') ctx.effect(() => ctx.tools.register(tool), `workbench: ${label}`)
    else ctx.tools.register(tool)
    console.log(`[dsh-workbench] 已注册工具 ${tool.name}`)
  }
  register(noteTool, 'product note tool')
  register(demoTool, 'product demo tool')
  register(progressTool, 'demo progress tool')
}

export const name = 'dsh-workbench' 
export const inject = ['webServer', 'tools']

export function apply(ctx: any): void {
  const dbFile = process.env.DSH_WORKBENCH_DB ?? join(dataDir(), 'dsh-workbench.sqlite')
  let store: SqliteStore | JsonStore
  if (DatabaseSync) {
    store = new SqliteStore(dbFile)
  } else {
    store = new JsonStore(dbFile.replace(/\.sqlite$/, '.json'))
  }
  console.log(`[dsh-workbench] ${store.engine} 存储就绪：${store.file}`)

  /*
   * 可选模块（灵感 / 智能体团队）必须彼此隔离：任意一个初始化失败都不能拖垮
   * 主工作台的 /state，否则整个面板会显示「工作台数据读取失败」。
   */
  let ideaModule: ReturnType<typeof createIdeaModule> | null = null
  try {
    if (typeof (store as any).connection === 'function') {
      ideaModule = createIdeaModule({
        db: (store as any).connection(), dataDir: dataDir(), prefix: PREFIX,
        /* run 结束后同步关闭对应团队派发：否则它会一直挂在 running，让该灵感后续派发永远 409。 */
        onRunClosed: (runId, status) => {
          try { agentModule?.store.finishDispatchByRun(runId, status) } catch (cause) { console.warn('[dsh-workbench] 派发收尾失败：', String(cause)) }
        },
        /* 灵感项目也挂到统一项目：同一工作区共用一份项目，四域不再各自维护清单 */
        ensureUnifiedProject: (workspacePath: string, name: string) => {
          try { return (store as any).ensureProject?.(workspacePath, name)?.id ?? '' } catch { return '' }
        },
      })
    }
  } catch (cause) {
    console.warn('[dsh-workbench] 灵感模块初始化失败（其它功能不受影响）：', String(cause))
  }
  if (ideaModule !== null) {
    try { ideaModule.registerTools(ctx) } catch (cause) { console.warn('[dsh-workbench] 灵感工具注册失败：', String(cause)) }
  } else {
    console.warn('[dsh-workbench] 灵感需要 SQLite，当前为 JSON 兜底存储：灵感入口将提示不可用')
  }

  /* 智能体团队：与灵感同库不同表；无 SQLite 时禁用。 */
  let agentModule: ReturnType<typeof createAgentModule> | null = null
  try {
    if (typeof (store as any).connection === 'function') {
      agentModule = createAgentModule({ db: (store as any).connection(), dataDir: dataDir(), prefix: PREFIX, ctx })
    }
  } catch (cause) {
    console.warn('[dsh-workbench] 智能体团队初始化失败（主工作台不受影响）：', String(cause))
  }
  if (agentModule !== null) {
    try { agentModule.registerTools(ctx) } catch (cause) { console.warn('[dsh-workbench] 团队工具注册失败：', String(cause)) }
  } else {
    console.warn('[dsh-workbench] 智能体团队需要 SQLite，当前为 JSON 兜底存储：团队入口将提示不可用')
  }

  registerNewsTool(ctx, store)
  registerBugTool(ctx, store)
  registerProductTools(ctx, store)
  registerNoteTool(ctx, store)
  registerModuleTool(ctx, store)
  registerTestCaseTool(ctx, store)
  registerTestFlowTools(ctx, store)

  const webServer: WebServerFace | undefined = ctx.webServer
  if (webServer === undefined || typeof webServer.register !== 'function') {
    console.warn('[dsh-workbench] webServer 不可用：工作台接口未注册')
    return
  }

  const handler = (req: RouteRequest, res: RouteResponse): void => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const path = url.pathname.slice(PREFIX.length) || '/'
      const method = (req.method ?? 'GET').toUpperCase()

      try {
        if (ideaModule !== null && (await ideaModule.handle(req, res, path, method, url))) return
        if (agentModule !== null && (await agentModule.handle(req, res, path, method, url))) return
        if (method === 'GET' && (path === '/state' || path === '/')) {
          send(res, 200, store.readState())
          return
        }
        if (method === 'GET' && path === '/health') {
          send(res, 200, {
            ok: true,
            engine: store.engine,
            file: basename(store.file),
            sqlite: store.sqliteVersion(),
            revision: store.readState().revision,
            ...store.stats(),
          })
          return
        }
        if (method === 'GET' && path === '/export') {
          send(res, 200, store.readState(), { 'content-disposition': 'attachment; filename="dsh-workbench.json"' })
          return
        }
        if (method === 'PUT' && path === '/state') {
          const body = await readJson(req)
          const state = normalizeState(body?.state)
          const result = await serialized(() => {
            const current = store.readState().revision
            if (body?.revision !== undefined && Number(body.revision) !== current) {
              const conflict: any = new Error('revision_conflict')
              conflict.code = 'revision_conflict'
              conflict.current = store.readState()
              throw conflict
            }
            return { revision: store.writeState(state) }
          })
          send(res, 200, result)
          return
        }
        /* ---------- 增量同步（P1-1）：游标增量 + 墓碑 + 条目级写入 ---------- */
        if (path === '/sync/meta' || path === '/sync/delta' || path === '/sync/push') {
          if (store.engine !== 'sqlite') {
            send(res, 501, { error: 'sync_requires_sqlite', message: '增量同步依赖 node:sqlite 存储；当前为 JSON 兜底' })
            return
          }
          const db = (store as any).connection()
          if (method === 'GET' && path === '/sync/meta') {
            send(res, 200, syncMeta(db))
            return
          }
          if (method === 'GET' && path === '/sync/delta') {
            send(res, 200, syncDelta(db, {
              since: url.searchParams.get('since'),
              entity: url.searchParams.get('entity'),
              limit: url.searchParams.get('limit'),
            }))
            return
          }
          if (method === 'POST' && path === '/sync/push') {
            const body = await readJson(req)
            send(res, 200, await serialized(() => syncPush(db, body, store as unknown as SyncHooks)))
            return
          }
        }
        if (method === 'GET' && path === '/news') {
          send(res, 200, store.listNews())
          return
        }
        if (method === 'POST' && path === '/news/topics') {
          const body = await readJson(req)
          const topic = await serialized(() => store.saveNewsTopic(body?.topic ?? body))
          send(res, 200, { ok: true, topic })
          return
        }
        if (method === 'DELETE' && path.startsWith('/news/topics/')) {
          const id = decodeURIComponent(path.slice('/news/topics/'.length))
          await serialized(() => store.deleteNewsTopic(id))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'GET' && path === '/notes') {
          const withArchived = url.searchParams.get('archived') === '1'
          send(res, 200, { notes: store.listNotes(withArchived), notebooks: store.listNotebooks() })
          return
        }
        if (method === 'GET' && path === '/notes/config') {
          send(res, 200, store.getExportConfig())
          return
        }
        if (method === 'POST' && path === '/notes/config') {
          const body = await readJson(req)
          const config = await serialized(() => store.setExportDir(str(body?.exportDir)))
          send(res, 200, { ok: true, ...config })
          return
        }
        if (method === 'POST' && path === '/notes/export') {
          const body = await readJson(req)
          const format = str(body?.format) === 'pdf' ? 'pdf' : 'md'
          const result = await exportNoteFile(store, str(body?.noteId), format, str(body?.html))
          send(res, 200, result)
          return
        }
        if (method === 'POST' && path === '/notes/reveal') {
          const body = await readJson(req)
          const result = await revealExportPath(store, str(body?.path))
          send(res, 200, result)
          return
        }
        if (method === 'GET' && path === '/tests') {
          send(res, 200, { projects: store.listTestProjects(), cases: store.listTestCases(), runs: store.listTestRuns() })
          return
        }
        if (method === 'POST' && path === '/tests/projects') {
          const body = await readJson(req)
          send(res, 200, { ok: true, project: await serialized(() => store.saveTestProject(body?.project ?? body)) })
          return
        }
        if (method === 'DELETE' && path.startsWith('/tests/projects/')) {
          await serialized(() => store.deleteTestProject(decodeURIComponent(path.slice('/tests/projects/'.length))))
          send(res, 200, { ok: true }); return
        }
        if (method === 'POST' && path === '/tests/cases') {
          const body = await readJson(req)
          send(res, 200, { ok: true, case: await serialized(() => store.saveTestCase(body?.case ?? body)) }); return
        }
        if (method === 'DELETE' && path.startsWith('/tests/cases/')) {
          await serialized(() => store.deleteTestCase(decodeURIComponent(path.slice('/tests/cases/'.length))))
          send(res, 200, { ok: true }); return
        }
        if (method === 'POST' && path === '/tests/runs') {
          const body = await readJson(req)
          send(res, 200, { ok: true, run: await serialized(() => store.saveTestRun(body?.run ?? body)) }); return
        }
        if (method === 'DELETE' && path.startsWith('/tests/runs/')) {
          await serialized(() => store.deleteTestRun(decodeURIComponent(path.slice('/tests/runs/'.length))))
          send(res, 200, { ok: true }); return
        }
        if (method === 'POST' && path === '/tests/report') {
          const body = await readJson(req)
          const filePath = await serialized(() => store.saveTestReport(str(body?.projectId), str(body?.runId), str(body?.html)))
          send(res, 200, { ok: true, filePath }); return
        }
        if (method === 'POST' && path === '/tests/deploy') {
          const body = await readJson(req)
          const project = store.listTestProjects().find(p => p.id === str(body?.projectId))
          if (!project) { send(res, 404, { error: 'project_not_found' }); return }
          const result = await runDockerDeploy(project)
          send(res, 200, result); return
        }
        if (method === 'GET' && path === '/products') {
          const withArchived = url.searchParams.get('archived') === '1'
          send(res, 200, { products: store.listProducts(withArchived), demos: store.listProductDemos(), modules: store.listModules(str(url.searchParams.get('productId')), undefined, withArchived) })
          return
        }
        if (method === 'GET' && path === '/modules') {
          send(res, 200, { modules: store.listModules(str(url.searchParams.get('productId')), str(url.searchParams.get('mapId')), url.searchParams.get('archived') === '1') })
          return
        }
        if (method === 'POST' && path === '/modules') {
          const body = await readJson(req)
          send(res, 200, { ok: true, module: await serialized(() => store.saveModule(body?.module ?? body)) })
          return
        }
        if ((method === 'PATCH' || method === 'PUT') && path.startsWith('/modules/')) {
          const id = decodeURIComponent(path.slice('/modules/'.length))
          const body = await readJson(req)
          /* 局部更新：以 URL 里的 id 为准；缺少 productId 时用原记录补上，避免局部 patch 丢字段 */
          const patch = { ...(body?.module ?? body), id, patch: true }
          if (str(patch?.productId) === '') {
            const existing = store.listModules().find((m: any) => m.id === id) as any
            if (existing !== undefined) { patch.productId = existing.productId; if (patch.mapId === undefined) patch.mapId = existing.mapId; if (patch.name === undefined) patch.name = existing.name; if (patch.kind === undefined) patch.kind = existing.kind; if (patch.platform === undefined) patch.platform = existing.platform }
          }
          send(res, 200, { ok: true, module: await serialized(() => store.saveModule(patch)) })
          return
        }
        /* 统一项目：门户 / Bug / 测试 / 灵感共用一份 */
        if (method === 'GET' && path === '/projects') {
          const archived = url.searchParams.get('archived') === '1'
          if (url.searchParams.get('overview') === '1') { send(res, 200, { overviews: store.listProjectOverviews(archived) }); return }
          send(res, 200, { projects: store.listProjects(archived) })
          return
        }
        if (method === 'POST' && path === '/projects') {
          const body = await readJson(req)
          send(res, 200, { ok: true, project: await serialized(() => store.saveProject(body?.project ?? body)) })
          return
        }
        if (method === 'DELETE' && path.startsWith('/projects/')) {
          await serialized(() => store.deleteProject(decodeURIComponent(path.slice('/projects/'.length))))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'GET' && path === '/products/inputs') {
          send(res, 200, { inputs: store.listProductInputs(str(url.searchParams.get('productId')), str(url.searchParams.get('mapId'))) })
          return
        }
        if (method === 'POST' && path === '/products/inputs') {
          const body = await readJson(req)
          const kind = str(body?.kind) || 'url'
          if (kind === 'image') {
            const product = store.listProducts(true).find(p => p.id === str(body?.productId))
            if (product === undefined) { send(res, 404, { error: 'product_not_found' }); return }
            const decoded = decodeImageDataUrl(body?.dataUrl)
            if (decoded === null) { send(res, 400, { error: 'image_invalid', message: '截图格式不支持或超过 2MB' }); return }
            const dir = productInputDir(product)
            mkdirSync(dir, { recursive: true })
            const ext = decoded.mime === 'image/png' ? 'png' : decoded.mime === 'image/gif' ? 'gif' : decoded.mime === 'image/jpeg' ? 'jpg' : 'webp'
            const file = join(dir, `${randomUUID().slice(0, 8)}.${ext}`)
            writeFileSync(file, decoded.buffer)
            const input = await serialized(() => store.addProductInput({
              productId: body?.productId, mapId: body?.mapId, kind: 'image', filePath: file,
              mime: decoded.mime, width: body?.width, height: body?.height, size: decoded.buffer.length,
              label: body?.label, note: body?.note,
            }))
            send(res, 200, { ok: true, input })
            return
          }
          send(res, 200, { ok: true, input: await serialized(() => store.addProductInput(body ?? {})) })
          return
        }
        if (method === 'DELETE' && path.startsWith('/products/inputs/')) {
          await serialized(() => store.deleteProductInput(decodeURIComponent(path.slice('/products/inputs/'.length))))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'POST' && path === '/archive') {
          const body = await readJson(req)
          const target = str(body?.target)
          if (!['products', 'modules', 'notes'].includes(target)) { send(res, 400, { error: 'bad_target' }); return }
          await serialized(() => store.setArchived(target as any, str(body?.id), body?.archived !== false))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'GET' && path === '/products/design-docs') {
          const productId = str(url.searchParams.get('productId') ?? '')
          send(res, 200, { docs: store.listDesignDocs(productId) })
          return
        }
        if (method === 'GET' && path === '/products/progress') {
          const productId = str(url.searchParams.get('productId') ?? '')
          const kind = str(url.searchParams.get('kind') ?? 'modules') || 'modules'
          send(res, 200, { progress: store.getProductProgress(productId, kind) ?? null })
          return
        }
        if (method === 'POST' && path === '/products/progress') {
          const body = await readJson(req)
          send(res, 200, { ok: true, progress: await serialized(() => store.saveProductProgress(body?.progress ?? body)) })
          return
        }
        if (method === 'DELETE' && path.startsWith('/modules/')) {
          await serialized(() => store.deleteModule(decodeURIComponent(path.slice('/modules/'.length))))
          send(res, 200, { ok: true }); return
        }
        if (method === 'POST' && path === '/products') {
          const body = await readJson(req)
          const product = await serialized(() => store.saveProduct(body?.product ?? body))
          send(res, 200, { ok: true, product })
          return
        }
        if (method === 'DELETE' && path.startsWith('/products/demo/')) {
          const id = decodeURIComponent(path.slice('/products/demo/'.length))
          await serialized(() => store.deleteProductDemo(id))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'GET' && path === '/products/maps') {
          send(res, 200, { maps: store.listProductMaps(str(url.searchParams.get('productId'))) })
          return
        }
        if (method === 'POST' && path === '/products/maps') {
          const body = await readJson(req)
          send(res, 200, { ok: true, map: await serialized(() => store.saveProductMap(body?.map ?? body)) })
          return
        }
        /* 导图草稿（乐观并发）与版本序列（参照灵感） */
        if (method === 'PUT' && path === '/products/maps/draft') {
          const body = await readJson(req)
          try {
            const result = await serialized(() => store.saveMapDraft(body ?? {}))
            send(res, 200, { ok: true, ...result })
          } catch (cause: any) {
            if (cause?.code === 'draft_conflict') { send(res, 409, { error: 'draft_conflict', current: cause.current }); return }
            throw cause
          }
          return
        }
        if (method === 'GET' && path === '/products/maps/versions') {
          send(res, 200, { versions: store.listMapVersions(str(url.searchParams.get('mapId'))) })
          return
        }
        if (method === 'POST' && path === '/products/maps/versions') {
          const body = await readJson(req)
          send(res, 200, { ok: true, version: await serialized(() => store.createMapVersion(body?.version ?? body)) })
          return
        }
        if (method === 'GET' && path === '/products/maps/versions/view') {
          const version = store.getMapVersion(url.searchParams.get('id') ?? '')
          if (!version) { send(res, 404, { error: 'version_not_found' }); return }
          send(res, 200, { version })
          return
        }
        if (method === 'POST' && path === '/products/maps/versions/rollback') {
          const body = await readJson(req)
          const version = await serialized(() => store.rollbackMapVersion(str(body?.mapId), str(body?.versionId)))
          send(res, 200, { ok: true, version })
          return
        }
        if (method === 'DELETE' && path.startsWith('/products/maps/versions/')) {
          await serialized(() => store.deleteMapVersion(decodeURIComponent(path.slice('/products/maps/versions/'.length))))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'DELETE' && path.startsWith('/products/maps/')) {
          const id = decodeURIComponent(path.slice('/products/maps/'.length))
          await serialized(() => store.deleteProductMap(id))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'DELETE' && path.startsWith('/products/') && path !== '/products/demo') {
          const id = decodeURIComponent(path.slice('/products/'.length))
          await serialized(() => store.deleteProduct(id))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'POST' && path === '/products/demo') {
          const body = await readJson(req)
          const demo = await serialized(() => store.saveProductDemo(body))
          send(res, 200, { ok: true, demo })
          return
        }
        if (method === 'POST' && path === '/products/mindmap') {
          const body = await readJson(req)
          const product = await serialized(() => store.saveProductMindmap(str(body?.productId), str(body?.mindmap)))
          send(res, 200, { ok: true, product })
          return
        }
        if (method === 'GET' && path === '/products/demo') {
          const demo = store.getProductDemo(url.searchParams.get('id') ?? '')
          if (!demo) { send(res, 404, { error: 'demo_not_found' }); return }
          try {
            const html = readFileSync(demo.filePath)
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
            res.end(html)
          } catch {
            send(res, 404, { error: 'demo_file_missing' })
          }
          return
        }
        if (method === 'GET' && path === '/products/demo-progress') {
          send(res, 200, { progress: store.getDemoProgress(str(url.searchParams.get('productId') ?? '')) ?? null })
          return
        }
        if (method === 'POST' && path === '/products/demo-progress') {
          const body = await readJson(req)
          const progress = await serialized(() => store.saveDemoProgress(body?.progress ?? body))
          send(res, 200, { ok: true, progress })
          return
        }
        /* GitHub 公开检索代理：无需 token（未认证限额 ~10 次/分钟），供灵感采集用 */
        if (method === 'GET' && path === '/search/github') {
          const q = str(url.searchParams.get('q')).trim().slice(0, 120)
          const perPage = Math.min(12, Math.max(1, Number(url.searchParams.get('perPage') ?? 6) || 6))
          if (q === '') { send(res, 400, { error: 'missing_query' }); return }
          try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 8000)
            const gh = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`, {
              headers: { 'user-agent': 'dsh-workbench', accept: 'application/vnd.github+json' },
              signal: controller.signal,
            })
            clearTimeout(timer)
            if (!gh.ok) throw new Error(`GitHub HTTP ${gh.status}`)
            const data = await gh.json() as any
            const items = Array.isArray(data?.items) ? data.items.map((it: any) => ({
              fullName: String(it?.full_name ?? ''),
              title: String(it?.name ?? it?.full_name ?? ''),
              url: String(it?.html_url ?? ''),
              summary: String(it?.description ?? '').slice(0, 2000),
              stars: Number(it?.stargazers_count ?? 0),
              language: String(it?.language ?? ''),
              topics: Array.isArray(it?.topics) ? it.topics.slice(0, 6).map((t: any) => String(t)) : [],
              updatedAt: String(it?.updated_at ?? ''),
            })) : []
            send(res, 200, {
              ok: true, items,
              quota: { limit: String(gh.headers.get('x-ratelimit-limit') ?? ''), remaining: String(gh.headers.get('x-ratelimit-remaining') ?? '') },
            })
          } catch (cause) {
            send(res, 502, { error: 'github_search_failed', message: String((cause as Error)?.message ?? cause) })
          }
          return
        }
        if (method === 'GET' && path === '/bugs') {
          send(res, 200, { projects: store.listBugProjects(), bugs: store.listBugs() })
          return
        }
        if (method === 'POST' && path === '/bugs/projects') {
          const body = await readJson(req)
          const project = await serialized(() => store.saveBugProject(body?.project ?? body))
          send(res, 200, { ok: true, project })
          return
        }
        if (method === 'DELETE' && path.startsWith('/bugs/projects/')) {
          const id = decodeURIComponent(path.slice('/bugs/projects/'.length))
          await serialized(() => store.deleteBugProject(id))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'POST' && path === '/bugs/status') {
          const body = await readJson(req)
          const bug = await serialized(() => store.updateBug({ bugId: str(body?.bugId), status: str(body?.status), verification: str(body?.verification) }))
          send(res, 200, { ok: true, bug }); return
        }
        if (method === 'POST' && path === '/bugs') {
          const body = await readJson(req)
          const bug = await serialized(() => store.saveBug(body?.bug ?? body))
          send(res, 200, { ok: true, bug })
          return
        }
        if (method === 'DELETE' && path.startsWith('/bugs/')) {
          const id = decodeURIComponent(path.slice('/bugs/'.length))
          await serialized(() => store.deleteBug(id))
          send(res, 200, { ok: true })
          return
        }
        if (method === 'GET' && path === '/notebooks') {
          send(res, 200, { notebooks: store.listNotebooks() })
          return
        }
        if (method === 'POST' && path === '/notebooks') {
          const body = await readJson(req)
          const notebook = await serialized(() => store.saveNotebook(body?.notebook ?? body))
          send(res, 200, { ok: true, notebook })
          return
        }
        if (method === 'DELETE' && path.startsWith('/notebooks/')) {
          const id = decodeURIComponent(path.slice('/notebooks/'.length))
          const result = await serialized(() => store.deleteNotebook(id))
          send(res, 200, result)
          return
        }
        if (method === 'POST' && path === '/notes') {
          const body = await readJson(req)
          const note = await serialized(() => store.saveNote(body?.note ?? body))
          send(res, 200, { ok: true, note })
          return
        }
        if (method === 'DELETE' && path.startsWith('/notes/')) {
          const id = decodeURIComponent(path.slice('/notes/'.length))
          await serialized(() => store.deleteNote(id))
          send(res, 200, { ok: true })
          return
        }
        send(res, 404, { error: 'not_found' })
      } catch (cause: any) {
        if (cause?.code === 'revision_conflict') {
          send(res, 409, { error: 'revision_conflict', current: cause.current })
          return
        }
        console.warn(`[dsh-workbench] ${method} ${path} 失败：${String(cause)}`)
        send(res, 400, { error: 'bad_request', message: String(cause?.message ?? cause) })
      }
    })()
  }

  const route = { kind: 'prefix', path: PREFIX, handler }
  if (typeof ctx.effect === 'function') ctx.effect(() => webServer.register(route), 'workbench: /workbench-api')
  else webServer.register(route)
}
