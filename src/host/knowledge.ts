/**
 * 知识索引：工作区文本 → 分块 → SQLite FTS5 检索。
 *
 * 本地优先：不引入向量库；FTS5 不可用时退化为 LIKE。索引按工作区隔离。
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export const KNOWLEDGE_LIMITS = {
  files: 2000,
  fileBytes: 512 * 1024,
  chunkSize: 600,
  chunkOverlap: 80,
  topK: 8,
} as const

const TEXT_EXT = new Set(['.md', '.txt', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.py', '.java', '.go', '.rs', '.sql', '.yml', '.yaml', '.html', '.css', '.vue', '.sh'])
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.turbo', '.dsh-workbench', '.idea', '.vscode', 'target', '__pycache__'])

export interface KnowledgeHit { path: string; chunk: string; score: number }

export function chunkText(text: string, size = KNOWLEDGE_LIMITS.chunkSize, overlap = KNOWLEDGE_LIMITS.chunkOverlap): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (clean === '') return []
  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    const end = Math.min(clean.length, start + size)
    let cut = end
    if (end < clean.length) {
      const slice = clean.slice(start, end)
      const at = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'), slice.lastIndexOf('。'))
      if (at > size * 0.4) cut = start + at + 1
    }
    const piece = clean.slice(start, cut).trim()
    if (piece !== '') chunks.push(piece)
    if (cut >= clean.length) break
    start = Math.max(start + 1, cut - overlap)
  }
  return chunks
}

export function collectTextFiles(root: string, limits = KNOWLEDGE_LIMITS): { files: string[]; skipped: number } {
  const files: string[] = []
  let skipped = 0
  const walk = (dir: string, depth: number): void => {
    if (files.length >= limits.files || depth > 12) return
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (files.length >= limits.files) return
      if (name.startsWith('.') && name !== '.env.example') { skipped += 1; continue }
      const full = join(dir, name)
      let stat
      try { stat = statSync(full) } catch { skipped += 1; continue }
      if (stat.isDirectory()) {
        if (SKIP_DIR.has(name)) { skipped += 1; continue }
        walk(full, depth + 1)
        continue
      }
      if (!stat.isFile()) continue
      if (!TEXT_EXT.has(extname(name).toLowerCase())) { skipped += 1; continue }
      if (stat.size > limits.fileBytes) { skipped += 1; continue }
      files.push(full)
    }
  }
  walk(root, 0)
  return { files, skipped }
}

export class KnowledgeIndex {
  readonly db: any
  constructor(db: any) { this.db = db }

  status(projectPath: string): { docs: number; chunks: number; searchable: boolean } {
    const docs = Number((this.db.prepare('SELECT COUNT(*) AS n FROM knowledge_docs WHERE project_path = ?').get(projectPath) as any)?.n ?? 0)
    const chunks = Number((this.db.prepare('SELECT COUNT(*) AS n FROM knowledge_chunks c JOIN knowledge_docs d ON d.id = c.doc_id WHERE d.project_path = ?').get(projectPath) as any)?.n ?? 0)
    return { docs, chunks, searchable: this.ftsReady() }
  }

  private ftsReady(): boolean {
    try { this.db.prepare('SELECT rowid FROM knowledge_chunks_fts LIMIT 0').all(); return true } catch { return false }
  }

  /** 重建一个工作区的索引（先删后建，单事务）。 */
  index(projectPath: string): { docs: number; chunks: number; skipped: number } {
    const { files, skipped } = collectTextFiles(projectPath)
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const existing = this.db.prepare('SELECT id FROM knowledge_docs WHERE project_path = ?').all(projectPath) as any[]
    this.db.exec('BEGIN')
    try {
      for (const row of existing) {
        this.db.prepare('DELETE FROM knowledge_chunks_fts WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE doc_id = ?)').run(row.id)
        this.db.prepare('DELETE FROM knowledge_chunks WHERE doc_id = ?').run(row.id)
        this.db.prepare('DELETE FROM knowledge_docs WHERE id = ?').run(row.id)
      }
      let chunkCount = 0
      for (const file of files) {
        let text = ''
        try { text = readFileSync(file, 'utf8') } catch { continue }
        if (text.trim() === '') continue
        const docId = `kd-${createHash('sha1').update(file).digest('hex').slice(0, 12)}`
        const rel = relative(projectPath, file)
        this.db.prepare('INSERT INTO knowledge_docs(id, project_path, path, title, mtime, hash) VALUES(?,?,?,?,?,?)')
          .run(docId, projectPath, rel, rel.split('/').pop() ?? rel, ts, createHash('sha1').update(text).digest('hex').slice(0, 16))
        const chunks = chunkText(text)
        chunks.forEach((chunk, ord) => {
          const chunkId = `kc-${docId.slice(3)}-${ord}`
          this.db.prepare('INSERT INTO knowledge_chunks(id, doc_id, ord, text, tokens) VALUES(?,?,?,?,?)')
            .run(chunkId, docId, ord, chunk, Math.ceil(chunk.length / 2))
          this.db.prepare('INSERT INTO knowledge_chunks_fts(chunk_id, text) VALUES(?,?)').run(chunkId, chunk)
          chunkCount += 1
        })
      }
      this.db.exec('COMMIT')
      return { docs: files.length, chunks: chunkCount, skipped }
    } catch (cause) {
      try { this.db.exec('ROLLBACK') } catch { /* ignore */ }
      throw cause
    }
  }

  search(projectPath: string, query: string, topK = KNOWLEDGE_LIMITS.topK): KnowledgeHit[] {
    const q = query.trim()
    if (q === '') return []
    const limit = Math.min(20, Math.max(1, topK))
    if (this.ftsReady()) {
      try {
        const terms = q.split(/\s+/).map(term => term.replace(/["'*]/g, '')).filter(Boolean).map(term => `"${term}"`).join(' OR ')
        if (terms !== '') {
          const rows = this.db.prepare(`SELECT d.path AS path, c.text AS chunk, bm25(knowledge_chunks_fts) AS score
            FROM knowledge_chunks_fts f JOIN knowledge_chunks c ON c.id = f.chunk_id JOIN knowledge_docs d ON d.id = c.doc_id
            WHERE knowledge_chunks_fts MATCH ? AND d.project_path = ? ORDER BY score LIMIT ?`).all(terms, projectPath, limit) as any[]
          if (rows.length > 0) return rows.map(row => ({ path: String(row.path), chunk: String(row.chunk), score: Number(row.score) }))
        }
      } catch { /* 查询语法失败 → LIKE */ }
    }
    /* FTS 对中文整句不切词，命中为空时退化为按词 LIKE（本地规模足够）。 */
    const terms = q.split(/\s+/).map(term => term.trim()).filter(Boolean).slice(0, 4)
    if (terms.length === 0) return []
    const clause = terms.map(() => 'c.text LIKE ?').join(' OR ')
    const rows = this.db.prepare(`SELECT d.path AS path, c.text AS chunk FROM knowledge_chunks c JOIN knowledge_docs d ON d.id = c.doc_id
      WHERE d.project_path = ? AND (${clause}) LIMIT ?`).all(projectPath, ...terms.map(term => `%${term.slice(0, 40)}%`), limit) as any[]
    return rows.map(row => ({ path: String(row.path), chunk: String(row.chunk), score: 1 }))
  }
}
