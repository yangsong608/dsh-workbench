/**
 * 工作台主体（Shadow DOM 内的原生渲染层）。
 *
 * 之所以不用 JSX：这套界面来自可点击原型（同一份 CSS/结构），直接搬进 Shadow DOM
 * 能保证视觉一致，同时把 DOM 事件、定时器、数据同步全部收在一个可控的 mount 里；
 * 外层的 React 只负责挂载/卸载。
 */
import { WORKBENCH_CSS } from './styles'
import { createIdeaView, type IdeaViewHandle } from './idea'
import { createAgentPanel } from './agent-panel'
import { createAgentChat, teamStateOf, type ChatHandle } from './agent-chat'
import {
  buildProductForceOption, emptyProductGraph, externalEdges, fromMindElixir, normalizeProductGraph,
  parseExternalRef, parseOutlineToProductGraph, productGraphFromIdea, productGraphFromV1, productGraphToMarkdown, diffProductGraphs,
  PRODUCT_KIND_COLOR, PRODUCT_KIND_LABEL, toMindElixir,
  type IdeaLikeGraph, type ProductMapGraph, type ProductMapNode, type ProductNodeKind,
} from '../shared/product-graph-model'

const API = '/workbench-api'

type Theme = 'auto' | 'light' | 'dark'
type Status = 'next' | 'doing' | 'waiting' | 'done'
type Priority = 'low' | 'normal' | 'high'

interface Space { id: string; name: string; color: string }
interface Subtask { id: string; title: string; done: boolean; start: string; end: string; note: string }
interface Attachment { id: string; name: string; kind: string; size?: number | null }
interface LogEntry { at: string; type: string; text: string }
interface Task {
  id: string; title: string; desc: string; note: string; space: string; status: Status; priority: Priority
  /** 所属项目（= DSH 工作区绝对路径；空串表示未归属）。 */
  projectPath: string
  tags: string[]; date: string | null; start: string; end: string; duration: number; group: string
  createdAt: string; updatedAt: string; completedAt: string | null
  subtasks: Subtask[]; attachments: Attachment[]; logs: LogEntry[]
}
interface FocusSession { id: string; taskId: string | null; startedAt: string; minutes: number; completed: boolean }
type NewsKind = 'daily' | 'workdays' | 'weekly' | 'custom'
interface NewsTopic {
  id: string; title: string; query: string; scheduleKind: NewsKind; times: string[]; weekday: number
  customCron: string; scheduleText: string; cronTaskIds: string[]; enabled: boolean; count: number
  lastRunAt: string | null; createdAt: string; updatedAt: string
}
interface NewsItem {
  id: string; topicId: string; title: string; url: string; source: string
  publishedAt: string; summary: string; aiSummary: string; fetchedAt: string
}
interface Notebook {
  id: string; name: string; workspacePath?: string; count?: number; createdAt: string; updatedAt: string
}
type BugStatus = 'open' | 'doing' | 'verify' | 'resolved'
type BugSeverity = 'blocker' | 'major' | 'minor' | 'trivial'
type BugPriority = 'P0' | 'P1' | 'P2' | 'P3'
interface BugProject {
  id: string; name: string; workspacePath: string; workspaceName: string
  count?: number; createdAt: string; updatedAt: string
}
interface Bug {
  id: string; projectId: string; code: string; title: string; description: string
  status: BugStatus; severity: BugSeverity; priority: BugPriority; plannedDate: string
  tags: string[]; verification: string; aiThreadId: string; moduleId: string; platform: string; assignee: string
  createdAt: string; updatedAt: string; resolvedAt: string | null
}
interface TestProject {
  id: string; name: string; description: string; workspacePath: string; productId: string; moduleId: string; platform: string; bugProjectId: string
  deployMode: 'local' | 'ssh'; sshHost: string; remoteDir: string; image: string; containerName: string
  hostPort: string; containerPort: string; caseCount?: number; runCount?: number; createdAt: string; updatedAt: string
}
interface TestCase {
  id: string; projectId: string; title: string; precondition: string; steps: string[]; expected: string
  priority: string; type: string; source: string; moduleId: string; platform: string; createdAt: string; updatedAt: string
}
interface TestResult { caseId: string; status: 'pending' | 'pass' | 'fail' | 'blocked'; note: string; bugId: string }
interface TestRun {
  id: string; projectId: string; name: string; status: 'running' | 'passed' | 'failed' | 'blocked'
  results: TestResult[]; summary: Record<string, number>; deployLog: string; createdAt: string; finishedAt: string | null
}
/** 导图节点（v2 图模型，kind 对齐模块四级；见 shared/product-graph-model）。 */
type ProductNode = ProductMapNode
interface Product {
  id: string; name: string; description: string; workspacePath: string; notebookId: string
  mindmap: string; styles: string[]; createdAt: string; updatedAt: string
  archivedAt?: string
}
/** 一张导图：一个产品可有多张（互为补充），每张导图有独立版本序列。 */
interface ProductMap {
  id: string; productId: string; name: string; description: string
  mindmap: string
  graph: ProductMapGraph
  graphRev: number; currentVersionId: string
  source: string; sourceRef: string; summary: string
  sortOrder?: number; createdAt: string; updatedAt: string
}
interface ProductMapVersion {
  id: string; mapId: string; seq: number; label: string; source: string; sourceRef: string
  summary: string; nodeCount: number; edgeCount: number; createdAt: string; graph?: ProductMapGraph
}
/** 门户「项目」：以 DSH 工作区为聚合法，把产品 / Bug 项目 / 测试项目收在同一张卡上。 */
interface ProjectCard {
  path: string; name: string
  /** 统一项目 id（四域共用的那份项目） */
  projectId?: string
  product?: Product; bugProject?: BugProject; tests: TestProject[]
}
interface Module {
  id: string; productId: string; mapId?: string; parentId: string; name: string; kind: 'module' | 'business' | 'feature' | 'requirement'
  platform: 'pc' | 'mobile' | 'tablet' | 'all'; description: string; noteId: string; status: string
  /** 关联的导图节点 id（v2 图模型）；空表示未关联。 */
  nodeId?: string; sortOrder?: number; archivedAt?: string
}
/** 模块 / 笔记生成进度（与 Demo 进度同构）。 */
interface ProductProgress {
  id: string; productId: string; kind: 'modules' | 'notes' | 'demo'; demoId?: string; mapId?: string
  step: number; total: number; status: 'running' | 'done' | 'failed'
  message: string; log: { step: number; message: string; at: string }[]; sessionId?: string; updatedAt: string
}
interface ProductDemo {
  id: string; productId: string; mapId?: string; style: string; scope: 'feature' | 'all'
  featureId: string; title: string; filePath: string; createdAt: string
  platform?: string; kind?: 'page' | 'system'; status?: string
}
interface DemoProgress {
  id: string; productId: string; demoId: string; step: number; total: number
  status: 'running' | 'done' | 'failed'; message: string
  log: { step: number; message: string; at: string }[]; updatedAt: string
}
interface Note {
  id: string; notebookId: string; mapId?: string; title: string; content: string; tags: string[]; pinned: boolean
  createdAt: string; updatedAt: string; filePath?: string
  /** 设计文档类型：module_design / product_design / feature_design（普通笔记为空）。 */
  kind?: string; nodeId?: string; moduleId?: string; docKey?: string; archivedAt?: string
}
interface CronTask {
  id: string; title: string; schedule: string; scheduleText?: string; status?: string
  lastRunAt?: number | null; lastStatus?: string | null; nextRunAt?: number | null
  lastDurationMs?: number; totalTokens?: number; totalCostUsd?: number
}
interface Settings { theme?: Theme; weekStart?: string; sideWidth?: number; [key: string]: unknown }
interface DB { spaces: Space[]; tasks: Task[]; focus: FocusSession[]; settings: Settings }
interface Health { ok: boolean; engine: string; file: string; sqlite?: string; revision: number; tasks: number; spaces: number; focus: number }

interface Ui {
  view: 'portal' | 'board' | 'list' | 'timeline' | 'matrix' | 'calendar' | 'focus' | 'stats' | 'news' | 'notes' | 'bugs' | 'product' | 'test' | 'idea'
  /** 当前项目范围：'all' 全部 / 'none' 未归属 / 其余为 DSH 工作区绝对路径。 */
  project: string
  scope: 'today' | 'all'
  space: string
  q: string
  selected: string | null
  detailTab: 'detail' | 'subtasks' | 'logs'
  collapsed: boolean
  calendarMode: 'week' | 'month' | 'year'
  calendarAnchor: string
  filter: 'all' | 'high' | 'sub' | 'attach' | 'unscheduled'
  sort: 'time' | 'priority' | 'created' | 'title'
  compact: boolean
  queueQ: string
  statsPeriod: 'week' | 'month' | 'year'
  focusExpand: boolean
  subNoteId: string | null
  newsTopicFilter: string
  newsLoading: boolean
  newsError: string
  notesQ: string
  notesFilter: string
  noteMode: 'edit' | 'preview'
}

interface Timer { preset: number; running: boolean; remaining: number; endsAt: number; taskId: string | null }

const STATUS_LABEL: Record<Status, string> = { next: '下一步', doing: '进行中', waiting: '等待中', done: '已完成' }
const STATUS_COLOR: Record<Status, string> = { next: '#8a8a94', doing: '#0f9f6e', waiting: '#c27c0e', done: '#9a9aa4' }
const PRIORITY_LABEL: Record<Priority, string> = { high: '高优先级', normal: '普通', low: '低优先级' }
const ACCENTS = ['#d97706', '#0f9f6e', '#2563eb', '#7c3aed', '#db2777', '#0891b2']

/** 侧栏宽度：拖动范围与默认值（窄面板跟随旧的 190 布局）。 */
const SIDE_MIN = 156
const SIDE_MAX = 420
const SIDE_DEFAULT = 200
const SIDE_DEFAULT_NARROW = 190

/**
 * 门户功能区按业务分组：每个分组整行铺满，组内卡片由 grid auto-fill 自适应宽度。
 * 改分组只改这里，渲染与样式不必跟着动。
 */
const PORTAL_GROUPS: Array<{ id: string; title: string; hint: string; views: Array<Ui['view']> }> = [
  { id: 'work', title: '工作', hint: '任务、日程与沉淀', views: ['list', 'board', 'calendar', 'stats', 'focus', 'notes', 'news'] },
  { id: 'rd', title: '研发', hint: '产品设计、缺陷、测试与灵感', views: ['product', 'bugs', 'test', 'idea'] },
]

/* ------------------------------- 时间工具 ------------------------------- */
function pad(n: number): string { return String(n).padStart(2, '0') }
function dateKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function todayKey(): string { return dateKey(new Date()) }
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}
function addDays(s: string, delta: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + delta)
  return dateKey(d)
}
function fmtDay(s: string): string {
  const d = parseDate(s)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
function weekdayName(s: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseDate(s).getDay()] ?? ''
}
function startOfWeek(s: string): string {
  const d = parseDate(s)
  d.setDate(d.getDate() - d.getDay())
  return dateKey(d)
}
function startOfMonth(s: string): string {
  const d = parseDate(s)
  return dateKey(new Date(d.getFullYear(), d.getMonth(), 1))
}
function addMonths(s: string, delta: number): string {
  const d = parseDate(s)
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  return dateKey(d)
}
function nowStamp(): string {
  const d = new Date()
  return `${todayKey()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function isoWeekStart(): string { return startOfWeek(todayKey()) }
function inRange(date: string | null, start: string, end: string): boolean {
  return date !== null && date >= start && date <= end
}
function timeText(t: Task): string { return t.start && t.end ? `${t.start}–${t.end}` : (t.start || '未安排') }
function uid(prefix: string): string { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }
function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))
}
function nf(n: number): string { return Number.isFinite(n) ? String(n) : '0' }

/* ------------------------------- 图标 ------------------------------- */
const PATHS: Record<string, string> = {
  logo: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M14 17h6M17 14v6"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  inbox: '<path d="M4 5h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  board: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="10" rx="1.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  news: '<path d="M4 5h13v14H5a1 1 0 0 1-1-1z"/><path d="M17 8h3v9a2 2 0 0 1-2 2H5"/><path d="M7 8h7M7 11h7M7 14h4"/>',
  notebook: '<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  bug: '<rect x="7" y="7" width="10" height="12" rx="5"/><path d="M12 3v4M5 11H3M21 11h-2M5 17H3M21 17h-2M8 6 6 4M16 6l2-2M8 18l-2 2M16 18l2 2"/>',
  product: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h4M7 12h7M7 16h5"/><circle cx="17" cy="8" r="2"/>',
  test: '<path d="M9 4h6M9 4a2 2 0 0 0-2 2v1h10V6a2 2 0 0 0-2-2"/><rect x="5" y="7" width="14" height="14" rx="2"/><path d="m9 13 2 2 4-4"/>',
  pin: '<path d="M9 4h6l-1 5 4 3v2H6v-2l4-3-1-5Z"/><path d="M12 14v7"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>',
  pdf: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h4"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9A1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.14.36.44.65.8.8H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.5-4.5"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10.5 21h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  upload: '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  rotate: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v4h4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  flag: '<path d="M5 21V4c4-2 8 2 12 0v9c-4 2-8-2-12 0"/>',
  tag: '<path d="M3 11V4h7l10 10-6 6L3 11z"/><circle cx="7.5" cy="7.5" r="1"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  note: '<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
  chevR: '<path d="m9 5 7 7-7 7"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>',
  chevD: '<path d="m5 9 7 7 7-7"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  sort: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  paperclip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-9 9"/>',
  arrowR: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  checkSquare: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>',
  playSmall: '<path d="M8 5v14l11-7z"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  corner: '<path d="M6 3v8a4 4 0 0 0 4 4h8"/><path d="m15 12 3 3-3 3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
}
function ic(name: string, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`
}

/* ------------------------------- 挂载 ------------------------------- */
export interface WorkbenchHandle { destroy(): void }
interface DshClientContext {
  get?<T = unknown>(name: string): T | undefined
  layout?: { selectPanel(panelId: string | null): void }
  on?(event: string, callback: (...args: any[]) => void): () => void
}

export function mountWorkbench(hostEl: HTMLElement, dshCtx?: DshClientContext): WorkbenchHandle {
  const shadow = hostEl.attachShadow({ mode: 'open' })
  hostEl.style.display = 'block'
  hostEl.style.height = '100%'
  hostEl.style.minHeight = '0'
  shadow.innerHTML = `<style>${WORKBENCH_CSS}</style>${SHELL}`

  const $id = <T extends HTMLElement = HTMLElement>(id: string): T | null => shadow.getElementById(id) as T | null
  const agentPanel = createAgentPanel({
    api: API, esc, ic,
    toast: (message: string) => toast(message),
    confirm: (message: string) => (typeof window.confirm === 'function' ? window.confirm(message) : true),
    openModal: (html: string) => openModal(html),
    closeModal: () => closeModal(),
    q: $id,
  })
  agentPanel.onRefresh(() => renderAll())
  const content = (): HTMLElement => $id('wb-content') as HTMLElement
  const detail = (): HTMLElement => $id('wb-detail') as HTMLElement

  let db: DB = { spaces: [], tasks: [], focus: [], settings: {} }
  let revision = 0
  let loaded = false
  let loadError = ''
  let saveTimer = 0
  let saveState: 'saved' | 'saving' | 'error' = 'saved'
  let conflictReloading = false
  let dirty = false
  /** 侧栏当前宽度（像素）；持久化在 settings.sideWidth。 */
  let sideWidth = SIDE_DEFAULT

  /**
   * 应用侧栏宽度：写到 .app 的 --wb-side-w 上，由 CSS 驱动侧栏宽度。
   * persist 为真时写回 settings.sideWidth（一次拖动只在松手时落库一次）。
   */
  function applySideWidth(px: number, persist: boolean): void {
    const next = Math.min(SIDE_MAX, Math.max(SIDE_MIN, Math.round(Number.isFinite(px) ? px : SIDE_DEFAULT)))
    sideWidth = next
    const app = $id('wb-app')
    if (app !== null) app.style.setProperty('--wb-side-w', `${next}px`)
    if (persist) {
      db.settings.sideWidth = next
      scheduleSave()
    }
  }

  /** 首次进入：优先用保存过的宽度，否则按面板宽度给默认值。 */
  function initSideWidth(): void {
    const saved = typeof db.settings.sideWidth === 'number' ? db.settings.sideWidth : undefined
    const fallback = window.matchMedia('(max-width:1250px)').matches ? SIDE_DEFAULT_NARROW : SIDE_DEFAULT
    applySideWidth(saved ?? fallback, false)
  }

  /* ---------- 新闻（与任务快照分开，由定时任务 agent 异步写入） ---------- */
  let newsTopics: NewsTopic[] = []
  let newsItems: NewsItem[] = []
  let cronTasks: CronTask[] = []
  let cronAvailable = true
  let cronError = ''
  let newsLoadedAt = 0
  let newsWatchUntil = 0
  let lastNewsPoll = 0
  let newsSig = ''
  const newsRunning: Record<string, number> = {}
  let collapseTouched = false

  /* ---------- 记事本 ---------- */
  let bugProjects: BugProject[] = []
  let bugs: Bug[] = []
  let bugProjectFilter = 'all'
  let bugSearch = ''
  let bugSelected = new Set<string>()
  let bugLoading = false
  let bugError = ''
  let bugsSig = ''
  let products: Product[] = []
  let productDemos: ProductDemo[] = []
  let productModules: Module[] = []
  let productSelected: string | null = null
  /** 当前产品下的导图清单与选中导图；'' 表示「全部导图」聚合视图。 */
  let productMaps: ProductMap[] = []
  let productMapSelected = ''
  /** 其他页签是否聚合「全部导图」（地图页签永远只看选中导图）。 */
  let productMapScopeAll = false
  /** 宿主是否提供多导图接口（旧宿主 404 时退回单导图 + products.mindmap）。 */
  let productMapsReady = false
  let productTab: 'map' | 'notes' | 'modules' | 'demo' = 'map'
  let productNodeSelected: string | null = null
  /** 画布引擎：mind-elixir（编辑）/ ECharts 力导（关系）。 */
  let productMapEngine: 'tree' | 'force' = 'tree'
  /** 当前导图的版本序列（参照灵感：存档 / 对比 / 回滚 / 只读预览）。 */
  let productMapVersions: ProductMapVersion[] = []
  let productMapPreview: ProductMapVersion | null = null
  let productMind: any = null
  let productChart: any = null
  let productMindLoading: Promise<void> | null = null
  let productMindSyncTimer = 0
  /** 草稿保存串行链：并发提交同一 rev 会假 409 并回写覆盖，排队后后者带上前者返回的 rev。 */
  let productPersistChain: Promise<void> = Promise.resolve()
  /** 版本面板显示条数（可增量展开；避免 12 条硬截断后旧版本不可达）。 */
  let productVersionLimit = 12
  /** 导图节点搜索关键字。 */
  let productSearch = ''
  let ctxMenuOpen = false
  let productPicked = new Set<string>()
  let productStyle = 'clean'
  let productPlatform: 'pc' | 'mobile' | 'tablet' | 'all' = 'all'
  let productDemoKind: 'page' | 'system' = 'page'
  let demoViewport: 'pc' | 'tablet' | 'mobile' = 'pc'
  let demoProgress: DemoProgress | null = null
  let demoProgressDismissedAt = ''
  /** 模块/笔记生成进度 + 页内会话（团队派发）状态。 */
  let productProgress: ProductProgress | null = null
  let productProgressKind: 'modules' | 'notes' = 'modules'
  /** 模块页筛选（空串=不筛）。 */
  let moduleFilterKind = ''
  let moduleFilterPlatform = ''
  /** 笔记页：只看未关联节点的笔记。 */
  let noteFilterMissing = false
  /** 是否显示已归档内容（产品/模块/文档）。 */
  let showArchived = false
  /** 统一项目清单（门户 / Bug / 测试 / 灵感共用）。 */
  let projects: Array<{ id: string; name: string; description?: string; workspacePath: string; workspaceName?: string; archivedAt?: string }> = []
  /** 页内会话（团队派发）句柄与当前派发。 */
  let productChat: ChatHandle | null = null
  let productDispatch: { dispatchId: string; sessionId: string; teamName: string } | null = null
  let productChatTimer = 0
  let productLoading = false
  let productError = ''
  let productSig = ''
  let productDemoSelected = ''
  let testProjects: TestProject[] = []
  let testCases: TestCase[] = []
  let testRuns: TestRun[] = []
  let testProjectSelected: string | null = null
  let testTab: 'cases' | 'run' | 'report' | 'deploy' = 'cases'
  let testRunSelected: string | null = null
  let testLoading = false
  let testError = ''
  let testSig = ''
  let testDeployLog = ''
  let testGenSource: 'requirement' | 'notes' | 'demo' = 'requirement'
  let testGenRequirement = ''

  let notes: Note[] = []
  let notebooks: Notebook[] = []
  let noteNotebookFilter = 'all'
  let noteSelected: string | null = null
  let exportDir = ''
  let defaultExportDir = ''
  let lastExportPath = ''
  let noteExporting = false
  let noteLoading = false
  let noteError = ''
  let noteDirty = false
  let noteSaving = false
  let noteChangeSeq = 0
  let noteSaveTimer = 0
  let noteSaveState: 'saved' | 'saving' | 'error' = 'saved'

  const ui: Ui = {
    view: 'portal', project: 'all', scope: 'today', space: 'all', q: '', selected: null, detailTab: 'detail',
    collapsed: hostEl.clientWidth > 0 ? hostEl.clientWidth < 1250 : window.innerWidth < 1450,
    calendarMode: 'week', calendarAnchor: todayKey(),
    filter: 'all', sort: 'time', compact: false, queueQ: '', statsPeriod: 'week', focusExpand: false, subNoteId: null,
    newsTopicFilter: 'all', newsLoading: false, newsError: '',
    notesQ: '', notesFilter: 'all', noteMode: 'edit',
  }
  const timer: Timer = { preset: 25, running: false, remaining: 25 * 60, endsAt: 0, taskId: null }

  /* ---------- 派生 ---------- */
  const spaceOf = (id: string): Space => db.spaces.find(s => s.id === id) ?? { id, name: id || '未分组', color: '#8a8a94' }
  const taskOf = (id: string | null): Task | undefined => db.tasks.find(t => t.id === id)
  const selectedTask = (): Task | undefined => taskOf(ui.selected)
  const pool = (): Task[] => ui.scope === 'all' ? db.tasks : db.tasks.filter(t => t.date === todayKey() || (t.status === 'doing' && t.date === null))
  const matchQ = (t: Task): boolean => {
    const q = ui.q.trim().toLowerCase()
    if (q === '') return true
    return `${t.title} ${t.desc} ${t.note} ${spaceOf(t.space).name}`.toLowerCase().includes(q)
  }
  const matchSpace = (t: Task): boolean => ui.space === 'all' || t.space === ui.space
  const matchFilter = (t: Task): boolean => {
    switch (ui.filter) {
      case 'high': return t.priority === 'high'
      case 'sub': return t.subtasks.length > 0
      case 'attach': return t.attachments.length > 0
      case 'unscheduled': return !t.start
      default: return true
    }
  }
  const visible = (t: Task): boolean => matchQ(t) && matchSpace(t) && matchFilter(t) && matchProject(t)
  const sortTasks = (items: Task[], mode = ui.sort): Task[] => {
    const copy = items.slice()
    if (mode === 'priority') {
      const rank: Record<Priority, number> = { high: 0, normal: 1, low: 2 }
      copy.sort((a, b) => rank[a.priority] - rank[b.priority] || (a.start || '99:99').localeCompare(b.start || '99:99'))
    } else if (mode === 'created') {
      copy.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    } else if (mode === 'title') {
      copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    } else {
      copy.sort((a, b) => `${a.date ?? '9999'} ${a.start || '99:99'}`.localeCompare(`${b.date ?? '9999'} ${b.start || '99:99'}`))
    }
    return copy
  }
  const todayStats = (): { done: number; total: number; pending: number } => {
    const list = db.tasks.filter(t => t.date === todayKey() && matchProject(t))
    return {
      done: list.filter(t => t.status === 'done').length,
      total: list.length,
      pending: list.filter(t => t.status !== 'done').length,
    }
  }
  const todayFocus = (): { minutes: number; rounds: number } => {
    const list = db.focus.filter(f => f.startedAt.slice(0, 10) === todayKey() && f.completed)
    return { minutes: list.reduce((sum, f) => sum + f.minutes, 0), rounds: list.length }
  }
  const doneOf = (t: Task): boolean => t.status === 'done'
  const doneAt = (t: Task): string => (t.completedAt ?? '').slice(0, 10) || (t.date ?? '')

  /* ---------- 项目（= DSH 工作区；产品 / Bug / 测试是同一项目下的三个域） ---------- */
  function projectCards(): ProjectCard[] {
    const map = new Map<string, ProjectCard>()
    const ensure = (path: string): ProjectCard => {
      const found = map.get(path)
      if (found !== undefined) return found
      const card: ProjectCard = { path, name: '', tests: [] }
      map.set(path, card)
      return card
    }
    /* 以统一项目为骨架：四域（产品 / Bug / 测试 / 灵感）共用一份项目清单，
       避免「门户建了产品、Bug 页还要再建项目」这类分裂。无工作区的项目单独成卡。 */
    const unified = new Map<string, string>()
    for (const project of projects) {
      unified.set(project.id, project.name)
      const card = ensure(project.workspacePath || `prj:${project.id}`)
      card.name = project.name
      card.projectId = project.id
    }
    for (const product of products) {
      if (!product.workspacePath) continue
      const card = ensure(product.workspacePath)
      card.product = product
      if (card.name === '') card.name = product.name
    }
    for (const project of bugProjects) {
      if (!project.workspacePath) continue
      const card = ensure(project.workspacePath)
      card.bugProject = project
      if (card.name === '') card.name = project.name
    }
    for (const project of testProjects) {
      if (!project.workspacePath) continue
      const card = ensure(project.workspacePath)
      card.tests.push(project)
      if (card.name === '') card.name = project.name
    }
    for (const task of db.tasks) if (task.projectPath) ensure(task.projectPath)
    const cards: ProjectCard[] = []
    for (const card of map.values()) cards.push({ ...card, name: card.name || bugWorkspaceName(card.path) })
    return cards.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }
  function projectByPath(path: string): ProjectCard | undefined {
    return projectCards().find(card => card.path === path)
  }
  function projectLabel(path: string): string {
    if (path === 'all') return '全部项目'
    if (path === 'none' || path === '') return '未归属'
    return projectByPath(path)?.name ?? bugWorkspaceName(path)
  }
  function projectLabelOfTask(task: Task): string {
    return task.projectPath ? projectLabel(task.projectPath) : '未归属'
  }
  const matchProject = (t: Task): boolean => {
    if (ui.project === 'all') return true
    if (ui.project === 'none') return t.projectPath === ''
    return t.projectPath === ui.project
  }
  function projectTaskCount(path: string): number {
    return path === 'none' ? db.tasks.filter(t => t.projectPath === '').length : db.tasks.filter(t => t.projectPath === path).length
  }
  function projectBugCount(path: string): number {
    return path === 'none' ? 0 : bugs.filter(bug => bugProjectOf(bug.projectId)?.workspacePath === path).length
  }
  function projectTestCount(path: string): number {
    return path === 'none' ? 0 : testProjects.filter(project => project.workspacePath === path).length
  }
  function projectNoteCount(path: string): number {
    if (path === 'none') return 0
    const ids = new Set(notebooks.filter(book => book.workspacePath === path).map(book => book.id))
    return notes.filter(note => ids.has(note.notebookId)).length
  }
  /** 切换项目范围：同时把产品 / Bug / 测试三个域的当前选择切到该项目，门户点卡片即完成对齐。 */
  function setProject(path: string, render = true): void {
    ui.project = path
    const card = projectByPath(path)
    if (card?.product !== undefined) {
      productSelected = card.product.id
      productPicked = productDefaultPicked(card.product)
    }
    if (card?.bugProject !== undefined) bugProjectFilter = card.bugProject.id
    const targetTest = card?.tests[0]
    if (targetTest !== undefined) testProjectSelected = targetTest.id
    db.settings.project = path === 'none' ? '' : path
    scheduleSave()
    if (render) renderAll()
  }
  /** 会话内恢复上次选中的项目（产品列表加载完成后再调用，避免误判为失效）。 */
  function restoreProject(): void {
    const saved = db.settings.project
    if (typeof saved !== 'string') return
    const next = saved === '' ? 'none' : saved
    if (next === 'all' || next === 'none' || projectByPath(next) !== undefined) ui.project = next
  }
  function projectSelect(): string {
    const cards = projectCards()
    const options = [
      `<option value="all" ${ui.project === 'all' ? 'selected' : ''}>全部项目</option>`,
      ...cards.map(card => `<option value="${esc(card.path)}" ${ui.project === card.path ? 'selected' : ''}>${esc(card.name)}</option>`),
      `<option value="none" ${ui.project === 'none' ? 'selected' : ''}>未归属</option>`,
    ]
    return `<select id="wb-project" class="wb-project-select" title="按项目筛选">${options.join('')}</select>`
  }
  async function refreshPortal(): Promise<void> {
    await Promise.all([loadProducts(true), loadBugs(true), loadTests(true)])
    restoreProject()
    if (ui.view === 'portal' || ui.view === 'bugs' || ui.view === 'test') renderAll()
  }
  function openFeature(view: Ui['view']): void {
    const card = projectByPath(ui.project)
    if (view === 'product' && card?.product !== undefined) productSelected = card.product.id
    if (view === 'test' && card?.tests[0] !== undefined) testProjectSelected = card.tests[0].id
    if (view === 'bugs') bugProjectFilter = card?.bugProject?.id ?? 'all'
    if (view === 'notes') {
      const book = card?.product !== undefined ? notebooks.find(b => b.id === card.product?.notebookId) : undefined
      noteNotebookFilter = book?.id ?? 'all'
    }
    if (ui.view === 'notes' && view !== 'notes') void flushNoteSave()
    ui.view = view
    renderAll()
    if (view === 'news') void loadNews()
    if (view === 'notes') void loadNotes()
    if (view === 'bugs' && bugs.length === 0) void loadBugs()
    if (view === 'product' && products.length === 0) void loadProducts()
    if (view === 'test' && testProjects.length === 0) void loadTests()
  }
  function openPortal(): void {
    ui.view = 'portal'
    renderAll()
    void refreshPortal()
  }

  /* ---------- 主题 ---------- */
  function resolvedTheme(): 'light' | 'dark' {
    const pref = db.settings.theme ?? 'auto'
    if (pref === 'light' || pref === 'dark') return pref
    const body = document.body
    const html = document.documentElement
    return body.hasAttribute('data-ds-dark-theme') || html.getAttribute('data-theme') === 'dark' || body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  }
  function applyTheme(): void {
    const pref = db.settings.theme ?? 'auto'
    if (pref === 'light' || pref === 'dark') hostEl.setAttribute('data-wb-theme', pref)
    else hostEl.removeAttribute('data-wb-theme')
    hostEl.setAttribute('data-wb-scheme', resolvedTheme())
  }

  /* ---------- 保存 ---------- */
  function setSaveState(next: 'saved' | 'saving' | 'error'): void {
    saveState = next
    const node = $id('save-dot')
    const wrap = node?.parentElement
    if (node && wrap) {
      wrap.classList.toggle('err', next === 'error')
      wrap.classList.toggle('busy', next === 'saving')
      wrap.innerHTML = `<i id="save-dot"></i>${next === 'saved' ? '已自动保存' : next === 'saving' ? '保存中…' : '保存失败'}`
    }
  }
  function scheduleSave(): void {
    dirty = true
    setSaveState('saving')
    if (saveTimer !== 0) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => { void flush() }, 450)
  }
  async function flush(): Promise<void> {
    if (saveTimer !== 0) { window.clearTimeout(saveTimer); saveTimer = 0 }
    if (!loaded || conflictReloading || !dirty) return
    try {
      const res = await fetch(`${API}/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision, state: db }),
        keepalive: true,
      })
      if (res.status === 409) {
        const data = await res.json() as { current?: { revision: number } & DB }
        if (data.current) {
          conflictReloading = true
          dirty = false
          if (saveTimer !== 0) { window.clearTimeout(saveTimer); saveTimer = 0 }
          applyRemote(data.current)
          setSaveState('saved')
          renderAll()
          toast('数据已在别处更新，已重新载入')
        }
        conflictReloading = false
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { revision: number }
      revision = data.revision
      dirty = false
      setSaveState('saved')
    } catch (cause) {
      console.warn('[dsh-workbench] 保存失败', cause)
      setSaveState('error')
    }
  }
  function applyRemote(remote: { revision?: number } & Partial<DB>): void {
    db = {
      spaces: Array.isArray(remote.spaces) ? remote.spaces as Space[] : [],
      tasks: Array.isArray(remote.tasks) ? remote.tasks as Task[] : [],
      focus: Array.isArray(remote.focus) ? remote.focus as FocusSession[] : [],
      settings: (remote.settings && typeof remote.settings === 'object') ? remote.settings as Settings : {},
    }
    revision = typeof remote.revision === 'number' ? remote.revision : revision
    if (ui.selected !== null && taskOf(ui.selected) === undefined) ui.selected = chooseSelection()
    if (timer.taskId !== null && taskOf(timer.taskId) === undefined) timer.taskId = chooseSelection()
  }
  function chooseSelection(): string | null {
    const today = todayKey()
    const todays = db.tasks.filter(t => t.date === today)
    const preferred = todays.find(t => t.status === 'doing') ?? todays.find(t => t.status !== 'done') ?? db.tasks.find(t => t.status === 'doing') ?? db.tasks.find(t => t.status !== 'done') ?? db.tasks[0]
    return preferred?.id ?? null
  }
  function mutate(fn: () => void): void {
    fn()
    renderAll()
    scheduleSave()
  }

  /* ---------- 渲染：骨架 ---------- */
  function renderAll(): void {
    applyTheme()
    if (loaded && ui.project !== 'all' && ui.project !== 'none' && projectByPath(ui.project) === undefined) ui.project = 'all'
    const app = $id('wb-app')
    if (app) {
      app.classList.toggle('collapsed', ui.collapsed)
      app.classList.toggle('compact', ui.compact)
      app.classList.toggle('focus-expand', ui.view === 'focus' && ui.focusExpand)
      app.classList.toggle('no-detail', ['portal', 'calendar', 'focus', 'stats', 'news', 'notes', 'bugs', 'product', 'test'].includes(ui.view))
    }
    renderSidebar()
    renderTopbar()
    renderContent()
    renderDetail()
    syncIdeaView()
  }
  function renderSidebar(): void {
    const ts = todayStats()
    const pct = ts.total > 0 ? Math.round((ts.done / ts.total) * 100) : 0
    let context = ''
    if (ui.view === 'portal') {
      const cards = projectCards()
      const items = cards.map(card => sideItem(`${esc(card.name)}`, { icon: 'product', act: 'portal-project', id: esc(card.path), n: projectTaskCount(card.path), active: ui.project === card.path })).join('')
      context = sideGroup('项目 / 产品', null,
        '<div class="side-sub" style="padding:3px 8px 6px">先选项目，再进入对应功能</div>' +
        sideItem('全部项目', { icon: 'layers', act: 'portal-project', id: 'all', n: db.tasks.length, active: ui.project === 'all' }) +
        items +
        sideItem('未归属', { icon: 'inbox', act: 'portal-project', id: 'none', n: projectTaskCount('none'), active: ui.project === 'none' }) +
        sideItem('新建项目 / 产品', { icon: 'plus', act: 'portal-new' }))
    } else if (ui.view === 'calendar') {
      context = sideGroup('计划', null,
        '<div class="side-sub" style="padding:3px 8px 6px">安排时间与节奏</div>' +
        '<div class="side-sub" style="padding:2px 8px 4px;color:var(--text-3);font-size:10.5px">计划视图</div>' +
        sideItem('时间轴', { icon: 'list', view: 'timeline' }) +
        sideItem('日历', { icon: 'calendar', view: 'calendar', active: true }))
    } else if (ui.view === 'focus') {
      context = sideGroup('专注', null,
        '<div class="side-sub" style="padding:3px 8px 6px">管理当前任务、计时长度和待专注队列</div>' +
        sideItem('专注空间', { icon: 'target', view: 'focus', active: true }) +
        sideItem('待专注', { icon: 'clock', view: 'focus', n: db.tasks.filter(t => t.status !== 'done').length }))
    } else if (ui.view === 'test') {
      const items = testProjects.map(p => sideItem(`${esc(p.name)}`, { icon: 'test', act: 'test-pick', id: p.id, active: testProjectSelected === p.id })).join('')
      context = sideGroup('测试', null,
        '<div class="side-sub" style="padding:3px 8px 6px">用例 → 执行 → Bug → 回归 → 报告</div>' +
        items +
        sideItem('新建测试项目', { icon: 'plus', act: 'test-new' }))
    } else if (ui.view === 'product') {
      const items = products.map(p => sideItem(`${esc(p.name)}`, { icon: 'product', act: 'product-select', id: p.id, active: productSelected === p.id })).join('')
      context = sideGroup('产品设计', null,
        '<div class="side-sub" style="padding:3px 8px 6px">导图 → 设计笔记 → 多风格 Demo</div>' +
        items +
        sideItem('新建产品', { icon: 'plus', act: 'product-new' }))
    } else if (ui.view === 'bugs') {
      const projectItems = bugProjects.map(project => sideItem(`${esc(project.name)} · ${bugs.filter(b => b.projectId === project.id).length}`, { icon: 'bug', act: 'bug-project', id: project.id, active: bugProjectFilter === project.id })).join('')
      context = sideGroup('Bug 项目', null,
        '<div class="side-sub" style="padding:3px 8px 6px">项目关联 DSH 工作区，可批量在新会话中修复</div>' +
        sideItem('全部 Bug', { icon: 'layers', act: 'bug-project', id: 'all', active: bugProjectFilter === 'all' }) +
        projectItems +
        sideItem('新建项目', { icon: 'plus', act: 'bug-project-new' }))
    } else if (ui.view === 'notes') {
      context = sideGroup('记事本', null,
        '<div class="side-sub" style="padding:3px 8px 6px">随手记、Markdown、标签与收藏</div>' +
        sideItem('全部笔记', { icon: 'notebook', view: 'notes', active: true }) +
        sideItem('新建笔记', { icon: 'plus', act: 'note-new' }))
    } else if (ui.view === 'news') {
      context = sideGroup('新闻', null,
        '<div class="side-sub" style="padding:3px 8px 6px">按主题、按时间用 DSH Agent 检索</div>' +
        sideItem('新闻检索', { icon: 'news', view: 'news', active: true }) +
        sideItem('新增订阅', { icon: 'plus', act: 'news-add' }))
    } else if (ui.view === 'idea') {
      context = sideGroup('灵感', null,
        '<div class="side-sub" style="padding:3px 8px 6px">中间一栏管理灵感；画布可在导图 / 力导之间切换</div>' +
        '<div class="side-sub" style="padding:2px 8px 4px;color:var(--text-3);font-size:10.5px">研发视图</div>')
    } else if (ui.view === 'stats') {
      context = sideGroup('统计', null,
        '<div class="side-sub" style="padding:3px 8px 6px">用同一套任务数据复盘每天、每周与全年</div>' +
        sideItem('统计', { icon: 'chart', view: 'stats', active: true }) +
        sideItem('数据复盘', { icon: 'spark', act: 'review' }))
    } else {
      context = sideGroup('任务', `${ts.pending} 项待处理`,
        sideItem('今天', { icon: 'home', view: 'list', scope: 'today', n: ts.pending, active: ui.scope === 'today' && ui.view === 'list' }) +
        sideItem('全部任务', { icon: 'inbox', view: 'list', scope: 'all', n: db.tasks.length, active: ui.scope === 'all' }) +
        sideItem('看板', { icon: 'board', view: 'board', active: ui.view === 'board' }) +
        sideItem('四象限', { icon: 'grid', view: 'matrix', active: ui.view === 'matrix' }) +
        '<div class="side-sub" style="padding:6px 8px 0;color:var(--text-3);font-size:10.5px">计划视图</div>' +
        sideItem('时间轴', { icon: 'list', view: 'timeline' }) +
        sideItem('日历', { icon: 'calendar', view: 'calendar' }))
    }
    const spaces = db.spaces.map(space => sideItem(space.name, {
      dot: space.color, space: space.id, n: db.tasks.filter(t => t.space === space.id && t.date === todayKey() && t.status !== 'done').length,
      active: ui.space === space.id,
    })).join('')
    const sidebar = $id('wb-sidebar')
    if (!sidebar) return
    sidebar.innerHTML = `
      <div class="brand">
        <div class="brand-mark">${ic('logo', 17)}</div>
        <div><div class="brand-t">个人工作台</div><div class="brand-s">本地工作台 · SQLite</div></div>
        <button class="brand-collapse" data-act="collapse" title="收起侧栏">${ic('panel', 15)}</button>
      </div>
      <div class="side-home${ui.view === 'portal' ? ' active' : ''}">
        <div class="side-item${ui.view === 'portal' ? ' active' : ''}" data-act="portal-home">${ic('home', 15)}<span>门户</span></div>
      </div>
      <div class="side-scroll">${context}
        <div class="side-sec">
          <div class="side-head">研发</div>
          ${sideItem('产品设计', { icon: 'product', view: 'product', active: ui.view === 'product' })}
          ${sideItem('Bug 管理', { icon: 'bug', view: 'bugs', active: ui.view === 'bugs' })}
          ${sideItem('测试', { icon: 'test', view: 'test', active: ui.view === 'test' })}
          ${sideItem('灵感', { icon: 'spark', view: 'idea', active: ui.view === 'idea' })}
        </div>
        ${ui.view === 'portal' ? '' : `<div class="side-sec"><div class="side-head">空间<button class="add" data-act="space-add" title="新建空间">${ic('plus', 13)}</button></div>${spaces}</div>`}
      </div>
      <div class="side-foot">
        <div class="foot-ring" style="--p:${pct}"><i></i></div>
        <div><b>今日进度</b> · 已完成 <b>${ts.done}</b> 项任务</div>
        <button class="icon-btn" data-act="settings" title="工作台设置" aria-label="工作台设置" style="margin-left:auto">${ic('settings', 14)}</button>
      </div>`
  }
  function sideGroup(title: string, count: string | null, items: string): string {
    return `<div class="side-sec"><div class="side-head">${title}${count ? `<span class="count">${count}</span>` : ''}<button class="add" data-act="new" title="新建任务">${ic('plus', 13)}</button></div>${items}</div>`
  }
  function sideItem(label: string, opts: { icon?: string; view?: string; scope?: string; space?: string; act?: string; id?: string; n?: number; dot?: string; active?: boolean }): string {
    return `<div class="side-item${opts.active ? ' active' : ''}" title="${label}" ${opts.view ? `data-view="${opts.view}"` : ''} ${opts.act ? `data-act="${opts.act}"` : ''} ${opts.id ? `data-id="${opts.id}"` : ''} ${opts.scope ? `data-scope="${opts.scope}"` : ''} ${opts.space ? `data-space="${opts.space}"` : ''}>
      ${opts.dot ? `<span class="dot" style="background:${opts.dot}"></span>` : ic(opts.icon ?? 'list', 15)}
      <span>${label}</span>${opts.n !== undefined ? `<span class="n">${opts.n}</span>` : ''}</div>`
  }

  function openCommandPalette(): void {
    const commands = [
      { id: 'portal', label: '项目门户', hint: '选项目 / 进功能', icon: 'home', view: 'portal' },
      { id: 'board', label: '看板', hint: '任务视图', icon: 'board', view: 'board' },
      { id: 'list', label: '行动清单', hint: '任务视图', icon: 'list', view: 'list' },
      { id: 'timeline', label: '时间轴', hint: '计划视图', icon: 'clock', view: 'timeline' },
      { id: 'matrix', label: '四象限', hint: '任务视图', icon: 'grid', view: 'matrix' },
      { id: 'calendar', label: '日历', hint: '计划视图', icon: 'calendar', view: 'calendar' },
      { id: 'focus', label: '专注', hint: '当前专注', icon: 'target', view: 'focus' },
      { id: 'stats', label: '统计', hint: '数据复盘', icon: 'chart', view: 'stats' },
      { id: 'news', label: '新闻', hint: '新闻检索', icon: 'news', view: 'news' },
      { id: 'notes', label: '记事本', hint: '笔记', icon: 'notebook', view: 'notes' },
      { id: 'bugs', label: 'Bug 管理', hint: '质量看板', icon: 'bug', view: 'bugs' },
      { id: 'product', label: '产品设计', hint: '导图/模块/笔记/Demo', icon: 'product', view: 'product' },
      { id: 'test', label: '测试', hint: '用例/执行/报告', icon: 'test', view: 'test' },
      { id: 'idea', label: '灵感', hint: '发散成导图 / 力导图', icon: 'spark', view: 'idea' },
      { id: 'new-task', label: '新建任务', hint: '⌘N', icon: 'plus', action: 'new' },
      { id: 'new-note', label: '新建笔记', hint: '记事本', icon: 'plus', action: 'note-new' },
      { id: 'new-bug', label: '新建 Bug', hint: '质量管理', icon: 'plus', action: 'bug-new' },
      { id: 'new-product', label: '新建产品', hint: '产品设计', icon: 'plus', action: 'product-new' },
      { id: 'new-test', label: '新建测试项目', hint: '测试', icon: 'plus', action: 'test-new' },
      { id: 'theme', label: '切换主题', hint: '跟随 DSH / 浅 / 深', icon: 'sun', action: 'theme' },
      { id: 'settings', label: '工作台设置', hint: '导出/主题/数据', icon: 'settings', action: 'settings' },
    ]
    openModal(`<div class="cmd-palette"><div class="cmd-search">${ic('search', 15)}<input id="wb-cmd-input" placeholder="搜索视图、操作或跳转…" autocomplete="off"><span class="kbd">ESC</span></div>
      <div class="cmd-list" id="wb-cmd-list">${commands.map(c => `<button class="cmd-row" data-act="cmd-go" data-view="${c.view ?? ''}" data-action="${c.action ?? ''}"><span class="cmd-ico">${ic(c.icon, 15)}</span><span><b>${c.label}</b><small>${c.hint}</small></span></button>`).join('')}</div>
      <div class="cmd-foot">↑↓ 选择 · Enter 执行 · Esc 关闭</div></div>`)
    const input = $id<HTMLInputElement>('wb-cmd-input')
    const rows = () => Array.from($id('wb-cmd-list')?.querySelectorAll<HTMLButtonElement>('.cmd-row') ?? [])
    const filter = (): void => {
      const q = (input?.value ?? '').trim().toLowerCase()
      rows().forEach(row => {
        const text = (row.textContent ?? '').toLowerCase()
        row.style.display = q === '' || text.includes(q) ? '' : 'none'
      })
    }
    input?.addEventListener('input', filter)
    input?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); const visible = rows().filter(r => r.style.display !== 'none'); (visible[0] ?? input)?.focus() }
      if (event.key === 'Enter') { event.preventDefault(); const first = rows().find(r => r.style.display !== 'none'); first?.click() }
    })
    window.setTimeout(() => input?.focus(), 20)
  }

  function renderTopbar(): void {
    const topbar = $id('wb-topbar')
    if (!topbar) return
    const saveText = saveState === 'saved' ? '已自动保存' : saveState === 'saving' ? '保存中…' : '保存失败'
    topbar.innerHTML = `
      ${ui.collapsed ? `<button class="icon-btn" data-act="collapse" title="展开侧栏">${ic('panel', 15)}</button>` : ''}
      <div class="crumb">${MODULE_OF[ui.view]} <span>/</span> <b>${NAME_OF[ui.view]}</b></div>
      <div class="searchbar">${ic('search', 14)}<input id="wb-search" placeholder="搜索或跳转…" value="${esc(ui.q)}"><span class="kbd" data-act="cmd" title="命令面板">⌘K</span></div>
      <div class="top-actions">
        <button class="icon-btn" title="${ui.compact ? '标准视图' : '紧凑视图'}" data-act="density">${ic('list', 15)}</button>
        <button class="icon-btn" title="主题" data-act="theme">${ic(resolvedTheme() === 'light' ? 'moon' : 'sun', 15)}</button>
        <span class="save ${saveState === 'error' ? 'err' : saveState === 'saving' ? 'busy' : ''}"><i id="save-dot"></i>${saveText}</span>
        <button class="icon-btn" title="通知" data-act="notify">${ic('bell', 15)}</button>
        <button class="btn-primary" data-act="new">${ic('plus', 14)}新建任务</button>
      </div>`
    const input = $id<HTMLInputElement>('wb-search')
    input?.addEventListener('input', () => {
      ui.q = input.value
      renderContent()
    })
  }

  /* ---------- 内容 ---------- */
  const FILTER_LABEL: Record<Ui['filter'], string> = { all: '筛选', high: '高优先级', sub: '有子待办', attach: '有附件', unscheduled: '未排时间' }
  const SORT_LABEL: Record<Ui['sort'], string> = { time: '按时间', priority: '按优先级', created: '按创建', title: '按标题' }
  const MODULE_OF: Record<Ui['view'], string> = { portal: '工作台', board: '任务', list: '任务', timeline: '计划', matrix: '任务', calendar: '计划', focus: '专注', stats: '统计', news: '新闻', notes: '记事本', bugs: 'Bug 管理', product: '产品设计', test: '测试', idea: '研发' }
  const NAME_OF: Record<Ui['view'], string> = { portal: '项目门户', board: '看板', list: '行动清单', timeline: '时间轴', matrix: '四象限', calendar: '日历', focus: '当前专注', stats: '数据复盘', news: '新闻检索', notes: '笔记', bugs: '质量管理', product: '产品', test: '测试', idea: '灵感' }

  function renderContent(): void {
    if (ui.view === 'idea') { syncIdeaView(); return }
    const el = $id('wb-generic') ?? content()
    if (!el) return
    if (!loaded) {
      el.innerHTML = loadError !== ''
        ? `<div class="wb-error"><div>工作台数据读取失败</div><div class="muted">${esc(loadError)}</div><button class="btn" data-act="retry">重试</button></div>`
        : '<div class="wb-loading"><div class="spin"></div><div>正在读取工作台…</div></div>'
      return
    }
    let html = ''
    if (ui.view === 'portal') html = renderPortal()
    else if (ui.view === 'board') html = renderBoard()
    else if (ui.view === 'list') html = renderList()
    else if (ui.view === 'timeline') html = renderTimeline()
    else if (ui.view === 'matrix') html = renderMatrix()
    else if (ui.view === 'calendar') html = renderCalendar()
    else if (ui.view === 'focus') html = renderFocus()
    else if (ui.view === 'news') html = renderNews()
    else if (ui.view === 'notes') html = renderNotes()
    else if (ui.view === 'bugs') html = renderBugs()
    else if (ui.view === 'product') html = renderProduct()
    else if (ui.view === 'test') html = renderTests()
    else html = renderStats()
    el.innerHTML = html
    bindContentInputs()
    const projectPicker = $id<HTMLSelectElement>('wb-project')
    projectPicker?.addEventListener('change', () => {
      ui.project = projectPicker.value
      const card = projectByPath(ui.project)
      if (card?.product !== undefined) productSelected = card.product.id
      if (card?.bugProject !== undefined) bugProjectFilter = card.bugProject.id
      db.settings.project = ui.project === 'none' ? '' : ui.project
      scheduleSave()
      renderAll()
    })
    if (ui.view === 'notes') bindNotes()
    if (ui.view === 'bugs') bindBugs()
    if (ui.view === 'product') {
      bindProduct()
      if (productTab === 'map') void mountProductCanvas()
    }
    if (ui.view === 'test') bindTests()
  }

  function bindContentInputs(): void {
    const queueSearch = $id<HTMLInputElement>('wb-queue-search')
    queueSearch?.addEventListener('input', () => {
      ui.queueQ = queueSearch.value
      renderContent()
      const next = $id<HTMLInputElement>('wb-queue-search')
      next?.focus()
      next?.setSelectionRange(next.value.length, next.value.length)
    })
    const boardSearch = $id<HTMLInputElement>('wb-board-search')
    boardSearch?.addEventListener('input', () => {
      ui.q = boardSearch.value
      renderContent()
      const next = $id<HTMLInputElement>('wb-board-search')
      next?.focus()
      next?.setSelectionRange(next.value.length, next.value.length)
    })
    const listSearch = $id<HTMLInputElement>('wb-list-search')
    listSearch?.addEventListener('input', () => {
      ui.q = listSearch.value
      renderContent()
      const next = $id<HTMLInputElement>('wb-list-search')
      next?.focus()
      next?.setSelectionRange(next.value.length, next.value.length)
    })
    for (const id of ['wb-quick-add']) {
      const input = $id<HTMLInputElement>(id)
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && input.value.trim() !== '') {
          const title = input.value.trim()
          createTask({ title, space: ui.space !== 'all' ? ui.space : (db.spaces[2]?.id ?? 'life'), date: todayKey() })
        }
      })
    }
  }

  function viewHead(): string {
    const ts = todayStats()
    const scoped = db.tasks.filter(matchProject)
    const all = ui.scope === 'all'
    const total = all ? scoped.length : ts.total
    const done = all ? scoped.filter(t => doneOf(t)).length : ts.done
    const pending = all ? scoped.filter(t => !doneOf(t)).length : ts.pending
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const today = todayKey()
    const scopeText = ui.project === 'all' ? '' : ` · 项目：${esc(projectLabel(ui.project))}`
    return `<div class="view-head">
      <div><div class="eyebrow">${all ? '全部任务' : '今日任务'}</div><h1 class="page-title">${all ? '全部任务' : '今天'}</h1>
      <div class="page-sub">${all ? `共 ${total} 项任务 · 待处理 ${pending} 项${scopeText}` : `${fmtDay(today)} ${weekdayName(today)} · 待处理 ${pending} 项${scopeText}`}</div></div>
      <div class="progress-card"><div class="p-ring" style="--p:${pct}"><i>${pct}%</i></div>
        <div><div class="p-num">${done} / ${total}</div><div class="p-lab">${all ? '已完成' : '今日完成'}</div></div></div>
    </div>`
  }

  function taskSeg(): string {
    const tabs: Array<[Ui['view'], string, string]> = [['list', '行动清单', 'list'], ['timeline', '时间轴', 'clock'], ['board', '看板', 'board'], ['matrix', '四象限', 'grid']]
    return `<div class="viewbar"><div class="seg">${tabs.map(([v, label, icon]) => `<button data-view="${v}" class="${ui.view === v ? 'active' : ''}">${ic(icon, 13)}${label}</button>`).join('')}</div>
      <div class="mini-seg" style="margin-left:2px"><button data-scope="today" class="${ui.scope === 'today' ? 'active' : ''}">今天</button><button data-scope="all" class="${ui.scope === 'all' ? 'active' : ''}">全部</button></div>
      <div class="filters">
        ${projectSelect()}
        <button class="chip ${ui.space === 'all' ? 'active' : ''}" data-space="all">空间：全部</button>
        ${db.spaces.map(s => `<button class="chip ${ui.space === s.id ? 'active' : ''}" data-space="${s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`).join('')}
        <button class="chip ghost${ui.filter !== 'all' ? ' active' : ''}" data-act="filter">${ic('filter', 13)}${ui.filter === 'all' ? '筛选' : FILTER_LABEL[ui.filter]}</button>
        <button class="chip ghost" data-act="sort">${ic('sort', 13)}${SORT_LABEL[ui.sort]}</button>
      </div></div>`
  }

  /* ---------- 门户（项目 / 产品 + 功能入口，兼项目管理） ---------- */
  function renderPortal(): string {
    const cards = projectCards()
    const all = ui.project === 'all'
    const none = ui.project === 'none'
    const scopeTasks = all ? db.tasks.length : none ? projectTaskCount('none') : projectTaskCount(ui.project)
    const scopeBugs = all ? bugs.length : none ? 0 : projectBugCount(ui.project)
    const scopeTests = all ? testProjects.length : none ? 0 : projectTestCount(ui.project)
    const scopeNotes = all ? notes.length : none ? 0 : projectNoteCount(ui.project)
    const openBugs = bugs.filter(bug => bug.status !== 'resolved').length
    const today = todayStats()
    const scopedTasks = db.tasks.filter(matchProject)
    const openCount = scopedTasks.filter(task => task.status !== 'done').length
    const datedCount = scopedTasks.filter(task => task.date !== null).length
    const tile = (path: string, name: string, counts: { tasks: number; bugs: number; tests: number; notes: number }, opts: { all?: boolean; none?: boolean; product?: Product; bugProject?: BugProject; tests?: TestProject[] }): string => {
      const keyPath = opts.all === true ? 'all' : opts.none === true ? 'none' : path
      const active = ui.project === keyPath
      const foot = opts.all === true || opts.none === true
        ? '<span class="portal-hint">点卡片切换范围</span>'
        : opts.product !== undefined
          ? `<button class="btn tiny" data-act="portal-edit" data-id="${opts.product.id}">${ic('edit', 11)}编辑</button><button class="btn tiny" data-act="portal-delete" data-id="${opts.product.id}">${ic('trash', 11)}删除</button>`
          : `<button class="btn tiny" data-act="portal-new" data-path="${esc(path)}">${ic('plus', 11)}为它建产品</button>`
      return `<article class="portal-card${active ? ' active' : ''}" data-act="portal-project" data-id="${esc(keyPath)}">
        <div class="portal-card-h">
          <span class="portal-ico${opts.all === true ? ' accent' : ''}">${opts.all === true ? ic('layers', 15) : opts.none === true ? ic('inbox', 15) : ic('product', 15)}</span>
          <div class="portal-card-t"><b>${esc(name)}</b><small>${opts.all === true ? '跨项目汇总' : opts.none === true ? '还没有归属项目的任务' : esc(bugWorkspaceName(path))}</small></div>
          ${active ? `<span class="portal-check">${ic('check', 11)}</span>` : ''}
        </div>
        ${opts.all === true || opts.none === true ? '' : `<div class="portal-path" title="${esc(path)}">${esc(path)}</div>`}
        <div class="portal-metrics"><span><b>${counts.tasks}</b> 任务</span><span><b>${counts.bugs}</b> Bug</span><span><b>${counts.tests}</b> 测试</span><span><b>${counts.notes}</b> 笔记</span></div>
        ${opts.all === true || opts.none === true ? '' : `<div class="portal-card-tags">${opts.product !== undefined ? '<span>产品</span>' : ''}${opts.bugProject !== undefined ? '<span class="green">Bug 项目</span>' : ''}${opts.tests !== undefined && opts.tests.length > 0 ? '<span class="cyan">测试项目</span>' : ''}</div>`}
        <div class="portal-card-foot">${foot}<button class="btn tiny portal-enter" data-act="portal-enter" data-id="${esc(keyPath)}" data-view="list">进入${ic('arrowR', 11)}</button></div>
      </article>`
    }
    const features: Array<{ view: Ui['view']; title: string; desc: string; icon: string; count: number | null; tile: string }> = [
      { view: 'list', title: '任务清单', desc: '今天 / 全部 · 按项目筛选', icon: 'list', count: scopeTasks, tile: '#2563eb' },
      { view: 'board', title: '看板', desc: '下一步 / 进行中 / 等待中', icon: 'board', count: openCount, tile: '#0f9f6e' },
      { view: 'calendar', title: '日历', desc: '周 / 月 / 年安排', icon: 'calendar', count: datedCount, tile: '#d97706' },
      { view: 'stats', title: '统计', desc: '完成趋势与项目复盘', icon: 'chart', count: null, tile: '#7c3aed' },
      { view: 'focus', title: '专注', desc: '番茄计时与待专注队列', icon: 'target', count: null, tile: '#db2777' },
      { view: 'bugs', title: 'Bug 管理', desc: '缺陷看板与 AI 修复', icon: 'bug', count: scopeBugs, tile: '#d83b3b' },
      { view: 'test', title: '测试', desc: '用例 / 执行 / 回归', icon: 'test', count: scopeTests, tile: '#0891b2' },
      { view: 'idea', title: '灵感', desc: '多角度发散 · 导图 / 力导', icon: 'spark', count: null, tile: '#5b5bd6' },
      { view: 'product', title: '产品设计', desc: '导图 / 设计笔记 / Demo', icon: 'product', count: null, tile: '#5b5bd6' },
      { view: 'notes', title: '记事本', desc: '笔记与 PDF 导出', icon: 'notebook', count: scopeNotes, tile: '#c27c0e' },
      { view: 'news', title: '新闻', desc: '定时检索与 AI 摘要', icon: 'news', count: null, tile: '#0f766e' },
    ]
    /** 单个功能卡（分组内外共用同一套外观）。 */
    const featureCard = (item: (typeof features)[number]): string => `<button class="portal-feature" style="--tile:${item.tile}" data-act="portal-open" data-view="${item.view}">
        <span class="portal-feature-ico">${ic(item.icon, 19)}</span>
        <span class="portal-feature-main"><b>${item.title}</b><small>${esc(item.desc)}</small></span>
        ${item.count !== null ? `<span class="portal-feature-n">${item.count}</span>` : `<span class="portal-feature-go">${ic('arrowR', 13)}</span>`}
      </button>`
    /** 功能区：按 PORTAL_GROUPS 分组，每组一整行，组内网格自适应。 */
    const featureGroups = (() => {
      const byView = new Map(features.map(item => [item.view, item] as const))
      return PORTAL_GROUPS.map(group => {
        const items = group.views.map(view => byView.get(view)).filter((item): item is (typeof features)[number] => item !== undefined)
        if (items.length === 0) return ''
        return `<section class="portal-group" data-group="${group.id}">
        <div class="portal-group-head"><h3><span class="portal-group-dot"></span>${group.title}</h3><span class="portal-group-meta">${items.length} 个功能 · ${group.hint}</span></div>
        <div class="portal-features">${items.map(featureCard).join('')}</div>
      </section>`
      }).join('')
    })()
    const cardAll = tile('all', '全部项目', { tasks: db.tasks.length, bugs: bugs.length, tests: testProjects.length, notes: notes.length }, { all: true })
    const cardNone = tile('none', '未归属', { tasks: projectTaskCount('none'), bugs: 0, tests: 0, notes: 0 }, { none: true })
    const cardProjects = cards.map(card => tile(card.path, card.name, {
      tasks: projectTaskCount(card.path), bugs: projectBugCount(card.path), tests: projectTestCount(card.path), notes: projectNoteCount(card.path),
    }, { product: card.product, bugProject: card.bugProject, tests: card.tests })).join('')
    return `<div class="view-head portal-head">
      <div><div class="eyebrow">门户</div><h1 class="page-title">工作台</h1>
        <div class="page-sub">先选项目 / 产品，再进入对应功能；项目在这里直接管理</div>
        <div class="head-pills"><span><b>${cards.length}</b> 项目</span><span><b>${db.tasks.length}</b> 任务</span><span><b>${openBugs}</b> 未关闭 Bug</span><span><b>${testProjects.length}</b> 测试项目</span><span><b>${today.done}</b> 今日完成</span></div></div>
      <div class="portal-actions"><span class="portal-scope">当前：<b>${esc(projectLabel(ui.project))}</b></span>
        <button class="btn" data-act="portal-load" title="重新读取项目 / Bug / 测试">${ic('refresh', 13)}刷新</button>
        <button class="btn-primary" data-act="portal-new">${ic('plus', 14)}新建项目 / 产品</button></div>
    </div>
    <div class="portal-sec-head"><h2>项目 / 产品</h2><span>${cards.length} 个项目 · 卡片内可编辑、删除</span></div>
    <div class="portal-projects">${cardAll}${cardProjects}${cardNone}</div>
    ${cards.length === 0 ? `<div class="portal-empty">${ic('layers', 16)}<div><b>还没有项目</b><span>新建一个项目 / 产品并关联 DSH 工作区，任务、Bug、测试、笔记就会按项目归拢。</span></div><button class="btn" data-act="portal-new">${ic('plus', 12)}新建</button></div>` : ''}
    <div class="portal-sec-head"><h2>功能区</h2><span>按业务分组 · 每组整行铺满，卡片随宽度自适应</span></div>
    ${featureGroups}
    ${agentPanel.sectionHtml()}`
  }

  let ideaView: IdeaViewHandle | null = null

  /** 灵感视图常驻（编辑器实例不能每次重建），按当前视图显隐。 */
  function ensureIdeaView(): IdeaViewHandle | null {
    if (ideaView !== null) return ideaView
    const root = $id('wb-idea-root')
    if (root === null) return null
    ideaView = createIdeaView(root, {
      api: API,
      esc,
      ic,
      toast: (message: string) => toast(message),
      confirm: (message: string) => (typeof window.confirm === 'function' ? window.confirm(message) : true),
      openModal,
      closeModal,
      dispatch: (projectPath: string, prompt: string) => dispatchToNewSession(projectPath, prompt),
      agent: {
        teams: () => agentPanel.teams().map(team => ({ id: team.id, name: team.name, memberCount: team.memberCount })),
        dispatch: (input, handlers) => startAgentDispatch(input, handlers),
        prompt: (sessionId, text) => sendToSession(sessionId, text),
        stop: (dispatchId, sessionId) => stopAgentDispatch(dispatchId, sessionId),
        openSession: (sessionId) => focusSession(sessionId),
        history: (sessionId) => readSessionEvents(sessionId),
      },
      isDark: () => resolvedTheme() === 'dark',
      portalProjects: () => projectCards()
        .filter(card => card.path !== '' && card.path !== 'all' && card.path !== 'none')
        .map(card => ({ name: card.name, workspacePath: card.path })),
    })
    return ideaView
  }

  function syncIdeaView(): void {
    const on = ui.view === 'idea'
    $id('wb-app')?.classList.toggle('idea-mode', on)
    const generic = $id('wb-generic')
    const root = $id('wb-idea-root')
    if (generic !== null) generic.style.display = on ? 'none' : ''
    if (root !== null) root.style.display = on ? '' : 'none'
    if (on) ensureIdeaView()?.show()
    else ideaView?.hide()
  }

  function renderBoard(): string {
    const cols: Array<[Status, string]> = [['next', '下一步'], ['doing', '进行中'], ['waiting', '等待中']]
    const total = pool().filter(t => t.status !== 'done' && visible(t)).length
    return viewHead() + taskSeg() +
      `<div class="listbar">${ic('search', 13)}<input placeholder="搜索当前看板" id="wb-board-search" value="${esc(ui.q)}"><span>${total} 项</span></div>
      <div class="kanban">${cols.map(([status, label]) => {
        const arr = sortTasks(pool().filter(t => t.status === status && visible(t)))
        return `<div class="col"><div class="col-head"><span class="dot" style="background:${STATUS_COLOR[status]}"></span>${label}<span class="n">${arr.length}</span>
          <button class="add" data-act="new" title="新建任务">${ic('plus', 14)}</button></div>
          ${arr.map(cardOf).join('') || '<div class="col-empty">暂无任务</div>'}
          <div class="col-search" style="border-style:dashed">${ic('list', 12)}本列 ${arr.length} 项<span style="margin-left:auto">${ui.sort === 'time' ? '按时间' : ui.sort === 'priority' ? '按优先级' : ui.sort === 'created' ? '按创建' : '按标题'}</span></div>
        </div>`
      }).join('')}</div>`
  }

  function cardOf(t: Task): string {
    const space = spaceOf(t.space)
    const flags: string[] = []
    if (t.attachments.length > 0) flags.push(ic('paperclip', 12))
    if (t.priority === 'high') flags.push(`<span style="color:var(--red)">${ic('flag', 12)}</span>`)
    if (t.note !== '') flags.push(ic('note', 12))
    if (t.subtasks.length > 0) flags.push(`<span class="sub-progress">${ic('checkSquare', 12)}${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>`)
    const desc = t.desc || t.note
    return `<article class="task-card${ui.selected === t.id ? ' selected' : ''}" data-id="${t.id}">
      <div class="card-top"><span class="sp"><span class="dot" style="background:${space.color}"></span>${esc(space.name)}</span>
        <span class="flags">${flags.join('')}</span></div>
      <h3>${esc(t.title)}</h3>${desc ? `<p>${esc(desc)}</p>` : ''}
      <div class="card-foot"><span>${ic('clock', 11)} ${timeText(t)}</span>
        ${t.status === 'doing' ? `<span class="sync">${ic('arrowR', 11)} 详情已同步</span>` : ''}</div>
    </article>`
  }

  function rowOf(t: Task): string {
    const space = spaceOf(t.space)
    const done = t.status === 'done'
    return `<div class="row${ui.selected === t.id ? ' selected' : ''}${done ? ' done-row' : ''}" data-id="${t.id}">
      <button class="check${done ? ' done' : ''}" data-act="toggle" data-id="${t.id}" title="完成">${done ? ic('check', 11) : ''}</button>
      <div class="row-main"><div class="row-title">${esc(t.title)}</div>
        <div class="row-meta"><span class="dot" style="background:${space.color}"></span>${esc(space.name)}
          <span>${timeText(t)}</span>${t.duration ? `<span>${t.duration} 分钟</span>` : ''}
          ${t.status === 'doing' ? '<span class="pill green">' + ic('playSmall', 9) + '进行中</span>' : ''}
          ${t.status === 'waiting' ? '<span class="pill amber">' + ic('playSmall', 9) + '等待中</span>' : ''}</div></div>
      <div class="row-right">${t.subtasks.length > 0 ? `<span class="sub-progress">${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} ${ic('chevR', 11)}</span>` : ''}
        ${t.priority === 'high' ? `<span style="color:var(--red)">${ic('flag', 12)}</span>` : ''}${ic('chevR', 13)}</div>
    </div>`
  }

  function renderList(): string {
    const doing = sortTasks(pool().filter(t => t.status === 'doing' && visible(t)))
    const next = sortTasks(pool().filter(t => t.status === 'next' && visible(t)))
    const waiting = sortTasks(pool().filter(t => t.status === 'waiting' && visible(t)))
    const done = sortTasks(pool().filter(t => t.status === 'done' && visible(t)))
    const group = (title: string, arr: Task[]): string => `<div class="group"><div class="group-head">${title}<span class="n">${arr.length} 项</span></div>${arr.map(rowOf).join('') || '<div class="col-empty">暂无任务</div>'}</div>`
    return viewHead() + taskSeg() +
      `<div class="quickbar">${ic('plus', 14)}<input id="wb-quick-add" placeholder="快速记录任务，按 Enter 保存"><span class="hint"><span class="kbd">今天</span><span class="kbd">Enter</span></span></div>
      <div class="listbar">${ic('search', 13)}<input placeholder="搜索当前清单" id="wb-list-search" value="${esc(ui.q)}"><span>${pool().filter(visible).length} 项</span></div>
      ${doing.length > 0 ? group('正在进行', doing) : ''}
      ${next.length > 0 ? group('接下来', next) : ''}
      ${waiting.length > 0 ? group('等待中', waiting) : ''}
      ${done.length > 0 ? group('已完成', done) : ''}`
  }

  function renderTimeline(): string {
    const arr = sortTasks(db.tasks.filter(t => t.date === todayKey() && visible(t)), 'time')
    return viewHead() + taskSeg() +
      `<div class="quickbar">${ic('plus', 14)}<input id="wb-quick-add" placeholder="快速记录任务，按 Enter 保存"><span class="hint"><span class="kbd">今天</span><span class="kbd">Enter</span></span></div>
      <div class="listbar">${ic('search', 13)}<input placeholder="搜索当前时间轴" id="wb-list-search" value="${esc(ui.q)}"><span>${arr.length} 项</span></div>
      <div class="tl"><div class="tl-head"><div>时间</div><div>今日安排</div></div>
        ${arr.map(t => {
          const space = spaceOf(t.space)
          return `<div class="tl-row"><div class="tl-time"><b>${t.start || '待定'}</b>${t.end ? '至 ' + t.end : ''}</div>
          <div class="tl-body" data-id="${t.id}"><div class="tl-item ${t.status === 'doing' ? 'doing' : ''}">
            <div class="ti-main"><div class="ti-title">${esc(t.title)}</div>
            <div class="ti-meta">${esc(space.name)} · ${t.duration ? t.duration + ' 分钟 · ' : ''}${STATUS_LABEL[t.status]}</div></div>
            <div class="ti-right">${t.status === 'doing' ? '<span class="pill green">' + ic('playSmall', 9) + '进行中</span>' : t.status === 'waiting' ? '<span class="pill amber">' + ic('playSmall', 9) + '等待中</span>' : t.status === 'done' ? '<span class="pill gray">已完成</span>' : ''}
              <button class="check${t.status === 'done' ? ' done' : ''}" data-act="toggle" data-id="${t.id}">${t.status === 'done' ? ic('check', 11) : ''}</button></div>
          </div></div></div>`
        }).join('')}
      </div>
      <div class="listbar" style="margin-top:10px;justify-content:space-between"><span>共 ${arr.length} 项 · ${fmtDay(todayKey())}</span><span>按时间排序</span></div>`
  }

  function renderMatrix(): string {
    const all = sortTasks(pool().filter(t => t.status !== 'done' && visible(t)))
    const quads: Array<[string, string, (t: Task) => boolean]> = [
      ['重要且紧急', '立即动手', t => t.priority === 'high'],
      ['重要不紧急', '安排时间', t => t.priority !== 'high' && t.space !== 'life'],
      ['紧急不重要', '尽快处理', t => t.priority !== 'high' && t.space === 'life'],
      ['不重要不紧急', '有空再看', t => t.priority === 'low'],
    ]
    return viewHead() + taskSeg() + `<div class="matrix">${quads.map(([title, sub, fn]) => {
      const arr = all.filter(fn)
      return `<div class="quad"><h4>${title}</h4><div class="qsub">${sub} · ${arr.length} 项</div>
        ${arr.map(t => `<div class="mini" data-id="${t.id}"><span class="dot" style="background:${spaceOf(t.space).color}"></span>${esc(t.title)}<span style="margin-left:auto;color:var(--text-3)">${t.start || ''}</span></div>`).join('') || '<div class="col-empty">暂无任务</div>'}
      </div>`
    }).join('')}</div>`
  }

  /* ---------- 日历 ---------- */
  function renderCalendar(): string {
    const modeSeg = `<div class="mini-seg">${(['week', 'month', 'year'] as const).map(m => `<button data-act="cal-mode" data-mode="${m}" class="${ui.calendarMode === m ? 'active' : ''}">${m === 'week' ? '周' : m === 'month' ? '月' : '年'}</button>`).join('')}</div>`
    const range = ui.calendarMode === 'week'
      ? `${startOfWeek(ui.calendarAnchor)} — ${addDays(startOfWeek(ui.calendarAnchor), 6)}`
      : ui.calendarMode === 'month' ? `${ui.calendarAnchor.slice(0, 7)}` : `${ui.calendarAnchor.slice(0, 4)} 年`
    const head = `<div class="view-head"><div><div class="eyebrow">计划</div><h1 class="page-title">日历</h1>
      <div class="page-sub">按周、月或年查看任务安排${ui.project === 'all' ? '' : ` · 项目：${esc(projectLabel(ui.project))}`}</div></div><div class="head-tools">${projectSelect()}${modeSeg}</div></div>`
    let body = ''
    if (ui.calendarMode === 'week') body = calendarWeek()
    else if (ui.calendarMode === 'month') body = calendarMonth()
    else body = calendarYear()
    return head + body + `<div class="listbar" style="margin-top:10px;justify-content:space-between"><span>${range}</span><span>${ic('calendar', 12)} 共 ${db.tasks.filter(t => t.date !== null && matchProject(t)).length} 项有日期任务</span></div>`
  }
  function calendarWeek(): string {
    const start = startOfWeek(ui.calendarAnchor)
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
    const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00']
    const hourPx = 52
    const evFor = (day: string): Task[] => db.tasks.filter(t => t.date === day && visible(t))
    const today = todayKey()
    const todayEvents = evFor(today).sort((a, b) => (a.start || '').localeCompare(b.start || ''))
    return `<div class="cal-wrap"><div class="cal-main">
      <div class="cal-top"><div class="range"><button class="icon-btn" data-act="cal-prev">${ic('chevL', 14)}</button>${start} — ${days[6]}<button class="icon-btn" data-act="cal-next">${ic('chevR', 14)}</button></div></div>
      <div class="cal-scroll"><div class="cal-grid">
        <div class="cal-corner"></div>
        ${days.map(d => `<div class="cal-dayh ${d === today ? 'today' : ''}"><b>${fmtDay(d)}</b>${weekdayName(d)}<span class="cnt">${evFor(d).length}项</span></div>`).join('')}
        <div class="cal-gutter" style="min-height:44px">全天</div>
        ${days.map(d => `<div class="cal-cell" style="min-height:44px">${evFor(d).filter(t => !t.start || (t.duration || 0) >= 480).map(t => `<div class="cal-ev" style="--ev:${spaceOf(t.space).color};position:static;margin:2px" data-id="${t.id}"><b>${esc(t.title)}</b></div>`).join('')}</div>`).join('')}
        ${hours.map(h => `<div class="cal-gutter">${h}</div>${days.map(d => {
          const evs = evFor(d).filter(t => t.start && (t.duration || 0) < 480 && t.start.slice(0, 2) === h.slice(0, 2))
          return `<div class="cal-cell ${d === today ? 'today' : ''}" style="height:${hourPx}px">${evs.map(t => {
            const [sh, sm] = t.start.split(':').map(Number)
            const dur = t.duration || 30
            const top = Math.max(0, (sh * 60 + sm) % 60) / 60 * hourPx
            const height = Math.max(24, Math.min(dur, 90) / 60 * hourPx - 2)
            return `<div class="cal-ev" style="--ev:${spaceOf(t.space).color};top:${top + 2}px;height:${height}px" data-id="${t.id}"><b>${esc(t.title)}</b><span>${t.start}${t.end ? '–' + t.end : ''} · ${esc(spaceOf(t.space).name)}</span></div>`
          }).join('')}</div>`
        }).join('')}`).join('')}
      </div></div>
    </div>
    <div class="cal-rail"><div class="rail-head">${ic('calendar', 13)} 今天</div>
      <div class="rail-sub">${todayEvents.length} 项安排 · 已完成 ${todayEvents.filter(t => t.status === 'done').length} 项</div>
      ${todayEvents.map(t => `<div class="rail-item" data-id="${t.id}"><span class="t">${t.start || '--:--'}</span>
        <span class="rm"><b>${esc(t.title)}</b><span>${esc(spaceOf(t.space).name)} · ${STATUS_LABEL[t.status]}</span></span>
        <span class="dot" style="background:${spaceOf(t.space).color}"></span></div>`).join('') || '<div class="col-empty">今天暂无安排</div>'}
      <div class="listbar" style="margin:8px 0 0;justify-content:space-between"><span>共 ${todayEvents.length} 项</span><span>${weekdayName(todayKey())}</span></div>
    </div></div>`
  }
  function calendarMonth(): string {
    const first = startOfMonth(ui.calendarAnchor)
    const gridStart = startOfWeek(first)
    const month = parseDate(ui.calendarAnchor).getMonth()
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
    const today = todayKey()
    return `<div class="month-grid">
      ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map(w => `<div class="month-head">${w}</div>`).join('')}
      ${cells.map(d => {
        const evs = db.tasks.filter(t => t.date === d && visible(t))
        const dim = parseDate(d).getMonth() !== month
        return `<div class="month-cell${dim ? ' dim' : ''}${d === today ? ' today' : ''}" data-act="cal-day" data-day="${d}">
          <div class="d">${parseDate(d).getDate()}</div>
          ${evs.slice(0, 3).map(t => `<div class="me"><i style="background:${spaceOf(t.space).color}"></i>${esc(t.title)}</div>`).join('')}
          ${evs.length > 3 ? `<div class="me">+${evs.length - 3} 项</div>` : ''}
        </div>`
      }).join('')}
    </div>`
  }
  function calendarYear(): string {
    const year = parseDate(ui.calendarAnchor).getFullYear()
    const months = Array.from({ length: 12 }, (_, m) => {
      const first = `${year}-${pad(m + 1)}-01`
      const daysInMonth = new Date(year, m + 1, 0).getDate()
      const lead = parseDate(first).getDay()
      const marks = Array.from({ length: lead + daysInMonth }, (_, i) => {
        if (i < lead) return '<i></i>'
        const d = `${year}-${pad(m + 1)}-${pad(i - lead + 1)}`
        const n = db.tasks.filter(t => t.date === d && matchProject(t)).length
        return `<i class="${n > 0 ? 'has' : ''}" title="${d} · ${n} 项"></i>`
      }).join('')
      const count = db.tasks.filter(t => t.date?.startsWith(`${year}-${pad(m + 1)}`) && matchProject(t)).length
      return `<div class="year-card" data-act="cal-month" data-month="${year}-${pad(m + 1)}-01"><h5>${m + 1} 月<span>${count} 项</span></h5><div class="year-mini">${marks}</div></div>`
    }).join('')
    return `<div class="year-grid">${months}</div>`
  }

  /* ---------- 专注 ---------- */
  function renderFocus(): string {
    const current = taskOf(timer.taskId) ?? db.tasks.find(t => t.status === 'doing') ?? db.tasks[0]
    const minutes = Math.floor(timer.remaining / 60)
    const seconds = timer.remaining % 60
    const total = timer.preset * 60
    const pct = Math.max(0, Math.min(100, Math.round((1 - timer.remaining / total) * 100)))
    const queueAll = db.tasks.filter(t => t.status !== 'done' && matchProject(t)).sort((a, b) => {
      if (a.id === timer.taskId) return -1
      if (b.id === timer.taskId) return 1
      return `${a.date ?? ''} ${a.start || '99:99'}`.localeCompare(`${b.date ?? ''} ${b.start || '99:99'}`)
    })
    const qq = ui.queueQ.trim().toLowerCase()
    const queue = qq === '' ? queueAll : queueAll.filter(t => t.title.toLowerCase().includes(qq))
    const presets = [15, 25, 45, 60]
    const custom = !presets.includes(timer.preset)
    const focus = todayFocus()
    return `<div class="view-head"><div><div class="eyebrow">专注计时</div><h1 class="page-title">专注</h1>
      <div class="page-sub">管理当前任务、计时长度和待专注队列${ui.project === 'all' ? '' : ` · 项目：${esc(projectLabel(ui.project))}`}</div></div><div class="head-tools">${projectSelect()}</div></div>
      <div class="focus-wrap">
        <div class="focus-card"><div class="focus-card-top">${ic('target', 14)} 专注空间<button class="icon-btn" data-act="focus-expand" title="${ui.focusExpand ? '退出沉浸' : '沉浸模式'}">${ic('expand', 14)}</button></div>
          <div class="presets">${presets.map(n => `<button data-act="preset" data-n="${n}" class="${timer.preset === n ? 'active' : ''}">${n} 分钟</button>`).join('')}<button data-act="custom-timer" class="${custom ? 'active' : ''}">${custom ? timer.preset + ' 分钟' : '自定义'}</button></div>
          <div class="focus-center">
            <div class="timer-ring" style="--p:${pct}"><div class="timer-inner"><div class="timer-time">${pad(minutes)}:${pad(seconds)}</div><div class="timer-lab">专注计时</div></div></div>
            <div class="focus-task">当前任务<b>${esc(current?.title ?? '未选择任务')}</b></div>
            <div class="focus-btns"><button class="btn" data-act="reset" title="重置">${ic('rotate', 14)}</button>
              <button class="btn solid" data-act="toggle-timer">${timer.running ? ic('pause', 13) : ic('play', 13)} ${timer.running ? '暂停' : '开始'}</button></div>
          </div>
          <div class="focus-stats"><div><b>${focus.minutes}</b>今日专注 / 分钟</div><div><b>${focus.rounds}</b>完成轮次 / 次</div></div>
        </div>
        <div class="queue"><div class="q-head">${ic('layers', 13)}专注队列<span class="n">${queue.length} 项</span></div>
          <div class="listbar" style="height:28px;margin-bottom:6px">${ic('search', 12)}<input placeholder="搜索专注队列" id="wb-queue-search" value="${esc(ui.queueQ)}"><span>${queue.length}</span></div>
          ${queue.slice(0, 14).map((t, i) => `<div class="q-item ${t.id === timer.taskId ? 'active' : ''}" data-act="queue" data-id="${t.id}">
            <span class="q-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="q-main"><span class="q-title">${esc(t.title)}</span>
            <span class="q-meta">${t.status === 'doing' ? '进行中' : '待开始'} · ${t.date === todayKey() ? '今天' : (t.date ?? '未安排')} ${t.start ? '· ' + t.start + (t.end ? '–' + t.end : '') : ''}</span></span></div>`).join('')}
        </div>
      </div>`
  }

  /* ---------- 统计 ---------- */
  function statsRange(): { start: string; end: string; label: string } {
    const today = todayKey()
    if (ui.statsPeriod === 'month') {
      const first = startOfMonth(today)
      const d = parseDate(first)
      const last = dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))
      return { start: first, end: last, label: '本月' }
    }
    if (ui.statsPeriod === 'year') {
      const year = parseDate(today).getFullYear()
      return { start: `${year}-01-01`, end: `${year}-12-31`, label: '本年' }
    }
    return { start: isoWeekStart(), end: addDays(isoWeekStart(), 6), label: '本周' }
  }
  function stampDate(value: string | null): string { return (value ?? '').slice(0, 10) }
  function doneIn(start: string, end: string): Task[] {
    return db.tasks.filter(t => doneOf(t) && matchProject(t) && inRange(stampDate(doneAt(t)), start, end))
  }
  function trendBuckets(range: { start: string; end: string }): Array<{ label: string; start: string; end: string; count: number; title: string }> {
    if (ui.statsPeriod === 'year') {
      const year = Number(range.start.slice(0, 4))
      return Array.from({ length: 12 }, (_, m) => {
        const start = `${year}-${pad(m + 1)}-01`
        const last = new Date(year, m + 1, 0).getDate()
        const end = `${year}-${pad(m + 1)}-${pad(last)}`
        return { label: `${m + 1}月`, title: `${m + 1} 月`, start, end, count: doneIn(start, end).length }
      })
    }
    if (ui.statsPeriod === 'month') {
      const out: Array<{ label: string; start: string; end: string; count: number; title: string }> = []
      let cursor = startOfWeek(range.start)
      let index = 1
      while (cursor <= range.end) {
        const bucketStart = cursor < range.start ? range.start : cursor
        const bucketEnd = addDays(cursor, 6) > range.end ? range.end : addDays(cursor, 6)
        out.push({ label: `${parseDate(bucketStart).getMonth() + 1}/${parseDate(bucketStart).getDate()}`, title: `第 ${index} 周`, start: bucketStart, end: bucketEnd, count: doneIn(bucketStart, bucketEnd).length })
        cursor = addDays(cursor, 7)
        index += 1
      }
      return out
    }
    const days = Array.from({ length: 7 }, (_, i) => addDays(range.start, i))
    return days.map(d => ({
      label: `${parseDate(d).getMonth() + 1}/${parseDate(d).getDate()}`,
      title: weekdayName(d),
      start: d,
      end: d,
      count: doneIn(d, d).length,
    }))
  }
  function streak(): number {
    const dates = new Set(db.tasks.filter(t => doneOf(t) && matchProject(t)).map(t => stampDate(doneAt(t))).filter(Boolean))
    let n = 0
    let cursor = todayKey()
    while (dates.has(cursor)) { n += 1; cursor = addDays(cursor, -1) }
    return n
  }
  function renderStats(): string {
    const range = statsRange()
    const buckets = trendBuckets(range)
    const weekDone = doneIn(range.start, range.end)
    const planned = db.tasks.filter(t => matchProject(t) && inRange(t.date, range.start, range.end))
    const rate = planned.length > 0 ? Math.round((planned.filter(t => doneOf(t)).length / planned.length) * 100) : 0
    const max = Math.max(1, ...buckets.map(s => s.count))
    const focus = todayFocus()
    const bySpace = db.spaces.map(sp => ({ sp, n: weekDone.filter(t => t.space === sp.id).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
    const topSpace = bySpace[0]
    const busiest = buckets.reduce((a, b) => (b.count > a.count ? b : a), buckets[0])
    const withSubs = db.tasks.filter(t => t.subtasks.length > 0 && matchProject(t)).length
    const waiting = db.tasks.filter(t => t.status === 'waiting' && matchProject(t)).length
    const streakDays = streak()
    const period = ui.statsPeriod
    return `<div class="view-head"><div><div class="eyebrow">数据复盘</div><h1 class="page-title">统计</h1>
      <div class="page-sub">用同一套任务数据复盘每天、每周、每月与全年${ui.project === 'all' ? '' : ` · 项目：${esc(projectLabel(ui.project))}`}</div></div>
      <div class="head-tools">${projectSelect()}<div class="mini-seg">${(['week', 'month', 'year'] as const).map(p => `<button data-act="stats-period" data-period="${p}" class="${period === p ? 'active' : ''}">${p === 'week' ? '本周' : p === 'month' ? '本月' : '本年'}</button>`).join('')}</div></div></div>
      <div class="kpis">
        <div class="kpi"><div class="k-top">${ic('check', 12)}${range.label}实际完成</div><div class="k-num">${weekDone.length}<span class="k-unit"> 次</span></div><div class="k-sub">涉及 ${new Set(weekDone.map(t => t.id)).size} 项任务</div></div>
        <div class="kpi"><div class="k-top">${ic('target', 12)}今日专注</div><div class="k-num">${focus.minutes}<span class="k-unit"> 分钟</span></div><div class="k-sub">${focus.rounds} 轮 · 会话累计</div></div>
        <div class="kpi"><div class="k-top">${ic('spark', 12)}连续完成</div><div class="k-num">${streakDays}<span class="k-unit"> 天</span></div><div class="k-sub">${streakDays > 0 ? '保持每天完成至少 1 项' : '完成一项任务即可开始'}</div></div>
        <div class="kpi"><div class="k-top">${ic('chart', 12)}${range.label}计划完成率</div><div class="k-num">${rate}<span class="k-unit"> %</span></div><div class="k-sub">${planned.filter(t => doneOf(t)).length} / ${planned.length} 项计划</div></div>
      </div>
      <div class="stats-grid">
        <div class="panel"><div class="panel-h">${range.label}完成趋势<span class="n">合计 ${weekDone.length} 次</span></div>
          <div class="panel-sub">按任务完成时间统计，不按计划日期归档</div>
          <div class="chart">${buckets.map(b => `<div class="bar-col" title="${esc(b.title)}"><div class="bar" style="height:${b.count === 0 ? 2 : Math.max(8, b.count / max * 100)}%;${b.count === 0 ? 'opacity:.25' : ''}"><span>${b.count}次</span></div></div>`).join('')}</div>
          <div class="bar-x">${buckets.map(b => `<div>${b.label}</div>`).join('')}</div>
        </div>
        <div class="panel"><div class="panel-h">空间完成结构<span class="n">${range.label}</span></div>
          <div class="panel-sub">按空间统计已完成的次数</div>
          <div class="structure">
            <div class="struct-nums">${bySpace.slice(0, 2).map(x => `<div><b style="color:${x.sp.color}">${x.n}</b><span>${esc(x.sp.name)}完成次数</span></div>`).join('') || '<div><b>0</b><span>本期暂无完成</span></div>'}</div>
            <div class="struct-bar">${bySpace.map(x => `<i style="width:${weekDone.length > 0 ? x.n / weekDone.length * 100 : 0}%;background:${x.sp.color}"></i>`).join('')}</div>
            <div class="muted" style="font-size:10.5px">${topSpace ? `本期 ${topSpace.n} 次完成来自${esc(topSpace.sp.name)}空间` : '本期还没有完成任务'}</div>
          </div>
        </div>
      </div>
      <div class="insights">
        <div class="insight"><div class="ii">${ic('flag', 13)}</div><div><b>${esc(busiest.title)}完成最多</b><span>完成 ${busiest.count} 项任务</span></div></div>
        <div class="insight"><div class="ii">${ic('layers', 13)}</div><div><b>${withSubs} 项任务已拆步骤</b><span>共 ${db.tasks.reduce((sum, t) => sum + t.subtasks.length, 0)} 个子待办</span></div></div>
        <div class="insight"><div class="ii">${ic('clock', 13)}</div><div><b>${waiting} 项任务在等待</b><span>等待外部条件，不占用今天</span></div></div>
        <div class="insight"><div class="ii">${ic('spark', 13)}</div><div><b>${focus.rounds} 轮专注</b><span>今天专注 ${focus.minutes} 分钟</span></div></div>
        <div class="insight"><div class="ii">${ic('checkSquare', 13)}</div><div><b>${streakDays} 天连续完成</b><span>${streakDays > 1 ? '保持住这个节奏' : '从今天开始积累'}</span></div></div>
      </div>
      <div class="footnote">实际完成按任务完成时间归期；${range.label}从 ${range.start} 到 ${range.end}。计划完成率只统计计划日期落在本期内的任务。</div>`
  }

  /* ---------- 新闻 ---------- */
  const NEWS_KIND_LABEL: Record<NewsKind, string> = { daily: '每天', workdays: '工作日', weekly: '每周', custom: '自定义' }
  const WEEKDAY_LABEL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const NEWS_PRESETS: Array<{ title: string; query: string }> = [
    { title: 'AI 行业动态', query: 'AI 大模型 最新新闻 发布' },
    { title: '科技产品', query: '手机 芯片 新品 发布 科技' },
    { title: '财经市场', query: '股市 经济 央行 政策 市场' },
    { title: '国际时事', query: '国际 地缘 外交 冲突 局势' },
    { title: '健康生活', query: '健康 医疗 研究 生活方式' },
    { title: '体育赛事', query: '体育 赛事 比赛 冠军' },
    { title: '游戏动漫', query: '游戏 动漫 新作 发布' },
    { title: '开源项目', query: 'GitHub 开源 项目 发布' },
  ]

  function parseTimeList(text: string): string[] {
    const out: string[] = []
    for (const raw of text.split(/[,，、;；\s]+/)) {
      const value = raw.trim()
      const m = value.match(/^(\d{1,2}):(\d{2})$/)
      if (!m) continue
      const h = Number(m[1]); const min = Number(m[2])
      if (h < 0 || h > 23 || min < 0 || min > 59) continue
      out.push(`${pad(h)}:${pad(min)}`)
    }
    return Array.from(new Set(out)).sort()
  }
  function shortHash(text: string): string {
    let h = 5381
    for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0
    return Math.abs(h).toString(36).slice(0, 7)
  }
  function cronOfTime(time: string, kind: NewsKind, weekday: number, customCron: string): string {
    if (kind === 'custom') return customCron.trim()
    const [h, m] = time.split(':').map(Number)
    const mm = Number.isFinite(m) ? m : 0
    const hh = Number.isFinite(h) ? h : 8
    if (kind === 'workdays') return `${mm} ${hh} * * 1-5`
    if (kind === 'weekly') return `${mm} ${hh} * * ${Math.max(0, Math.min(6, weekday))}`
    return `${mm} ${hh} * * *`
  }
  function schedulesOf(kind: NewsKind, times: string[], weekday: number, customCron: string): string[] {
    if (kind === 'custom') return customCron.trim() === '' ? [] : [customCron.trim()]
    return times.map(t => cronOfTime(t, kind, weekday, customCron))
  }
  function scheduleTextOf(kind: NewsKind, times: string[], weekday: number, customCron: string): string {
    if (kind === 'custom') return `自定义：${customCron.trim()}`
    const head = kind === 'daily' ? '每天' : kind === 'workdays' ? '工作日' : `每${WEEKDAY_LABEL[weekday]}`
    return `${head} ${times.join(' · ')}`
  }
  function topicStatus(topic: NewsTopic): { label: string; cls: string } {
    const started = newsRunning[topic.id]
    if (started !== undefined && Date.now() - started < 240_000) return { label: '检索中', cls: 'green' }
    if (!cronAvailable) return { label: '未连接', cls: 'amber' }
    if (!topic.enabled) return { label: '已暂停', cls: 'gray' }
    const tasks = topic.cronTaskIds.map(id => cronTasks.find(t => t.id === id)).filter(Boolean) as CronTask[]
    if (tasks.length === 0) return { label: '未同步', cls: 'amber' }
    const paused = tasks.filter(t => t.status === 'paused').length
    if (paused === tasks.length) return { label: '已暂停', cls: 'gray' }
    if (paused > 0) return { label: '部分暂停', cls: 'amber' }
    return { label: '活跃', cls: 'green' }
  }
  function topicNextRun(topic: NewsTopic): number | null {
    let next: number | null = null
    for (const id of topic.cronTaskIds) {
      const task = cronTasks.find(t => t.id === id)
      const at = task?.nextRunAt
      if (typeof at === 'number' && at > 0 && (next === null || at < next)) next = at
    }
    return next
  }
  function fmtWhen(ms: number | null): string {
    if (ms === null || !Number.isFinite(ms) || ms <= 0) return '未安排'
    const d = new Date(ms)
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  function ago(stamp: string): string {
    if (!stamp) return ''
    const t = Date.parse(stamp.replace(' ', 'T'))
    if (!Number.isFinite(t)) return stamp
    const diff = Date.now() - t
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
    return stamp.slice(0, 10)
  }
  function newsPrompt(topic: NewsTopic): string {
    return `你是「个人工作台」的新闻检索助手。\n`
      + `订阅主题：${topic.title}\n检索关键词：${topic.query}\n\n`
      + `请检索最近 24–48 小时与关键词相关的最新新闻，优先中文来源；最多 ${Math.max(1, Math.min(20, topic.count || 6))} 条，只保留可核实的可靠来源。\n`
      + `为每条整理：\n`
      + `- title：准确标题或准确译名\n- source：媒体名\n- url：http/https 原文链接（不得编造）\n`
      + `- publishedAt：YYYY-MM-DD（未知可留空）\n- summary：中文一句话，不超过 60 字\n`
      + `- aiSummary：AI 总结，100–180 字中文，说明发生了什么、关键数据/观点、对行业或读者的影响；这是卡片上展示的正文，不要写成关键词堆砌\n\n`
      + `不要编造 URL、标题或日期；同一事件合并。\n`
      + `完成后必须调用工具 workbench_news_publish，参数：\n`
      + `{"topicId":"${topic.id}","items":[...]}\n`
      + `没有合适新闻时也调用一次，items 传空数组。不要输出其他内容。`
  }
  async function cronFetch(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`/dsh-cron${path}`, {
      ...init,
      headers: { ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) throw new Error(data?.error ?? `HTTP ${res.status}`)
    return data
  }
  async function syncCronForTopic(topic: NewsTopic, previousIds: string[]): Promise<string[]> {
    const schedules = schedulesOf(topic.scheduleKind, topic.times, topic.weekday, topic.customCron)
    if (schedules.length === 0) throw new Error('请至少填写一个检索时间或 cron 表达式')
    const created: string[] = []
    try {
      for (const schedule of schedules) {
        const id = `workbench-news-${topic.id}-${shortHash(schedule)}`
        const body = {
          id,
          title: `工作台新闻 · ${topic.title} · ${schedule}`,
          schedule,
          type: 'llm',
          prompt: newsPrompt(topic),
          delivery: 'isolated',
          channels: [],
          timezone: 'Asia/Shanghai',
          timeoutSeconds: 900,
          maxRetries: 1,
          overlapPolicy: 'skip',
          misfirePolicy: 'skip',
          permissionPreset: 'read-only',
          sessionTitle: `工作台新闻 · ${topic.title}`,
        }
        await cronFetch('/tasks', { method: 'POST', body: JSON.stringify(body) })
        created.push(id)
        await cronFetch(`/tasks/${encodeURIComponent(id)}/${topic.enabled ? 'resume' : 'pause'}`, { method: 'POST' })
      }
    } catch (cause) {
      for (const id of created) { try { await cronFetch(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* 清理尽力而为 */ } }
      throw cause
    }
    for (const id of previousIds) {
      if (!created.includes(id)) { try { await cronFetch(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* 旧任务可能已被删 */ } }
    }
    return created
  }
  async function loadNews(silent = false): Promise<void> {
    if (!loaded) return
    lastNewsPoll = Date.now()
    if (!silent) {
      ui.newsLoading = true
      ui.newsError = ''
      if (ui.view === 'news') renderContent()
    }
    try {
      const res = await fetch(`${API}/news`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { topics?: NewsTopic[]; items?: NewsItem[] }
      newsTopics = Array.isArray(data.topics) ? data.topics : []
      newsItems = Array.isArray(data.items) ? data.items : []
      newsLoadedAt = Date.now()
      ui.newsError = ''
    } catch (cause) {
      ui.newsError = String((cause as Error).message ?? cause)
    }
    try {
      const data = await cronFetch('/tasks')
      cronTasks = Array.isArray(data.tasks) ? data.tasks as CronTask[] : []
      cronAvailable = true
      cronError = ''
    } catch (cause) {
      cronAvailable = false
      cronError = String((cause as Error).message ?? cause)
      cronTasks = []
    }
    for (const topic of newsTopics) {
      const started = newsRunning[topic.id]
      if (started !== undefined) {
        const at = topic.lastRunAt ? Date.parse(topic.lastRunAt.replace(' ', 'T')) : NaN
        const taskDone = topic.cronTaskIds.some(id => {
          const last = cronTasks.find(t => t.id === id)?.lastRunAt
          return typeof last === 'number' && last >= started
        })
        if ((Number.isFinite(at) && at >= started) || taskDone) delete newsRunning[topic.id]
        else if (Date.now() - started > 240_000) delete newsRunning[topic.id]
      }
    }
    ui.newsLoading = false
    if (ui.view !== 'news') return
    const sig = JSON.stringify({
      t: newsTopics.map(t => [t.id, t.updatedAt, t.lastRunAt, t.enabled]),
      i: newsItems.map(i => i.id),
      c: cronTasks.map(t => [t.id, t.status, t.lastRunAt, t.nextRunAt]),
      r: Object.keys(newsRunning),
    })
    if (!silent || sig !== newsSig) {
      newsSig = sig
      const scrollTop = silent ? (content()?.scrollTop ?? 0) : 0
      renderContent()
      if (silent && content() !== null) (content() as HTMLElement).scrollTop = scrollTop
    }
  }
  function renderNews(): string {
    const topics = newsTopics.slice().sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.createdAt.localeCompare(b.createdAt))
    const filtered = ui.newsTopicFilter === 'all' ? newsItems : newsItems.filter(i => i.topicId === ui.newsTopicFilter)
    const today = todayKey()
    const todayCount = newsItems.filter(i => i.fetchedAt.slice(0, 10) === today).length
    const newest = newsItems[0]?.fetchedAt ?? ''
    const head = `<div class="view-head"><div><div class="eyebrow">新闻检索</div><h1 class="page-title">新闻</h1>
      <div class="page-sub">按主题与时间用 DSH Agent 检索，结果只保存在本机</div></div>
      <div style="display:flex;gap:7px;align-items:center">
        <button class="btn" data-act="news-refresh">${ic('refresh', 13)}刷新</button>
        <button class="btn-primary" data-act="news-add">${ic('plus', 14)}订阅主题</button>
      </div></div>`
    const banner = !cronAvailable ? `<div class="news-banner">${ic('flag', 13)}<span>未检测到 <code>/dsh-cron/tasks</code>：请确认已安装 @goodandready/dsh-cron。新闻订阅可以展示，但无法创建/运行定时任务。</span><button class="btn" data-act="news-refresh">重试</button></div>` : ''
    const stats = `<div class="news-stats">
      <span><b>${topics.length}</b> 个订阅</span>
      <span><b>${newsItems.length}</b> 条新闻</span>
      <span><b>${todayCount}</b> 条今日入库</span>
      <span class="muted">最近更新 ${newest ? ago(newest) : '—'}${ui.newsLoading ? ' · 同步中…' : ''}</span>
      ${ui.newsError ? `<span style="color:var(--red)">${esc(ui.newsError)}</span>` : ''}
    </div>`
    const topicCards = topics.length === 0 ? '' : `<div class="news-topics">${topics.map(topic => {
      const status = topicStatus(topic)
      const next = topicNextRun(topic)
      const taskCount = topic.cronTaskIds.length
      return `<div class="news-topic-card">
        <div class="nt-top"><b>${esc(topic.title)}</b><span class="pill ${status.cls}">${status.label}</span></div>
        <div class="nt-query">${ic('search', 11)} ${esc(topic.query)}</div>
        <div class="nt-meta">${ic('clock', 11)} ${esc(topic.scheduleText || scheduleTextOf(topic.scheduleKind, topic.times, topic.weekday, topic.customCron))} · 每次 ${topic.count ?? 6} 条 · ${taskCount} 个任务</div>
        <div class="nt-meta">${ic('calendar', 11)} 下次 ${fmtWhen(next)} · 上次入库 ${topic.lastRunAt ? ago(topic.lastRunAt) : '—'}</div>
        <div class="nt-actions">
          <button class="btn" data-act="news-run" data-id="${topic.id}" title="立即检索">${ic('play', 12)}检索</button>
          <button class="btn" data-act="news-toggle" data-id="${topic.id}" title="${topic.enabled ? '暂停' : '恢复'}">${topic.enabled ? ic('pause', 12) : ic('play', 12)}${topic.enabled ? '暂停' : '恢复'}</button>
          <button class="icon-btn" data-act="news-edit" data-id="${topic.id}" title="编辑">${ic('edit', 14)}</button>
          <button class="icon-btn" data-act="news-delete" data-id="${topic.id}" title="删除">${ic('trash', 14)}</button>
        </div>
      </div>`
    }).join('')}</div>`
    const filters = topics.length === 0 ? '' : `<div class="news-filters">
      <button class="chip ${ui.newsTopicFilter === 'all' ? 'active' : ''}" data-act="news-filter" data-topic="all">全部</button>
      ${topics.map(t => `<button class="chip ${ui.newsTopicFilter === t.id ? 'active' : ''}" data-act="news-filter" data-topic="${t.id}">${esc(t.title)}</button>`).join('')}
    </div>`
    const accents = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--blue)']
    const accentOf = (topicId: string): string => {
      let h = 0
      for (let i = 0; i < topicId.length; i += 1) h = (h * 31 + topicId.charCodeAt(i)) | 0
      return accents[Math.abs(h) % accents.length] ?? accents[0]
    }
    const itemHtml = (item: NewsItem): string => {
      const topic = newsTopics.find(t => t.id === item.topicId)
      const ai = (item.aiSummary || '').trim()
      const text = ai || (item.summary || '').trim()
      return `<article class="news-item" style="--card-accent:${accentOf(item.source || item.id)}">
        <div class="ni-meta"><span class="news-topic-tag">${esc(topic?.title ?? '新闻')}</span>
          <span style="margin-left:auto">${ago(item.fetchedAt)}</span></div>
        <a class="ni-title" href="${esc(item.url)}" target="_blank" rel="noreferrer noopener">${esc(item.title)} ${ic('external', 12)}</a>
        ${text ? `<div class="ni-ai${ai ? '' : ' plain'}"><div class="ni-ai-head">${ic('spark', 11)} ${ai ? 'AI 总结' : '摘要'}</div><p>${esc(text)}</p></div>` : ''}
        <div class="ni-foot">${item.source ? `<span>${esc(item.source)}</span>` : ''}${item.publishedAt ? `<span>${esc(item.publishedAt)}</span>` : ''}<a href="${esc(item.url)}" target="_blank" rel="noreferrer noopener">查看原文</a></div>
      </article>`
    }
    const feed = topics.length === 0
      ? `<div class="news-empty"><div class="ne-icon">${ic('news', 22)}</div><b>还没有新闻订阅</b><span>选一个预置主题，或自己填关键词与检索时间；DSH 到点会用 Agent 搜索并把结果写回这里。</span><div class="news-presets" style="justify-content:center;margin:4px 0 2px">${NEWS_PRESETS.map((p, i) => `<button class="chip" data-act="news-preset" data-index="${i}">${esc(p.title)}</button>`).join('')}</div><button class="btn-primary" data-act="news-add" style="margin-top:4px">${ic('plus', 14)}自定义订阅</button></div>`
      : `<div class="news-feed-head"><b>最新新闻</b><span class="muted">${filtered.length} 条${ui.newsTopicFilter === 'all' ? '' : ' · 已按主题筛选'}</span></div>
        ${filters}
        ${filtered.length === 0 ? `<div class="news-empty small"><b>还没有检索结果</b><span>等待下一次定时任务，或点上方订阅卡片的「检索」立即运行一次。</span></div>` : `<div class="news-list">${filtered.map(itemHtml).join('')}</div>`}`
    return head + banner + stats + topicCards + feed
  }

  function openNewsTopic(topic?: NewsTopic, preset?: { title: string; query: string }): void {
    const editing = topic !== undefined
    const kind = topic?.scheduleKind ?? 'daily'
    const times = topic?.times?.join(', ') ?? '08:30'
    const count = topic?.count ?? 6
    const counts = [3, 5, 6, 8, 10, 15, 20]
    openModal(`<h3>${editing ? '编辑新闻订阅' : '新建新闻订阅'}</h3>
      ${editing ? '' : `<div class="mfield"><label>快速主题（可再改）</label><div class="news-presets">${NEWS_PRESETS.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p.title)}</button>`).join('')}</div></div>`}
      <div class="mfield"><label>主题名称</label><input id="wb-news-title" value="${esc(topic?.title ?? preset?.title ?? '')}" placeholder="例如：AI 行业动态"></div>
      <div class="mfield"><label>检索关键词</label><input id="wb-news-query" value="${esc(topic?.query ?? preset?.query ?? '')}" placeholder="例如：大模型 发布 融资 开源"></div>
      <div class="mrow"><div class="mfield"><label>频率</label><select id="wb-news-kind">${(['daily', 'workdays', 'weekly', 'custom'] as NewsKind[]).map(k => `<option value="${k}" ${kind === k ? 'selected' : ''}>${NEWS_KIND_LABEL[k]}</option>`).join('')}</select></div>
        <div class="mfield"><label>每次检索条数</label><select id="wb-news-count">${counts.map(n => `<option value="${n}" ${Number(count) === n ? 'selected' : ''}>${n} 条</option>`).join('')}</select></div></div>
      <div class="mrow"><div class="mfield"><label>每周几（仅「每周」）</label><select id="wb-news-weekday">${WEEKDAY_LABEL.map((w, i) => `<option value="${i}" ${(topic?.weekday ?? 1) === i ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
        <div class="mfield"><label>启用定时检索</label><div style="padding-top:5px"><button class="switch ${(topic?.enabled ?? true) ? 'on' : ''}" data-act="news-toggle-enabled" id="wb-news-enabled" style="margin:0"></button></div></div></div>
      <div class="mfield"><label>检索时间（可多个，用逗号分隔）</label><input id="wb-news-times" value="${esc(times)}" placeholder="08:30, 20:00"></div>
      <div class="mfield"><label>自定义 cron（频率选「自定义」时使用）</label><input id="wb-news-cron" value="${esc(topic?.customCron ?? '')}" placeholder="30 8,20 * * *"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">每个检索时间会创建一个 dsh-cron 任务。到点后 DSH Agent 用网页搜索整理新闻，并通过 workbench_news_publish 写回本机；每次检索会请求 AI 总结并展示在卡片上。检索会消耗模型额度；权限只读。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="news-save" data-id="${topic?.id ?? ''}">${editing ? '保存修改' : '创建订阅'}</button></div>`)
    let enabled = topic?.enabled ?? true
    shadow.querySelector<HTMLElement>('#wb-news-enabled')?.addEventListener('click', event => {
      event.stopPropagation()
      enabled = !enabled
      ;(event.currentTarget as HTMLElement).classList.toggle('on', enabled)
    })
    shadow.querySelectorAll<HTMLElement>('[data-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const p = NEWS_PRESETS[Number(button.getAttribute('data-preset'))]
        const title = $id<HTMLInputElement>('wb-news-title')
        const query = $id<HTMLInputElement>('wb-news-query')
        if (p && title && query) { title.value = p.title; query.value = p.query; title.focus() }
      })
    })
  }

  async function saveNewsFromModal(existingId: string): Promise<void> {
    const title = $id<HTMLInputElement>('wb-news-title')?.value.trim() ?? ''
    const query = $id<HTMLInputElement>('wb-news-query')?.value.trim() || title
    const kind = ($id<HTMLSelectElement>('wb-news-kind')?.value ?? 'daily') as NewsKind
    const times = parseTimeList($id<HTMLInputElement>('wb-news-times')?.value ?? '')
    const weekday = Number($id<HTMLSelectElement>('wb-news-weekday')?.value ?? 1)
    const customCron = $id<HTMLInputElement>('wb-news-cron')?.value.trim() ?? ''
    const enabled = $id('wb-news-enabled')?.classList.contains('on') ?? true
    const count = Math.max(1, Math.min(20, Number($id<HTMLSelectElement>('wb-news-count')?.value ?? 6) || 6))
    if (title === '') { toast('请填写主题名称'); return }
    if (kind !== 'custom' && times.length === 0) { toast('请填写至少一个 HH:mm 时间'); return }
    if (kind === 'custom' && customCron.split(/\s+/).filter(Boolean).length !== 5) { toast('cron 需要 5 段，例如 30 8,20 * * *'); return }
    const previous = newsTopics.find(t => t.id === existingId)
    const id = previous?.id ?? `news-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const draft: NewsTopic = {
      id, title, query, scheduleKind: kind, times, weekday, customCron,
      scheduleText: scheduleTextOf(kind, times, weekday, customCron),
      cronTaskIds: previous?.cronTaskIds ?? [], enabled, count,
      lastRunAt: previous?.lastRunAt ?? null, createdAt: previous?.createdAt ?? nowStamp(), updatedAt: nowStamp(),
    }
    let createdIds: string[] = []
    try {
      createdIds = await syncCronForTopic(draft, previous?.cronTaskIds ?? [])
      draft.cronTaskIds = createdIds
      const res = await fetch(`${API}/news/topics`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: draft }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      closeModal()
      await loadNews()
      toast(previous ? '订阅已更新' : '订阅已创建')
    } catch (cause) {
      for (const taskId of createdIds) { try { await cronFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }) } catch { /* ignore */ } }
      toast(`保存失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  async function runNewsTopic(id: string): Promise<void> {
    const topic = newsTopics.find(t => t.id === id)
    if (!topic) return
    if (topic.cronTaskIds.length === 0) { toast('这个订阅还没有同步到定时任务，请先编辑保存一次'); return }
    newsRunning[id] = Date.now()
    newsWatchUntil = Date.now() + 240_000
    lastNewsPoll = 0
    renderContent()
    toast('已触发检索，Agent 完成后会自动刷新')
    try {
      await cronFetch(`/tasks/${encodeURIComponent(topic.cronTaskIds[0])}/run`, { method: 'POST' })
    } catch (cause) {
      delete newsRunning[id]
      renderContent()
      toast(`触发失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  async function toggleNewsTopic(id: string): Promise<void> {
    const topic = newsTopics.find(t => t.id === id)
    if (!topic) return
    if (topic.cronTaskIds.length === 0) { toast('订阅未同步，请先编辑保存'); return }
    const next = !topic.enabled
    try {
      for (const taskId of topic.cronTaskIds) {
        await cronFetch(`/tasks/${encodeURIComponent(taskId)}/${next ? 'resume' : 'pause'}`, { method: 'POST' })
      }
      topic.enabled = next
      await fetch(`${API}/news/topics`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic }) })
      await loadNews()
      toast(next ? '已恢复定时检索' : '已暂停定时检索')
    } catch (cause) {
      toast(`操作失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  async function deleteNewsTopic(id: string): Promise<void> {
    const topic = newsTopics.find(t => t.id === id)
    if (!topic) return
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除订阅「${topic.title}」及其全部新闻？`) : true
    if (!ok) return
    for (const taskId of topic.cronTaskIds) {
      try { await cronFetch(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' }) } catch { /* 任务可能已被删 */ }
    }
    try {
      const res = await fetch(`${API}/news/topics/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (ui.newsTopicFilter === id) ui.newsTopicFilter = 'all'
      delete newsRunning[id]
      await loadNews()
      toast('订阅已删除')
    } catch (cause) {
      toast(`删除失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  /* ---------- 记事本 ---------- */
  function noteById(id: string | null): Note | undefined {
    return notes.find(n => n.id === id)
  }
  function noteText(content: string): string {
    return content.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim()
  }
  function noteWords(content: string): number {
    return content.replace(/\s/g, '').length
  }
  function markdownInline(text: string): string {
    let out = esc(text)
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    out = out.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img alt="$1" src="$2" loading="lazy">')
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>')
    return out
  }
  function markdownToHtml(md: string): string {
    const lines = md.replace(/\r\n?/g, '\n').split('\n')
    let html = ''
    let list: 'ul' | 'ol' | null = null
    let inCode = false
    let codeLang = ''
    let code: string[] = []
    const closeList = (): void => { if (list !== null) { html += `</${list}>`; list = null } }
    const openList = (kind: 'ul' | 'ol'): void => { if (list !== kind) { closeList(); html += `<${kind}>`; list = kind } }
    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li]
      if (/^```/.test(line.trim())) {
        if (inCode) {
          html += `<pre><code${codeLang ? ` class="language-${esc(codeLang)}"` : ''}>${esc(code.join('\n'))}</code></pre>`
          inCode = false; codeLang = ''; code = []
        } else { inCode = true; codeLang = line.trim().slice(3).trim() }
        continue
      }
      if (inCode) { code.push(line); continue }
      if (line.trim() === '') { closeList(); continue }
      if (/^-{3,}$/.test(line.trim())) { closeList(); html += '<hr>'; continue }
      const heading = line.match(/^(#{1,6})\s+(.*)$/)
      if (heading) { closeList(); const n = heading[1].length; html += `<h${n}>${markdownInline(heading[2])}</h${n}>`; continue }
      if (/^>\s?/.test(line)) { closeList(); html += `<blockquote>${markdownInline(line.replace(/^>\s?/, ''))}</blockquote>`; continue }
      const ul = line.match(/^\s*[-*+]\s+(.*)$/)
      if (ul) {
        openList('ul')
        const task = ul[1].match(/^\[([ xX])\]\s+(.*)$/)
        html += task
          ? `<li class="md-task"><span class="md-check">${task[1].toLowerCase() === 'x' ? '☑' : '☐'}</span> ${markdownInline(task[2])}</li>`
          : `<li>${markdownInline(ul[1])}</li>`
        continue
      }
      const ol = line.match(/^\s*\d+\.\s+(.*)$/)
      if (ol) { openList('ol'); html += `<li>${markdownInline(ol[1])}</li>`; continue }
      // 表格：| a | b |  + 分隔行
      if (/^\s*\|.*\|\s*$/.test(line)) {
        const next = lines[li + 1] ?? ''
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => markdownInline(c.trim()))
        if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(next)) {
          closeList()
          html += `<table><thead><tr>${cells.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>`
          li += 2
          while (li < lines.length && /^\s*\|.*\|\s*$/.test(lines[li])) {
            const tds = lines[li].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => markdownInline(c.trim()))
            html += `<tr>${tds.map(c => `<td>${c}</td>`).join('')}</tr>`
            li += 1
          }
          li -= 1
          html += '</tbody></table>'
          continue
        }
      }
      closeList()
      html += `<p>${markdownInline(line)}</p>`
    }
    if (inCode) html += `<pre><code>${esc(code.join('\n'))}</code></pre>`
    closeList()
    return html === '' ? '<p class="muted">还没有内容。</p>' : html
  }
  function notebookOf(id: string | null | undefined): Notebook | undefined {
    return notebooks.find(nb => nb.id === id)
  }
  function notebookName(id: string | null | undefined): string {
    return notebookOf(id)?.name ?? '未分类'
  }
  function defaultNotebook(): Notebook | undefined {
    return notebooks[0]
  }
  function noteMatches(note: Note): boolean {
    const q = ui.notesQ.trim().toLowerCase()
    if (noteNotebookFilter !== 'all' && (note.notebookId ?? '') !== noteNotebookFilter) return false
    if (ui.notesFilter === 'pinned' && !note.pinned) return false
    if (ui.notesFilter.startsWith('tag:') && !note.tags.includes(ui.notesFilter.slice(4))) return false
    if (q === '') return true
    return `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase().includes(q)
  }
  function sortedNotes(): Note[] {
    return notes.filter(noteMatches).slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
  }
  function noteListHtml(): string {
    const list = sortedNotes()
    if (noteLoading && notes.length === 0) return '<div class="notes-empty small">正在读取笔记…</div>'
    if (list.length === 0) return '<div class="notes-empty small">没有匹配的笔记</div>'
    return list.map(note => {
      const text = noteText(note.content)
      return `<div class="note-row${note.id === noteSelected ? ' active' : ''}" data-note-id="${note.id}">
        <div class="note-row-top"><span class="note-row-title">${note.pinned ? ic('pin', 11) : ''}${esc(note.title || '未命名笔记')}</span><span class="note-row-time">${ago(note.updatedAt)}</span></div>
        <div class="note-row-snip">${esc(text.slice(0, 90) || '空白笔记')}</div>
        <div class="note-row-tags"><span class="note-row-nb">${esc(notebookName(note.notebookId))}</span>${note.tags.slice(0, 2).map(tag => `<span>#${esc(tag)}</span>`).join('')}</div>
      </div>`
    }).join('')
  }
  function renderNoteListOnly(): void {
    const list = $id('wb-note-list')
    if (list !== null) list.innerHTML = noteListHtml()
  }
  function noteSaveText(): string {
    if (noteSaveState === 'saving') return '保存中…'
    if (noteSaveState === 'error') return '保存失败'
    return '已保存'
  }
  function updateNoteSaveStatus(): void {
    const node = $id('wb-note-save')
    if (node !== null) {
      node.textContent = noteSaveText()
      node.className = `note-save-state${noteSaveState === 'error' ? ' err' : noteSaveState === 'saving' ? ' busy' : ''}`
    }
  }
  function updateNoteWords(): void {
    const note = noteById(noteSelected)
    const node = $id('wb-note-words')
    if (note && node) node.textContent = `${noteWords(note.content)} 字`
  }
  function scheduleNoteSave(): void {
    noteDirty = true
    noteChangeSeq += 1
    noteSaveState = 'saving'
    updateNoteSaveStatus()
    if (noteSaveTimer !== 0) window.clearTimeout(noteSaveTimer)
    noteSaveTimer = window.setTimeout(() => { void saveSelectedNote() }, 650)
  }
  async function saveSelectedNote(): Promise<void> {
    const note = noteById(noteSelected)
    if (!note || !noteDirty) return
    if (noteSaveTimer !== 0) { window.clearTimeout(noteSaveTimer); noteSaveTimer = 0 }
    if (note.title.trim() === '') {
      note.title = '未命名笔记'
      const input = $id<HTMLInputElement>('wb-note-title')
      if (input !== null) input.value = note.title
    }
    const seq = noteChangeSeq
    noteSaveState = 'saving'
    updateNoteSaveStatus()
    try {
      const res = await fetch(`${API}/notes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: { id: note.id, notebookId: note.notebookId, title: note.title, content: note.content, tags: note.tags, pinned: note.pinned } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { note?: Note }
      if (data.note) {
        if (seq === noteChangeSeq) Object.assign(note, data.note)
        else note.updatedAt = data.note.updatedAt
      }
      if (seq === noteChangeSeq) { noteDirty = false; noteSaveState = 'saved' }
      else { noteSaveState = 'saving'; scheduleNoteSave() }
      updateNoteSaveStatus()
      renderNoteListOnly()
      const foot = $id('wb-note-updated')
      if (foot) foot.textContent = `更新于 ${ago(note.updatedAt)}`
    } catch (cause) {
      noteSaveState = 'error'
      updateNoteSaveStatus()
      console.warn('[dsh-workbench] 笔记保存失败', cause)
    }
  }
  async function flushNoteSave(): Promise<void> {
    if (noteDirty) await saveSelectedNote()
  }
  async function loadNotes(silent = false): Promise<void> {
    if (noteLoading) return
    noteLoading = true
    if (!silent) {
      noteError = ''
      if (ui.view === 'notes') renderContent()
    }
    try {
      const res = await fetch(`${API}/notes`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { notes?: Note[]; notebooks?: Notebook[] }
      const nextNotes = Array.isArray(data.notes) ? data.notes : []
      // AI 经 workbench_note_update 回写后：无本地未保存改动时自动载入并提示
      if (silent) {
        if (noteDirty) {
          noteLoading = false
          return // 本地有未保存改动，跳过覆盖
        }
        const before = noteById(noteSelected)?.updatedAt
        notes = nextNotes
        const after = noteById(noteSelected)?.updatedAt
        if (before !== undefined && after !== undefined && before !== after) {
          renderContent()
          toast('AI 已更新当前笔记，已自动载入')
        }
      } else {
        notes = nextNotes
      }
      notebooks = Array.isArray(data.notebooks) ? data.notebooks : []
      if (noteNotebookFilter !== 'all' && notebookOf(noteNotebookFilter) === undefined) noteNotebookFilter = 'all'
      if (noteSelected === null || noteById(noteSelected) === undefined) noteSelected = sortedNotes()[0]?.id ?? notes[0]?.id ?? null
      if (!silent) {
        noteSaveState = 'saved'
        noteDirty = false
      }
    } catch (cause) {
      if (!silent) noteError = String((cause as Error).message ?? cause)
    }
    noteLoading = false
    if (!silent && ui.view === 'notes') renderContent()
  }
  async function selectNote(id: string): Promise<void> {
    if (id === noteSelected) return
    await flushNoteSave()
    if (noteSaveState === 'error') { toast('当前笔记保存失败，先不切换'); return }
    noteSelected = id
    ui.noteMode = 'edit'
    noteDirty = false
    noteSaveState = 'saved'
    renderContent()
  }
  async function createNote(): Promise<void> {
    await flushNoteSave()
    if (noteSaveState === 'error') { toast('当前笔记保存失败，先不新建'); return }
    try {
      const res = await fetch(`${API}/notes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: { title: '未命名笔记', content: '', tags: [], pinned: false, notebookId: noteNotebookFilter !== 'all' ? noteNotebookFilter : defaultNotebook()?.id } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { note?: Note }
      if (!data.note) throw new Error('创建失败')
      notes.unshift(data.note)
      noteSelected = data.note.id
      ui.notesQ = ''
      ui.notesFilter = 'all'
      ui.noteMode = 'edit'
      noteDirty = false
      noteSaveState = 'saved'
      renderContent()
      window.setTimeout(() => {
        const input = $id<HTMLInputElement>('wb-note-title')
        input?.focus()
        input?.select()
      }, 0)
      toast('已创建笔记')
    } catch (cause) {
      toast(`创建失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function deleteSelectedNote(): Promise<void> {
    const note = noteById(noteSelected)
    if (!note) return
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除笔记「${note.title || '未命名笔记'}」？`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/notes/${encodeURIComponent(note.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notes = notes.filter(n => n.id !== note.id)
      noteDirty = false
      noteSelected = sortedNotes()[0]?.id ?? notes[0]?.id ?? null
      noteSaveState = 'saved'
      renderContent()
      toast('笔记已删除')
    } catch (cause) {
      toast(`删除失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function toggleSelectedPin(): Promise<void> {
    const note = noteById(noteSelected)
    if (!note) return
    note.pinned = !note.pinned
    noteDirty = true
    noteChangeSeq += 1
    await saveSelectedNote()
    renderContent()
  }
  function openNotebookCreate(): void {
    openModal(`<h3>新建笔记本</h3>
      <div class="mfield"><label>笔记本名称</label><input id="wb-nb-name" placeholder="例如：工作 / 学习 / 灵感" maxlength="80"></div>
      <div class="mfield"><label>关联工作区（可选）</label><input id="wb-nb-workspace" placeholder="/Users/you/project"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">关联后，笔记会同步保存为工作区下的「.dsh-workbench/notes/」Markdown 文件。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="nb-create">创建</button></div>`)
    window.setTimeout(() => $id<HTMLInputElement>('wb-nb-name')?.focus(), 0)
  }
  function openNotebookManager(): void {
    const rows = notebooks.map(nb => `<div class="nb-row"><span class="nb-name">${esc(nb.name)}<span class="nb-ws">${esc(nb.workspacePath || '未关联工作区')}</span></span><span class="nb-count">${notes.filter(n => n.notebookId === nb.id).length} 篇</span>
      <button class="btn" data-act="nb-rename" data-id="${nb.id}">重命名</button><button class="icon-btn" data-act="nb-delete" data-id="${nb.id}" title="删除">${ic('trash', 13)}</button></div>`).join('')
    openModal(`<h3>笔记本</h3>
      <div class="mfield"><label>新建笔记本</label><div class="nb-create-row"><input id="wb-nb-name" placeholder="例如：工作 / 学习 / 灵感" maxlength="80"><button class="btn solid" data-act="nb-create">创建</button></div><input id="wb-nb-workspace" placeholder="关联工作区路径（可选，例如 /Users/you/project）" style="margin-top:5px"></div>
      <div class="nb-list">${rows || '<div class="notes-empty small">还没有笔记本</div>'}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">完成</button></div>`)
  }
  function openNotebookRename(id: string): void {
    const nb = notebookOf(id)
    if (!nb) return
    openModal(`<h3>重命名笔记本</h3>
      <div class="mfield"><label>笔记本名称</label><input id="wb-nb-rename" value="${esc(nb.name)}" maxlength="80"></div>
      <div class="mfield"><label>关联工作区</label><input id="wb-nb-rename-workspace" value="${esc(nb.workspacePath ?? '')}" placeholder="/Users/you/project"></div>
      <div class="modal-foot"><button class="btn" data-act="notebook-manage">返回</button><button class="btn solid" data-act="nb-rename-save" data-id="${id}">保存</button></div>`)
    window.setTimeout(() => { const input = $id<HTMLInputElement>('wb-nb-rename'); input?.focus(); input?.select() }, 0)
  }
  async function createNotebook(): Promise<void> {
    const input = $id<HTMLInputElement>('wb-nb-name')
    const name = input?.value.trim() ?? ''
    if (name === '') { input?.focus(); return }
    try {
      const res = await fetch(`${API}/notebooks`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notebook: { name, workspacePath: $id<HTMLInputElement>('wb-nb-workspace')?.value.trim() ?? '' } }),
      })
      const data = await res.json() as { notebook?: Notebook; message?: string }
      if (!res.ok || !data.notebook) throw new Error(data.message ?? `HTTP ${res.status}`)
      closeModal()
      noteNotebookFilter = data.notebook.id
      await loadNotes()
      noteSelected = sortedNotes()[0]?.id ?? null
      renderContent()
      toast(`已创建笔记本「${data.notebook.name}」`)
    } catch (cause) {
      toast(`创建失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function renameNotebook(id: string): Promise<void> {
    const input = $id<HTMLInputElement>('wb-nb-rename')
    const name = input?.value.trim() ?? ''
    if (name === '') { input?.focus(); return }
    try {
      const res = await fetch(`${API}/notebooks`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notebook: { id, name, workspacePath: $id<HTMLInputElement>('wb-nb-rename-workspace')?.value.trim() ?? '' } }),
      })
      const data = await res.json() as { notebook?: Notebook; message?: string }
      if (!res.ok || !data.notebook) throw new Error(data.message ?? `HTTP ${res.status}`)
      closeModal()
      await loadNotes()
      renderContent()
      toast('笔记本已重命名')
    } catch (cause) {
      toast(`重命名失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function deleteNotebook(id: string): Promise<void> {
    if (notebooks.length <= 1) { toast('至少保留一个笔记本'); return }
    const nb = notebookOf(id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除笔记本「${nb?.name ?? ''}」？其中的笔记会移到其他笔记本。`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/notebooks/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json() as { moved?: number; message?: string }
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      if (noteNotebookFilter === id) noteNotebookFilter = 'all'
      closeModal()
      await loadNotes()
      renderContent()
      toast(`笔记本已删除${data.moved ? `，${data.moved} 篇笔记已移动` : ''}`)
    } catch (cause) {
      toast(`删除失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  function showExportResult(result: { format?: string; filename?: string; path?: string }): void {
    lastExportPath = result.path ?? ''
    openModal(`<h3>${result.format === 'pdf' ? '已导出 PDF' : '已另存为 Markdown'}</h3>
      <div class="export-result"><div class="export-name">${ic(result.format === 'pdf' ? 'pdf' : 'note', 18)}${esc(result.filename ?? '')}</div>
      <div class="export-path">${esc(result.path ?? '')}</div></div>
      <div class="modal-foot"><button class="btn" data-act="open-export-folder">${ic('folder', 13)}打开文件夹</button><button class="btn" data-act="copy-export-path">复制路径</button><button class="btn solid" data-act="close-modal">完成</button></div>`)
  }
  async function openExportFolder(): Promise<void> {
    if (lastExportPath === '') return
    try {
      const res = await fetch(`${API}/notes/reveal`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: lastExportPath }),
      })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok || !data.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      toast('已打开所在文件夹')
    } catch (cause) {
      toast(`打开失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function copyExportPath(): Promise<void> {
    if (lastExportPath === '') return
    try {
      await navigator.clipboard.writeText(lastExportPath)
      toast('已复制文件路径')
    } catch {
      toast(lastExportPath)
    }
  }
  async function exportSelectedNote(format: 'md' | 'pdf'): Promise<void> {
    if (noteExporting) return
    const note = noteById(noteSelected)
    if (!note) return
    await flushNoteSave()
    if (noteSaveState === 'error') { toast('笔记还没保存成功，先不导出'); return }
    noteExporting = true
    toast(format === 'pdf' ? '正在生成 PDF…' : '正在另存…')
    try {
      const res = await fetch(`${API}/notes/export`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noteId: note.id, format, html: markdownToHtml(note.content) }),
      })
      const data = await res.json() as { ok?: boolean; format?: string; filename?: string; path?: string; message?: string }
      if (!res.ok || !data.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      showExportResult(data)
    } catch (cause) {
      toast(`导出失败：${String((cause as Error).message ?? cause)}`)
    } finally {
      noteExporting = false
    }
  }
  async function loadExportConfig(): Promise<void> {
    try {
      const res = await fetch(`${API}/notes/config`)
      const data = await res.json() as { exportDir?: string; defaultExportDir?: string }
      exportDir = data.exportDir ?? ''
      defaultExportDir = data.defaultExportDir ?? ''
      const input = $id<HTMLInputElement>('wb-export-dir')
      if (input !== null) input.value = exportDir
      const hint = $id('wb-export-hint')
      if (hint !== null) hint.textContent = `默认：${defaultExportDir}；另存与 PDF 都写入这里`
    } catch (cause) {
      const hint = $id('wb-export-hint')
      if (hint !== null) hint.textContent = `读取失败：${String((cause as Error).message ?? cause)}`
    }
  }
  async function saveExportDir(dir: string): Promise<void> {
    try {
      const res = await fetch(`${API}/notes/config`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exportDir: dir }),
      })
      const data = await res.json() as { exportDir?: string; defaultExportDir?: string; message?: string }
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      exportDir = data.exportDir ?? ''
      defaultExportDir = data.defaultExportDir ?? ''
      const input = $id<HTMLInputElement>('wb-export-dir')
      if (input !== null) input.value = exportDir
      toast(`保存目录：${exportDir}`)
    } catch (cause) {
      toast(`目录保存失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function convertNoteToTask(): Promise<void> {
    const note = noteById(noteSelected)
    if (!note) return
    await flushNoteSave()
    const desc = noteText(note.content).slice(0, 200)
    createTask({ title: note.title || '未命名笔记', desc })
    ui.view = 'list'
    ui.scope = 'today'
    renderAll()
    toast('已把笔记转为任务')
  }
  function renderNotes(): string {
    const selected = noteById(noteSelected)
    const tags = Array.from(new Set(notes.flatMap(n => n.tags))).sort()
    const header = `<div class="view-head"><div><div class="eyebrow">记事本</div><h1 class="page-title">笔记</h1>
      <div class="page-sub">随手记下想法，自动保存到本机；支持 Markdown、标签与收藏</div></div>
      <button class="btn-primary" data-act="note-new">${ic('plus', 14)}新建笔记</button></div>`
    if (noteError !== '') {
      return header + `<div class="news-banner">${ic('flag', 13)}<span>笔记读取失败：${esc(noteError)}</span><button class="btn" data-act="note-retry">重试</button></div>`
    }
    const filters = `<div class="notes-filters">
      <button class="chip ${ui.notesFilter === 'all' ? 'active' : ''}" data-act="note-filter" data-filter="all">全部</button>
      <button class="chip ${ui.notesFilter === 'pinned' ? 'active' : ''}" data-act="note-filter" data-filter="pinned">${ic('pin', 11)}收藏</button>
      ${tags.slice(0, 8).map(tag => `<button class="chip ${ui.notesFilter === 'tag:' + tag ? 'active' : ''}" data-act="note-filter" data-filter="tag:${esc(tag)}">#${esc(tag)}</button>`).join('')}
    </div>`
    const side = `<aside class="notes-side">
      <div class="notes-nb-row">
        <select id="wb-notebook-filter" class="notes-nb-select" title="按笔记本筛选">
          <option value="all" ${noteNotebookFilter === 'all' ? 'selected' : ''}>全部笔记本（${notes.length}）</option>
          ${notebooks.map(nb => `<option value="${nb.id}" ${noteNotebookFilter === nb.id ? 'selected' : ''}>${esc(nb.name)}（${notes.filter(n => n.notebookId === nb.id).length}）</option>`).join('')}
        </select>
        <button class="icon-btn" data-act="notebook-new" title="新建笔记本">${ic('plus', 14)}</button>
        <button class="icon-btn" data-act="notebook-manage" title="管理笔记本">${ic('settings', 14)}</button>
      </div>
      <div class="notes-search">${ic('search', 13)}<input id="wb-note-search" placeholder="搜索标题、正文或标签" value="${esc(ui.notesQ)}"></div>
      ${filters}
      <div class="notes-list" id="wb-note-list">${noteListHtml()}</div>
      <div class="notes-side-foot">${notes.length} 篇笔记 · ${notes.filter(n => n.pinned).length} 篇收藏</div>
    </aside>`
    let editor = ''
    if (selected === undefined) {
      editor = `<section class="notes-editor empty"><div class="notes-empty"><div class="ne-icon">${ic('notebook', 22)}</div><b>还没有笔记</b><span>新建一篇，随手记下想法；停止输入后自动保存。</span><button class="btn-primary" data-act="note-new">${ic('plus', 14)}新建第一篇笔记</button></div></section>`
    } else {
      const editing = ui.noteMode === 'edit'
      editor = `<section class="notes-editor">
        <div class="note-head">
          <input class="note-title-input" id="wb-note-title" value="${esc(selected.title)}" placeholder="笔记标题">
          <div class="note-actions">
            <button class="icon-btn ${selected.pinned ? 'on' : ''}" data-act="note-pin" title="${selected.pinned ? '取消收藏' : '收藏'}">${ic('pin', 15)}</button>
            <button class="btn" data-act="note-ai-dispatch">${ic('spark', 12)}AI 协同</button>
            <button class="btn" data-act="note-saveas" title="导出 Markdown 到保存目录">${ic('download', 12)}导出 MD</button>
            <button class="btn" data-act="note-pdf" title="导出 PDF 到保存目录">${ic('pdf', 12)}导出 PDF</button>
            <button class="btn" data-act="note-convert">${ic('checkSquare', 13)}转为任务</button>
            <button class="icon-btn" data-act="note-delete" title="删除">${ic('trash', 14)}</button>
          </div>
        </div>
        <div class="note-meta-row">
          <select class="note-notebook-select" id="wb-note-notebook" title="所属笔记本">${notebooks.map(nb => `<option value="${nb.id}" ${selected.notebookId === nb.id ? 'selected' : ''}>${esc(nb.name)}</option>`).join('')}</select>
          <input class="note-tags-input" id="wb-note-tags" value="${esc(selected.tags.join(', '))}" placeholder="标签，用逗号分隔">
        </div>
        <div class="note-toolbar">
          <div class="mini-seg"><button data-act="note-tab" data-mode="edit" class="${editing ? 'active' : ''}">编辑</button><button data-act="note-tab" data-mode="preview" class="${editing ? '' : 'active'}">预览</button></div>
          <span class="note-save-state${noteSaveState === 'saving' ? ' busy' : noteSaveState === 'error' ? ' err' : ''}" id="wb-note-save">${noteSaveText()}</span>
          <span class="note-words" id="wb-note-words">${noteWords(selected.content)} 字</span>
          <button class="btn" data-act="note-ai-improve" title="AI 直接完善这篇笔记">${ic('spark', 12)}AI 完善</button>
          <button class="btn" data-act="note-ai-requirements" title="输入要求后让 AI 完善">按要求完善</button>
          <button class="btn" data-act="note-save">${ic('check', 12)}保存</button>
        </div>
        ${editing
          ? `<textarea class="note-textarea" id="wb-note-content" placeholder="支持 Markdown：标题、列表、引用、代码块、链接…">${esc(selected.content)}</textarea>`
          : `<div class="notes-preview" id="wb-note-preview">${markdownToHtml(selected.content)}</div>`}
        <div class="note-foot"><span id="wb-note-updated">更新于 ${ago(selected.updatedAt)}</span><span>停止输入后自动保存 · ⌘S 立即保存</span></div>
      </section>`
    }
    return header + `<div class="notes-wrap">${side}${editor}</div>`
  }
  function noteImprovePrompt(note: Note, requirement: string): string {
    const notebook = notebooks.find(nb => nb.id === note.notebookId)
    const extra = requirement.trim() === '' ? '无额外要求；按通用编辑标准：结构清晰、信息完整、语言准确。' : requirement.trim()
    return `笔记完善任务

你是工作台的资深编辑与产品文档编辑。请完善下面这篇笔记，只修改这一篇，不要改其他笔记或工作区文件。

【笔记信息】
- noteId：${note.id}
- 标题：${note.title}
- 笔记本：${notebook?.name ?? '未分类'}
- 工作区：${notebook?.workspacePath || '未关联'}

【用户额外要求】
${extra}

【编辑原则】
1. 保留作者原意、事实和数据，不编造；不确定的内容标注而不是虚构。
2. 改善结构、层次、清晰度与完整度；补齐缺失的流程、边界、验收或行动项，但不要空泛扩写。
3. 保留 Markdown；标题核心含义不变，可微调措辞。
4. 不要只回复正文，不要用 write/edit 写文件；唯一交付方式：调用工具 workbench_note_update，参数 { noteId:"${note.id}", title:"可选新标题", content:"完整改进后的 Markdown" }。
5. 完成后用一句话说明改了什么。
6. 若内容已无实质改进空间，仍必须调用工具回写原文，并在总结中说明"无需修改"。
7. 重写幅度控制在原文 150% 字数内；保留作者语气与第一人称；总结里列出改了哪几处。

【当前正文】${note.content.length > 20_000 ? '（正文过长已截断至 2 万字，回写时请保留你未见到的尾部）' : ''}
${note.content.slice(0, 20_000)}`
  }
  async function queueNoteImprove(prompt: string): Promise<void> {
    const note = noteById(noteSelected)
    const nb = note ? notebookOf(note.notebookId) : undefined
    await dispatchToNewSession(nb?.workspacePath ?? '', prompt)
  }
  async function improveSelectedNote(requirement: string): Promise<void> {
    const note = noteById(noteSelected)
    if (!note) return
    await flushNoteSave()
    if (noteSaveState === 'error') { toast('当前笔记还没保存成功，先不提交 AI'); return }
    const prompt = noteImprovePrompt(note, requirement)
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    toast('正在新建 AI 编辑会话…')
    try { await queueNoteImprove(prompt) } catch (cause) { toast(`提交失败：${String((cause as Error).message ?? cause)}`) }
  }
  function openNoteRequirements(): void {
    const note = noteById(noteSelected)
    if (!note) return
    openModal(`<h3>按要求完善笔记</h3>
      <div class="mfield"><label>对这篇笔记的要求</label><textarea id="wb-note-req" rows="4" placeholder="例如：补充异常流程与验收标准；压缩到 800 字；改成更正式的产品文档语气"></textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">AI 会在新会话中完善「${esc(note.title)}」，并通过 workbench_note_update 写回原笔记；保留笔记本、标签与收藏。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="note-ai-run">开始完善</button></div>`)
  }
  function bindNotes(): void {
    const notebookFilter = $id<HTMLSelectElement>('wb-notebook-filter')
    notebookFilter?.addEventListener('change', () => {
      noteNotebookFilter = notebookFilter.value
      noteSelected = sortedNotes()[0]?.id ?? null
      renderContent()
    })
    const noteNotebook = $id<HTMLSelectElement>('wb-note-notebook')
    noteNotebook?.addEventListener('change', () => {
      const note = noteById(noteSelected)
      if (note) {
        note.notebookId = noteNotebook.value
        noteNotebookFilter = noteNotebook.value
        scheduleNoteSave()
        renderContent()
      }
    })
    const search = $id<HTMLInputElement>('wb-note-search')
    search?.addEventListener('input', () => {
      ui.notesQ = search.value
      renderNoteListOnly()
    })
    const title = $id<HTMLInputElement>('wb-note-title')
    title?.addEventListener('input', () => {
      const note = noteById(noteSelected)
      if (note) { note.title = title.value; scheduleNoteSave() }
    })
    const tags = $id<HTMLInputElement>('wb-note-tags')
    tags?.addEventListener('input', () => {
      const note = noteById(noteSelected)
      if (note) { note.tags = tags.value.split(/[,，]/).map(t => t.trim().replace(/^#/, '')).filter(Boolean); scheduleNoteSave() }
    })
    const content = $id<HTMLTextAreaElement>('wb-note-content')
    content?.addEventListener('input', () => {
      const note = noteById(noteSelected)
      if (note) { note.content = content.value; updateNoteWords(); scheduleNoteSave() }
    })
  }

  /* ---------- Bug 管理 ---------- */
  const BUG_STATUSES: BugStatus[] = ['open', 'doing', 'verify', 'resolved']
  const BUG_STATUS_LABEL: Record<BugStatus, string> = { open: '待处理', doing: '进行中', verify: '待验证', resolved: '已解决' }
  const BUG_STATUS_DOT: Record<BugStatus, string> = { open: 'var(--text-3)', doing: 'var(--blue)', verify: 'var(--amber)', resolved: 'var(--green)' }
  const BUG_SEVERITY_LABEL: Record<BugSeverity, string> = { blocker: '致命', major: '严重', minor: '一般', trivial: '轻微' }
  const BUG_SEVERITY_COLOR: Record<BugSeverity, string> = { blocker: 'var(--red)', major: 'var(--orange)', minor: 'var(--amber)', trivial: 'var(--text-3)' }
  const BUG_PRIORITY_LABEL: Record<BugPriority, string> = { P0: 'P0', P1: 'P1', P2: 'P2', P3: 'P3' }
  const BUG_PRIORITY_ORDER: Record<BugPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }

  function bugOf(id: string | null | undefined): Bug | undefined {
    return bugs.find(b => b.id === id)
  }
  function bugProjectOf(id: string | null | undefined): BugProject | undefined {
    return bugProjects.find(p => p.id === id)
  }
  function bugWorkspaceName(path: string): string {
    return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path
  }
  function bugWorkspaceItems(): Array<{ path: string; sessionIds: string[] }> {
    try {
      const service = dshCtx?.get?.<any>('workspaces')
      const snap = service?.list?.getSnapshot?.()
      if (snap?.phase === 'ready' && Array.isArray(snap.items)) return snap.items.filter((x: any) => typeof x?.path === 'string')
    } catch { /* 插件/服务不可用 */ }
    return []
  }
  /**
   * 在本项目关联工作区新建一个普通 DSH 会话，并写入修复提示词后发送。
   * 走 sessions 服务（workspaceId / cwd）新建 → 发送 → 回写 → 切到会话，不刷新页面。
   */
  async function queueRepairSession(project: BugProject, prompt: string, bugIds: string[], options: { focus?: boolean } = {}): Promise<string> {
    return await dispatchToNewSession(project.workspacePath, prompt, async sessionId => { await markBugsDispatched(bugIds, sessionId) }, options)
  }
  function bugFiltered(): Bug[] {
    const q = bugSearch.trim().toLowerCase()
    return bugs.filter(bug => {
      if (bugProjectFilter !== 'all' && bug.projectId !== bugProjectFilter) return false
      if (q === '') return true
      return `${bug.code} ${bug.title} ${bug.description} ${bug.tags.join(' ')}`.toLowerCase().includes(q)
    })
  }
  function bugStats(list: Bug[]): { total: number; open: number; doing: number; verify: number; resolved: number; blocker: number; major: number; minor: number; trivial: number; planned: number; rate: number } {
    const stat = { total: list.length, open: 0, doing: 0, verify: 0, resolved: 0, blocker: 0, major: 0, minor: 0, trivial: 0, planned: 0, rate: 0 }
    for (const bug of list) {
      stat[bug.status] += 1
      stat[bug.severity] += 1
      if (bug.plannedDate !== '' && bug.plannedDate <= todayKey() && bug.status !== 'resolved') stat.planned += 1
    }
    stat.rate = stat.total === 0 ? 0 : Math.round((stat.resolved / stat.total) * 100)
    return stat
  }
  function renderBugCard(bug: Bug): string {
    const project = bugProjectOf(bug.projectId)
    const selected = bugSelected.has(bug.id)
    const overdue = bug.plannedDate !== '' && bug.plannedDate < todayKey() && bug.status !== 'resolved'
    return `<article class="bug-card${selected ? ' selected' : ''}" data-bug-id="${bug.id}" data-status="${bug.status}">
      <div class="bug-card-top">
        <button class="bug-check${selected ? ' on' : ''}" data-act="bug-select" data-id="${bug.id}" title="选择">${selected ? ic('check', 11) : ''}</button>
        <span class="bug-code">${esc(bug.code || bug.id.slice(-4).toUpperCase())}</span>
        <span class="bug-priority ${bug.priority}">${BUG_PRIORITY_LABEL[bug.priority] ?? 'P2'}</span>
        <span class="bug-sev" style="color:${BUG_SEVERITY_COLOR[bug.severity]}">${BUG_SEVERITY_LABEL[bug.severity] ?? '一般'}</span>
        <span class="platform ${bug.platform || 'all'}">${platformLabel(bug.platform || 'all')}</span>
        ${bug.aiThreadId !== '' ? `<span class="bug-ai" title="已提交工作区修复会话">${ic('spark', 10)}AI</span>` : ''}
      </div>
      <div class="bug-title">${esc(bug.title)}</div>
      ${bug.description !== '' ? `<div class="bug-desc">${esc(bug.description.slice(0, 130))}</div>` : ''}
      ${bug.tags.length > 0 ? `<div class="bug-tags">${bug.tags.slice(0, 3).map(tag => `<span>#${esc(tag)}</span>`).join('')}</div>` : ''}
      <div class="bug-card-foot">
        <span class="bug-avatar" title="${esc(bug.assignee)}">${esc((bug.assignee || '我').slice(0, 1))}</span>
        <span class="bug-project-name">${esc(project?.name ?? '未分类')}</span>
        ${bug.plannedDate !== '' ? `<span class="bug-due${overdue ? ' overdue' : ''}">${ic('calendar', 10)}${esc(bug.plannedDate.slice(5))}</span>` : ''}
      </div>
    </article>`
  }
  function bugMainHtml(): string {
    const list = bugFiltered()
    const stat = bugStats(list)
    if (bugProjects.length === 0) {
      return `<div class="notes-empty bug-empty"><div class="ne-icon">${ic('bug', 22)}</div><b>还没有 Bug 项目</b>
        <span>${projects.length > 0 ? `已有 ${projects.length} 个项目，选一个启用 Bug 跟踪即可（会自动建立对应的 Bug 项目）。` : '先创建一个项目并关联 DSH 工作区，再录入 Bug。'}</span>
        ${projects.length > 0
          ? `<div class="portal-project-actions">${projects.map(p => `<button class="btn" data-act="bug-enable-project" data-id="${p.id}">${ic('bug', 12)}启用 ${esc(p.name)}</button>`).join('')}</div>`
          : `<button class="btn-primary" data-act="bug-project-new">${ic('plus', 14)}新建项目</button>`}</div>`
    }
    const stats = `<div class="bug-stats">
      <div class="bug-stat"><b>${stat.total}</b><span>全部</span></div>
      <div class="bug-stat"><b style="color:var(--text-2)">${stat.open}</b><span>待处理</span></div>
      <div class="bug-stat"><b style="color:var(--blue)">${stat.doing}</b><span>进行中</span></div>
      <div class="bug-stat"><b style="color:var(--amber)">${stat.verify}</b><span>待验证</span></div>
      <div class="bug-stat"><b style="color:var(--green)">${stat.resolved}</b><span>已解决</span></div>
      <div class="bug-stat"><b>${stat.planned}</b><span>今日计划</span></div>
      <div class="bug-progress-wrap"><div class="bug-progress-label"><span>完成率</span><b>${stat.rate}%</b></div><div class="bug-progress"><i style="width:${stat.rate}%"></i></div></div>
      <div class="bug-sev-stats">
        ${(['blocker', 'major', 'minor', 'trivial'] as BugSeverity[]).map(sev => `<span style="color:${BUG_SEVERITY_COLOR[sev]}">${BUG_SEVERITY_LABEL[sev]} ${stat[sev]}</span>`).join('')}
      </div>
    </div>`
    const batch = bugSelected.size > 0 ? `<div class="bug-batch"><b>已选 ${bugSelected.size} 条</b><button class="btn solid" data-act="bug-submit-selected">${ic('spark', 12)}提交到工作区会话</button><button class="btn" data-act="bug-plan-selected">${ic('calendar', 12)}设置计划</button><button class="btn" data-act="bug-select-clear">清除选择</button></div>` : ''
    const columns = BUG_STATUSES.map(status => {
      const items = list.filter(b => b.status === status).sort((a, b) => BUG_PRIORITY_ORDER[a.priority] - BUG_PRIORITY_ORDER[b.priority] || b.updatedAt.localeCompare(a.updatedAt))
      return `<section class="bug-col" data-status="${status}">
        <header><span class="bug-col-dot" style="background:${BUG_STATUS_DOT[status]}"></span><b>${BUG_STATUS_LABEL[status]}</b><span class="bug-col-count">${items.length}</span><button class="icon-btn" data-act="bug-new" data-status="${status}" title="新建 Bug">${ic('plus', 13)}</button></header>
        <div class="bug-col-body">${items.length === 0 ? `<div class="bug-col-empty">暂无 Bug</div>` : items.map(renderBugCard).join('')}</div>
      </section>`
    }).join('')
    return stats + batch + `<div class="bug-board">${columns}</div>`
  }
  function refreshBugMain(): void {
    const main = $id('wb-bug-main')
    if (main !== null) {
      main.innerHTML = bugMainHtml()
      bindBugSearchOnly()
    }
  }
  function renderBugs(): string {
    const project = bugProjectFilter === 'all' ? undefined : bugProjectOf(bugProjectFilter)
    const header = `<div class="view-head"><div><div class="eyebrow">质量管理</div><h1 class="page-title">Bug 管理</h1>
      <div class="page-sub">${project ? `${esc(project.name)} · 工作区 ${esc(project.workspacePath || '未关联')}` : '多项目卡片看板；可多选 / 单选 / 按计划提交到工作区会话 修复'}</div><div class="head-pills"><span><b>${bugs.length}</b> Bug</span><span><b>${bugProjects.length}</b> 项目</span><span><b>${bugs.filter(b => b.status !== 'resolved').length}</b> 未关闭</span></div></div>
      <div class="bug-head-actions"><button class="btn" data-act="ai-dispatch" data-kind="bug">${ic('spark', 13)}AI 协同</button><button class="btn" data-act="bug-project-new">${ic('folder', 13)}新建项目</button><button class="btn" data-act="bug-plan-submit">${ic('calendar', 13)}按计划提交</button><button class="btn-primary" data-act="bug-new">${ic('plus', 14)}新建 Bug</button></div></div>`
    if (bugError !== '') {
      return header + `<div class="news-banner">${ic('flag', 13)}<span>Bug 读取失败：${esc(bugError)}</span><button class="btn" data-act="bug-refresh">重试</button></div>`
    }
    const toolbar = `<div class="bug-toolbar">
      <select id="wb-bug-project" class="bug-project-select"><option value="all" ${bugProjectFilter === 'all' ? 'selected' : ''}>全部项目（${bugs.length}）</option>${bugProjects.map(p => `<option value="${p.id}" ${bugProjectFilter === p.id ? 'selected' : ''}>${esc(p.name)}（${bugs.filter(b => b.projectId === p.id).length}）</option>`).join('')}</select>
      <button class="icon-btn" data-act="bug-project-manage" title="管理项目">${ic('settings', 14)}</button>
      <div class="bug-search">${ic('search', 13)}<input id="wb-bug-search" value="${esc(bugSearch)}" placeholder="搜索 Bug 标题、描述或标签"></div>
      <button class="icon-btn" data-act="bug-refresh" title="刷新">${ic('refresh', 14)}</button>
    </div>`
    return header + toolbar + `<div id="wb-bug-main">${bugMainHtml()}</div>`
  }
  function bindBugSearchOnly(): void {
    const input = $id<HTMLInputElement>('wb-bug-search')
    if (input !== null && input.dataset.bound !== '1') {
      input.dataset.bound = '1'
      input.addEventListener('input', () => { bugSearch = input.value; refreshBugMain() })
    }
  }
  function bindBugs(): void {
    bindBugSearchOnly()
    const select = $id<HTMLSelectElement>('wb-bug-project')
    select?.addEventListener('change', () => {
      bugProjectFilter = select.value
      bugSelected.clear()
      renderContent()
    })
  }
  /** 从统一项目启用 Bug 跟踪（自动建对应 Bug 项目，避免重复手建）。 */
  async function enableBugProject(projectId: string): Promise<void> {
    const project = projects.find(p => p.id === projectId)
    if (project === undefined) { toast('项目不存在'); return }
    try {
      const res = await fetch(`${API}/bugs/projects`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: { name: project.name, workspacePath: project.workspacePath, workspaceName: project.workspaceName ?? '' } }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      await loadBugs(true)
      if (data.project !== undefined) bugProjectFilter = data.project.id
      renderContent()
      toast(`已为「${project.name}」启用 Bug 跟踪`)
    } catch (cause) { toast(`启用失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function loadBugs(silent = false): Promise<void> {
    if (bugLoading) return
    bugLoading = true
    if (!silent) { bugError = ''; if (ui.view === 'bugs') renderContent() }
    try {
      const [res, mRes, prjRes] = await Promise.all([fetch(`${API}/bugs`), fetch(`${API}/modules`), fetch(`${API}/projects`)])
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { projects?: BugProject[]; bugs?: Bug[] }
      bugProjects = Array.isArray(data.projects) ? data.projects : []
      bugs = Array.isArray(data.bugs) ? data.bugs : []
      if (prjRes.ok) {
        const pData = await prjRes.json() as { projects?: typeof projects }
        projects = Array.isArray(pData.projects) ? pData.projects : []
      }
      if (mRes.ok) { const m = await mRes.json() as { modules?: Module[] }; productModules = Array.isArray(m.modules) ? m.modules : [] }
      const valid = new Set(bugs.map(b => b.id))
      bugSelected = new Set(Array.from(bugSelected).filter(id => valid.has(id)))
      if (bugProjectFilter !== 'all' && bugProjectOf(bugProjectFilter) === undefined) bugProjectFilter = 'all'
      bugError = ''
    } catch (cause) {
      if (!silent) bugError = String((cause as Error).message ?? cause)
    }
    bugLoading = false
    if (ui.view !== 'bugs') return
    const sig = JSON.stringify({ p: bugProjects.map(p => [p.id, p.name, p.workspacePath, p.count]), b: bugs.map(b => [b.id, b.status, b.severity, b.priority, b.plannedDate, b.title, b.verification, b.aiThreadId, b.updatedAt]) })
    if (!silent || sig !== bugsSig) {
      bugsSig = sig
      if (($id('wb-modal')?.innerHTML ?? '') === '') renderContent()
    }
  }
  function openBugProject(id?: string): void {
    const project = bugProjectOf(id)
    const workspaces = bugWorkspaceItems()
    const currentPath = project?.workspacePath ?? workspaces[0]?.path ?? ''
    const options = workspaces.map(ws => `<option value="${esc(ws.path)}" ${ws.path === currentPath ? 'selected' : ''}>${esc(bugWorkspaceName(ws.path))} · ${esc(ws.path)}</option>`).join('')
    openModal(`<h3>${project ? '编辑项目' : '新建 Bug 项目'}</h3>
      <div class="mfield"><label>项目名称</label><input id="wb-bugp-name" value="${esc(project?.name ?? '')}" placeholder="例如：工作台 / 官网"></div>
      <div class="mfield"><label>关联 DSH 工作区</label>${workspaces.length > 0 ? `<select id="wb-bugp-ws">${options}</select>` : '<div class="muted" style="font-size:10.5px;line-height:1.6">未读取到 DSH 工作区列表；可直接填绝对路径。</div>'}</div>
      <div class="mfield"><label>工作区路径</label><input id="wb-bugp-path" value="${esc(currentPath)}" placeholder="/Users/you/project"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">提交 Bug 时会在本项目工作区新建会话，写入工作区路径与修复要求；AI 在该目录中修复并验证。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="bug-project-save" data-id="${project?.id ?? ''}">${project ? '保存' : '创建项目'}</button></div>`)
    $id<HTMLSelectElement>('wb-bugp-ws')?.addEventListener('change', event => {
      const value = (event.currentTarget as HTMLSelectElement).value
      const input = $id<HTMLInputElement>('wb-bugp-path')
      if (input !== null) input.value = value
    })
  }
  async function saveBugProject(id: string): Promise<void> {
    const name = $id<HTMLInputElement>('wb-bugp-name')?.value.trim() ?? ''
    const workspacePath = $id<HTMLInputElement>('wb-bugp-path')?.value.trim() ?? ''
    if (name === '') { $id<HTMLInputElement>('wb-bugp-name')?.focus(); return }
    try {
      const res = await fetch(`${API}/bugs/projects`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: { id: id || undefined, name, workspacePath, workspaceName: bugWorkspaceName(workspacePath) } }),
      })
      const data = await res.json() as { project?: BugProject; message?: string }
      if (!res.ok || !data.project) throw new Error(data.message ?? `HTTP ${res.status}`)
      const index = bugProjects.findIndex(p => p.id === data.project!.id)
      if (index >= 0) bugProjects[index] = data.project
      else bugProjects.push(data.project)
      closeModal()
      if (bugProjectFilter === 'all') bugProjectFilter = data.project.id
      await loadBugs(true)
      renderContent()
      toast('项目已保存')
    } catch (cause) {
      toast(`保存失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  function openBugProjectManager(): void {
    const rows = bugProjects.map(project => `<div class="nb-row"><span class="nb-name">${esc(project.name)}<span class="nb-ws">${esc(project.workspacePath || '未关联工作区')}</span></span><span class="nb-count">${bugs.filter(b => b.projectId === project.id).length} 条</span>
      <button class="btn" data-act="bug-project-edit" data-id="${project.id}">编辑</button><button class="icon-btn" data-act="bug-project-delete" data-id="${project.id}" title="删除">${ic('trash', 13)}</button></div>`).join('')
    openModal(`<h3>Bug 项目</h3>
      <div class="nb-list">${rows || '<div class="notes-empty small">还没有项目</div>'}</div>
      <div class="modal-foot"><button class="btn" data-act="bug-project-new">${ic('plus', 12)}新建项目</button><button class="btn solid" data-act="close-modal">完成</button></div>`)
  }
  async function deleteBugProject(id: string): Promise<void> {
    const project = bugProjectOf(id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除项目「${project?.name ?? ''}」及其全部 Bug？`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/bugs/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      bugProjects = bugProjects.filter(p => p.id !== id)
      bugs = bugs.filter(b => b.projectId !== id)
      if (bugProjectFilter === id) bugProjectFilter = 'all'
      closeModal()
      renderContent()
      toast('项目已删除')
    } catch (cause) {
      toast(`删除失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  function openBugEditor(id?: string, status?: BugStatus): void {
    if (bugProjects.length === 0) { openBugProject(); return }
    const bug = bugOf(id)
    const projectId = bug?.projectId ?? (bugProjectFilter === 'all' ? bugProjects[0].id : bugProjectFilter)
    openModal(`<h3>${bug ? '编辑 Bug' : '新建 Bug'}</h3>
      <div class="mfield"><label>标题</label><input id="wb-bug-title" value="${esc(bug?.title ?? '')}" placeholder="例如：看板卡片在窄屏下重叠" maxlength="300"></div>
      <div class="mfield"><label>描述 / 复现步骤</label><textarea id="wb-bug-desc" rows="4" placeholder="现象、复现步骤、期望结果">${esc(bug?.description ?? '')}</textarea></div>
      <div class="mrow"><div class="mfield"><label>项目</label><select id="wb-bug-project-sel">${bugProjects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="mfield"><label>模块</label><select id="wb-bug-module"><option value="">无模块</option>${productModules.map(m => `<option value="${m.id}" ${(bug?.moduleId ?? '') === m.id ? 'selected' : ''}>${esc(m.name)} · ${m.platform.toUpperCase()}</option>`).join('')}</select></div>
      <div class="mfield"><label>端</label><select id="wb-bug-platform">${(['all','pc','mobile','tablet']).map(p => `<option value="${p}" ${(bug?.platform ?? 'all') === p ? 'selected' : ''}>${platformLabel(p)}</option>`).join('')}</select></div>
      <div class="mfield"><label>状态</label><select id="wb-bug-status">${BUG_STATUSES.map(s => `<option value="${s}" ${(bug?.status ?? status ?? 'open') === s ? 'selected' : ''}>${BUG_STATUS_LABEL[s]}</option>`).join('')}</select></div></div>
      <div class="mrow"><div class="mfield"><label>严重程度</label><select id="wb-bug-sev">${(['blocker', 'major', 'minor', 'trivial'] as BugSeverity[]).map(s => `<option value="${s}" ${(bug?.severity ?? 'minor') === s ? 'selected' : ''}>${BUG_SEVERITY_LABEL[s]}</option>`).join('')}</select></div>
      <div class="mfield"><label>优先级</label><select id="wb-bug-prio">${(['P0', 'P1', 'P2', 'P3'] as BugPriority[]).map(p => `<option value="${p}" ${(bug?.priority ?? 'P2') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
      <div class="mrow"><div class="mfield"><label>计划日期</label><input id="wb-bug-plan" type="date" value="${esc(bug?.plannedDate ?? todayKey())}"></div>
      <div class="mfield"><label>指派给</label><input id="wb-bug-assignee" value="${esc(bug?.assignee ?? '我')}" maxlength="40"></div></div>
      <div class="mfield"><label>标签（逗号分隔）</label><input id="wb-bug-tags" value="${esc(bug?.tags.join(', ') ?? '')}" placeholder="UI, 回归"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="bug-save" data-id="${bug?.id ?? ''}">${bug ? '保存' : '创建 Bug'}</button></div>`)
  }
  async function saveBug(id: string): Promise<void> {
    const title = $id<HTMLInputElement>('wb-bug-title')?.value.trim() ?? ''
    if (title === '') { $id<HTMLInputElement>('wb-bug-title')?.focus(); return }
    const payload = {
      id: id || undefined,
      projectId: $id<HTMLSelectElement>('wb-bug-project-sel')?.value ?? '',
      title,
      description: $id<HTMLTextAreaElement>('wb-bug-desc')?.value ?? '',
      status: ($id<HTMLSelectElement>('wb-bug-status')?.value ?? 'open') as BugStatus,
      severity: ($id<HTMLSelectElement>('wb-bug-sev')?.value ?? 'minor') as BugSeverity,
      priority: ($id<HTMLSelectElement>('wb-bug-prio')?.value ?? 'P2') as BugPriority,
      platform: $id<HTMLSelectElement>('wb-bug-platform')?.value ?? 'all',
      moduleId: $id<HTMLSelectElement>('wb-bug-module')?.value ?? '',
      plannedDate: $id<HTMLInputElement>('wb-bug-plan')?.value ?? '',
      assignee: $id<HTMLInputElement>('wb-bug-assignee')?.value.trim() || '我',
      tags: ($id<HTMLInputElement>('wb-bug-tags')?.value ?? '').split(/[,，]/).map(x => x.trim()).filter(Boolean),
    }
    try {
      const res = await fetch(`${API}/bugs`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bug: payload }),
      })
      const data = await res.json() as { bug?: Bug; message?: string }
      if (!res.ok || !data.bug) throw new Error(data.message ?? `HTTP ${res.status}`)
      const index = bugs.findIndex(b => b.id === data.bug!.id)
      if (index >= 0) bugs[index] = data.bug
      else bugs.unshift(data.bug)
      closeModal()
      renderContent()
      toast(id ? 'Bug 已更新' : 'Bug 已创建')
    } catch (cause) {
      toast(`保存失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  function openBugDetail(id: string): void {
    const bug = bugOf(id)
    if (!bug) return
    const project = bugProjectOf(bug.projectId)
    openModal(`<h3>${esc(bug.code || 'BUG')} · ${esc(bug.title)}</h3>
      <div class="bug-detail-meta"><span>${esc(project?.name ?? '未分类')}</span><span>${esc(project?.workspacePath || '未关联工作区')}</span></div>
      <div class="bug-detail-status">${BUG_STATUSES.map(s => `<button class="chip ${bug.status === s ? 'active' : ''}" data-act="bug-status" data-id="${bug.id}" data-status="${s}">${BUG_STATUS_LABEL[s]}</button>`).join('')}</div>
      <div class="mfield"><label>描述</label><div class="bug-detail-text">${esc(bug.description || '无描述')}</div></div>
      <div class="mrow"><div class="mfield"><label>严重 / 优先级</label><div class="bug-detail-text">${BUG_SEVERITY_LABEL[bug.severity]} · ${bug.priority}</div></div><div class="mfield"><label>计划 / 指派</label><div class="bug-detail-text">${esc(bug.plannedDate || '未排期')} · ${esc(bug.assignee)}</div></div></div>
      ${bug.verification !== '' ? `<div class="mfield"><label>验证记录</label><div class="bug-detail-text">${esc(bug.verification)}</div></div>` : ''}
      ${bug.aiThreadId !== '' ? `<div class="mfield"><label>AI 修复会话</label><div class="bug-detail-text mono">${esc(bug.aiThreadId)}<button class="btn" data-act="bug-goto-session" data-id="${bug.aiThreadId}" style="margin-left:6px">跳转会话</button></div></div>` : ''}
      <div class="modal-foot bug-foot"><button class="btn" data-act="bug-delete" data-id="${bug.id}">${ic('trash', 12)}删除</button><button class="btn" data-act="bug-edit" data-id="${bug.id}">编辑</button>${bug.status === 'verify' || bug.status === 'resolved' ? `<button class="btn" data-act="bug-regression">${ic('refresh', 12)}去回归</button>` : ''}<button class="btn" data-act="bug-ai-dispatch" data-id="${bug.id}">${ic('spark', 12)}AI 协同</button><button class="btn solid" data-act="bug-ai-submit" data-id="${bug.id}">${ic('spark', 12)}提交 AI 修复</button></div>`)
  }
  async function deleteBug(id: string): Promise<void> {
    const bug = bugOf(id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除 ${bug?.code ?? ''}「${bug?.title ?? ''}」？`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/bugs/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      bugs = bugs.filter(b => b.id !== id)
      bugSelected.delete(id)
      closeModal()
      renderContent()
      toast('Bug 已删除')
    } catch (cause) {
      toast(`删除失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function setBugStatus(id: string, status: BugStatus): Promise<void> {
    const bug = bugOf(id)
    if (!bug) return
    try {
      const res = await fetch(`${API}/bugs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bug: { ...bug, status } }) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { bug?: Bug }
      if (data.bug) Object.assign(bug, data.bug)
      closeModal()
      renderContent()
      toast(`已移到「${BUG_STATUS_LABEL[status]}」`)
    } catch (cause) {
      toast(`更新失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  function planSelectedBugs(): void {
    if (bugSelected.size === 0) return
    openModal(`<h3>设置计划</h3>
      <div class="mfield"><label>计划日期（${bugSelected.size} 条 Bug）</label><input id="wb-bug-plan-batch" type="date" value="${todayKey()}"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="bug-plan-save">保存计划</button></div>`)
  }
  async function saveBugPlan(): Promise<void> {
    const date = $id<HTMLInputElement>('wb-bug-plan-batch')?.value ?? ''
    const ids = Array.from(bugSelected)
    try {
      for (const id of ids) {
        const bug = bugOf(id)
        if (!bug) continue
        const res = await fetch(`${API}/bugs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bug: { ...bug, plannedDate: date } }) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as { bug?: Bug }
        if (data.bug) Object.assign(bug, data.bug)
      }
      closeModal()
      renderContent()
      toast(`已设置 ${ids.length} 条计划`)
    } catch (cause) {
      toast(`设置失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  function bugPrompt(list: Bug[]): string {
    const project = bugProjectOf(list[0]?.projectId)
    const lines = list.map((bug, index) => {
      const proj = bugProjectOf(bug.projectId)
      const moduleName = productModules.find(m => m.id === bug.moduleId)?.name ?? ''
      return `${index + 1}. [${bug.code}] ${bug.title}
   bugId: ${bug.id}
   项目: ${proj?.name ?? ''}
   工作区: ${proj?.workspacePath || '未关联'}
   模块: ${moduleName || '无'} · 端: ${platformLabel(bug.platform || 'all')} · 指派: ${bug.assignee || '我'}
   严重程度: ${BUG_SEVERITY_LABEL[bug.severity]} · 优先级: ${bug.priority}
   计划: ${bug.plannedDate || '未排期'}
   现象/复现: ${bug.description || '未填写'}`
    }).join('\n\n')
    return `Bug 修复任务：${project?.name ?? 'Bug 项目'} · ${list.length} 条

你是 DSH 的资深修复工程师。你已在本项目关联工作区中新建会话，请直接开始修复，不要只做分析或只回复收到。

【任务上下文】
- 项目：${project?.name ?? 'Bug 项目'}
- 工作区绝对路径：${project?.workspacePath || '未关联'}
- 当前会话可能继承其他 cwd；所有检查、修改、验证都必须以该工作区为根，必要时使用绝对路径。
- 涉及端/模块见每条 Bug 的「模块 / 端」字段；多端差异必须分别验证。
- 目标：逐条定位根因，做最小必要修改，在工作区中实际验证，然后回写 Bug 状态。
- 会话开始先执行 git status --porcelain；若有未提交改动，在汇报开头列出并说明与本次修改的边界。

【修复流程（每条 Bug 都执行）】
1. 读取相关代码、配置和测试，复现或确认现象；先不要盲改。
2. 写出根因判断，再做最小改动；保留现有 API/UI 行为，不要用掩盖症状的方式绕过问题。
3. 运行针对性验证（测试、构建、脚本或明确的手动复现步骤）；记录命令与结果。
4. 状态语义：验证通过→resolved；改完待人工确认→verify；无法复现/受阻→verify 且 verification 首行写【阻塞】+原因。
5. 立即调用工具 workbench_bug_update 回写，再进行下一条。首条回写可传 aiThreadId 标记本会话。

【硬性约束】
- 一次只处理一条 Bug，完成回写后再开始下一条，避免交叉污染。
- 同一 Bug 连续 3 次修复未通过验证 → 置 verify，verification 首行写【阻塞】+原因，不要继续消耗。
- 不修改与 Bug 无关的文件；不升级/新增依赖；不改 lockfile；不执行 git commit/push；不删除用户数据。
- 不伪造验证结果；没有实际运行验证就不要写"已验证"。
- 如果工作区路径不存在或无权限，立即把该 Bug 置为 verify 并说明原因，不要继续猜测。

【回写工具】
workbench_bug_update
参数：
{ "bugId": "上面每条给出的 bugId", "status": "doing" | "verify" | "resolved", "verification": "实际执行的命令/步骤与结果", "note": "可选补充", "aiThreadId": "可选，本会话 id" }

【Bug 列表】

${lines}

【最终汇报】
逐条用「编号 + 根因 + 改动文件 + 验证结果 + 新状态」简要汇报；最后列出未能解决的 Bug 和原因。`
  }
  async function submitBugsToAI(ids: string[], skipConfirm = false): Promise<void> {
    const list = ids.map(id => bugOf(id)).filter((b): b is Bug => b !== undefined)
    if (list.length === 0) { toast('请先选择 Bug'); return }
    // A6：按项目分组，杜绝跨项目批量提交到单一工作区
    const groups = new Map<string, Bug[]>()
    for (const bug of list) {
      const group = groups.get(bug.projectId) ?? []
      group.push(bug)
      groups.set(bug.projectId, group)
    }
    const groupList = Array.from(groups.entries())
    if (groupList.length > 1 && !skipConfirm) {
      const summary = groupList.map(([pid, items]) => `「${bugProjectOf(pid)?.name ?? pid}」${items.length} 条`).join('、')
      const ok = typeof window.confirm === 'function' ? window.confirm(`选中的 Bug 来自 ${groupList.length} 个项目（${summary}）。\n将按项目分组、每组各建一个工作区会话提交。继续？`) : true
      if (!ok) return
    }
    let firstSession = ''
    let submitted = 0
    for (const [projectId, items] of groupList) {
      const project = bugProjectOf(projectId)
      if (!project?.workspacePath) { toast(`项目「${project?.name ?? projectId}」还没关联工作区，跳过 ${items.length} 条`); continue }
      const prompt = bugPrompt(items)
      try { await navigator.clipboard.writeText(prompt) } catch { /* 剪贴板不可用时忽略 */ }
      try {
        const sessionId = await queueRepairSession(project, prompt, items.map(b => b.id), { focus: false })
        submitted += items.length
        if (firstSession === '') firstSession = sessionId
      } catch (cause) {
        toast(`「${project.name}」提交失败：${String((cause as Error).message ?? cause)}`)
      }
    }
    if (submitted === 0) return
    if (firstSession !== '') focusSession(firstSession)
    toast(groupList.length > 1 ? `已为 ${groupList.length} 个项目各建一个会话，共 ${submitted} 条` : `已提交 ${submitted} 条 Bug`)
  }
  async function submitPlannedBugs(): Promise<void> {
    const list = bugFiltered().filter(bug => bug.plannedDate !== '' && bug.plannedDate <= todayKey() && bug.status !== 'resolved')
    if (list.length === 0) { toast('今天没有待提交的计划 Bug'); return }
    const ok = typeof window.confirm === 'function' ? window.confirm(`提交今天计划的 ${list.length} 条 Bug？将在工作区新建会话修复。`) : true
    if (!ok) return
    await submitBugsToAI(list.map(b => b.id), true)
  }

  /* ---------- 产品设计（导图 → 笔记 → Demo） ---------- */
  /* Demo 主题库：按目标端分组，★ 为当前流行风格 */
  const PRODUCT_STYLES: { id: string; name: string; hint: string; platform: 'pc' | 'mobile' | 'tablet' | 'all'; popular?: boolean }[] = [
    { id: 'clean', name: '极简白', hint: '白底 / 蓝色主色 / 轻阴影 · 通用', platform: 'all' },
    { id: 'glass', name: '玻璃拟态 ★', hint: '深色渐变 / 半透明卡片 / 模糊 · 2024-26 主流', platform: 'all', popular: true },
    { id: 'neo', name: '新拟态', hint: '灰底 / 双层阴影 / 柔和圆角 · 通用', platform: 'all' },
    { id: 'editorial', name: '编辑杂志', hint: '米白 / 衬线标题 / 强网格 · PC 内容型', platform: 'pc' },
    { id: 'dashboard', name: '暗色仪表盘 ★', hint: '深色 / 数据卡片 / 霓虹强调 · PC 后台标配', platform: 'pc', popular: true },
    { id: 'bento', name: 'Bento 网格 ★', hint: '拼色卡片 / 大圆角 / 非对称栅格 · 当下流行', platform: 'pc', popular: true },
    { id: 'tech', name: '科技终端', hint: '深蓝黑 / 等宽字 / 网格线 · 工具型产品', platform: 'pc' },
    { id: 'aurora', name: '流光渐变 ★', hint: '极光紫蓝 / 大渐变 / 毛玻璃 · 移动端流行', platform: 'mobile', popular: true },
    { id: 'cream', name: '温暖奶油 ★', hint: '奶油色 / 大字重 / 软阴影 · 移动端流行', platform: 'mobile', popular: true },
    { id: 'clay', name: '黏土拟态', hint: '3D 软塑 / 饱和色 / 厚圆角 · 移动端', platform: 'mobile' },
    { id: 'brutal', name: '新粗野', hint: '高对比 / 硬边框 / 鲜艳色块 · 移动端潮牌风', platform: 'mobile' },
    { id: 'padflow', name: '平板双栏', hint: '侧栏 + 内容 / 大触控目标 · 平板优先', platform: 'tablet' },
  ]
  const themeOf = (id: string): { id: string; name: string; hint: string; platform: string; popular?: boolean } =>
    PRODUCT_STYLES.find(t => t.id === id) ?? PRODUCT_STYLES[0]
  /** 主题设计令牌：写进提示词，约束 AI 产出与本地渲染一致的视觉 */
  function themeTokens(id: string): string {
    const tokens: Record<string, string> = {
      clean: 'bg:#f7f9fc surface:#fff text:#111827 muted:#5b6577 line:#e4e9f2 accent:#2563eb radius:10px shadow:轻',
      neo: 'bg:#e8ebf0 surface:#eef1f6 text:#2b3340 accent:#4f6bed 双层柔和阴影（外深内亮） radius:16px 无硬边框',
      glass: 'bg:#0c1222 深色渐变 surface:rgba(255,255,255,.06) backdrop-blur:14px text:#eef4ff accent:#7aa2ff 半透明卡片细边框',
      editorial: 'bg:#f6f1e7 surface:#fbf7ef 衬线标题（Georgia/宋体）强网格 text:#1f1b16 accent:#c2410c',
      dashboard: 'bg:#0f172a surface:#1e293b card:#16233a text:#e2e8f0 accent:#38bdf8 辅助:紫#a78bfa/绿#34d399 细边框 radius:12px 数据可视化感',
      bento: '多色卡片块（#fff/#fde68a/#bfdbfe/#bbf7d0 交错）大圆角 20px 非对称栅格 text:#111827 强留白 大标题',
      tech: 'bg:#0a0f1a surface:#111827 text:#d1fae5 accent:#22d3ee 等宽字体点缀 网格线背景 细线描边 radius:4-8px',
      aurora: '极光渐变背景（#667eea→#764ba2→#f093fb 135deg）毛玻璃卡片 text:#fff accent:#f472b6 大圆角 20px',
      cream: 'bg:#faf6f1 surface:#fff text:#3d3128 accent:#e07a5f 大字重标题 软阴影（0 8px 24px rgba(0,0,0,.06)） radius:18px 温暖感',
      clay: '3D 软塑：bg:#f0f4ff 饱和色块（#ffd166/#06d6a0/#4cc9f0）厚圆角 24px 内外阴影组合 text:#1d2b53',
      brutal: '高对比：bg:#fff 硬边框 3px solid #000 鲜艳色块（#ff6b6b/#ffd93d/#6bcB77）offset 阴影 4px 4px 0 #000 粗体无衬线',
      padflow: '侧栏 280px + 内容区双栏 bg:#f8fafc surface:#fff accent:#0ea5e9 大触控目标（按钮高 ≥44px） radius:12px',
    }
    return tokens[id] ?? tokens.clean
  }
  function productOf(id: string | null | undefined): Product | undefined {
    return products.find(p => p.id === id)
  }
  /** 当前导图的 v2 图（旧数据就地转换）；「全部导图」时退回产品镜像（旧版单导图）。 */
  function mapGraph(): ProductMapGraph {
    const map = activeMap()
    if (map !== undefined) {
      if (map.graph !== undefined && Array.isArray(map.graph.nodes)) return map.graph
      return productGraphFromV1(map.mindmap || '{"nodes":[]}', map.name).graph
    }
    const product = productOf(productSelected)
    return productGraphFromV1(product?.mindmap || '{"nodes":[]}', product?.name ?? '产品').graph
  }
  function productNodes(_product?: Product | undefined): ProductNode[] {
    return mapGraph().nodes
  }
  function productNodeById(_product: Product | undefined, id: string | null | undefined): ProductNode | undefined {
    if (!id) return undefined
    return mapGraph().nodes.find(n => n.id === id)
  }
  function productFeatureNodes(_product?: Product | undefined): ProductNode[] {
    return productNodes().filter(n => n.kind !== 'root')
  }
  function productDefaultPicked(_product?: Product | undefined): Set<string> {
    return new Set(productFeatureNodes().filter(n => n.kind === 'feature').map(n => n.id))
  }
  function productSelectedFeatures(product: Product | undefined): ProductNode[] {
    return productFeatureNodes(product).filter(n => productPicked.has(n.id))
  }
  /** 当前作用域内（选中导图 / 全部导图）的笔记。 */
  function productNoteList(product: Product | undefined): Note[] {
    if (!product) return []
    const list = notes.filter(n => n.notebookId === product.notebookId)
    if (productMapScopeAll || productMapSelected === '') return list
    return list.filter(note => note.mapId === undefined || note.mapId === '' || note.mapId === productMapSelected)
  }
  function productDemoList(product: Product | undefined): ProductDemo[] {
    if (!product) return []
    const list = productDemos.filter(d => d.productId === product.id)
    if (productMapScopeAll || productMapSelected === '') return list
    return list.filter(demo => demo.mapId === undefined || demo.mapId === '' || demo.mapId === productMapSelected)
  }
  function productModuleList(product: Product | undefined): Module[] {
    if (!product) return []
    const list = productModules.filter(m => m.productId === product.id)
    if (productMapScopeAll || productMapSelected === '') return list
    return list.filter(m => m.mapId === undefined || m.mapId === '' || m.mapId === productMapSelected)
  }
  function scopedLabel(): string {
    if (productMapScopeAll || productMapSelected === '') return '全部导图'
    return activeMap()?.name ?? '当前导图'
  }
  /* ------------------------------ 画布：mind-elixir（编辑）/ ECharts（关系） ------------------------------ */
  function escapeAttr(value: string): string { return esc(value) }

  async function loadVendorScript(src: string, id: string): Promise<void> {
    const exists = document.getElementById(id) as HTMLScriptElement | null
    if (exists !== null) {
      if (exists.dataset.loaded === '1') return
      await new Promise<void>((resolve, reject) => {
        exists.addEventListener('load', () => resolve(), { once: true })
        exists.addEventListener('error', () => reject(new Error('加载失败')), { once: true })
      })
      return
    }
    await new Promise<void>((resolve, reject) => {
      const el = document.createElement('script')
      el.id = id
      el.src = src
      el.async = true
      el.onload = () => { el.dataset.loaded = '1'; resolve() }
      el.onerror = () => reject(new Error(`加载失败：${src}`))
      document.head.appendChild(el)
    })
  }

  /** mind-elixir 的 data-nodeid 可能带 me 前缀，按「精确命中优先、去前缀次之」还原图 id。 */
  function productGraphIdOf(raw: string): string {
    if (raw === '') return ''
    const graph = mapGraph()
    if (graph.nodes.some(n => n.id === raw)) return raw
    if (raw.startsWith('me') && graph.nodes.some(n => n.id === raw.slice(2))) return raw.slice(2)
    return raw
  }

  function renderProductMap(_product: Product): string {
    const preview = productMapPreview
    const banner = preview === null ? '' : `<div class="pm-preview-bar"><b>只读预览 v${preview.seq} · ${esc(preview.label)}</b><span>${esc(preview.summary || preview.source)} · ${preview.nodeCount} 节点</span>
      <button class="btn tiny" data-act="pm-version-rollback" data-id="${preview.id}">回滚到此版本</button>
      <button class="btn tiny" data-act="pm-version-delete" data-id="${preview.id}">删除此版本</button>
      <button class="btn tiny" data-act="pm-version-back">退出预览</button></div>`
    return `${banner}<div class="pm-plot-wrap"><div id="pm-plot" class="pm-plot"></div></div>`
  }

  /** 等容器拿到真实尺寸（最多 10 帧），避免 mind-elixir 按 0 宽初始化成乱图。 */
  function waitForPlotSize(el: HTMLElement): Promise<void> {
    return new Promise(resolve => {
      let frames = 0
      const tick = (): void => {
        if (el.clientWidth > 40 && el.clientHeight > 40) { resolve(); return }
        frames += 1
        if (frames >= 10) { resolve(); return }
        window.requestAnimationFrame(tick)
      }
      window.requestAnimationFrame(tick)
    })
  }

  function disposeProductEngines(): void {
    if (productMind !== null) { try { productMind.destroy() } catch { /* ignore */ } productMind = null }
    if (productChart !== null) { try { productChart.dispose() } catch { /* ignore */ } productChart = null }
  }

  /** 挂载画布：每次渲染后调用（renderContent 会重建 DOM，实例必须跟着重建）。 */
  async function mountProductCanvas(): Promise<void> {
    const target = $id('pm-plot')
    if (target === null) return
    disposeProductEngines()
    const preview = productMapPreview
    if (preview !== null || productMapEngine === 'force') {
      await renderProductForce(target, preview?.graph ?? mapGraph())
      return
    }
    await renderProductTree(target)
  }

  async function renderProductTree(target: HTMLElement): Promise<void> {
    if (productMindLoading === null) {
      productMindLoading = (async () => {
        await loadVendorScript(`${API}/assets/vendor/mind-elixir/MindElixir.iife.js`, 'dsh-wb-mind-elixir')
        if (shadow.getElementById('dsh-wb-mind-css') === null) {
          const link = document.createElement('link')
          link.id = 'dsh-wb-mind-css'
          link.rel = 'stylesheet'
          link.href = `${API}/assets/vendor/mind-elixir/MindElixir.css`
          shadow.appendChild(link)
        }
      })()
    }
    try { await productMindLoading } catch (cause) {
      console.warn('[dsh-workbench] 导图编辑器加载失败：', cause)
      target.innerHTML = '<div class="notes-empty small">导图编辑器（mind-elixir）加载失败，请刷新重试。</div>'
      return
    }
    const ns = (window as any).MindElixir
    const cls = ns?.default ?? ns
    if (typeof cls !== 'function') {
      target.innerHTML = '<div class="notes-empty small">mind-elixir 未就绪</div>'
      return
    }
    target.innerHTML = ''
    const container = document.createElement('div')
    container.className = 'pm-mind'
    container.style.cssText = 'width:100%;height:100%'
    target.appendChild(container)
    await waitForPlotSize(target)
    const dark = resolvedTheme() === 'dark'
    productMind = new cls({
      el: container,
      direction: cls.RIGHT,
      toolBar: false,
      keypress: true,
      contextMenu: false,
      overflowHidden: false,
      theme: dark ? cls.DARK_THEME : cls.THEME,
    })
    productMind.init(toMindElixir(mapGraph()))
    try { productMind.toCenter?.() } catch { /* 旧版本没有 toCenter */ }
    productMind.bus.addListener('operation', () => scheduleProductMindSync())
    /* 选中态与我们的 productNodeSelected 同步：否则工具栏「编辑/删除节点」在看不见选中时就会动手 */
    target.addEventListener('click', event => {
      const nodeEl = (event.target as Element | null)?.closest('[data-nodeid]') as HTMLElement | null
      if (nodeEl === null) return
      const id = productGraphIdOf(nodeEl.getAttribute('data-nodeid') ?? '')
      if (id === '' || id === productNodeSelected) return
      productNodeSelected = id
      renderSelectionBar()
    }, true)
    renderSelectionBar()
  }

  /** 工具栏下方的「已选」提示条：让选中状态可见，避免隐形选中后误删。 */
  function renderSelectionBar(): void {
    const host = $id('pm-plot')?.parentElement
    if (host === null || host === undefined) return
    const existing = host.querySelector('.pm-selection-bar')
    const node = productNodeById(undefined, productNodeSelected)
    if (node === undefined) {
      existing?.remove()
      return
    }
    const text = `<span>已选</span><b>${kindLabel(node.kind)} · ${esc(node.label)}</b>`
    if (existing !== null) {
      existing.innerHTML = `${text}<button class="icon-btn" data-act="pm-selection-clear" title="取消选中">✕</button>`
      return
    }
    const bar = document.createElement('div')
    bar.className = 'pm-selection-bar'
    bar.innerHTML = `${text}<button class="icon-btn" data-act="pm-selection-clear" title="取消选中">✕</button>`
    host.insertBefore(bar, host.firstChild)
  }

  async function renderProductForce(target: HTMLElement, graph: ProductMapGraph): Promise<void> {
    try { await loadVendorScript(`${API}/assets/vendor/echarts.min.js`, 'dsh-wb-echarts') } catch (cause) {
      console.warn('[dsh-workbench] 力导图引擎加载失败：', cause)
      target.innerHTML = '<div class="notes-empty small">关系图（ECharts）加载失败，请刷新重试。</div>'
      return
    }
    const ns = (window as any).echarts
    if (typeof ns?.init !== 'function') {
      target.innerHTML = '<div class="notes-empty small">ECharts 未就绪</div>'
      return
    }
    productChart = ns.init(target, null, { renderer: 'canvas' })
    /* 点击跨图引用伪节点 → 跳到目标导图并选中目标节点；点普通节点 → 选中并高亮 + 显示选中条
       （关系视图不支持结构编辑，但选中必须可见，否则工具栏「编辑/删除节点」会隐形动手）。 */
    productChart.on('click', (params: any) => {
      if (params?.dataType !== 'node' || typeof params.data?.id !== 'string' || productMapPreview !== null) return
      const id = String(params.data.id)
      const sep = id.indexOf(':')
      if (sep > 0) {
        const targetMap = id.slice(0, sep)
        const targetNode = id.slice(sep + 1)
        if (productMaps.some(m => m.id === targetMap)) {
          productMapSelected = targetMap
          productNodeSelected = targetNode
          productMapScopeAll = false
          void loadMapVersions().then(() => renderContent())
          toast('已跳到引用的导图')
        }
        return
      }
      productNodeSelected = id
      try { productChart.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex: params.dataIndex }) } catch { /* ignore */ }
      renderSelectionBar()
    })
    productChart.setOption(buildProductForceOption(graph, { dark: resolvedTheme() === 'dark' }), true)
    const legend = document.createElement('div')
    legend.className = 'pm-force-legend'
    legend.innerHTML = [...new Set(graph.nodes.map(n => n.kind))].map(kind =>
      `<span><i style="background:${PRODUCT_KIND_COLOR[kind]}"></i>${PRODUCT_KIND_LABEL[kind]}</span>`).join('')
      + (externalEdges(graph).length > 0 ? '<span><i class="ext"></i>跨图引用</span>' : '')
    target.appendChild(legend)
    const hint = document.createElement('div')
    hint.className = 'pm-force-hint'
    hint.textContent = '悬停高亮相邻 · 拖动节点 · 滚轮缩放 · 虚线 = 关联 / 跨图引用'
    target.appendChild(hint)
  }

  /* ---- 草稿保存（乐观并发 + 串行链；rev 冲突时以宿主草稿为准并提示） ---- */
  function persistProductGraph(): Promise<void> {
    const map = activeMap()
    if (map === undefined) return Promise.resolve()
    productPersistChain = productPersistChain.then(() => sendMapDraft(map))
    return productPersistChain
  }
  async function sendMapDraft(map: ProductMap): Promise<void> {
    try {
      const res = await fetch(`${API}/products/maps/draft`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mapId: map.id, graph: map.graph, rev: map.graphRev }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (res.status === 409 && data.current) {
        Object.assign(map, data.current)
        toast('导图已在别处更新，已重新载入')
        renderContent()
        return
      }
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      map.graphRev = Number(data.rev ?? map.graphRev)
      if (data.map) Object.assign(map, data.map)
    } catch (cause) {
      toast(`导图保存失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  /** mind-elixir 编辑防抖同步：结构/文案变化 → 回写图 → 落草稿。 */
  function scheduleProductMindSync(): void {
    if (productMindSyncTimer !== 0) window.clearTimeout(productMindSyncTimer)
    productMindSyncTimer = window.setTimeout(() => {
      productMindSyncTimer = 0
      if (productMind === null) return
      const map = activeMap()
      if (map === undefined || productMapPreview !== null) return
      try {
        const data = productMind.getData()
        map.graph = fromMindElixir(data, map.graph)
        void persistProductGraph()
      } catch (cause) {
        console.warn('[dsh-workbench] 导图同步失败', cause)
      }
    }, 450)
  }
  function renderProduct(): string {
    const product = productOf(productSelected)
    const header = `<div class="view-head"><div><div class="eyebrow">产品设计</div><h1 class="page-title">产品</h1>
      <div class="page-sub">导图记录功能，AI 生成设计笔记与多风格 Demo；产物保存到关联工作区</div><div class="head-pills"><span><b>${products.length}</b> 产品</span><span><b>${productModules.length}</b> 模块</span><span><b>${productDemos.length}</b> Demo</span></div></div>
      <div style="display:flex;gap:6px"><button class="btn" data-act="ai-dispatch" data-kind="product">${ic('spark', 13)}AI 协同</button><button class="btn-primary" data-act="product-new">${ic('plus', 14)}新建产品</button></div></div>`
    if (productError !== '') {
      return header + `<div class="news-banner">${ic('flag', 13)}<span>产品读取失败：${esc(productError)}</span><button class="btn" data-act="product-refresh">重试</button></div>`
    }
    if (products.length === 0) {
      return header + `<div class="notes-empty bug-empty"><div class="ne-icon">${ic('product', 22)}</div><b>还没有产品项目</b><span>创建一个产品并关联工作区，用导图梳理功能，再让 AI 生成设计笔记和 Demo。</span><button class="btn-primary" data-act="product-new">${ic('plus', 14)}新建产品</button></div>`
    }
    if (!product) return header
    const toolbar = `<div class="product-toolbar">
      <select id="wb-product-select" class="bug-project-select"><option value="">选择产品…</option>${products.map(p => `<option value="${p.id}" ${p.id === product.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <button class="icon-btn" data-act="product-edit" title="编辑产品">${ic('edit', 14)}</button>
      <span class="product-ws">${ic('folder', 12)}${esc(product.workspacePath || '未关联工作区')}</span>
      <label class="pm-archived-toggle" title="显示已归档的产品/模块/文档"><input type="checkbox" id="wb-show-archived" ${showArchived ? 'checked' : ''}> 显示已归档</label>
      <button class="icon-btn" data-act="product-refresh" title="刷新">${ic('refresh', 14)}</button>
    </div>`
    const scopeSelect = productTab === 'map' || productMaps.length <= 1 ? '' : `<select id="wb-map-scope" class="bug-project-select" title="导图范围">
        <option value="all"${productMapScopeAll ? ' selected' : ''}>全部导图（${productMaps.length}）</option>
        ${productMaps.map(map => `<option value="${map.id}"${!productMapScopeAll && map.id === productMapSelected ? ' selected' : ''}>${esc(map.name)}</option>`).join('')}
      </select>`
    const tabs = `<div class="product-tabs">
      ${(['map', 'notes', 'modules', 'demo'] as const).map(tab => `<button class="${productTab === tab ? 'active' : ''}" data-act="product-tab" data-tab="${tab}">${tab === 'map' ? `思维导图（${productMaps.length}）` : tab === 'notes' ? `设计笔记（${productNoteList(product).length}）` : tab === 'modules' ? `模块（${productModuleList(product).length}）` : `Demo（${productDemoList(product).length}）`}</button>`).join('')}
      ${scopeSelect}
    </div>`
    let body = ''
    if (productTab === 'map') {
      const rail = `<aside class="pm-maps">
        <div class="pm-maps-head"><b>导图</b><span>${productMaps.length}</span><button class="icon-btn" data-act="pm-map-new" title="新建导图（自建 / 导入 / 从灵感）">${ic('plus', 13)}</button></div>
        ${productMaps.length === 0 ? `<div class="pm-maps-empty">${productMapsReady ? '还没有导图，点 + 新建（自建 / 导入大纲 / 从灵感选择）' : '多导图不可用（宿主未更新）'}</div>` : productMaps.map(map => `<div class="pm-map${map.id === productMapSelected ? ' active' : ''}" data-act="pm-map-select" data-id="${map.id}" title="${esc(map.description || map.name)}">
          <b>${esc(map.name)}</b><small>${mapNodeCount(map)} 节点 · ${productNoteListOfMap(map.id).length} 笔记 · ${mapVersionSeq(map)}${mapRefCount(map) === '' ? '' : ` · ${mapRefCount(map)}`}</small>
          <small class="pm-map-src">${mapSourceLabel(map)}</small>
          <span class="pm-map-ops"><button class="icon-btn" data-act="pm-map-rename" data-id="${map.id}" title="重命名">${ic('edit', 11)}</button><button class="icon-btn" data-act="pm-map-delete" data-id="${map.id}" title="删除导图">${ic('trash', 11)}</button></span>
        </div>`).join('')}
        ${productMapSelected === '' ? '' : renderVersionPanel()}
      </aside>`
      const engineSeg = `<div class="mini-seg pm-engine-seg" title="画布引擎">
        <button data-act="pm-engine" data-mode="tree" class="${productMapEngine === 'tree' && productMapPreview === null ? 'active' : ''}">编辑</button>
        <button data-act="pm-engine" data-mode="force" class="${productMapEngine === 'force' && productMapPreview === null ? 'active' : ''}">关系</button>
      </div>`
      body = `<div class="pm-map-wrap">${rail}<div class="pm-map-main"><div class="product-map-toolbar">
        ${engineSeg}
        <input id="pm-search" class="pm-search" type="search" placeholder="搜索节点…" title="回车跳到第一个命中节点">
        <span class="pm-sep"></span>
        <button class="btn" data-act="product-node-new" data-type="feature">${ic('plus', 12)}新增功能</button>
        <button class="btn" data-act="product-node-new" data-type="requirement">${ic('plus', 12)}新增需求</button>
        <button class="btn" data-act="product-node-child">${ic('corner', 12)}加子节点</button>
        <button class="btn" data-act="product-node-sibling">${ic('plus', 12)}加同级</button>
        <button class="btn" data-act="product-node-edit">${ic('edit', 12)}编辑节点</button>
        <button class="icon-btn" data-act="product-node-delete" title="删除节点（Del）">${ic('trash', 13)}</button>
        <span class="pm-sep"></span>
        <button class="icon-btn" data-act="pm-undo" title="撤销（Ctrl/⌘+Z）">↶</button>
        <button class="icon-btn" data-act="pm-redo" title="重做（Ctrl/⌘+Shift+Z）">↷</button>
        <span class="pm-sep"></span>
        <button class="btn" data-act="pm-version-archive">${ic('layers', 12)}存档版本</button>
        <button class="btn" data-act="pm-version-diff">版本对比</button>
        <span class="pm-sep"></span>
        <button class="btn" data-act="pm-export-outline">${ic('download', 12)}导出大纲</button>
        <button class="btn" data-act="pm-export-image">${ic('download', 12)}导出图片</button>
        <button class="btn" data-act="pm-ref-check">引用检查</button>
        <button class="btn" data-act="pm-import-outline">${ic('upload', 12)}导入大纲</button>
        <button class="btn" data-act="pm-import-idea">${ic('spark', 12)}从灵感导入</button>
        <span class="product-hint">${ic('folder', 11)} ${esc(productMapSelected !== '' ? `.dsh-workbench/products/${product.id}/maps/${productMapSelected}.json` : 'mindmap.json → ' + (product.workspacePath || '未关联工作区'))}</span>
      </div>${renderProductMap(product)}</div></div>`
    } else if (productTab === 'notes') {
      const featureNodes = productFeatureNodes(product)
      const picked = featureNodes.filter(n => productPicked.has(n.id))
      const cov = noteCoverage(product)
      const p = productProgress !== null && productProgress.productId === product.id && productProgress.kind === 'notes' ? productProgress : null
      const allNotes = productNoteList(product)
      /* 排序：按导图节点顺序（无关联的排后面），与导图结构对齐 */
      const orderOf = new Map(featureNodes.map((n, i) => [n.id, i]))
      const sortedNotes = allNotes.slice().sort((a, b) => {
        const ai = orderOf.get(noteNodeId(a)) ?? 9999
        const bi = orderOf.get(noteNodeId(b)) ?? 9999
        if (ai !== bi) return ai - bi
        return String(b.updatedAt).localeCompare(String(a.updatedAt))
      })
      const filteredNotes = noteFilterMissing ? sortedNotes.filter(n => noteNodeId(n) === '') : sortedNotes
      const coverLine = featureNodes.length === 0 ? '导图里还没有功能/需求节点'
        : `覆盖 ${cov.written.size}/${featureNodes.length} 个节点${cov.missing.length > 0 ? `，缺 ${cov.missing.length} 个` : '，已全部覆盖'}`
      body = `<div class="product-panel-head"><div><b>设计笔记</b><span>${esc(scopedLabel())} · ${coverLine}${picked.length > 0 ? ` · 已勾选 ${picked.length} 个（生成将覆盖勾选项）` : ''}</span></div><div class="product-actions">
        <button class="btn" data-act="pipeline-open">${ic('spark', 12)}设计流水线</button>
        <button class="btn" data-act="product-note-new">${ic('plus', 12)}写笔记</button>
        <button class="btn" data-act="flow-gen-tests">${ic('arrowR', 12)}生成测试用例</button>
        <button class="btn-primary" data-act="product-gen-notes">${ic('spark', 12)}AI 生成设计笔记</button>
      </div></div>
      ${p !== null ? renderProductProgressBar(p) : ''}
      ${featureNodes.length === 0 ? '' : `<div class="note-coverage">
        <div class="note-coverage-bar"><i style="width:${featureNodes.length > 0 ? Math.round(cov.written.size / featureNodes.length * 100) : 0}%"></i></div>
        <div class="note-coverage-meta"><span>已写 ${cov.written.size}</span><span>缺失 ${cov.missing.length}</span>
          ${cov.missing.length > 0 ? `<button class="btn tiny" data-act="product-note-pick-missing">勾选缺失 ${cov.missing.length} 个</button>` : ''}
        </div>
      </div>`}
      <div class="note-cover-grid">${featureNodes.map(n => {
        const note = noteOfNode(n.id, allNotes)
        return `<div class="note-cover-chip${note !== undefined ? ' done' : ''}" data-act="${note !== undefined ? 'product-note-open' : 'product-note-new-node'}" data-id="${note?.id ?? n.id}" title="${note !== undefined ? `已写：${esc(note.title)}` : '点此写这篇笔记'}">
          <span class="dot"></span>${esc(n.label)}
        </div>`
      }).join('')}</div>
      <div class="product-pick-list">${featureNodes.map(n => `<label><input type="checkbox" data-act="product-pick" data-id="${n.id}" ${productPicked.has(n.id) ? 'checked' : ''}> ${esc(n.label)}</label>`).join('') || '<span class="muted">先添加功能节点</span>'}</div>
      <div class="note-doc-summary">
        <span>业务模块设计 <b>${allNotes.filter(n => n.kind === 'module_design').length}</b></span>
        <span>产品设计 <b>${allNotes.filter(n => n.kind === 'product_design').length}</b></span>
        <span>功能设计 <b>${allNotes.filter(n => n.kind === 'feature_design').length}</b></span>
        <span>普通笔记 <b>${allNotes.filter(n => !n.kind).length}</b></span>
      </div>
      <div class="note-filters">
        <button class="btn tiny ${noteFilterMissing ? 'solid' : ''}" data-act="product-note-filter-missing">只看未关联</button>
        ${pipelineRemaining.length > 0 && !pipelineRunning ? `<button class="btn tiny solid" data-act="pipeline-next">继续下一步（${stageLabel(pipelineRemaining[0])}）</button>` : ''}
        ${pipelineRunning ? '<span class="note-pipeline-running">流水线执行中…</span>' : ''}
        <span class="note-filter-count">${filteredNotes.length} 篇</span>
      </div>
      <div class="product-note-list">${filteredNotes.map(note => renderNoteCard(note, featureNodes)).join('') || `<div class="notes-empty small">${noteFilterMissing ? '没有未关联节点的笔记' : '还没有设计笔记：点「写笔记」自己写，或让 AI 按导图逐节点生成。'}</div>`}</div>
      <div id="product-chat" class="product-chat"></div>`
    } else if (productTab === 'modules') {
      const mods = productModuleList(product)
      const kindName = (k: Module['kind']): string => k === 'module' ? '模块' : k === 'business' ? '业务' : k === 'feature' ? '功能' : '需求'
      const p = productProgress !== null && productProgress.productId === product.id && productProgress.kind === 'modules' ? productProgress : null
      /* 树形渲染：按 parentId 组装（parentId 为空或指向不存在节点 → 顶层） */
      const byParent = new Map<string, Module[]>()
      const ids = new Set(mods.map(m => m.id))
      for (const m of mods) {
        const key = m.parentId !== '' && ids.has(m.parentId) ? m.parentId : ''
        const list = byParent.get(key) ?? []
        list.push(m)
        byParent.set(key, list)
      }
      const kindRank: Record<string, number> = { module: 0, business: 1, feature: 2, requirement: 3 }
      const sorted = (list: Module[]): Module[] => list.slice().sort((a, b) => (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, 'zh-CN'))
      const card = (m: Module, depth: number): string => `<div class="module-row" style="padding-left:${8 + depth * 16}px">
        <div class="module-card ${m.kind}" data-act="product-module-detail" data-id="${m.id}" title="${esc(m.name)}">
          <div><span class="module-kind">${kindName(m.kind)}</span><b>${esc(m.name)}</b><i class="platform ${m.platform}">${m.platform.toUpperCase()}</i>
            ${m.nodeId !== undefined && m.nodeId !== '' ? '<i class="module-linked" title="已关联导图节点">◆ 导图</i>' : ''}</div>
          <p>${esc(m.description || '待补充模块说明')}</p><small>${esc(m.status)}${m.noteId ? ' · 已关联笔记' : ''}</small>
        </div>
        <span class="module-ops">
          <button class="icon-btn" data-act="product-module-edit" data-id="${m.id}" title="编辑">${ic('edit', 11)}</button>
          <button class="icon-btn" data-act="product-module-add" data-id="${m.id}" title="添加子项">${ic('plus', 11)}</button>
          <button class="icon-btn" data-act="archive-toggle" data-target="modules" data-id="${m.id}" data-archived="${m.archivedAt ? '1' : ''}" title="${m.archivedAt ? '取消归档' : '归档'}">${m.archivedAt ? '↩' : '⌸'}</button>
          <button class="icon-btn" data-act="product-module-delete" data-id="${m.id}" title="删除">${ic('trash', 11)}</button>
        </span>
      </div>`
      const renderTree = (parent: string, depth: number): string =>
        sorted(byParent.get(parent) ?? []).map(m => card(m, depth) + renderTree(m.id, depth + 1)).join('')
      const tree = renderTree('', 0)
      const filterKind = moduleFilterKind
      const filterPlatform = moduleFilterPlatform
      const filtered = mods.filter(m =>
        (filterKind === '' || m.kind === filterKind) && (filterPlatform === '' || m.platform === filterPlatform))
      body = `<div class="product-panel-head"><div><b>模块 / 业务 / 功能 / 需求</b><span>${esc(scopedLabel())} · ${mods.length} 个节点；可手工增删改，也可让 AI 按导图拆分并生成设计笔记</span></div><div class="product-actions">
        <button class="btn" data-act="product-module-new">${ic('plus', 12)}新建模块</button>
        <button class="btn-primary" data-act="product-gen-modules">${ic('spark', 12)}AI 生成模块与详细设计</button>
      </div></div>
      ${p !== null ? renderProductProgressBar(p) : ''}
      <div class="module-coverage"><b>${mods.length}</b> 节点${['all','pc','mobile','tablet'].map(pl => `<span>${platformLabel(pl)} ${mods.filter(m => m.platform === pl).length}</span>`).join('')}<span class="bar">${['all','pc','mobile','tablet'].map((pl, i) => `<i style="width:${mods.length ? Math.round(mods.filter(m => m.platform === pl).length / mods.length * 100) : 0}%;background:${['var(--accent)','var(--green)','var(--orange)','var(--amber)'][i]}"></i>`).join('')}</span></div>
      <div class="module-filters">
        <select id="wb-mod-kind" class="notes-nb-select"><option value="">全部类型</option>${(['module','business','feature','requirement'] as const).map(k => `<option value="${k}" ${filterKind === k ? 'selected' : ''}>${kindName(k)}</option>`).join('')}</select>
        <select id="wb-mod-platform" class="notes-nb-select"><option value="">全部端</option>${(['pc','mobile','tablet','all'] as const).map(pl => `<option value="${pl}" ${filterPlatform === pl ? 'selected' : ''}>${platformLabel(pl)}</option>`).join('')}</select>
        ${filterKind !== '' || filterPlatform !== '' ? `<button class="btn tiny" data-act="product-module-filter-clear">清除筛选</button>` : ''}
        <span class="module-filter-count">${filtered.length === mods.length ? '' : `筛出 ${filtered.length} / ${mods.length}`}</span>
      </div>
      ${mods.length === 0
        ? '<div class="notes-empty small">还没有模块。点「新建模块」手工添加，或让 AI 按导图拆分并逐模块生成设计笔记。</div>'
        : (filterKind === '' && filterPlatform === '' ? `<div class="module-tree">${tree}</div>`
          : `<div class="module-grid">${filtered.map(m => `<div class="module-card ${m.kind}" data-act="product-module-detail" data-id="${m.id}" title="${esc(m.name)}"><div><span class="module-kind">${kindName(m.kind)}</span><b>${esc(m.name)}</b><i class="platform ${m.platform}">${m.platform.toUpperCase()}</i></div><p>${esc(m.description || '待补充模块说明')}</p><small>${esc(m.status)}${m.noteId ? ' · 已关联笔记' : ''}</small></div>`).join('')}</div>`)}
      <div id="product-chat" class="product-chat"></div>`
    } else {
      const demos = productDemoList(product)
      const current = demos.find(d => d.id === productDemoSelected) ?? demos[0]
      const themeOptions = (group: 'pc' | 'mobile' | 'tablet' | 'all'): string =>
        PRODUCT_STYLES.filter(t => group === 'all' ? t.platform === 'all' : t.platform === group || t.platform === 'all')
          .map(t => `<option value="${t.id}" ${productStyle === t.id ? 'selected' : ''}>${t.name}${t.popular ? ' · 流行' : ''}</option>`).join('')
      const prog = demoProgress && demoProgress.productId === product.id && demoProgress.updatedAt !== demoProgressDismissedAt ? demoProgress : null
      body = `<div class="product-panel-head"><div><b>产品 Demo</b><span>来源：设计笔记 + 灵感 · 单页 / 产品系统 · ${platformLabel(productPlatform)} · ${themeOf(productStyle).name}</span></div><div class="product-actions">
        <select id="wb-product-platform" class="notes-nb-select" title="目标端"><option value="all" ${productPlatform === 'all' ? 'selected' : ''}>自适应</option><option value="pc" ${productPlatform === 'pc' ? 'selected' : ''}>PC</option><option value="mobile" ${productPlatform === 'mobile' ? 'selected' : ''}>移动端</option><option value="tablet" ${productPlatform === 'tablet' ? 'selected' : ''}>平板</option></select>
        <select id="wb-product-kind" class="notes-nb-select" title="Demo 形态"><option value="page" ${productDemoKind === 'page' ? 'selected' : ''}>单页面</option><option value="system" ${productDemoKind === 'system' ? 'selected' : ''}>产品系统（多页）</option></select>
        <select id="wb-product-style" class="notes-nb-select" title="UI 主题"><optgroup label="通用">${themeOptions('all')}</optgroup><optgroup label="PC 主题">${themeOptions('pc')}</optgroup><optgroup label="移动端主题">${themeOptions('mobile')}</optgroup><optgroup label="平板主题">${themeOptions('tablet')}</optgroup></select>
        <button class="btn" data-act="product-gen-demo-ai">${ic('spark', 12)}AI 深度生成</button>
        <button class="btn-primary" data-act="product-gen-demo" data-scope="all">${ic('play', 12)}快速渲染</button>
        ${productSelectedFeatures(product).length > 0 ? `<button class="btn" data-act="product-gen-demo" data-scope="feature" title="为每个勾选的功能/需求各生成一个 Demo">${ic('play', 12)}按勾选渲染（${productSelectedFeatures(product).length}）</button>` : ''}
      </div></div>
      ${prog ? `<div class="demo-progress ${prog.status}"><div class="demo-progress-head"><b>生成进度</b><span>${prog.status === 'running' ? `${prog.step}/${prog.total} · ${esc(prog.message)}` : prog.status === 'done' ? `已完成 · ${esc(prog.message)}` : `失败 · ${esc(prog.message)}`}</span><button class="icon-btn" data-act="demo-progress-clear" title="关闭">✕</button></div><div class="demo-progress-bar"><i style="width:${prog.total > 0 ? Math.min(100, Math.round(prog.step / prog.total * 100)) : prog.status === 'done' ? 100 : 8}%"></i></div>${prog.log.length > 0 ? `<div class="demo-progress-log">${prog.log.slice(-5).map(l => `<div><i>${(l.at ?? '').slice(11, 16)}</i>${esc(l.message)}</div>`).join('')}</div>` : ''}</div>` : ''}
        <div class="product-demo-layout"><div class="product-demo-list">${demos.map(d => `<div class="product-demo-row${current?.id === d.id ? ' active' : ''}" data-product-demo="${d.id}"><b>${esc(d.title)}</b><span>${themeOf(d.style).name} · ${d.kind === 'system' ? '产品系统' : '单页'} · ${platformLabel(d.platform ?? 'all')} · ${d.createdAt.slice(5, 16)}</span><button class="icon-btn" data-act="product-demo-delete" data-id="${d.id}" title="删除 Demo">${ic('trash', 11)}</button></div>`).join('') || '<div class="notes-empty small">还没有 Demo：「快速渲染」本地即时生成，或「AI 深度生成」结合灵感做出可交互原型。</div>'}</div><div class="product-demo-preview">${current ? `<div class="demo-viewport-bar">${(['pc', 'tablet', 'mobile'] as const).map(v => `<button class="${demoViewport === v ? 'on' : ''}" data-act="demo-viewport" data-v="${v}">${v === 'pc' ? 'PC' : v === 'tablet' ? '平板' : '移动'}</button>`).join('')}<span>${esc(themeOf(current.style).hint)}</span></div><iframe class="demo-frame demo-frame-${demoViewport}" sandbox="allow-scripts allow-forms allow-modals" src="${API}/products/demo?id=${encodeURIComponent(current.id)}&v=${encodeURIComponent(current.createdAt)}" title="产品 Demo"></iframe>` : '<div class="notes-empty small">生成后在这里预览</div>'}</div></div>`
    }
    return header + toolbar + tabs + body
  }
  async function loadProductMaps(): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) { productMaps = []; productMapSelected = ''; return }
    try {
      const res = await fetch(`${API}/products/maps?productId=${encodeURIComponent(product.id)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { maps?: ProductMap[] }
      productMaps = Array.isArray(data.maps) ? data.maps : []
      productMapsReady = true
    } catch (cause) {
      productMaps = []
      productMapsReady = false
      console.warn('[dsh-workbench] 导图清单读取失败：', cause)
    }
    if (productMaps.length > 0 && !productMaps.some(map => map.id === productMapSelected)) {
      productMapSelected = productMaps[0].id
    }
    if (productMaps.length === 0) productMapSelected = ''
    if (productMapPreview !== null && productMapPreview.mapId !== productMapSelected) productMapPreview = null
    await loadMapVersions()
  }
  /** 当前导图；'' 表示「全部导图」。 */
  function activeMap(): ProductMap | undefined {
    return productMapSelected === '' ? undefined : productMaps.find(map => map.id === productMapSelected)
  }
  /** 导图 JSON（v2 图）：AI 提示词与导入导出统一用它。 */
  function mapMindmap(): string {
    return JSON.stringify(mapGraph())
  }
  function mapScopeId(): string { return productMapSelected }
  function mapScoped<T extends { mapId?: string }>(items: T[]): T[] {
    if (productMapSelected === '') return items
    return items.filter(item => item.mapId === undefined || item.mapId === '' || item.mapId === productMapSelected)
  }
  /** 某张导图下的产品笔记数（用于导图清单副标题）。 */
  function productNoteListOfMap(mapId: string): Note[] {
    const product = productOf(productSelected)
    if (product === undefined) return []
    return notes.filter(n => n.notebookId === product.notebookId && n.mapId === mapId)
  }
  function mapNodeCount(map: ProductMap): number {
    if (map.graph !== undefined && Array.isArray(map.graph.nodes)) return map.graph.nodes.length
    try {
      const parsed = JSON.parse(map.mindmap || '{"nodes":[]}') as { nodes?: unknown[] }
      return Array.isArray(parsed.nodes) ? parsed.nodes.length : 0
    } catch { return 0 }
  }
  /** 导图卡片的版本徽标。 */
  function mapVersionSeq(map: ProductMap): string {
    const seq = productMapVersions.find(v => v.mapId === map.id && v.id === map.currentVersionId)?.seq
    if (seq !== undefined) return `v${seq}`
    return map.currentVersionId !== undefined && map.currentVersionId !== '' ? '已存档' : '无版本'
  }
  function mapSourceLabel(map: ProductMap): string {
    if (map.source === 'idea') return `灵感导入${map.sourceRef ? ` · ${map.sourceRef.slice(0, 18)}` : ''}`
    if (map.source === 'outline') return '大纲导入'
    if (map.source === 'ai') return 'AI 生成'
    return '自建'
  }
  /** 跨图引用计数：引用 = 本图指向他图；被引用 = 他图指向本图（「互为补充」的量化）。 */
  function mapRefCount(map: ProductMap): string {
    const graph = map.graph
    if (graph === undefined || !Array.isArray(graph.edges)) return ''
    const out = externalEdges(graph).length
    let inbound = 0
    for (const other of productMaps) {
      if (other.id === map.id || other.graph === undefined || !Array.isArray(other.graph.edges)) continue
      inbound += externalEdges(other.graph).filter(e => String(e.to).startsWith(`${map.id}:`)).length
    }
    return out === 0 && inbound === 0 ? '' : `引用 ${out} · 被引用 ${inbound}`
  }
  function mapSourceText(source: string): string {
    return source === 'idea' ? '灵感导入' : source === 'outline' ? '大纲导入' : source === 'ai' ? 'AI'
      : source === 'rollback' ? '回滚' : source === 'migration' ? '迁移' : '手工'
  }
  /** 版本面板（参照灵感右侧版本区：只读预览 / 回滚 / 删除）。 */
  function renderVersionPanel(): string {
    return `<div class="pm-versions">
      <div class="pm-maps-head"><b>版本</b><span>${productMapVersions.length}</span></div>
      ${productMapVersions.length === 0 ? '<div class="pm-maps-empty">「存档版本」后出现历史</div>' : productMapVersions.slice(0, productVersionLimit).map(v => `<div class="pm-version${productMapPreview?.id === v.id ? ' active' : ''}">
        <b>v${v.seq} · ${esc(v.label)}</b><small>${mapSourceText(v.source)} · ${v.nodeCount} 节点 · ${(v.createdAt ?? '').slice(5, 16)}</small>
        <span class="pm-map-ops">
          <button class="icon-btn" data-act="pm-version-preview" data-id="${v.id}" title="只读预览">${ic('play', 11)}</button>
          <button class="icon-btn" data-act="pm-version-rollback" data-id="${v.id}" title="回滚到此版本">${ic('refresh', 11)}</button>
          <button class="icon-btn" data-act="pm-version-delete" data-id="${v.id}" title="删除版本">${ic('trash', 11)}</button>
        </span>
      </div>`).join('')}
      ${productMapVersions.length > productVersionLimit ? `<button class="btn tiny pm-version-more" data-act="pm-version-more">再显示 ${Math.min(20, productMapVersions.length - productVersionLimit)} 个（共 ${productMapVersions.length}）</button>` : ''}
    </div>`
  }
  /** 拉取当前导图的版本序列。 */
  async function loadMapVersions(): Promise<void> {
    if (productMapSelected === '') { productMapVersions = []; return }
    try {
      const res = await fetch(`${API}/products/maps/versions?mapId=${encodeURIComponent(productMapSelected)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { versions?: ProductMapVersion[] }
      productMapVersions = Array.isArray(data.versions) ? data.versions : []
    } catch (cause) {
      productMapVersions = []
      console.warn('[dsh-workbench] 版本清单读取失败：', cause)
    }
  }

  async function loadProducts(silent = false): Promise<void> {
    if (productLoading) return
    productLoading = true
    if (!silent) { productError = ''; if (ui.view === 'product') renderContent() }
    try {
      const suffix = showArchived ? '?archived=1' : ''
      const [pRes, nRes] = await Promise.all([fetch(`${API}/products${suffix}`), fetch(`${API}/notes${suffix}`)])
      if (!pRes.ok || !nRes.ok) throw new Error(`HTTP ${pRes.status}/${nRes.status}`)
      const pData = await pRes.json() as { products?: Product[]; demos?: ProductDemo[]; modules?: Module[] }
      const nData = await nRes.json() as { notes?: Note[]; notebooks?: Notebook[] }
      products = Array.isArray(pData.products) ? pData.products : []
      productDemos = Array.isArray(pData.demos) ? pData.demos : []
      productModules = Array.isArray(pData.modules) ? pData.modules : []
      notes = Array.isArray(nData.notes) ? nData.notes : notes
      notebooks = Array.isArray(nData.notebooks) ? nData.notebooks : notebooks
      if (productSelected === null || productOf(productSelected) === undefined) productSelected = products[0]?.id ?? null
      await loadProductMaps()
      const product = productOf(productSelected)
      if (product && productPicked.size === 0) productPicked = productDefaultPicked(product)
      // Demo 进度（失败不阻塞主数据）
      try {
        const gRes = await fetch(`${API}/products/demo-progress?productId=${encodeURIComponent(productSelected ?? '')}`)
        if (gRes.ok) {
          const gData = await gRes.json() as { progress?: DemoProgress | null }
          demoProgress = gData.progress ?? null
        }
      } catch { /* 进度拉取失败不影响主流程 */ }
      productError = ''
    } catch (cause) { if (!silent) productError = String((cause as Error).message ?? cause) }
    productLoading = false
    if (ui.view !== 'product') return
    const sig = JSON.stringify({
      p: products.map(p => [p.id, p.name, p.updatedAt, p.mindmap.length]),
      d: productDemos.map(d => [d.id, d.createdAt]),
      n: notes.length,
      g: [demoProgress?.step, demoProgress?.status, demoProgress?.message],
    })
    if (!silent || sig !== productSig) {
      productSig = sig
      if (($id('wb-modal')?.innerHTML ?? '') === '') renderContent()
    }
  }
  function productPrompt(product: Product, mode: 'notes' | 'demo' | 'modules', scope: 'all' | 'feature', opts?: { kind?: 'page' | 'system'; platform?: string }): string {
    const nodes = productNodes(product)
    const picked = productSelectedFeatures(product)
    const focus = scope === 'feature' ? picked : productFeatureNodes(product)
    const features = focus.map(n => `- ${n.id} [${kindLabel(n.kind)}] ${n.label}`).join('\n')
    const theme = themeOf(productStyle)
    const kind = opts?.kind ?? 'page'
    const platform = opts?.platform ?? 'all'
    const map = activeMap()
    const mapId = productMapSelected
    const mapLine = map === undefined
      ? '导图：整产品（旧版单导图）'
      : `导图：${map.name}（mapId: ${map.id}）${map.description ? ` — ${map.description}` : ''}\n同一产品可有多张导图，本次只处理这一张，写入时必须带 mapId:"${map.id}"。`
    const mapArg = mapId === '' ? '' : `, mapId:"${mapId}"`
    const common = `产品：${product.name}\n简介：${product.description || '未填写'}\n工作区绝对路径：${product.workspacePath}\n产品 ID：${product.id}\n产品笔记本 ID：${product.notebookId}\n${mapLine}\n\n导图 JSON：\n${mapMindmap()}\n\n本次覆盖节点：\n${features || '- （整个产品）'}`
    if (mode === 'modules') {
      return `产品模块化与详细设计任务：${product.name}\n\n你是资深产品架构师。请把产品拆成「产品 → 模块 → 业务 → 功能 / 需求」，并为每个模块生成详细设计笔记。\n\n${common}\n\n要求：\n1. 先调用 workbench_module_publish 写模块/业务/功能/需求，参数 { productId:"${product.id}"${mapArg}, parentId:"父级模块 id（顶层留空）", nodeId:"可选，对应导图节点 id", name, kind:"module|business|feature|requirement", platform:"pc|mobile|tablet|all", description }。\n1b. **每个节点写完后立刻调用一次 product_progress_publish 上报进度**（step 递增、total=计划拆分的节点总数、status="running"、message="已写：模块名"），全部完成后 total 步 status="done"；失败时 status="failed" 并写明原因。\n2. 每个模块调用 workbench_product_note_publish 生成详细设计笔记，参数包含 productId${mapArg}、moduleId、platform、title、content。\n3. 笔记结构：模块背景 / 范围 / 平台差异 / 信息架构 / 核心流程 / 状态 / 数据与接口 / 权限 / 边界 / 验收。\n4. 模块划分按业务能力，不按页面；平台差异明确写出 PC / 移动 / 平板分别的交互。\n5. 不要只回复正文；必须调用工具；完成后汇总模块清单。`
    }
    if (mode === 'notes') {
      return `产品设计笔记任务：${product.name}\n\n你是资深产品经理。请基于下面的产品导图和上下文，为每个功能/需求生成独立的设计笔记。\n\n${common}\n\n要求：\n0. 开始前先调用 product_progress_publish { productId:"${product.id}", kind:"notes", mapId:"${productMapSelected}", step:0, total:"\${本次覆盖节点数，请按导图里实际功能/需求个数填写}", message:"开始写设计笔记" }，每写完一篇再上报一次（step 递增，status="running"），全部完成后 total 步 status="done"；失败时 status="failed" 并说明原因。\n1. 每个功能/需求调用一次工具 workbench_product_note_publish。\n2. 参数：{ productId:"${product.id}"${mapArg}, featureId:"节点 id", title:"功能名 + 设计笔记", content:"完整 Markdown", tags:["产品设计"] }。\n3. 笔记结构固定：背景 / 目标 / 用户故事 / 核心流程 / 交互与状态 / 边界与异常 / 验收标准。\n4. 多写具体交互、状态与验收，不要写空泛套话；不要遗漏节点。\n5. 全部写完后用简短清单汇报。\n6. 不修改工作区其他文件；笔记由工具负责落库与工作区 Markdown。`
    }
    const platformLabelMap: Record<string, string> = { pc: 'PC（宽屏 1280+，侧栏导航、多栏信息密度）', mobile: '移动端（375-430px，单列、底部导航、大触控目标）', tablet: '平板（768-1024px，双栏自适应、大间距）', all: '自适应（移动优先，PC 增强）' }
    return `产品 Demo 生成任务：${product.name}

你是资深前端原型工程师 + 产品设计师。请依据产品设计笔记与灵感资料，生成高保真、可交互的 Demo。

${common}

【Demo 规格】
- 形态：${kind === 'system' ? '产品系统（多页）：单文件 HTML 内用左侧/顶部导航切换页面，每页是完整界面（含列表/表单/详情等真实布局），页面间可跳转' : '单页面：一个完整界面或长页分区锚点'}
- 目标端：${platformLabelMap[platform] ?? platformLabelMap.all}
- UI 主题：${theme.name}（${theme.id}）— ${theme.hint}
  设计令牌：${themeTokens(theme.id)}
- 覆盖范围：${scope === 'feature' ? '按勾选功能逐个生成' : '整个产品'}

【进度上报（硬性要求）】
开始前调用 workbench_demo_progress_publish { productId:"${product.id}", step:0, total:4, status:"running", message:"分析笔记与灵感" }；
之后每完成一个里程碑调用一次（step 1..4：设计信息架构 → 搭建框架与主题 → 实现页面与交互 → 自检与收尾），最后 status:"done"。

【交付要求】
1. **唯一交付方式**：调用 workbench_product_demo_publish，参数 { productId:"${product.id}"${mapArg}, scope:"${scope}", kind:"${kind}", platform:"${platform}", style:"${theme.id}", featureId:"功能 id（scope=feature 时）", title:"Demo 标题", html:"完整 HTML" }。
2. **禁止**用 write/edit/bash 直接写 HTML 文件；**禁止**委派子智能体；**禁止**只把 HTML 贴在回复里。若工具不可用，停止并说明原因。
3. HTML 必须是单文件、内联 CSS/JS、无外部依赖；真实文案（不要 Lorem）；可点击交互（Tab 切换、弹窗、表单态、筛选等至少 3 类）。
4. 严格使用所选主题的设计令牌与风格；${kind === 'system' ? '系统形态要有统一壳层（顶栏+侧栏+内容区）与至少 3 个页面。' : '单页要有清晰的信息层级与首屏重点。'}
5. 设计笔记描述的核心流程必须能在 Demo 里走通；灵感库的借鉴点选择性融入。
6. 不要修改工作区其他文件。`
  }
  async function queueProductPrompt(prompt: string): Promise<void> {
    const product = productOf(productSelected)
    await dispatchToNewSession(product?.workspacePath ?? '', prompt)
  }
  /* ------------------------------ 导图节点操作（v2 图） ------------------------------ */
  function productNodeId(): string { return `pn-${Math.random().toString(36).slice(2, 8)}` }

  /** 写回当前导图草稿；rerender=false 只刷画布，保住编辑焦点。 */
  function commitMapGraph(graph: ProductMapGraph, opts: { rerender?: boolean } = {}): void {
    const map = activeMap()
    if (map === undefined) return
    map.graph = normalizeProductGraph(graph, { title: map.name }).graph
    void persistProductGraph()
    if (opts.rerender === true) renderContent()
    else refreshMapCanvas()
  }

  /** 局部刷新画布（renderContent 会重建 DOM，编辑中尽量不整页重渲）。 */
  function refreshMapCanvas(): void {
    if (productMapPreview !== null || productMapEngine === 'force') {
      if (productChart !== null) {
        try { productChart.setOption(buildProductForceOption(mapGraph(), { dark: resolvedTheme() === 'dark' }), true) } catch { /* ignore */ }
      }
      return
    }
    if (productMind !== null) {
      try { productMind.refresh(toMindElixir(mapGraph())) } catch { /* ignore */ }
    }
  }

  const PRODUCT_KIND_OPTIONS: ProductNodeKind[] = ['module', 'business', 'feature', 'requirement']
  function kindLabel(kind: ProductNodeKind): string { return PRODUCT_KIND_LABEL[kind] }

  /** 撤销 / 重做：走 mind-elixir 内置历史栈（关系视图与只读预览不可用）。 */
  function mapHistoryStep(action: 'undo' | 'redo'): void {
    if (productMapPreview !== null) { toast('预览模式下不能修改'); return }
    if (productMapEngine !== 'tree' || productMind === null) { toast('切到「编辑」视图才能撤销'); return }
    try {
      if (action === 'undo') productMind.undo()
      else productMind.redo()
      /* 撤销后 mind-elixir 已改内部数据，靠 operation 事件同步即可；
         这里再兜底同步一次，避免某些版本 undo 不触发 operation。 */
      scheduleProductMindSync()
      toast(action === 'undo' ? '已撤销' : '已重做')
    } catch (cause) {
      toast(`${action === 'undo' ? '撤销' : '重做'}失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  /** 节点搜索：回车把第一个命中节点选中并居中（编辑视图）/ 高亮（关系视图）。 */
  function jumpToSearchHit(): void {
    const keyword = productSearch.trim()
    if (keyword === '') return
    const hit = mapGraph().nodes.find(n => n.kind !== 'root' && n.label.includes(keyword))
    if (hit === undefined) { toast(`没找到包含「${keyword}」的节点`); return }
    productNodeSelected = hit.id
    if (productMapEngine === 'tree' && productMind !== null) {
      try {
        productMind.selectNode?.(hit.id, true)
        productMind.toCenter?.(hit.id, true)
      } catch { /* 老版本没有这些方法，退化为仅高亮选中条 */ }
      refreshMapCanvas()
    }
    renderSelectionBar()
    toast(`已定位「${hit.label}」`)
  }

  function openNodeQuickAdd(kind: 'child' | 'sibling', type: ProductNodeKind = 'feature'): void {
    const graph = mapGraph()
    const selected = productNodeById(undefined, productNodeSelected)
    let parentId = graph.rootId
    if (kind === 'child' && selected !== undefined) parentId = selected.id
    if (kind === 'sibling' && selected !== undefined) {
      if (selected.kind === 'root') { toast('根节点不能加同级'); return }
      parentId = selected.parentId ?? graph.rootId
    }
    openModal(`<h3>${kind === 'child' ? '添加子节点' : '添加同级节点'}</h3>
      <div class="mfield"><label>名称</label><input id="wb-pn-label" placeholder="例如：登录 / 支持手机号登录"></div>
      <div class="mfield"><label>类型</label><select id="wb-pn-type">${PRODUCT_KIND_OPTIONS.map(k => `<option value="${k}" ${k === type ? 'selected' : ''}>${kindLabel(k)}</option>`).join('')}</select></div>
      <div class="mfield"><label>上级节点</label><select id="wb-pn-parent">${graph.nodes.map(n => `<option value="${n.id}" ${n.id === parentId ? 'selected' : ''}>${esc(n.kind === 'root' ? '产品' : `${kindLabel(n.kind)} · ${n.label}`)}</option>`).join('')}</select></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-node-add-quick">添加</button></div>`)
    window.setTimeout(() => $id<HTMLInputElement>('wb-pn-label')?.focus(), 0)
  }

  async function saveQuickNode(): Promise<void> {
    const graph = mapGraph()
    const label = $id<HTMLInputElement>('wb-pn-label')?.value.trim() ?? ''
    if (label === '') { $id<HTMLInputElement>('wb-pn-label')?.focus(); return }
    const kind = ($id<HTMLSelectElement>('wb-pn-type')?.value ?? 'feature') as ProductNodeKind
    const parentId = $id<HTMLSelectElement>('wb-pn-parent')?.value ?? graph.rootId
    const id = productNodeId()
    graph.nodes.push({ id, label, kind, parentId, status: 'kept' })
    graph.edges.push({ from: parentId, to: id, kind: 'tree' })
    productNodeSelected = id
    commitMapGraph(graph)
    closeModal()
    renderContent()
    toast(`已添加「${label}」`)
  }

  function toggleNodeFold(id: string): void {
    const graph = mapGraph()
    const node = graph.nodes.find(n => n.id === id)
    if (node === undefined) return
    node.collapsed = node.collapsed === true ? undefined : true
    commitMapGraph(graph)
    renderContent()
  }

  async function changeNodeKind(id: string, kind: ProductNodeKind): Promise<void> {
    const graph = mapGraph()
    const node = graph.nodes.find(n => n.id === id)
    if (node === undefined || node.kind === 'root') return
    node.kind = kind
    commitMapGraph(graph)
    renderContent()
    toast(`已改为${kindLabel(kind)}`)
  }

  /** 节点属性编辑：名称 / 类型 / 端 / 状态 / 说明。 */
  function openNodeProperty(): void {
    const node = productNodeById(undefined, productNodeSelected)
    if (!node) { toast('先选中一个节点'); return }
    if (node.kind === 'root') { toast('产品根节点请用「编辑产品」'); return }
    openModal(`<h3>编辑节点</h3>
      <div class="mfield"><label>名称</label><input id="wb-pn-edit-label" value="${esc(node.label)}"></div>
      <div class="mfield"><label>类型</label><select id="wb-pn-edit-kind">${PRODUCT_KIND_OPTIONS.map(k => `<option value="${k}" ${k === node.kind ? 'selected' : ''}>${kindLabel(k)}</option>`).join('')}</select></div>
      <div class="mfield"><label>端</label><select id="wb-pn-edit-platform">${(['', 'all', 'pc', 'mobile', 'tablet'] as const).map(p => `<option value="${p}" ${p === (node.platform ?? '') ? 'selected' : ''}>${p === '' ? '未指定' : platformLabel(p)}</option>`).join('')}</select></div>
      <div class="mfield"><label>状态</label><select id="wb-pn-edit-status">${(['kept', 'pending', 'dropped'] as const).map(s => `<option value="${s}" ${s === (node.status ?? 'kept') ? 'selected' : ''}>${s === 'kept' ? '采纳' : s === 'pending' ? '待定' : '放弃'}</option>`).join('')}</select></div>
      <div class="mfield"><label>说明（≤200 字）</label><textarea id="wb-pn-edit-detail" rows="3">${esc(node.detail ?? '')}</textarea></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-node-update" data-id="${node.id}">保存</button></div>`)
  }

  async function updateProductNode(id: string): Promise<void> {
    const graph = mapGraph()
    const node = graph.nodes.find(n => n.id === id)
    if (!node) return
    const label = $id<HTMLInputElement>('wb-pn-edit-label')?.value.trim() ?? ''
    if (label === '') return
    node.label = label
    node.kind = ($id<HTMLSelectElement>('wb-pn-edit-kind')?.value ?? node.kind) as ProductNodeKind
    const platform = $id<HTMLSelectElement>('wb-pn-edit-platform')?.value ?? ''
    node.platform = platform === '' ? undefined : platform as ProductMapNode['platform']
    node.status = ($id<HTMLSelectElement>('wb-pn-edit-status')?.value ?? 'kept') as ProductMapNode['status']
    node.detail = ($id<HTMLTextAreaElement>('wb-pn-edit-detail')?.value ?? '').slice(0, 200)
    commitMapGraph(graph)
    closeModal()
    renderContent()
    toast('节点已更新')
  }

  async function deleteProductNode(): Promise<void> {
    const graph = mapGraph()
    const node = productNodeById(undefined, productNodeSelected)
    if (!node) { toast('先选中一个节点'); return }
    if (node.kind === 'root') { toast('不能删除产品根节点'); return }
    /* 子树收集：沿 tree 边 BFS */
    const doomed = new Set<string>([node.id])
    let changed = true
    while (changed) {
      changed = false
      for (const edge of graph.edges) {
        if (edge.kind === 'tree' && doomed.has(edge.from) && !doomed.has(edge.to)) { doomed.add(edge.to); changed = true }
      }
    }
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除「${node.label}」及其 ${doomed.size - 1} 个子节点？关联边一并清理。`) : true
    if (!ok) return
    const next: ProductMapGraph = {
      ...graph,
      nodes: graph.nodes.filter(n => !doomed.has(n.id)),
      edges: graph.edges.filter(e => !doomed.has(e.from) && !(e.kind === 'relate' && doomed.has(e.to))),
    }
    productNodeSelected = null
    commitMapGraph(next)
    renderContent()
  }

  /** 同图关联 / 跨图引用（relate 边）。 */
  function openRelateModal(nodeId: string, external = false): void {
    const graph = mapGraph()
    const from = graph.nodes.find(n => n.id === nodeId)
    if (!from) return
    if (external) {
      const others = productMaps.filter(m => m.id !== productMapSelected)
      const options = others.map(m => {
        const nodes = (m.graph?.nodes ?? []).filter(n => n.kind !== 'root')
        return nodes.length === 0 ? '' : `<optgroup label="${esc(m.name)}">${nodes.map(n => `<option value="${m.id}:${n.id}">${esc(kindLabel(n.kind))} · ${esc(n.label)}</option>`).join('')}</optgroup>`
      }).join('')
      if (options === '') { toast('没有其他导图或其节点可引用'); return }
      openModal(`<h3>加跨图引用</h3>
        <div class="mfield"><label>从「${esc(from.label)}」指向（同产品另一张导图）</label><select id="wb-rel-target">${options}</select></div>
        <div class="mfield"><label>关系说明（可选）</label><input id="wb-rel-label" placeholder="例如：互补 / 依赖"></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">跨图引用是「互为补充」的表达：删除目标导图时引用会自动清理。</div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-relate-save" data-id="${nodeId}" data-ext="1">添加</button></div>`)
      return
    }
    const candidates = graph.nodes.filter(n => n.id !== nodeId)
    openModal(`<h3>加同图关联</h3>
      <div class="mfield"><label>从「${esc(from.label)}」指向</label><select id="wb-rel-target">${candidates.map(n => `<option value="${n.id}">${esc(kindLabel(n.kind))} · ${esc(n.label)}</option>`).join('')}</select></div>
      <div class="mfield"><label>关系说明（可选）</label><input id="wb-rel-label" placeholder="例如：关联 / 前置"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-relate-save" data-id="${nodeId}">添加</button></div>`)
  }

  function saveRelate(nodeId: string, ext: boolean): void {
    const graph = mapGraph()
    const to = $id<HTMLSelectElement>('wb-rel-target')?.value ?? ''
    const label = $id<HTMLInputElement>('wb-rel-label')?.value.trim() ?? ''
    if (to === '') return
    const key = ext ? to : to
    if (graph.edges.some(e => e.kind === 'relate' && e.from === nodeId && e.to === key)) { toast('这条关联已存在'); return }
    graph.edges.push({ from: nodeId, to: key, kind: 'relate', label: label.slice(0, 24) || undefined })
    commitMapGraph(graph)
    closeModal()
    renderContent()
    toast(ext ? '已加跨图引用' : '已加同图关联')
  }

  interface MapMenuItem { label: string; act: string; icon?: string; id?: string; kind?: string; key?: string; danger?: boolean }
  function mapMenuItems(node: ProductNode | undefined): MapMenuItem[] {
    if (node === undefined) {
      return [
        { label: '新增功能', act: 'product-node-new', kind: 'feature', icon: 'plus' },
        { label: '新增需求', act: 'product-node-new', kind: 'requirement', icon: 'plus' },
        { label: '存档版本', act: 'pm-version-archive', icon: 'layers' },
        { label: '版本对比', act: 'pm-version-diff', icon: 'tag' },
      ]
    }
    const items: MapMenuItem[] = [{ label: '添加子节点', act: 'product-node-child', icon: 'corner', key: 'Tab' }]
    if (node.kind !== 'root') items.push({ label: '添加同级', act: 'product-node-sibling', icon: 'plus', key: 'Enter' })
    items.push({ label: '编辑属性', act: 'product-node-edit', icon: 'edit', key: 'F2' })
    if (node.kind !== 'root') {
      for (const k of PRODUCT_KIND_OPTIONS) {
        if (k !== node.kind) items.push({ label: `改为${kindLabel(k)}`, act: 'pm-node-kind', icon: 'tag', id: node.id, kind: k })
      }
    }
    items.push({ label: '加同图关联', act: 'pm-node-relate', icon: 'arrowR', id: node.id })
    items.push({ label: '加跨图引用', act: 'pm-node-relate-ext', icon: 'arrowR', id: node.id })
    items.push({ label: node.collapsed === true ? '展开子树' : '折叠子树', act: 'pm-toggle-fold', icon: 'chevD', id: node.id })
    if (node.kind !== 'root') items.push({ label: '删除节点', act: 'product-node-delete', icon: 'trash', key: 'Del', danger: true })
    return items
  }
  function closeContextMenu(): void {
    const menu = $id('wb-ctxmenu')
    if (menu === null) return
    menu.classList.remove('open')
    menu.innerHTML = ''
    ctxMenuOpen = false
  }
  function openContextMenu(nodeId: string | null, x: number, y: number): void {
    const menu = $id('wb-ctxmenu')
    if (menu === null) return
    const node = nodeId === null ? undefined : productNodeById(undefined, nodeId)
    const items = mapMenuItems(node)
    const head = node === undefined ? '画布' : `${kindLabel(node.kind)} · ${esc(node.label.slice(0, 24))}`
    menu.innerHTML = `<div class="ctx-head">${head}</div>${items.map(item => `<button class="ctx-item${item.danger === true ? ' danger' : ''}" data-act="${item.act}"${item.id === undefined ? '' : ` data-id="${item.id}"`}${item.kind === undefined ? '' : ` data-kind="${item.kind}"`}>${ic(item.icon ?? 'plus', 13)}<span>${item.label}</span>${item.key === undefined ? '' : `<kbd>${item.key}</kbd>`}</button>`).join('')}`
    menu.classList.add('open')
    menu.querySelectorAll<HTMLElement>('.ctx-item').forEach(item => {
      item.addEventListener('click', () => { window.setTimeout(closeContextMenu, 0) })
    })
    const width = 214
    const height = 30 * (items.length + 1) + 14
    menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`
    menu.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, y))}px`
    ctxMenuOpen = true
  }
  function onContextMenu(event: MouseEvent): void {
    const target = event.target as Element | null
    if (target === null) return
    if (ui.view !== 'product' || productTab !== 'map' || productMapPreview !== null) return
    const nodeEl = target.closest('#pm-plot [data-nodeid]') as HTMLElement | null
    const canvas = target.closest('#pm-plot')
    if (nodeEl === null && canvas === null) return
    event.preventDefault()
    const nodeId = nodeEl === null ? '' : productGraphIdOf(nodeEl.getAttribute('data-nodeid') ?? '')
    if (nodeId !== '') productNodeSelected = nodeId
    openContextMenu(nodeId === '' ? null : nodeId, event.clientX, event.clientY)
  }
  function productOutline(_product?: Product): string {
    return productGraphToMarkdown(mapGraph())
  }
  /** 引用检查：列出本图出向引用、其他图对本图的入向引用，并标出悬空引用（目标已删）。 */
  function openRefCheck(): void {
    const graph = mapGraph()
    const map = activeMap()
    if (map === undefined) { toast('先选择导图'); return }
    const labelOf = (mapId: string, nodeId: string): string => {
      const target = productMaps.find(m => m.id === mapId)
      const node = target?.graph?.nodes?.find(n => n.id === nodeId)
      return node === undefined ? `⚠ 悬空（${mapId.slice(0, 10)}:${nodeId.slice(0, 8)}）` : `「${target?.name ?? mapId}」${node.label}`
    }
    const outRows = externalEdges(graph).map(e => {
      const ref = parseExternalRef(String(e.to))
      const from = graph.nodes.find(n => n.id === e.from)
      return `<li>${esc(from?.label ?? e.from)} → ${ref === null ? esc(String(e.to)) : esc(labelOf(ref.mapId, ref.nodeId))}${e.label ? `（${esc(e.label)}）` : ''}</li>`
    })
    const inRows: string[] = []
    for (const other of productMaps) {
      if (other.id === map.id || !Array.isArray(other.graph?.edges)) continue
      for (const edge of externalEdges(other.graph)) {
        const ref = parseExternalRef(String(edge.to))
        if (ref === null || ref.mapId !== map.id) continue
        const target = graph.nodes.find(n => n.id === ref.nodeId)
        const from = other.graph.nodes.find(n => n.id === edge.from)
        inRows.push(`<li>「${esc(other.name)}」${esc(from?.label ?? edge.from)} → ${target === undefined ? '⚠ 悬空（本图已无此节点）' : esc(target.label)}</li>`)
      }
    }
    const dangling = [...outRows.filter(r => r.includes('悬空')), ...inRows.filter(r => r.includes('悬空'))].length
    openModal(`<h3>跨图引用检查</h3>
      <div class="mfield"><label>本图指向其他导图（${outRows.length}）</label>${outRows.length === 0 ? '<div class="muted">无</div>' : `<ul class="diff-list">${outRows.join('')}</ul>`}</div>
      <div class="mfield"><label>其他导图指向本图（${inRows.length}）</label>${inRows.length === 0 ? '<div class="muted">无</div>' : `<ul class="diff-list">${inRows.join('')}</ul>`}</div>
      ${dangling > 0 ? `<div class="mfield" style="color:var(--orange)">发现 ${dangling} 条悬空引用：目标节点/导图已删除，重新保存任一导图时会被自动清理。</div>` : '<div class="mfield" style="color:var(--text-3)">引用完整，无悬空。</div>'}
      <div class="modal-foot"><button class="btn solid" data-act="close-modal">关闭</button></div>`)
  }

  /** 导出当前导图为图片（关系视图走 ECharts，编辑视图走 SVG 快照）。 */
  async function exportMapImage(): Promise<void> {
    const map = activeMap()
    const product = productOf(productSelected)
    if (map === undefined || !product) { toast('先选择导图'); return }
    try {
      if (productChart !== null) {
        const url = productChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: resolvedTheme() === 'dark' ? '#19191d' : '#fff' })
        const a = document.createElement('a')
        a.href = url
        a.download = `${product.name}-${map.name}.png`
        a.click()
        toast('已导出当前关系图')
        return
      }
      if (productMind === null) { toast('切到「关系」视图后可导出图片'); return }
      /* mind-elixir 的 exportPng(download=false) 返回 dataURL，自己触发下载以便控制文件名 */
      const exported = await productMind.exportPng?.(false)
      if (typeof exported === 'string' && exported !== '') {
        const a = document.createElement('a')
        a.href = exported
        a.download = `${product.name}-${map.name}.png`
        a.click()
        toast('已导出导图图片')
        return
      }
      toast('该版本编辑器不支持导出图片，请切到「关系」视图导出')
    } catch (cause) {
      toast(`导出失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  function exportMindmapOutline(): void {
    const product = productOf(productSelected)
    if (!product) return
    const text = productOutline(product)
    try {
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${product.name}-导图大纲.md`
      a.click()
      URL.revokeObjectURL(url)
      toast('大纲已导出')
    } catch {
      void navigator.clipboard.writeText(text).then(() => toast('已复制大纲到剪贴板')).catch(() => toast('导出失败'))
    }
  }
  function importMindmapOutline(): void {
    const map = activeMap()
    if (map === undefined) { toast('先选择导图'); return }
    openModal(`<h3>导入大纲（替换当前导图）</h3>
      <div class="mfield"><label>粘贴 Markdown 大纲（缩进或 - 层级；（模块）（业务）（需求）标记类型）</label><textarea id="wb-pm-outline" rows="10" placeholder="- 登录（模块）&#10;  - 手机验证码登录&#10;  - 一键登录（需求）"></textarea></div>
      <div class="mfield"><label>未标记节点的默认类型</label><select id="wb-pm-outline-kind">
        <option value="feature">功能（默认）</option><option value="module">模块</option><option value="business">业务</option><option value="requirement">需求</option>
      </select></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">普通 Markdown（XMind / 飞书导出）没有类型标记，会按上面选中的类型导入；带「（模块）（业务）（需求）」后标的行仍按标记走。导入会<b>替换</b>「${esc(map.name)}」当前草稿，导入前自动存档，可随时回滚。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-import-run">导入</button></div>`)
  }
  async function runMindmapImport(): Promise<void> {
    const map = activeMap()
    if (!map) return
    const raw = $id<HTMLTextAreaElement>('wb-pm-outline')?.value ?? ''
    const fallbackKind = ($id<HTMLSelectElement>('wb-pm-outline-kind')?.value as ProductNodeKind | undefined) ?? 'feature'
    const { graph, issues } = parseOutlineToProductGraph(raw, map.name, fallbackKind)
    if (graph.nodes.length <= 1) { toast('没有解析到大纲内容'); return }
    if (issues.length > 0) console.warn('[dsh-workbench] 大纲解析提示：', issues)
    try {
      /* 导入前自动存档当前草稿（可回滚），修掉旧版「整体替换、无撤销」的问题 */
      await fetch(`${API}/products/maps/versions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: { mapId: map.id, label: '导入前快照', source: 'manual', summary: '导入大纲前自动存档' } }),
      })
      const res = await fetch(`${API}/products/maps/versions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: { mapId: map.id, graph, source: 'outline', label: '大纲导入', summary: `导入 ${graph.nodes.length - 1} 个节点` } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      closeModal()
      /* createMapVersion 会写草稿并递增 draft_rev：重新拉取，避免本地 rev 错位触发假冲突 */
      await loadProductMaps()
      renderContent()
      toast(`已导入 ${graph.nodes.length - 1} 个节点`)
    } catch (cause) { toast(`导入失败：${String((cause as Error).message ?? cause)}`) }
  }

  /* ------------------------------ 导图素材源：网站 / 截图 → AI 提炼 ------------------------------ */
  /** 新建导图面板里暂存的素材（保存导图时才落库；截图先上传拿到 filePath）。 */
  interface DraftInput { kind: 'url' | 'image' | 'text'; url?: string; filePath?: string; label?: string; width?: number; height?: number; size?: number; mime?: string }
  let draftInputs: DraftInput[] = []

  function renderAiInputs(): void {
    const host = $id('wb-ai-inputs')
    if (host === null) return
    if (draftInputs.length === 0) { host.innerHTML = '<div class="muted" style="font-size:10px">还没有素材：加链接或选截图</div>'; return }
    host.innerHTML = draftInputs.map((item, index) => {
      if (item.kind === 'image') {
        return `<div class="ai-input-row"><span class="ai-input-ico">🖼</span><span class="ai-input-text" title="${esc(item.filePath ?? '')}">${esc(item.label ?? '截图')}</span><button class="icon-btn" data-act="pm-ai-remove" data-index="${index}" title="移除">✕</button></div>`
      }
      return `<div class="ai-input-row"><span class="ai-input-ico">🔗</span><span class="ai-input-text" title="${esc(item.url ?? '')}">${esc(item.url ?? '')}</span><button class="icon-btn" data-act="pm-ai-remove" data-index="${index}" title="移除">✕</button></div>`
    }).join('')
  }

  function addAiUrl(): void {
    const el = $id<HTMLInputElement>('wb-ai-url')
    const url = el?.value.trim() ?? ''
    if (url === '') return
    if (!/^https?:\/\//i.test(url)) { toast('链接必须以 http(s):// 开头'); return }
    if (draftInputs.some(i => i.kind === 'url' && i.url === url)) { toast('这个链接已经加过'); return }
    draftInputs.push({ kind: 'url', url })
    if (el !== null) el.value = ''
    void renderAiInputs()
  }

  function removeAiInput(index: number): void {
    if (index < 0 || index >= draftInputs.length) return
    const item = draftInputs[index]
    /* 截图已落盘：移除时顺手删文件，避免垃圾 */
    if (item.kind === 'image' && item.filePath !== undefined) {
      void fetch(`${API}/products/inputs/${encodeURIComponent(item.filePath)}`, { method: 'DELETE' }).catch(() => undefined)
    }
    draftInputs.splice(index, 1)
    void renderAiInputs()
  }

  /** 截图压缩到 ≤1600px webp 后上传落盘，返回 filePath。 */
  async function addAiImages(files: FileList | null): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) { toast('先选择产品'); return }
    if (files === null) return
    for (const file of Array.from(files).slice(0, 9 - draftInputs.filter(i => i.kind === 'image').length)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const compressed = await compressImageFile(file)
        const res = await fetch(`${API}/products/inputs`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            productId: product.id, mapId: productMapSelected, kind: 'image',
            dataUrl: compressed.dataUrl, label: compressed.name,
            width: compressed.width, height: compressed.height,
          }),
        })
        const data = await res.json().catch(() => ({})) as any
        if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
        draftInputs.push({ kind: 'image', filePath: data.input?.filePath ?? '', label: compressed.name, width: compressed.width, height: compressed.height, mime: 'image/webp', size: data.input?.size ?? 0 })
      } catch (cause) {
        toast(`截图添加失败：${String((cause as Error).message ?? cause)}`)
      }
    }
    void renderAiInputs()
  }

  /** 与灵感页同一套压缩策略（≤1600px，webp 0.86）。 */
  function compressImageFile(file: File): Promise<{ dataUrl: string; name: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        try {
          const max = 1600
          const scale = Math.min(1, max / Math.max(img.width, img.height))
          const width = Math.max(1, Math.round(img.width * scale))
          const height = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx === null) throw new Error('没有 canvas 上下文')
          ctx.drawImage(img, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/webp', 0.86)
          URL.revokeObjectURL(url)
          resolve({ dataUrl, name: file.name || '截图', width, height })
        } catch (cause) { URL.revokeObjectURL(url); reject(cause) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')) }
      img.src = url
    })
  }

  /** 素材 → 导图的提炼提示词（页面结构 / 信息架构 / 功能点 → 产品导图）。 */
  function mapFromInputsPrompt(product: Product, name: string, inputs: DraftInput[]): string {
    const lines = inputs.map(item => {
      if (item.kind === 'image') return `- 截图：${item.filePath}（请先读取该图片，识别页面结构与功能）`
      if (item.kind === 'url') return `- 链接：${item.url}（抓取页面内容；失败就跳过并说明）`
      return `- 文字：${item.kind}`
    }).join('\n')
    const note = $id<HTMLTextAreaElement>('wb-ai-note')?.value.trim() ?? ''
    return `产品导图提炼任务：${product.name}\n\n你是资深产品经理 + 竞品分析师。请根据下面这些素材，提炼出一张**产品思维导图**（产品 → 模块 → 业务 → 功能 / 需求）。\n\n产品：${product.name}\n简介：${product.description || '未填写'}\n产品 ID：${product.id}\n工作区：${product.workspacePath}\n本次新建导图名称：${name}\n${note === '' ? '' : `关注点：${note}\n`}\n【素材】\n${lines}\n\n要求：\n1. 先逐个读取素材：截图读图、链接抓正文；把每个素材里出现的页面/板块/功能列成清单，并标注来自哪个素材。\n2. **归纳共性**：多个素材重复出现的结构（如「登录」「订单」「个人中心」）合并为一个节点；只在单个素材出现的，标为待确认。\n3. 输出结构：根节点=产品名；一级=模块（按业务能力划分，不按页面）；二级=业务/子模块；三级=功能或需求。节点命名 ≤12 字，动词或名词短语。\n4. 用工具落库，唯一交付方式：对每个节点调用一次 workbench_map_node_publish，参数 { productId:"${product.id}", mapId:"${productMapSelected}", parentId:"父节点 id（根为空）", name:"节点名", kind:"module|business|feature|requirement", platform:"pc|mobile|tablet|all" }；**不要**用 write/edit 直接改文件，也不要新建导图（导图已创建好）。\n5. 全部写完调用 product_progress_publish 汇报（kind:"notes", status:"running"→"done"）。\n6. 完成后汇总：用了几个素材、提炼出多少节点、哪些是「单素材孤证」需人工确认。\n\n注意：本次请只输出导图结构，不要写设计文档。`
  }

  /** 保存导图时：把素材落库（截图已落盘，url 追加），并派发提炼任务。 */
  async function createMapFromAi(product: Product, name: string, description: string): Promise<void> {
    if (draftInputs.length === 0) { toast('至少添加一个链接或截图'); return }
    try {
      /* 1) 建空导图 */
      const mapRes = await fetch(`${API}/products/maps`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ map: { productId: product.id, name, description, graph: emptyProductGraph(name), source: 'ai' } }),
      })
      const mapData = await mapRes.json().catch(() => ({})) as any
      if (!mapRes.ok || mapData.map === undefined) throw new Error(mapData.message ?? `HTTP ${mapRes.status}`)
      const map = mapData.map as ProductMap
      /* 2) 素材落库（截图此前已上传，这里补 url） */
      for (const item of draftInputs) {
        if (item.kind === 'image') continue
        await fetch(`${API}/products/inputs`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ productId: product.id, mapId: map.id, kind: 'url', url: item.url }),
        }).catch(() => undefined)
      }
      draftInputs = []
      productMapSelected = map.id
      await loadProductMaps()
      closeModal()
      renderContent()
      /* 3) 派发提炼：素材以「已落库」为准（截图+链接都在），提示词直接按库里的清单生成 */
      const saved = await fetchInputsForPrompt(product.id, map.id)
      const prompt = mapFromInputsPrompt(product, name, saved)
      await runMapExtraction(map.id, product, prompt)
    } catch (cause) { toast(`创建失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function fetchInputsForPrompt(productId: string, mapId: string): Promise<DraftInput[]> {
    try {
      const res = await fetch(`${API}/products/inputs?productId=${encodeURIComponent(productId)}&mapId=${encodeURIComponent(mapId)}`)
      if (!res.ok) return []
      const data = await res.json() as { inputs?: any[] }
      return (data.inputs ?? []).map(i => ({ kind: i.kind, url: i.url, filePath: i.filePath, label: i.label }))
    } catch { return [] }
  }

  /** 派发「素材 → 导图」提炼任务（团队 + 页内会话 + 进度）。 */
  async function runMapExtraction(mapId: string, product: Product, prompt: string): Promise<void> {
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    productProgressKind = 'notes'
    try {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: 'notes', mapId, step: 0, total: 0, status: 'running', message: 'AI 正在分析素材…' } }),
      })
    } catch { /* ignore */ }
    await loadProductProgress()
    if (ui.view === 'product') renderContent()
    const chat = ensureProductChat()
    chat?.open({ teamName: '', dispatchId: '', sessionId: '', timeoutMs: 20 * 60 * 1000 })
    chat?.setStatus('dispatching')
    const started = await startAgentDispatch({
      ideaId: '', runId: '', teamId: '',
      feature: 'product.design',
      goal: prompt,
      ideaTitle: product.name,
      ideaBrief: product.description,
      workspacePath: product.workspacePath,
      timeoutMs: 20 * 60 * 1000,
      allowNoIdea: true,
    } as any, {
      event: event => chat?.ingest(event),
      history: events => chat?.ingestMany(events),
      status: (status, note) => {
        chat?.setStatus(status, note)
        if (status === 'done' || status === 'failed') {
          void fetch(`${API}/products/progress`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ progress: { productId: product.id, kind: 'notes', mapId, step: 0, total: 0, status: status === 'done' ? 'done' : 'failed', message: status === 'done' ? '导图提炼完成' : (note ?? '提炼失败') } }),
          }).then(() => Promise.all([loadProductProgress(), loadProductMaps()]))
            .then(() => { if (ui.view === 'product') renderContent() }).catch(() => undefined)
        }
      },
      team: projection => chat?.setTeam(teamStateOf(projection)),
    })
    if (started === null) {
      toast('派发失败：提示词已复制，可粘贴到新会话')
      return
    }
    productDispatch = { dispatchId: started.dispatchId, sessionId: started.sessionId, teamName: started.teamName }
    chat?.open({ teamName: started.teamName, dispatchId: started.dispatchId, sessionId: started.sessionId, timeoutMs: started.timeoutMs })
    chat?.setStatus('running')
    watchProductDispatch()
    startProductProgressPolling('notes')
    toast(started.teamName === '' ? '已派发素材分析' : `已派发给「${started.teamName}」分析素材`)
  }

  /* ------------------------------ 多导图（自建 / 导入 / 从灵感选择） ------------------------------ */
  function openMapEditor(id?: string): void {
    const product = productOf(productSelected)
    if (product === undefined) { toast('先选择产品'); return }
    if (!productMapsReady) { toast('多导图需要宿主更新，请重启 DSH'); return }
    const map = id === undefined ? undefined : productMaps.find(item => item.id === id)
    if (map !== undefined) {
      openModal(`<h3>编辑导图</h3>
        <div class="mfield"><label>名称</label><input id="wb-map-name" value="${esc(map.name)}"></div>
        <div class="mfield"><label>说明（可选）</label><input id="wb-map-desc" value="${esc(map.description)}"></div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-map-save" data-id="${map.id}">保存</button></div>`)
      return
    }
    openModal(`<h3>新建产品导图</h3>
      <div class="mfield"><label>来源</label><select id="wb-map-source">
        <option value="blank">自建空白（画布直接编辑）</option>
        <option value="outline">导入 Markdown 大纲</option>
        <option value="idea">从灵感选择（整图 / 分支）</option>
        <option value="ai">AI 分析素材生成（网站 / 截图）</option>
      </select></div>
      <div class="mfield"><label>名称</label><input id="wb-map-name" placeholder="例如：收银主链路 / 移动端 / V2 改版"></div>
      <div class="mfield"><label>说明（可选）</label><input id="wb-map-desc" placeholder="这张导图负责的范围（多张导图互为补充）"></div>
      <div class="mfield" id="wb-map-outline-field"><label>粘贴 Markdown 大纲</label><textarea id="wb-map-outline" rows="8" placeholder="- 登录（模块）&#10;  - 手机验证码登录"></textarea></div>
      <div class="mfield" id="wb-map-ai-field">
        <label>分析素材 <span style="font-weight:400">网站链接 / 截图，多个一起分析</span></label>
        <div id="wb-ai-inputs" class="ai-inputs"></div>
        <div class="m-row" style="margin-top:6px">
          <div class="m-col"><input type="url" id="wb-ai-url" placeholder="https://竞品或参考网站"></div>
          <button type="button" class="btn" data-act="pm-ai-add-url">添加链接</button>
          <button type="button" class="btn" data-act="pm-ai-pick">＋ 截图</button>
        </div>
        <input type="file" id="wb-ai-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none">
        <div class="m-field" style="margin-top:6px"><label style="font-size:10px">补充说明（可选：关注哪类产品问题）</label>
          <textarea id="wb-ai-note" rows="2" placeholder="例如：只提炼预约与排班相关的能力；忽略营销页"></textarea></div>
        <div class="m-hint">AI 会先读取每张截图 / 抓取每个链接，归纳出「产品 → 模块 → 业务 → 功能/需求」的导图；素材会保存到产品目录，之后可复用或重跑。</div>
      </div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">每张导图有独立版本序列；文件镜像在 <code>.dsh-workbench/products/&lt;id&gt;/maps/&lt;mapId&gt;.json</code>。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-map-save" data-id="">创建</button></div>`)
    const sel = $id<HTMLSelectElement>('wb-map-source')
    const syncOutlineField = (): void => {
      const outlineField = $id('wb-map-outline-field')
      if (outlineField instanceof HTMLElement) outlineField.style.display = sel?.value === 'outline' ? '' : 'none'
      const aiField = $id('wb-map-ai-field')
      if (aiField instanceof HTMLElement) aiField.style.display = sel?.value === 'ai' ? '' : 'none'
      void renderAiInputs()
    }
    sel?.addEventListener('change', syncOutlineField)
    const aiFile = $id<HTMLInputElement>('wb-ai-file')
    if (aiFile !== null) aiFile.onchange = () => { void addAiImages(aiFile.files); aiFile.value = '' }
    syncOutlineField()
  }
  async function saveMapFromModal(id: string): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) return
    const name = $id<HTMLInputElement>('wb-map-name')?.value.trim() ?? ''
    const description = $id<HTMLInputElement>('wb-map-desc')?.value.trim() ?? ''
    const source = $id<HTMLSelectElement>('wb-map-source')?.value ?? 'blank'
    if (id === '' && source === 'idea') {
      closeModal()
      void openIdeaImport(name)
      return
    }
    if (id === '' && source === 'ai') {
      void createMapFromAi(product, name, description)
      return
    }
    if (name === '') { toast('先填名称'); return }
    try {
      let graph: ProductMapGraph | undefined
      let archiveSource = ''
      let archiveLabel = ''
      if (source === 'outline') {
        const raw = $id<HTMLTextAreaElement>('wb-map-outline')?.value ?? ''
        const parsed = parseOutlineToProductGraph(raw, name)
        if (parsed.graph.nodes.length <= 1) { toast('没有解析到大纲内容'); return }
        graph = parsed.graph
        archiveSource = 'outline'
        archiveLabel = '大纲导入'
      } else if (id === '') {
        graph = emptyProductGraph(name)
      }
      const res = await fetch(`${API}/products/maps`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ map: { id: id || undefined, productId: product.id, name, description, graph, source: archiveSource || undefined } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { map?: ProductMap }
      const map = data.map
      closeModal()
      await loadProductMaps()
      if (map !== undefined && id === '') {
        productMapSelected = map.id
        if (archiveSource !== '') {
          await fetch(`${API}/products/maps/versions`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ version: { mapId: map.id, graph: map.graph, source: archiveSource, label: archiveLabel, summary: `导入 ${map.graph.nodes.length - 1} 个节点` } }),
          })
          /* 存档会递增 draft_rev：重新拉取，避免本地 rev 错位 */
          await loadProductMaps()
        }
      }
      productMapScopeAll = false
      await loadMapVersions()
      toast(id === '' ? '已新建导图' : '已保存导图')
      renderContent()
    } catch (cause) { toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function deleteMapById(id: string): Promise<void> {
    const map = productMaps.find(item => item.id === id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除导图「${map?.name ?? id}」及其版本历史？
该导图下的模块 / 笔记 / Demo 不会被删除，会失去导图归属；其他导图指向它的跨图引用会自动清理。`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/products/maps/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      await loadProductMaps()
      productNodeSelected = null
      productMapPreview = null
      productPicked = productDefaultPicked(productOf(productSelected))
      await loadMapVersions()
      toast('已删除导图')
      renderContent()
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }
  function selectMap(id: string): void {
    if (id === productMapSelected) return
    productMapSelected = id
    productMapScopeAll = false
    productNodeSelected = null
    productMapPreview = null
    productPicked = productDefaultPicked(productOf(productSelected))
    void loadMapVersions().then(() => renderContent())
  }

  /* ------------------------------ 从灵感导入（整图 / 分支） ------------------------------ */
  async function openIdeaImport(presetName = ''): Promise<void> {
    try {
      const res = await fetch(`${API}/ideas`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { ideas?: Array<{ id: string; title: string; status?: string }> }
      const ideas = Array.isArray(data.ideas) ? data.ideas : []
      if (ideas.length === 0) { toast('还没有灵感：先在「灵感」里发散一版'); return }
      openModal(`<h3>从灵感导入 · 选择灵感</h3>
        <div class="mfield"><label>灵感</label><select id="wb-idea-pick">${ideas.map(idea => `<option value="${idea.id}">${esc(idea.title)}${idea.status ? `（${esc(idea.status)}）` : ''}</option>`).join('')}</select></div>
        <div class="mfield"><label>导图名称（默认同灵感）</label><input id="wb-idea-map-name" value="${esc(presetName || ideas[0]?.title || '')}"></div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="idea-import-next">下一步：选版本</button></div>`)
      $id<HTMLSelectElement>('wb-idea-pick')?.addEventListener('change', e => {
        const input = $id<HTMLInputElement>('wb-idea-map-name')
        const found = ideas.find(i => i.id === (e.currentTarget as HTMLSelectElement).value)
        if (input instanceof HTMLInputElement && found) input.value = found.title ?? ''
      })
    } catch (cause) { toast(`灵感读取失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function openIdeaVersionPick(): Promise<void> {
    const ideaId = $id<HTMLSelectElement>('wb-idea-pick')?.value ?? ''
    const name = $id<HTMLInputElement>('wb-idea-map-name')?.value.trim() ?? ''
    if (ideaId === '') return
    try {
      const res = await fetch(`${API}/ideas/${encodeURIComponent(ideaId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { versions?: Array<{ id: string; seq: number; label: string; nodeCount?: number; createdAt?: string }> }
      const versions = Array.isArray(data.versions) ? data.versions : []
      if (versions.length === 0) { toast('该灵感还没有版本（先生成或存档一版）'); return }
      openModal(`<h3>从灵感导入 · 选择版本</h3>
        <div class="mfield"><label>版本</label><select id="wb-idea-version">${versions.map(v => `<option value="${v.id}">v${v.seq} · ${esc(v.label)}（${v.nodeCount ?? 0} 节点 · ${(v.createdAt ?? '').slice(5, 16)}）</option>`).join('')}</select></div>
        <div class="mfield"><label>导入范围</label><select id="wb-idea-scope"><option value="all">整张灵感图</option><option value="branch">某个方向的子树</option></select></div>
        <div class="mfield" id="wb-idea-branch-field"><label>分支起点</label><select id="wb-idea-branch"></select></div>
        <div class="mfield"><label>方向节点默认层级</label><select id="wb-idea-kind"><option value="module">模块（module）</option><option value="business">业务（business）</option></select></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">映射：方向→模块/业务、点子→功能、问题→需求（待定）、风险→需求（带「风险」标签）；角度变成 angle:* 标签保留溯源。</div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="idea-import-run" data-idea="${esc(ideaId)}" data-name="${esc(name)}">导入并创建导图</button></div>`)
      const versionSel = $id<HTMLSelectElement>('wb-idea-version')
      const scopeSel = $id<HTMLSelectElement>('wb-idea-scope')
      const branchField = $id('wb-idea-branch-field')
      const syncScope = (): void => {
        if (branchField instanceof HTMLElement) branchField.style.display = scopeSel?.value === 'branch' ? '' : 'none'
      }
      scopeSel?.addEventListener('change', syncScope)
      syncScope()
      const loadBranches = async (): Promise<void> => {
        const branchSel = $id<HTMLSelectElement>('wb-idea-branch')
        if (branchSel === null) return
        branchSel.innerHTML = '<option value="">加载中…</option>'
        try {
          const vRes = await fetch(`${API}/ideas/${encodeURIComponent(ideaId)}/versions/${encodeURIComponent(versionSel?.value ?? '')}`)
          if (!vRes.ok) throw new Error(`HTTP ${vRes.status}`)
          const vData = await vRes.json() as { version?: { graph?: IdeaLikeGraph } }
          const graph = vData.version?.graph
          const nodes = graph?.nodes ?? []
          branchSel.innerHTML = nodes.map(n => `<option value="${esc(n.id)}">${'　'.repeat(Math.max(0, nodes.findIndex(x => x.id === n.id) === 0 ? 0 : 1))}${esc(n.type)} · ${esc(n.label)}</option>`).join('')
        } catch {
          branchSel.innerHTML = '<option value="">读取失败</option>'
        }
      }
      versionSel?.addEventListener('change', () => { void loadBranches() })
      void loadBranches()
    } catch (cause) { toast(`版本读取失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function runIdeaImport(ideaId: string, name: string): Promise<void> {
    const product = productOf(productSelected)
    if (!product) return
    const versionId = $id<HTMLSelectElement>('wb-idea-version')?.value ?? ''
    const scope = $id<HTMLSelectElement>('wb-idea-scope')?.value ?? 'all'
    const branch = $id<HTMLSelectElement>('wb-idea-branch')?.value ?? ''
    const defaultKind = ($id<HTMLSelectElement>('wb-idea-kind')?.value ?? 'module') as 'module' | 'business'
    try {
      const res = await fetch(`${API}/ideas/${encodeURIComponent(ideaId)}/versions/${encodeURIComponent(versionId)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { version?: { graph?: IdeaLikeGraph; seq?: number } }
      const ideaGraph = data.version?.graph
      if (!ideaGraph || !Array.isArray(ideaGraph.nodes)) throw new Error('灵感版本图为空')
      const sourceRef = `${ideaId}@v${data.version?.seq ?? ''}`
      const title = name || product.name
      /* productGraphFromIdea 返回 { graph, issues }，必须取 .graph——整对象传给宿主时
         normalize 读不到 nodes，会退化成「只有根节点」（2026-10-26 修复的导入空图 bug）。 */
      const converted = productGraphFromIdea(ideaGraph, { title, branchNodeId: scope === 'branch' ? branch : '', defaultKind })
      if (converted.issues.length > 0) console.warn('[dsh-workbench] 灵感导入规范化提示：', converted.issues)
      const graph = converted.graph
      if (graph.nodes.length <= 1) throw new Error('灵感图没有可导入的节点（该版本可能为空）')
      const mapRes = await fetch(`${API}/products/maps`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ map: { productId: product.id, name: title, description: `导入自灵感 ${sourceRef}`, graph, source: 'idea', sourceRef } }),
      })
      if (!mapRes.ok) throw new Error(`HTTP ${mapRes.status}`)
      const mapData = await mapRes.json() as { map?: ProductMap }
      const map = mapData.map
      if (map !== undefined) {
        await fetch(`${API}/products/maps/versions`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: { mapId: map.id, graph: map.graph, source: 'idea', sourceRef, label: '灵感导入', summary: `${scope === 'branch' ? '分支' : '整图'}导入 ${map.graph.nodes.length} 节点` } }),
        })
        productMapSelected = map.id
      }
      closeModal()
      await loadProductMaps()
      await loadMapVersions()
      renderContent()
      toast('已从灵感创建导图')
    } catch (cause) { toast(`导入失败：${String((cause as Error).message ?? cause)}`) }
  }

  /* ------------------------------ 导图版本（存档 / 预览 / 对比 / 回滚 / 删除） ------------------------------ */
  async function archiveMapVersion(): Promise<void> {
    const map = activeMap()
    if (!map) { toast('先选择导图'); return }
    try {
      const res = await fetch(`${API}/products/maps/versions`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: { mapId: map.id, graph: map.graph, source: 'manual', label: `v${(productMapVersions[0]?.seq ?? 0) + 1} 存档`, summary: `手动存档 · ${map.graph.nodes.length} 节点` } }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      /* 存档会写草稿并递增 draft_rev：必须回拉，否则下一次编辑带旧 rev 必 409 被覆盖 */
      await loadProductMaps()
      renderContent()
      toast('已存档版本')
    } catch (cause) { toast(`存档失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function previewMapVersion(id: string): Promise<void> {
    try {
      const res = await fetch(`${API}/products/maps/versions/view?id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { version?: ProductMapVersion }
      productMapPreview = data.version ?? null
      renderContent()
    } catch (cause) { toast(`预览失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function rollbackMapVersion(id: string): Promise<void> {
    const version = productMapVersions.find(v => v.id === id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`回滚到 v${version?.seq ?? ''}？当前草稿会被该版本覆盖（历史保留）。`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/products/maps/versions/rollback`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mapId: productMapSelected, versionId: id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      productMapPreview = null
      await loadProductMaps()
      await loadMapVersions()
      renderContent()
      toast(`已回滚到 v${version?.seq ?? ''}`)
    } catch (cause) { toast(`回滚失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function removeMapVersion(id: string): Promise<void> {
    const version = productMapVersions.find(v => v.id === id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除版本 v${version?.seq ?? ''}？该版本图不可恢复（草稿不受影响）。`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/products/maps/versions/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      if (productMapPreview?.id === id) productMapPreview = null
      await loadMapVersions()
      renderContent()
      toast('版本已删除')
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function openMapVersionDiff(): Promise<void> {
    if (productMapVersions.length < 2) { toast('至少需要两个版本才能对比'); return }
    openModal(`<h3>版本对比</h3>
      <div class="mfield"><label>版本 A（旧）</label><select id="wb-diff-a">${productMapVersions.map(v => `<option value="${v.id}">v${v.seq} · ${esc(v.label)}</option>`).join('')}</select></div>
      <div class="mfield"><label>版本 B（新）</label><select id="wb-diff-b">${productMapVersions.map((v, i) => `<option value="${v.id}" ${i === 1 ? 'selected' : ''}>v${v.seq} · ${esc(v.label)}</option>`).join('')}</select></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pm-version-diff-run">对比</button></div>`)
  }
  async function runMapVersionDiff(): Promise<void> {
    const aId = $id<HTMLSelectElement>('wb-diff-a')?.value ?? ''
    const bId = $id<HTMLSelectElement>('wb-diff-b')?.value ?? ''
    try {
      const [aRes, bRes] = await Promise.all([
        fetch(`${API}/products/maps/versions/view?id=${encodeURIComponent(aId)}`),
        fetch(`${API}/products/maps/versions/view?id=${encodeURIComponent(bId)}`),
      ])
      if (!aRes.ok || !bRes.ok) throw new Error(`HTTP ${aRes.status}/${bRes.status}`)
      const a = (await aRes.json() as { version?: ProductMapVersion }).version
      const b = (await bRes.json() as { version?: ProductMapVersion }).version
      if (!a?.graph || !b?.graph) throw new Error('版本图为空')
      const diff = diffProductGraphs(a.graph, b.graph)
      const entry = (list: Array<{ id: string; label: string }>): string =>
        list.length === 0 ? '<li>无</li>' : list.slice(0, 40).map(n => `<li>${esc(n.label)}</li>`).join('')
      openModal(`<h3>版本对比：v${a.seq} → v${b.seq}</h3>
        <div class="mfield"><b>新增 ${diff.added.length} 节点</b><ul class="diff-list">${entry(diff.added)}</ul></div>
        <div class="mfield"><b>删除 ${diff.removed.length} 节点</b><ul class="diff-list">${entry(diff.removed)}</ul></div>
        <div class="mfield"><b>改名 ${diff.changed.length} 节点</b><ul class="diff-list">${diff.changed.length === 0 ? '<li>无</li>' : diff.changed.slice(0, 40).map(n => `<li>${esc(n.before)} → ${esc(n.after)}</li>`).join('')}</ul></div>
        <div class="mfield">边：+${diff.addedEdges} / −${diff.removedEdges}</div>
        <div class="modal-foot"><button class="btn solid" data-act="close-modal">关闭</button></div>`)
    } catch (cause) { toast(`对比失败：${String((cause as Error).message ?? cause)}`) }
  }

  function openProductEdit(id?: string, presetPath?: string): void {
    const product = productOf(id)
    const workspaces = bugWorkspaceItems()
    const current = product?.workspacePath ?? (presetPath && presetPath !== '' ? presetPath : workspaces[0]?.path ?? '')
    openModal(`<h3>${product ? '编辑项目 / 产品' : '新建项目 / 产品'}</h3>
      <div class="mfield"><label>项目 / 产品名称</label><input id="wb-prod-name" value="${esc(product?.name ?? '')}" placeholder="例如：时序工作台 / 安捷邻"></div>
      <div class="mfield"><label>简介</label><textarea id="wb-prod-desc" rows="3" placeholder="目标用户、核心价值">${esc(product?.description ?? '')}</textarea></div>
      <div class="mfield"><label>关联 DSH 工作区</label>${workspaces.length > 0 ? `<select id="wb-prod-ws">${workspaces.map(ws => `<option value="${esc(ws.path)}" ${ws.path === current ? 'selected' : ''}>${esc(bugWorkspaceName(ws.path))} · ${esc(ws.path)}</option>`).join('')}</select>` : '<div class="muted" style="font-size:10.5px">未读取到工作区，可直接填路径。</div>'}</div>
      <div class="mfield"><label>工作区路径</label><input id="wb-prod-path" value="${esc(current)}" placeholder="/Users/you/project"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">创建后会自动建立「产品：名称」笔记本并关联同一工作区；导图、笔记文件、Demo 都会写到该目录。</div>
      <div class="modal-foot">${product ? `<button class="btn" data-act="archive-toggle" data-target="products" data-id="${product.id}" data-archived="${product.archivedAt ? '1' : ''}">${product.archivedAt ? '取消归档' : '归档'}</button><button class="btn" data-act="product-delete" data-id="${product.id}">${ic('trash', 12)}删除产品</button>` : ''}<button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-save" data-id="${product?.id ?? ''}">${product ? '保存' : '创建产品'}</button></div>`)
    $id<HTMLSelectElement>('wb-prod-ws')?.addEventListener('change', e => { const v = (e.currentTarget as HTMLSelectElement).value; const p = $id<HTMLInputElement>('wb-prod-path'); if (p) p.value = v })
  }
  async function saveProduct(id: string): Promise<void> {
    const name = $id<HTMLInputElement>('wb-prod-name')?.value.trim() ?? ''
    if (name === '') { $id<HTMLInputElement>('wb-prod-name')?.focus(); return }
    const workspacePath = $id<HTMLInputElement>('wb-prod-path')?.value.trim() ?? ''
    try {
      const res = await fetch(`${API}/products`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product: { id: id || undefined, name, description: $id<HTMLTextAreaElement>('wb-prod-desc')?.value ?? '', workspacePath } }) })
      const data = await res.json() as { product?: Product; message?: string }
      if (!res.ok || !data.product) throw new Error(data.message ?? `HTTP ${res.status}`)
      const index = products.findIndex(p => p.id === data.product!.id)
      if (index >= 0) products[index] = data.product
      else products.unshift(data.product)
      productSelected = data.product.id
      productPicked = productDefaultPicked(data.product)
      productNodeSelected = null
      closeModal()
      await loadProducts(true)
      renderContent()
      toast('产品已保存')
    } catch (cause) { toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }

  /* ------------------------------ 产品进度 / 页内会话（团队派发） ------------------------------ */
  /** 进度条（模块 / 笔记生成通用）：与 Demo 进度同一套观感。 */
  function renderProductProgressBar(p: ProductProgress): string {
    const pct = p.total > 0 ? Math.min(100, Math.round(p.step / p.total * 100)) : (p.status === 'done' ? 100 : 8)
    const tail = p.log.slice(-4).map(l => `<div><i>${(l.at ?? '').slice(11, 16)}</i>${esc(l.message)}</div>`).join('')
    return `<div class="demo-progress ${p.status}">
      <div class="demo-progress-head"><b>${p.kind === 'modules' ? '模块生成' : '笔记生成'}</b>
        <span>${p.status === 'running' ? `${p.step}/${p.total || '?'} · ${esc(p.message)}` : p.status === 'done' ? `已完成 · ${esc(p.message)}` : `失败 · ${esc(p.message)}`}</span>
        ${productDispatch !== null && productDispatch.sessionId !== '' ? `<button class="btn tiny" data-act="product-chat-open">查看会话</button>` : ''}
        ${p.status !== 'running' ? '<button class="icon-btn" data-act="product-progress-clear" title="关闭">✕</button>' : ''}
      </div>
      <div class="demo-progress-bar"><i style="width:${pct}%"></i></div>
      ${tail === '' ? '' : `<div class="demo-progress-log">${tail}</div>`}
    </div>`
  }

  function ensureProductChat(): ChatHandle | null {
    if (productChat !== null) return productChat
    const host = $id('product-chat')
    if (host === null) return null
    productChat = createAgentChat(host, {
      esc,
      ic,
      onSend: text => { if (productDispatch !== null) void sendToSession(productDispatch.sessionId, text) },
      onStop: () => { void stopProductDispatch() },
      onRetry: () => { void generateProductModules() },
      onOpenSession: () => { if (productDispatch !== null) focusSession(productDispatch.sessionId) },
    })
    return productChat
  }

  /** 订阅派发会话的事件与团队投影（与灵感页同一套适配层）。 */
  function watchProductDispatch(): void {
    const dispatch = productDispatch
    if (dispatch === null) return
    const chat = ensureProductChat()
    const subscribe = (dshCtx as any)?.on
    if (typeof subscribe === 'function') {
      try {
        subscribe('session/event', (session: any, event: any) => {
          if (String(session?.id ?? session?.sessionId ?? '') !== dispatch.sessionId) return
          chat?.ingest(event)
        })
      } catch { /* 订阅失败只是没有流式 */ }
    }
  }

  async function stopProductDispatch(): Promise<void> {
    if (productDispatch === null) return
    try {
      await fetch(`${API}/agents/dispatches/${encodeURIComponent(productDispatch.dispatchId)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', error: '用户手动停止' }),
      })
      await sendToSession(productDispatch.sessionId, '请主理人立即停止当前团队工作，保留已完成的结果，并用一句话说明已停止。').catch(() => undefined)
      toast('已请求停止')
    } catch (cause) { toast(`停止失败：${String((cause as Error).message ?? cause)}`) }
    productChat?.setStatus('stopped')
  }

  /** 进度轮询：3 秒一次，直到 done/failed；同时刷新模块列表让产物即时出现。 */
  function startProductProgressPolling(progressKind: 'modules' | 'notes'): void {
    productProgressKind = progressKind
    if (productChatTimer !== 0) window.clearInterval(productChatTimer)
    productChatTimer = window.setInterval(() => { void pollProductProgress() }, 3000)
    void pollProductProgress()
  }

  async function pollProductProgress(): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) return
    try {
      const res = await fetch(`${API}/products/progress?productId=${encodeURIComponent(product.id)}&kind=${productProgressKind}`)
      if (!res.ok) return
      const data = await res.json() as { progress?: ProductProgress | null }
      productProgress = data.progress ?? null
      if (productProgress?.status === 'running') {
        /* 运行中：刷新产物（AI 可能已经写了一半），笔记还要单独拉一次 */
        await loadProducts(true)
        if (productProgressKind === 'notes') await loadNotes()
      } else if (productProgress?.status === 'done' || productProgress?.status === 'failed') {
        if (productChatTimer !== 0) { window.clearInterval(productChatTimer); productChatTimer = 0 }
        await loadProducts(true)
        if (ui.view === 'product') renderContent()
        toast(productProgress.status === 'done' ? '生成完成' : `生成失败：${productProgress.message}`)
        return
      }
      if (ui.view === 'product' && productTab === 'modules') renderContent()
    } catch { /* 轮询失败静默重试 */ }
  }

  async function clearProductProgress(): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) return
    try {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: productProgressKind, status: 'done', step: 0, total: 0, message: '' } }),
      })
    } catch { /* ignore */ }
    productProgress = null
    if (ui.view === 'product') renderContent()
  }

  async function loadProductProgress(): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) { productProgress = null; return }
    try {
      const res = await fetch(`${API}/products/progress?productId=${encodeURIComponent(product.id)}&kind=${productProgressKind}`)
      if (!res.ok) { productProgress = null; return }
      const data = await res.json() as { progress?: ProductProgress | null }
      productProgress = data.progress ?? null
      if (productProgress?.status === 'running') startProductProgressPolling(productProgressKind)
    } catch { productProgress = null }
  }

  /** 用团队派发取代裸会话：按 product.design 绑定选团队，页内会话展示，进度可观测。 */
  async function generateProductModules(): Promise<void> {
    const product = productOf(productSelected)
    if (!product?.workspacePath) { toast('产品未关联工作区'); return }
    if (!window.confirm('AI 将按当前导图拆分模块/业务/功能，并逐模块生成设计笔记（可能消耗额度）。继续？')) return
    const prompt = productPrompt(product, 'modules', 'all')
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    /* 先落一条 running 进度：即便随后失败，用户也能看到失败原因 */
    try {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: 'modules', mapId: productMapSelected, step: 0, total: 0, status: 'running', message: '正在派发团队…' } }),
      })
    } catch { /* ignore */ }
    await loadProductProgress()
    if (ui.view === 'product') renderContent()
    const chat = ensureProductChat()
    chat?.open({ teamName: '', dispatchId: '', sessionId: '', timeoutMs: 15 * 60 * 1000 })
    chat?.setStatus('dispatching')
    const started = await startAgentDispatch({
      ideaId: '',
      runId: '',
      teamId: '',
      feature: 'product.design',
      goal: prompt,
      ideaTitle: product.name,
      ideaBrief: product.description,
      workspacePath: product.workspacePath,
      timeoutMs: 15 * 60 * 1000,
      allowNoIdea: true,
    } as any, {
      event: event => chat?.ingest(event),
      history: events => chat?.ingestMany(events),
      status: (status, note) => {
        chat?.setStatus(status, note)
        if (status === 'done' || status === 'failed') {
          void fetch(`${API}/products/progress`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ progress: { productId: product.id, kind: 'modules', mapId: productMapSelected, step: 0, total: 0, status: status === 'done' ? 'done' : 'failed', message: status === 'done' ? '团队执行结束' : (note ?? '团队执行失败') } }),
          }).then(() => loadProductProgress()).then(() => { if (ui.view === 'product') renderContent() }).catch(() => undefined)
        }
      },
      team: projection => chat?.setTeam(teamStateOf(projection)),
    })
    if (started === null) {
      toast('团队派发失败：已复制提示词，可粘贴到新会话')
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: 'modules', mapId: productMapSelected, step: 0, total: 0, status: 'failed', message: '派发失败' } }),
      }).catch(() => undefined)
      await loadProductProgress()
      if (ui.view === 'product') renderContent()
      return
    }
    productDispatch = { dispatchId: started.dispatchId, sessionId: started.sessionId, teamName: started.teamName }
    chat?.open({ teamName: started.teamName, dispatchId: started.dispatchId, sessionId: started.sessionId, timeoutMs: started.timeoutMs })
    chat?.setStatus('running')
    watchProductDispatch()
    startProductProgressPolling('modules')
    toast(started.teamName === '' ? '已派发到团队会话' : `已派发给「${started.teamName}」`)
  }

  /* ------------------------------ 模块 CRUD（手工维护） ------------------------------ */
  function moduleKindName(kind: Module['kind']): string {
    return kind === 'module' ? '模块' : kind === 'business' ? '业务' : kind === 'feature' ? '功能' : '需求'
  }

  function openModuleEditor(id?: string, presetParentId = ''): void {
    const product = productOf(productSelected)
    if (product === undefined) return
    const mod = id === undefined ? undefined : productModules.find(m => m.id === id)
    const nodes = productNodes(product)
    const candidates = nodes.filter(n => n.kind !== 'root')
    const currentMapId = mod?.mapId ?? productMapSelected
    const sameMapNodes = candidates.filter(n => (n.kind === 'module' || n.kind === 'business' || n.kind === 'feature' || n.kind === 'requirement'))
    openModal(`<h3>${mod === undefined ? '新建模块' : '编辑模块'}</h3>
      <div class="mfield"><label>名称</label><input id="wb-mod-name" value="${esc(mod?.name ?? '')}" placeholder="例如：预约与排班"></div>
      <div class="mfield"><label>类型</label><select id="wb-mod-kind">
        ${(['module','business','feature','requirement'] as const).map(k => `<option value="${k}" ${(mod?.kind ?? 'module') === k ? 'selected' : ''}>${moduleKindName(k)}</option>`).join('')}
      </select></div>
      <div class="mfield"><label>端</label><select id="wb-mod-platform">
        ${(['all','pc','mobile','tablet'] as const).map(pl => `<option value="${pl}" ${(mod?.platform ?? 'all') === pl ? 'selected' : ''}>${platformLabel(pl)}</option>`).join('')}
      </select></div>
      <div class="mfield"><label>上级模块（可选）</label><select id="wb-mod-parent">
        <option value="">无（顶层）</option>
        ${productModules.filter(m => m.productId === product.id && m.id !== mod?.id).map(m => `<option value="${m.id}" ${(mod?.parentId ?? presetParentId) === m.id ? 'selected' : ''}>${moduleKindName(m.kind)} · ${esc(m.name)}</option>`).join('')}
      </select></div>
      <div class="mfield"><label>关联导图节点（可选）</label><select id="wb-mod-node">
        <option value="">不关联</option>
        ${sameMapNodes.map(n => `<option value="${n.id}" ${(mod?.nodeId ?? '') === n.id ? 'selected' : ''}>${kindLabel(n.kind)} · ${esc(n.label)}</option>`).join('')}
      </select></div>
      <div class="mfield"><label>说明</label><textarea id="wb-mod-desc" rows="3">${esc(mod?.description ?? '')}</textarea></div>
      <div class="mfield"><label>状态</label><select id="wb-mod-status">
        ${['designing','designed','building','done'].map(s => `<option value="${s}" ${(mod?.status ?? 'designing') === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-module-save" data-id="${mod?.id ?? ''}">${mod === undefined ? '创建' : '保存'}</button></div>`)
  }

  async function saveModuleFromModal(id: string): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) return
    const name = $id<HTMLInputElement>('wb-mod-name')?.value.trim() ?? ''
    if (name === '') { toast('先填名称'); return }
    const payload = {
      id: id || undefined,
      productId: product.id,
      mapId: productMapSelected,
      name,
      kind: $id<HTMLSelectElement>('wb-mod-kind')?.value ?? 'module',
      platform: $id<HTMLSelectElement>('wb-mod-platform')?.value ?? 'all',
      parentId: $id<HTMLSelectElement>('wb-mod-parent')?.value ?? '',
      nodeId: $id<HTMLSelectElement>('wb-mod-node')?.value ?? '',
      description: $id<HTMLTextAreaElement>('wb-mod-desc')?.value ?? '',
      status: $id<HTMLSelectElement>('wb-mod-status')?.value ?? 'designing',
    }
    try {
      const res = await fetch(`${API}/modules`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ module: payload }) })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      const saved = data.module as Module | undefined
      if (saved !== undefined) {
        const index = productModules.findIndex(m => m.id === saved.id)
        if (index >= 0) productModules[index] = saved
        else productModules.push(saved)
      }
      closeModal()
      await loadProducts(true)
      renderContent()
      toast(id === '' ? '模块已创建' : '模块已保存')
    } catch (cause) { toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function deleteModuleById(id: string): Promise<void> {
    const mod = productModules.find(m => m.id === id)
    const children = productModules.filter(m => m.parentId === id)
    const ok = typeof window.confirm === 'function'
      ? window.confirm(`删除${moduleKindName(mod?.kind ?? 'module')}「${mod?.name ?? id}」？${children.length > 0 ? `\n\n它的 ${children.length} 个子项会变成顶层。` : ''}${mod?.noteId ? '\n关联的设计笔记会保留（不会删除）。' : ''}`)
      : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/modules/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      /* 子项提升为顶层，避免出现悬空 parentId */
      for (const child of children) {
        await fetch(`${API}/modules`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ module: { ...child, id: child.id, parentId: '', patch: true } }),
        }).catch(() => undefined)
      }
      productModules = productModules.filter(m => m.id !== id)
      await loadProducts(true)
      renderContent()
      toast('模块已删除')
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }


  /* ------------------------------ 设计流水线：业务模块设计 → 提炼模块 → 产品设计 → 交叉检查 ------------------------------ */
  /**
   * 四阶段派生链（顺序不可乱）：
   *  1) 业务模块设计文档：按导图的分组节点（模块/业务）写设计笔记，落 kind=module_design
   *  2) 从笔记提炼模块：读这些笔记，反推出 modules 行（kind/parent/description），并回写 note_id
   *  3) 产品设计文档：按模块数量建议单档/多档，落 kind=product_design
   *  4) 交叉检查：产品设计 vs 模块设计 vs 导图三方对照，以导图为基准列出偏差并修复
   * 多导图：可勾选参与联合生成；导图改动后可只重跑受影响范围（增量）。
   */
  type DesignStage = 'module_doc' | 'extract_module' | 'product_doc' | 'audit'

  interface PipelineOptions {
    stages: DesignStage[]
    mapIds: string[]
    productDocMode: 'single' | 'per_module'
    incremental: boolean
  }

  /** 参与联合生成的导图集合（用户可多选；默认当前导图）。 */
  function pipelineMaps(): ProductMap[] {
    if (productMapSelected === '') return productMaps
    const picked = productMaps.filter(m => pipelineMapSel.includes(m.id))
    return picked.length > 0 ? picked : productMaps.filter(m => m.id === productMapSelected)
  }

  /** 把多张导图的节点汇总成一段可读清单（联合生成用）。 */
  function pipelineMapContext(maps: ProductMap[]): string {
    if (maps.length === 0) return '（没有导图）'
    return maps.map(map => {
      const nodes = (map.graph?.nodes ?? []).filter(n => n.kind !== 'root')
      const groups = nodes.filter(n => n.kind === 'module' || n.kind === 'business')
      const leaf = nodes.filter(n => n.kind === 'feature' || n.kind === 'requirement')
      const line = (n: ProductNode): string => `  - [${kindLabel(n.kind)}] ${n.label}${n.platform ? `（${n.platform}）` : ''}${n.detail ? ` — ${n.detail.slice(0, 60)}` : ''}`
      return `导图「${map.name}」（mapId:${map.id}）\n  分组节点：\n${groups.map(line).join('\n') || '  （无）'}\n  功能/需求：\n${leaf.map(line).join('\n') || '  （无）'}`
    }).join('\n\n')
  }

  /** 已有的模块设计文档（用于「从笔记提炼模块」与增量）。 */
  function existingModuleDocs(product: Product): Note[] {
    return notes.filter(n => n.notebookId === product.notebookId && n.kind === 'module_design')
  }

  function pipelinePrompt(stage: DesignStage, product: Product, opts: PipelineOptions): string {
    const maps = productMaps.filter(m => opts.mapIds.includes(m.id))
    const using = maps.length > 0 ? maps : pipelineMaps()
    const mapCtx = pipelineMapContext(using)
    const mapIds = using.map(m => m.id)
    const mapArg = mapIds.length === 1 ? `, mapId:"${mapIds[0]}"` : `, mapId:"<本次要写入的导图 id，取值见上方导图清单>"`
    const base = `产品：${product.name}\n简介：${product.description || '未填写'}\n产品 ID：${product.id}\n产品笔记本 ID：${product.notebookId}\n工作区：${product.workspacePath}\n\n【参与本次生成的导图】\n${mapCtx}`
    const existingDocs = existingModuleDocs(product)
    const docList = existingDocs.length === 0 ? '（尚无模块设计文档）'
      : existingDocs.slice(0, 40).map(d => `- ${d.title}（noteId:${d.id}${d.moduleId ? `, moduleId:${d.moduleId}` : ''}）`).join('\n')

    if (stage === 'module_doc') {
      return `【阶段 1／业务模块设计文档】${product.name}\n\n你是资深产品经理 + 业务架构师。先写设计文档，不要急着建模块。\n\n${base}\n\n已有文档：\n${docList}\n\n要求：\n1. 针对每张导图里的每个**分组节点**（kind=module 或 business；没有分组时按功能聚类自行归纳）写一份业务模块设计文档。\n2. 每份用 workbench_product_note_publish 写入，参数：{ productId:"${product.id}"${mapArg}, kind:"module_design", moduleId:"<若该模块已存在则填其 id，否则留空>", title:"<模块名> · 业务模块设计", content:"完整 Markdown", tags:["模块设计"] }。\n3. 文档结构：模块背景 / 业务目标与指标 / 角色与权限 / 核心流程（含异常分支）/ 数据与字段 / 与其他模块的边界与依赖 / 多端差异（PC·移动·平板）/ 非功能要求 / 验收标准。\n4. **只依据导图里的事实**；导图没写的，明确标注「待确认」而不是编造。\n5. ${opts.incremental ? '增量模式：只处理内容有变化的模块（导图节点改动过、或尚无文档），已一致的跳过。' : '全量模式：覆盖全部模块。'}\n6. 每写完一份调用 product_progress_publish 上报（kind:"modules"）。\n7. 最后用清单汇报写了哪几份。`
    }
    if (stage === 'extract_module') {
      return `【阶段 2／从设计文档提炼模块】${product.name}\n\n你是业务架构师。请**从已写好的业务模块设计文档中反推产品结构**，而不是重新从导图想。\n\n${base}\n\n可用的设计文档：\n${docList}\n\n要求：\n1. 先逐份读完上面的设计文档（title 与 noteId 见上），提炼出「产品 → 模块 → 业务 → 功能/需求」的层级。\n2. 用 workbench_module_publish 写入，参数 { productId:"${product.id}"${mapArg}, parentId:"父级模块 id（顶层留空）", nodeId:"对应导图节点 id（能从文档/导图对上就填）", name, kind:"module|business|feature|requirement", platform:"pc|mobile|tablet|all", description:"一句话职责" }。\n3. **同名同 kind 是更新而非新增**（宿主幂等），放心重跑。\n4. 模块划分以**文档里描述的业务能力**为准；导图与文档冲突时，**以导图为事实基准**，并在模块 description 里注明冲突点。\n5. 不要新建空模块；每个模块必须能对应到至少一份设计文档或一个导图节点。\n6. 完成后汇报：新建 N 个、更新 M 个、导图与文档不一致 K 处。`
    }
    if (stage === 'product_doc') {
      const moduleCount = productModules.filter(m => m.productId === product.id && (m.kind === 'module' || m.kind === 'business')).length
      const suggested = moduleCount <= 6 ? 'single' : 'per_module'
      const chosen = opts.productDocMode
      return `【阶段 3／产品设计文档】${product.name}\n\n你是产品负责人。请在产品级视角写设计文档，把各模块串成一个整体。\n\n${base}\n\n模块数：${moduleCount}（建议形态：${suggested === 'single' ? '单份产品设计' : '按模块分册'}；本次采用：${chosen === 'single' ? '单份' : `按模块分册（共 ${moduleCount} 份，每份 moduleId 对应一个模块）`}）\n\n要求：\n1. ${chosen === 'single'
        ? '写**一份**产品设计文档，用 workbench_product_note_publish 写入，参数：{ productId:"' + product.id + '", kind:"product_design", title:"' + product.name + ' · 产品设计", content:"完整 Markdown" }。'
        : '**按模块分册**：为每个模块各写一份，参数 { productId:"' + product.id + '", kind:"product_design", moduleId:"该模块 id", title:"<模块名> · 产品设计分册", content:"完整 Markdown" }；最后再写一份总纲（moduleId 留空，title 为产品名 + 产品设计总纲）。'}
2. 产品设计文档结构：产品定位与目标用户 / 整体信息架构（跨模块）/ 核心用户旅程（跨模块串接）/ 模块职责矩阵 / 模块间依赖与数据流 / 分阶段路线图 / 全局性约束（权限·合规·性能）/ 风险与对策 / 整体验收标准。\n3. **严禁把模块设计文档整段复制过来**；产品级只写「跨模块」的内容，模块内的细节引用其文档即可。\n4. 与导图不一致的地方要显式列出「导图未覆盖，待确认」。\n5. 完成后汇报文档清单。`
    }
    return `【阶段 4／交叉检查与以导图为基准的修复】${product.name}\n\n你是产品架构评审人。请对「导图 ↔ 模块 ↔ 业务模块设计文档 ↔ 产品设计文档」做四方交叉检查。\n\n${base}\n\n已有模块设计文档：\n${docList}\n\n已知模块：\n${productModules.filter(m => m.productId === product.id).slice(0, 80).map(m => `- [${m.kind}] ${m.name}（id:${m.id}${m.noteId ? `, note:${m.noteId}` : '，无文档'}）`).join('\n') || '（尚无模块）'}\n\n要求：\n1. 逐项比对，列出四类偏差：\n   A. 导图有、但模块缺失（结构缺口）\n   B. 模块有、但导图没有（多余模块 / 未回填导图）\n   C. 有模块但无业务模块设计文档\n   D. 产品设计文档与模块设计文档互相矛盾（职责重叠、边界冲突、指标不一致）\n2. **以导图为唯一事实基准**：\n   - A 类：用 workbench_module_publish 补模块；若属结构遗漏，也建议在导图里补节点（给出节点 JSON 建议，不要直接改图）。\n   - B 类：标记为「待确认」，不要自删。\n   - C 类：为缺失模块补写 module_design 文档（workbench_product_note_publish, kind:"module_design", moduleId）。\n   - D 类：以导图为准改写文档，冲突处在文档里加「⚠️ 与模块 X 冲突，已按导图修正」。\n3. 最后输出一份检查报告（Markdown 表格：偏差类型 / 位置 / 处理动作 / 是否需人工确认），并用 workbench_product_note_publish 存为 kind:"product_design"、title:"${product.name} · 设计一致性检查报告"（moduleId 留空）。\n4. 绝不修改导图本身，只通过工具改模块与文档。`
  }

  /** 统一执行器：团队派发 + 页内会话 + 进度（四阶段共用）。 */
  async function runDesignStage(stage: DesignStage, opts: PipelineOptions): Promise<void> {
    const product = productOf(productSelected)
    if (!product?.workspacePath) { toast('产品未关联工作区'); return }
    const label = stage === 'module_doc' ? '业务模块设计文档' : stage === 'extract_module' ? '从文档提炼模块'
      : stage === 'product_doc' ? '产品设计文档' : '交叉检查与修复'
    const prompt = pipelinePrompt(stage, product, opts)
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    const progressKind: 'modules' | 'notes' = stage === 'extract_module' ? 'modules' : 'notes'
    productProgressKind = progressKind
    try {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: progressKind, mapId: opts.mapIds[0] ?? productMapSelected, step: 0, total: 0, status: 'running', message: `正在派发：${label}` } }),
      })
    } catch { /* ignore */ }
    await loadProductProgress()
    if (ui.view === 'product') renderContent()
    const chat = ensureProductChat()
    chat?.open({ teamName: '', dispatchId: '', sessionId: '', timeoutMs: 20 * 60 * 1000 })
    chat?.setStatus('dispatching')
    const started = await startAgentDispatch({
      ideaId: '', runId: '', teamId: '',
      feature: 'product.design',
      goal: prompt,
      ideaTitle: product.name,
      ideaBrief: product.description,
      workspacePath: product.workspacePath,
      timeoutMs: 20 * 60 * 1000,
      allowNoIdea: true,
    } as any, {
      event: event => chat?.ingest(event),
      history: events => chat?.ingestMany(events),
      status: (status, note) => {
        chat?.setStatus(status, note)
        if (status === 'done' || status === 'failed') {
          void fetch(`${API}/products/progress`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ progress: { productId: product.id, kind: progressKind, mapId: opts.mapIds[0] ?? productMapSelected, step: 0, total: 0, status: status === 'done' ? 'done' : 'failed', message: status === 'done' ? `${label} 完成` : (note ?? `${label} 失败`) } }),
          }).then(() => Promise.all([loadProductProgress(), loadNotes(), loadProducts(true)]))
            .then(() => { if (ui.view === 'product') renderContent() }).catch(() => undefined)
        }
      },
      team: projection => chat?.setTeam(teamStateOf(projection)),
    })
    if (started === null) {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: progressKind, mapId: opts.mapIds[0] ?? productMapSelected, step: 0, total: 0, status: 'failed', message: '派发失败（提示词已复制）' } }),
      }).catch(() => undefined)
      await loadProductProgress()
      if (ui.view === 'product') renderContent()
      toast('派发失败：已复制提示词，可粘贴到新会话')
      return
    }
    productDispatch = { dispatchId: started.dispatchId, sessionId: started.sessionId, teamName: started.teamName }
    chat?.open({ teamName: started.teamName, dispatchId: started.dispatchId, sessionId: started.sessionId, timeoutMs: started.timeoutMs })
    chat?.setStatus('running')
    watchProductDispatch()
    startProductProgressPolling(progressKind)
    toast(started.teamName === '' ? `已派发：${label}` : `已派发给「${started.teamName}」：${label}`)
  }

  /** 等待「阶段真正跑完」：轮询目标状态直到 done/failed 或超时。这是阶段串行的前提。 */
  function waitForStageSettled(progressKind: 'modules' | 'notes', timeoutMs = 20 * 60 * 1000): Promise<'done' | 'failed' | 'timeout'> {
    const product = productOf(productSelected)
    if (product === undefined) return Promise.resolve('failed')
    const startedAt = Date.now()
    return new Promise(resolve => {
      const tick = async (): Promise<void> => {
        if (Date.now() - startedAt > timeoutMs) { resolve('timeout'); return }
        try {
          const res = await fetch(`${API}/products/progress?productId=${encodeURIComponent(product.id)}&kind=${progressKind}`)
          if (res.ok) {
            const data = await res.json() as { progress?: ProductProgress | null }
            const p = data.progress
            productProgress = p ?? null
            if (p?.status === 'done') { resolve('done'); return }
            if (p?.status === 'failed') { resolve('failed'); return }
          }
        } catch { /* 单次失败继续等 */ }
        window.setTimeout(() => { void tick() }, 3000)
      }
      void tick()
    })
  }

  /** 流水线面板：选阶段、选导图、选产品文档形态、增量开关。 */
  function openPipeline(): void {
    const product = productOf(productSelected)
    if (product === undefined) { toast('先选择产品'); return }
    const moduleCount = productModules.filter(m => m.productId === product.id && (m.kind === 'module' || m.kind === 'business')).length
    const suggested = moduleCount <= 6 ? 'single' : 'per_module'
    openModal(`<h3>设计流水线</h3>
      <div class="mfield"><label>① 参与联合生成的导图</label>
        <div class="pipeline-maps">${productMaps.map(m => `<label><input type="checkbox" data-pipeline-map="${m.id}" ${pipelinePickedMaps().includes(m.id) ? 'checked' : ''}> ${esc(m.name)} <small>(${(m.graph?.nodes ?? []).filter(n => n.kind !== 'root').length} 节点)</small></label>`).join('') || '<span class="muted">还没有导图</span>'}</div>
      </div>
      <div class="mfield"><label>② 执行阶段（按顺序，可只跑其中几步）</label>
        <label class="pipeline-stage"><input type="checkbox" data-pipeline-stage="module_doc" ${pipelineStages().includes('module_doc') ? 'checked' : ''}> 1. 业务模块设计文档（先写文档）</label>
        <label class="pipeline-stage"><input type="checkbox" data-pipeline-stage="extract_module" ${pipelineStages().includes('extract_module') ? 'checked' : ''}> 2. 从设计文档提炼模块</label>
        <label class="pipeline-stage"><input type="checkbox" data-pipeline-stage="product_doc" ${pipelineStages().includes('product_doc') ? 'checked' : ''}> 3. 产品设计文档</label>
        <label class="pipeline-stage"><input type="checkbox" data-pipeline-stage="audit" ${pipelineStages().includes('audit') ? 'checked' : ''}> 4. 交叉检查并按导图修复</label>
      </div>
      <div class="mfield"><label>③ 产品设计文档形态（当前 ${moduleCount} 个模块，建议：${suggested === 'single' ? '单份' : '按模块分册'}）</label>
        <select id="wb-pipeline-doc-mode">
          <option value="single" ${productDocMode === 'single' ? 'selected' : ''}>单份产品设计</option>
          <option value="per_module" ${productDocMode === 'per_module' ? 'selected' : ''}>按模块分册（每模块一份 + 总纲）</option>
        </select>
      </div>
      <div class="mfield"><label>④ 模式</label>
        <label class="pipeline-stage"><input type="checkbox" id="wb-pipeline-incremental" ${pipelineIncremental ? 'checked' : ''}> 增量（只处理导图改动过 / 尚无文档的部分）</label>
        <label class="pipeline-stage"><input type="checkbox" id="wb-pipeline-step" ${pipelineStepMode ? 'checked' : ''}> 分步执行（一次只跑一步，完成后我确认再继续）</label>
      </div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">阶段按顺序执行：先文档 → 再提炼模块 → 再产品设计 → 最后交叉检查。每一步都是独立团队派发，可在页内会话里看到过程；可先跑 1-2 步检查质量再继续。</div>
      <div class="modal-foot">${pipelineRemaining.length > 0 ? `<button class="btn" data-act="pipeline-next">继续下一步（${stageLabel(pipelineRemaining[0])}）</button>` : ''}<button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="pipeline-run">开始执行</button></div>`)
  }

  let pipelineStageSel: DesignStage[] = ['module_doc', 'extract_module', 'product_doc', 'audit']
  let pipelineMapSel: string[] = []
  let pipelineRunning = false
  /** 分步模式：剩余待执行阶段。 */
  let pipelineRemaining: DesignStage[] = []
  let pipelineStepMode = false
  let productDocMode: 'single' | 'per_module' = 'single'
  let pipelineIncremental = false
  function pipelineStages(): DesignStage[] { return pipelineStageSel }
  function pipelinePickedMaps(): string[] { return pipelineMapSel }

  /** 顺序执行选中的阶段；每阶段等真正 done 再进下一步（失败或超时即停）。 */
  async function runPipeline(): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) return
    const stageEls = Array.from(document.querySelectorAll('[data-pipeline-stage]')) as HTMLInputElement[]
    const mapEls = Array.from(document.querySelectorAll('[data-pipeline-map]')) as HTMLInputElement[]
    const stageChecked = stageEls.filter(el => el.checked).map(el => el.getAttribute('data-pipeline-stage') as DesignStage)
    const order: DesignStage[] = ['module_doc', 'extract_module', 'product_doc', 'audit']
    pipelineStageSel = order.filter(s => stageChecked.includes(s))
    pipelineMapSel = mapEls.filter(el => el.checked).map(el => el.getAttribute('data-pipeline-map') ?? '')
    pipelineStepMode = $id<HTMLInputElement>('wb-pipeline-step')?.checked === true
    productDocMode = ($id<HTMLSelectElement>('wb-pipeline-doc-mode')?.value as 'single' | 'per_module') ?? 'single'
    pipelineIncremental = $id<HTMLInputElement>('wb-pipeline-incremental')?.checked === true
    if (pipelineStageSel.length === 0) { toast('至少选一个阶段'); return }
    const mapIds = pipelineMapSel.length > 0 ? pipelineMapSel : (productMapSelected === '' ? productMaps.map(m => m.id) : [productMapSelected])
    if (mapIds.length === 0) { toast('没有可用导图'); return }
    const opts: PipelineOptions = { stages: pipelineStageSel, mapIds, productDocMode, incremental: pipelineIncremental }
    closeModal()
    const steps = pipelineStepMode ? pipelineStageSel.slice(0, 1) : pipelineStageSel
    const ok = typeof window.confirm === 'function'
      ? window.confirm(`${pipelineStepMode ? '只执行第一阶段' : `依次执行 ${steps.length} 个阶段（每步等完成后继续）`}：${steps.map(stageLabel).join(' → ')}\n涉及 ${mapIds.length} 张导图。可能消耗较多额度，继续？`)
      : true
    if (!ok) return
    pipelineRunning = true
    pipelineRemaining = pipelineStageSel.slice(steps.length)
    if (ui.view === 'product') renderContent()
    try {
      for (const stage of steps) {
        await runDesignStage(stage, opts)
        /* 关键：必须等团队真正跑完，否则下一阶段读到的是旧数据（先文档后模块的前提会失效） */
        toast(`等待「${stageLabel(stage)}」完成…`)
        const settled = await waitForStageSettled(stage === 'extract_module' ? 'modules' : 'notes')
        if (settled !== 'done') {
          toast(settled === 'timeout' ? `「${stageLabel(stage)}」超时未完成，已停止流水线` : `「${stageLabel(stage)}」失败，已停止流水线`)
          return
        }
        await loadNotes()
        await loadProducts(true)
        await loadProductProgress()
        if (ui.view === 'product') renderContent()
      }
      toast(pipelineStepMode && pipelineRemaining.length > 0
        ? `本阶段完成，还剩 ${pipelineRemaining.length} 步（点「继续下一步」）`
        : '流水线全部完成')
    } finally {
      pipelineRunning = false
      if (ui.view === 'product') renderContent()
    }
  }

  function stageLabel(stage: DesignStage): string {
    return stage === 'module_doc' ? '业务模块设计文档' : stage === 'extract_module' ? '从文档提炼模块'
      : stage === 'product_doc' ? '产品设计文档' : '交叉检查与修复'
  }

  /** 继续下一步（分步模式下使用剩余阶段）。 */
  async function runPipelineNext(): Promise<void> {
    if (pipelineRemaining.length === 0) { toast('没有待执行的阶段'); return }
    const product = productOf(productSelected)
    if (product === undefined) return
    const stage = pipelineRemaining[0]
    const mapIds = pipelineMapSel.length > 0 ? pipelineMapSel : productMaps.map(m => m.id)
    const opts: PipelineOptions = { stages: pipelineRemaining, mapIds, productDocMode, incremental: pipelineIncremental }
    pipelineRunning = true
    if (ui.view === 'product') renderContent()
    try {
      await runDesignStage(stage, opts)
      toast(`等待「${stageLabel(stage)}」完成…`)
      const settled = await waitForStageSettled(stage === 'extract_module' ? 'modules' : 'notes')
      pipelineRemaining = pipelineRemaining.slice(1)
      if (settled === 'done') {
        await loadNotes(); await loadProducts(true); await loadProductProgress()
        toast(pipelineRemaining.length > 0 ? `本阶段完成，还剩 ${pipelineRemaining.length} 步` : '流水线全部完成')
      } else {
        toast(`「${stageLabel(stage)}」${settled === 'timeout' ? '超时' : '失败'}，已停止`)
      }
    } finally {
      pipelineRunning = false
      if (ui.view === 'product') renderContent()
    }
  }

  /** 归档 / 取消归档（products / modules / notes 通用）。 */
  async function setArchivedFlag(target: string, id: string, archived: boolean): Promise<void> {
    if (!['products', 'modules', 'notes'].includes(target)) return
    try {
      const res = await fetch(`${API}/archive`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target, id, archived: !archived }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast(archived ? '已取消归档' : '已归档')
      if (target === 'products') await loadProducts(true)
      else if (target === 'modules') productModules = productModules.map(m => m.id === id ? { ...m, archivedAt: archived ? '' : new Date().toISOString() } : m)
      else notes = notes.map(n => n.id === id ? { ...n, archivedAt: archived ? '' : new Date().toISOString() } : n)
      if (ui.view === 'product') renderContent()
    } catch (cause) { toast(`操作失败：${String((cause as Error).message ?? cause)}`) }
  }

  /* ------------------------------ 设计笔记：节点归属 / 覆盖度 / 就近编辑 ------------------------------ */
  /** 从笔记 tags 里解析出它关联的导图节点 id（tag 形如 pn-abc123）。 */
  function noteNodeId(note: Note): string {
    const graph = mapGraph()
    for (const tag of note.tags ?? []) {
      if (graph.nodes.some(n => n.id === tag)) return tag
    }
    /* 兼容：tags 里没有时，用标题匹配节点名（AI 标题通常是「功能名 + 设计笔记」） */
    const hit = graph.nodes.find(n => n.kind !== 'root' && n.label.trim() !== '' && note.title.includes(n.label))
    return hit?.id ?? ''
  }

  /** 节点的笔记（同一节点可能有多篇，取最新）。 */
  function noteOfNode(nodeId: string, list: Note[]): Note | undefined {
    return list.find(note => noteNodeId(note) === nodeId)
  }

  /** 覆盖度：已写/缺失的节点清单（只看功能与需求，模块/业务可作为分组头）。 */
  function noteCoverage(product: Product | undefined): { nodes: ProductNode[]; written: Set<string>; missing: ProductNode[] } {
    const nodes = productFeatureNodes(product)
    const list = productNoteList(product)
    const written = new Set<string>()
    for (const note of list) {
      const id = noteNodeId(note)
      if (id !== '') written.add(id)
    }
    return { nodes, written, missing: nodes.filter(n => !written.has(n.id)) }
  }

  /** 设计文档类型徽标（普通笔记不显示）。 */
  function noteKindBadge(note: Note): string {
    if (note.kind === 'module_design') return '<span class="note-kind module">业务模块设计</span>'
    if (note.kind === 'product_design') return '<span class="note-kind product">产品设计</span>'
    if (note.kind === 'feature_design') return '<span class="note-kind feature">功能设计</span>'
    return ''
  }

  /** 笔记卡片：显示「▸ 节点名」归属 + 编辑/删除按钮。 */
  function renderNoteCard(note: Note, graphNodes: ProductNode[]): string {
    const nodeId = noteNodeId(note)
    const node = graphNodes.find(n => n.id === nodeId)
    const plain = note.content.replace(/[#>*\n]/g, ' ').slice(0, 100)
    return `<div class="product-note" data-product-note="${note.id}">
      <div class="product-note-head">
        <b>${esc(note.title)}</b>
        <span class="product-note-ops">
          <button class="icon-btn" data-act="product-note-edit" data-id="${note.id}" title="编辑">${ic('edit', 11)}</button>
          <button class="icon-btn" data-act="archive-toggle" data-target="notes" data-id="${note.id}" data-archived="${note.archivedAt ? '1' : ''}" title="${note.archivedAt ? '取消归档' : '归档'}">${note.archivedAt ? '↩' : '⌸'}</button>
          <button class="icon-btn" data-act="product-note-delete" data-id="${note.id}" title="删除">${ic('trash', 11)}</button>
        </span>
      </div>
      ${node !== undefined ? `<span class="product-note-node" title="关联导图节点">▸ ${kindLabel(node.kind)} · ${esc(node.label)}</span>` : '<span class="product-note-node orphan">未关联节点</span>'}
      ${noteKindBadge(note)}
      <span class="product-note-text">${esc(plain)}</span>
      <i>${note.filePath ? '已写入工作区' : '仅本地库'}</i>
    </div>`
  }

  /** 笔记编辑弹窗（就地编辑，不跳走）：标题 / 正文 / 关联节点。 */
  function openNoteEditor(id: string): void {
    const note = notes.find(n => n.id === id)
    if (note === undefined) { toast('笔记不存在'); return }
    const graphNodes = mapGraph().nodes.filter(n => n.kind !== 'root')
    const current = noteNodeId(note)
    openModal(`<h3>编辑设计笔记</h3>
      <div class="mfield"><label>标题</label><input id="wb-note-title" value="${esc(note.title)}"></div>
      <div class="mfield"><label>关联导图节点</label><select id="wb-note-node">
        <option value="">不关联</option>
        ${graphNodes.map(n => `<option value="${n.id}" ${n.id === current ? 'selected' : ''}>${kindLabel(n.kind)} · ${esc(n.label)}</option>`).join('')}
      </select></div>
      <div class="mfield"><label>正文（Markdown）</label><textarea id="wb-note-content" rows="14">${esc(note.content)}</textarea></div>
      <div class="modal-foot"><button class="btn" data-act="product-note-delete" data-id="${note.id}">${ic('trash', 12)}删除</button><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-note-save" data-id="${note.id}">保存</button></div>`)
  }

  /** 手工新建一篇设计笔记（默认归到产品笔记本 + 当前导图）。 */
  function openNoteCreator(presetNodeId = ''): void {
    const product = productOf(productSelected)
    if (product === undefined) return
    const graphNodes = mapGraph().nodes.filter(n => n.kind !== 'root')
    openModal(`<h3>写设计笔记</h3>
      <div class="mfield"><label>标题</label><input id="wb-note-title" placeholder="例如：登录 · 设计笔记"></div>
      <div class="mfield"><label>关联导图节点（可选）</label><select id="wb-note-node">
        <option value="">不关联</option>
        ${graphNodes.map(n => `<option value="${n.id}" ${n.id === presetNodeId ? 'selected' : ''}>${kindLabel(n.kind)} · ${esc(n.label)}</option>`).join('')}
      </select></div>
      <div class="mfield"><label>正文（Markdown）</label><textarea id="wb-note-content" rows="14" placeholder="背景 / 目标 / 用户故事 / 核心流程 / 交互与状态 / 边界与异常 / 验收标准"></textarea></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="product-note-create">创建</button></div>`)
  }

  async function saveNoteFromModal(id: string): Promise<void> {
    const note = notes.find(n => n.id === id)
    if (note === undefined) return
    const title = $id<HTMLInputElement>('wb-note-title')?.value.trim() ?? ''
    if (title === '') { toast('标题不能为空'); return }
    const content = $id<HTMLTextAreaElement>('wb-note-content')?.value ?? ''
    const nodeId = $id<HTMLSelectElement>('wb-note-node')?.value ?? ''
    /* tags：保留原有非节点 tag，替换节点 tag */
    const graphIds = new Set(mapGraph().nodes.map(n => n.id))
    const kept = (note.tags ?? []).filter(t => !graphIds.has(t))
    const tags = nodeId === '' ? kept : kept.concat([nodeId])
    try {
      const res = await fetch(`${API}/notes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: { ...note, title, content, tags } }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      if (data.note !== undefined) {
        const index = notes.findIndex(n => n.id === data.note.id)
        if (index >= 0) notes[index] = data.note
      }
      closeModal()
      await loadNotes()
      renderContent()
      toast('笔记已保存')
    } catch (cause) { toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function createNoteFromModal(): Promise<void> {
    const product = productOf(productSelected)
    if (product === undefined) return
    const title = $id<HTMLInputElement>('wb-note-title')?.value.trim() ?? ''
    if (title === '') { toast('标题不能为空'); return }
    const content = $id<HTMLTextAreaElement>('wb-note-content')?.value ?? ''
    const nodeId = $id<HTMLSelectElement>('wb-note-node')?.value ?? ''
    const tags = ['产品', product.name, ...(nodeId === '' ? [] : [nodeId])]
    try {
      const res = await fetch(`${API}/notes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: { notebookId: product.notebookId, mapId: productMapSelected, title, content, tags } }),
      })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`)
      closeModal()
      await loadNotes()
      await loadProducts(true)
      renderContent()
      toast('笔记已创建')
    } catch (cause) { toast(`创建失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function removeNoteById(id: string): Promise<void> {
    const note = notes.find(n => n.id === id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除笔记「${note?.title ?? ''}」？工作区里的 .md 镜像也会一并删除。`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      notes = notes.filter(n => n.id !== id)
      closeModal()
      renderContent()
      toast('笔记已删除')
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }

  /** 笔记生成：与模块同一套团队派发 + 进度 + 页内会话（原来走裸会话，无进度不可观测）。 */
  async function generateProductNotes(): Promise<void> {
    const product = productOf(productSelected)
    if (!product?.workspacePath) { toast('产品未关联工作区'); return }
    const featureNodes = productFeatureNodes(product)
    if (featureNodes.length === 0) { toast('先在导图中添加功能/需求'); return }
    const picked = productSelectedFeatures(product)
    const scope: 'all' | 'feature' = picked.length > 0 ? 'feature' : 'all'
    const covered = scope === 'feature' ? picked.length : featureNodes.length
    const ok = typeof window.confirm === 'function' ? window.confirm(`AI 将为${scope === 'feature' ? `勾选的 ${covered} 个` : `全部 ${covered} 个`}功能/需求生成设计笔记，可能消耗额度。继续？`) : true
    if (!ok) return
    const prompt = productPrompt(product, 'notes', scope)
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    try {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: 'notes', mapId: productMapSelected, step: 0, total: covered, status: 'running', message: '正在派发团队…' } }),
      })
    } catch { /* ignore */ }
    productProgressKind = 'notes'
    await loadProductProgress()
    if (ui.view === 'product') renderContent()
    const chat = ensureProductChat()
    chat?.open({ teamName: '', dispatchId: '', sessionId: '', timeoutMs: 15 * 60 * 1000 })
    chat?.setStatus('dispatching')
    const started = await startAgentDispatch({
      ideaId: '',
      runId: '',
      teamId: '',
      feature: 'product.design',
      goal: prompt,
      ideaTitle: product.name,
      ideaBrief: product.description,
      workspacePath: product.workspacePath,
      timeoutMs: 15 * 60 * 1000,
      allowNoIdea: true,
    } as any, {
      event: event => chat?.ingest(event),
      history: events => chat?.ingestMany(events),
      status: (status, note) => {
        chat?.setStatus(status, note)
        if (status === 'done' || status === 'failed') {
          void fetch(`${API}/products/progress`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ progress: { productId: product.id, kind: 'notes', mapId: productMapSelected, step: covered, total: covered, status: status === 'done' ? 'done' : 'failed', message: status === 'done' ? '团队执行结束' : (note ?? '团队执行失败') } }),
          }).then(() => loadProductProgress()).then(() => loadNotes()).then(() => { if (ui.view === 'product') renderContent() }).catch(() => undefined)
        }
      },
      team: projection => chat?.setTeam(teamStateOf(projection)),
    })
    if (started === null) {
      await fetch(`${API}/products/progress`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: { productId: product.id, kind: 'notes', mapId: productMapSelected, step: 0, total: covered, status: 'failed', message: '派发失败（提示词已复制）' } }),
      }).catch(() => undefined)
      await loadProductProgress()
      if (ui.view === 'product') renderContent()
      return
    }
    productDispatch = { dispatchId: started.dispatchId, sessionId: started.sessionId, teamName: started.teamName }
    chat?.open({ teamName: started.teamName, dispatchId: started.dispatchId, sessionId: started.sessionId, timeoutMs: started.timeoutMs })
    chat?.setStatus('running')
    watchProductDispatch()
    startProductProgressPolling('notes')
    toast(started.teamName === '' ? '已派发到团队会话' : `已派发给「${started.teamName}」`)
  }


  function productDemoCss(style: string): string {
    const base = `*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.65;background:var(--bg);color:var(--text)}a{color:inherit}.shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr}.top{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:3}.brand{font-weight:800;font-size:18px;letter-spacing:-.3px}.badge{font-size:10px;border:1px solid var(--line);border-radius:99px;padding:2px 8px;color:var(--muted)}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:0}.nav{border-right:1px solid var(--line);padding:18px 14px;position:sticky;top:57px;height:calc(100vh - 57px);overflow:auto;background:var(--surface)}.nav b{display:block;font-size:10px;letter-spacing:.12em;color:var(--muted);margin-bottom:9px;text-transform:uppercase}.nav a{display:block;padding:7px 9px;border-radius:7px;text-decoration:none;font-size:13px;color:var(--muted);margin-bottom:2px}.nav a:hover{background:var(--hover);color:var(--text)}.main{padding:42px 48px 72px;max-width:1000px;width:100%;margin:0 auto}.hero{padding:20px 0 26px;border-bottom:1px solid var(--line);margin-bottom:26px}.hero .kicker{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}.hero h1{font-size:34px;line-height:1.2;margin:8px 0 7px;letter-spacing:-.6px}.hero p{color:var(--muted);font-size:14px;margin:0;max-width:680px}.feature{padding:24px 0 30px;border-bottom:1px solid var(--line)}.feature:last-child{border-bottom:0}.feature h2{font-size:23px;margin:0 0 12px;letter-spacing:-.3px}.feature .tag{font-size:10px;color:var(--accent);font-weight:700;letter-spacing:.1em;text-transform:uppercase}.doc h1,.doc h2,.doc h3{margin:16px 0 6px;line-height:1.3}.doc h1{font-size:20px}.doc h2{font-size:16px}.doc h3{font-size:14px}.doc p,.doc li{font-size:13.5px;color:var(--muted)}.doc ul,.doc ol{padding-left:20px}.doc blockquote{border-left:3px solid var(--accent);margin:10px 0;padding:6px 12px;background:var(--hover);color:var(--muted)}.doc code{background:var(--hover);padding:1px 4px;border-radius:4px;font-size:12px}.doc pre{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px 12px;overflow:auto}.doc a{color:var(--accent)}.doc table{border-collapse:collapse;width:100%}.doc td,.doc th{border:1px solid var(--line);padding:5px 7px;font-size:12px}.empty{border:1px dashed var(--line);border-radius:10px;padding:16px;color:var(--muted);font-size:13px}.foot{padding:16px 28px;border-top:1px solid var(--line);color:var(--muted);font-size:10px;display:flex;justify-content:space-between}.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:8px;background:var(--accent);color:#fff;text-decoration:none;font-size:12px;font-weight:600}`
    const themes: Record<string, string> = {
      clean: ':root{--bg:#f7f9fc;--surface:#fff;--text:#111827;--muted:#5b6577;--line:#e4e9f2;--hover:#eef4ff;--accent:#2563eb}.hero h1{font-family:inherit}',
      editorial: ':root{--bg:#f6f1e7;--surface:#fbf7ef;--text:#1f1b16;--muted:#6b6156;--line:#ded4c4;--hover:#efe6d7;--accent:#c2410c}body{font-family:Georgia,"Songti SC",serif}.brand,.hero h1,.feature h2{font-family:Georgia,"Songti SC",serif}.hero h1{font-size:38px}.nav{background:transparent}',
      neo: ':root{--bg:#e8ebf0;--surface:#eef1f6;--text:#2b3340;--muted:#6a7485;--line:#d5dbe5;--hover:#e0e6ef;--accent:#4f6bed}body{background:linear-gradient(135deg,#edf0f5,#dfe4ec)}.top,.nav,.hero,.feature,.doc pre{box-shadow:6px 6px 14px #c9d0db,-6px -6px 14px #fff}.top,.nav,.feature{background:transparent;border-color:transparent}.btn{box-shadow:3px 3px 8px #c3cbd7,-3px -3px 8px #fff}',
      glass: ':root{--bg:#0c1222;--surface:rgba(255,255,255,.06);--text:#eef4ff;--muted:#a8b6d4;--line:rgba(255,255,255,.14);--hover:rgba(255,255,255,.1);--accent:#7aa2ff}body{background:radial-gradient(1200px 700px at 15% 0%,#263a6b 0,transparent 60%),radial-gradient(900px 600px at 100% 30%,#4a2a67 0,transparent 55%),#0c1222}.top,.nav{background:rgba(12,18,34,.55);backdrop-filter:blur(14px)}.feature{background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:14px;padding:22px;margin:14px 0;backdrop-filter:blur(8px)}.doc p,.doc li{color:var(--muted)}.doc blockquote{background:rgba(255,255,255,.05)}',
      dashboard: ':root{--bg:#0f172a;--surface:#16233a;--text:#e2e8f0;--muted:#94a3b8;--line:#24344f;--hover:#1d2c47;--accent:#38bdf8}body{background:radial-gradient(1000px 500px at 80% -10%,#1e3a5f 0,transparent 55%),#0f172a}.feature{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px;margin:12px 0}.hero .kicker{color:#a78bfa}.badge{border-color:#334155}.btn{background:linear-gradient(135deg,#38bdf8,#6366f1)}.doc pre{background:#0b1220}.doc code{background:#1e293b}',
      bento: ':root{--bg:#f5f5f4;--surface:#fff;--text:#111827;--muted:#57534e;--line:#e7e5e4;--hover:#fafaf9;--accent:#2563eb}.main{max-width:1100px}.hero h1{font-size:44px;letter-spacing:-1.5px}.feature{border:0;border-radius:22px;padding:26px;margin:14px 0;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}.feature:nth-child(3n){background:#fef3c7}.feature:nth-child(3n+1){background:#dbeafe}.feature:nth-child(3n+2){background:#dcfce7}.feature h2{font-size:26px}.btn{border-radius:999px;padding:10px 18px}',
      tech: ':root{--bg:#0a0f1a;--surface:#111827;--text:#d1fae5;--muted:#6b7f99;--line:#1f2c42;--hover:#152036;--accent:#22d3ee}body{background-image:linear-gradient(rgba(34,211,238,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.05) 1px,transparent 1px);background-size:28px 28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.hero h1{font-family:ui-monospace,monospace}.hero .kicker{color:#22d3ee}.brand{letter-spacing:.06em}.badge{border-color:#22d3ee55;color:#22d3ee}.btn{background:#22d3ee;color:#04222b;border-radius:4px}.doc code{background:#0f2030;color:#7dd3fc}',
      aurora: ':root{--bg:#17123a;--surface:rgba(255,255,255,.1);--text:#fff;--muted:#c7c3ee;--line:rgba(255,255,255,.18);--hover:rgba(255,255,255,.14);--accent:#f472b6}body{background:linear-gradient(135deg,#667eea 0%,#764ba2 45%,#f093fb 100%);background-attachment:fixed}.top,.nav{background:rgba(23,18,58,.35);backdrop-filter:blur(16px)}.feature{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:22px;margin:14px 0;backdrop-filter:blur(10px)}.hero h1{font-size:40px}.btn{background:linear-gradient(135deg,#f472b6,#a78bfa);border-radius:999px}.doc blockquote{background:rgba(255,255,255,.1)}',
      cream: ':root{--bg:#faf6f1;--surface:#fff;--text:#3d3128;--muted:#8d7b6c;--line:#efe5da;--hover:#f5ebe1;--accent:#e07a5f}body{background:linear-gradient(180deg,#fdf8f3,#f7ede4)}.hero h1{font-size:36px;font-weight:800}.feature{background:#fff;border-radius:18px;padding:22px;margin:13px 0;box-shadow:0 8px 24px rgba(93,64,42,.06);border:0}.feature h2{font-weight:700}.btn{background:#e07a5f;border-radius:999px;box-shadow:0 6px 16px rgba(224,122,95,.35)}.top,.nav{background:rgba(255,255,255,.7);border-color:#efe5da}',
      clay: ':root{--bg:#f0f4ff;--surface:#fff;--text:#1d2b53;--muted:#5b6b9c;--line:#dfe7ff;--hover:#e7edff;--accent:#4cc9f0}body{background:linear-gradient(160deg,#e8f0fe,#fde8f0)}.feature{border:0;border-radius:24px;padding:24px;margin:13px 0;background:#fff;box-shadow:8px 8px 20px #c9d4ee,-8px -8px 20px #fff}.feature:nth-child(2n){background:#ffd166}.feature:nth-child(3n){background:#06d6a0;color:#0b3d2e}.btn{border-radius:16px;box-shadow:4px 4px 10px rgba(76,201,240,.4);background:#4cc9f0;color:#083344}.hero h1{font-size:38px}',
      brutal: ':root{--bg:#fff;--surface:#fff;--text:#000;--muted:#333;--line:#000;--hover:#ffe066;--accent:#ff6b6b}body{background:#fff;font-family:"Arial Black",Arial,sans-serif}.top{border-bottom:3px solid #000;background:#ffe066}.nav{border-right:3px solid #000;background:#74b9ff}.feature{border:3px solid #000;border-radius:0;padding:22px;margin:14px 0;box-shadow:6px 6px 0 #000;background:#fff}.feature:nth-child(2n){background:#ff6b6b;color:#fff}.feature:nth-child(3n){background:#6bcb77}.hero h1{font-size:42px;text-transform:uppercase;letter-spacing:-1px}.btn{background:#000;color:#fff;border-radius:0;border:3px solid #000;box-shadow:4px 4px 0 #ff6b6b}.badge{border:2px solid #000;border-radius:0}',
      padflow: ':root{--bg:#f8fafc;--surface:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0;--hover:#f1f5f9;--accent:#0ea5e9}.layout{grid-template-columns:280px minmax(0,1fr)}.nav a{padding:12px 14px;font-size:14px;min-height:44px;display:flex;align-items:center}.btn{min-height:44px;padding:12px 18px;font-size:14px}.hero h1{font-size:36px}.feature{padding:28px 0}.top{padding:18px 32px}',
    }
    return base + (themes[style] ?? themes.clean)
  }
  function productNoteForFeature(product: Product, feature: ProductNode): Note | undefined {
    return productNoteList(product).find(note => note.tags.includes(feature.id) || note.title.includes(feature.label)) ?? productNoteList(product).find(note => note.title.startsWith(feature.label))
  }
  function productDemoHtml(product: Product, features: ProductNode[], style: string, scope: 'all' | 'feature', kind: 'page' | 'system' = 'page', platform: string = 'all'): string {
    const sections = features.map(feature => {
      const note = productNoteForFeature(product, feature)
      const body = note ? markdownToHtml(note.content) : `<div class="empty">还没有设计笔记；先点「设计笔记 → AI 生成设计笔记」。</div>`
      return `<section class="feature" id="f-${feature.id}"><span class="tag">${kindLabel(feature.kind)}</span><h2>${esc(feature.label)}</h2><div class="doc">${body}</div></section>`
    }).join('')
    const pageNav = features.map((feature, i) => `<a href="${kind === 'system' ? `#p-${feature.id}` : `#f-${feature.id}`}" ${kind === 'system' ? `data-page="${feature.id}" class="page-link${i === 0 ? ' active' : ''}"` : ''}>${esc(feature.label)}</a>`).join('')
    const modeBadge = kind === 'system' ? '产品系统' : '单页原型'
    const shell = kind === 'system'
      ? `<div class="layout"><nav class="nav"><b>功能导航</b>${pageNav}</nav><main class="main"><div class="hero"><span class="kicker">Product System</span><h1>${esc(product.name)}</h1><p>${esc(product.description || '由产品设计笔记与灵感资料生成的可交互产品系统 Demo。')}</p></div><div class="pages">${features.map((feature, i) => {
        const note = productNoteForFeature(product, feature)
        const body = note ? markdownToHtml(note.content) : `<div class="empty">还没有设计笔记；先点「设计笔记 → AI 生成设计笔记」。</div>`
        return `<section class="feature page${i === 0 ? ' active' : ''}" id="p-${feature.id}" data-page-panel="${feature.id}"><span class="tag">${kindLabel(feature.kind)}</span><h2>${esc(feature.label)}</h2><div class="doc">${body}</div></section>`
      }).join('')}</div></main></div>`
      : `<div class="layout"><nav class="nav"><b>功能导航</b>${pageNav}</nav><main class="main"><div class="hero"><span class="kicker">Product Prototype</span><h1>${esc(product.name)}</h1><p>${esc(product.description || '由产品设计笔记生成的可交互原型。')}</p></div>${sections}</main></div>`
    const systemJs = kind === 'system'
      ? `<script>document.querySelectorAll('.page-link').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var id=a.getAttribute('data-page');document.querySelectorAll('.page-link').forEach(function(x){x.classList.remove('active')});a.classList.add('active');document.querySelectorAll('[data-page-panel]').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-page-panel')===id)});window.scrollTo({top:0,behavior:'smooth'})})})</script>`
      : ''
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(product.name)} · 产品 Demo</title><style>${productDemoCss(style)}${kind === 'system' ? '.pages .page{display:none}.pages .page.active{display:block}' : ''}</style></head><body><div class="shell"><header class="top"><span class="brand">${esc(product.name)}</span><span class="badge">${modeBadge} · ${esc(themeOf(style).name)}</span><span style="margin-left:auto;font-size:11px;color:var(--muted)">${platformLabel(platform)} · ${scope === 'all' ? '整个产品' : '单功能预览'}</span></header>${shell}<footer class="foot"><span>由工作台产品设计生成 · ${new Date().toLocaleString()}</span><span>${esc(style)} / ${esc(platform)}</span></footer></div>${systemJs}</body></html>`
  }
  async function generateProductDemo(scope: 'all' | 'feature'): Promise<void> {
    const product = productOf(productSelected)
    if (!product?.workspacePath) { toast('产品未关联工作区'); return }
    const features = scope === 'all' ? productFeatureNodes(product) : productSelectedFeatures(product)
    if (features.length === 0) { toast(scope === 'all' ? '先添加功能节点' : '先勾选功能'); return }
    const targets = scope === 'all' ? [features] : features.map(f => [f])
    const theme = themeOf(productStyle)
    try {
      // 本地渲染也走进度上报，与 AI 生成共用同一套监控 UI
      await fetch(`${API}/products/demo-progress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: { productId: product.id, step: 0, total: targets.length, status: 'running', message: `开始渲染（${theme.name}）` } }) })
      demoProgress = { id: `dp-${product.id}`, productId: product.id, demoId: '', step: 0, total: targets.length, status: 'running', message: `开始渲染（${theme.name}）`, log: [], updatedAt: new Date().toISOString() }
      renderContent()
      let last: ProductDemo | undefined
      for (let i = 0; i < targets.length; i += 1) {
        const group = targets[i]
        const html = productDemoHtml(product, group, productStyle, scope, productDemoKind, productPlatform)
        const title = `${product.name} · ${theme.name} · ${productDemoKind === 'system' ? '系统' : '单页'} · ${scope === 'all' ? '整个产品' : group[0].label}`
        const res = await fetch(`${API}/products/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId: product.id, scope, kind: productDemoKind, platform: productPlatform, style: productStyle, featureId: scope === 'feature' ? group[0].id : '', title, html }) })
        const data = await res.json() as { demo?: ProductDemo; message?: string }
        if (!res.ok || !data.demo) throw new Error(data.message ?? `HTTP ${res.status}`)
        productDemos = [data.demo, ...productDemos.filter(d => d.id !== data.demo!.id)]
        last = data.demo
        const step = i + 1
        await fetch(`${API}/products/demo-progress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: { productId: product.id, demoId: data.demo.id, step, total: targets.length, status: step === targets.length ? 'done' : 'running', message: `已渲染 ${step}/${targets.length}：${title}` } }) })
      }
      await loadDemoProgress(product.id)
      if (last) productDemoSelected = last.id
      renderContent()
      toast(`已生成 ${targets.length} 个 Demo（${theme.name} · ${productDemoKind === 'system' ? '产品系统' : '单页'} · ${platformLabel(productPlatform)}）`)
    } catch (cause) {
      try {
        await fetch(`${API}/products/demo-progress`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: { productId: product.id, step: 0, total: targets.length, status: 'failed', message: String((cause as Error).message ?? cause) } }) })
        await loadDemoProgress(product.id)
      } catch { /* ignore */ }
      renderContent()
      toast(`Demo 生成失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function loadDemoProgress(productId: string): Promise<void> {
    try {
      const before = demoProgress ? `${demoProgress.step}/${demoProgress.total}/${demoProgress.status}/${demoProgress.message}/${demoProgress.log.length}` : ''
      const res = await fetch(`${API}/products/demo-progress?productId=${encodeURIComponent(productId)}`)
      if (!res.ok) return
      const data = await res.json() as { progress?: DemoProgress | null }
      demoProgress = data.progress ?? null
      const after = demoProgress ? `${demoProgress.step}/${demoProgress.total}/${demoProgress.status}/${demoProgress.message}/${demoProgress.log.length}` : ''
      // 快轮询拿到新进度立即刷新界面（否则进度条停在旧值直到 12s 常规轮询）
      if (after !== before && ui.view === 'product' && ($id('wb-modal')?.innerHTML ?? '') === '') renderContent()
    } catch { /* ignore */ }
  }
  async function generateDemoViaAI(): Promise<void> {
    const product = productOf(productSelected)
    if (!product?.workspacePath) { toast('产品未关联工作区'); return }
    const picked = productSelectedFeatures(product)
    const scope: 'all' | 'feature' = productDemoKind === 'system' || picked.length === 0 ? 'all' : 'feature'
    const features = scope === 'all' ? productFeatureNodes(product) : picked
    if (features.length === 0) { toast('先添加功能节点或勾选功能'); return }
    const ok = typeof window.confirm === 'function' ? window.confirm(`AI 深度生成${productDemoKind === 'system' ? '产品系统' : '单页'} Demo（${themeOf(productStyle).name} · ${platformLabel(productPlatform)}）？\n将在工作区新建会话，结合设计笔记与灵感资料生成，并实时回报进度。`) : true
    if (!ok) return
    const prompt = productPrompt(product, 'demo', scope, { kind: productDemoKind, platform: productPlatform })
    try {
      // 先落一条「等待开始」进度（驱动快轮询），再开 AI 会话；AI 接手后由工具续写
      try {
        await fetch(`${API}/products/demo-progress`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ progress: { productId: product.id, step: 0, total: 4, status: 'running', message: '已提交 AI 会话，等待开始生成…' } }),
        })
        await loadDemoProgress(product.id)
      } catch { /* 进度上报失败不阻塞会话提交 */ }
      await queueProductPrompt(prompt)
      toast('已新建 Demo 生成会话，回到 Demo 页可看进度')
    } catch (cause) {
      try {
        await fetch(`${API}/products/demo-progress`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ progress: { productId: product.id, step: 0, total: 4, status: 'failed', message: `提交失败：${String((cause as Error).message ?? cause)}` } }),
        })
        await loadDemoProgress(product.id)
      } catch { /* 进度失败上报不影响主流程 */ }
      toast(`提交失败：${String((cause as Error).message ?? cause)}`)
    }
  }
  async function deleteProductDemo(id: string): Promise<void> {
    const ok = typeof window.confirm === 'function' ? window.confirm('删除这个 Demo？工作区里的 HTML 文件会一并删除。') : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/products/demo/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      productDemos = productDemos.filter(d => d.id !== id)
      if (productDemoSelected === id) productDemoSelected = ''
      renderContent()
      toast('Demo 已删除')
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }
  function openModuleDetail(id: string): void {
    const mod = productModules.find(m => m.id === id)
    if (!mod) return
    const note = mod.noteId ? notes.find(n => n.id === mod.noteId) : undefined
    const kindName = mod.kind === 'module' ? '模块' : mod.kind === 'business' ? '业务' : mod.kind === 'feature' ? '功能' : '需求'
    openModal(`<h3>${esc(mod.name)}</h3>
      <div class="bug-detail-meta"><span>${kindName}</span><span>${platformLabel(mod.platform)}</span><span>${esc(mod.status)}</span></div>
      <div class="mfield"><label>说明</label><div class="bug-detail-text">${esc(mod.description || '待补充模块说明')}</div></div>
      ${note ? `<div class="mfield"><label>关联设计文档${note.kind === 'module_design' ? '（业务模块设计）' : note.kind === 'product_design' ? '（产品设计分册）' : ''}</label><div class="bug-detail-text">${esc(note.title)}</div></div>` : ''}
      ${(() => { const docs = notes.filter(n => n.notebookId === (productOf(productSelected)?.notebookId ?? '') && n.moduleId === mod.id && n.id !== note?.id); return docs.length === 0 ? '' : `<div class="mfield"><label>其他关联文档（${docs.length}）</label><div class="bug-detail-text">${docs.map(d => esc(d.title)).join('<br>')}</div></div>` })()}
      <div class="modal-foot">${note ? `<button class="btn solid" data-act="product-note-open" data-id="${note.id}">打开设计笔记</button>` : `<button class="btn" data-act="product-gen-notes">${ic('spark', 12)}生成设计笔记</button>`}<button class="btn" data-act="close-modal">关闭</button></div>`)
  }
  async function openProductNote(id: string): Promise<void> {
    await loadNotes()
    noteSelected = id
    ui.noteMode = 'edit'
    ui.view = 'notes'
    renderAll()
  }

  async function deleteProduct(id: string): Promise<void> {
    const product = productOf(id)
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除项目 / 产品「${product?.name ?? ''}」及其 Demo？对应笔记本与笔记会保留，任务的归属会清空。`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/products/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      products = products.filter(p => p.id !== id)
      productDemos = productDemos.filter(d => d.productId !== id)
      productSelected = products[0]?.id ?? null
      if (product?.workspacePath !== undefined && ui.project === product.workspacePath) ui.project = 'all'
      else if (ui.project !== 'all' && ui.project !== 'none' && projectByPath(ui.project) === undefined) ui.project = 'all'
      closeModal()
      renderAll()
      toast('项目 / 产品已删除')
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }
  interface DshSessionRow { id: string; title?: string; running?: boolean; cwd?: string }
  function dshSessionRows(): DshSessionRow[] {
    try {
      const sessions = dshCtx?.get?.<any>('sessions')
      const snapshot = sessions?.list?.getSnapshot?.()
      if (!snapshot?.ids || !snapshot?.byId) return []
      return snapshot.ids.map((id: string) => ({
        id,
        title: snapshot.byId[id]?.title ?? '',
        running: snapshot.byId[id]?.running === true,
        cwd: typeof snapshot.byId[id]?.cwd === 'string' ? snapshot.byId[id].cwd : '',
      })).slice(0, 40)
    } catch { return [] }
  }
  /* ---------- DSH 会话通道：新建 / 追加都走 sessions 服务，不刷新页面 ---------- */
  function dshSessions(): any {
    try {
      const sessions = dshCtx?.get?.<any>('sessions')
      return sessions !== undefined && typeof sessions.create === 'function' ? sessions : undefined
    } catch { return undefined }
  }
  function dshWorkspaceItems(): Array<{ workspaceId?: string; path?: string }> {
    try {
      const service = dshCtx?.get?.<any>('workspaces')
      const snap = service?.list?.getSnapshot?.()
      if (snap?.phase === 'ready' && Array.isArray(snap.items)) return snap.items
    } catch { /* 服务不可用 */ }
    return []
  }
  function pathKey(path: string): string {
    return path.replace(/[\\/]+$/, '').toLowerCase()
  }
  function workspaceIdOfPath(path: string): string | undefined {
    if (path === '') return undefined
    const key = pathKey(path)
    return dshWorkspaceItems().find(item => typeof item.path === 'string' && pathKey(item.path) === key)?.workspaceId
  }
  function sessionCwd(sessionId: string): string {
    try {
      const snap = dshSessions()?.list?.getSnapshot?.()
      const cwd = (snap?.byId?.[sessionId] as { cwd?: unknown } | undefined)?.cwd
      return typeof cwd === 'string' ? cwd : ''
    } catch { return '' }
  }
  /** 未显式给项目时，回落到门户里选中的项目（避免新会话落到 DSH 默认 cwd）。 */
  function resolveProjectPath(path: string): string {
    if (path !== '') return path
    return ui.project !== 'all' && ui.project !== 'none' ? ui.project : ''
  }
  /** 在项目工作区创建会话：优先 workspaceId（会话会挂进侧栏工作区分组），否则退回 cwd。 */
  async function createSessionIn(projectPath: string): Promise<string> {
    const sessions = dshSessions()
    if (sessions === undefined) throw new Error('当前 DSH 不支持创建会话（缺少 sessions 服务）')
    const target = resolveProjectPath(projectPath)
    const workspaceId = workspaceIdOfPath(target)
    if (workspaceId !== undefined) {
      try { return String(await sessions.create({ workspaceId })) }
      catch (cause) { console.warn('[dsh-workbench] 按 workspaceId 建会话失败，改用 cwd：', cause) }
    }
    return String(await sessions.create(target !== '' ? { cwd: target } : {}))
  }
  /**
   * 向会话追加一轮。三条路：
   * 1) 会话已绑定（正开着）→ 直接 prompt；
   * 2) 未绑定 → 公开的 sessions.retain()（它会启动 opening，ready 才会 resolve）；
   * 3) 老版本没有 retain → retainAgentScope 只借 binding，绝不等 ready。
   * 注意：retainAgentScope 不调用 attachOpening，它的 ready 永远不会 resolve，不能 await。
   */
  async function sendToSession(sessionId: string, text: string): Promise<void> {
    const sessions = dshSessions()
    if (sessions === undefined) throw new Error('当前 DSH 不支持会话发送（缺少 sessions 服务）')
    const send = async (session: any): Promise<void> => {
      if (session === undefined || typeof session.prompt !== 'function') throw new Error('会话服务不可用')
      const result = await session.prompt([{ type: 'text', text }], 'queue')
      if (result && result.ok === false) throw new Error(result.error?.message ?? '发送失败')
    }
    let direct: any
    try { direct = sessions.binding?.(sessionId) } catch { direct = undefined }
    if (direct?.session !== undefined) {
      await send(direct.session)
      return
    }
    if (typeof sessions.retain === 'function') {
      let ref: any
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { ref = sessions.retain(sessionId, { source: 'gateway' }); break }
        catch (cause) {
          // 新建的会话可能还没进本地目录：短暂重试一次再报错
          if (attempt === 2) throw cause
          await new Promise(resolve => window.setTimeout(resolve, 200))
        }
      }
      try {
        Promise.resolve(ref.ready).catch(() => undefined)
        await Promise.race([
          Promise.resolve(ref.ready),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error('会话打开超时')), 10_000)),
        ])
        await send(ref.binding?.session)
      } finally {
        try { ref.release?.() } catch { /* ignore */ }
      }
      return
    }
    if (typeof sessions.retainAgentScope === 'function') {
      const ref = sessions.retainAgentScope(sessionId)
      try { await send(ref.binding?.session); return } finally { try { ref.release?.() } catch { /* ignore */ } }
    }
    throw new Error('当前 DSH 不支持会话发送（缺少 retain 接口）')
  }
  /**
   * 读一个会话已有的事件快照（供灵感页内会话补历史）。
   * 会话没绑定过时用 retain 临时拿一份，读完立刻 release；失败/超时返回空数组，不阻塞 UI。
   */
  async function readSessionEvents(sessionId: string): Promise<any[]> {
    if (sessionId === '') return []
    const sessions = dshSessions()
    if (sessions === undefined) return []
    const eventsOf = (ref: any): any[] => {
      try {
        const snap = ref?.binding?.session?.getSnapshot?.()
        return Array.isArray(snap?.events) ? snap.events : []
      } catch { return [] }
    }
    try {
      const direct = sessions.binding?.(sessionId)
      if (direct?.session !== undefined) return eventsOf(direct)
      if (typeof sessions.retain !== 'function') return []
      const ref = sessions.retain(sessionId, { source: 'gateway' })
      try {
        Promise.resolve(ref?.ready).catch(() => undefined)
        await Promise.race([
          Promise.resolve(ref?.ready),
          new Promise(resolve => window.setTimeout(resolve, 3000)),
        ])
        return eventsOf(ref)
      } finally {
        try { ref?.release?.() } catch { /* ignore */ }
      }
    } catch { return [] }
  }
  async function appendToExistingSession(sessionId: string, text: string): Promise<void> {
    try {
      await sendToSession(sessionId, text)
    } catch (cause) {
      try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
      throw new Error(`${String((cause as Error).message ?? cause)}（提示词已复制到剪贴板）`)
    }
  }
  /* ------------------------------ 智能体团队会话适配 ------------------------------ */
  interface AgentHandlers { event?: (event: any) => void; history?: (events: any[]) => void; status?: (status: string, note?: string) => void; team?: (projection: any) => void }
  interface AgentDispatchInput { ideaId: string; runId: string; teamId: string; feature?: string; goal: string; ideaTitle: string; ideaBrief: string; workspacePath: string; timeoutMs: number }
  const agentSessionOffs: Array<() => void> = []

  /** 读 Lead 会话的 agentTeam 投影；读不到返回 null（由事件解析降级）。 */
  function teamStateOfSession(sessionId: string): any {
    try {
      const sessions = dshCtx?.get?.<any>('sessions')
      const list = sessions?.list
      const snapshot = list?.getSnapshot?.()
      const projection = snapshot?.projectionsBySession?.[sessionId]?.values?.agentTeam
      return projection ?? null
    } catch { return null }
  }
  /** 订阅投影变化；返回退订函数（DSH 版本不支持时为空操作）。 */
  function watchTeam(sessionId: string, callback: (projection: any) => void): () => void {
    const sessions = dshCtx?.get?.<any>('sessions')
    const list = sessions?.list
    if (list === undefined || typeof list.subscribe !== 'function') return () => undefined
    const emit = (): void => { const projection = teamStateOfSession(sessionId); if (projection !== null) callback(projection) }
    emit()
    try {
      const off = list.subscribe(emit)
      return typeof off === 'function' ? off : () => undefined
    } catch { return () => undefined }
  }

  /** 建派发 → 建会话 → 订阅事件 → 发送 kickoff；返回 dispatch/session 供页内会话展示。 */
  async function startAgentDispatch(input: AgentDispatchInput, handlers: AgentHandlers): Promise<{ dispatchId: string; sessionId: string; teamName: string; timeoutMs: number } | null> {
    try {
      let res = await fetch(`${API}/agents/dispatches`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      })
      let body = await res.json().catch(() => ({}))
      /* 409：上一次派发没被收尾。服务端会先做惰性收尾，仍然冲突时由用户确认是否顶掉旧任务。 */
      if (res.status === 409) {
        const old = body?.dispatch
        const started = String(old?.startedAt ?? '')
        const ok = typeof window.confirm === 'function'
          ? window.confirm(`这个灵感还有一次团队执行未结束${started ? `（${started} 开始）` : ''}。\n\n是否停止它，用新任务取代？`)
          : true
        if (!ok) { toast('已取消：请先停止原来的团队任务'); return null }
        if (old?.id !== undefined) {
          await fetch(`${API}/agents/dispatches/${encodeURIComponent(String(old.id))}`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'cancelled', error: '被用户的新派发取代' }),
          }).catch(() => undefined)
        }
        res = await fetch(`${API}/agents/dispatches`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, force: true }),
        })
        body = await res.json().catch(() => ({}))
      }
      if (!res.ok) { toast(body?.message ?? `团队派发失败：HTTP ${res.status}`); return null }
      const dispatch = body.dispatch
      const sessionId = await createSessionIn(input.workspacePath)
      await fetch(`${API}/agents/dispatches/${encodeURIComponent(String(dispatch.id))}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, status: 'running' }),
      }).catch(() => undefined)
      if (handlers.team !== undefined) {
        try { agentSessionOffs.push(watchTeam(sessionId, handlers.team)) } catch { /* 投影不可用就只靠事件 */ }
      }
      const subscribe = dshCtx?.on
      if (typeof subscribe === 'function') {
        try {
          const off = subscribe('session/event', (session: any, event: any) => {
            const sid = session?.id ?? session?.sessionId
            if (String(sid ?? '') === sessionId) handlers.event?.(event)
          })
          if (typeof off === 'function') agentSessionOffs.push(off)
        } catch { /* 订阅失败时仍可发消息，只是没有流式 */ }
      }
      try {
        await sendToSession(sessionId, String(body.kickoff ?? ''))
      } catch (cause) {
        toast(`会话已建但发送失败：${String((cause as Error).message ?? cause)}`)
        await fetch(`${API}/agents/dispatches/${encodeURIComponent(String(dispatch.id))}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'failed', error: String(cause) }),
        }).catch(() => undefined)
        return null
      }
      try {
        const binding = dshSessions()?.binding?.(sessionId)
        const snap = binding?.session?.getSnapshot?.()
        if (Array.isArray(snap?.events)) handlers.history?.(snap.events)
      } catch { /* 历史拿不到就只显示后续事件 */ }
      handlers.status?.('running')
      return { dispatchId: String(dispatch.id), sessionId, teamName: String(body.team?.name ?? ''), timeoutMs: Number(dispatch.timeoutMs) || 15 * 60 * 1000 }
    } catch (cause) {
      toast(`团队派发失败：${String((cause as Error).message ?? cause)}`)
      return null
    }
  }

  async function stopAgentDispatch(dispatchId: string, sessionId: string): Promise<void> {
    try { await sendToSession(sessionId, '请主理人立即停止当前团队工作，保留已完成的结果，并用一句话说明已停止。') } catch { /* 会话已断开时只更新记录 */ }
    await fetch(`${API}/agents/dispatches/${encodeURIComponent(dispatchId)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => undefined)
  }

  function focusSession(sessionId: string): void {
    try {
      const nav = dshCtx?.get?.<any>('uiWorkspace')
      if (nav !== undefined && typeof nav.openSession === 'function') nav.openSession(sessionId)
    } catch { /* 打开失败不影响已发出的消息 */ }
  }
  /** 新建工作区会话 → 发送提示词 → 回写 → 切到该会话；失败时把提示词放进剪贴板。 */
  async function dispatchToNewSession(projectPath: string, prompt: string, onSent?: (sessionId: string) => Promise<void> | void, options: { focus?: boolean } = {}): Promise<string> {
    try {
      const sessionId = await createSessionIn(projectPath)
      await sendToSession(sessionId, prompt)
      if (onSent !== undefined) {
        try { await onSent(sessionId) } catch (cause) { console.warn('[dsh-workbench] 会话已发出，但回写失败：', cause) }
      }
      if (options.focus !== false) {
        focusSession(sessionId)
        toast('已在新会话发出')
      }
      return sessionId
    } catch (cause) {
      const message = String((cause as Error).message ?? cause)
      db.settings.lastAiError = `${nowStamp()} ${message}`
      scheduleSave()
      try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
      throw new Error(`${message}（提示词已复制到剪贴板，可手动粘贴到新会话）`)
    }
  }
  /** Bug 提交后回写状态与 AI 会话标记（原刷新链路的 consumePendingRepair 才做这件事）。 */
  async function markBugsDispatched(ids: string[], sessionId: string): Promise<void> {
    let changed = false
    for (const id of ids) {
      const bug = bugOf(id)
      if (bug === undefined) continue
      const next: Bug = { ...bug, status: bug.status === 'resolved' ? 'resolved' : 'doing', aiThreadId: sessionId }
      const index = bugs.findIndex(item => item.id === id)
      if (index >= 0) bugs[index] = next
      changed = true
      try {
        await fetch(`${API}/bugs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bug: next }) })
      } catch (cause) { console.warn('[dsh-workbench] Bug 状态回写失败：', cause) }
    }
    if (changed && ui.view === 'bugs') refreshBugMain()
  }
  /** 本次「AI 协同 / 提交修复」会提交的 Bug 列表（与提示词同源，避免说的和做的不是一批）。 */
  function bugDispatchList(): Bug[] {
    const selected = bugs.filter(bug => bugSelected.has(bug.id))
    return selected.length > 0 ? selected : bugFiltered().filter(bug => bug.status !== 'resolved').slice(0, 10)
  }
  function defaultDispatchPrompt(kind: string): string {
    const product = productOf(productSelected)
    const testProject = testProjectOf(testProjectSelected)
    if (kind === 'product' && product) {
      const mods = productModuleList(product)
      const noteCount = productNoteList(product).length
      const map = activeMap()
      const mapId = productMapSelected
      const mapArg = mapId === '' ? '' : `, mapId:"${mapId}"`
      const mapLine = map === undefined
        ? `- 导图：整产品（旧版单导图）`
        : `- 当前导图：${map.name}（mapId: ${map.id}）${map.description ? ` — ${map.description}` : ''}\n- 同产品其他导图：${productMaps.filter(m => m.id !== map.id).map(m => m.name).join('、') || '无'}\n- 本次只处理这张导图；用工具写入时必须带 ${mapArg.slice(2)}`
      return `产品续做任务：${product.name}

你是资深产品经理，继续推进本产品的设计工作。
- 产品 ID：${product.id}
- 工作区绝对路径：${product.workspacePath || '未关联'}
${mapLine}
- 当前进度：${mods.length} 个模块/业务/功能节点 · ${noteCount} 篇设计笔记 · ${productDemoList(product).length} 个 Demo
- 导图 JSON：${mapMindmap().slice(0, 4000)}

请检查模块/业务/功能/需求与 PC/移动/平板平台覆盖，找出缺口，然后：
1. 补齐缺失的详细设计：调用 workbench_product_note_publish（含 productId${mapArg}、moduleId、platform、title、content）。
2. 需要拆分结构时调用 workbench_module_publish（含 productId${mapArg}；同名节点会更新，不要担心重复）。
3. 完成后汇报补了哪些模块/笔记。不要只回复正文。`
    }
    if (kind === 'product' && product === undefined) {
      return '产品续做任务：（没有选中产品）\n\n请先在左侧选择一个产品；当前没有可提交的产品，这条提示词不会被执行。'
    }
    if (kind === 'test' && testProject === undefined) {
      return '测试续做任务：（没有选中测试项目）\n\n请先在左侧选择一个测试项目；当前没有可提交的测试项目，这条提示词不会被执行。'
    }
    if (kind === 'test' && testProject) {
      const cases = testCasesOf(testProject)
      return `测试续做任务：${testProject.name}

你是资深 QA，继续推进本测试项目。
- projectId：${testProject.id}
- 工作区绝对路径：${testProject.workspacePath || '未关联'}
- 产品：${productOf(testProject.productId)?.name ?? '未关联'}
- 当前进度：${cases.length} 条用例 · ${testRunsOf(testProject).length} 次运行

请按模块/端检查用例覆盖缺口，补齐用例（调用 workbench_testcase_publish，同名标题会更新）；若已有失败/阻塞项，分析原因并把问题录入 Bug（调用 workbench_bug_publish）。完成后简短汇报。`
    }
    const list = bugDispatchList()
    if (list.length === 0) return '当前没有未关闭的 Bug：请检查该工作区的构建与测试现状，列出发现的问题并给出修复建议。'
    return bugPrompt(list)
  }
  function openAiDispatch(kind: string, presetPrompt?: string): void {
    if (kind === 'product' && productOf(productSelected) === undefined) { toast('先在左侧选择一个产品，再开 AI 协同'); return }
    if (kind === 'test' && testProjectOf(testProjectSelected) === undefined) { toast('先在左侧选择一个测试项目，再开 AI 协同'); return }
    if (kind === 'note' && noteById(noteSelected) === undefined) { toast('先在左侧选择一篇笔记，再开 AI 协同'); return }
    if (kind === 'bug' && bugDispatchList().length === 0) { toast('当前没有可提交的未关闭 Bug'); return }
    const rows = dshSessionRows()
    const options = rows.length > 0
      ? rows.map(row => {
        const where = row.cwd ? bugWorkspaceName(row.cwd) : '未分组'
        return `<option value="${row.id}">${esc(row.title || row.id.slice(-8))} · ${esc(where)}${row.running ? ' · 运行中' : ''}</option>`
      }).join('')
      : '<option value="">（无可用已有会话）</option>'
    const withWhere = (name: string, path: string): string => path !== '' ? `${name} · ${bugWorkspaceName(path)}` : name
    let where = '默认工作区'
    if (kind === 'product') {
      const item = productOf(productSelected)
      if (item !== undefined) where = withWhere(item.name, item.workspacePath)
    } else if (kind === 'test') {
      const item = testProjectOf(testProjectSelected)
      if (item !== undefined) where = withWhere(item.name, item.workspacePath)
    } else if (kind === 'note') {
      const book = notebookOf(noteById(noteSelected)?.notebookId)
      if (book !== undefined) where = withWhere(book.name, book.workspacePath ?? '')
    } else {
      const item = bugProjectOf(bugDispatchList()[0]?.projectId)
      if (item !== undefined) where = withWhere(item.name, item.workspacePath)
    }
    openModal(`<h3>AI 协同</h3>
      <div class="mfield"><label>执行目标</label><select id="wb-dispatch-target"><option value="">新建会话（${esc(where)}）</option>${options}</select></div>
      <div class="mfield"><label>下一步提示词</label><textarea class="dispatch-prompt" id="wb-dispatch-prompt" rows="6">${esc(presetPrompt ?? defaultDispatchPrompt(kind))}</textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">新建会话会直接在当前项目工作区创建并发出、不刷新页面；选已有会话则追加一轮（括号里是会话所属工作区）。发送失败时提示词会留在剪贴板。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="ai-dispatch-run" data-kind="${kind}">执行下一步</button></div>`)
  }
  async function runAiDispatch(kind: string): Promise<void> {
    if (kind === 'product' && productOf(productSelected) === undefined) { toast('没有选中产品'); return }
    if (kind === 'test' && testProjectOf(testProjectSelected) === undefined) { toast('没有选中测试项目'); return }
    if (kind === 'note' && noteById(noteSelected) === undefined) { toast('没有选中笔记'); return }
    const prompt = $id<HTMLTextAreaElement>('wb-dispatch-prompt')?.value.trim() ?? ''
    const target = $id<HTMLSelectElement>('wb-dispatch-target')?.value ?? ''
    if (prompt === '') return
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    if (target !== '') {
      closeModal()
      try {
        await appendToExistingSession(target, prompt)
        if (kind === 'bug') {
          const ids = bugDispatchList().map(bug => bug.id)
          if (ids.length > 0) await markBugsDispatched(ids, target)
        }
        toast('已追加到已有会话')
      } catch (cause) { toast(`追加失败：${String((cause as Error).message ?? cause)}`) }
      return
    }
    closeModal()
    try {
      if (kind === 'bug') {
        const list = bugDispatchList()
        if (list.length === 0) { toast('没有可提交的 Bug'); return }
        // 一个会话只能绑定一个工作区，跨项目时只提交首个项目的 Bug
        const projects = Array.from(new Set(list.map(b => b.projectId)))
        const project = bugProjectOf(projects[0])
        if (!project?.workspacePath) { toast('项目还没关联工作区，请先编辑项目'); return }
        const submitted = projects.length > 1 ? list.filter(b => b.projectId === projects[0]) : list
        if (projects.length > 1) toast(`选中的 Bug 跨 ${projects.length} 个项目，本次仅提交「${project.name}」的 ${submitted.length} 条`)
        await queueRepairSession(project, prompt, submitted.map(b => b.id))
        return
      }
      if (kind === 'test') { await queueTestPrompt(prompt); return }
      if (kind === 'note') { await queueNoteImprove(prompt); return }
      await queueProductPrompt(prompt)
    } catch (cause) { toast(`提交失败：${String((cause as Error).message ?? cause)}`) }
  }

  function bindProduct(): void {
    const searchEl = $id<HTMLInputElement>('pm-search')
    if (searchEl !== null) {
      searchEl.value = productSearch
      searchEl.addEventListener('input', () => { productSearch = searchEl.value })
      searchEl.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        event.stopPropagation()
        jumpToSearchHit()
      })
    }
    const modKindSel = $id<HTMLSelectElement>('wb-mod-kind')
    if (modKindSel !== null) {
      modKindSel.value = moduleFilterKind
      modKindSel.addEventListener('change', () => { moduleFilterKind = modKindSel.value; renderContent() })
    }
    const modPlatformSel = $id<HTMLSelectElement>('wb-mod-platform')
    if (modPlatformSel !== null) {
      modPlatformSel.value = moduleFilterPlatform
      modPlatformSel.addEventListener('change', () => { moduleFilterPlatform = modPlatformSel.value; renderContent() })
    }
    const archivedToggle = $id<HTMLInputElement>('wb-show-archived')
    if (archivedToggle !== null) {
      archivedToggle.checked = showArchived
      archivedToggle.addEventListener('change', () => { showArchived = archivedToggle.checked; void loadProducts().then(() => renderContent()) })
    }
    if (productTab === 'modules' || productTab === 'notes') ensureProductChat()
    $id<HTMLSelectElement>('wb-product-select')?.addEventListener('change', e => {
      productSelected = (e.currentTarget as HTMLSelectElement).value
      productNodeSelected = null
      productDemoSelected = ''
      productMapSelected = ''
      productMapScopeAll = false
      productPicked = productDefaultPicked(productOf(productSelected))
      void loadProductMaps().then(() => {
        productPicked = productDefaultPicked(productOf(productSelected))
        renderContent()
      })
    })
    $id<HTMLSelectElement>('wb-map-scope')?.addEventListener('change', e => {
      const value = (e.currentTarget as HTMLSelectElement).value
      if (value === 'all') productMapScopeAll = true
      else { productMapScopeAll = false; productMapSelected = value }
      productNodeSelected = null
      productPicked = productDefaultPicked(productOf(productSelected))
      renderContent()
    })
    $id<HTMLSelectElement>('wb-product-style')?.addEventListener('change', e => { productStyle = (e.currentTarget as HTMLSelectElement).value; renderContent() })
    $id<HTMLSelectElement>('wb-product-platform')?.addEventListener('change', e => { productPlatform = (e.currentTarget as HTMLSelectElement).value as typeof productPlatform; renderContent() })
    $id<HTMLSelectElement>('wb-product-kind')?.addEventListener('change', e => { productDemoKind = (e.currentTarget as HTMLSelectElement).value as typeof productDemoKind; renderContent() })
  }

  /* ---------- 测试 ---------- */
  const PLATFORMS = ['all', 'pc', 'mobile', 'tablet'] as const
  function platformLabel(value: string): string { return value === 'pc' ? 'PC' : value === 'mobile' ? '移动' : value === 'tablet' ? '平板' : '全部' }
  function testProjectOf(id: string | null | undefined): TestProject | undefined { return testProjects.find(p => p.id === id) }
  function testCasesOf(project: TestProject | undefined): TestCase[] { return project ? testCases.filter(c => c.projectId === project.id) : [] }
  function testRunsOf(project: TestProject | undefined): TestRun[] { return project ? testRuns.filter(r => r.projectId === project.id) : [] }
  function testRunOf(id: string | null | undefined): TestRun | undefined { return testRuns.find(r => r.id === id) }
  function testResultOf(run: TestRun, caseId: string): TestResult { return run.results.find(r => r.caseId === caseId) ?? { caseId, status: 'pending', note: '', bugId: '' } }
  /** 有效结果 = 用例仍存在的结果（用例被删除后的孤儿结果不计入 KPI，与卡片展示一致）。 */
  function testValidResults(run: TestRun): TestResult[] {
    return run.results.filter(r => testCases.some(tc => tc.id === r.caseId))
  }
  function testCounts(run: TestRun): { total: number; pass: number; fail: number; blocked: number; pending: number; rate: number } {
    const results = testValidResults(run)
    const total = results.length
    const pass = results.filter(r => r.status === 'pass').length
    const fail = results.filter(r => r.status === 'fail').length
    const blocked = results.filter(r => r.status === 'blocked').length
    const pending = results.filter(r => r.status === 'pending').length
    return { total, pass, fail, blocked, pending, rate: total === 0 ? 0 : Math.round((pass / total) * 100) }
  }
  const TEST_STATUS_LABEL: Record<string, string> = { running: '进行中', passed: '已通过', failed: '未通过', blocked: '有阻塞' }
  const TEST_RESULT_LABEL: Record<string, string> = { pass: '通过', fail: '失败', blocked: '阻塞', pending: '待测' }
  async function loadTests(silent = false): Promise<void> {
    if (testLoading) return
    testLoading = true
    if (!silent) { testError = ''; if (ui.view === 'test') renderContent() }
    try {
      const [tRes, pRes, nRes] = await Promise.all([fetch(`${API}/tests`), fetch(`${API}/products`), fetch(`${API}/notes`)])
      if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`)
      const tData = await tRes.json() as { projects?: TestProject[]; cases?: TestCase[]; runs?: TestRun[] }
      testProjects = Array.isArray(tData.projects) ? tData.projects : []
      testCases = Array.isArray(tData.cases) ? tData.cases : []
      testRuns = Array.isArray(tData.runs) ? tData.runs : []
      if (pRes.ok) { const p = await pRes.json() as any; products = Array.isArray(p.products) ? p.products : products; productDemos = Array.isArray(p.demos) ? p.demos : productDemos; productModules = Array.isArray(p.modules) ? p.modules : productModules }
      if (nRes.ok) { const n = await nRes.json() as any; notes = Array.isArray(n.notes) ? n.notes : notes; notebooks = Array.isArray(n.notebooks) ? n.notebooks : notebooks }
      if (testProjectSelected === null || testProjectOf(testProjectSelected) === undefined) testProjectSelected = testProjects[0]?.id ?? null
      if (testRunSelected === null || testRunOf(testRunSelected) === undefined) testRunSelected = testRunsOf(testProjectOf(testProjectSelected))[0]?.id ?? null
      testError = ''
    } catch (cause) { if (!silent) testError = String((cause as Error).message ?? cause) }
    testLoading = false
    if (ui.view !== 'test') return
    const sig = JSON.stringify({ p: testProjects.map(p => [p.id, p.updatedAt]), c: testCases.length, r: testRuns.map(r => [r.id, r.status, r.results.length]) })
    if (!silent || sig !== testSig) { testSig = sig; if (($id('wb-modal')?.innerHTML ?? '') === '') renderContent() }
  }
  function testPrompt(project: TestProject, source: 'requirement' | 'notes' | 'demo', requirement: string): string {
    const product = productOf(project.productId)
    let context = ''
    if (source === 'notes' && product) {
      context = productNoteList(product).map(n => `## ${n.title}\n${n.content.slice(0, 6000)}`).join('\n\n')
    } else if (source === 'demo' && product) {
      // Demo 给工作区绝对文件路径（工作区 Agent 可直接读取），相对 Web URL 够不着（A5）
      const demos = productDemoList(product).map(d => `- ${d.title}（${PRODUCT_STYLES.find(s => s.id === d.style)?.name ?? d.style} / ${d.scope === 'all' ? '整个产品' : '单功能'}） → ${d.filePath || '（未落盘）'}`).join('\n')
      const mindmapPath = product.workspacePath ? `${product.workspacePath}/.dsh-workbench/products/${product.id}/mindmap.json` : '（产品未关联工作区）'
      context = `产品 Demo（工作区文件，请直接读取）：\n${demos || '（还没有 Demo）'}\n\n导图 JSON：${mindmapPath}\n\n设计笔记：\n${productNoteList(product).map(n => `## ${n.title}\n${n.content.slice(0, 4000)}`).join('\n\n')}`
    }
    const existingTitles = testCasesOf(project).map(c => `- ${c.title}`).join('\n')
    return `测试用例生成任务

你是资深 QA 与测试架构师。请为测试项目生成可逐条执行的测试用例。

【测试项目】
- projectId：${project.id}
- 名称：${project.name}
- 工作区：${project.workspacePath}
- 产品：${product?.name ?? '未关联产品'}
- 默认端：${platformLabel(project.platform ?? 'all')}${project.moduleId ? `
- 默认模块：${productModules.find(m => m.id === project.moduleId)?.name ?? project.moduleId}` : ''}

【输入来源】${source === 'requirement' ? '需求描述' : source === 'notes' ? '产品设计笔记' : '产品 Demo + 设计笔记'}

【需求 / 上下文】
${requirement.trim() || '未填写额外需求；请覆盖该产品或项目的主要功能、异常、边界与权限。'}
${context ? `\n【产品上下文】\n${context.slice(0, 30_000)}` : ''}
${existingTitles ? `\n【已有用例（勿重复生成同名/同覆盖用例）】\n${existingTitles}` : ''}

【要求】
1. 每条用例调用一次工具 workbench_testcase_publish，参数：{ projectId:"${project.id}", title, precondition, steps:["..."], expected, priority:"P0|P1|P2|P3", type:"functional|boundary|exception|permission|regression", source:"${source}", moduleId:"模块 id（尽量填写，便于模块覆盖统计）", platform:"pc|mobile|tablet|all" }。
2. 覆盖正例、反例、边界、异常、权限/幂等（按需）；用例步骤要可执行、预期要可判定；标题与上面已有用例不重复。
3. 尽量带上 moduleId / platform，便于按模块和端统计覆盖。
4. 不要只回复用例正文；不要用 write/edit 写文件；唯一交付方式是调用工具。
5. 生成 6-12 条（每个功能 2-4 条 × 功能数，上限 12），完成后简短汇总。`
  }
  async function queueTestPrompt(prompt: string): Promise<void> {
    const project = testProjectOf(testProjectSelected)
    await dispatchToNewSession(project?.workspacePath ?? '', prompt)
  }
  function openTestProject(id?: string): void {
    const project = testProjectOf(id)
    const workspaces = bugWorkspaceItems()
    const current = project?.workspacePath ?? workspaces[0]?.path ?? ''
    const productOptions = products.map(p => `<option value="${p.id}" ${p.id === project?.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    openModal(`<h3>${project ? '编辑测试项目' : '新建测试项目'}</h3>
      <div class="mfield"><label>项目名称</label><input id="wb-test-name" value="${esc(project?.name ?? '')}" placeholder="例如：工作台 v1 回归测试"></div>
      <div class="mfield"><label>关联 DSH 工作区</label><select id="wb-test-ws">${workspaces.map(ws => `<option value="${esc(ws.path)}" ${ws.path === current ? 'selected' : ''}>${esc(bugWorkspaceName(ws.path))} · ${esc(ws.path)}</option>`).join('')}</select></div>
      <div class="mfield"><label>工作区路径</label><input id="wb-test-path" value="${esc(current)}"></div>
      <div class="mfield"><label>关联产品（可选，用于从笔记/Demo 生成用例）</label><select id="wb-test-product"><option value="">不关联</option>${productOptions}</select></div>
      <div class="mfield"><label>默认模块（可选）</label><select id="wb-test-module"><option value="">不指定</option>${productModules.map(m => `<option value="${m.id}" ${project?.moduleId === m.id ? 'selected' : ''}>${esc(m.name)} · ${m.platform.toUpperCase()}</option>`).join('')}</select></div>
      <div class="mfield"><label>默认端</label><select id="wb-test-platform">${PLATFORMS.map(p => `<option value="${p}" ${(project?.platform ?? 'all') === p ? 'selected' : ''}>${platformLabel(p)}</option>`).join('')}</select></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">会自动创建「测试：名称」Bug 项目；用例/报告保存到工作区 .dsh-workbench/tests/。</div>
      <div class="modal-foot">${project ? `<button class="btn" data-act="test-delete" data-id="${project.id}">${ic('trash', 12)}删除项目</button>` : ''}<button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="test-save" data-id="${project?.id ?? ''}">${project ? '保存' : '创建项目'}</button></div>`)
    $id<HTMLSelectElement>('wb-test-ws')?.addEventListener('change', e => { const p = $id<HTMLInputElement>('wb-test-path'); if (p) p.value = (e.currentTarget as HTMLSelectElement).value })
  }
  async function saveTestProject(id: string): Promise<void> {
    const name = $id<HTMLInputElement>('wb-test-name')?.value.trim() ?? ''
    if (name === '') { $id<HTMLInputElement>('wb-test-name')?.focus(); return }
    const existing = testProjectOf(id)
    const body = { project: { id: id || undefined, name, description: existing?.description ?? '', workspacePath: $id<HTMLInputElement>('wb-test-path')?.value.trim() ?? '', productId: $id<HTMLSelectElement>('wb-test-product')?.value ?? '', moduleId: $id<HTMLSelectElement>('wb-test-module')?.value ?? '', platform: $id<HTMLSelectElement>('wb-test-platform')?.value ?? 'all' } }
    try {
      const res = await fetch(`${API}/tests/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json() as { project?: TestProject; message?: string }
      if (!res.ok || !data.project) throw new Error(data.message ?? `HTTP ${res.status}`)
      testProjectSelected = data.project.id; testRunSelected = null
      closeModal(); await loadTests(true); renderContent(); toast('测试项目已保存')
    } catch (cause) { toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function deleteTestProject(id: string): Promise<void> {
    if (!window.confirm('删除测试项目及其用例/运行？工作区报告文件不会删除。')) return
    try {
      const res = await fetch(`${API}/tests/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      testProjectSelected = null; testRunSelected = null; closeModal(); await loadTests(true); renderContent(); toast('测试项目已删除')
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }
  function openTestGen(): void {
    const project = testProjectOf(testProjectSelected)
    if (!project) { toast('先创建测试项目'); return }
    const productOptions = products.map(p => `<option value="${p.id}" ${p.id === project.productId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
    openModal(`<h3>AI 生成测试用例</h3>
      <div class="mfield"><label>输入来源</label><select id="wb-test-source"><option value="requirement" ${testGenSource === 'requirement' ? 'selected' : ''}>手写需求</option><option value="notes" ${testGenSource === 'notes' ? 'selected' : ''}>产品设计笔记</option><option value="demo" ${testGenSource === 'demo' ? 'selected' : ''}>产品 Demo + 笔记</option></select></div>
      <div class="mfield"><label>关联产品</label><select id="wb-test-gen-product"><option value="">不选择</option>${productOptions}</select></div>
      <div class="mfield"><label>需求 / 额外要求</label><textarea id="wb-test-req" rows="5" placeholder="例如：测试工作台任务创建、四象限、日历视图；重点覆盖异常与权限">${esc(testGenRequirement)}</textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">AI 会新建工作区会话并逐条调用 workbench_testcase_publish；消耗额度。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="test-gen-run">开始生成</button></div>`)
  }
  async function runTestGen(): Promise<void> {
    const project = testProjectOf(testProjectSelected)
    if (!project) return
    const source = ($id<HTMLSelectElement>('wb-test-source')?.value ?? 'requirement') as 'requirement' | 'notes' | 'demo'
    const requirement = $id<HTMLTextAreaElement>('wb-test-req')?.value ?? ''
    if (source === 'requirement' && requirement.trim() === '') { toast('先输入需求'); $id<HTMLTextAreaElement>('wb-test-req')?.focus(); return }
    if (source !== 'requirement' && project.productId === '') { toast('先给测试项目关联产品'); return }
    testGenSource = source; testGenRequirement = requirement
    if (!window.confirm('AI 将新建会话并生成多条测试用例，继续？')) return
    const prompt = testPrompt(project, source, requirement)
    try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
    closeModal(); toast('正在新建用例生成会话…')
    try { await queueTestPrompt(prompt) } catch (cause) { toast(`提交失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function startTestRun(): Promise<void> {
    const project = testProjectOf(testProjectSelected)
    if (!project) return
    const cases = testCasesOf(project)
    if (cases.length === 0) { toast('先生成测试用例'); return }
    const run = { projectId: project.id, name: `测试运行 ${new Date().toLocaleString()}`, status: 'running', results: cases.map(c => ({ caseId: c.id, status: 'pending', note: '', bugId: '' })), summary: {} }
    try {
      const res = await fetch(`${API}/tests/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run }) })
      const data = await res.json() as { run?: TestRun }
      if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`)
      testRunSelected = data.run.id; testTab = 'run'; await loadTests(true); renderContent()
    } catch (cause) { toast(`启动失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function updateTestResult(runId: string, caseId: string, status: TestResult['status'], bugId?: string, note?: string): Promise<void> {
    const run = testRunOf(runId)
    if (!run) return
    const results = run.results.map(r => r.caseId === caseId ? { ...r, status, bugId: bugId ?? r.bugId, note: note ?? r.note } : r)
    try {
      const res = await fetch(`${API}/tests/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: { ...run, results } }) })
      const data = await res.json() as { run?: TestRun }
      if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`)
      Object.assign(run, data.run); renderContent()
    } catch (cause) { toast(`更新失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function createBugFromTest(runId: string, caseId: string): Promise<void> {
    const run = testRunOf(runId); const project = testProjectOf(run?.projectId); const testCase = testCases.find(c => c.id === caseId)
    if (!run || !project || !testCase) return
    if (!project.bugProjectId) { toast('该项目还没关联 Bug 项目，请先在测试项目里配置'); return }
    const result = testResultOf(run, caseId)
    if (result.status === 'pass') { toast('该用例已通过，不需要录 Bug'); return }
    const severity = testCase.priority === 'P0' ? 'blocker' : testCase.priority === 'P1' ? 'major' : testCase.priority === 'P3' ? 'trivial' : 'minor'
    const description = `来源：测试项目「${project.name}」/ 运行 ${run.name}\n用例：${testCase.title}\n\n前置条件：${testCase.precondition || '-'}\n步骤：\n${testCase.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n预期：${testCase.expected}\n实际：${result.note || '未填写'}`
    try {
      const res = await fetch(`${API}/bugs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bug: { projectId: project.bugProjectId, title: `[测试] ${testCase.title}`, description, status: 'open', severity, priority: testCase.priority, platform: testCase.platform || project.platform || 'all', moduleId: testCase.moduleId || project.moduleId || '', tags: ['测试', project.name, testCase.id] } }) })
      const data = await res.json() as { bug?: { id: string }; message?: string }
      if (!res.ok || !data.bug) throw new Error(data.message ?? `HTTP ${res.status}`)
      // 不覆盖已有判定：仅当还是待测时才落成 fail
      await updateTestResult(runId, caseId, result.status === 'pending' ? 'fail' : result.status, data.bug.id)
      toast(`已录入 Bug：${data.bug.id.slice(-6)}`)
    } catch (cause) { toast(`录入失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function finishTestRun(runId: string): Promise<void> {
    const run = testRunOf(runId)
    if (!run) return
    const counts = testCounts(run)
    if (counts.pending > 0) {
      const ok = typeof window.confirm === 'function' ? window.confirm(`仍有 ${counts.pending} 条用例未测。完成并生成报告？`) : true
      if (!ok) return
    }
    const status = counts.fail > 0 ? 'failed' : counts.blocked > 0 ? 'blocked' : counts.pending > 0 ? 'blocked' : 'passed'
    const summary = { total: counts.total, pass: counts.pass, fail: counts.fail, blocked: counts.blocked, pending: counts.pending, rate: counts.rate }
    try {
      const res = await fetch(`${API}/tests/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: { ...run, status, summary, finishedAt: new Date().toISOString() } }) })
      const data = await res.json() as { run?: TestRun }
      if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`)
      Object.assign(run, data.run)
      if (status === 'passed') {
        for (const result of run.results) {
          if (!result.bugId) continue
          await fetch(`${API}/bugs/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bugId: result.bugId, status: 'verify', verification: `回归通过：${run.name}` }) }).catch(() => undefined)
        }
      }
      testTab = 'report'; await loadTests(true); renderContent()
      toast(status === 'passed' ? '测试通过，报告已生成' : `测试完成：${counts.pass}/${counts.total} 通过`)
    } catch (cause) { toast(`完成失败：${String((cause as Error).message ?? cause)}`) }
  }
  async function regressionRun(): Promise<void> {
    const run = testRunOf(testRunSelected); const project = testProjectOf(run?.projectId)
    if (!run || !project) return
    const failed = run.results.filter(r => r.status === 'fail' || r.status === 'blocked')
    if (failed.length === 0) { toast('没有失败/阻塞用例'); return }
    const ok = typeof window.confirm === 'function' ? window.confirm(`对 ${failed.length} 条失败/阻塞用例发起回归运行？`) : true
    if (!ok) return
    try {
      const res = await fetch(`${API}/tests/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: { projectId: project.id, name: `回归 ${new Date().toLocaleString()}`, status: 'running', results: failed.map(r => ({ caseId: r.caseId, status: 'pending', note: r.note, bugId: r.bugId })), summary: {} } }) })
      const data = await res.json() as { run?: TestRun }
      if (!res.ok || !data.run) throw new Error(`HTTP ${res.status}`)
      testRunSelected = data.run.id; testTab = 'run'; await loadTests(true); renderContent()
    } catch (cause) { toast(`回归启动失败：${String((cause as Error).message ?? cause)}`) }
  }
  function testExecPrompt(project: TestProject, run: TestRun): string {
    const product = productOf(project.productId)
    const cases = testCasesOf(project).filter(c => run.results.some(r => r.caseId === c.id))
    const lines = cases.map((c, i) => {
      const r = testResultOf(run, c.id)
      return `${i + 1}. caseId=${c.id} [${c.priority}] ${c.title}${r.status !== 'pending' ? `（当前：${TEST_RESULT_LABEL[r.status]}）` : ''}
   前置：${c.precondition || '-'}
   步骤：${c.steps.map((s, k) => `${k + 1}) ${s}`).join(' / ')}
   预期：${c.expected}`
    }).join('\n\n')
    return `测试执行任务

你是资深测试工程师。请在工作区里逐条执行下面的测试用例，把结果回写到工作台，失败的自动录 Bug。

【测试项目】
- projectId：${project.id}
- runId：${run.id}
- 工作区绝对路径：${project.workspacePath || '未关联'}
- 产品：${product?.name ?? '未关联'}
- 端：${platformLabel(project.platform || 'all')}

【执行方式】
- 能自动化的用例：在工作区里运行应用/测试脚本/构建后实际验证（如启动服务、调用接口、跑单测）。
- 不能自动化的用例（需人工界面操作）：基于代码与设计笔记推断实际行为，无法确定时状态写 blocked 并在 note 说明"需人工验证"。
- 不伪造结果；没跑过就不要写 pass。

【回写工具（每条用例执行完立即调用）】
workbench_test_result_publish
参数：{ projectId:"${project.id}", runId:"${run.id}", caseId, status:"pass|fail|blocked", note:"实际结果/证据", bugTitle:"失败时的 Bug 标题（可选）", bugDescription:"失败时的复现步骤（可选）" }

【硬性约束】
- 一次只执行一条，回写后再做下一条。
- 不修改与测试无关的文件；不执行 git commit/push。
- 全部完成后简短汇总：通过 N / 失败 M / 阻塞 K，失败项对应的 Bug。

【用例清单】

${lines}`
  }
  async function queueTestExec(project: TestProject, run: TestRun): Promise<void> {
    const prompt = testExecPrompt(project, run)
    await dispatchToNewSession(project.workspacePath, prompt)
  }
  function openTestExecDispatch(): void {
    const project = testProjectOf(testProjectSelected)
    const run = testRunOf(testRunSelected) ?? testRunsOf(project)[0]
    if (!project || !run) { toast('先启动一次测试运行'); return }
    const rows = dshSessionRows()
    const options = rows.length > 0 ? rows.map(row => `<option value="${row.id}">${esc(row.title || row.id.slice(-8))}${row.running ? ' · 运行中' : ''}</option>`).join('') : '<option value="">（无可用已有会话）</option>'
    const prompt = testExecPrompt(project, run)
    openModal(`<h3>AI 自动化测试</h3>
      <div class="mfield"><label>执行目标</label><select id="wb-dispatch-target"><option value="">新建工作区会话</option>${options}</select></div>
      <div class="mfield"><label>测试执行提示词</label><textarea class="dispatch-prompt" id="wb-dispatch-prompt" rows="6">${esc(prompt)}</textarea></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px;line-height:1.6">AI 将逐条执行用例并通过 workbench_test_result_publish 回写结果；失败项可自动录 Bug。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="test-exec-run" data-run="${run.id}">开始执行</button></div>`)
  }
  function testReportHtml(project: TestProject, run: TestRun): string {
    const c = testCounts(run)
    const cards = run.results.map(r => testCases.find(tc => tc.id === r.caseId)).filter((tc): tc is TestCase => Boolean(tc)).map(tc => {
      const r = testResultOf(run, tc.id)
      const color = r.status === 'pass' ? '#34d399' : r.status === 'fail' ? '#fb7185' : r.status === 'blocked' ? '#fbbf24' : '#64748b'
      return `<article class="case ${r.status}"><header><span>${esc(tc.priority)}</span><b>${esc(tc.title)}</b><i style="--c:${color}">${TEST_RESULT_LABEL[r.status] ?? r.status}</i></header><p>${esc(tc.expected)}</p>${r.note ? `<small>${esc(r.note)}</small>` : ''}</article>`
    }).join('')
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(project.name)} · 测试报告</title><style>
      :root{--bg:#070b14;--panel:#0e1626;--line:#1e2c44;--text:#e8eefc;--muted:#8ca0c0;--accent:#5b8cff}
      *{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 20% 0%,#16244a,transparent 60%),var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC",sans-serif}
      .wrap{max-width:1100px;margin:0 auto;padding:38px 28px 70px}.top{display:flex;align-items:center;gap:12px}.brand{font-weight:800;font-size:22px;letter-spacing:-.4px}.badge{border:1px solid var(--line);border-radius:99px;padding:3px 9px;font-size:10px;color:var(--muted)}
      h1{font-size:38px;margin:22px 0 4px;letter-spacing:-1px}.sub{color:var(--muted);font-size:13px}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:26px 0}
      .kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}.kpi b{display:block;font-size:26px}.kpi span{font-size:10px;color:var(--muted)}.kpi.pass b{color:#34d399}.kpi.fail b{color:#fb7185}.kpi.blocked b{color:#fbbf24}
      .report{display:grid;grid-template-columns:270px 1fr;gap:16px}.ring{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;text-align:center}.ring .donut{width:150px;height:150px;border-radius:50%;margin:10px auto;background:conic-gradient(#34d399 0 ${c.rate}%,#fb7185 ${c.rate}% ${c.rate + (c.total ? c.fail / c.total * 100 : 0)}%,#334155 0);display:grid;place-items:center;position:relative;box-shadow:0 0 40px #34d39933}
      .ring .donut::after{content:'';position:absolute;inset:16px;border-radius:50%;background:var(--panel)}.ring .donut b{position:relative;z-index:1;font-size:30px}
      .bars{display:flex;align-items:flex-end;gap:10px;height:230px;padding:20px;background:var(--panel);border:1px solid var(--line);border-radius:14px;perspective:700px}
      .bar{flex:1;min-width:14px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,#5b8cff,#2e4b9c);transform-origin:bottom;animation:grow 1s cubic-bezier(.2,.8,.2,1) both;height:var(--h)}
      .bar.pass{background:linear-gradient(180deg,#34d399,#166534)}.bar.fail{background:linear-gradient(180deg,#fb7185,#7f1d1d)}.bar.pending{background:linear-gradient(180deg,#64748b,#1e293b)}
      @keyframes grow{from{transform:scaleY(0) rotateX(30deg);opacity:.2}to{transform:scaleY(1) rotateX(0);opacity:1}}
      .cases{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.case{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:10px 12px}.case header{display:flex;align-items:center;gap:7px}.case header span{font-size:9px;color:var(--accent)}.case header b{font-size:11.5px;flex:1}.case header i{font-style:normal;font-size:9px;color:var(--c);border:1px solid var(--c);border-radius:99px;padding:1px 6px}.case p{font-size:10px;color:var(--muted);margin:6px 0 0}.case small{font-size:9.5px;color:#fbbf24}.foot{margin-top:24px;color:var(--muted);font-size:10px}
      @media(max-width:800px){.kpis{grid-template-columns:1fr 1fr}.report{grid-template-columns:1fr}.cases{grid-template-columns:1fr}}
    </style></head><body><div class="wrap"><div class="top"><span class="brand">${esc(project.name)}</span><span class="badge">测试报告</span><span class="badge">${TEST_STATUS_LABEL[run.status] ?? esc(run.status)}</span></div><h1>${esc(run.name)}</h1><div class="sub">${run.createdAt} · ${esc(project.workspacePath)}</div>
      <div class="kpis"><div class="kpi"><b>${c.total}</b><span>用例</span></div><div class="kpi pass"><b>${c.pass}</b><span>通过</span></div><div class="kpi fail"><b>${c.fail}</b><span>失败</span></div><div class="kpi blocked"><b>${c.blocked}</b><span>阻塞</span></div><div class="kpi"><b>${c.rate}%</b><span>通过率</span></div></div>
      <div class="report"><div class="ring"><div class="donut"><b>${c.rate}%</b></div><span class="sub">通过率</span></div><div class="bars">${Array.from({ length: Math.max(1, c.total) }, (_, i) => `<div class="bar ${i < c.pass ? 'pass' : i < c.pass + c.fail ? 'fail' : 'pending'}" style="--h:${Math.max(12, 25 + (i + 1) / Math.max(1, c.total) * 75)}%"></div>`).join('')}</div></div>
      <div class="cases">${cards}</div><div class="foot">由工作台测试模块生成 · ${new Date().toLocaleString()}</div></div></body></html>`
  }
  async function saveTestReport(): Promise<void> {
    const project = testProjectOf(testProjectSelected); const run = testRunOf(testRunSelected)
    if (!project || !run) { toast('先完成一次运行'); return }
    try {
      const res = await fetch(`${API}/tests/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id, runId: run.id, html: testReportHtml(project, run) }) })
      const data = await res.json() as { filePath?: string; message?: string }
      if (!res.ok || !data.filePath) throw new Error(data.message ?? `HTTP ${res.status}`)
      toast(`报告已保存：${data.filePath.split('/').slice(-2).join('/')}`)
    } catch (cause) { toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }
  function renderTestReport(project: TestProject, run: TestRun): string {
    const c = testCounts(run)
    const bars = Array.from({ length: Math.max(1, c.total) }, (_, i) => `<i class="${i < c.pass ? 'pass' : i < c.pass + c.fail ? 'fail' : 'pending'}" style="--h:${Math.max(12, 25 + (i + 1) / Math.max(1, c.total) * 75)}%;--d:${i * 40}ms"></i>`).join('')
    const cards = run.results.map(r => testCases.find(tc => tc.id === r.caseId)).filter((tc): tc is TestCase => Boolean(tc)).map(tc => {
      const r = testResultOf(run, tc.id)
      return `<div class="test-report-card ${r.status}"><span>${esc(tc.priority)}</span><b>${esc(tc.title)}</b><i>${TEST_RESULT_LABEL[r.status] ?? r.status}</i></div>`
    }).join('')
    return `<div class="test-report"><div class="test-report-hero"><div><span class="eyebrow">测试报告</span><h2>${esc(run.name)}</h2><div class="muted">${esc(project.name)} · ${run.createdAt}</div></div><button class="btn" data-act="test-report-save">${ic('download', 12)}保存报告</button></div>
      <div class="test-kpis"><div><b>${c.total}</b><span>用例</span></div><div class="ok"><b>${c.pass}</b><span>通过</span></div><div class="bad"><b>${c.fail}</b><span>失败</span></div><div class="warn"><b>${c.blocked}</b><span>阻塞</span></div><div><b>${c.rate}%</b><span>通过率</span></div></div>
      <div class="test-report-grid"><div class="test-ring" style="--rate:${c.rate}%"><b>${c.rate}%</b><span>通过率</span></div><div class="test-bars">${bars}</div></div>
      <div class="test-report-cards">${cards || '<div class="notes-empty small">没有用例</div>'}</div>
      <div class="test-timeline"><span>生成用例</span><i></i><span>执行</span><i></i><span>失败录入</span><i></i><span>回归</span><i></i><span>${run.status === 'running' ? '进行中' : run.status === 'passed' ? '通过' : '已完成'}</span></div></div>`
  }
  function renderTests(): string {
    const project = testProjectOf(testProjectSelected)
    const header = `<div class="view-head"><div><div class="eyebrow">测试</div><h1 class="page-title">测试</h1><div class="page-sub">AI 生成用例 → 执行 → 录入 Bug → 回归 → 动画报告</div><div class="head-pills"><span><b>${testCases.length}</b> 用例</span><span><b>${testRuns.length}</b> 运行</span><span><b>${testProjects.length}</b> 项目</span></div></div><div style="display:flex;gap:6px"><button class="btn" data-act="ai-dispatch" data-kind="test">${ic('spark', 13)}AI 协同</button><button class="btn-primary" data-act="test-new">${ic('plus', 14)}新建测试项目</button></div></div>`
    if (testError !== '') return header + `<div class="news-banner"><span>读取失败：${esc(testError)}</span><button class="btn" data-act="test-refresh">重试</button></div>`
    if (testProjects.length === 0) return header + `<div class="notes-empty bug-empty"><div class="ne-icon">${ic('test', 22)}</div><b>还没有测试项目</b><span>创建项目并关联工作区，AI 生成用例后逐条测试。</span><button class="btn-primary" data-act="test-new">${ic('plus', 14)}新建测试项目</button></div>`
    if (!project) return header
    const tabs = `<div class="product-tabs">${(['cases', 'run', 'report', 'deploy'] as const).map(t => `<button class="${testTab === t ? 'active' : ''}" data-act="test-tab" data-tab="${t}">${t === 'cases' ? '用例' : t === 'run' ? '执行' : t === 'report' ? '报告' : '部署'}</button>`).join('')}</div>`
    const toolbar = `<div class="product-toolbar"><select id="wb-test-select" class="bug-project-select"><option value="">选择测试项目…</option>${testProjects.map(p => `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><button class="icon-btn" data-act="test-edit" title="编辑">${ic('edit', 14)}</button><span class="product-ws">${ic('folder', 12)}${esc(project.workspacePath || '未关联工作区')}</span><button class="icon-btn" data-act="test-refresh" title="刷新">${ic('refresh', 14)}</button></div>`
    let body = ''
    if (testTab === 'cases') {
      const cases = testCasesOf(project)
      body = `<div class="product-panel-head"><div><b>测试用例（${cases.length}）</b><span>AI 按需求 / 产品笔记 / Demo 生成</span></div><div class="product-actions"><button class="btn-primary" data-act="test-gen">${ic('spark', 12)}AI 生成用例</button></div></div><div class="test-case-list">${cases.map(c => `<div class="test-case"><div class="test-case-head"><span class="test-prio p${c.priority.slice(1)}">${c.priority}</span><b>${esc(c.title)}</b><i>${esc(c.source)}</i><span class="platform ${c.platform || 'all'}">${platformLabel(c.platform || 'all')}</span><button class="icon-btn" data-act="test-case-delete" data-id="${c.id}" title="删除">${ic('trash', 12)}</button></div><div class="test-case-meta">${c.precondition ? `前置：${esc(c.precondition)}` : ''}</div><ol>${c.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol><div class="test-expected">预期：${esc(c.expected)}</div></div>`).join('') || '<div class="notes-empty small">还没有用例，点「AI 生成用例」。</div>'}</div>`
    } else if (testTab === 'run') {
      const runs = testRunsOf(project)
      const run = testRunOf(testRunSelected) ?? runs[0]
      if (!run) body = `<div class="notes-empty small">还没有运行。<button class="btn-primary" data-act="test-start">${ic('play', 12)}开始测试</button></div>`
      else {
        const c = testCounts(run)
        body = `<div class="product-panel-head"><div><b>${esc(run.name)}</b><span>${c.pass}/${c.total} 通过 · ${TEST_STATUS_LABEL[run.status] ?? run.status} · ${platformLabel(project.platform || 'all')}</span></div><div class="product-actions"><button class="btn" data-act="test-start">${ic('plus', 12)}新运行</button><button class="btn" data-act="test-exec">${ic('spark', 12)}AI 自动化测试</button>${run.status !== 'running' ? `<button class="btn" data-act="test-regression">${ic('refresh', 12)}回归失败用例</button>` : ''}<button class="btn-primary" data-act="test-finish" data-id="${run.id}">${ic('check', 12)}完成并生成报告</button></div></div>
          <div class="test-live-stage"><div class="test-live-ring" style="--rate:${c.rate}%"><b>${c.rate}%</b><span>实时通过率</span></div><div class="test-live-bars">${run.results.map((r, i) => `<i class="${r.status}" style="--h:${Math.max(12, 20 + (i + 1) / Math.max(1, run.results.length) * 80)}%;--d:${i * 45}ms"></i>`).join('')}<div class="test-live-scan"></div></div><div class="test-live-legend"><span>通过 ${c.pass}</span><span>失败 ${c.fail}</span><span>阻塞 ${c.blocked}</span><span>待测 ${c.pending}</span></div></div>
          <div class="test-run-list">${run.results.map(r => testCases.find(tc => tc.id === r.caseId)).filter((tc): tc is TestCase => Boolean(tc)).map(tc => { const r = testResultOf(run, tc.id); return `<div class="test-run-case ${r.status}"><div><span class="test-prio p${tc.priority.slice(1)}">${tc.priority}</span><b>${esc(tc.title)}</b><small>${esc(tc.expected)}</small></div><div class="test-run-actions">${(['pass', 'fail', 'blocked'] as const).map(s => `<button class="${r.status === s ? 'on' : ''}" data-act="test-result" data-run="${run.id}" data-case="${tc.id}" data-status="${s}">${TEST_RESULT_LABEL[s]}</button>`).join('')}${r.status !== 'pass' ? `<button class="btn" data-act="test-bug" data-run="${run.id}" data-case="${tc.id}">录 Bug</button>` : ''}${r.bugId ? `<i class="test-bug-id">${r.bugId.slice(-6)}</i>` : ''}</div><input class="test-note" data-test-note="${tc.id}" placeholder="实际结果/证据" value="${esc(r.note)}"></div>` }).join('')}</div>`
      }
    } else if (testTab === 'report') {
      const run = testRunOf(testRunSelected) ?? testRunsOf(project)[0]
      body = run ? renderTestReport(project, run) : '<div class="notes-empty small">先完成一次运行。</div>'
    } else {
      body = `<div class="test-deploy"><div class="mfield"><label>部署模式</label><select id="wb-deploy-mode"><option value="local" ${project.deployMode === 'local' ? 'selected' : ''}>本机 Docker</option><option value="ssh" ${project.deployMode === 'ssh' ? 'selected' : ''}>SSH 服务器 Docker</option></select></div>
        <div class="test-deploy-grid"><div class="mfield"><label>SSH 主机</label><input id="wb-deploy-host" value="${esc(project.sshHost)}" placeholder="user@host"></div><div class="mfield"><label>远端目录</label><input id="wb-deploy-dir" value="${esc(project.remoteDir)}" placeholder="/srv/app"></div></div>
        <div class="test-deploy-grid"><div class="mfield"><label>镜像</label><input id="wb-deploy-image" value="${esc(project.image)}" placeholder="dsh-workbench-test"></div><div class="mfield"><label>容器名</label><input id="wb-deploy-container" value="${esc(project.containerName)}" placeholder="dsh-workbench-test"></div></div>
        <div class="test-deploy-grid"><div class="mfield"><label>宿主端口</label><input id="wb-deploy-hostport" value="${esc(project.hostPort)}" placeholder="8080"></div><div class="mfield"><label>容器端口</label><input id="wb-deploy-containerport" value="${esc(project.containerPort)}" placeholder="80"></div></div>
        <div class="product-actions"><button class="btn-primary" data-act="test-deploy">${ic('upload', 12)}保存并部署</button></div><pre class="test-deploy-log">${esc(testDeployLog || '部署日志会显示在这里。Docker 未运行时请先启动 Docker。')}</pre></div>`
    }
    return header + toolbar + tabs + body
  }
  async function deployTestProject(): Promise<void> {
    const project = testProjectOf(testProjectSelected)
    if (!project) return
    const patch = { id: project.id, name: project.name, description: project.description, workspacePath: project.workspacePath, productId: project.productId, bugProjectId: project.bugProjectId, deployMode: $id<HTMLSelectElement>('wb-deploy-mode')?.value ?? 'local', sshHost: $id<HTMLInputElement>('wb-deploy-host')?.value ?? '', remoteDir: $id<HTMLInputElement>('wb-deploy-dir')?.value ?? '', image: $id<HTMLInputElement>('wb-deploy-image')?.value ?? '', containerName: $id<HTMLInputElement>('wb-deploy-container')?.value ?? '', hostPort: $id<HTMLInputElement>('wb-deploy-hostport')?.value ?? '', containerPort: $id<HTMLInputElement>('wb-deploy-containerport')?.value ?? '' }
    try {
      await fetch(`${API}/tests/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: patch }) })
      testDeployLog = '正在部署……'
      renderContent()
      const res = await fetch(`${API}/tests/deploy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })
      const data = await res.json() as { ok?: boolean; log?: string }
      testDeployLog = data.log ?? `HTTP ${res.status}`
      await loadTests(true); renderContent()
      toast(data.ok ? '部署成功' : '部署失败，查看日志')
    } catch (cause) { testDeployLog = String((cause as Error).message ?? cause); renderContent() }
  }
  async function deleteTestCase(id: string): Promise<void> {
    if (!window.confirm('删除这条测试用例？')) return
    try {
      const res = await fetch(`${API}/tests/cases/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      testCases = testCases.filter(c => c.id !== id)
      renderContent()
    } catch (cause) { toast(`删除失败：${String((cause as Error).message ?? cause)}`) }
  }
  function bindTests(): void {
    $id<HTMLSelectElement>('wb-test-select')?.addEventListener('change', e => { testProjectSelected = (e.currentTarget as HTMLSelectElement).value; testRunSelected = null; testTab = 'cases'; renderContent() })
    shadow.querySelectorAll<HTMLInputElement>('[data-test-note]').forEach(input => input.addEventListener('change', e => {
      const caseId = (e.currentTarget as HTMLInputElement).getAttribute('data-test-note') ?? ''
      const run = testRunOf(testRunSelected); if (!run) return
      void updateTestResult(run.id, caseId, testResultOf(run, caseId).status, undefined, (e.currentTarget as HTMLInputElement).value)
    }))
  }

  /* ---------- 详情 ---------- */
  function renderDetail(): void {
    const el = detail()
    if (!el) return
    const show = !['portal', 'calendar', 'focus', 'stats', 'news', 'notes', 'bugs', 'product', 'test'].includes(ui.view)
    el.classList.toggle('hide', !show)
    if (!show) { el.innerHTML = ''; return }
    const t = selectedTask()
    if (!t) {
      el.innerHTML = '<div class="detail-empty">还没有选中任务<br>从左边的看板或清单点一项任务</div>'
      return
    }
    const space = spaceOf(t.space)
    const tabs: Array<[Ui['detailTab'], string, number?]> = [['detail', '详情'], ['subtasks', '子待办', t.subtasks.length], ['logs', '记录']]
    let body = ''
    if (ui.detailTab === 'detail') {
      body = `<div class="d-head">${ic('note', 12)} 任务详情<span class="acts">
          <button class="icon-btn" data-act="refresh" title="刷新">${ic('refresh', 13)}</button>
          <button class="icon-btn" data-act="focus-title" title="编辑">${ic('edit', 13)}</button>
          <button class="icon-btn" data-act="copy" data-id="${t.id}" title="复制">${ic('copy', 13)}</button>
          <button class="icon-btn" data-act="delete" data-id="${t.id}" title="删除">${ic('trash', 13)}</button></span></div>
        <div class="d-title-row"><button class="check${t.status === 'done' ? ' done' : ''}" data-act="toggle" data-id="${t.id}">${t.status === 'done' ? ic('check', 11) : ''}</button>
          <div class="d-title" contenteditable="true" data-edit-title="${t.id}">${esc(t.title)}</div></div>
        ${field('项目', 'layers', t.projectPath ? `<b>${esc(projectLabelOfTask(t))}</b>` : '<span class="muted">未归属</span>', 'project', t.id)}
        ${field('空间', 'folder', `<span class="dot" style="background:${space.color}"></span>${esc(space.name)}`, 'space', t.id)}
        ${field('日期', 'calendar', `${t.date === todayKey() ? '今天' : (t.date ? fmtDay(t.date) : '未安排')} <span class="muted">${t.date ?? ''}</span>`, 'date', t.id)}
        ${field('时间', 'clock', `${timeText(t)}${t.duration ? ` <span class="muted">· ${t.duration} 分钟</span>` : ''}`, 'time', t.id)}
        ${field('执行', 'play', t.status === 'doing' ? `<span class="pill green">${ic('playSmall', 9)}进行中</span>` : t.status === 'done' ? '<span class="pill gray">已完成</span>' : '<span class="pill amber">' + ic('playSmall', 9) + '待开始</span>', 'status', t.id)}
        ${field('优先级', 'flag', t.priority === 'high' ? '<span style="color:var(--red)">高优先级</span>' : PRIORITY_LABEL[t.priority], 'priority', t.id)}
        ${field('标签', 'tag', t.tags.length > 0 ? t.tags.map(x => `<span class="tag">#${esc(x)}</span>`).join('') : '<span class="muted">未设置</span>', 'tags', t.id)}
        ${field('分组', 'folder', t.group ? esc(t.group) : '<span class="muted">未设置</span>', 'group', t.id)}
        <div class="d-sec"><div class="d-sec-h">${ic('note', 11)} 备注</div>
          <div class="d-note" contenteditable="true" data-edit-note="${t.id}">${esc(t.note || t.desc || '点击输入备注…')}</div>
          <div class="attach-row"><button class="btn" data-act="pick-image">${ic('image', 11)}添加图片</button><button class="btn" data-act="pick-file">${ic('paperclip', 11)}添加附件</button><span style="margin-left:auto">${t.attachments.length}/12</span></div>
          <input type="file" id="wb-file" class="attach-hidden" multiple>
          <div class="attachments">${t.attachments.map(a => `<div class="attach"><span class="file-ic">${esc(String(a.kind).toUpperCase())}</span><span>${esc(a.name)}</span><span class="x" data-act="del-attach" data-id="${t.id}" data-aid="${a.id}">×</span></div>`).join('') || '<div class="muted" style="font-size:10.5px">暂无附件</div>'}</div>
        </div>
        <div class="d-sec"><div class="d-sec-h">${ic('clock', 11)} 接下来</div>
          ${db.tasks.filter(x => x.id !== t.id && x.status !== 'done' && x.date === todayKey()).slice(0, 3).map(x => `<div class="next-item" data-id="${x.id}"><span class="t">${x.start || '--:--'}</span><span>${esc(x.title)}</span></div>`).join('') || '<div class="muted" style="font-size:10.5px">今天没有其他安排</div>'}
        </div>`
    } else if (ui.detailTab === 'subtasks') {
      const doneN = t.subtasks.filter(s => s.done).length
      const notedSub = t.subtasks.find(s => s.id === ui.subNoteId) ?? t.subtasks[0]
      body = `<div class="d-head" style="margin-top:2px">${ic('checkSquare', 12)}子待办<span class="acts" style="font-size:10px;color:var(--text-3)">${doneN}/${t.subtasks.length} 已完成</span></div>
        ${t.subtasks.map(s => `<div class="sub-item${s.done ? ' done' : ''}">
          <button class="check${s.done ? ' done' : ''}" data-act="toggle-sub" data-id="${t.id}" data-sid="${s.id}">${s.done ? ic('check', 10) : ''}</button>
          <div class="sm"><div class="st">${esc(s.title)}</div><span data-act="sub-plan" data-id="${t.id}" data-sid="${s.id}" title="点击编辑计划时间" style="cursor:pointer">${s.start ? `${s.start} — ${s.end}` : '未排期 · 点击设置时间'}</span>
          ${ui.subNoteId === s.id ? `<textarea class="sub-note-input" data-sub-note-editor data-task="${t.id}" data-sid="${s.id}" placeholder="这条子待办的独立备注…">${esc(s.note)}</textarea>` : ''}</div>
          <button class="icon-btn" title="备注" data-act="sub-note" data-sid="${s.id}">${ic('note', 12)}</button></div>`).join('') || '<div class="muted" style="font-size:11px;padding:6px 0">还没有子待办</div>'}
        <div class="sub-add">${ic('plus', 12)}<input id="wb-sub-add" placeholder="添加子待办，按 Enter 保存"></div>
        <div class="d-sec"><div class="d-sec-h">${ic('calendar', 11)} 计划时间</div>
          <div class="plan-grid" data-act="sub-plan" data-id="${t.id}" data-sid="${notedSub?.id ?? ''}" style="cursor:pointer"><div class="plan-box">计划开始<b>${notedSub?.start || t.start || '未设置'}</b></div><div class="plan-box">计划完成<b>${notedSub?.end || t.end || '未设置'}</b></div></div>
        </div>
        ${notedSub ? `<div class="d-sec"><div class="d-sec-h">${ic('note', 11)} 独立备注${notedSub.title ? ` · ${esc(notedSub.title)}` : ''}</div><div class="d-note" contenteditable="true" data-edit-sub-note="${t.id}" data-sub-target="${notedSub.id}">${esc(notedSub.note || '')}</div></div>` : ''}`
    } else {
      body = `<div class="d-head" style="margin-top:2px">${ic('clock', 12)}记录<span class="acts" style="font-size:10px;color:var(--text-3)">${t.logs.length} 条</span></div>
        ${t.logs.map(l => `<div class="log"><span class="lt">${esc(l.at)}</span><span>${esc(l.text)}</span></div>`).join('') || '<div class="detail-empty">暂无记录</div>'}`
    }
    el.innerHTML = `<div class="detail-tabs">${tabs.map(([k, label, n]) => `<button data-act="tab" data-tab="${k}" class="${ui.detailTab === k ? 'active' : ''}">${label}${n !== undefined ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
      <div class="detail-body">${body}</div>`
    bindDetail()
  }

  function field(label: string, iconName: string, value: string, key: string, taskId: string): string {
    return `<div class="field" role="button" tabindex="0" data-act="edit-field" data-field="${key}" data-id="${taskId}" title="点击编辑"><span class="fl">${ic(iconName, 11)}${label}</span><span class="fv">${value}</span></div>`
  }

  function bindDetail(): void {
    const title = shadow.querySelector<HTMLElement>('[data-edit-title]')
    if (title) {
      title.addEventListener('blur', () => {
        const id = title.getAttribute('data-edit-title') ?? ''
        const task = taskOf(id)
        const value = title.textContent?.trim() ?? ''
        if (task && value !== '' && value !== task.title) {
          task.title = value
          task.updatedAt = nowStamp()
          task.logs.unshift({ at: nowStamp(), type: 'edit', text: `重命名为「${value}」` })
          scheduleSave()
          renderSidebar()
          renderContent()
        }
      })
      title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur() } })
    }
    const note = shadow.querySelector<HTMLElement>('[data-edit-note]')
    if (note) {
      note.addEventListener('paste', event => {
        const task = selectedTask()
        const files = Array.from((event as ClipboardEvent).clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
        if (!task || files.length === 0) return
        event.preventDefault()
        let added = 0
        for (const f of files) {
          if (task.attachments.length >= 12) { toast('附件最多 12 个'); break }
          task.attachments.push({ id: uid('a'), name: f.name || `图片-${Date.now()}.png`, kind: 'image', size: f.size })
          added += 1
        }
        if (added > 0) { renderAll(); scheduleSave(); toast(`已添加 ${added} 张图片`); }
      })
      note.addEventListener('blur', () => {
        const id = note.getAttribute('data-edit-note') ?? ''
        const task = taskOf(id)
        const value = note.textContent ?? ''
        if (task && value !== (task.note || task.desc)) {
          task.note = value
          task.updatedAt = nowStamp()
          scheduleSave()
        }
      })
    }
    const subNote = shadow.querySelector<HTMLElement>('[data-edit-sub-note]')
    if (subNote) {
      subNote.addEventListener('blur', () => {
        const id = subNote.getAttribute('data-edit-sub-note') ?? ''
        const task = taskOf(id)
        const sub = task?.subtasks.find(s => s.id === subNote.getAttribute('data-sub-target'))
        if (task && sub && subNote.textContent !== sub.note) {
          sub.note = subNote.textContent ?? ''
          scheduleSave()
        }
      })
    }
    shadow.querySelectorAll<HTMLTextAreaElement>('[data-sub-note-editor]').forEach(editor => {
      editor.addEventListener('blur', () => {
        const task = taskOf(editor.getAttribute('data-task') ?? '')
        const sub = task?.subtasks.find(s => s.id === editor.getAttribute('data-sid'))
        if (task && sub && sub.note !== editor.value) {
          sub.note = editor.value
          task.updatedAt = nowStamp()
          scheduleSave()
        }
      })
      editor.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) editor.blur() })
    })
    const subAdd = $id<HTMLInputElement>('wb-sub-add')
    subAdd?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && subAdd.value.trim() !== '') {
        const task = selectedTask()
        if (!task) return
        task.subtasks.push({ id: uid('s'), title: subAdd.value.trim(), done: false, start: '', end: '', note: '' })
        task.updatedAt = nowStamp()
        task.logs.unshift({ at: nowStamp(), type: 'edit', text: `添加子待办「${subAdd.value.trim()}」` })
        renderAll()
        scheduleSave()
        window.setTimeout(() => { $id<HTMLInputElement>('wb-sub-add')?.focus() }, 0)
      }
    })
    const fileInput = $id<HTMLInputElement>('wb-file')
    fileInput?.addEventListener('change', () => {
      const task = selectedTask()
      if (!task || fileInput.files === null) return
      for (const f of Array.from(fileInput.files)) {
        if (task.attachments.length >= 12) { toast('附件最多 12 个'); break }
        task.attachments.push({ id: uid('a'), name: f.name, kind: fileKind(f.name), size: f.size })
      }
      fileInput.value = ''
      renderAll()
      scheduleSave()
    })
  }

  /* ---------- 任务操作 ---------- */
  function createTask(input: { title: string; space?: string; date?: string; start?: string; end?: string; desc?: string; priority?: Priority; projectPath?: string }): void {
    const task: Task = {
      id: uid('t'), title: input.title, desc: input.desc ?? '', note: '', space: input.space ?? (db.spaces[2]?.id ?? 'life'),
      projectPath: input.projectPath ?? (ui.project === 'all' || ui.project === 'none' ? '' : ui.project),
      status: 'next', priority: input.priority ?? 'normal', tags: [], date: input.date ?? todayKey(),
      start: input.start ?? '', end: input.end ?? '', duration: 0, group: '',
      createdAt: nowStamp(), updatedAt: nowStamp(), completedAt: null, subtasks: [], attachments: [],
      logs: [{ at: nowStamp(), type: 'created', text: '创建任务' }],
    }
    db.tasks.unshift(task)
    ui.selected = task.id
    renderAll()
    scheduleSave()
    toast('已创建任务')
  }
  function toggleDone(id: string): void {
    const task = taskOf(id)
    if (!task) return
    const done = task.status !== 'done'
    task.status = done ? 'done' : 'next'
    task.completedAt = done ? nowStamp() : null
    task.updatedAt = nowStamp()
    task.logs.unshift({ at: nowStamp(), type: done ? 'completed' : 'status', text: done ? '完成任务' : '重新打开任务' })
    renderAll()
    scheduleSave()
    if (done) toast('完成一项 · 今日进度已更新')
  }
  function deleteTask(id: string): void {
    const task = taskOf(id)
    if (!task) return
    const ok = typeof window.confirm === 'function' ? window.confirm(`删除「${task.title}」？`) : true
    if (!ok) return
    db.tasks = db.tasks.filter(t => t.id !== id)
    if (ui.selected === id) ui.selected = chooseSelection()
    if (timer.taskId === id) timer.taskId = chooseSelection()
    renderAll()
    scheduleSave()
    toast('已删除任务')
  }
  function copyTask(id: string): void {
    const task = taskOf(id)
    if (!task) return
    const copy: Task = JSON.parse(JSON.stringify(task)) as Task
    copy.id = uid('t')
    copy.title = `${task.title}（副本）`
    copy.createdAt = nowStamp()
    copy.updatedAt = nowStamp()
    copy.completedAt = null
    copy.status = 'next'
    copy.subtasks = copy.subtasks.map(s => ({ ...s, id: uid('s'), done: false }))
    copy.attachments = copy.attachments.map(a => ({ ...a, id: uid('a') }))
    copy.logs = [{ at: nowStamp(), type: 'created', text: '复制任务' }]
    db.tasks.unshift(copy)
    ui.selected = copy.id
    renderAll()
    scheduleSave()
    toast('已复制任务')
  }
  function fileKind(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
    if (ext === 'pdf') return 'pdf'
    if (['csv', 'tsv', 'xls', 'xlsx'].includes(ext)) return 'csv'
    if (['doc', 'docx', 'md', 'txt'].includes(ext)) return 'doc'
    return 'file'
  }

  /* ---------- 弹窗 ---------- */
  function openModal(html: string): void {
    const root = $id('wb-modal')
    if (!root) return
    /* 灵感/团队弹窗需要更宽的容器；420px 的默认宽度会把双列表单挤坏。 */
    const wide = /class="(?:idea|agent)-modal/.test(html)
    root.innerHTML = `<div class="overlay" data-act="overlay"><div class="modal${wide ? ' modal-wide' : ''}" data-stop="1">${html}</div></div>`
    const first = root.querySelector<HTMLInputElement>('input, textarea, select')
    first?.focus()
  }
  function closeModal(): void {
    const root = $id('wb-modal')
    if (root) root.innerHTML = ''
  }
  function openNewTask(): void {
    const spaces = db.spaces.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    const projectOptions = [
      `<option value="" ${ui.project === 'all' || ui.project === 'none' ? 'selected' : ''}>未归属</option>`,
      ...projectCards().map(card => `<option value="${esc(card.path)}" ${ui.project === card.path ? 'selected' : ''}>${esc(card.name)}</option>`),
    ].join('')
    openModal(`<h3>新建任务</h3>
      <div class="mfield"><label>标题</label><input id="wb-m-title" placeholder="要做什么？"></div>
      <div class="mfield"><label>备注</label><textarea id="wb-m-desc" placeholder="补充一句上下文（可选）"></textarea></div>
      <div class="mrow"><div class="mfield"><label>项目</label><select id="wb-m-project">${projectOptions}</select></div>
        <div class="mfield"><label>空间</label><select id="wb-m-space">${spaces}</select></div></div>
      <div class="mrow"><div class="mfield"><label>日期</label><input id="wb-m-date" type="date" value="${todayKey()}"></div>
        <div class="mfield"><label>优先级</label><select id="wb-m-priority"><option value="normal">普通</option><option value="high">高优先级</option><option value="low">低优先级</option></select></div></div>
      <div class="mrow"><div class="mfield"><label>开始</label><input id="wb-m-start" type="time"></div>
        <div class="mfield"><label>结束</label><input id="wb-m-end" type="time"></div></div>
      <div class="mfield"><label>标签</label><input id="wb-m-tags" placeholder="用逗号分隔"></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="create">创建任务</button></div>`)
  }
  function createFromModal(): void {
    const title = $id<HTMLInputElement>('wb-m-title')?.value.trim() ?? ''
    if (title === '') { $id<HTMLInputElement>('wb-m-title')?.focus(); return }
    const tags = ($id<HTMLInputElement>('wb-m-tags')?.value ?? '').split(/[,，]/).map(s => s.trim()).filter(Boolean)
    const space = $id<HTMLSelectElement>('wb-m-space')?.value ?? 'life'
    const date = $id<HTMLInputElement>('wb-m-date')?.value ?? todayKey()
    const start = $id<HTMLInputElement>('wb-m-start')?.value ?? ''
    const end = $id<HTMLInputElement>('wb-m-end')?.value ?? ''
    const desc = $id<HTMLTextAreaElement>('wb-m-desc')?.value.trim() ?? ''
    const priority = ($id<HTMLSelectElement>('wb-m-priority')?.value ?? 'normal') as Priority
    const projectPath = $id<HTMLSelectElement>('wb-m-project')?.value ?? ''
    const task: Task = {
      id: uid('t'), title, desc, note: '', space, projectPath, status: 'next', priority, tags, date: date || null,
      start, end, duration: 0, group: '', createdAt: nowStamp(), updatedAt: nowStamp(), completedAt: null,
      subtasks: [], attachments: [], logs: [{ at: nowStamp(), type: 'created', text: '创建任务' }],
    }
    db.tasks.unshift(task)
    ui.selected = task.id
    closeModal()
    renderAll()
    scheduleSave()
    toast('已创建任务')
  }
  function openSpace(): void {
    openModal(`<h3>新建空间</h3>
      <div class="mfield"><label>名称</label><input id="wb-sp-name" placeholder="例如：阅读"></div>
      <div class="mfield"><label>颜色</label><div style="display:flex;gap:7px;padding-top:3px">${ACCENTS.map((c, i) => `<button class="dot" data-act="pick-color" data-color="${c}" style="width:22px;height:22px;border-radius:50%;border:2px solid ${i === 0 ? 'var(--text)' : 'transparent'};background:${c};cursor:pointer"></button>`).join('')}</div></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="create-space">创建空间</button></div>`)
    pendingColor = ACCENTS[0]
  }
  let pendingColor = ACCENTS[0]
  function createSpace(): void {
    const name = $id<HTMLInputElement>('wb-sp-name')?.value.trim() ?? ''
    if (name === '') { $id<HTMLInputElement>('wb-sp-name')?.focus(); return }
    const id = `space-${uid('')}`
    db.spaces.push({ id, name, color: pendingColor })
    closeModal()
    renderAll()
    scheduleSave()
    toast(`已创建空间「${name}」`)
  }
  async function openSettings(): Promise<void> {
    const theme = db.settings.theme ?? 'auto'
    openModal(`<h3>工作台设置</h3>
      <div class="switch-row"><span>主题</span><div class="mini-seg">${(['auto', 'light', 'dark'] as const).map(t => `<button data-act="set-theme" data-theme="${t}" class="${theme === t ? 'active' : ''}">${t === 'auto' ? '跟随 DSH' : t === 'light' ? '浅色' : '深色'}</button>`).join('')}</div></div>
      <div class="switch-row"><span>空间</span><button class="btn" style="height:26px;padding:0 9px" data-act="manage-spaces">管理（${db.spaces.length}）</button></div>
      <div class="switch-row"><span>数据存储</span><span class="muted" style="font-size:11px" id="wb-health">读取中…</span></div>
      <div class="switch-row"><span>条目</span><span class="muted" style="font-size:11px">${db.tasks.length} 项任务 · ${db.focus.length} 次专注</span></div>
      <div class="switch-row"><span>版本</span><span class="muted" style="font-size:11px">dsh-workbench 1.5.0</span></div>
      <div class="switch-row"><span>最近 AI 提交</span><span class="muted" style="font-size:11px;max-width:320px;text-align:right;word-break:break-all">${esc(String(db.settings.lastAiError ?? '无'))}</span></div>
      <div class="mfield"><label>笔记保存目录</label>
        <input id="wb-export-dir" value="" placeholder="读取中…">
        <div class="nb-create-row" style="margin-top:6px"><button class="btn" data-act="export-dir-save">保存目录</button><button class="btn" data-act="export-dir-default">恢复默认</button></div>
        <div class="export-hint" id="wb-export-hint">另存 Markdown 与导出 PDF 都写入这里；默认是本机用户目录。</div>
      </div>
      <div class="modal-foot"><button class="btn" data-act="import">导入 JSON</button><button class="btn" data-act="export">导出 JSON</button><button class="btn solid" data-act="close-modal">完成</button></div>
      <input type="file" id="wb-import" class="attach-hidden" accept="application/json,.json">`)
    try {
      const res = await fetch(`${API}/health`)
      const health = await res.json() as Health
      const node = $id('wb-health')
      if (node) node.textContent = `${health.engine.toUpperCase()} · ${health.file} · r${health.revision}`
    } catch {
      const node = $id('wb-health')
      if (node) node.textContent = '接口不可用'
    }
    void loadExportConfig()
    const importInput = $id<HTMLInputElement>('wb-import')
    importInput?.addEventListener('change', () => {
      const file = importInput.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result))
          const next: Partial<DB> = parsed?.state ?? parsed
          if (!Array.isArray(next.tasks) || !Array.isArray(next.spaces)) throw new Error('缺少 tasks/spaces')
          db = {
            spaces: next.spaces as Space[],
            tasks: next.tasks as Task[],
            focus: Array.isArray(next.focus) ? next.focus as FocusSession[] : [],
            settings: (next.settings as Settings) ?? db.settings,
          }
          ui.selected = chooseSelection()
          closeModal()
          renderAll()
          scheduleSave()
          toast('已导入数据')
        } catch (cause) {
          toast(`导入失败：${String((cause as Error).message)}`)
        }
      }
      reader.readAsText(file)
    })
  }
  function openField(field: string, id: string): void {
    const t = taskOf(id)
    if (!t) return
    const labels: Record<string, string> = { project: '项目', space: '空间', date: '日期', time: '时间', status: '执行状态', priority: '优先级', tags: '标签', group: '分组' }
    let body = ''
    if (field === 'project') {
      const options = [`<option value="" ${t.projectPath === '' ? 'selected' : ''}>未归属</option>`,
        ...projectCards().map(card => `<option value="${esc(card.path)}" ${t.projectPath === card.path ? 'selected' : ''}>${esc(card.name)}</option>`)].join('')
      body = `<div class="mfield"><label>项目（= DSH 工作区）</label><select id="wb-f-project">${options}</select></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px">选择项目后，任务会出现在该项目的日历、统计与门户计数里。</div>`
    } else if (field === 'space') {
      body = `<div class="mfield"><label>空间</label><select id="wb-f-space">${db.spaces.map(sp => `<option value="${sp.id}" ${sp.id === t.space ? 'selected' : ''}>${esc(sp.name)}</option>`).join('')}</select></div>`
    } else if (field === 'date') {
      body = `<div class="mfield"><label>日期（留空表示不安排）</label><input id="wb-f-date" type="date" value="${t.date ?? ''}"></div>`
    } else if (field === 'time') {
      body = `<div class="mrow"><div class="mfield"><label>开始</label><input id="wb-f-start" type="time" value="${t.start}"></div><div class="mfield"><label>结束</label><input id="wb-f-end" type="time" value="${t.end}"></div></div>
        <div class="mfield" style="color:var(--text-3);font-size:10.5px">时长会按开始 / 结束自动计算；只填开始也可以。</div>`
    } else if (field === 'status') {
      body = `<div class="mfield"><label>执行状态</label><select id="wb-f-status">${(['next', 'doing', 'waiting', 'done'] as const).map(st => `<option value="${st}" ${st === t.status ? 'selected' : ''}>${STATUS_LABEL[st]}</option>`).join('')}</select></div>`
    } else if (field === 'priority') {
      body = `<div class="mfield"><label>优先级</label><select id="wb-f-priority">${(['high', 'normal', 'low'] as const).map(p => `<option value="${p}" ${p === t.priority ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}</select></div>`
    } else if (field === 'tags') {
      body = `<div class="mfield"><label>标签（用逗号分隔）</label><input id="wb-f-tags" value="${esc(t.tags.join(', '))}" placeholder="例如：个人学习, 周会"></div>`
    } else {
      body = `<div class="mfield"><label>分组</label><input id="wb-f-group" value="${esc(t.group)}" placeholder="例如：Excel 学习"></div>`
    }
    openModal(`<h3>编辑${labels[field] ?? '任务'}</h3>${body}
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="apply-field" data-field="${field}" data-id="${id}">保存</button></div>`)
  }
  function applyField(field: string, id: string): void {
    const t = taskOf(id)
    if (!t) return
    const before = { ...t }
    if (field === 'project') {
      t.projectPath = $id<HTMLSelectElement>('wb-f-project')?.value ?? ''
    } else if (field === 'space') {
      t.space = $id<HTMLSelectElement>('wb-f-space')?.value ?? t.space
    } else if (field === 'date') {
      t.date = $id<HTMLInputElement>('wb-f-date')?.value || null
    } else if (field === 'time') {
      t.start = $id<HTMLInputElement>('wb-f-start')?.value ?? ''
      t.end = $id<HTMLInputElement>('wb-f-end')?.value ?? ''
      const toMin = (v: string): number => { const [h, m] = v.split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0 }
      const span = toMin(t.end) - toMin(t.start)
      t.duration = t.start !== '' && t.end !== '' && span > 0 ? span : 0
    } else if (field === 'status') {
      const next = ($id<HTMLSelectElement>('wb-f-status')?.value ?? 'next') as Status
      t.status = next
      if (next === 'done') t.completedAt = nowStamp()
      else t.completedAt = null
    } else if (field === 'priority') {
      t.priority = ($id<HTMLSelectElement>('wb-f-priority')?.value ?? 'normal') as Priority
    } else if (field === 'tags') {
      t.tags = ($id<HTMLInputElement>('wb-f-tags')?.value ?? '').split(/[,，]/).map(x => x.trim()).filter(Boolean)
    } else if (field === 'group') {
      t.group = ($id<HTMLInputElement>('wb-f-group')?.value ?? '').trim()
    }
    t.updatedAt = nowStamp()
    t.logs.unshift({ at: nowStamp(), type: 'edit', text: `修改${field === 'project' ? '项目' : field === 'space' ? '空间' : field === 'date' ? '日期' : field === 'time' ? '时间' : field === 'status' ? '执行状态' : field === 'priority' ? '优先级' : field === 'tags' ? '标签' : '分组'}` })
    closeModal()
    renderAll()
    scheduleSave()
    toast('已更新')
    void before
  }
  function toLocalInput(value: string): string {
    if (!value) return ''
    const short = value.match(/^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)
    if (short) return `${new Date().getFullYear()}-${short[1]}-${short[2]}T${short[3]}:${short[4]}`
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value)) return value.replace(' ', 'T').slice(0, 16)
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`
    return ''
  }
  function fromLocalInput(value: string): string {
    return value ? value.replace('T', ' ').slice(0, 16) : ''
  }
  function openSubPlan(id: string, sid: string): void {
    const task = taskOf(id)
    const sub = task?.subtasks.find(s => s.id === sid)
    if (!task || !sub) return
    openModal(`<h3>子待办计划时间</h3>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px">${esc(sub.title)}</div>
      <div class="mrow"><div class="mfield"><label>计划开始</label><input id="wb-s-start" type="datetime-local" value="${toLocalInput(sub.start)}"></div>
      <div class="mfield"><label>计划完成</label><input id="wb-s-end" type="datetime-local" value="${toLocalInput(sub.end)}"></div></div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="apply-sub-plan" data-id="${id}" data-sid="${sid}">保存</button></div>`)
  }
  function applySubPlan(id: string, sid: string): void {
    const task = taskOf(id)
    const sub = task?.subtasks.find(s => s.id === sid)
    if (!task || !sub) return
    sub.start = fromLocalInput($id<HTMLInputElement>('wb-s-start')?.value ?? '')
    sub.end = fromLocalInput($id<HTMLInputElement>('wb-s-end')?.value ?? '')
    task.updatedAt = nowStamp()
    task.logs.unshift({ at: nowStamp(), type: 'edit', text: `修改子待办「${sub.title}」计划时间` })
    closeModal()
    renderAll()
    scheduleSave()
    toast('子待办时间已更新')
  }
  function openSpaces(): void {
    openModal(`<h3>空间管理</h3>
      <div style="margin:2px 0 8px">${db.spaces.map(sp => `<div class="next-item" style="padding:8px 4px;gap:8px">
        <span class="dot" style="background:${sp.color}"></span>
        <input data-space-name="${sp.id}" value="${esc(sp.name)}" style="flex:1;min-width:0;height:28px;border:1px solid var(--line);border-radius:6px;background:var(--panel-2);color:var(--text);font:11.5px var(--font);padding:0 7px;outline:0">
        <input type="color" data-space-color="${sp.id}" value="${sp.color}" title="空间颜色" style="width:24px;height:24px;border:0;background:none;padding:0;cursor:pointer">
        <button class="btn" style="height:28px;padding:0 8px" data-act="del-space" data-id="${sp.id}">删除</button>
      </div>`).join('')}</div>
      <div class="modal-foot"><button class="btn" data-act="space-add">新建空间</button><button class="btn solid" data-act="close-modal">完成</button></div>`)
    shadow.querySelectorAll<HTMLInputElement>('[data-space-name]').forEach(input => {
      input.addEventListener('blur', () => {
        const sp = db.spaces.find(x => x.id === input.getAttribute('data-space-name'))
        if (sp && input.value.trim() !== '' && sp.name !== input.value.trim()) {
          sp.name = input.value.trim()
          scheduleSave()
          renderAll()
          toast('空间已改名')
        }
      })
    })
    shadow.querySelectorAll<HTMLInputElement>('[data-space-color]').forEach(input => {
      input.addEventListener('change', () => {
        const sp = db.spaces.find(x => x.id === input.getAttribute('data-space-color'))
        if (sp && input.value !== sp.color) {
          sp.color = input.value
          scheduleSave()
          renderAll()
          toast('空间颜色已更新')
        }
      })
    })
  }

  function openThemeMenu(): void {
    const current = db.settings.theme ?? 'auto'
    const rows: Array<[Theme, string, string]> = [
      ['auto', '跟随 DSH', 'MOSS / opencode-palette 等皮肤切换时自动同步'],
      ['light', '浅色', '固定使用工作台自带浅色'],
      ['dark', '深色', '固定使用工作台自带深色'],
    ]
    openModal(`<h3>主题</h3>
      <div style="margin:2px 0 8px">${rows.map(([key, label, desc]) => `<div class="next-item" data-act="set-theme" data-theme="${key}" style="padding:9px 4px">
        <span class="t" style="width:20px;font-size:12px;color:${current === key ? 'var(--accent)' : 'var(--text-3)'}">${current === key ? '✓' : ''}</span>
        <span style="flex:1"><b style="font-size:12px">${label}</b><span style="display:block;color:var(--text-3);font-size:10.5px">${desc}</span></span>
      </div>`).join('')}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">关闭</button></div>`)
  }

  function openFilter(): void {
    const rows: Array<[Ui['filter'], string, string]> = [
      ['all', '全部任务', '不筛选'],
      ['high', '高优先级', '只留下优先级为高的任务'],
      ['sub', '有子待办', '已经拆过步骤的任务'],
      ['attach', '有附件', '带文件或图片的任务'],
      ['unscheduled', '未排时间', '还没填开始时间的任务'],
    ]
    openModal(`<h3>筛选任务</h3>
      <div style="margin:2px 0 8px">${rows.map(([key, label, desc]) => `<div class="next-item" data-act="set-filter" data-filter="${key}" style="padding:8px 4px">
        <span class="t" style="width:20px;font-size:12px;color:${ui.filter === key ? 'var(--accent)' : 'var(--text-3)'}">${ui.filter === key ? '✓' : ''}</span>
        <span style="flex:1"><b style="font-size:12px">${label}</b><span style="display:block;color:var(--text-3);font-size:10.5px">${desc}</span></span>
      </div>`).join('')}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">关闭</button></div>`)
  }
  function openSort(): void {
    const rows: Array<[Ui['sort'], string]> = [['time', '按时间'], ['priority', '按优先级'], ['created', '按创建时间'], ['title', '按标题']]
    openModal(`<h3>排序方式</h3>
      <div style="margin:2px 0 8px">${rows.map(([key, label]) => `<div class="next-item" data-act="set-sort" data-sort="${key}" style="padding:9px 4px">
        <span class="t" style="width:20px;font-size:12px;color:${ui.sort === key ? 'var(--accent)' : 'var(--text-3)'}">${ui.sort === key ? '✓' : ''}</span><span>${label}</span></div>`).join('')}</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">关闭</button></div>`)
  }
  function openNotifications(): void {
    const today = todayKey()
    const done = db.tasks.filter(t => t.date === today && t.status === 'done')
    const waiting = db.tasks.filter(t => t.status === 'waiting')
    const overdue = db.tasks.filter(t => t.status !== 'done' && t.date !== null && t.date < today)
    const item = (t: Task): string => `<div class="next-item" data-id="${t.id}"><span class="t">${t.start || '--:--'}</span><span style="flex:1">${esc(t.title)}</span><span class="muted" style="font-size:10px">${esc(spaceOf(t.space).name)}</span></div>`
    openModal(`<h3>通知</h3>
      <div class="d-sec"><div class="d-sec-h">${ic('check', 11)} 今天已完成 · ${done.length}</div>${done.map(item).join('') || '<div class="muted" style="font-size:11px">还没有完成的任务</div>'}</div>
      <div class="d-sec"><div class="d-sec-h">${ic('clock', 11)} 等待中 · ${waiting.length}</div>${waiting.map(item).join('') || '<div class="muted" style="font-size:11px">没有等待中的任务</div>'}</div>
      <div class="d-sec"><div class="d-sec-h">${ic('flag', 11)} 已过期 · ${overdue.length}</div>${overdue.map(item).join('') || '<div class="muted" style="font-size:11px">没有过期任务</div>'}</div>
      <div class="modal-foot"><button class="btn solid" data-act="close-modal">知道了</button></div>`)
  }
  function openCustomTimer(): void {
    openModal(`<h3>自定义专注时长</h3>
      <div class="mfield"><label>分钟（1–180）</label><input id="wb-timer-min" type="number" min="1" max="180" value="${timer.preset}"></div>
      <div class="mfield" style="color:var(--text-3);font-size:10.5px">计时结束会写入一条专注记录，并累计到今日专注。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" data-act="apply-timer">使用该时长</button></div>`)
  }
  function applyCustomTimer(): void {
    const raw = Number($id<HTMLInputElement>('wb-timer-min')?.value ?? 25)
    const minutes = Math.max(1, Math.min(180, Math.round(Number.isFinite(raw) && raw > 0 ? raw : 25)))
    timer.preset = minutes
    timer.remaining = minutes * 60
    timer.running = false
    timer.endsAt = 0
    closeModal()
    renderContent()
    toast(`已设为 ${minutes} 分钟`)
  }

  function exportData(): void {
    const a = document.createElement('a')
    a.href = `${API}/export`
    a.download = 'dsh-workbench.json'
    a.click()
  }

  /* ---------- toast ---------- */
  let toastTimer = 0
  function toast(message: string): void {
    const el = $id('wb-toast')
    if (!el) return
    el.textContent = message
    el.classList.add('show')
    if (toastTimer !== 0) window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => el.classList.remove('show'), 1700)
  }

  /* ---------- 事件 ---------- */
  function onClick(event: MouseEvent): void {
    const target = event.target as Element | null
    if (!target) return
    if (ctxMenuOpen && target.closest('#wb-ctxmenu') === null) closeContextMenu()
    const actEl = target.closest('[data-act]')
    if (actEl) {
      const act = actEl.getAttribute('data-act') ?? ''
      const id = actEl.getAttribute('data-id') ?? ''
      if (act === 'overlay') { if (target === actEl) closeModal(); return }
      if (act === 'close-modal') { closeModal(); return }
      if (act === 'portal-home') { openPortal(); return }
      if (act === 'portal-project') { setProject(actEl.getAttribute('data-id') ?? 'all'); return }
      if (act === 'portal-open') { openFeature((actEl.getAttribute('data-view') ?? 'list') as Ui['view']); return }
      if (act === 'portal-enter') {
        setProject(actEl.getAttribute('data-id') ?? 'all', false)
        openFeature((actEl.getAttribute('data-view') ?? 'list') as Ui['view'])
        return
      }
      if (act === 'portal-new') { openProductEdit(undefined, actEl.getAttribute('data-path') ?? undefined); return }
      if (act === 'portal-edit') { openProductEdit(actEl.getAttribute('data-id') ?? undefined); return }
      if (act === 'portal-delete') { void deleteProduct(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'portal-load') { void refreshPortal().then(() => toast('项目数据已刷新')); return }
      if (act === 'agent-team-open') { void agentPanel.openTeam(id); return }
      if (act === 'agent-team-new') { agentPanel.openTeamForm(); return }
      if (act === 'agent-team-edit') {
        const team = agentPanel.teams().find(item => item.id === id)
        if (team !== undefined) agentPanel.openTeamForm(team)
        return
      }
      if (act === 'agent-team-save') { void agentPanel.createTeam(); return }
      if (act === 'agent-team-delete') { void agentPanel.deleteTeam(id); return }
      if (act === 'agent-member-new') { void agentPanel.openMemberForm(actEl.getAttribute('data-team') ?? ''); return }
      if (act === 'agent-member-edit') {
        const member = agentPanel.members().find(item => item.id === id)
        if (member !== undefined) void agentPanel.openMemberForm(actEl.getAttribute('data-team') ?? '', member)
        return
      }
      if (act === 'agent-member-save') { void agentPanel.saveMember(actEl.getAttribute('data-team') ?? '', id); return }
      if (act === 'agent-member-del') { void agentPanel.removeMember(actEl.getAttribute('data-team') ?? '', id); return }
      if (act === 'agent-member-write') { void agentPanel.toggleWrite(actEl.getAttribute('data-team') ?? '', id); return }
      if (act === 'agent-member-add') { void agentPanel.addMemberToTeam(actEl.getAttribute('data-team') ?? ''); return }
      if (act === 'agent-close') { closeModal(); return }
      if (act === 'agent-toggle-option') {
        agentPanel.toggleOption(actEl.getAttribute('data-field') ?? '', actEl.getAttribute('data-value') ?? '')
        return
      }
      if (act === 'agent-binding-toggle') {
        void agentPanel.toggleBinding(actEl.getAttribute('data-team') ?? '', actEl.getAttribute('data-feature') ?? '', actEl.getAttribute('data-member') ?? '')
        return
      }
      if (act === 'agent-refresh-catalog') { void agentPanel.loadCatalog().then(() => agentPanel.openMemberForm(actEl.getAttribute('data-team') ?? '')); return }
      if (act === 'agent-memory-open') { void agentPanel.openMemoryModal(); return }
      if (act === 'agent-memory-add') { void agentPanel.addMemory(); return }
      if (act === 'agent-memory-del') { void agentPanel.deleteMemory(id); return }
      if (act === 'agent-knowledge-open') { agentPanel.openKnowledgeModal(); return }
      if (act === 'agent-knowledge-index') { void agentPanel.indexKnowledge(); return }
      if (act === 'agent-knowledge-search') { void agentPanel.searchKnowledge(); return }
      if (act === 'new') { openNewTask(); return }
      if (act === 'settings') { void void openSettings(); return }
      if (act === 'space-add') { openSpace(); return }
      if (act === 'create-space') { createSpace(); return }
      if (act === 'pick-color') {
        pendingColor = actEl.getAttribute('data-color') ?? ACCENTS[0]
        shadow.querySelectorAll('[data-act="pick-color"]').forEach(node => {
          (node as HTMLElement).style.borderColor = node === actEl ? 'var(--text)' : 'transparent'
        })
        return
      }
      if (act === 'theme') { openThemeMenu(); return }
      if (act === 'set-theme') {
        const inSettings = ($id('wb-modal')?.innerHTML ?? '').includes('工作台设置')
        db.settings.theme = (actEl.getAttribute('data-theme') ?? 'auto') as Theme
        renderAll()
        scheduleSave()
        if (inSettings) void openSettings()
        else closeModal()
        toast((db.settings.theme ?? 'auto') === 'auto' ? '已跟随 DSH 主题' : '已切换工作台主题')
        return
      }
      if (act === 'collapse') { collapseTouched = true; ui.collapsed = !ui.collapsed; renderAll(); return }
      if (act === 'retry') { void boot(); return }
      if (act === 'create') { createFromModal(); return }
      if (act === 'delete') { deleteTask(id); return }
      if (act === 'copy') { copyTask(id); return }
      if (act === 'refresh') { void reloadFromServer(); return }
      if (act === 'focus-title') {
        const el = shadow.querySelector<HTMLElement>('[data-edit-title]')
        el?.focus()
        return
      }
      if (act === 'toggle') { toggleDone(id); return }
      if (act === 'toggle-sub') {
        const task = taskOf(id)
        const sub = task?.subtasks.find(s => s.id === actEl.getAttribute('data-sid'))
        if (task && sub) {
          sub.done = !sub.done
          task.updatedAt = nowStamp()
          renderAll()
          scheduleSave()
        }
        return
      }
      if (act === 'tab') { ui.detailTab = (actEl.getAttribute('data-tab') ?? 'detail') as Ui['detailTab']; renderDetail(); return }
      if (act === 'preset') {
        const n = Number(actEl.getAttribute('data-n') ?? 25)
        timer.preset = n
        timer.remaining = n * 60
        timer.running = false
        timer.endsAt = 0
        renderContent()
        return
      }
      if (act === 'toggle-timer') {
        if (timer.running) {
          timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))
          timer.running = false
          timer.endsAt = 0
        } else {
          timer.endsAt = Date.now() + timer.remaining * 1000
          timer.running = true
        }
        renderContent()
        return
      }
      if (act === 'reset') {
        timer.running = false
        timer.endsAt = 0
        timer.remaining = timer.preset * 60
        renderContent()
        return
      }
      if (act === 'queue') {
        if (timer.running) { toast('计时中，先暂停再切换任务'); return }
        timer.taskId = actEl.getAttribute('data-id')
        renderContent()
        return
      }
      if (act === 'focus-expand') { ui.focusExpand = !ui.focusExpand; renderAll(); return }
      if (act === 'cal-mode') { ui.calendarMode = (actEl.getAttribute('data-mode') ?? 'week') as Ui['calendarMode']; renderContent(); return }
      if (act === 'cal-prev' || act === 'cal-next') {
        const dir = act === 'cal-prev' ? -1 : 1
        ui.calendarAnchor = ui.calendarMode === 'week' ? addDays(ui.calendarAnchor, dir * 7)
          : ui.calendarMode === 'month' ? addMonths(ui.calendarAnchor, dir)
            : addMonths(ui.calendarAnchor, dir * 12)
        renderContent()
        return
      }
      if (act === 'cal-day') {
        ui.calendarAnchor = actEl.getAttribute('data-day') ?? todayKey()
        ui.calendarMode = 'week'
        renderContent()
        return
      }
      if (act === 'cal-month') {
        ui.calendarAnchor = actEl.getAttribute('data-month') ?? todayKey()
        ui.calendarMode = 'month'
        renderContent()
        return
      }
      if (act === 'del-attach') {
        const task = taskOf(id)
        const aid = actEl.getAttribute('data-aid') ?? ''
        if (task) {
          task.attachments = task.attachments.filter(a => a.id !== aid)
          renderAll()
          scheduleSave()
        }
        return
      }
      if (act === 'pick-file' || act === 'pick-image') {
        const input = $id<HTMLInputElement>('wb-file')
        if (input) {
          input.accept = act === 'pick-image' ? 'image/*' : ''
          input.click()
        }
        return
      }
      if (act === 'import') { $id<HTMLInputElement>('wb-import')?.click(); return }
      if (act === 'export') { exportData(); return }
      if (act === 'notify') { openNotifications(); return }
      if (act === 'filter') { openFilter(); return }
      if (act === 'sort') { openSort(); return }
      if (act === 'set-filter') {
        ui.filter = (actEl.getAttribute('data-filter') ?? 'all') as Ui['filter']
        closeModal()
        renderAll()
        return
      }
      if (act === 'set-sort') {
        ui.sort = (actEl.getAttribute('data-sort') ?? 'time') as Ui['sort']
        closeModal()
        renderAll()
        return
      }
      if (act === 'density') {
        ui.compact = !ui.compact
        db.settings.compact = ui.compact
        renderAll()
        scheduleSave()
        toast(ui.compact ? '紧凑视图' : '标准视图')
        return
      }
      if (act === 'test-pick') { testProjectSelected = actEl.getAttribute('data-id') ?? ''; testRunSelected = null; testTab = 'cases'; renderContent(); return }
      if (act === 'test-new') { openTestProject(); return }
      if (act === 'test-edit') { openTestProject(testProjectSelected ?? undefined); return }
      if (act === 'test-save') { void saveTestProject(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'test-delete') { void deleteTestProject(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'test-refresh') { void loadTests(); return }
      if (act === 'test-tab') { testTab = (actEl.getAttribute('data-tab') as 'cases' | 'run' | 'report' | 'deploy') ?? 'cases'; renderContent(); return }
      if (act === 'test-gen') { openTestGen(); return }
      if (act === 'test-exec') { openTestExecDispatch(); return }
      if (act === 'test-exec-run') {
        const target = $id<HTMLSelectElement>('wb-dispatch-target')?.value ?? ''
        const prompt = $id<HTMLTextAreaElement>('wb-dispatch-prompt')?.value.trim() ?? ''
        const run = testRunOf(actEl.getAttribute('data-run') ?? '')
        const project = testProjectOf(testProjectSelected)
        if (prompt === '' || !run || !project) return
        closeModal()
        void (async () => {
          try { await navigator.clipboard.writeText(prompt) } catch { /* ignore */ }
          if (target !== '') {
            try { await appendToExistingSession(target, prompt); toast('已追加到已有会话'); return }
            catch (cause) { toast(`追加失败，已复制提示词：${String((cause as Error).message ?? cause)}`); return }
          }
          try { await queueTestExec(project, run) } catch (cause) { toast(`提交失败：${String((cause as Error).message ?? cause)}`) }
        })()
        return
      }
      if (act === 'test-gen-run') { void runTestGen(); return }
      if (act === 'test-case-delete') { void deleteTestCase(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'test-start') { void startTestRun(); return }
      if (act === 'test-result') { void updateTestResult(actEl.getAttribute('data-run') ?? '', actEl.getAttribute('data-case') ?? '', (actEl.getAttribute('data-status') as TestResult['status']) ?? 'pending'); return }
      if (act === 'test-bug') { void createBugFromTest(actEl.getAttribute('data-run') ?? '', actEl.getAttribute('data-case') ?? ''); return }
      if (act === 'test-finish') { void finishTestRun(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'test-regression') { void regressionRun(); return }
      if (act === 'test-report-save') { void saveTestReport(); return }
      if (act === 'test-deploy') { void deployTestProject(); return }
      if (act === 'product-pick') { const id = actEl.getAttribute('data-id') ?? ''; if (productPicked.has(id)) productPicked.delete(id); else productPicked.add(id); renderContent(); return }
      if (act === 'product-select') {
        productSelected = actEl.getAttribute('data-id') ?? null
        productNodeSelected = null
        productDemoSelected = ''
        productPicked = productDefaultPicked(productOf(productSelected))
        renderContent()
        return
      }
      if (act === 'product-new') { openProductEdit(); return }
      if (act === 'product-edit') { openProductEdit(productSelected ?? undefined); return }
      if (act === 'product-save') { void saveProduct(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-delete') { void deleteProduct(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-tab') { productTab = (actEl.getAttribute('data-tab') as 'map' | 'notes' | 'modules' | 'demo') ?? 'map'; renderContent(); return }
      if (act === 'product-refresh') { void loadProducts(); return }
      if (act === 'product-node-new') { openNodeQuickAdd('child', (actEl.getAttribute('data-type') as ProductNodeKind) ?? 'feature'); return }
      if (act === 'product-node-child') { openNodeQuickAdd('child'); return }
      if (act === 'product-node-sibling') { openNodeQuickAdd('sibling'); return }
      if (act === 'product-node-add-quick') { void saveQuickNode(); return }
      if (act === 'pm-map-new') { openMapEditor(); return }
      if (act === 'pm-map-rename') { openMapEditor(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-map-save') { void saveMapFromModal(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-map-delete') { void deleteMapById(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-map-select') { selectMap(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-engine') { productMapEngine = actEl.getAttribute('data-mode') === 'force' ? 'force' : 'tree'; productMapPreview = null; renderContent(); return }
      if (act === 'pm-undo') { mapHistoryStep('undo'); return }
      if (act === 'pm-redo') { mapHistoryStep('redo'); return }
      if (act === 'pm-selection-clear') { productNodeSelected = null; renderSelectionBar(); return }
      if (act === 'pm-toggle-fold') { toggleNodeFold(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-node-kind') { void changeNodeKind(actEl.getAttribute('data-id') ?? '', (actEl.getAttribute('data-kind') as ProductNodeKind) ?? 'feature'); return }
      if (act === 'pm-node-relate') { openRelateModal(actEl.getAttribute('data-id') ?? productNodeSelected ?? '', false); return }
      if (act === 'pm-node-relate-ext') { openRelateModal(actEl.getAttribute('data-id') ?? productNodeSelected ?? '', true); return }
      if (act === 'pm-relate-save') { saveRelate(actEl.getAttribute('data-id') ?? '', actEl.getAttribute('data-ext') === '1'); return }
      if (act === 'pm-export-outline') { exportMindmapOutline(); return }
      if (act === 'pm-export-image') { void exportMapImage(); return }
      if (act === 'pm-ref-check') { openRefCheck(); return }
      if (act === 'pm-import-outline') { importMindmapOutline(); return }
      if (act === 'pm-import-run') { void runMindmapImport(); return }
      if (act === 'pm-import-idea') { void openIdeaImport(); return }
      if (act === 'pm-ai-add-url') { addAiUrl(); return }
      if (act === 'pm-ai-pick') { $id<HTMLInputElement>('wb-ai-file')?.click(); return }
      if (act === 'pm-ai-remove') { removeAiInput(Number(actEl.getAttribute('data-index') ?? '-1')); return }
      if (act === 'idea-import-next') { void openIdeaVersionPick(); return }
      if (act === 'idea-import-run') { void runIdeaImport(actEl.getAttribute('data-idea') ?? '', actEl.getAttribute('data-name') ?? ''); return }
      if (act === 'pm-version-archive') { void archiveMapVersion(); return }
      if (act === 'pm-version-preview') { void previewMapVersion(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-version-rollback') { void rollbackMapVersion(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-version-delete') { void removeMapVersion(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'pm-version-back') { productMapPreview = null; renderContent(); return }
      if (act === 'pm-version-diff') { void openMapVersionDiff(); return }
      if (act === 'pm-version-more') { productVersionLimit = Math.min(productVersionLimit + 20, productMapVersions.length); renderContent(); return }
      if (act === 'pm-version-diff-run') { void runMapVersionDiff(); return }
      if (act === 'product-node-edit') { openNodeProperty(); return }
      if (act === 'product-node-update') { void updateProductNode(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-node-delete') { void deleteProductNode(); return }
      if (act === 'product-gen-notes') { void generateProductNotes(); return }
      if (act === 'product-gen-modules') { void generateProductModules(); return }
      if (act === 'bug-enable-project') { void enableBugProject(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-module-new') { openModuleEditor(); return }
      if (act === 'product-module-add') { openModuleEditor(undefined, actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-module-edit') { openModuleEditor(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-module-save') { void saveModuleFromModal(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-module-delete') { void deleteModuleById(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-module-filter-clear') { moduleFilterKind = ''; moduleFilterPlatform = ''; renderContent(); return }
      if (act === 'pipeline-open') { openPipeline(); return }
      if (act === 'pipeline-run') { void runPipeline(); return }
      if (act === 'pipeline-next') { void runPipelineNext(); return }
      if (act === 'archive-toggle') {
        const target = actEl.getAttribute('data-target') ?? ''
        const id = actEl.getAttribute('data-id') ?? ''
        const archived = actEl.getAttribute('data-archived') === '1'
        void setArchivedFlag(target, id, archived)
        return
      }
      if (act === 'product-note-new') { openNoteCreator(); return }
      if (act === 'product-note-new-node') { openNoteCreator(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-note-edit') { openNoteEditor(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-note-save') { void saveNoteFromModal(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-note-create') { void createNoteFromModal(); return }
      if (act === 'product-note-delete') { void removeNoteById(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-note-filter-missing') { noteFilterMissing = !noteFilterMissing; renderContent(); return }
      if (act === 'product-note-pick-missing') { const cov = noteCoverage(productOf(productSelected)); productPicked = new Set(cov.missing.map(n => n.id)); renderContent(); toast(`已勾选 ${cov.missing.length} 个缺失节点`); return }
      if (act === 'product-progress-clear') { void clearProductProgress(); return }
      if (act === 'product-chat-open') { productChat?.open({ teamName: productDispatch?.teamName ?? '', dispatchId: productDispatch?.dispatchId ?? '', sessionId: productDispatch?.sessionId ?? '', timeoutMs: 15 * 60 * 1000 }); return }
      if (act === 'product-demo-delete') { void deleteProductDemo(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'product-note-open') { const nid = actEl.getAttribute('data-id') ?? ''; closeModal(); void openProductNote(nid); return }
      if (act === 'product-module-detail') { openModuleDetail(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'flow-gen-tests') {
        // 产品设计 → 测试用例：带上下文跳到测试域生成用例
        const product = productOf(productSelected)
        if (!product) return
        ui.view = 'test'
        renderAll()
        void loadTests(true).then(() => {
          const project = testProjects.find(p => p.productId === product.id) ?? testProjectOf(testProjectSelected)
          if (project) {
            testProjectSelected = project.id
            testGenSource = 'notes'
            testGenRequirement = `基于产品「${product.name}」的设计笔记生成测试用例`
            openTestGen()
          } else {
            toast('先创建测试项目并关联该产品，再生成用例')
            openTestProject()
          }
        })
        return
      }
      if (act === 'bug-regression') {
        // Bug 修复 → 回归：跳到测试域执行回归
        ui.view = 'test'
        testTab = 'run'
        renderAll()
        void loadTests(true).then(() => { toast('在「执行」页点「回归失败用例」验证修复') })
        return
      }
      if (act === 'cmd') { openCommandPalette(); return }
      if (act === 'cmd-go') {
        const view = actEl.getAttribute('data-view') ?? ''
        const action = actEl.getAttribute('data-action') ?? ''
        closeModal()
        if (view !== '') {
          ui.view = view as Ui['view']
          ui.selected = null
          renderAll()
          return
        }
        if (action === 'new') { openNewTask(); return }
        if (action === 'note-new') { ui.view = 'notes'; renderAll(); window.setTimeout(() => { void createNote() }, 0); return }
        if (action === 'bug-new') { ui.view = 'bugs'; renderAll(); window.setTimeout(() => openBugEditor(), 0); return }
        if (action === 'product-new') { ui.view = 'product'; renderAll(); window.setTimeout(() => openProductEdit(), 0); return }
        if (action === 'test-new') { ui.view = 'test'; renderAll(); window.setTimeout(() => openTestProject(), 0); return }
        if (action === 'theme') { openThemeMenu(); return }
        if (action === 'settings') { void openSettings(); return }
        return
      }
      if (act === 'ai-dispatch') { openAiDispatch(actEl.getAttribute('data-kind') ?? 'product'); return }
      if (act === 'ai-dispatch-run') { void runAiDispatch(actEl.getAttribute('data-kind') ?? 'product'); return }
      if (act === 'product-gen-demo') { void generateProductDemo((actEl.getAttribute('data-scope') as 'all' | 'feature') ?? 'all'); return }
      if (act === 'product-gen-demo-ai') { void generateDemoViaAI(); return }
      if (act === 'demo-viewport') { demoViewport = (actEl.getAttribute('data-v') as 'pc' | 'tablet' | 'mobile') ?? 'pc'; renderContent(); return }
      if (act === 'demo-progress-clear') {
        // 只按「更新时间」屏蔽当前这张卡：下一次生成的进度时间不同会自动重新出现
        demoProgressDismissedAt = demoProgress?.updatedAt ?? new Date().toISOString()
        renderContent()
        return
      }
      if (act === 'bug-project') { bugProjectFilter = actEl.getAttribute('data-id') ?? 'all'; bugSelected.clear(); renderContent(); return }
      if (act === 'bug-project-new') { openBugProject(); return }
      if (act === 'bug-project-manage') { openBugProjectManager(); return }
      if (act === 'bug-project-edit') { openBugProject(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-project-delete') { void deleteBugProject(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-project-save') { void saveBugProject(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-new') { openBugEditor(undefined, (actEl.getAttribute('data-status') as BugStatus | null) ?? 'open'); return }
      if (act === 'bug-save') { void saveBug(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-detail') { openBugDetail(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-edit') { openBugEditor(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-delete') { void deleteBug(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'bug-status') { void setBugStatus(actEl.getAttribute('data-id') ?? '', (actEl.getAttribute('data-status') ?? 'open') as BugStatus); return }
      if (act === 'bug-ai-submit') { void submitBugsToAI([actEl.getAttribute('data-id') ?? '']); return }
      if (act === 'bug-ai-dispatch') {
        const bug = bugOf(actEl.getAttribute('data-id') ?? '')
        if (bug) { closeModal(); bugSelected = new Set([bug.id]); openAiDispatch('bug', bugPrompt([bug])) }
        return
      }
      if (act === 'note-ai-dispatch') {
        const note = noteById(noteSelected)
        if (note) openAiDispatch('note', noteImprovePrompt(note, ''))
        return
      }
      if (act === 'bug-goto-session') {
        const sid = actEl.getAttribute('data-id') ?? ''
        const row = Array.from(document.querySelectorAll<HTMLElement>('[data-row-key^="session:"],[data-session-id]'))
          .find(el => (el.getAttribute('data-row-key') ?? el.getAttribute('data-session-id') ?? '').includes(sid))
        if (row !== undefined) { closeModal(); row.click(); toast('已跳转到修复会话') }
        else toast('未在侧栏找到该会话，可能已归档')
        return
      }
      if (act === 'bug-select') { const id = actEl.getAttribute('data-id') ?? ''; if (bugSelected.has(id)) bugSelected.delete(id); else bugSelected.add(id); refreshBugMain(); return }
      if (act === 'bug-select-clear') { bugSelected.clear(); refreshBugMain(); return }
      if (act === 'bug-submit-selected') { void submitBugsToAI(Array.from(bugSelected)); return }
      if (act === 'bug-plan-selected') { planSelectedBugs(); return }
      if (act === 'bug-plan-save') { void saveBugPlan(); return }
      if (act === 'bug-plan-submit') { void submitPlannedBugs(); return }
      if (act === 'bug-refresh') { void loadBugs(); return }
      if (act === 'note-new') { void createNote(); return }
      if (act === 'note-ai-improve') { const note=noteById(noteSelected); if(note){ const ok=typeof window.confirm==='function'?window.confirm('AI 将新建会话并修改这篇笔记，继续？'):true; if(ok) void improveSelectedNote('') } return }
      if (act === 'note-ai-requirements') { openNoteRequirements(); return }
      if (act === 'note-ai-run') { const req=$id<HTMLTextAreaElement>('wb-note-req')?.value ?? ''; closeModal(); void improveSelectedNote(req); return }
      if (act === 'note-save') { void flushNoteSave(); return }
      if (act === 'note-saveas') { void exportSelectedNote('md'); return }
      if (act === 'note-pdf') { void exportSelectedNote('pdf'); return }
      if (act === 'open-export-folder') { void openExportFolder(); return }
      if (act === 'copy-export-path') { void copyExportPath(); return }
      if (act === 'notebook-new') { openNotebookCreate(); return }
      if (act === 'notebook-manage') { openNotebookManager(); return }
      if (act === 'nb-create') { void createNotebook(); return }
      if (act === 'nb-rename') { openNotebookRename(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'nb-rename-save') { void renameNotebook(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'nb-delete') { void deleteNotebook(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'export-dir-save') { void saveExportDir($id<HTMLInputElement>('wb-export-dir')?.value ?? ''); return }
      if (act === 'export-dir-default') { void saveExportDir(defaultExportDir); return }
      if (act === 'note-delete') { void deleteSelectedNote(); return }
      if (act === 'note-pin') { void toggleSelectedPin(); return }
      if (act === 'note-convert') { void convertNoteToTask(); return }
      if (act === 'note-retry') { void loadNotes(); return }
      if (act === 'note-tab') { ui.noteMode = (actEl.getAttribute('data-mode') ?? 'edit') as 'edit' | 'preview'; renderContent(); return }
      if (act === 'note-filter') { ui.notesFilter = actEl.getAttribute('data-filter') ?? 'all'; renderContent(); return }
      if (act === 'news-add') { openNewsTopic(); return }
      if (act === 'news-preset') {
        const preset = NEWS_PRESETS[Number(actEl.getAttribute('data-index') ?? 0)]
        if (preset) openNewsTopic(undefined, preset)
        return
      }
      if (act === 'news-edit') { const topic = newsTopics.find(t => t.id === id); if (topic) openNewsTopic(topic); return }
      if (act === 'news-save') { void saveNewsFromModal(actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'news-run') { void runNewsTopic(id); return }
      if (act === 'news-toggle') { void toggleNewsTopic(id); return }
      if (act === 'news-delete') { void deleteNewsTopic(id); return }
      if (act === 'news-refresh') { void loadNews(); return }
      if (act === 'news-filter') {
        ui.newsTopicFilter = actEl.getAttribute('data-topic') ?? 'all'
        renderContent()
        return
      }
      if (act === 'edit-field') { openField(actEl.getAttribute('data-field') ?? '', id); return }
      if (act === 'apply-field') { applyField(actEl.getAttribute('data-field') ?? '', actEl.getAttribute('data-id') ?? ''); return }
      if (act === 'manage-spaces') { openSpaces(); return }
      if (act === 'sub-plan') { openSubPlan(id, actEl.getAttribute('data-sid') ?? ''); return }
      if (act === 'apply-sub-plan') { applySubPlan(id, actEl.getAttribute('data-sid') ?? ''); return }
      if (act === 'del-space') {
        const sp = db.spaces.find(x => x.id === id)
        if (!sp) return
        const used = db.tasks.filter(t => t.space === id)
        if (used.length > 0) { toast(`「${sp.name}」还有 ${used.length} 项任务，先移动任务再删除`); return }
        db.spaces = db.spaces.filter(x => x.id !== id)
        if (ui.space === id) ui.space = 'all'
        scheduleSave()
        renderAll()
        openSpaces()
        toast('空间已删除')
        return
      }
      if (act === 'review') { ui.view = 'stats'; ui.statsPeriod = 'month'; renderAll(); return }
      if (act === 'stats-period') { ui.statsPeriod = (actEl.getAttribute('data-period') ?? 'week') as Ui['statsPeriod']; renderAll(); return }
      if (act === 'custom-timer') { openCustomTimer(); return }
      if (act === 'apply-timer') { applyCustomTimer(); return }
      if (act === 'sub-note') {
        const sid = actEl.getAttribute('data-sid') ?? ''
        ui.subNoteId = ui.subNoteId === sid ? null : sid
        renderDetail()
        return
      }
      return
    }
    if (target.classList?.contains('overlay')) { closeModal(); return }
    if (target.closest('[data-stop]')) return

    const scopeEl = target.closest('[data-scope]')
    if (scopeEl) {
      ui.scope = (scopeEl.getAttribute('data-scope') ?? 'today') as Ui['scope']
      ui.view = 'list'
      ui.space = 'all'
      renderAll()
      return
    }
    const viewEl = target.closest('[data-view]')
    if (viewEl) {
      const next = (viewEl.getAttribute('data-view') ?? 'board') as Ui['view']
      if (ui.view === 'notes' && next !== 'notes') void flushNoteSave()
      ui.view = next
      renderAll()
      if (ui.view === 'portal') void refreshPortal()
      if (ui.view === 'news') void loadNews()
      if (ui.view === 'notes') void loadNotes()
      if (ui.view === 'bugs') void loadBugs()
      if (ui.view === 'product') void loadProducts()
      if (ui.view === 'test') void loadTests()
      return
    }
    const productNodeFoldEl = target.closest('[data-product-node-fold]') as HTMLElement | null
    if (productNodeFoldEl !== null) {
      event.stopPropagation()
      toggleNodeFold(productNodeFoldEl.getAttribute('data-product-node-fold') ?? '')
      return
    }
    const productNodeEl = target.closest('[data-product-node]') as HTMLElement | null
    if (productNodeEl !== null) { productNodeSelected = productNodeEl.getAttribute('data-product-node'); renderContent(); return }
    const productNoteEl = target.closest('[data-product-note]') as HTMLElement | null
    if (productNoteEl !== null) { openNoteEditor(productNoteEl.getAttribute('data-product-note') ?? ''); return }
    const productDemoEl = target.closest('[data-product-demo]') as HTMLElement | null
    if (productDemoEl !== null) { productDemoSelected = productDemoEl.getAttribute('data-product-demo') ?? ''; renderContent(); return }
    const bugEl = target.closest('[data-bug-id]') as HTMLElement | null
    if (bugEl !== null) { openBugDetail(bugEl.getAttribute('data-bug-id') ?? ''); return }
    const noteEl = target.closest('[data-note-id]')
    if (noteEl) {
      void selectNote(noteEl.getAttribute('data-note-id') ?? '')
      return
    }
    const spaceEl = target.closest('[data-space]')
    if (spaceEl) {
      const space = spaceEl.getAttribute('data-space') ?? 'all'
      ui.space = ui.space === space && space !== 'all' ? 'all' : space
      renderAll()
      return
    }
    const idEl = target.closest('[data-id]')
    if (idEl) {
      const id = idEl.getAttribute('data-id') ?? ''
      if (id !== '') {
        const task = taskOf(id)
        if (ui.view === 'calendar' && task) {
          ui.view = 'list'
          ui.scope = task.date === todayKey() ? 'today' : 'all'
        }
        ui.selected = id
        ui.detailTab = 'detail'
        ui.subNoteId = null
        if (ui.view === 'focus') timer.taskId = id
        if (($id('wb-modal')?.innerHTML ?? '') !== '') closeModal()
        renderAll()
      }
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && ctxMenuOpen) { closeContextMenu(); return }
    if (ui.view === 'notes' && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      event.stopPropagation()
      void flushNoteSave()
      return
    }
    // 思维导图快捷键（对标 XMind）：Tab 子节点 / Enter 同级 / F2 重命名 / Delete 删除
    const tag = (event.target as HTMLElement | null)?.tagName
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
    const modalOpen = ($id('wb-modal')?.innerHTML ?? '') !== ''
    if (ui.view === 'product' && productTab === 'map' && !typing && !modalOpen) {
      /* 画布内 Tab/Enter 交给 mind-elixir 原生编辑；画布外走快速添加 */
      const inCanvas = (event.target as HTMLElement | null)?.closest('#pm-plot') !== null
      /* 撤销/重做：画布内让 mind-elixir 自己处理（它已绑 Ctrl+Z），这里只处理画布外与兜底 */
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        event.stopPropagation()
        mapHistoryStep(event.shiftKey ? 'redo' : 'undo')
        return
      }
      if (event.key === 'Tab' && !inCanvas) {
        event.preventDefault()
        event.stopPropagation()
        openNodeQuickAdd('child')
        return
      }
      if (event.key === 'Enter' && !inCanvas && productNodeSelected !== null) {
        event.preventDefault()
        event.stopPropagation()
        openNodeQuickAdd('sibling')
        return
      }
      if (event.key === 'F2') {
        event.preventDefault()
        event.stopPropagation()
        openNodeProperty()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (productNodeSelected !== null) {
          event.preventDefault()
          event.stopPropagation()
          void deleteProductNode()
        }
        return
      }
    }
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement | null
      const actionable = target?.closest('[data-act]') as HTMLElement | null
      if (actionable && actionable.getAttribute('data-act') !== 'noop' && target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA' && target?.tagName !== 'SELECT') {
        event.preventDefault()
        actionable.click()
        return
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      event.stopPropagation()
      openCommandPalette()
      return
    }
    if (event.key === 'Escape') { closeModal() }
  }

  function onVisibility(): void {
    if (document.visibilityState === 'hidden') {
      if (dirty) void flush()
      if (noteDirty) void flushNoteSave()
    }
  }

  /* ---------- 启动 ---------- */
  async function reloadFromServer(): Promise<void> {
    if (saveTimer !== 0) { window.clearTimeout(saveTimer); saveTimer = 0 }
    try {
      const res = await fetch(`${API}/state`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { revision: number } & DB
      applyRemote(data)
      ui.compact = db.settings.compact === true
      initSideWidth()
      if (ui.selected === null) ui.selected = chooseSelection()
      dirty = false
      setSaveState('saved')
      renderAll()
      toast('已从数据库刷新')
    } catch (cause) {
      toast(`刷新失败：${String((cause as Error).message)}`)
    }
  }

  async function boot(): Promise<void> {
    loaded = false
    loadError = ''
    renderContent()
    if (saveTimer !== 0) { window.clearTimeout(saveTimer); saveTimer = 0 }
    try {
      const res = await fetch(`${API}/state`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { revision: number } & DB
      applyRemote(data)
      ui.compact = db.settings.compact === true
      initSideWidth()
      if (ui.selected === null) ui.selected = chooseSelection()
      if (timer.taskId === null) timer.taskId = chooseSelection()
      loaded = true
      renderAll()
      void agentPanel.load().then(() => { if (ui.view === 'portal') renderAll() })
      if (ui.view === 'portal') void refreshPortal()
      if (ui.view === 'news') void loadNews()
      if (ui.view === 'notes') void loadNotes()
      if (ui.view === 'bugs') void loadBugs()
      if (ui.view === 'product') void loadProducts()
      if (ui.view === 'test') void loadTests()
    } catch (cause) {
      loadError = String((cause as Error).message ?? cause)
      loaded = false
      renderContent()
    }
  }

  const clickListener: EventListener = (e) => onClick(e as MouseEvent)
  const keyListener: EventListener = (e) => onKeydown(e as KeyboardEvent)
  const contextListener: EventListener = (e) => onContextMenu(e as MouseEvent)
  shadow.addEventListener('click', clickListener)
  shadow.addEventListener('keydown', keyListener)
  shadow.addEventListener('contextmenu', contextListener)
  shadow.addEventListener('scroll', closeContextMenu, true)
  window.addEventListener('visibilitychange', onVisibility)

  /*
   * 侧栏宽度拖拽：在把手上按下后把 pointermove/pointerup 挂到 window，
   * 松手才写回 settings（拖动过程只改 CSS 变量，不触发保存）。
   */
  const onSideResizeDown = (event: Event): void => {
    const target = event.target as HTMLElement | null
    const handle = target === null ? null : (target.closest('[data-resize="side"]') as HTMLElement | null)
    if (handle === null) return
    const pointer = event as PointerEvent
    if (typeof pointer.button === 'number' && pointer.button !== 0) return
    pointer.preventDefault()
    const app = $id('wb-app')
    if (app === null) return
    /* 捕获指针：拖出窗口也能收到 pointerup，不会卡在拖拽态。 */
    try { handle.setPointerCapture(pointer.pointerId) } catch { /* 不支持捕获时退回 window 监听 */ }
    const startX = pointer.clientX
    const startWidth = sideWidth
    let done = false
    app.classList.add('resizing')
    const move = (next: Event): void => {
      const p = next as PointerEvent
      applySideWidth(startWidth + (p.clientX - startX), false)
    }
    const finish = (): void => {
      if (done) return
      done = true
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      app.classList.remove('resizing')
      applySideWidth(sideWidth, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
  }
  /** 双击把手回到默认宽度。 */
  const onSideResizeReset = (event: Event): void => {
    const target = event.target as HTMLElement | null
    if (target === null || target.closest('[data-resize="side"]') === null) return
    const fallback = window.matchMedia('(max-width:1250px)').matches ? SIDE_DEFAULT_NARROW : SIDE_DEFAULT
    applySideWidth(fallback, true)
  }
  shadow.addEventListener('pointerdown', onSideResizeDown)
  shadow.addEventListener('dblclick', onSideResizeReset)
  const themeObserver = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(() => { if ((db.settings.theme ?? 'auto') === 'auto') applyTheme() })
    : null
  themeObserver?.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'data-theme'] })
  themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-ds-dark-theme'] })

  const tick = window.setInterval(() => {
    if (!timer.running) return
    timer.remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000))
    if (timer.remaining <= 0) {
      timer.running = false
      timer.endsAt = 0
      const minutes = timer.preset
      db.focus.push({ id: uid('f'), taskId: timer.taskId, startedAt: nowStamp(), minutes, completed: true })
      timer.remaining = minutes * 60
      renderContent()
      scheduleSave()
      toast(`完成一轮专注 · ${minutes} 分钟`)
      return
    }
    if (ui.view === 'focus') {
      const timeNode = shadow.querySelector('.timer-time')
      if (timeNode) timeNode.textContent = `${pad(Math.floor(timer.remaining / 60))}:${pad(timer.remaining % 60)}`
      const ring = shadow.querySelector<HTMLElement>('.timer-ring')
      if (ring) ring.style.setProperty('--p', String(Math.round((1 - timer.remaining / (timer.preset * 60)) * 100)))
    }
  }, 1000)

  const hostObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (collapseTouched) return
      const should = hostEl.clientWidth > 0 && hostEl.clientWidth < 1250
      if (ui.collapsed !== should) { ui.collapsed = should; renderAll() }
    })
    : null
  hostObserver?.observe(hostEl)

  const newsTick = window.setInterval(() => {
    if (!loaded || ui.view !== 'news' || ui.newsLoading) return
    const interval = newsWatchUntil > Date.now() ? 6000 : 25_000
    if (Date.now() - lastNewsPoll < interval) return
    void loadNews(true)
  }, 5000)

  /* AI 回写后的静默轮询：Bug 看板 6s（README 承诺），产品/测试 12s */
  const bugTick = window.setInterval(() => {
    if (!loaded || ui.view !== 'bugs' || bugLoading) return
    void loadBugs(true)
  }, 6000)
  const productTick = window.setInterval(() => {
    if (!loaded || ui.view !== 'product' || productLoading) return
    void loadProducts(true)
  }, 12_000)
  /* Demo 生成进度：生成中 4s 快轮询（本地渲染 + AI 回写共用） */
  const demoTick = window.setInterval(() => {
    if (!loaded || ui.view !== 'product') return
    if (demoProgress?.status !== 'running') return
    void loadDemoProgress(productSelected ?? '')
  }, 4000)
  const testTick = window.setInterval(() => {
    if (!loaded || ui.view !== 'test' || testLoading) return
    void loadTests(true)
  }, 12_000)
  const noteTick = window.setInterval(() => {
    if (!loaded || ui.view !== 'notes' || noteLoading || noteDirty) return
    void loadNotes(true)
  }, 15_000)

  void boot()

  return {
    destroy(): void {
      try { ideaView?.destroy() } catch (cause) { console.warn('[dsh-workbench] 灵感视图卸载失败', cause) }
      ideaView = null
      if (saveTimer !== 0) window.clearTimeout(saveTimer)
      if (noteSaveTimer !== 0) window.clearTimeout(noteSaveTimer)
      if (toastTimer !== 0) window.clearTimeout(toastTimer)
      window.clearInterval(tick)
      window.clearInterval(newsTick)
      window.clearInterval(bugTick)
      window.clearInterval(productTick)
      window.clearInterval(demoTick)
      window.clearInterval(testTick)
      window.clearInterval(noteTick)
      hostObserver?.disconnect()
      shadow.removeEventListener('click', clickListener)
      shadow.removeEventListener('keydown', keyListener)
      shadow.removeEventListener('contextmenu', contextListener)
      shadow.removeEventListener('scroll', closeContextMenu, true)
      shadow.removeEventListener('pointerdown', onSideResizeDown)
      shadow.removeEventListener('dblclick', onSideResizeReset)
      window.removeEventListener('visibilitychange', onVisibility)
      themeObserver?.disconnect()
      shadow.innerHTML = ''
    },
  }
}

/* ------------------------------- 静态骨架 ------------------------------- */
const SHELL = `
<div class="app" id="wb-app">
  <aside class="sidebar" id="wb-sidebar"></aside>
  <div class="side-resizer" id="wb-side-resizer" data-resize="side" role="separator" aria-orientation="vertical" title="拖动调整侧栏宽度 · 双击复位"></div>
  <div class="main">
    <header class="topbar" id="wb-topbar"></header>
    <div class="workspace">
      <section class="content" id="wb-content"><div id="wb-generic"></div><div id="wb-idea-root" style="display:none"></div></section>
      <aside class="detail" id="wb-detail"></aside>
    </div>
  </div>
</div>
<div id="wb-modal"></div>
<div id="wb-ctxmenu" class="ctxmenu"></div>
<div class="toast" id="wb-toast"></div>`
