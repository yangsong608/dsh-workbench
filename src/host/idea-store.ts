/**
 * 灵感 · 存储层（SQLite）
 *
 * 与主存储共用同一个 DatabaseSync 连接（同一 SQLite 文件只留一个写者，避免锁竞争），
 * 但**不进主快照**：灵感数据一律走独立表与独立端点，避免「保存任务时把灵感图覆盖」。
 */
import { randomUUID } from 'node:crypto'
import { IDEA_LIMITS, normalizeGraph, type IdeaGraph } from './idea-model.js'

type AnyMap = Record<string, any>

export interface IdeaRow { [key: string]: any }

function now(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback
  try {
    const parsed = JSON.parse(raw)
    return (parsed === null ? fallback : parsed) as T
  } catch {
    return fallback
  }
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS idea_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  current_version_id TEXT NOT NULL DEFAULT '',
  draft_rev INTEGER NOT NULL DEFAULT 0,
  draft_json TEXT NOT NULL DEFAULT '',
  custom_angles TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS idea_inputs (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idea_versions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'ai',
  mode TEXT NOT NULL DEFAULT 'diverge',
  target_node_id TEXT NOT NULL DEFAULT '',
  angles_json TEXT NOT NULL DEFAULT '[]',
  input_digest TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  graph_json TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idea_runs (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  version_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'diverge',
  target_node_id TEXT NOT NULL DEFAULT '',
  angles_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  step INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  log_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ideas_project ON ideas(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_inputs_idea ON idea_inputs(idea_id, created_at);
CREATE INDEX IF NOT EXISTS idx_versions_idea ON idea_versions(idea_id, seq);
CREATE INDEX IF NOT EXISTS idx_runs_idea ON idea_runs(idea_id, started_at);
`

export class IdeaStore {
  private db: any

  constructor(db: any) {
    this.db = db
    this.db.exec(SCHEMA)
    this.migrateColumns()
    this.migrateLegacy()
  }

  /** 旧库补列：ideas.custom_angles（1.7 新增）。 */
  private migrateColumns(): void {
    try {
      const cols = (this.db.prepare('PRAGMA table_info(ideas)').all() as AnyMap[]).map(c => String(c.name))
      if (!cols.includes('custom_angles')) {
        this.db.exec("ALTER TABLE ideas ADD COLUMN custom_angles TEXT NOT NULL DEFAULT '[]'")
      }
    } catch (cause) {
      console.warn('[dsh-workbench] 灵感表补列失败（不影响使用）：', String(cause))
    }
  }

  /** 旧「灵感调研库」改名归档，不删数据。 */
  private migrateLegacy(): void {
    try {
      const legacy = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_inspirations'").get()
      if (!legacy) return
      const archived = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_inspirations_legacy'").get()
      if (archived) return
      this.db.exec('ALTER TABLE product_inspirations RENAME TO product_inspirations_legacy')
      console.log('[dsh-workbench] 旧灵感库已归档为 product_inspirations_legacy')
    } catch (cause) {
      console.warn('[dsh-workbench] 旧灵感库归档失败（不影响新功能）：', String(cause))
    }
  }

  /* ------------------------------ 项目 ------------------------------ */

  listProjects(): AnyMap[] {
    return this.db.prepare('SELECT * FROM idea_projects ORDER BY updated_at DESC').all().map((row: AnyMap) => ({
      id: row.id,
      name: row.name,
      workspacePath: row.workspace_path,
      workspaceName: row.workspace_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  /**
   * 保存项目。同名（同工作区路径）视为同一个项目，避免「门户新增一次、灵感再建一次」。
   * 返回 created 标记，供前端提示「已从门户同步 N 个」。
   */
  saveProject(input: AnyMap): { project: AnyMap; created: boolean } {
    const ts = now()
    const name = String(input?.name ?? '').trim().slice(0, 60) || '未命名项目'
    const workspacePath = String(input?.workspacePath ?? '').trim().slice(0, 500)
    const workspaceName = String(input?.workspaceName ?? '').trim().slice(0, 80)
      || (workspacePath === '' ? '' : workspacePath.split('/').filter(Boolean).pop() ?? '')
    const wantedId = typeof input?.id === 'string' && input.id !== '' ? input.id : ''
    const byId = wantedId !== ''
      ? this.db.prepare('SELECT id FROM idea_projects WHERE id = ?').get(wantedId) as AnyMap | undefined
      : undefined
    const byPath = byId === undefined && workspacePath !== ''
      ? this.db.prepare('SELECT id FROM idea_projects WHERE workspace_path = ? AND workspace_path <> \'\'').get(workspacePath) as AnyMap | undefined
      : undefined
    const existing = byId ?? byPath
    const id = String(existing?.id ?? (wantedId !== '' ? wantedId : `ip-${randomUUID().slice(0, 8)}`))
    if (existing !== undefined) {
      this.db.prepare('UPDATE idea_projects SET name=?, workspace_path=?, workspace_name=?, updated_at=? WHERE id=?')
        .run(name, workspacePath, workspaceName, ts, id)
    } else {
      this.db.prepare('INSERT INTO idea_projects(id, name, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?)')
        .run(id, name, workspacePath, workspaceName, ts, ts)
    }
    return { project: this.listProjects().find((p: AnyMap) => p.id === id) ?? {}, created: existing === undefined }
  }

  deleteProject(id: string): void {
    const ideas = this.db.prepare('SELECT id FROM ideas WHERE project_id = ? AND deleted_at IS NULL').all(id) as AnyMap[]
    for (const idea of ideas) this.deleteIdea(String(idea.id))
    this.db.prepare('DELETE FROM idea_projects WHERE id = ?').run(id)
  }

  /* ------------------------------ 灵感 ------------------------------ */

  private ideaRow(row: AnyMap): AnyMap {
    const draft = parseJson<IdeaGraph | null>(row.draft_json, null)
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      brief: row.brief,
      status: row.status,
      currentVersionId: row.current_version_id || '',
      draftRev: Number(row.draft_rev ?? 0),
      customAngles: parseJson<Array<{ id: string; label: string }>>(row.custom_angles, []),
      graph: draft,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  listIdeas(filter: { projectId?: string; q?: string } = {}): AnyMap[] {
    const rows = this.db.prepare('SELECT * FROM ideas WHERE deleted_at IS NULL ORDER BY updated_at DESC').all() as AnyMap[]
    const q = (filter.q ?? '').trim().toLowerCase()
    return rows
      .filter(row => (filter.projectId === undefined || filter.projectId === '' || row.project_id === filter.projectId))
      .filter(row => q === '' || String(row.title).toLowerCase().includes(q) || String(row.brief).toLowerCase().includes(q))
      .map(row => {
        const meta = this.ideaRow(row)
        const graph = parseJson<IdeaGraph | null>(row.draft_json, null)
        const version = row.current_version_id
          ? this.db.prepare('SELECT seq FROM idea_versions WHERE id = ?').get(row.current_version_id) as AnyMap | undefined
          : undefined
        return {
          id: meta.id,
          projectId: meta.projectId,
          title: meta.title,
          brief: meta.brief,
          status: meta.status,
          draftRev: meta.draftRev,
          versionSeq: version?.seq ?? 0,
          nodeCount: Array.isArray(graph?.nodes) ? graph!.nodes.length : 0,
          updatedAt: meta.updatedAt,
        }
      })
  }

  getIdea(id: string): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL').get(id) as AnyMap | undefined
    if (!row) return undefined
    return this.ideaRow(row)
  }

  createIdea(input: AnyMap): AnyMap {
    const ts = now()
    const id = `idea-${randomUUID().slice(0, 10)}`
    const title = String(input?.title ?? '').trim().slice(0, IDEA_LIMITS.title) || '未命名灵感'
    const brief = String(input?.brief ?? '').slice(0, IDEA_LIMITS.brief)
    const projectId = String(input?.projectId ?? '').trim().slice(0, 64)
    const customAngles = Array.isArray(input?.customAngles) ? input.customAngles.slice(0, 6) : []
    const graph = normalizeGraph(null, { title }).graph
    this.db.prepare('INSERT INTO ideas(id, project_id, title, brief, status, current_version_id, draft_rev, draft_json, custom_angles, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, projectId, title, brief, 'draft', '', 1, JSON.stringify(graph), JSON.stringify(customAngles), ts, ts)
    return this.getIdea(id) ?? {}
  }

  updateIdea(id: string, patch: AnyMap): AnyMap {
    const row = this.db.prepare('SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL').get(id) as AnyMap | undefined
    if (!row) throw new Error('灵感不存在')
    const title = patch.title === undefined ? row.title : (String(patch.title).trim().slice(0, IDEA_LIMITS.title) || row.title)
    const brief = patch.brief === undefined ? row.brief : String(patch.brief).slice(0, IDEA_LIMITS.brief)
    const projectId = patch.projectId === undefined ? row.project_id : String(patch.projectId).slice(0, 64)
    const customAngles = patch.customAngles === undefined
      ? String(row.custom_angles ?? '[]')
      : JSON.stringify(Array.isArray(patch.customAngles) ? patch.customAngles.slice(0, 6) : [])
    this.db.prepare('UPDATE ideas SET title=?, brief=?, project_id=?, custom_angles=?, updated_at=? WHERE id=?')
      .run(title, brief, projectId, customAngles, now(), id)
    return this.getIdea(id) ?? {}
  }

  deleteIdea(id: string): void {
    this.db.prepare('DELETE FROM idea_inputs WHERE idea_id = ?').run(id)
    this.db.prepare('DELETE FROM idea_runs WHERE idea_id = ?').run(id)
    this.db.prepare('DELETE FROM idea_versions WHERE idea_id = ?').run(id)
    this.db.prepare('DELETE FROM ideas WHERE id = ?').run(id)
  }

  setStatus(id: string, status: string): void {
    this.db.prepare('UPDATE ideas SET status=?, updated_at=? WHERE id=?').run(status, now(), id)
  }

  /* ------------------------------ 输入 ------------------------------ */

  listInputs(ideaId: string): AnyMap[] {
    return (this.db.prepare('SELECT * FROM idea_inputs WHERE idea_id = ? ORDER BY created_at').all(ideaId) as AnyMap[]).map(row => ({
      id: row.id,
      ideaId: row.idea_id,
      kind: row.kind,
      text: row.text,
      url: row.url,
      filePath: row.file_path,
      mime: row.mime,
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
      size: Number(row.size ?? 0),
      createdAt: row.created_at,
    }))
  }

  getInput(id: string): AnyMap | undefined {
    return this.db.prepare('SELECT * FROM idea_inputs WHERE id = ?').get(id) as AnyMap | undefined
  }

  addInput(ideaId: string, input: AnyMap): AnyMap {
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM idea_inputs WHERE idea_id = ?').get(ideaId) as AnyMap)?.n ?? 0)
    if (count >= IDEA_LIMITS.inputs) throw new Error(`最多 ${IDEA_LIMITS.inputs} 个输入`)
    const id = `in-${randomUUID().slice(0, 8)}`
    this.db.prepare('INSERT INTO idea_inputs(id, idea_id, kind, text, url, file_path, mime, width, height, size, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        id, ideaId,
        String(input?.kind ?? 'text').slice(0, 12),
        String(input?.text ?? '').slice(0, 2000),
        String(input?.url ?? '').slice(0, 1000),
        String(input?.filePath ?? '').slice(0, 1000),
        String(input?.mime ?? '').slice(0, 60),
        Math.max(0, Math.round(Number(input?.width ?? 0) || 0)),
        Math.max(0, Math.round(Number(input?.height ?? 0) || 0)),
        Math.max(0, Math.round(Number(input?.size ?? 0) || 0)),
        now(),
      )
    this.db.prepare('UPDATE ideas SET updated_at=? WHERE id=?').run(now(), ideaId)
    return this.listInputs(ideaId).find(item => item.id === id) ?? {}
  }

  deleteInput(ideaId: string, inputId: string): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM idea_inputs WHERE id = ? AND idea_id = ?').get(inputId, ideaId) as AnyMap | undefined
    if (!row) return undefined
    this.db.prepare('DELETE FROM idea_inputs WHERE id = ?').run(inputId)
    return row
  }

  /* ------------------------------ 草稿 ------------------------------ */

  getDraft(id: string): { rev: number; graph: IdeaGraph; status: string } {
    const row = this.db.prepare('SELECT draft_rev, draft_json, status FROM ideas WHERE id = ? AND deleted_at IS NULL').get(id) as AnyMap | undefined
    if (!row) throw new Error('灵感不存在')
    const graph = normalizeGraph(parseJson(row.draft_json, null), {}).graph
    return { rev: Number(row.draft_rev ?? 0), graph, status: row.status }
  }

  /** 乐观并发：rev 不一致时抛 CONFLICT，附带当前草稿。 */
  setDraft(id: string, graph: IdeaGraph, rev: number | undefined): { rev: number } {
    const row = this.db.prepare('SELECT draft_rev FROM ideas WHERE id = ? AND deleted_at IS NULL').get(id) as AnyMap | undefined
    if (!row) throw new Error('灵感不存在')
    const current = Number(row.draft_rev ?? 0)
    if (rev !== undefined && Number(rev) !== current) {
      const error: any = new Error('draft_conflict')
      error.code = 'draft_conflict'
      throw error
    }
    const next = current + 1
    const serialized = JSON.stringify(graph)
    if (Buffer.byteLength(serialized, 'utf8') > IDEA_LIMITS.graph) throw new Error('导图数据过大')
    this.db.prepare('UPDATE ideas SET draft_json=?, draft_rev=?, updated_at=? WHERE id=?').run(serialized, next, now(), id)
    return { rev: next }
  }

  /* ------------------------------ 版本 ------------------------------ */

  private versionRow(row: AnyMap): AnyMap {
    return {
      id: row.id,
      ideaId: row.idea_id,
      seq: Number(row.seq ?? 0),
      label: row.label,
      source: row.source,
      mode: row.mode,
      targetNodeId: row.target_node_id,
      angles: parseJson<string[]>(row.angles_json, []),
      inputDigest: row.input_digest,
      summary: row.summary,
      nodeCount: Number(row.node_count ?? 0),
      edgeCount: Number(row.edge_count ?? 0),
      createdAt: row.created_at,
    }
  }

  listVersions(ideaId: string): AnyMap[] {
    return (this.db.prepare('SELECT * FROM idea_versions WHERE idea_id = ? ORDER BY seq DESC').all(ideaId) as AnyMap[])
      .map(row => this.versionRow(row))
  }

  getVersion(ideaId: string, versionId: string): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM idea_versions WHERE id = ? AND idea_id = ?').get(versionId, ideaId) as AnyMap | undefined
    if (!row) return undefined
    return { ...this.versionRow(row), graph: parseJson<IdeaGraph>(row.graph_json, { v: 1, rootId: 'root', nodes: [], edges: [] }) }
  }

  latestVersion(ideaId: string): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM idea_versions WHERE idea_id = ? ORDER BY seq DESC LIMIT 1').get(ideaId) as AnyMap | undefined
    return row ? this.versionRow(row) : undefined
  }

  createVersion(ideaId: string, input: AnyMap): AnyMap {
    const row = this.db.prepare('SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL').get(ideaId) as AnyMap | undefined
    if (!row) throw new Error('灵感不存在')
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM idea_versions WHERE idea_id = ?').get(ideaId) as AnyMap)?.n ?? 0)
    if (count >= IDEA_LIMITS.versions) throw new Error(`每个灵感最多 ${IDEA_LIMITS.versions} 个版本，请先删除旧版本`)
    const graph = normalizeGraph(input?.graph, { title: row.title }).graph
    const serialized = JSON.stringify(graph)
    if (Buffer.byteLength(serialized, 'utf8') > IDEA_LIMITS.graph) throw new Error('导图数据过大')
    const seq = Number((this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM idea_versions WHERE idea_id = ?').get(ideaId) as AnyMap)?.s ?? 0) + 1
    const id = `v-${randomUUID().slice(0, 8)}`
    const ts = now()
    this.db.prepare(`INSERT INTO idea_versions(id, idea_id, seq, label, source, mode, target_node_id, angles_json, input_digest, summary, graph_json, node_count, edge_count, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        id, ideaId, seq,
        String(input?.label ?? '').slice(0, 60) || `v${seq}`,
        String(input?.source ?? 'ai').slice(0, 12),
        String(input?.mode ?? 'diverge').slice(0, 12),
        String(input?.targetNodeId ?? '').slice(0, 64),
        JSON.stringify(Array.isArray(input?.angles) ? input.angles.slice(0, 8) : []),
        String(input?.inputDigest ?? '').slice(0, 32),
        String(input?.summary ?? '').slice(0, 500),
        serialized,
        graph.nodes.length,
        graph.edges.length,
        ts,
      )
    this.db.prepare("UPDATE ideas SET current_version_id=?, draft_json=?, draft_rev=draft_rev+1, status=?, updated_at=? WHERE id=?")
      .run(id, serialized, 'ready', ts, ideaId)
    return this.versionRow(this.db.prepare('SELECT * FROM idea_versions WHERE id = ?').get(id) as AnyMap)
  }

  /** 回滚：把该版本作为新草稿并记一个新版本，历史不丢。 */
  rollback(ideaId: string, versionId: string): AnyMap {
    const version = this.getVersion(ideaId, versionId)
    if (!version) throw new Error('版本不存在')
    const row = this.db.prepare('SELECT title FROM ideas WHERE id = ? AND deleted_at IS NULL').get(ideaId) as AnyMap | undefined
    if (!row) throw new Error('灵感不存在')
    return this.createVersion(ideaId, {
      graph: version.graph,
      source: 'rollback',
      mode: 'restore',
      label: `回滚到 v${version.seq}`,
      summary: `从 v${version.seq} 恢复`,
      angles: version.angles,
    })
  }

  deleteVersion(ideaId: string, versionId: string): void {
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM idea_versions WHERE idea_id = ?').get(ideaId) as AnyMap)?.n ?? 0)
    if (count <= 1) throw new Error('至少保留一个版本')
    this.db.prepare('DELETE FROM idea_versions WHERE id = ? AND idea_id = ?').run(versionId, ideaId)
    const latest = this.latestVersion(ideaId)
    this.db.prepare('UPDATE ideas SET current_version_id=? WHERE id=?').run(latest?.id ?? '', ideaId)
  }

  /* ------------------------------ 运行 ------------------------------ */

  private runRow(row: AnyMap): AnyMap {
    return {
      id: row.id,
      ideaId: row.idea_id,
      versionId: row.version_id,
      kind: row.kind,
      targetNodeId: row.target_node_id,
      angles: parseJson<string[]>(row.angles_json, []),
      status: row.status,
      step: Number(row.step ?? 0),
      total: Number(row.total ?? 0),
      message: row.message,
      log: parseJson<Array<{ at: string; message: string }>>(row.log_json, []),
      sessionId: row.session_id,
      error: row.error,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }
  }

  createRun(ideaId: string, input: AnyMap): AnyMap {
    const id = `run-${randomUUID().slice(0, 8)}`
    this.db.prepare(`INSERT INTO idea_runs(id, idea_id, version_id, kind, target_node_id, angles_json, status, step, total, message, log_json, session_id, error, started_at, finished_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, ideaId, '', String(input?.kind ?? 'diverge').slice(0, 12), String(input?.targetNodeId ?? '').slice(0, 64),
        JSON.stringify(Array.isArray(input?.angles) ? input.angles.slice(0, 8) : []),
        'running', 0, Math.max(1, Number(input?.total ?? 5) || 5), '已创建生成任务', '[]', '', '', now(), '')
    this.db.prepare("UPDATE ideas SET status='generating', updated_at=? WHERE id=?").run(now(), ideaId)
    return this.getRun(id) ?? {}
  }

  getRun(id: string): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM idea_runs WHERE id = ?').get(id) as AnyMap | undefined
    return row ? this.runRow(row) : undefined
  }

  updateRun(id: string, patch: AnyMap): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM idea_runs WHERE id = ?').get(id) as AnyMap | undefined
    if (!row) return undefined
    const fields: string[] = []
    const values: any[] = []
    const set = (column: string, value: any): void => { fields.push(`${column}=?`); values.push(value) }
    if (patch.status !== undefined) set('status', String(patch.status).slice(0, 12))
    if (patch.step !== undefined) set('step', Math.max(0, Math.round(Number(patch.step) || 0)))
    if (patch.total !== undefined) set('total', Math.max(1, Math.round(Number(patch.total) || 1)))
    if (patch.message !== undefined) set('message', String(patch.message).slice(0, 300))
    if (patch.log !== undefined) set('log_json', JSON.stringify(patch.log).slice(0, 20000))
    if (patch.versionId !== undefined) set('version_id', String(patch.versionId).slice(0, 64))
    if (patch.sessionId !== undefined) set('session_id', String(patch.sessionId).slice(0, 64))
    if (patch.error !== undefined) set('error', String(patch.error).slice(0, 500))
    if (patch.finished !== undefined) set('finished_at', patch.finished ? now() : '')
    if (fields.length > 0) {
      values.push(id)
      this.db.prepare(`UPDATE idea_runs SET ${fields.join(', ')} WHERE id=?`).run(...values)
    }
    return this.getRun(id)
  }

  latestRun(ideaId: string): AnyMap | undefined {
    const row = this.db.prepare('SELECT * FROM idea_runs WHERE idea_id = ? ORDER BY started_at DESC LIMIT 1').get(ideaId) as AnyMap | undefined
    return row ? this.runRow(row) : undefined
  }

  /** 收尾：把草稿冻成版本并结束 run。 */
  finalizeRun(runId: string, input: AnyMap): AnyMap | undefined {
    const run = this.getRun(runId)
    if (!run) return undefined
    if (run.status === 'done' && run.versionId !== '') return run
    const idea = this.getIdea(run.ideaId)
    if (!idea) return undefined
    const draft = this.getDraft(run.ideaId)
    const version = this.createVersion(run.ideaId, {
      graph: draft.graph,
      source: 'ai',
      mode: run.kind,
      targetNodeId: run.targetNodeId,
      angles: run.angles,
      summary: String(input?.summary ?? run.message ?? '').slice(0, 500),
      label: input?.label,
      inputDigest: input?.inputDigest,
    })
    return this.updateRun(runId, { status: 'done', versionId: version.id, finished: true, message: '已生成' })
  }
}
