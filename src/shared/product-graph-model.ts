/**
 * 产品导图 · 图模型 v2（宿主 / 客户端共用的纯函数层）
 *
 * 参照灵感的图模型（src/host/idea-model.ts + src/client/idea-model.ts）：
 *  - 统一 graph 是唯一数据源：{ v:2, rootId, nodes, edges }，tree 边表达层级、relate 边表达关联；
 *  - normalize 负责防环 / 限深 / 限节点 / 去重 / 裁剪，脏数据不入库；
 *  - mind-elixir / ECharts / Markdown 的互转也在这一层，两端不各写一份。
 *
 * 与灵感的差异：
 *  - 节点 kind 对齐模块四级：root | module | business | feature | requirement；
 *  - relate 边允许「跨图引用」：to 形如 `<mapId>:<nodeId>`（同产品另一张导图的节点）；
 *  - v1 旧导图（{nodes:[{id,label,type,parentId}]}）可无损迁移，节点 id 原样保留。
 *
 * 不碰 DOM、不碰 fetch、不碰 node API，便于单测与两端复用。
 */

export type ProductNodeKind = 'root' | 'module' | 'business' | 'feature' | 'requirement'
export type ProductNodeStatus = 'kept' | 'dropped' | 'pending'
export type ProductPlatform = 'pc' | 'mobile' | 'tablet' | 'all'
export type ProductEdgeKind = 'tree' | 'relate'

export const PRODUCT_NODE_KINDS: ProductNodeKind[] = ['root', 'module', 'business', 'feature', 'requirement']
export const PRODUCT_PLATFORMS: ProductPlatform[] = ['pc', 'mobile', 'tablet', 'all']

export interface ProductMapNode {
  id: string
  label: string
  kind: ProductNodeKind
  detail?: string
  parentId?: string | null
  depth?: number
  platform?: ProductPlatform
  status?: ProductNodeStatus
  tags?: string[]
  collapsed?: boolean
}

export interface ProductMapEdge { from: string; to: string; kind: ProductEdgeKind; label?: string }

export interface ProductMapGraph { v: 2; rootId: string; nodes: ProductMapNode[]; edges: ProductMapEdge[] }

export interface GraphIssue { code: string; message: string; id?: string }

export interface NormalizedProductGraph { graph: ProductMapGraph; issues: GraphIssue[] }

export const PRODUCT_GRAPH_LIMITS = {
  label: 24,
  detail: 200,
  tag: 16,
  tags: 8,
  nodes: 300,
  edges: 600,
  depth: 4, // 根不计：产品(0) → 模块(1) → 业务(2) → 功能(3) → 需求(4)
  graph: 2_000_000,
  versions: 50,
  summary: 500,
  labelLong: 60,
}

export const PRODUCT_KIND_LABEL: Record<ProductNodeKind, string> = {
  root: '产品', module: '模块', business: '业务', feature: '功能', requirement: '需求',
}

export const PRODUCT_KIND_COLOR: Record<ProductNodeKind, string> = {
  root: '#5b5bd6', module: '#2563eb', business: '#0f9f6e', feature: '#c27c0e', requirement: '#db2777',
}

/* ------------------------------ 基础工具 ------------------------------ */

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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** UTF-8 字节数（两端都有 TextEncoder）。 */
export function productGraphBytes(graph: ProductMapGraph): number {
  try {
    return new TextEncoder().encode(JSON.stringify(graph)).length
  } catch {
    return JSON.stringify(graph).length * 3
  }
}

export function emptyProductGraph(title: string): ProductMapGraph {
  const label = clampText(title, PRODUCT_GRAPH_LIMITS.label) || '产品'
  return {
    v: 2,
    rootId: 'root',
    nodes: [{ id: 'root', label, kind: 'root', detail: '', depth: 0, parentId: null, status: 'kept' }],
    edges: [],
  }
}

/* ------------------------------ 跨图引用 ------------------------------ */

/** `<mapId>:<nodeId>`：同产品另一张导图的节点引用。 */
export function isExternalRef(ref: unknown): ref is string {
  return typeof ref === 'string' && /^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/.test(ref)
}

export function externalRef(mapId: string, nodeId: string): string {
  return `${mapId}:${nodeId}`
}

export function parseExternalRef(ref: string): { mapId: string; nodeId: string } | null {
  if (!isExternalRef(ref)) return null
  const index = ref.indexOf(':')
  return { mapId: ref.slice(0, index), nodeId: ref.slice(index + 1) }
}

/** 图里的跨图引用边（from 本地 → to 外部）。 */
export function externalEdges(graph: ProductMapGraph): ProductMapEdge[] {
  return graph.edges.filter(e => e.kind === 'relate' && isExternalRef(e.to))
}

/* ------------------------------ 规范化 ------------------------------ */

/**
 * 校验并规整一份产品导图（参照灵感 normalizeGraph）：
 * - 节点去重、字段裁剪，超 300 个丢弃并记 issue；
 * - tree 边按 parentId 补全，成环/悬空的挂回根（说出来，不静默）；
 * - depth 由根 BFS 重算，超 4 层（根不计）丢弃；
 * - relate 边两端必须存在（或 to 是合法跨图引用）、不能自连、去重。
 */
export function normalizeProductGraph(raw: unknown, options: { title?: string; knownIds?: Iterable<string> } = {}): NormalizedProductGraph {
  const issues: GraphIssue[] = []
  const fallback = emptyProductGraph(options.title ?? '产品')
  if (raw === null || typeof raw !== 'object') return { graph: fallback, issues }

  const input = raw as Partial<ProductMapGraph> & { nodes?: unknown[]; edges?: unknown[] }
  const cleaned: ProductMapNode[] = []
  const seen = new Set<string>(options.knownIds ?? [])

  for (const item of asArray(input.nodes)) {
    if (item === null || typeof item !== 'object') continue
    const node = item as Record<string, unknown>
    const id = clampText(node.id, 64)
    if (id === '') { issues.push({ code: 'NODE_ID_EMPTY', message: '节点缺少 id，已丢弃' }); continue }
    if (seen.has(id)) { issues.push({ code: 'NODE_ID_DUP', message: `节点 id 重复：${id}`, id }); continue }
    if (cleaned.length >= PRODUCT_GRAPH_LIMITS.nodes) {
      issues.push({ code: 'NODE_LIMIT', message: `节点超过 ${PRODUCT_GRAPH_LIMITS.nodes} 个，后续已丢弃` })
      break
    }
    const rawLabel = clampText(node.label ?? node.topic, PRODUCT_GRAPH_LIMITS.label, true)
    const kind = PRODUCT_NODE_KINDS.includes(node.kind as ProductNodeKind) ? (node.kind as ProductNodeKind) : 'feature'
    const label = rawLabel || `未命名${PRODUCT_KIND_LABEL[kind]}`
    if (String(node.label ?? node.topic ?? '').length > PRODUCT_GRAPH_LIMITS.label) {
      issues.push({ code: 'LABEL_CLAMP', message: `节点「${label}」标题超长已裁剪`, id })
    }
    const status = node.status === 'dropped' || node.status === 'pending' ? node.status : 'kept'
    const tags = asArray(node.tags).map(t => clampText(t, PRODUCT_GRAPH_LIMITS.tag)).filter(Boolean).slice(0, PRODUCT_GRAPH_LIMITS.tags)
    const platform = PRODUCT_PLATFORMS.includes(node.platform as ProductPlatform) ? node.platform as ProductPlatform : undefined
    const entry: ProductMapNode = {
      id,
      label,
      kind,
      detail: clampText(node.detail, PRODUCT_GRAPH_LIMITS.detail, true),
      parentId: typeof node.parentId === 'string' && node.parentId !== '' ? clampText(node.parentId, 64) : null,
      status,
      platform,
      tags: tags.length > 0 ? tags : undefined,
    }
    if (node.collapsed === true) entry.collapsed = true
    seen.add(id)
    cleaned.push(entry)
  }

  if (cleaned.length === 0) return { graph: fallback, issues }

  const wantedRoot = clampText(input.rootId, 64)
  let rootCandidate = cleaned.find(n => n.id === wantedRoot && n.kind === 'root')
    ?? cleaned.find(n => n.kind === 'root')
  if (rootCandidate === undefined) {
    if (wantedRoot !== '') {
      rootCandidate = { id: wantedRoot, label: clampText(options.title, PRODUCT_GRAPH_LIMITS.label) || '产品', kind: 'root', detail: '', depth: 0, parentId: null, status: 'kept' }
      cleaned.unshift(rootCandidate)
    } else {
      rootCandidate = cleaned[0]
    }
  }
  rootCandidate.kind = 'root'
  const rootId = rootCandidate.id

  /* ---- tree 边：优先显式边，其次 parentId；relate 允许跨图引用 ---- */
  const treeParent = new Map<string, string>()
  const relateEdges: ProductMapEdge[] = []
  const relateKey = new Set<string>()

  for (const edge of asArray(input.edges)) {
    if (edge === null || typeof edge !== 'object') continue
    const e = edge as Record<string, unknown>
    const from = clampText(e.from, 64)
    const to = clampText(e.to, 80)
    if (e.kind === 'relate') {
      const external = isExternalRef(to)
      if (!seen.has(from) || from === to) continue
      if (!external && !seen.has(to)) continue
      const key = [from, to].sort().join('|')
      if (relateKey.has(key)) continue
      relateKey.add(key)
      relateEdges.push({ from, to, kind: 'relate', label: clampText(e.label, PRODUCT_GRAPH_LIMITS.label, true) || undefined })
      continue
    }
    if (!seen.has(from) || !seen.has(to) || from === to) continue
    if (!treeParent.has(to) && to !== rootId) treeParent.set(to, from)
  }
  for (const node of cleaned) {
    if (node.id === rootId || treeParent.has(node.id)) continue
    if (node.parentId !== null && node.parentId !== undefined && seen.has(node.parentId) && node.parentId !== node.id) {
      treeParent.set(node.id, node.parentId)
    }
  }

  /* ---- 环检测：沿父链上溯，遇到重复挂回根 ---- */
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
    if (parentOf(node.id) === undefined) {
      const wanted = node.parentId
      if (wanted !== null && wanted !== undefined && wanted !== '' && !seen.has(wanted)) {
        issues.push({ code: 'PARENT_MISSING', message: `父节点「${wanted}」不存在，已把「${node.label}」挂回根`, id: node.id })
      }
      treeParent.set(node.id, rootId)
    }
  }

  /* ---- depth：BFS，超深丢弃，深层后代一并丢 ---- */
  const childrenOf = new Map<string, string[]>()
  for (const [child, parent] of treeParent) {
    const list = childrenOf.get(parent) ?? []
    list.push(child)
    childrenOf.set(parent, list)
  }
  const depth = new Map<string, number>([[rootId, 0]])
  const queue: string[] = [rootId]
  const dropped = new Set<string>()
  const cleanedIds = new Set(cleaned.map(node => node.id))
  for (const [child, parent] of treeParent) {
    if (parent === rootId || cleanedIds.has(parent)) continue
    if (seen.has(parent)) {
      depth.set(child, Math.min(2, PRODUCT_GRAPH_LIMITS.depth))
      queue.push(child)
    }
  }
  while (queue.length > 0) {
    const current = queue.shift() as string
    const d = depth.get(current) ?? 0
    for (const child of childrenOf.get(current) ?? []) {
      if (dropped.has(child)) continue
      if (d + 1 > PRODUCT_GRAPH_LIMITS.depth) {
        dropped.add(child)
        issues.push({ code: 'DEPTH_LIMIT', message: `超过 ${PRODUCT_GRAPH_LIMITS.depth} 层，已丢弃节点`, id: child })
        continue
      }
      depth.set(child, d + 1)
      queue.push(child)
    }
  }
  for (const node of cleaned) {
    if (node.id !== rootId && !depth.has(node.id)) dropped.add(node.id)
  }
  for (const node of cleaned) {
    if (!dropped.has(node.id)) node.depth = depth.get(node.id) ?? 0
  }

  const kept = cleaned.filter(n => !dropped.has(n.id))
  for (const node of kept) node.parentId = node.id === rootId ? null : (treeParent.get(node.id) ?? rootId)

  const treeEdges: ProductMapEdge[] = kept
    .filter(n => n.id !== rootId)
    .map(n => ({ from: n.parentId as string, to: n.id, kind: 'tree' as const }))
  const relate = relateEdges.filter(e => !dropped.has(e.from) && (isExternalRef(e.to) || !dropped.has(e.to)))

  return {
    graph: { v: 2, rootId, nodes: kept, edges: treeEdges.concat(relate) },
    issues,
  }
}

/* ------------------------------ v1 迁移 ------------------------------ */

interface V1Node { id?: unknown; label?: unknown; type?: unknown; parentId?: unknown; note?: unknown }

/** v1 mindmap（{nodes:[{id,label,type,parentId}]}）→ v2 图；节点 id 原样保留。 */
export function productGraphFromV1(raw: unknown, title = '产品'): NormalizedProductGraph {
  const issues: GraphIssue[] = []
  const source = ((): { nodes: V1Node[] } => {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as { nodes: V1Node[] } } catch { return { nodes: [] } }
    }
    if (raw !== null && typeof raw === 'object') return raw as { nodes: V1Node[] }
    return { nodes: [] }
  })()
  const nodes: ProductMapNode[] = []
  for (const item of asArray(source.nodes)) {
    if (item === null || typeof item !== 'object') continue
    const node = item as V1Node
    const id = clampText(node.id, 64)
    if (id === '') continue
    const type = clampText(node.type, 16)
    const kind: ProductNodeKind = type === 'root' ? 'root' : type === 'requirement' ? 'requirement' : 'feature'
    nodes.push({
      id,
      label: clampText(node.label, PRODUCT_GRAPH_LIMITS.label, true) || `未命名${PRODUCT_KIND_LABEL[kind]}`,
      kind,
      detail: clampText(node.note, PRODUCT_GRAPH_LIMITS.detail, true),
      parentId: typeof node.parentId === 'string' && node.parentId !== '' ? node.parentId : null,
      status: 'kept',
    })
  }
  const graph: ProductMapGraph = { v: 2, rootId: nodes.find(n => n.kind === 'root')?.id ?? nodes[0]?.id ?? 'root', nodes, edges: [] }
  const normalized = normalizeProductGraph(graph, { title })
  return { graph: normalized.graph, issues: issues.concat(normalized.issues) }
}

/** v2 图 → v1 mindmap JSON 字符串（向后兼容镜像：products.mindmap / mindmap.json）。 */
export function productGraphToV1(graph: ProductMapGraph): string {
  const nodes = graph.nodes.map(n => ({
    id: n.id,
    label: n.label,
    type: n.kind === 'root' ? 'root' : n.kind === 'requirement' ? 'requirement' : 'feature',
    parentId: n.parentId ?? null,
    note: n.detail ?? '',
  }))
  return JSON.stringify({ nodes })
}

/* ------------------------------ 图工具 ------------------------------ */

export function productChildrenMap(graph: ProductMapGraph): Map<string, ProductMapNode[]> {
  const map = new Map<string, ProductMapNode[]>()
  const byId = new Map(graph.nodes.map(n => [n.id, n]))
  for (const edge of graph.edges) {
    if (edge.kind !== 'tree') continue
    const child = byId.get(edge.to)
    if (!child) continue
    const list = map.get(edge.from) ?? []
    list.push(child)
    map.set(edge.from, list)
  }
  return map
}

export function productNodeById(graph: ProductMapGraph, id: string | null | undefined): ProductMapNode | undefined {
  if (!id) return undefined
  return graph.nodes.find(n => n.id === id)
}

export function productGraphStats(graph: ProductMapGraph): { nodes: number; features: number; requirements: number; relate: number; external: number } {
  return {
    nodes: graph.nodes.length,
    features: graph.nodes.filter(n => n.kind === 'feature').length,
    requirements: graph.nodes.filter(n => n.kind === 'requirement').length,
    relate: graph.edges.filter(e => e.kind === 'relate' && !isExternalRef(e.to)).length,
    external: externalEdges(graph).length,
  }
}

export interface ProductGraphDiffEntry { id: string; label: string }
export interface ProductGraphDiff {
  added: ProductGraphDiffEntry[]
  removed: ProductGraphDiffEntry[]
  changed: Array<{ id: string; label: string; before: string; after: string }>
  addedEdges: number
  removedEdges: number
}

/** 版本 A/B 对比（同灵感 diffGraphs）。 */
export function diffProductGraphs(before: ProductMapGraph, after: ProductMapGraph): ProductGraphDiff {
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

/* ------------------------------ mind-elixir 互转 ------------------------------ */

export interface MindElixirNode { id: string; topic: string; children?: MindElixirNode[]; expanded?: boolean }
export interface MindElixirData { nodeData: MindElixirNode }

export function toMindElixir(graph: ProductMapGraph): MindElixirData {
  const children = productChildrenMap(graph)
  const build = (node: ProductMapNode, guard: Set<string>): MindElixirNode => {
    const kids = (children.get(node.id) ?? []).filter(child => !guard.has(child.id))
    const next = new Set(guard).add(node.id)
    return {
      id: node.id,
      topic: node.label,
      expanded: node.collapsed !== true,
      children: kids.map(child => build(child, next)),
    }
  }
  const root = productNodeById(graph, graph.rootId) ?? graph.nodes[0]
  if (!root) return { nodeData: { id: 'root', topic: '产品', children: [] } }
  return { nodeData: build(root, new Set()) }
}

/**
 * mind-elixir 数据 → 图。只覆盖「结构 + 文案」；detail / kind / platform / status / 跨图引用按 id 从旧图继承。
 */
export function fromMindElixir(data: MindElixirData, prev: ProductMapGraph): ProductMapGraph {
  const nodes: ProductMapNode[] = []
  const edges: ProductMapEdge[] = []
  const prevById = new Map(prev.nodes.map(n => [n.id, n]))
  const walk = (raw: MindElixirNode, parentId: string | null, depth: number, guard: Set<string>): void => {
    if (!raw || typeof raw.id !== 'string' || guard.has(raw.id)) return
    guard.add(raw.id)
    const old = prevById.get(raw.id)
    const node: ProductMapNode = {
      id: raw.id,
      label: String(raw.topic ?? '').slice(0, PRODUCT_GRAPH_LIMITS.label) || '未命名',
      kind: old?.kind ?? (depth === 0 ? 'root' : 'feature'),
      detail: old?.detail ?? '',
      depth,
      parentId,
      platform: old?.platform,
      status: old?.status ?? 'kept',
      tags: old?.tags,
      collapsed: raw.expanded === false ? true : undefined,
    }
    nodes.push(node)
    if (parentId !== null) edges.push({ from: parentId, to: raw.id, kind: 'tree' })
    for (const child of raw.children ?? []) walk(child, raw.id, depth + 1, guard)
  }
  walk(data.nodeData, null, 0, new Set())
  const rootId = data.nodeData?.id ?? nodes[0]?.id ?? 'root'
  const alive = new Set(nodes.map(n => n.id))
  for (const edge of prev.edges) {
    if (edge.kind !== 'relate') continue
    /* 同图关联：两端都在树上才留；跨图引用：起点在树上就留（终点在别的图里） */
    if (isExternalRef(edge.to)) { if (alive.has(edge.from)) edges.push({ ...edge }); continue }
    if (alive.has(edge.from) && alive.has(edge.to)) edges.push({ ...edge })
  }
  return { v: 2, rootId, nodes, edges }
}

/* ------------------------------ ECharts 力导 ------------------------------ */

export interface ProductForceOption {
  backgroundColor: string
  tooltip: { show: boolean; formatter: unknown }
  series: any[]
}

/** 关系力导图：按 kind 分类配色、虚线 relate、跨图引用画成外部节点、悬停邻接高亮。 */
export function buildProductForceOption(graph: ProductMapGraph, opts: { dark?: boolean } = {}): ProductForceOption {
  const dark = opts.dark === true
  const kinds = [...new Set(graph.nodes.map(n => n.kind))]
  const categories = kinds.map(kind => ({ name: PRODUCT_KIND_LABEL[kind], itemStyle: { color: PRODUCT_KIND_COLOR[kind] } }))
  const catIndex = new Map(categories.map((c, i) => [c.name, i]))
  const data: any[] = graph.nodes.map(node => ({
    id: node.id,
    name: node.label,
    category: catIndex.get(PRODUCT_KIND_LABEL[node.kind]) ?? 0,
    symbolSize: node.kind === 'root' ? 52 : node.kind === 'module' ? 34 : node.kind === 'business' ? 26 : 16,
    label: {
      show: node.kind !== 'feature' || graph.nodes.length <= 60,
      fontSize: node.kind === 'root' ? 12 : node.kind === 'module' || node.kind === 'business' ? 11 : 10,
      fontWeight: node.kind === 'root' ? 700 : node.kind === 'feature' ? 400 : 600,
      color: dark ? '#ecedf1' : '#1a1a1f',
      position: node.kind === 'feature' || node.kind === 'requirement' ? 'bottom' : 'inside',
    },
    itemStyle: node.kind === 'root'
      ? { color: dark ? '#8b87ff' : '#5b5bd6', borderColor: dark ? '#b3b0ff' : '#4a4ac2', borderWidth: 1 }
      : node.kind === 'module' || node.kind === 'business'
        ? { color: PRODUCT_KIND_COLOR[node.kind], opacity: 0.92, borderColor: dark ? '#111113' : '#fff', borderWidth: 2 }
        : { color: node.status === 'dropped' ? (dark ? '#2a2a30' : '#f1f1f4') : (dark ? '#19191d' : '#fff'), borderColor: PRODUCT_KIND_COLOR[node.kind], borderWidth: 1.5, opacity: node.status === 'dropped' ? 0.5 : 1 },
    value: node.detail ?? '',
  }))
  const links: any[] = []
  for (const edge of graph.edges) {
    if (edge.kind === 'relate' && isExternalRef(edge.to)) {
      const ref = parseExternalRef(edge.to)
      if (ref === null) continue
      data.push({
        id: edge.to,
        name: `↗ ${ref.nodeId}`,
        category: 0,
        symbolSize: 12,
        symbol: 'diamond',
        label: { show: true, fontSize: 9, color: dark ? '#a3a3b0' : '#8f8f9c', formatter: `跨图 → ${ref.mapId.slice(0, 8)}` },
        itemStyle: { color: dark ? '#4a4a56' : '#b9b9c6' },
      })
      links.push({
        source: edge.from,
        target: edge.to,
        label: { show: Boolean(edge.label), formatter: edge.label ?? '', fontSize: 9, color: dark ? '#a3a3b0' : '#8f8f9c' },
        lineStyle: { type: 'dashed', color: dark ? '#6b6b7c' : '#8f8f9c', width: 1.4, curveness: 0.25 },
      })
      continue
    }
    links.push({
      source: edge.from,
      target: edge.to,
      label: edge.kind === 'relate'
        ? { show: Boolean(edge.label), formatter: edge.label ?? '', fontSize: 9, color: dark ? '#a3a3b0' : '#8f8f9c' }
        : { show: false },
      lineStyle: edge.kind === 'relate'
        ? { type: 'dashed', color: dark ? '#4a4a56' : '#b9b9c6', width: 1.2, curveness: 0.18 }
        : { color: dark ? '#33333d' : '#e0e0e8', width: 1.4, curveness: 0 },
    })
  }
  return {
    backgroundColor: dark ? '#19191d' : '#ffffff',
    tooltip: {
      show: true,
      formatter: (params: any) => {
        if (params?.dataType !== 'node') return ''
        const node = graph.nodes.find(n => n.id === params.data.id)
        if (node === undefined) return String(params.data.name ?? '')
        return `<b>${escapeHtml(node.label)}</b> · ${PRODUCT_KIND_LABEL[node.kind]}${node.detail ? `<br>${escapeHtml(node.detail)}` : ''}`
      },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      focusNodeAdjacency: true,
      emphasis: { focus: 'adjacency', lineStyle: { width: 2.4 } },
      force: { repulsion: 320, edgeLength: [70, 150], gravity: 0.06, friction: 0.2, layoutAnimation: true },
      categories,
      data,
      links,
      labelLayout: { hideOverlap: true },
      edgeSymbol: ['none', 'none'],
      selectedMode: 'single',
    }],
  }
}

/* ------------------------------ Markdown 大纲 ------------------------------ */

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}

/** 导出大纲：层级用缩进，kind 用（模块）（业务）（需求）标记（功能不标记）。 */
export function productGraphToMarkdown(graph: ProductMapGraph): string {
  const children = productChildrenMap(graph)
  const root = productNodeById(graph, graph.rootId)
  const lines: string[] = []
  const mark = (node: ProductMapNode): string =>
    node.kind === 'requirement' ? '（需求）' : node.kind === 'module' ? '（模块）' : node.kind === 'business' ? '（业务）' : ''
  const walk = (node: ProductMapNode, depth: number, guard: Set<string>): void => {
    if (guard.has(node.id)) return
    guard.add(node.id)
    const bullet = depth === 0 ? `# ${node.label}` : `${'  '.repeat(depth)}- ${node.label}${mark(node)}`
    lines.push(bullet + (node.detail && depth > 0 ? ` —— ${node.detail}` : ''))
    for (const child of children.get(node.id) ?? []) walk(child, depth + 1, guard)
  }
  if (root) walk(root, 0, new Set())
  const relates = graph.edges.filter(e => e.kind === 'relate')
  if (relates.length > 0) {
    lines.push('', '## 关联')
    for (const edge of relates) {
      const from = productNodeById(graph, edge.from)?.label ?? edge.from
      const to = productNodeById(graph, edge.to)?.label ?? edge.to
      lines.push(`- ${from} ↔ ${to}${edge.label ? `（${edge.label}）` : ''}`)
    }
  }
  return lines.join('\n')
}

/** Markdown 大纲 → 图（缩进或 - 层级；（需求）（模块）（业务）标记定 kind；首行 # 标题即根）。 */
export function parseOutlineToProductGraph(raw: string, title: string, defaultKind: ProductNodeKind = 'feature'): NormalizedProductGraph {
  const rows = raw.split('\n').map(line => line.replace(/\t/g, '  '))
  type Row = { depth: number; label: string; kind: ProductNodeKind }
  const parsed: Row[] = []
  let rootLabel = ''
  for (const line of rows) {
    /* 导出的「## 关联」段在最后，其后都是 relate 记录（- A ↔ B），回读时整段跳过 */
    if (/^\s*##\s*关联\s*$/.test(line)) break
    const match = line.match(/^(\s*)(?:[-*+]\s+|#{1,6}\s+)?(.*)$/)
    if (!match) continue
    const labelRaw = match[2].trim()
    if (labelRaw === '' || labelRaw.includes('↔')) continue
    const indent = match[1].replace(/\t/g, '  ').length
    const depth = Math.floor(indent / 2)
    /* 首行 # 标题视为根标题（导出格式如此），不另起一层同名节点 */
    if (rootLabel === '' && depth === 0 && /^\s*#{1,6}\s+/.test(line)) { rootLabel = labelRaw; continue }
    const kind: ProductNodeKind = /（需求）|\(需求\)|\[需求\]/.test(labelRaw)
      ? 'requirement'
      : /（模块）|\(模块\)/.test(labelRaw) ? 'module'
        : /（业务）|\(业务\)/.test(labelRaw) ? 'business' : defaultKind
    const label = labelRaw
      .replace(/（需求）|\(需求\)|\[需求\]|（模块）|\(模块\)|（业务）|\(业务\)/g, '')
      .split(' —— ')[0]
      .trim()
    parsed.push({ depth, label, kind })
  }
  const name = rootLabel !== '' ? rootLabel : title
  const fallback = emptyProductGraph(name)
  if (parsed.length === 0) {
    return {
      graph: rootLabel === '' ? fallback : { ...fallback, nodes: [{ ...fallback.nodes[0], label: clampText(rootLabel, PRODUCT_GRAPH_LIMITS.label, true) || fallback.nodes[0].label }] },
      issues: rootLabel === '' ? [{ code: 'OUTLINE_EMPTY', message: '没有解析到大纲内容' }] : [],
    }
  }
  const rootId = 'root'
  const nodes: ProductMapNode[] = [{ id: rootId, label: name, kind: 'root', parentId: null, depth: 0, status: 'kept' }]
  const stack: Array<{ id: string; depth: number }> = [{ id: rootId, depth: -1 }]
  let index = 0
  for (const row of parsed) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= row.depth) stack.pop()
    const parent = stack[stack.length - 1]
    index += 1
    const id = `pn-${index.toString(36)}${Math.random().toString(36).slice(2, 6)}`
    nodes.push({ id, label: row.label, kind: row.kind, parentId: parent.id, status: 'kept' })
    stack.push({ id, depth: row.depth })
  }
  return normalizeProductGraph({ v: 2, rootId, nodes, edges: [] }, { title: name })
}

/* ------------------------------ 灵感导入 ------------------------------ */

export interface IdeaLikeNode {
  id: string
  type: string // seed | direction | idea | question | risk
  label: string
  detail?: string
  parentId?: string | null
  angle?: string
  status?: string
  tags?: string[]
}
export interface IdeaLikeGraph { rootId: string; nodes: IdeaLikeNode[]; edges: Array<{ from: string; to: string; kind: string; label?: string }> }

/**
 * 灵感图 → 产品导图（整图或某节点子树）：
 * seed→root（标题取产品名）、direction→module、idea→feature、
 * question→requirement(pending)、risk→requirement(tags 含「风险」)；detail/angle/status/tags 原样带走（angle 变 angle:xxx 标签）。
 */
export function productGraphFromIdea(idea: IdeaLikeGraph, opts: { title?: string; branchNodeId?: string; defaultKind?: 'module' | 'business' } = {}): NormalizedProductGraph {
  const title = clampText(opts.title, PRODUCT_GRAPH_LIMITS.label) || '产品'
  const byId = new Map(idea.nodes.map(n => [n.id, n]))
  const children = new Map<string, IdeaLikeNode[]>()
  for (const edge of idea.edges) {
    if (edge.kind !== 'tree') continue
    const child = byId.get(edge.to)
    const parent = byId.get(edge.from)
    if (!child || !parent) continue
    const list = children.get(parent.id) ?? []
    list.push(child)
    children.set(parent.id, list)
  }

  /* 收集导入范围：整图（灵感根）或某节点子树 */
  const scope = new Set<string>()
  const collect = (id: string, guard: Set<string>): void => {
    if (guard.has(id)) return
    guard.add(id)
    scope.add(id)
    for (const kid of children.get(id) ?? []) collect(kid.id, guard)
  }
  const branchId = opts.branchNodeId !== undefined && opts.branchNodeId !== '' && byId.has(opts.branchNodeId)
    ? opts.branchNodeId
    : idea.rootId
  collect(branchId, new Set())

  const mapKind = (node: IdeaLikeNode, depth: number): ProductNodeKind => {
    if (node.type === 'seed') return depth === 0 ? 'root' : (opts.defaultKind ?? 'module')
    if (node.type === 'direction') return opts.defaultKind ?? 'module'
    if (node.type === 'question') return 'requirement'
    if (node.type === 'risk') return 'requirement'
    return 'feature'
  }

  const nodes: ProductMapNode[] = []
  const isWhole = branchId === idea.rootId
  const root: ProductMapNode = { id: 'root', label: title, kind: 'root', detail: '', parentId: null, depth: 0, status: 'kept' }
  nodes.push(root)

  const idMap = new Map<string, string>()
  const walk = (node: IdeaLikeNode, parentId: string, depth: number, guard: Set<string>): void => {
    if (!scope.has(node.id) || guard.has(node.id)) return
    guard.add(node.id)
    const kind = mapKind(node, depth)
    const targetId = node.id === branchId && isWhole && node.type === 'seed' ? 'root' : node.id
    idMap.set(node.id, targetId)
    const tags = [...(Array.isArray(node.tags) ? node.tags : [])]
    if (node.angle) tags.push(`angle:${node.angle}`)
    if (node.type === 'risk') tags.push('风险')
    const entry: ProductMapNode = {
      id: targetId,
      label: clampText(node.label, PRODUCT_GRAPH_LIMITS.label, true) || `未命名${PRODUCT_KIND_LABEL[kind]}`,
      kind: targetId === 'root' ? 'root' : kind,
      detail: clampText(node.detail, PRODUCT_GRAPH_LIMITS.detail, true),
      parentId: targetId === 'root' ? null : parentId,
      status: node.status === 'dropped' ? 'dropped' : node.status === 'pending' || (node.status === undefined && node.type === 'question') ? 'pending' : 'kept',
      tags: tags.length > 0 ? tags.slice(0, PRODUCT_GRAPH_LIMITS.tags) : undefined,
    }
    if (targetId !== 'root') nodes.push(entry)
    else nodes[0] = { ...nodes[0], detail: entry.detail, tags: entry.tags }
    for (const kid of children.get(node.id) ?? []) walk(kid, targetId, depth + 1, guard)
  }
  const startNode = byId.get(branchId)
  if (startNode !== undefined) {
    if (isWhole) walk(startNode, 'root', 0, new Set())
    else walk(startNode, 'root', 1, new Set())
  }

  const edges: ProductMapEdge[] = []
  const alive = new Set(nodes.map(n => n.id))
  for (const edge of idea.edges) {
    if (edge.kind === 'relate') {
      const from = idMap.get(edge.from)
      const to = idMap.get(edge.to)
      if (from !== undefined && to !== undefined && alive.has(from) && alive.has(to) && from !== to) {
        edges.push({ from, to, kind: 'relate', label: clampText(edge.label, PRODUCT_GRAPH_LIMITS.label, true) || undefined })
      }
    }
  }
  return normalizeProductGraph({ v: 2, rootId: 'root', nodes, edges }, { title })
}
