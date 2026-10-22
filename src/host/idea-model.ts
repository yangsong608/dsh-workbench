/**
 * 灵感 · 纯函数层（宿主）
 *
 * 只处理数据：字段上限、graph 结构校验与规整、版本差异、输入摘要。
 * 不碰数据库、不碰网络，便于 scripts/verify-idea.mjs 直接单测。
 */
import { createHash } from 'node:crypto'
import { IDEA_ANGLES, IDEA_ANGLE_IDS } from '../shared/idea-angles.js'

/** 统一字段上限；灵感数据**不走**主存储的 str()（20k 一刀切会把 graph 腰斩）。 */
export const IDEA_LIMITS = {
  title: 60,
  brief: 5000,
  graph: 2_000_000,
  label: 24,
  detail: 200,
  tag: 16,
  tags: 8,
  nodes: 300,
  edges: 600,
  depth: 4,
  batchNodes: 60,
  versions: 50,
  inputs: 12,
  imageBytes: 2 * 1024 * 1024,
}

export const NODE_TYPES = ['seed', 'direction', 'idea', 'question', 'risk'] as const
/** 角度 id：内置 6 个 + cross，自定义也走同一 slug 形态，便于写进节点与提示词。 */
export const ANGLE_PATTERN = /^[a-z][a-z0-9_-]{1,23}$/
export const CUSTOM_ANGLE_LIMIT = 6
export const CUSTOM_ANGLE_LABEL_LIMIT = 12

export interface CustomAngle { id: string; label: string }

/** 把用户输入的角度名规范成 {id,label}：id 由 label 转 slug，重名去重，最多 6 个。 */
export function sanitizeCustomAngles(raw: unknown, existing: CustomAngle[] = []): { angles: CustomAngle[]; issues: GraphIssue[] } {
  const issues: GraphIssue[] = []
  const out: CustomAngle[] = []
  const seen = new Set(existing.map(a => a.id))
  for (const item of Array.isArray(raw) ? raw : []) {
    const label = clampText(typeof item === 'string' ? item : (item as any)?.label, CUSTOM_ANGLE_LABEL_LIMIT)
    if (label === '') continue
    const wantedId = typeof item === 'object' && item !== null && typeof (item as any).id === 'string'
      ? String((item as any).id).toLowerCase()
      : label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const id = ANGLE_PATTERN.test(wantedId) ? wantedId : `a-${createHash('sha1').update(label).digest('hex').slice(0, 6)}`
    if (seen.has(id)) { issues.push({ code: 'ANGLE_DUP', message: `角度重复：${label}`, id }); continue }
    if (out.length >= CUSTOM_ANGLE_LIMIT) { issues.push({ code: 'ANGLE_LIMIT', message: `自定义角度最多 ${CUSTOM_ANGLE_LIMIT} 个` }); break }
    seen.add(id)
    out.push({ id, label })
  }
  return { angles: out, issues }
}
export type IdeaNodeType = (typeof NODE_TYPES)[number]
export type IdeaNodeStatus = 'kept' | 'dropped' | 'pending'
export type IdeaEdgeKind = 'tree' | 'relate'

export interface IdeaGraphNode {
  id: string
  type: IdeaNodeType
  label: string
  detail?: string
  depth?: number
  parentId?: string | null
  angle?: string
  status?: IdeaNodeStatus
  tags?: string[]
  x?: number
  y?: number
  fx?: number
  fy?: number
  collapsed?: boolean
}

export interface IdeaGraphEdge {
  from: string
  to: string
  kind: IdeaEdgeKind
  label?: string
}

export interface IdeaGraph {
  v: 1
  rootId: string
  nodes: IdeaGraphNode[]
  edges: IdeaGraphEdge[]
}

export interface GraphIssue {
  code: string
  message: string
  id?: string
}

export interface NormalizedGraph {
  graph: IdeaGraph
  issues: GraphIssue[]
}

export { IDEA_ANGLES }
export const ANGLE_IDS = IDEA_ANGLE_IDS

/** 去掉控制字符并裁剪；labels 被裁时补省略号，便于 UI 与 diff 识别。 */
export function clampText(value: unknown, max: number, ellipsis = false): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim()
  if (clean.length <= max) return clean
  return ellipsis ? `${clean.slice(0, Math.max(0, max - 1))}…` : clean.slice(0, max)
}

export function clampNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function digest(parts: unknown[]): string {
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12)
}

export function graphBytes(graph: IdeaGraph): number {
  return Buffer.byteLength(JSON.stringify(graph), 'utf8')
}

/** 新建灵感的空图：只有一个种子节点。 */
export function emptyGraph(title: string): IdeaGraph {
  const seed = clampText(title, IDEA_LIMITS.title) || '新的灵感'
  return {
    v: 1,
    rootId: 'root',
    nodes: [{ id: 'root', type: 'seed', label: seed, detail: '', depth: 0, parentId: null, status: 'kept' }],
    edges: [],
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * 校验并规整一份 graph：
 * - 节点去重、类型/标签/详情裁剪，超出 300 个丢弃并记 issue；
 * - tree 边按 parentId 补全，成环或悬空的节点挂回根；
 * - depth 由根 BFS 重算，超过 4 层的节点丢弃；
 * - relate 边两端必须存在、不能自连、去重。
 */
export function normalizeGraph(raw: unknown, options: { title?: string } = {}): NormalizedGraph {
  const issues: GraphIssue[] = []
  const fallback = emptyGraph(options.title ?? '新的灵感')
  if (raw === null || typeof raw !== 'object') return { graph: fallback, issues }

  const input = raw as Partial<IdeaGraph>
  const cleaned: IdeaGraphNode[] = []
  const seen = new Set<string>()

  for (const item of asArray(input.nodes)) {
    if (item === null || typeof item !== 'object') continue
    const node = item as Record<string, unknown>
    const id = clampText(node.id, 64)
    if (id === '') { issues.push({ code: 'NODE_ID_EMPTY', message: '节点缺少 id，已丢弃' }); continue }
    if (seen.has(id)) { issues.push({ code: 'NODE_ID_DUP', message: `节点 id 重复：${id}`, id }); continue }
    if (cleaned.length >= IDEA_LIMITS.nodes) {
      issues.push({ code: 'NODE_LIMIT', message: `节点超过 ${IDEA_LIMITS.nodes} 个，后续已丢弃` })
      break
    }
    const rawLabel = clampText(node.label ?? node.topic, IDEA_LIMITS.label, true)
    const type = NODE_TYPES.includes(node.type as IdeaNodeType) ? (node.type as IdeaNodeType) : 'idea'
    const label = rawLabel || (type === 'direction' ? '未命名方向' : '未命名点子')
    if (typeof (node.label ?? node.topic) === 'string' && (node.label ?? node.topic as string).length > IDEA_LIMITS.label) {
      issues.push({ code: 'LABEL_CLAMP', message: `节点「${label}」标题超长已裁剪`, id })
    }
    const status = node.status === 'dropped' || node.status === 'pending' ? node.status : 'kept'
    const tags = asArray(node.tags).map(t => clampText(t, IDEA_LIMITS.tag)).filter(Boolean).slice(0, IDEA_LIMITS.tags)
    const entry: IdeaGraphNode = {
      id,
      type,
      label,
      detail: clampText(node.detail, IDEA_LIMITS.detail, true),
      parentId: typeof node.parentId === 'string' && node.parentId !== '' ? clampText(node.parentId, 64) : null,
      angle: ANGLE_PATTERN.test(clampText(node.angle, 24)) ? clampText(node.angle, 24) : undefined,
      status,
      tags: tags.length > 0 ? tags : undefined,
    }
    const x = Number(node.x)
    const y = Number(node.y)
    const fx = Number(node.fx)
    const fy = Number(node.fy)
    if (Number.isFinite(x)) entry.x = Math.round(x)
    if (Number.isFinite(y)) entry.y = Math.round(y)
    if (Number.isFinite(fx)) entry.fx = Math.round(fx)
    if (Number.isFinite(fy)) entry.fy = Math.round(fy)
    if (node.collapsed === true) entry.collapsed = true
    seen.add(id)
    cleaned.push(entry)
  }

  if (cleaned.length === 0) return { graph: fallback, issues }

  const wantedRoot = clampText(input.rootId, 64)
  let rootCandidate = cleaned.find(n => n.id === wantedRoot && n.type === 'seed')
    ?? cleaned.find(n => n.type === 'seed')
  if (rootCandidate === undefined) {
    /* 补丁图（继续发散）只带新节点：补一个同 id 的合成根，合并时按 id 与既有根对齐。 */
    if (wantedRoot !== '') {
      rootCandidate = { id: wantedRoot, type: 'seed', label: clampText(options.title, IDEA_LIMITS.label) || '灵感', detail: '', depth: 0, parentId: null, status: 'kept' }
      cleaned.unshift(rootCandidate)
    } else {
      rootCandidate = cleaned[0]
    }
  }
  rootCandidate.type = 'seed'
  const rootId = rootCandidate.id

  /* ---- tree 边：优先用显式边，其次用 parentId 补 ---- */
  const treeParent = new Map<string, string>()
  const relateEdges: IdeaGraphEdge[] = []
  const relateKey = new Set<string>()

  for (const edge of asArray(input.edges)) {
    if (edge === null || typeof edge !== 'object') continue
    const e = edge as Record<string, unknown>
    const from = clampText(e.from, 64)
    const to = clampText(e.to, 64)
    if (!seen.has(from) || !seen.has(to) || from === to) continue
    if (e.kind === 'relate') {
      const key = [from, to].sort().join('|')
      if (relateKey.has(key)) continue
      relateKey.add(key)
      relateEdges.push({ from, to, kind: 'relate', label: clampText(e.label, IDEA_LIMITS.label, true) || undefined })
    } else if (!treeParent.has(to) && to !== rootId) {
      treeParent.set(to, from)
    }
  }
  for (const node of cleaned) {
    if (node.id === rootId || treeParent.has(node.id)) continue
    if (node.parentId !== null && node.parentId !== undefined && seen.has(node.parentId) && node.parentId !== node.id) {
      treeParent.set(node.id, node.parentId)
    }
  }

  /* ---- 环检测：沿父链上溯，遇到重复即把该节点挂回根 ---- */
  const parentOf = (id: string): string | undefined => treeParent.get(id)
  for (const node of cleaned) {
    if (node.id === rootId) continue
    const path = new Set<string>([node.id])
    let cursor = parentOf(node.id)
    while (cursor !== undefined) {
      if (cursor === rootId) break
      if (path.has(cursor)) { treeParent.set(node.id, rootId); issues.push({ code: 'CYCLE', message: `检测到环，已把「${node.label}」挂回根`, id: node.id }); break }
      path.add(cursor)
      cursor = parentOf(cursor)
    }
  }
  for (const node of cleaned) {
    if (node.id === rootId) continue
    if (parentOf(node.id) === undefined) treeParent.set(node.id, rootId)
  }

  /* ---- depth：BFS，超深丢弃 ---- */
  const childrenOf = new Map<string, string[]>()
  for (const [child, parent] of treeParent) {
    const list = childrenOf.get(parent) ?? []
    list.push(child)
    childrenOf.set(parent, list)
  }
  const depth = new Map<string, number>([[rootId, 0]])
  const queue: string[] = [rootId]
  const dropped = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift() as string
    const d = depth.get(current) ?? 0
    for (const child of childrenOf.get(current) ?? []) {
      if (dropped.has(child)) continue
      if (d + 1 > IDEA_LIMITS.depth) {
        dropped.add(child)
        issues.push({ code: 'DEPTH_LIMIT', message: `超过 ${IDEA_LIMITS.depth} 层，已丢弃节点`, id: child })
        continue
      }
      depth.set(child, d + 1)
      queue.push(child)
    }
  }
  /* 深层节点被丢弃后，它的后代不可达：一并丢弃，避免留下悬空父级。 */
  for (const node of cleaned) {
    if (node.id !== rootId && !depth.has(node.id)) dropped.add(node.id)
  }
  for (const node of cleaned) {
    if (!dropped.has(node.id)) node.depth = depth.get(node.id) ?? 0
  }

  const kept = cleaned.filter(n => !dropped.has(n.id))
  for (const node of kept) node.parentId = node.id === rootId ? null : (treeParent.get(node.id) ?? rootId)

  const treeEdges: IdeaGraphEdge[] = kept
    .filter(n => n.id !== rootId)
    .map(n => ({ from: n.parentId as string, to: n.id, kind: 'tree' as const }))
  const relate = relateEdges.filter(e => !dropped.has(e.from) && !dropped.has(e.to))

  return {
    graph: { v: 1, rootId, nodes: kept, edges: treeEdges.concat(relate) },
    issues,
  }
}

/** 合并一批新节点（继续发散）：保持已有节点坐标与状态，仅追加。 */
export function mergeGraph(base: IdeaGraph, patch: NormalizedGraph, targetNodeId?: string): NormalizedGraph {
  const issues = [...patch.issues]
  const existing = new Set(base.nodes.map(n => n.id))
  const additions = patch.graph.nodes.filter(n => !existing.has(n.id) && n.id !== patch.graph.rootId)
  if (patch.graph.nodes.some(n => n.id !== patch.graph.rootId && existing.has(n.id))) {
    issues.push({ code: 'NODE_ID_DUP', message: '批次里已存在同 id 节点，已跳过' })
  }
  const nodes = base.nodes.concat(additions.map(n => ({ ...n, depth: (n.depth ?? 1) })))
  const keepIds = new Set(nodes.map(n => n.id))
  const edges = base.edges.concat(
    patch.graph.edges.filter(e => keepIds.has(e.from) && keepIds.has(e.to)),
  )
  const normalized = normalizeGraph({ ...base, nodes, edges, rootId: base.rootId }, { title: base.nodes[0]?.label })
  if (targetNodeId !== undefined && !keepIds.has(targetNodeId)) {
    issues.push({ code: 'TARGET_MISSING', message: `继续发散的目标节点不存在：${targetNodeId}` })
  }
  return { graph: normalized.graph, issues: issues.concat(normalized.issues) }
}

export interface GraphDiffEntry { id: string; label: string }
export interface GraphDiff {
  added: GraphDiffEntry[]
  removed: GraphDiffEntry[]
  changed: Array<{ id: string; label: string; before: string; after: string }>
  addedEdges: number
  removedEdges: number
}

export function diffGraphs(before: IdeaGraph, after: IdeaGraph): GraphDiff {
  const beforeMap = new Map(before.nodes.map(n => [n.id, n]))
  const afterMap = new Map(after.nodes.map(n => [n.id, n]))
  const added = after.nodes.filter(n => !beforeMap.has(n.id)).map(n => ({ id: n.id, label: n.label }))
  const removed = before.nodes.filter(n => !afterMap.has(n.id)).map(n => ({ id: n.id, label: n.label }))
  const changed = after.nodes
    .filter(n => beforeMap.has(n.id))
    .map(n => ({ id: n.id, label: n.label, before: beforeMap.get(n.id)?.label ?? '', after: n.label }))
    .filter(entry => entry.before !== entry.after)
  const beforeEdges = new Set(before.edges.map(e => `${e.kind}:${e.from}>${e.to}`))
  const afterEdges = new Set(after.edges.map(e => `${e.kind}:${e.from}>${e.to}`))
  return {
    added,
    removed,
    changed,
    addedEdges: after.edges.filter(e => !beforeEdges.has(`${e.kind}:${e.from}>${e.to}`)).length,
    removedEdges: before.edges.filter(e => !afterEdges.has(`${e.kind}:${e.from}>${e.to}`)).length,
  }
}

/** 输入的稳定摘要：改了正文/截图/链接就换 digest，用来标注"这版基于哪次输入"。 */
export function inputDigest(inputs: Array<{ kind: string; text?: string | null; url?: string | null; filePath?: string | null; size?: number | null }>): string {
  return digest(inputs.map(i => [i.kind, i.text ?? '', i.url ?? '', i.filePath ?? '', i.size ?? 0]))
}

/** 运行日志一条（最多保留 40 条）。 */
export function pushRunLog(log: unknown, message: string, limit = 40): Array<{ at: string; message: string }> {
  const list = asArray(log).filter((item): item is { at: string; message: string } =>
    item !== null && typeof item === 'object' && typeof (item as any).message === 'string')
  list.push({ at: new Date().toISOString(), message: clampText(message, 300) })
  return list.slice(-limit)
}
