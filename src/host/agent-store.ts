/**
 * 智能体团队 · 存储层
 *
 * 与灵感共用同一个 SQLite 连接（同一文件只留一个写者），但表独立、端点独立，
 * 不进整份任务快照（PUT /state）。
 */
import { randomUUID } from 'node:crypto'
import { AGENT_LIMITS, defaultMembers, normalizeBindings, validateMember, type AgentMember, type DispatchStatus } from './agent-model.js'

type AnyMap = Record<string, any>

const now = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19)

const SCHEMA = `
CREATE TABLE IF NOT EXISTS agent_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  desc TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  default_workspace TEXT NOT NULL DEFAULT '',
  bindings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',
  intro TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  tools_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  mcp_json TEXT NOT NULL DEFAULT '[]',
  memory_scope TEXT NOT NULL DEFAULT 'project',
  concurrency INTEGER NOT NULL DEFAULT 1,
  file_write TEXT NOT NULL DEFAULT 'read',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_team_members (
  team_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  file_write_override TEXT NOT NULL DEFAULT '',
  ord INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, member_id)
);
CREATE TABLE IF NOT EXISTS agent_dispatches (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL DEFAULT '',
  team_id TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'dispatching',
  goal TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  kickoff TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS agent_dispatch_members (
  dispatch_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  session_member_name TEXT NOT NULL DEFAULT '',
  file_write TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (dispatch_id, member_id)
);
CREATE TABLE IF NOT EXISTS agent_dispatch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  member TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  team_id TEXT NOT NULL DEFAULT '',
  member_id TEXT NOT NULL DEFAULT '',
  project_path TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  mtime INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_teams_default ON agent_teams(is_default);
CREATE INDEX IF NOT EXISTS idx_agent_team_members_team ON agent_team_members(team_id, ord);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_idea ON agent_dispatches(idea_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_status ON agent_dispatches(status);
CREATE INDEX IF NOT EXISTS idx_agent_dispatch_events_dispatch ON agent_dispatch_events(dispatch_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_memory_scope ON agent_memory(scope, project_path, team_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_project ON knowledge_docs(project_path);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(doc_id, ord);
`

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw === '') return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}

export class AgentStore {
  readonly db: any

  constructor(db: any) {
    this.db = db
    this.db.exec(SCHEMA)
    this.migrateColumns()
    this.migrateFts()
    this.seedDefault()
  }

  /** 旧库补列（bindings_json 等）。 */
  private migrateColumns(): void {
    try {
      const teamCols = (this.db.prepare('PRAGMA table_info(agent_teams)').all() as AnyMap[]).map(col => String(col.name))
      if (!teamCols.includes('bindings_json')) {
        this.db.exec("ALTER TABLE agent_teams ADD COLUMN bindings_json TEXT NOT NULL DEFAULT '{}'")
      }
    } catch (cause) { console.warn('[dsh-workbench] agent_teams 补列失败：', String(cause)) }
  }

  /** FTS5 不可用时降级为 LIKE（本机验证可用，仍做保护）。 */
  private ftsReady = false
  private migrateFts(): void {
    try {
      /* 1.8 建过一版空 FTS（未被使用），1.9 换成带 chunk_id 的结构；老表直接重建。 */
      const cols = this.db.prepare("PRAGMA table_info('knowledge_chunks_fts')").all() as AnyMap[]
      const hasChunkId = cols.some(col => String(col.name) === 'chunk_id')
      if (cols.length > 0 && !hasChunkId) this.db.exec('DROP TABLE knowledge_chunks_fts')
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(chunk_id UNINDEXED, text)")
      this.ftsReady = true
    } catch {
      this.ftsReady = false
    }
  }

  get searchable(): boolean { return this.ftsReady }

  /** 首次启动写入默认「产品研发」团队；之后只读不覆盖。 */
  private seedDefault(): void {
    const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM agent_teams').get() as AnyMap)?.n ?? 0)
    if (count > 0) return
    const teamId = `at-${randomUUID().slice(0, 8)}`
    const ts = now()
    this.db.prepare('INSERT INTO agent_teams(id, name, desc, is_default, default_workspace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(teamId, '产品研发', '主理人 + 产品 / 架构 / 前端 / 后端 / 测试 / 评审', 1, '', ts, ts)
    const seeds = defaultMembers()
    seeds.forEach((seed, index) => {
      const member = { ...seed, id: `am-${randomUUID().slice(0, 8)}` } as AgentMember
      this.db.prepare(`INSERT INTO agent_members(id,name,handle,role,intro,system_prompt,model,provider,tools_json,skills_json,mcp_json,memory_scope,concurrency,file_write,enabled,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(member.id, member.name, member.handle, member.role, member.intro, member.systemPrompt, '', '', '[]', '[]', '[]', member.memoryScope, member.concurrency, member.fileWrite, 1, ts, ts)
      this.db.prepare('INSERT INTO agent_team_members(team_id, member_id, file_write_override, ord) VALUES(?,?,?,?)')
        .run(teamId, member.id, '', index)
    })
  }

  /* ------------------------------ 团队 ------------------------------ */
  listTeams(): AnyMap[] {
    const rows = this.db.prepare('SELECT * FROM agent_teams ORDER BY is_default DESC, name').all() as AnyMap[]
    /* 门户卡片要显示成员 chips，列表也带成员（团队数量很少，成本可接受）。 */
    return rows.map(row => this.teamView(row, true))
  }

  getTeam(id: string): AnyMap | null {
    const row = this.db.prepare('SELECT * FROM agent_teams WHERE id = ?').get(id) as AnyMap | undefined
    return row === undefined ? null : this.teamView(row, true)
  }

  private teamView(row: AnyMap, withMembers: boolean): AnyMap {
    const members = withMembers ? this.listTeamMembers(String(row.id)) : []
    return {
      id: String(row.id),
      name: String(row.name),
      desc: String(row.desc ?? ''),
      isDefault: Number(row.is_default) === 1,
      defaultWorkspace: String(row.default_workspace ?? ''),
      bindings: parseJson<Record<string, string[]>>(row.bindings_json, {}),
      memberCount: Number((this.db.prepare('SELECT COUNT(*) AS n FROM agent_team_members WHERE team_id = ?').get(row.id) as AnyMap)?.n ?? 0),
      members,
    }
  }

  listTeamMembers(teamId: string): AnyMap[] {
    const rows = this.db.prepare(`SELECT m.*, tm.file_write_override, tm.ord FROM agent_team_members tm
      JOIN agent_members m ON m.id = tm.member_id WHERE tm.team_id = ? ORDER BY tm.ord, m.name`).all(teamId) as AnyMap[]
    return rows.map(row => this.memberView(row, String(row.file_write_override ?? '')))
  }

  private memberView(row: AnyMap, override = ''): AgentMember & { fileWrite: 'read' | 'write' } {
    return {
      id: String(row.id),
      name: String(row.name),
      handle: String(row.handle),
      role: String(row.role) as AgentMember['role'],
      intro: String(row.intro ?? ''),
      systemPrompt: String(row.system_prompt ?? ''),
      model: String(row.model ?? ''),
      provider: String(row.provider ?? ''),
      tools: parseJson<string[]>(row.tools_json, []),
      skills: parseJson<string[]>(row.skills_json, []),
      mcp: parseJson<string[]>(row.mcp_json, []),
      memoryScope: String(row.memory_scope ?? 'project') as AgentMember['memoryScope'],
      concurrency: Number(row.concurrency ?? 1),
      fileWrite: (override === 'write' || override === 'read' ? override : String(row.file_write ?? 'read')) as 'read' | 'write',
      enabled: Number(row.enabled ?? 1) === 1,
    }
  }

  saveTeam(input: AnyMap): AnyMap {
    const id = String(input?.id ?? '') || `at-${randomUUID().slice(0, 8)}`
    const name = String(input?.name ?? '').trim().slice(0, AGENT_LIMITS.teamName) || '未命名团队'
    const desc = String(input?.desc ?? '').trim().slice(0, AGENT_LIMITS.teamDesc)
    const workspace = String(input?.defaultWorkspace ?? '').trim().slice(0, 500)
    const ts = now()
    const exists = this.db.prepare('SELECT id, bindings_json FROM agent_teams WHERE id = ?').get(id) as AnyMap | undefined
    const bindings = input?.bindings === undefined
      ? String(exists?.bindings_json ?? '{}')
      : JSON.stringify(normalizeBindings(input.bindings))
    if (exists !== undefined) {
      this.db.prepare('UPDATE agent_teams SET name=?, desc=?, default_workspace=?, bindings_json=?, updated_at=? WHERE id=?').run(name, desc, workspace, bindings, ts, id)
    } else {
      const count = Number((this.db.prepare('SELECT COUNT(*) AS n FROM agent_teams').get() as AnyMap)?.n ?? 0)
      if (count >= AGENT_LIMITS.teams) throw new Error(`最多 ${AGENT_LIMITS.teams} 个团队`)
      this.db.prepare('INSERT INTO agent_teams(id,name,desc,is_default,default_workspace,bindings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, name, desc, 0, workspace, bindings, ts, ts)
    }
    return this.getTeam(id) ?? {}
  }

  deleteTeam(id: string): void {
    this.db.prepare('DELETE FROM agent_team_members WHERE team_id = ?').run(id)
    this.db.prepare('DELETE FROM agent_teams WHERE id = ?').run(id)
  }

  addMemberToTeam(teamId: string, memberId: string): AnyMap {
    const ord = Number((this.db.prepare('SELECT COALESCE(MAX(ord),-1)+1 AS n FROM agent_team_members WHERE team_id = ?').get(teamId) as AnyMap)?.n ?? 0)
    this.db.prepare('INSERT OR IGNORE INTO agent_team_members(team_id, member_id, file_write_override, ord) VALUES(?,?,?,?)').run(teamId, memberId, '', ord)
    return this.getTeam(teamId) ?? {}
  }

  setTeamMember(teamId: string, memberId: string, patch: AnyMap): AnyMap {
    const override = patch?.fileWrite === 'write' || patch?.fileWrite === 'read' ? String(patch.fileWrite) : ''
    const ord = Number.isFinite(Number(patch?.ord)) ? Number(patch.ord) : 0
    this.db.prepare('UPDATE agent_team_members SET file_write_override = ?, ord = ? WHERE team_id = ? AND member_id = ?').run(override, ord, teamId, memberId)
    return this.getTeam(teamId) ?? {}
  }

  removeMemberFromTeam(teamId: string, memberId: string): void {
    this.db.prepare('DELETE FROM agent_team_members WHERE team_id = ? AND member_id = ?').run(teamId, memberId)
  }

  /* ------------------------------ 成员 ------------------------------ */
  listMembers(): AgentMember[] {
    const rows = this.db.prepare('SELECT * FROM agent_members ORDER BY name').all() as AnyMap[]
    return rows.map(row => this.memberView(row))
  }

  getMember(id: string): AgentMember | null {
    const row = this.db.prepare('SELECT * FROM agent_members WHERE id = ?').get(id) as AnyMap | undefined
    return row === undefined ? null : this.memberView(row)
  }

  saveMember(raw: AnyMap): { member: AgentMember | null; issues: AnyMap[] } {
    const existing = this.listMembers()
    const { member, issues } = validateMember(raw, existing)
    if (member === null) return { member: null, issues }
    const ts = now()
    const exists = this.db.prepare('SELECT id FROM agent_members WHERE id = ?').get(member.id) as AnyMap | undefined
    const values = [member.name, member.handle, member.role, member.intro, member.systemPrompt, member.model, member.provider,
      JSON.stringify(member.tools), JSON.stringify(member.skills), JSON.stringify(member.mcp), member.memoryScope,
      member.concurrency, member.fileWrite, member.enabled ? 1 : 0, ts]
    if (exists !== undefined) {
      this.db.prepare(`UPDATE agent_members SET name=?, handle=?, role=?, intro=?, system_prompt=?, model=?, provider=?,
        tools_json=?, skills_json=?, mcp_json=?, memory_scope=?, concurrency=?, file_write=?, enabled=?, updated_at=? WHERE id=?`)
        .run(...values, member.id)
    } else {
      this.db.prepare(`INSERT INTO agent_members(id,name,handle,role,intro,system_prompt,model,provider,tools_json,skills_json,mcp_json,memory_scope,concurrency,file_write,enabled,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(member.id, ...values.slice(0, 14), ts, ts)
    }
    return { member: this.getMember(member.id), issues: [] }
  }

  deleteMember(id: string): void {
    this.db.prepare('DELETE FROM agent_team_members WHERE member_id = ?').run(id)
    this.db.prepare('DELETE FROM agent_members WHERE id = ?').run(id)
  }

  /* ------------------------------ 派发 ------------------------------ */
  createDispatch(input: AnyMap): AnyMap {
    const id = `ad-${randomUUID().slice(0, 8)}`
    const ts = now()
    this.db.prepare(`INSERT INTO agent_dispatches(id,idea_id,run_id,team_id,session_id,status,goal,workspace_path,timeout_ms,member_count,kickoff,started_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(input.ideaId ?? ''), String(input.runId ?? ''), String(input.teamId ?? ''), '', 'dispatching',
        String(input.goal ?? '').slice(0, AGENT_LIMITS.dispatchGoal), String(input.workspacePath ?? ''),
        Number(input.timeoutMs) || AGENT_LIMITS.dispatchTimeoutMs, Number(input.memberCount) || 0, String(input.kickoff ?? ''), ts)
    const members: AnyMap[] = Array.isArray(input.members) ? input.members : []
    for (const member of members) {
      this.db.prepare('INSERT OR IGNORE INTO agent_dispatch_members(dispatch_id,member_id,member_name,session_member_name,file_write,status,joined_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, String(member.id ?? ''), String(member.name ?? ''), String(member.handle ?? ''), String(member.fileWrite ?? 'read'), 'pending', ts)
    }
    return this.getDispatch(id) ?? {}
  }

  getDispatch(id: string): AnyMap | null {
    const row = this.db.prepare('SELECT * FROM agent_dispatches WHERE id = ?').get(id) as AnyMap | undefined
    if (row === undefined) return null
    const members = this.db.prepare('SELECT * FROM agent_dispatch_members WHERE dispatch_id = ? ORDER BY joined_at').all(id) as AnyMap[]
    return this.dispatchView(row, members.map(member => ({
      memberId: String(member.member_id), name: String(member.member_name), handle: String(member.session_member_name),
      fileWrite: String(member.file_write), status: String(member.status), error: String(member.error ?? ''),
    })))
  }

  private dispatchView(row: AnyMap, members: AnyMap[]): AnyMap {
    return {
      id: String(row.id), ideaId: String(row.idea_id ?? ''), runId: String(row.run_id ?? ''), teamId: String(row.team_id),
      sessionId: String(row.session_id ?? ''), status: String(row.status), goal: String(row.goal ?? ''),
      workspacePath: String(row.workspace_path ?? ''), timeoutMs: Number(row.timeout_ms ?? 0),
      memberCount: Number(row.member_count ?? 0), startedAt: String(row.started_at ?? ''),
      finishedAt: String(row.finished_at ?? ''), error: String(row.error ?? ''), members,
    }
  }

  updateDispatch(id: string, patch: AnyMap): AnyMap | null {
    const row = this.db.prepare('SELECT * FROM agent_dispatches WHERE id = ?').get(id) as AnyMap | undefined
    if (row === undefined) return null
    const status = typeof patch?.status === 'string' ? patch.status : String(row.status)
    const finished = ['done', 'partial', 'failed', 'timeout', 'cancelled'].includes(status)
    this.db.prepare(`UPDATE agent_dispatches SET status=?, session_id=?, error=?, member_count=?, tokens=?, finished_at=CASE WHEN ?=1 THEN ? ELSE finished_at END WHERE id=?`)
      .run(status,
        patch?.sessionId === undefined ? String(row.session_id ?? '') : String(patch.sessionId),
        patch?.error === undefined ? String(row.error ?? '') : String(patch.error).slice(0, 500),
        patch?.memberCount === undefined ? Number(row.member_count ?? 0) : Number(patch.memberCount) || 0,
        patch?.tokens === undefined ? Number(row.tokens ?? 0) : Number(patch.tokens) || 0,
        finished ? 1 : 0, finished ? now() : '', id)
    if (Array.isArray(patch?.members)) {
      for (const member of patch.members) {
        this.db.prepare('UPDATE agent_dispatch_members SET status=?, error=? WHERE dispatch_id=? AND member_id=?')
          .run(String(member.status ?? 'pending'), String(member.error ?? '').slice(0, 300), id, String(member.memberId ?? ''))
      }
    }
    return this.getDispatch(id)
  }

  listDispatches(ideaId: string, limit = 10): AnyMap[] {
    const rows = ideaId !== ''
      ? this.db.prepare('SELECT * FROM agent_dispatches WHERE idea_id = ? ORDER BY started_at DESC LIMIT ?').all(ideaId, limit) as AnyMap[]
      : this.db.prepare('SELECT * FROM agent_dispatches ORDER BY started_at DESC LIMIT ?').all(limit) as AnyMap[]
    return rows.map(row => this.dispatchView(row, []))
  }

  runningDispatchForIdea(ideaId: string): AnyMap | null {
    const row = this.db.prepare("SELECT * FROM agent_dispatches WHERE idea_id = ? AND status IN ('dispatching','running') ORDER BY started_at DESC LIMIT 1").get(ideaId) as AnyMap | undefined
    return row === undefined ? null : this.getDispatch(String(row.id))
  }

  appendEvent(dispatchId: string, kind: string, member: string, payload: unknown): void {
    const seq = Number((this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 AS n FROM agent_dispatch_events WHERE dispatch_id = ?').get(dispatchId) as AnyMap)?.n ?? 1)
    this.db.prepare('INSERT INTO agent_dispatch_events(dispatch_id,seq,kind,member,payload_json,at) VALUES(?,?,?,?,?,?)')
      .run(dispatchId, seq, kind.slice(0, 40), member.slice(0, 40), JSON.stringify(payload ?? {}).slice(0, 8000), now())
  }

  listEvents(dispatchId: string, limit = 200): AnyMap[] {
    const rows = this.db.prepare('SELECT * FROM agent_dispatch_events WHERE dispatch_id = ? ORDER BY seq LIMIT ?').all(dispatchId, limit) as AnyMap[]
    return rows.map(row => ({ seq: Number(row.seq), kind: String(row.kind), member: String(row.member ?? ''), payload: parseJson(row.payload_json, {}), at: String(row.at) }))
  }

  /* ------------------------------ 记忆 ------------------------------ */
  addMemory(input: AnyMap): AnyMap {
    const id = `mem-${randomUUID().slice(0, 8)}`
    const ts = now()
    const content = String(input?.content ?? '').trim().slice(0, 4000)
    if (content === '') throw new Error('记忆内容不能为空')
    const scope = ['personal', 'project', 'team', 'global'].includes(String(input?.scope)) ? String(input.scope) : 'project'
    this.db.prepare('INSERT INTO agent_memory(id,scope,team_id,member_id,project_path,content,source,pinned,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, scope, String(input?.teamId ?? ''), String(input?.memberId ?? ''), String(input?.projectPath ?? ''), content,
        String(input?.source ?? 'manual').slice(0, 40), input?.pinned === true ? 1 : 0, ts, ts)
    return this.getMemory(id) ?? {}
  }

  getMemory(id: string): AnyMap | null {
    const row = this.db.prepare('SELECT * FROM agent_memory WHERE id = ?').get(id) as AnyMap | undefined
    if (row === undefined) return null
    return {
      id: String(row.id), scope: String(row.scope), teamId: String(row.team_id ?? ''), memberId: String(row.member_id ?? ''),
      projectPath: String(row.project_path ?? ''), content: String(row.content), source: String(row.source ?? 'manual'),
      pinned: Number(row.pinned ?? 0) === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }
  }

  updateMemory(id: string, patch: AnyMap): AnyMap | null {
    const row = this.getMemory(id)
    if (row === null) return null
    const content = patch?.content === undefined ? String(row.content) : String(patch.content).trim().slice(0, 4000)
    const pinned = patch?.pinned === undefined ? (row.pinned ? 1 : 0) : patch.pinned === true ? 1 : 0
    this.db.prepare('UPDATE agent_memory SET content = ?, pinned = ?, updated_at = ? WHERE id = ?').run(content, pinned, now(), id)
    return this.getMemory(id)
  }

  deleteMemory(id: string): void {
    this.db.prepare('DELETE FROM agent_memory WHERE id = ?').run(id)
  }

  /* ------------------------------ 记忆查询 ------------------------------ */
  listMemory(filter: AnyMap = {}): AnyMap[] {
    const clauses: string[] = []
    const args: any[] = []
    if (typeof filter.scope === 'string' && filter.scope !== '') { clauses.push('scope = ?'); args.push(filter.scope) }
    if (typeof filter.teamId === 'string' && filter.teamId !== '') { clauses.push('team_id = ?'); args.push(filter.teamId) }
    if (typeof filter.projectPath === 'string' && filter.projectPath !== '') { clauses.push('(project_path = ? OR project_path = \'\')'); args.push(filter.projectPath) }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const rows = this.db.prepare(`SELECT * FROM agent_memory ${where} ORDER BY pinned DESC, updated_at DESC LIMIT 200`).all(...args) as AnyMap[]
    return rows.map(row => ({
      id: String(row.id), scope: String(row.scope), teamId: String(row.team_id ?? ''), memberId: String(row.member_id ?? ''),
      projectPath: String(row.project_path ?? ''), content: String(row.content), source: String(row.source ?? 'manual'),
      pinned: Number(row.pinned ?? 0) === 1, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }))
  }
}
