/**
 * 增量同步（P1-1）：墓碑记账 + 游标增量 + 条目级 LWW 写入。
 *
 * 设计要点：
 *  - 时间戳统一用「可字典序比较的 ISO 字符串」（YYYY-MM-DD HH:MM[:SS]），游标是
 *    不透明值：客户端只回传上一次拿到的 cursor，不要自己拼时间；
 *  - delta 只读：按各实体的时间列 + tombstones.deleted_at 升序合并，每批最多 limit 条；
 *  - push 逐条做 LWW：本地（含墓碑）更新时间更晚则拒绝，并回传 current 行；
 *  - 墓碑由 index.ts 的删除入口写入，本文件只负责读取/补写。
 *
 * 依赖注入：SQL 直接走 node:sqlite 连接（与 index.ts 的 SqliteStore 同一连接），
 * notes / notebooks / news_topics 的写入复用 store 既有 save 方法，保持副作用一致。
 */
import { randomUUID } from 'node:crypto'

export const SYNC_ENTITIES = ['tasks', 'notes', 'notebooks', 'news_topics', 'focus_sessions', 'spaces'] as const
export type SyncEntity = (typeof SYNC_ENTITIES)[number]

/** 复用 store 的既有写入方法（保留笔记落盘、新闻默认值等副作用）。 */
export interface SyncHooks {
  saveNote(input: any): any
  saveNotebook(input: any): any
  saveNewsTopic(input: any): any
  deleteNote(id: string): void
}

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function list(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

function isoNow(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function maxTime(a: string, b: string): string {
  return a > b ? a : b
}

/** 缺省时间补服务器当前时间；其余原样保留（LWW 以字符串比较为准）。 */
function normalizeTime(raw: unknown): string {
  const text = str(raw).trim()
  return text === '' ? isoNow() : text
}

/* ------------------------------------------------------------------ */
/* 实体表                                                              */
/* ------------------------------------------------------------------ */

interface EntityConfig {
  table: string
  /** 时间列：优先 updated_at；focus_sessions 没有该列，用 started_at 兜底 */
  time: string
  /** 只同步未软删的行（tasks.deleted_at） */
  live?: string
}

const ENTITIES: Record<SyncEntity, EntityConfig> = {
  tasks: { table: 'tasks', time: 'updated_at', live: 'deleted_at IS NULL' },
  notes: { table: 'notes', time: 'updated_at' },
  notebooks: { table: 'notebooks', time: 'updated_at' },
  news_topics: { table: 'news_topics', time: 'updated_at' },
  focus_sessions: { table: 'focus_sessions', time: 'started_at' },
  spaces: { table: 'spaces', time: 'updated_at' },
}

function isEntity(value: string): value is SyncEntity {
  return (SYNC_ENTITIES as readonly string[]).includes(value)
}

/** 兼容旧命名：meta 草稿里的 focus 等价于 focus_sessions（响应里统一用规范名）。 */
function canonicalEntity(value: string): SyncEntity | null {
  const name = value === 'focus' ? 'focus_sessions' : value
  return isEntity(name) ? name : null
}

/* ------------------------------------------------------------------ */
/* 墓碑                                                                */
/* ------------------------------------------------------------------ */

/** 写一条墓碑；同一 (entity, id) 重复删除时以更晚的时间覆盖。 */
export function writeTombstone(db: any, entity: string, id: string, at: string = isoNow()): void {
  db.prepare(`INSERT INTO tombstones(entity, id, deleted_at) VALUES(?,?,?)
    ON CONFLICT(entity, id) DO UPDATE SET deleted_at = max(tombstones.deleted_at, excluded.deleted_at)`).run(entity, id, at)
}

function clearTombstone(db: any, entity: string, id: string): void {
  db.prepare('DELETE FROM tombstones WHERE entity = ? AND id = ?').run(entity, id)
}

function tombstoneAt(db: any, entity: string, id: string): string {
  const row = db.prepare('SELECT deleted_at FROM tombstones WHERE entity = ? AND id = ?').get(entity, id) as any
  return str(row?.deleted_at)
}

/* ------------------------------------------------------------------ */
/* 行映射（与前端 API 的 camelCase 形状一致）                          */
/* ------------------------------------------------------------------ */

function toSubtask(row: any): any {
  return { id: row.id, title: row.title, done: Number(row.done) === 1, start: row.planned_start ?? '', end: row.planned_end ?? '', note: row.note ?? '' }
}

function taskRow(row: any, subtasks: any[]): any {
  return {
    id: row.id,
    title: row.title,
    desc: row.descr ?? '',
    note: row.note ?? '',
    space: row.space_id,
    projectPath: row.project_path ?? '',
    status: row.status,
    priority: row.priority ?? 'normal',
    tags: parseJson(row.tags, []),
    date: row.date ?? null,
    start: row.start ?? '',
    end: row.end ?? '',
    duration: Number(row.duration ?? 0),
    group: row.grp ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? null,
    subtasks: subtasks.map(toSubtask),
  }
}

function noteRow(row: any): any {
  return {
    id: row.id,
    notebookId: row.notebook_id ?? '',
    title: row.title,
    content: row.content ?? '',
    tags: parseJson(row.tags, []),
    pinned: Number(row.pinned) === 1,
    filePath: row.file_path ?? '',
    mapId: row.map_id ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function notebookRow(row: any): any {
  return { id: row.id, name: row.name, workspacePath: row.workspace_path ?? '', createdAt: row.created_at, updatedAt: row.updated_at }
}

function newsTopicRow(row: any): any {
  return {
    id: row.id,
    title: row.title,
    query: row.query,
    scheduleKind: row.schedule_kind,
    times: parseJson(row.times, []),
    weekday: Number(row.weekday ?? 1),
    customCron: row.custom_cron ?? '',
    scheduleText: row.schedule_text ?? '',
    cronTaskIds: parseJson(row.cron_task_ids, []),
    enabled: Number(row.enabled) === 1,
    count: Number(row.count ?? 6),
    lastRunAt: row.last_run_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function focusRow(row: any): any {
  return { id: row.id, taskId: row.task_id ?? null, startedAt: row.started_at, minutes: Number(row.minutes ?? 0), completed: Number(row.completed) === 1 }
}

function spaceRow(row: any): any {
  return { id: row.id, name: row.name, color: row.color, createdAt: row.created_at, updatedAt: row.updated_at }
}

function toRow(entity: SyncEntity, row: any, subtasks: any[] = []): any {
  switch (entity) {
    case 'tasks': return taskRow(row, subtasks)
    case 'notes': return noteRow(row)
    case 'notebooks': return notebookRow(row)
    case 'news_topics': return newsTopicRow(row)
    case 'focus_sessions': return focusRow(row)
    case 'spaces': return spaceRow(row)
  }
}

/* ------------------------------------------------------------------ */
/* 读：meta / delta                                                    */
/* ------------------------------------------------------------------ */

export function syncMeta(db: any): { entities: Record<string, { count: number; maxUpdatedAt: string | null }> } {
  const entities: Record<string, { count: number; maxUpdatedAt: string | null }> = {}
  for (const name of SYNC_ENTITIES) {
    const cfg = ENTITIES[name]
    const where = cfg.live === undefined ? '' : `WHERE ${cfg.live}`
    const row = db.prepare(`SELECT COUNT(*) AS count, MAX(${cfg.time}) AS max FROM ${cfg.table} ${where}`).get() as any
    entities[name] = { count: Number(row?.count ?? 0), maxUpdatedAt: row?.max === null || row?.max === undefined ? null : String(row.max) }
  }
  /* 兼容旧命名：focus 是 focus_sessions 的别名（同一份数据）。 */
  entities.focus = entities.focus_sessions
  return { entities }
}

function subtasksFor(db: any, taskIds: string[]): Map<string, any[]> {
  const map = new Map<string, any[]>()
  if (taskIds.length === 0) return map
  const placeholders = taskIds.map(() => '?').join(',')
  const rows = db.prepare(`SELECT * FROM subtasks WHERE task_id IN (${placeholders}) ORDER BY sort, id`).all(...taskIds) as any[]
  for (const row of rows) {
    const bucket = map.get(String(row.task_id))
    if (bucket === undefined) map.set(String(row.task_id), [row])
    else bucket.push(row)
  }
  return map
}

function entityUpserts(db: any, entity: SyncEntity, since: string, take: number): any[] {
  const cfg = ENTITIES[entity]
  const where = cfg.live === undefined ? `WHERE ${cfg.time} > ?` : `WHERE ${cfg.time} > ? AND ${cfg.live}`
  const rows = db.prepare(`SELECT * FROM ${cfg.table} ${where} ORDER BY ${cfg.time} ASC, id ASC LIMIT ?`).all(since, take) as any[]
  const subs = entity === 'tasks' ? subtasksFor(db, rows.map(row => String(row.id))) : new Map<string, any[]>()
  return rows.map(row => ({
    entity,
    id: String(row.id),
    op: 'upsert' as const,
    updatedAt: String(row[cfg.time] ?? ''),
    row: toRow(entity, row, subs.get(String(row.id)) ?? []),
  }))
}

/**
 * 游标增量：取 updated_at > since 的行 + deleted_at > since 的墓碑，
 * 按时间升序合并；cursor = 本批最后一条的时间（没有变更则回传 since）。
 */
export function syncDelta(db: any, query: { since?: string | null; entity?: string | null; limit?: string | number | null } = {}): {
  cursor: string
  changes: any[]
  more: boolean
} {
  let since = str(query.since).trim()
  if (since === '0') since = ''
  const limit = Math.max(1, Math.min(1000, Math.round(num(query.limit, 200))))
  const wanted = str(query.entity).trim()
  const only = wanted === '' ? null : canonicalEntity(wanted)
  if (wanted !== '' && only === null) throw new Error(`未知同步实体：${wanted}`)
  const targets: SyncEntity[] = only === null ? [...SYNC_ENTITIES] : [only]

  const changes: any[] = []
  for (const entity of targets) changes.push(...entityUpserts(db, entity, since, limit + 1))

  /* 只取受支持实体的墓碑；subtasks 的墓碑保留但不由 delta 单独下发（随 tasks 行合并）。 */
  const placeholders = targets.map(() => '?').join(',')
  const dead = db.prepare(`SELECT entity, id, deleted_at FROM tombstones
    WHERE entity IN (${placeholders}) AND deleted_at > ? ORDER BY deleted_at ASC, entity ASC, id ASC LIMIT ?`)
    .all(...targets, since, limit + 1) as any[]
  for (const row of dead) {
    changes.push({ entity: String(row.entity), id: String(row.id), op: 'delete' as const, updatedAt: String(row.deleted_at) })
  }

  changes.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1
    return `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`)
  })
  const more = changes.length > limit
  const batch = more ? changes.slice(0, limit) : changes
  return { cursor: batch.length > 0 ? String(batch[batch.length - 1].updatedAt) : since, changes: batch, more }
}

/* ------------------------------------------------------------------ */
/* 写：push（LWW）                                                     */
/* ------------------------------------------------------------------ */

function nextSort(db: any, table: string): number {
  const row = db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM ${table}`).get() as any
  return Number(row?.next ?? 0)
}

function upsertTask(db: any, id: string, row: any, at: string, incomingSubtasks: any[] | undefined): void {
  const now = isoNow()
  const values = {
    title: str(row.title).trim() === '' ? '未命名任务' : str(row.title),
    descr: str(row.desc),
    note: str(row.note),
    space_id: str(row.space) || 'life',
    project_path: str(row.projectPath),
    status: str(row.status) || 'next',
    priority: str(row.priority) || 'normal',
    tags: JSON.stringify(list(row.tags).map(tag => str(tag)).filter(Boolean)),
    date: row.date ? str(row.date) : null,
    start: row.start ? str(row.start) : null,
    end: row.end ? str(row.end) : null,
    duration: Math.max(0, Math.round(num(row.duration))),
    grp: row.group ? str(row.group) : null,
    created_at: str(row.createdAt) || now,
    completed_at: row.completedAt ? str(row.completedAt) : null,
  }
  const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id) as any
  if (exists === undefined) {
    db.prepare(`INSERT INTO tasks(id, title, descr, note, space_id, project_path, status, priority, date, start, end, duration, tags, grp, sort, created_at, updated_at, completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, values.title, values.descr, values.note, values.space_id, values.project_path, values.status, values.priority,
      values.date, values.start, values.end, values.duration, values.tags, values.grp, nextSort(db, 'tasks'), values.created_at, at, values.completed_at,
    )
  } else {
    db.prepare(`UPDATE tasks SET title=?, descr=?, note=?, space_id=?, project_path=?, status=?, priority=?, date=?, start=?, end=?,
      duration=?, tags=?, grp=?, updated_at=?, completed_at=? WHERE id=?`).run(
      values.title, values.descr, values.note, values.space_id, values.project_path, values.status, values.priority,
      values.date, values.start, values.end, values.duration, values.tags, values.grp, at, values.completed_at, id,
    )
  }
  /* 子待办：只有显式带了 subtasks 数组才整体替换，避免 partial row 清空。 */
  if (incomingSubtasks !== undefined) {
    db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id)
    const ins = db.prepare('INSERT INTO subtasks(id, task_id, title, done, planned_start, planned_end, note, sort) VALUES(?,?,?,?,?,?,?,?)')
    incomingSubtasks.slice(0, 500).forEach((sub, index) => {
      const sid = str(sub?.id) || `sub-${randomUUID().slice(0, 8)}`
      ins.run(sid, id, str(sub?.title, '子待办'), sub?.done === true ? 1 : 0,
        sub?.start ? str(sub.start) : null, sub?.end ? str(sub.end) : null, sub?.note ? str(sub.note) : null, index)
    })
  }
}

function upsertSpace(db: any, id: string, row: any, at: string): void {
  const now = isoNow()
  const exists = db.prepare('SELECT id FROM spaces WHERE id = ?').get(id) as any
  if (exists === undefined) {
    db.prepare('INSERT INTO spaces(id, name, color, sort, created_at, updated_at) VALUES(?,?,?,?,?,?)')
      .run(id, str(row.name) || id, str(row.color) || '#5b5bd6', nextSort(db, 'spaces'), str(row.createdAt) || now, at)
  } else {
    db.prepare('UPDATE spaces SET name=?, color=?, updated_at=? WHERE id=?')
      .run(str(row.name) || id, str(row.color) || '#5b5bd6', at, id)
  }
}

function upsertFocus(db: any, id: string, row: any, at: string): void {
  const startedAt = str(row.startedAt) || at
  const taskId = str(row.taskId)
  const minutes = Math.max(0, Math.round(num(row.minutes)))
  const completed = row.completed === false ? 0 : 1
  const exists = db.prepare('SELECT id FROM focus_sessions WHERE id = ?').get(id) as any
  if (exists === undefined) {
    db.prepare('INSERT INTO focus_sessions(id, task_id, started_at, minutes, completed) VALUES(?,?,?,?,?)')
      .run(id, taskId === '' ? null : taskId, startedAt, minutes, completed)
  } else {
    db.prepare('UPDATE focus_sessions SET task_id=?, started_at=?, minutes=?, completed=? WHERE id=?')
      .run(taskId === '' ? null : taskId, startedAt, minutes, completed, id)
  }
}

function removeEntity(db: any, entity: SyncEntity, id: string, hooks: SyncHooks, existed: boolean): void {
  switch (entity) {
    case 'tasks':
      db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id)
      db.prepare('DELETE FROM attachments WHERE task_id = ?').run(id)
      db.prepare('DELETE FROM logs WHERE task_id = ?').run(id)
      db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
      return
    case 'notes':
      /* 复用 store.deleteNote：顺带删除已导出的 .md 文件；不存在时直接跳过。 */
      if (existed) hooks.deleteNote(id)
      else db.prepare('DELETE FROM notes WHERE id = ?').run(id)
      return
    case 'news_topics':
      db.prepare('DELETE FROM news_items WHERE topic_id = ?').run(id)
      db.prepare('DELETE FROM news_topics WHERE id = ?').run(id)
      return
    case 'notebooks': {
      /* 与 deleteNotebook 的语义一致：笔记迁到剩余的第一个笔记本，但同步删除不强制「至少保留一个」。 */
      const other = db.prepare('SELECT id FROM notebooks WHERE id <> ? ORDER BY created_at, id LIMIT 1').get(id) as any
      if (other !== undefined) db.prepare('UPDATE notes SET notebook_id = ? WHERE notebook_id = ?').run(String(other.id), id)
      db.prepare('DELETE FROM notebooks WHERE id = ?').run(id)
      return
    }
    case 'focus_sessions':
      db.prepare('DELETE FROM focus_sessions WHERE id = ?').run(id)
      return
    case 'spaces':
      db.prepare('DELETE FROM spaces WHERE id = ?').run(id)
      return
  }
}

function applyUpsert(db: any, entity: SyncEntity, id: string, row: any, at: string, current: any, hooks: SyncHooks): void {
  const incoming = row !== null && typeof row === 'object' && !Array.isArray(row) ? row : {}
  const merged = { ...(current ?? {}), ...incoming }
  switch (entity) {
    case 'tasks':
      upsertTask(db, id, merged, at, Array.isArray(incoming.subtasks) ? incoming.subtasks : undefined)
      return
    case 'spaces':
      upsertSpace(db, id, merged, at)
      return
    case 'focus_sessions':
      upsertFocus(db, id, merged, at)
      return
    case 'notes': {
      hooks.saveNote({
        id,
        notebookId: str(merged.notebookId),
        title: str(merged.title),
        content: str(merged.content),
        tags: list(merged.tags),
        pinned: merged.pinned === true,
        mapId: str(merged.mapId),
      })
      /* saveNote 会写服务器当前时间；同步场景以推送的 updatedAt 作为 LWW 依据。 */
      db.prepare('UPDATE notes SET updated_at = ? WHERE id = ?').run(at, id)
      return
    }
    case 'notebooks': {
      hooks.saveNotebook({ id, name: str(merged.name), workspacePath: str(merged.workspacePath) })
      db.prepare('UPDATE notebooks SET updated_at = ? WHERE id = ?').run(at, id)
      return
    }
    case 'news_topics': {
      hooks.saveNewsTopic({
        id,
        title: str(merged.title),
        query: str(merged.query),
        scheduleKind: str(merged.scheduleKind),
        times: list(merged.times),
        weekday: merged.weekday,
        customCron: str(merged.customCron),
        scheduleText: str(merged.scheduleText),
        cronTaskIds: list(merged.cronTaskIds),
        enabled: merged.enabled !== false,
        count: merged.count,
      })
      db.prepare('UPDATE news_topics SET updated_at = ? WHERE id = ?').run(at, id)
      return
    }
  }
}

/**
 * 条目级写入：body.changes[] 逐条应用。
 *  - upsert：LWW 通过后写入（notes/notebooks/news_topics 复用 save 方法，其余直接 SQL）；
 *  - delete：写墓碑 + 物理删除；墓碑时间取「push 的 updatedAt 与服务器当前时间较大者」，
 *    保证其它设备用旧游标也能看到这次删除。
 *  - 返回 { accepted: [id...], conflicts: [{entity, id, current}] }。
 */
export function syncPush(db: any, payload: any, hooks: SyncHooks): { accepted: string[]; conflicts: any[] } {
  const changes = list(payload?.changes)
  if (changes.length > 2000) throw new Error('changes 过多（单次最多 2000 条）')
  const accepted: string[] = []
  const conflicts: any[] = []

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const change of changes) {
      const entityText = str(change?.entity).trim()
      const entity = canonicalEntity(entityText)
      if (entity === null) throw new Error(`未知同步实体：${entityText}`)
      const id = str(change?.id).trim()
      if (id === '') throw new Error('同步条目的 id 不能为空')
      const op = str(change?.op, 'upsert') === 'delete' ? 'delete' : 'upsert'
      const at = normalizeTime(change?.updatedAt)

      const currentRaw = db.prepare(`SELECT * FROM ${ENTITIES[entity].table} WHERE id = ?`).get(id) as any
      const current = currentRaw === undefined ? null : toRow(entity, currentRaw)
      const currentAt = currentRaw === undefined ? '' : String(currentRaw[ENTITIES[entity].time] ?? '')
      const latest = maxTime(currentAt, tombstoneAt(db, entity, id))
      if (latest !== '' && latest > at) {
        conflicts.push({ entity, id, current })
        continue
      }

      if (op === 'delete') {
        removeEntity(db, entity, id, hooks, current !== null)
        /* 删除事件时间：至少是服务器当前时间，避免旧游标漏掉这次删除。 */
        writeTombstone(db, entity, id, maxTime(at, isoNow()))
      } else {
        applyUpsert(db, entity, id, change?.row, at, current, hooks)
        clearTombstone(db, entity, id)
      }
      accepted.push(id)
    }
    db.exec('COMMIT')
  } catch (cause) {
    try { db.exec('ROLLBACK') } catch { /* 已回滚 */ }
    throw cause
  }
  return { accepted, conflicts }
}
