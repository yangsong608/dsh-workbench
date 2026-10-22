/**
 * 灵感 · 纯函数层（客户端）
 *
 * graph 是唯一数据源：这里负责它到 mind-elixir、ECharts、SVG、Markdown 的转换。
 * 不碰 DOM、不碰 fetch，便于 scripts/verify-idea.mjs 单测。
 */
export type IdeaNodeType = 'seed' | 'direction' | 'idea' | 'question' | 'risk'
export type IdeaEdgeKind = 'tree' | 'relate'

export interface IdeaNode {
  id: string
  type: IdeaNodeType
  label: string
  detail?: string
  depth?: number
  parentId?: string | null
  angle?: string
  status?: 'kept' | 'dropped' | 'pending'
  tags?: string[]
  x?: number
  y?: number
  fx?: number
  fy?: number
  collapsed?: boolean
}

export interface IdeaEdge { from: string; to: string; kind: IdeaEdgeKind; label?: string }
export interface IdeaGraph { v: 1; rootId: string; nodes: IdeaNode[]; edges: IdeaEdge[] }

export const ANGLE_COLORS: Record<string, string> = {
  users: '#2563eb',
  pain: '#0f9f6e',
  form: '#c27c0e',
  tech: '#7c3aed',
  biz: '#db2777',
  risk: '#0891b2',
  cross: '#8b8b98',
  '': '#5b5bd6',
}

export function angleColor(angle: string | undefined): string {
  return ANGLE_COLORS[angle ?? ''] ?? ANGLE_COLORS['']
}

export function childrenMap(graph: IdeaGraph): Map<string, IdeaNode[]> {
  const map = new Map<string, IdeaNode[]>()
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

export function nodeById(graph: IdeaGraph, id: string | null | undefined): IdeaNode | undefined {
  if (!id) return undefined
  return graph.nodes.find(n => n.id === id)
}

export function graphStats(graph: IdeaGraph): { nodes: number; directions: number; relate: number } {
  return {
    nodes: graph.nodes.length,
    directions: graph.nodes.filter(n => n.type === 'direction').length,
    relate: graph.edges.filter(e => e.kind === 'relate').length,
  }
}

/* ------------------------------ mind-elixir ------------------------------ */

export interface MindElixirNode { id: string; topic: string; children?: MindElixirNode[]; expanded?: boolean }
export interface MindElixirData { nodeData: MindElixirNode }

/** graph → mind-elixir 树（只保留 tree 边；折叠状态映射到 expanded）。 */
export function toMindElixir(graph: IdeaGraph): MindElixirData {
  const children = childrenMap(graph)
  const build = (node: IdeaNode, guard: Set<string>): MindElixirNode => {
    const kids = (children.get(node.id) ?? []).filter(child => !guard.has(child.id))
    const next = new Set(guard).add(node.id)
    return {
      id: node.id,
      topic: node.label,
      expanded: node.collapsed !== true,
      children: kids.map(child => build(child, next)),
    }
  }
  const root = nodeById(graph, graph.rootId) ?? graph.nodes[0]
  if (!root) return { nodeData: { id: 'root', topic: '灵感', children: [] } }
  return { nodeData: build(root, new Set()) }
}

/**
 * mind-elixir 数据 → graph。
 * 只覆盖「结构 + 文案」；detail / angle / status / 坐标等元数据按 id 从旧图继承。
 */
export function fromMindElixir(data: MindElixirData, prev: IdeaGraph): IdeaGraph {
  const nodes: IdeaNode[] = []
  const edges: IdeaEdge[] = []
  const prevById = new Map(prev.nodes.map(n => [n.id, n]))
  const walk = (raw: MindElixirNode, parentId: string | null, depth: number, guard: Set<string>): void => {
    if (!raw || typeof raw.id !== 'string' || guard.has(raw.id)) return
    guard.add(raw.id)
    const old = prevById.get(raw.id)
    const node: IdeaNode = {
      id: raw.id,
      type: old?.type ?? (depth === 0 ? 'seed' : depth === 1 ? 'direction' : 'idea'),
      label: String(raw.topic ?? '').slice(0, 24) || '未命名',
      detail: old?.detail ?? '',
      depth,
      parentId,
      angle: old?.angle,
      status: old?.status ?? 'kept',
      tags: old?.tags,
      x: old?.x,
      y: old?.y,
      fx: old?.fx,
      fy: old?.fy,
      collapsed: raw.expanded === false ? true : undefined,
    }
    nodes.push(node)
    if (parentId !== null) edges.push({ from: parentId, to: raw.id, kind: 'tree' })
    for (const child of raw.children ?? []) walk(child, raw.id, depth + 1, guard)
  }
  walk(data.nodeData, null, 0, new Set())
  const rootId = data.nodeData?.id ?? nodes[0]?.id ?? 'root'
  /* 保留跨支关联（两端都还在树上才留） */
  const alive = new Set(nodes.map(n => n.id))
  for (const edge of prev.edges) {
    if (edge.kind === 'relate' && alive.has(edge.from) && alive.has(edge.to)) edges.push({ ...edge })
  }
  return { v: 1, rootId, nodes, edges }
}

/* ------------------------------ ECharts ------------------------------ */

export interface ForceOption {
  backgroundColor: string
  tooltip: { show: boolean; formatter: unknown }
  series: any[]
}

/** 力导图 option：分类配色、虚线 relate、可拖拽、悬停邻接高亮。 */
export function buildForceOption(graph: IdeaGraph, opts: { dark?: boolean } = {}): ForceOption {
  const dark = opts.dark === true
  const categories = [...new Set(graph.nodes.map(n => n.angle ?? ''))].map(angle => ({
    name: angle === '' ? '种子' : angle,
    itemStyle: { color: angleColor(angle) },
  }))
  const catIndex = new Map(categories.map((c, i) => [c.name, i]))
  const data = graph.nodes.map(node => ({
    id: node.id,
    name: node.label,
    category: catIndex.get(node.angle ?? '') ?? 0,
    symbolSize: node.type === 'seed' ? 52 : node.type === 'direction' ? 34 : 16,
    label: {
      show: node.type !== 'idea' || graph.nodes.length <= 60,
      fontSize: node.type === 'seed' ? 12 : node.type === 'direction' ? 11 : 10,
      fontWeight: node.type === 'seed' ? 700 : node.type === 'direction' ? 600 : 400,
      color: dark ? '#ecedf1' : '#1a1a1f',
      position: node.type === 'idea' ? 'bottom' : 'inside',
    },
    itemStyle: node.type === 'seed'
      ? { color: dark ? '#8b87ff' : '#5b5bd6', borderColor: dark ? '#b3b0ff' : '#4a4ac2', borderWidth: 1 }
      : node.type === 'direction'
        ? { color: angleColor(node.angle), opacity: 0.92, borderColor: dark ? '#111113' : '#fff', borderWidth: 2 }
        : { color: dark ? '#19191d' : '#fff', borderColor: angleColor(node.angle), borderWidth: 1.5 },
    value: node.detail ?? '',
  }))
  const links = graph.edges.map(edge => ({
    source: edge.from,
    target: edge.to,
    label: edge.kind === 'relate'
      ? { show: Boolean(edge.label), formatter: edge.label ?? '', fontSize: 9, color: dark ? '#a3a3b0' : '#8f8f9c' }
      : { show: false },
    lineStyle: edge.kind === 'relate'
      ? { type: 'dashed', color: dark ? '#4a4a56' : '#b9b9c6', width: 1.2, curveness: 0.18 }
      : { color: dark ? '#33333d' : '#e0e0e8', width: 1.4, curveness: 0 },
  }))
  return {
    backgroundColor: dark ? '#19191d' : '#ffffff',
    tooltip: {
      show: true,
      formatter: (params: any) => {
        if (params?.dataType !== 'node') return ''
        const node = graph.nodes.find(n => n.id === params.data.id)
        return `<b>${escapeHtml(node?.label ?? '')}</b>${node?.detail ? `<br>${escapeHtml(node.detail)}` : ''}`
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

/* ------------------------------ 导出 ------------------------------ */

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch))
}

export function graphToMarkdown(graph: IdeaGraph): string {
  const children = childrenMap(graph)
  const root = nodeById(graph, graph.rootId)
  const lines: string[] = []
  const walk = (node: IdeaNode, depth: number, guard: Set<string>): void => {
    if (guard.has(node.id)) return
    guard.add(node.id)
    const bullet = depth === 0 ? `# ${node.label}` : `${'  '.repeat(depth)}- ${node.label}`
    lines.push(bullet + (node.detail && depth > 0 ? ` —— ${node.detail}` : ''))
    for (const child of children.get(node.id) ?? []) walk(child, depth + 1, guard)
  }
  if (root) walk(root, 0, new Set())
  const relates = graph.edges.filter(e => e.kind === 'relate')
  if (relates.length > 0) {
    lines.push('', '## 跨支关联')
    for (const edge of relates) {
      const from = nodeById(graph, edge.from)?.label ?? edge.from
      const to = nodeById(graph, edge.to)?.label ?? edge.to
      lines.push(`- ${from} ↔ ${to}${edge.label ? `（${edge.label}）` : ''}`)
    }
  }
  return lines.join('\n')
}

export interface LayoutBox { x: number; y: number; w: number; h: number }
export interface SvgLayout {
  width: number
  height: number
  boxes: Map<string, LayoutBox>
  edges: Array<{ from: string; to: string; kind: IdeaEdgeKind; label?: string; d: string }>
}

/** 右向树布局：根 → 方向 → 点子，供 SVG 导出与只读降级使用。 */
export function layoutGraph(graph: IdeaGraph): SvgLayout {
  const children = childrenMap(graph)
  const root = nodeById(graph, graph.rootId)
  const nodeW = 168
  const nodeH = 34
  const gapY = 12
  const gapX = 64
  const boxes = new Map<string, LayoutBox>()
  let cursorY = 20

  const measure = (node: IdeaNode, depth: number, guard: Set<string>): void => {
    if (guard.has(node.id)) return
    guard.add(node.id)
    const kids = children.get(node.id) ?? []
    if (kids.length === 0) {
      boxes.set(node.id, { x: 20 + depth * (nodeW + gapX), y: cursorY, w: nodeW, h: nodeH })
      cursorY += nodeH + gapY
      return
    }
    const start = cursorY
    for (const kid of kids) measure(kid, depth + 1, guard)
    const end = cursorY - gapY
    boxes.set(node.id, { x: 20 + depth * (nodeW + gapX), y: (start + end - nodeH) / 2, w: nodeW, h: nodeH })
  }
  if (root) measure(root, 0, new Set())

  const edges: SvgLayout['edges'] = []
  for (const edge of graph.edges) {
    const a = boxes.get(edge.from)
    const b = boxes.get(edge.to)
    if (!a || !b) continue
    if (edge.kind === 'tree') {
      const x1 = a.x + a.w
      const y1 = a.y + a.h / 2
      const x2 = b.x
      const y2 = b.y + b.h / 2
      const mid = (x1 + x2) / 2
      edges.push({ ...edge, d: `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}` })
    } else {
      const x1 = a.x + a.w / 2
      const y1 = a.y + a.h / 2
      const x2 = b.x + b.w / 2
      const y2 = b.y + b.h / 2
      const mx = (x1 + x2) / 2
      const my = Math.max(20, Math.min(y1, y2) - 60)
      edges.push({ ...edge, d: `M${x1} ${y1} Q${mx} ${my}, ${x2} ${y2}` })
    }
  }
  const width = Math.max(320, ...[...boxes.values()].map(b => b.x + b.w + 20))
  const height = Math.max(200, cursorY + 20)
  return { width, height, boxes, edges }
}

export function graphToSVG(graph: IdeaGraph, opts: { dark?: boolean } = {}): string {
  const dark = opts.dark === true
  const layout = layoutGraph(graph)
  const bg = dark ? '#19191d' : '#ffffff'
  const text = dark ? '#ecedf1' : '#1a1a1f'
  const sub = dark ? '#a3a3b0' : '#656570'
  const nodeFill = dark ? '#222228' : '#ffffff'
  const line = dark ? '#3a3a44' : '#d8d8df'
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`)
  parts.push(`<rect width="100%" height="100%" fill="${bg}"/>`)
  for (const edge of layout.edges) {
    if (edge.kind === 'relate') {
      parts.push(`<path d="${edge.d}" fill="none" stroke="${dark ? '#4a4a56' : '#b9b9c6'}" stroke-width="1.2" stroke-dasharray="4 4"/>`)
    } else {
      parts.push(`<path d="${edge.d}" fill="none" stroke="${line}" stroke-width="1.4"/>`)
    }
  }
  for (const node of graph.nodes) {
    const box = layout.boxes.get(node.id)
    if (!box) continue
    const color = node.type === 'seed' ? (dark ? '#8b87ff' : '#5b5bd6') : angleColor(node.angle)
    const fill = node.type === 'seed' ? color : nodeFill
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${node.type === 'seed' ? 11 : 8}" fill="${fill}" stroke="${color}" stroke-width="${node.type === 'idea' ? 1.2 : 1.6}"/>`)
    const label = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label
    parts.push(`<text x="${box.x + 10}" y="${box.y + (box.h / 2) + 4}" font-family="-apple-system,PingFang SC,sans-serif" font-size="${node.type === 'seed' ? 13 : 11}" font-weight="${node.type === 'seed' ? 700 : 600}" fill="${node.type === 'seed' ? '#fff' : text}">${escapeHtml(label)}</text>`)
  }
  parts.push(`<text x="20" y="${layout.height - 12}" font-family="-apple-system,PingFang SC,sans-serif" font-size="10" fill="${sub}">dsh-workbench · 灵感 · ${graph.nodes.length} 节点</text>`)
  parts.push('</svg>')
  return parts.join('')
}

/** 导出文件名用：去掉路径分隔与非法字符。 */
export function safeName(value: string): string {
  return (value || 'idea').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
}
