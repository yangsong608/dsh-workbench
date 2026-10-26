/**
 * 灵感视图控制器
 *
 * 设计约束：
 * - 画布用 mind-elixir（编辑）/ ECharts graph（关系）两个引擎，实例必须常驻，
 *   所以本模块自持 DOM，只把「列表 / 工具栏 / 详情」的片段重绘；
 * - 与 app.ts 只通过 deps 交互（不 import app.ts，避免循环依赖）；
 * - 所有请求走 /workbench-api/ideas*（独立端点，不进整份快照）。
 */
import { IDEA_CSS } from './idea.css.js'
import { IDEA_ANGLES, IDEA_ANGLE_PRESETS } from '../shared/idea-angles.js'
import { createAgentChat, teamStateOf, type ChatHandle } from './agent-chat.js'
import {
  buildForceOption, fromMindElixir, graphStats, graphToMarkdown, graphToSVG,
  nodeById, safeName, toMindElixir, type IdeaGraph,
} from './idea-model.js'

export interface IdeaDeps {
  api: string
  esc: (value: unknown) => string
  ic: (name: string, size?: number) => string
  toast: (message: string) => void
  confirm: (message: string) => boolean
  openModal: (html: string) => void
  closeModal: () => void
  dispatch: (projectPath: string, prompt: string) => Promise<string>
  isDark: () => boolean
  /** 门户里的项目（由产品 / Bug 项目 / 测试项目 / 任务的工作区路径汇总得到）。 */
  portalProjects?: () => Array<{ name: string; workspacePath: string }>
  /** 智能体团队（页内会话）。缺省时退回传统单会话派发。 */
  agent?: {
    teams: () => Array<{ id: string; name: string; memberCount: number }>
    dispatch: (input: { ideaId: string; runId: string; teamId: string; feature?: string; goal: string; ideaTitle: string; ideaBrief: string; workspacePath: string; timeoutMs: number }, handlers: { event?: (event: any) => void; history?: (events: any[]) => void; status?: (status: string, note?: string) => void; team?: (projection: any) => void }) => Promise<{ dispatchId: string; sessionId: string; teamName: string; timeoutMs: number } | null>
    prompt: (sessionId: string, text: string) => Promise<void>
    stop: (dispatchId: string, sessionId: string) => Promise<void>
    openSession: (sessionId: string) => void
    /** 读会话已有事件（打开抽屉时补历史，避免「生成完再打开是空白」）。 */
    history?: (sessionId: string) => Promise<any[]>
  }
}

export interface IdeaViewHandle {
  ensure(): Promise<void>
  show(): void
  hide(): void
  destroy(): void
  reload(): Promise<void>
  isMounted(): boolean
}

interface IdeaProject { id: string; name: string; workspacePath: string; workspaceName: string }
interface IdeaInput { id: string; kind: string; text: string; url: string; filePath: string; mime: string; size: number; createdAt: string; width?: number; height?: number }
interface IdeaVersion { id: string; seq: number; label: string; source: string; mode: string; angles: string[]; summary: string; nodeCount: number; edgeCount: number; createdAt: string }
interface IdeaSummary { id: string; projectId: string; title: string; brief: string; status: string; versionSeq: number; nodeCount: number; updatedAt: string }
interface IdeaRun {
  id: string; status: string; step: number; total: number; message: string
  log: Array<{ at: string; message: string }>; error: string; kind: string; targetNodeId: string; versionId: string
}
interface IdeaDetail { idea: any; inputs: IdeaInput[]; versions: IdeaVersion[]; run: IdeaRun | null }

interface FormState {
  id: string
  title: string
  brief: string
  text: string
  urls: string[]
  images: Array<{ id?: string; dataUrl?: string; name?: string }>
  angles: string[]
  /** 本次弹窗里新增的自定义角度（保存时写入灵感的 customAngles）。 */
  customAngles?: Array<{ id: string; label: string }>
  /** 当前展开的预设维度组（空串=收起）。 */
  preset?: string
  urlDraft?: string
  mode: 'create' | 'edit' | 'generate'
}

const EMPTY_GRAPH: IdeaGraph = { v: 1, rootId: 'root', nodes: [{ id: 'root', type: 'seed', label: '新的灵感' }], edges: [] }

export function createIdeaView(host: HTMLElement, deps: IdeaDeps): IdeaViewHandle {
  const rootNode = host.getRootNode() as ShadowRoot
  let built = false
  let loading = false
  let booted = false

  /* ------------------------------ 状态 ------------------------------ */
  let projects: IdeaProject[] = []
  let ideas: IdeaSummary[] = []
  let selectedId = ''
  let detail: IdeaDetail | null = null
  let draft: { rev: number; graph: IdeaGraph } = { rev: 0, graph: EMPTY_GRAPH }
  let view: 'tree' | 'force' = 'tree'
  let selectedNode = ''
  let preview: { version: IdeaVersion; graph: IdeaGraph } | null = null
  let run: IdeaRun | null = null
  let polling = 0
  let query = ''
  let projectFilter = ''
  let filter: 'all' | 'ready' | 'draft' | 'generating' = 'all'
  let busy = ''
  let form: FormState | null = null
  let direction: 'right' | 'side' | 'down' | 'left' = 'right'
  let menuNode = ''
  let diffState: { a: string; b: string } | null = null
  let askResolve: ((value: string | null) => void) | null = null
  let askValue = ''
  /** askText 弹窗挂在 #wb-modal（不在 rootNode 内），事件需要临时挂到 shadow root 上。 */
  let askDispose: (() => void) | null = null
  let teamId = ''
  let chat: ChatHandle | null = null
  let dispatchId = ''
  let dispatchSessionId = ''
  let dispatchTimer = 0

  /**
   * 派发现场持久化：dispatchId/sessionId 只存在内存里，页面刷新后抽屉与团队进度会全部丢失
   * （后端会话仍在跑，用户只能去侧栏里翻）。用 localStorage 记一份，重新进入该灵感时恢复。
   * 只存标识，不存消息——消息由 /agents/sessions/:id/events 回放。
   */
  const DISPATCH_KEY = 'dsh-workbench.idea.dispatch'
  interface DispatchMemo { ideaId: string; dispatchId: string; sessionId: string; teamName: string; at: number }
  function readDispatchMemo(): DispatchMemo | null {
    try {
      const raw = window.localStorage.getItem(DISPATCH_KEY)
      if (raw === null || raw === '') return null
      const parsed = JSON.parse(raw) as Partial<DispatchMemo>
      if (typeof parsed.ideaId !== 'string' || typeof parsed.dispatchId !== 'string' || typeof parsed.sessionId !== 'string') return null
      /* 超过 2 小时的记录视为陈旧（派发预算最长 15 分钟，留足余量） */
      if (typeof parsed.at === 'number' && Date.now() - parsed.at > 2 * 60 * 60 * 1000) { window.localStorage.removeItem(DISPATCH_KEY); return null }
      return { ideaId: parsed.ideaId, dispatchId: parsed.dispatchId, sessionId: parsed.sessionId, teamName: String(parsed.teamName ?? ''), at: Number(parsed.at ?? 0) }
    } catch { return null }
  }
  function writeDispatchMemo(memo: Omit<DispatchMemo, 'at'>): void {
    try { window.localStorage.setItem(DISPATCH_KEY, JSON.stringify({ ...memo, at: Date.now() })) } catch { /* 忽略 */ }
  }
  function clearDispatchMemo(ideaId = ''): void {
    try {
      const memo = readDispatchMemo()
      /* 只清自己的记录，避免把另一个灵感的现场误删 */
      if (memo === null || ideaId === '' || memo.ideaId === ideaId) window.localStorage.removeItem(DISPATCH_KEY)
    } catch { /* 忽略 */ }
  }
  /** 派发早期到达、但 chat 实例还没创建时先缓存，打开抽屉时补渲染。 */
  const pendingChatEvents: any[] = []
  /** 页内会话说：轮询宿主事件的下标与定时器。 */
  let chatPolling = 0
  let chatSeq = 0
  /* run 进展监视：只在 step/total 变化时刷新时间戳，用于区分「慢」与「卡死」。 */
  let lastRunProgressKey = ''
  let lastRunProgressAt = 0

  /* ------------------------------ 引擎 ------------------------------ */
  let mind: any = null
  let mindCls: any = null
  let chart: any = null
  let echartsLoading: Promise<void> | null = null
  let mindLoading: Promise<void> | null = null
  let resizeObserver: ResizeObserver | null = null
  const plot = (): HTMLElement => rootNode.getElementById('idea-plot') as HTMLElement

  function q<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return rootNode.getElementById(id) as T | null
  }

  /* ------------------------------ 请求 ------------------------------ */
  async function api(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; body: any }> {
    const method = init.method ?? 'GET'
    const options: RequestInit = { method, headers: {} }
    if (init.body !== undefined) {
      ;(options.headers as Record<string, string>)['content-type'] = 'application/json'
      options.body = JSON.stringify(init.body)
    }
    const res = await fetch(`${deps.api}${path}`, options)
    let body: any = null
    try { body = await res.json() } catch { body = null }
    return { ok: res.ok, status: res.status, body }
  }

  /* ------------------------------ 骨架 ------------------------------ */
  function build(): void {
    if (built) return
    built = true
    const style = document.createElement('style')
    style.id = 'dsh-workbench-idea-css'
    style.textContent = IDEA_CSS
    rootNode.appendChild(style)
    host.innerHTML = `
      <div class="idea-root" id="idea-root">
        <aside class="idea-list">
          <div class="idea-list-head">
            <div class="idea-list-title">${deps.ic('spark', 14)}<span>灵感</span><span class="n" id="idea-count"></span><button class="icon-btn" data-idea-act="idea-new" title="新建灵感（文字 / 截图 / 链接）" style="margin-left:auto">＋</button></div>
            <div class="idea-project" id="idea-project-box"></div>
            <div class="idea-search">${deps.ic('search', 12)}<input id="idea-search" data-idea-input="search" placeholder="搜索标题或正文"></div>
            <div class="idea-filter" id="idea-filter"></div>
          </div>
          <div class="idea-items" id="idea-items"></div>
          <div class="idea-list-foot"><span id="idea-foot">—</span><button class="btn tiny" data-idea-act="idea-new" style="margin-left:auto">＋ 新建</button></div>
        </aside>
        <section class="idea-canvas">
          <div class="idea-bar" id="idea-bar"></div>
          <div class="idea-sub" id="idea-sub"></div>
          <div class="idea-progress" id="idea-progress" style="display:none"></div>
          <div class="idea-plot" id="idea-plot"></div>
        </section>
        <aside class="idea-detail" id="idea-detail"></aside>
        <aside class="idea-chat" id="idea-chat" style="display:none"></aside>
      </div>`
    rootNode.addEventListener('click', onClick, true)
    rootNode.addEventListener('input', onInput, true)
    rootNode.addEventListener('change', onChange, true)
    rootNode.addEventListener('keydown', onKeydown, true)
    resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => onResize()) : null
    const target = plot()
    if (target) {
      resizeObserver?.observe(target)
      target.addEventListener('contextmenu', onPlotContext)
      target.addEventListener('dblclick', onPlotDblClick, true)
    }
  }

  /* ------------------------------ 载入 ------------------------------ */
  async function ensure(): Promise<void> {
    build()
    try {
      const saved = window.localStorage.getItem('dsh-workbench.idea.direction')
      if (saved === 'right' || saved === 'side' || saved === 'down' || saved === 'left') direction = saved
    } catch { /* localStorage 不可用就用默认 */ }
    if (loading || booted) return
    loading = true
    try {
      if (projects.length === 0) await loadProjects()
      const synced = await syncPortalProjects(true)
      if (synced > 0) await loadProjects()
      await loadIdeas()
      if (selectedId === '' && ideas.length > 0) await selectIdea(ideas[0].id)
      else if (selectedId !== '') await reloadDetail()
    } finally {
      loading = false
      booted = true
      renderAll()
    }
  }

  async function loadProjects(): Promise<void> {
    const res = await api('/ideas/projects')
    if (res.ok && Array.isArray(res.body?.projects)) projects = res.body.projects
  }

  /**
   * 把门户里的项目同步成灵感项目（按工作区路径去重）。
   * 门户项目来自产品 / Bug 项目 / 测试项目 / 任务的工作区路径，灵感项目需要自己的行来挂截图与产物。
   */
  async function syncPortalProjects(silent: boolean): Promise<number> {
    const candidates = deps.portalProjects?.() ?? []
    if (candidates.length === 0) return 0
    const byPath = new Map<string, { name: string; workspacePath: string }>()
    for (const item of candidates) {
      const path = String(item.workspacePath ?? '').trim()
      if (path === '' || path === 'all' || path === 'none') continue
      if (!byPath.has(path)) byPath.set(path, { name: item.name || path.split('/').filter(Boolean).pop() || path, workspacePath: path })
    }
    let added = 0
    for (const item of byPath.values()) {
      try {
        const res = await api('/ideas/projects', { method: 'POST', body: item })
        if (res.ok && res.body?.created === true) added += 1
      } catch { /* 单个失败不影响其它项目 */ }
    }
    if (!silent) deps.toast(added > 0 ? `已从门户同步 ${added} 个项目` : '门户项目已是最新')
    return added
  }

  async function loadIdeas(): Promise<void> {
    const params = new URLSearchParams()
    if (projectFilter !== '') params.set('projectId', projectFilter)
    if (query.trim() !== '') params.set('q', query.trim())
    const res = await api(`/ideas?${params.toString()}`)
    if (res.ok && Array.isArray(res.body?.ideas)) ideas = res.body.ideas
  }

  async function selectIdea(id: string): Promise<void> {
    if (id === selectedId && detail !== null) return
    stopPolling()
    stopChatPolling()
    chatSeq = 0
    closeChatTimer()
    dispatchId = ''
    dispatchSessionId = ''
    chat?.clear()
    const chatEl = q('idea-chat')
    if (chatEl !== null) chatEl.style.display = 'none'
    selectedId = id
    selectedNode = ''
    preview = null
    await reloadDetail()
    /* 刷新/切回该灵感时，若内存里没有派发但本地记着这个灵感的现场，就恢复抽屉与轮询。 */
    await restoreDispatchMemo()
  }

  async function reloadDetail(): Promise<void> {
    if (selectedId === '') { detail = null; return }
    const res = await api(`/ideas/${selectedId}`)
    if (!res.ok) { deps.toast(`读取灵感失败：${res.body?.message ?? res.status}`); return }
    detail = {
      idea: res.body.idea,
      inputs: res.body.inputs ?? [],
      versions: res.body.versions ?? [],
      run: res.body.run ?? null,
    }
    const graph = detail.idea?.graph as IdeaGraph | null
    if (graph && Array.isArray(graph.nodes) && graph.nodes.length > 0) {
      draft = { rev: Number(detail.idea.draftRev ?? 0), graph }
    } else {
      draft = { rev: Number(detail.idea?.draftRev ?? 0), graph: EMPTY_GRAPH }
    }
    run = detail.run
    if (run?.status === 'running') startPolling()
  }

  /* ------------------------------ 渲染 ------------------------------ */
  function renderAll(): void {
    renderProjectBox()
    renderList()
    renderBar()
    renderSub()
    renderDetail()
    renderPlot()
  }

  function statusDot(status: string): string {
    return status === 'ready' ? 'ready' : status === 'generating' ? 'generating' : status === 'failed' ? 'failed' : ''
  }

  function renderList(): void {
    const items = q('idea-items')
    const count = q('idea-count')
    const foot = q('idea-foot')
    const filterBox = q('idea-filter')
    if (items === null) return
    if (count) count.textContent = `${ideas.length} 个`
    if (foot) foot.textContent = projectFilter === '' ? `共 ${ideas.length} 个 · 按最近更新` : `项目内 ${ideas.length} 个`
    if (filterBox) {
      const counts = {
        all: ideas.length,
        ready: ideas.filter(i => i.status === 'ready').length,
        draft: ideas.filter(i => i.status === 'draft').length,
        generating: ideas.filter(i => i.status === 'generating').length,
      }
      filterBox.innerHTML = ([['all', '全部'], ['ready', '已出图'], ['draft', '草稿'], ['generating', '生成中']] as const)
        .map(([key, label]) => `<button class="${filter === key ? 'on' : ''}" data-idea-act="idea-filter" data-filter="${key}">${label} ${counts[key]}</button>`).join('')
    }
    const visible = filter === 'all' ? ideas : ideas.filter(i => i.status === filter)
    items.innerHTML = visible.length === 0
      ? `<div class="idea-empty"><b>还没有灵感</b>把一句想法、几张截图或一个链接丢进来，AI 会从 6 个方向炸开一张图。</div>`
      : visible.map(item => `<div class="idea-item${item.id === selectedId ? ' on' : ''}" data-idea-act="idea-pick" data-id="${item.id}">
          <div class="idea-item-t"><i class="${statusDot(item.status)}"></i><b>${deps.esc(item.title)}</b></div>
          <div class="idea-item-m"><span>${item.versionSeq > 0 ? `v${item.versionSeq}` : '草稿'}</span><span>${item.nodeCount} 节点</span><span>${shortTime(item.updatedAt)}</span></div>
        </div>`).join('')
  }

  function renderProjectBox(): void {
    const box = q('idea-project-box')
    if (box === null) return
    const current = projectFilter === '' ? '' : projectFilter
    box.innerHTML = `<select data-idea-input="project" title="按项目筛选（关联 DSH 工作区）">
        <option value=""${current === '' ? ' selected' : ''}>全部项目</option>
        ${projects.map(p => `<option value="${p.id}"${current === p.id ? ' selected' : ''}>${deps.esc(p.name)}</option>`).join('')}
      </select>
      <button class="icon-btn" data-idea-act="idea-project-manage" title="项目管理">⚙</button>
      <button class="icon-btn" data-idea-act="idea-project-new" title="新建项目">＋</button>`
  }

  function openProjectModal(): void {
    const rows = projects.map(p => `<div class="idea-url-row" style="gap:6px">
        <span title="${deps.esc(p.workspacePath || '未关联工作区')}">${deps.esc(p.name)}<small style="color:var(--text-3);margin-left:6px">${deps.esc(p.workspacePath || '未关联工作区')}</small></span>
        <button class="btn tiny" data-idea-act="idea-project-pick" data-id="${p.id}">使用</button>
        <button class="btn tiny" data-idea-act="idea-project-del" data-id="${p.id}">删除</button>
      </div>`).join('') || '<div style="font-size:11px;color:var(--text-3);margin-bottom:8px">还没有项目；创建后灵感产物会写到项目工作区。</div>'
    deps.openModal(`<div class="idea-modal"><h3>项目（关联工作区）</h3>
      <div class="idea-actions" style="margin:6px 0 10px">
        <button class="btn tiny" data-idea-act="idea-project-sync">⟳ 从门户同步项目</button>
        <span style="font-size:10.5px;color:var(--text-3);align-self:center">门户里的产品 / Bug / 测试项目会按工作区路径自动同步到灵感</span>
      </div>
      <div style="margin:0 0 12px">${rows}</div>
      <div class="m-field"><label>项目名称</label><input type="text" id="idea-project-name" maxlength="60" placeholder="例如：AI 面试陪练"></div>
      <div class="m-field"><label>工作区绝对路径 <span style="font-weight:400">可选</span></label><input type="text" id="idea-project-path" maxlength="500" placeholder="/Users/you/work/ai-coach"></div>
      <div class="idea-modal-foot"><span class="note">截图与导出默认写到 &lt;工作区&gt;/.dsh-workbench/ideas/</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">关闭</button>
        <button class="btn-primary" data-idea-act="idea-project-save">创建项目</button></div></div></div>`)
  }

  async function syncFromPortal(): Promise<void> {
    const added = await syncPortalProjects(false)
    if (added > 0) {
      await loadProjects()
      deps.closeModal()
      renderProjectBox()
      renderAll()
    }
  }

  async function saveProject(): Promise<void> {
    const name = q<HTMLInputElement>('idea-project-name')?.value.trim() ?? ''
    const workspacePath = q<HTMLInputElement>('idea-project-path')?.value.trim() ?? ''
    if (name === '') { deps.toast('先填项目名称'); return }
    const res = await api('/ideas/projects', { method: 'POST', body: { name, workspacePath } })
    if (!res.ok) { deps.toast(`创建项目失败：${res.body?.message ?? res.status}`); return }
    await loadProjects()
    projectFilter = res.body.project.id
    deps.closeModal()
    renderProjectBox()
    await loadIdeas()
    renderAll()
    deps.toast(`已创建项目「${name}」`)
  }

  async function deleteProject(id: string): Promise<void> {
    const project = projects.find(p => p.id === id)
    if (project === undefined) return
    if (!deps.confirm(`删除项目「${project.name}」及其下所有灵感？`)) return
    const res = await api(`/ideas/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) { deps.toast('删除失败'); return }
    if (projectFilter === id) projectFilter = ''
    deps.closeModal()
    await loadProjects()
    await loadIdeas()
    if (selectedId !== '' && !ideas.some(i => i.id === selectedId)) {
      selectedId = ''
      detail = null
      if (ideas.length > 0) await selectIdea(ideas[0].id)
    }
    renderAll()
    deps.toast('项目已删除')
  }

  function shortTime(value: string): string {
    if (!value) return ''
    const date = new Date(value.replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return value.slice(0, 10)
    const diff = Date.now() - date.getTime()
    if (diff < 60_000) return '刚刚'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
    return value.slice(5, 16)
  }

  function renderBar(): void {
    const bar = q('idea-bar')
    if (bar === null) return
    const hasIdea = detail !== null
    const stats = graphStats(draft.graph)
    bar.innerHTML = `
      <span class="idea-seg">
        <button class="${view === 'tree' ? 'on' : ''}" data-idea-act="idea-view" data-view="tree">思维导图</button>
        <button class="${view === 'force' ? 'on' : ''}" data-idea-act="idea-view" data-view="force">力导图</button>
      </span>
      ${view === 'tree' ? `<span class="idea-seg">
        <button class="${direction === 'right' ? 'on' : ''}" data-idea-act="idea-direction" data-dir="right">右向</button>
        <button class="${direction === 'side' ? 'on' : ''}" data-idea-act="idea-direction" data-dir="side">双翼</button>
        <button class="${direction === 'down' ? 'on' : ''}" data-idea-act="idea-direction" data-dir="down">纵向</button>
        <button class="${direction === 'left' ? 'on' : ''}" data-idea-act="idea-direction" data-dir="left">左向</button>
      </span>` : ''}
      <span class="grow"></span>
      <button class="btn tiny" data-idea-act="idea-zoom" data-dir="in" ${hasIdea ? '' : 'disabled'}>＋</button>
      <button class="btn tiny" data-idea-act="idea-zoom" data-dir="out" ${hasIdea ? '' : 'disabled'}>－</button>
      <button class="btn tiny" data-idea-act="idea-zoom" data-dir="fit" ${hasIdea ? '' : 'disabled'}>适应</button>
      <button class="btn tiny" data-idea-act="idea-chat-toggle" ${dispatchId === '' ? 'disabled' : ''}>会话</button>
      <button class="btn tiny" data-idea-act="idea-export" ${hasIdea ? '' : 'disabled'}>导出 ▾</button>
      <button class="btn tiny" data-idea-act="idea-node-add" ${hasIdea ? '' : 'disabled'}>＋ 节点</button>
      <button class="btn tiny" data-idea-act="idea-archive" ${hasIdea ? '' : 'disabled'}>存档版本</button>
      <button class="btn-primary" style="height:26px;font-size:11.5px" data-idea-act="idea-generate" ${hasIdea && run?.status !== 'running' ? '' : 'disabled'} ${hasIdea && stats.nodes > 1 ? 'title="重新发散会新建版本"' : ''}>${run?.status === 'running' ? '生成中…' : '✦ 生成'}</button>`
  }

  function renderSub(): void {
    const sub = q('idea-sub')
    const progress = q('idea-progress')
    if (sub === null) return
    if (detail === null) {
      sub.innerHTML = '<span>选择或新建一个灵感</span>'
      if (progress) progress.style.display = 'none'
      return
    }
    const stats = graphStats(draft.graph)
    const versionText = detail.versions[0] ? `v${detail.versions[0].seq}` : '草稿'
    const project = projects.find(p => p.id === detail?.idea?.projectId)
    sub.innerHTML = `<span>${deps.esc(detail.idea.title)}</span><span>·</span><span><b>${stats.directions}</b> 方向</span><span>·</span><span><b>${stats.nodes}</b> 节点</span>${stats.relate > 0 ? `<span>·</span><span><b>${stats.relate}</b> 跨支关联</span>` : ''}
      <span class="right">${project ? deps.esc(project.name) : '未归属项目'} · ${versionText}${preview ? ` · 只读预览 v${preview.version.seq} <button class="btn tiny" data-idea-act="idea-version-rollback">回滚到此版本</button><button class="btn tiny" data-idea-act="idea-version-delete">删除此版本</button><button class="btn tiny" data-idea-act="idea-version-back">退出预览</button>` : ''}</span>`
    if (progress) {
      if (run !== null && (run.status === 'running' || run.status === 'failed')) {
        progress.style.display = ''
        const pct = run.total > 0 ? Math.min(100, Math.round((run.step / run.total) * 100)) : 8
        progress.innerHTML = `<span style="color:var(--accent);font-weight:700">✦ ${run.status === 'failed' ? '生成失败' : 'AI 发散中'}</span>
          <span class="chip">${run.step}/${run.total}</span><div class="bar"><i style="width:${run.status === 'failed' ? 100 : pct}%"></i></div>
          <span>${deps.esc(run.status === 'failed' ? (run.error || '生成失败') : run.message)}</span>
          ${run.status === 'running' ? '<button class="btn tiny" data-idea-act="idea-stop" style="margin-left:auto">停止</button>' : `<button class="btn tiny" data-idea-act="idea-generate" style="margin-left:auto">重试</button>`}`
      } else {
        progress.style.display = 'none'
      }
    }
  }

  function renderDetail(): void {
    const box = q('idea-detail')
    if (box === null) return
    if (detail === null) {
      box.innerHTML = `<div class="idea-d-head"><div class="idea-eyebrow">Inspiration</div><div class="idea-d-title">还没有选中灵感</div>
        <div class="idea-d-sub">左侧列表选择，或点「新建」开始</div></div>`
      return
    }
    const node = selectedNode === '' ? undefined : nodeById(draft.graph, selectedNode)
    const inputs = detail.inputs
    const versions = detail.versions
    const head = node === undefined
      ? `<div class="idea-d-head"><div class="idea-eyebrow">Inspiration</div><div class="idea-d-title">${deps.esc(detail.idea.title)} <span class="idea-chip ${detail.idea.status === 'ready' ? 'ok' : detail.idea.status === 'generating' ? 'warn' : ''}">${statusLabel(detail.idea.status)}</span></div>
          <div class="idea-d-sub">${versions[0] ? `v${versions[0].seq} · ` : ''}${graphStats(draft.graph).nodes} 节点 · ${shortTime(detail.idea.updatedAt)}</div></div>`
      : `<div class="idea-d-head"><div style="display:flex;align-items:center;gap:8px"><button class="btn tiny" data-idea-act="idea-back-overview">← 灵感概览</button><div class="idea-eyebrow" style="margin:0">${node.type === 'direction' ? 'Direction' : node.type === 'seed' ? 'Seed' : 'Idea'}</div></div>
          <div class="idea-d-title">${deps.esc(node.label)}</div>
          <div class="idea-d-sub">深度 ${node.depth ?? 0} · ${node.angle ? angleLabel(node.angle) : '无角度'} · ${node.status === 'dropped' ? '已放弃' : node.status === 'pending' ? '待验证' : '已采纳'}</div></div>`
    const body: string[] = []
    if (node === undefined) {
      body.push(`<div class="idea-sec"><h4>输入</h4><div class="idea-quote">${deps.esc(detail.idea.brief || '（未填写正文）')}</div>
        <div class="idea-actions" style="margin-top:8px">
          <span class="idea-chip">🖼 截图 ${inputs.filter(i => i.kind === 'image').length}</span>
          <span class="idea-chip">🔗 链接 ${inputs.filter(i => i.kind === 'url').length}</span>
          <button class="btn tiny" data-idea-act="idea-edit">编辑输入</button>
        </div>
        <div class="idea-quick"><textarea id="idea-quick-text" rows="2" placeholder="补充一句想法（Ctrl/⌘+Enter 添加）"></textarea><button class="btn tiny" data-idea-act="idea-quick-text">＋ 添加文字</button></div>
        ${inputs.filter(i => i.kind === 'text').length > 0 ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">${inputs.filter(i => i.kind === 'text').slice(-3).map(i => `<span style="font-size:10.5px;color:var(--text-3)">· ${deps.esc(i.text)}</span>`).join('')}</div>` : ''}
      </div>`)
      body.push(`<div class="idea-sec"><h4>发散角度<span class="right">点选下次生效</span></h4><div class="idea-angles">
        ${IDEA_ANGLES.map(a => `<button class="${anglesOfCurrent().includes(a.id) ? 'on' : ''}" data-idea-act="idea-angle" data-id="${a.id}" title="${deps.esc(a.hint)}">${a.label}</button>`).join('')}
        <button class="${anglesOfCurrent().includes('cross') ? 'on' : ''}" data-idea-act="idea-angle" data-id="cross">跨界类比</button>
        ${customAngles().map(a => `<button class="${anglesOfCurrent().includes(a.id) ? 'on' : ''}" data-idea-act="idea-angle" data-id="${a.id}" title="自定义角度"><span style="color:${angleColorFor(a.id)}">◆</span> ${deps.esc(a.label)} <span data-idea-act="idea-angle-del" data-id="${a.id}" title="删除这个角度" style="opacity:.55;padding:0 2px">×</span></button>`).join('')}
        <button data-idea-act="idea-angle-add">＋ 自定义</button>
      </div></div>`)
      body.push(`<div class="idea-sec"><h4>操作</h4><div class="idea-actions">
        <button class="btn tiny" data-idea-act="idea-generate">✦ 重新发散</button>
        <button class="btn tiny" data-idea-act="idea-archive">存档版本</button>
        <button class="btn tiny" data-idea-act="idea-diff">版本对比</button>
        <button class="btn tiny" data-idea-act="idea-delete">删除灵感</button>
      </div></div>`)
      body.push(versionList(versions))
      if (run !== null && run.log.length > 0) {
        body.push(`<div class="idea-sec"><h4>进度日志</h4><div class="idea-run-log">${run.log.slice(-6).map(line => `<div><i>${line.at.slice(11, 16)}</i><span>${deps.esc(line.message)}</span></div>`).join('')}</div></div>`)
      }
    } else {
      body.push(`<div class="idea-sec"><h4>这个节点</h4>
        <dl class="idea-kv">
          <dt>类型</dt><dd>${node.type}</dd>
          <dt>角度</dt><dd>${node.angle ? angleLabel(node.angle) : '—'}</dd>
          <dt>状态</dt><dd>${node.status === 'dropped' ? '已放弃' : node.status === 'pending' ? '待验证' : '已采纳'}</dd>
        </dl>
        ${node.detail ? `<div class="idea-quote" style="margin-top:8px">${deps.esc(node.detail)}</div>` : ''}
        <div class="idea-actions" style="margin-top:8px">
          <button class="btn tiny" data-idea-act="idea-node-status" data-status="kept">采纳</button>
          <button class="btn tiny" data-idea-act="idea-node-status" data-status="dropped">放弃</button>
          <button class="btn tiny" data-idea-act="idea-node-edit">改文案</button>
          <button class="btn tiny" data-idea-act="idea-node-delete">删除节点</button>
        </div></div>`)
      body.push(`<div class="idea-sec"><h4>继续发散</h4>
        <div class="idea-actions"><button class="btn-primary" style="height:26px;font-size:11.5px" data-idea-act="idea-continue">✦ 沿这个方向再发散</button>
        <button class="btn tiny" data-idea-act="idea-node-add">＋ 手动加子节点</button></div>
        <div style="margin-top:8px;font-size:10.5px;color:var(--text-3)">默认 3 条；只长这一支，其他节点不动</div></div>`)
      body.push(versionList(versions))
    }
    box.innerHTML = `${head}<div class="idea-d-body">${body.join('')}</div>`
  }

  function statusLabel(status: string): string {
    return status === 'ready' ? '已出图' : status === 'generating' ? '生成中' : status === 'failed' ? '生成失败' : '草稿'
  }

  function versionList(versions: IdeaVersion[]): string {
    if (versions.length === 0) return `<div class="idea-sec"><h4>版本</h4><div style="font-size:11px;color:var(--text-3)">生成或存档后会在这里出现版本</div></div>`
    return `<div class="idea-sec"><h4>版本<span class="right">${versions.length} 个${versions.length >= 2 ? ' · <button class="btn tiny" data-idea-act="idea-diff">对比</button>' : ''}</span></h4><div class="idea-vers">
      ${versions.slice(0, 12).map(version => `<div class="idea-ver${preview?.version.id === version.id ? ' on' : ''}" data-idea-act="idea-version" data-id="${version.id}">
        <span class="tag ${version.source === 'ai' ? 'ai' : ''}">${version.source === 'ai' ? 'AI' : version.source === 'manual' ? '手动' : '恢复'}</span>
        <span class="t">${deps.esc(version.label || `v${version.seq}`)}</span>
        <span class="d">v${version.seq} · ${version.nodeCount}</span>
      </div>`).join('')}
    </div></div>`
  }

  /** 生成用的角度：表单里是临时选择，详情面板里是本地偏好。 */
  let anglePref: string[] = IDEA_ANGLES.map(a => a.id)

  function anglesOfCurrent(): string[] {
    return form?.angles ?? anglePref
  }

  function customAngles(): Array<{ id: string; label: string }> {
    return Array.isArray(detail?.idea?.customAngles) ? detail!.idea.customAngles : []
  }

  function angleLabel(id: string): string {
    return IDEA_ANGLES.find(a => a.id === id)?.label
      ?? (id === 'cross' ? '跨界类比' : customAngles().find(a => a.id === id)?.label ?? id)
  }

  function angleColorFor(id: string): string {
    const colors: Record<string, string> = { users: '#2563eb', pain: '#0f9f6e', form: '#c27c0e', tech: '#7c3aed', biz: '#db2777', risk: '#0891b2' }
    if (colors[id] !== undefined) return colors[id]
    if (id === 'cross' || id === '') return '#8b8b98'
    const palette = ['#2563eb', '#0f9f6e', '#c27c0e', '#7c3aed', '#db2777', '#0891b2']
    let hash = 0
    for (const ch of id) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0
    return palette[hash % palette.length]
  }

  /* ------------------------------ 画布 ------------------------------ */
  function renderPlot(): void {
    const target = plot()
    if (target === null) return
    if (preview !== null) {
      target.className = 'idea-plot readonly'
      target.innerHTML = graphToSVG(preview.graph, { dark: deps.isDark() })
      return
    }
    if (detail === null) {
      target.className = 'idea-plot'
      target.innerHTML = `<div class="idea-empty" style="padding:60px 20px;text-align:center"><b style="font-size:13px">还没有灵感</b>先写一句想法（也可以贴截图或链接），再让 AI 从 6 个方向发散。
        <div style="margin-top:12px"><button class="btn-primary" data-idea-act="idea-new">＋ 新建灵感</button></div></div>`
      return
    }
    target.className = 'idea-plot'
    if (view === 'tree') {
      if (mind === null) target.innerHTML = '<div class="idea-empty" style="padding:48px 20px;text-align:center">正在加载导图编辑器…</div>'
      void renderTree()
    } else {
      void renderForce()
    }
  }

  async function loadScript(src: string, id: string): Promise<void> {
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

  function mindDirection(cls: any): number {
    return direction === 'left' ? cls.LEFT : direction === 'side' ? cls.SIDE : direction === 'down' ? cls.DOWN : cls.RIGHT
  }

  function applyDirection(): void {
    if (mind === null || !mindCls) return
    try {
      if (direction === 'left') mind.initLeft()
      else if (direction === 'side') mind.initSide()
      else if (direction === 'down') mind.initDown()
      else mind.initRight()
      renderBar()
    } catch (cause) {
      console.warn('[dsh-workbench] 切换导图方向失败', cause)
    }
  }

  async function ensureMind(): Promise<any> {
    if (mind !== null) return mind
    const target = plot()
    if (target === null) return null
    if (mindLoading === null) {
      mindLoading = (async () => {
        await loadScript(`${deps.api}/assets/vendor/mind-elixir/MindElixir.iife.js`, 'dsh-wb-mind-elixir')
        const ns = (window as any).MindElixir
        mindCls = ns?.default ?? ns
        if (typeof mindCls !== 'function') throw new Error('mind-elixir 未就绪')
        if (rootNode.getElementById('dsh-wb-mind-css') === null) {
          const link = document.createElement('link')
          link.id = 'dsh-wb-mind-css'
          link.rel = 'stylesheet'
          link.href = `${deps.api}/assets/vendor/mind-elixir/MindElixir.css`
          rootNode.appendChild(link)
        }
      })()
    }
    try {
      await mindLoading
    } catch (cause) {
      console.warn('[dsh-workbench] 导图编辑器加载失败：', cause)
      return null
    }
    const container = document.createElement('div')
    container.className = 'idea-mind'
    container.style.cssText = 'width:100%;height:100%'
    target.innerHTML = ''
    target.appendChild(container)
    /* 首次进入灵感时容器可能还是 display:none / 尺寸为 0，mind-elixir 会按 0 宽度排版成乱图。
       等两帧拿到真实尺寸再 init。 */
    await waitForSize(target)
    mind = new mindCls({
      el: container,
      direction: mindDirection(mindCls),
      toolBar: false,
      keypress: true,
      contextMenu: false,
      overflowHidden: false,
      theme: deps.isDark() ? mindCls.DARK_THEME : mindCls.THEME,
    })
    mind.init(toMindElixir(draft.graph))
    try { mind.toCenter?.() } catch { /* 旧版本没有 toCenter */ }
    mind.bus.addListener('operation', () => scheduleMindSync())
    return mind
  }

  let mindSyncTimer = 0
  function scheduleMindSync(): void {
    if (mindSyncTimer !== 0) window.clearTimeout(mindSyncTimer)
    mindSyncTimer = window.setTimeout(() => {
      mindSyncTimer = 0
      if (mind === null) return
      try {
        const data = mind.getData()
        const next = fromMindElixir(data, draft.graph)
        draft.graph = next
        void persistGraph()
        renderDetail()
        renderSub()
      } catch (cause) {
        console.warn('[dsh-workbench] 导图同步失败', cause)
      }
    }, 450)
  }

  /** 等容器拿到真实尺寸（最多 10 帧 ≈160ms），避免 mind-elixir 按 0 宽初始化。 */
  function waitForSize(el: HTMLElement): Promise<void> {
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

  async function renderTree(): Promise<void> {
    const instance = await ensureMind()
    if (instance === null) {
      const target = plot()
      if (target) target.innerHTML = graphToSVG(draft.graph, { dark: deps.isDark() })
      return
    }
    try {
      /* refresh 会按当前 getBoundingClientRect 重新测量容器；面板由隐藏切到显示后用它重排。 */
      instance.refresh(toMindElixir(draft.graph))
    } catch (cause) {
      console.warn('[dsh-workbench] 导图刷新失败', cause)
    }
  }

  async function renderForce(): Promise<void> {
    const target = plot()
    if (target === null) return
    if (echartsLoading === null) {
      echartsLoading = loadScript(`${deps.api}/assets/vendor/echarts.min.js`, 'dsh-wb-echarts')
    }
    try { await echartsLoading } catch (cause) {
      console.warn('[dsh-workbench] 力导图加载失败：', cause)
      target.innerHTML = graphToSVG(draft.graph, { dark: deps.isDark() })
      return
    }
    const ns = (window as any).echarts
    if (typeof ns?.init !== 'function') { target.innerHTML = graphToSVG(draft.graph, { dark: deps.isDark() }); return }
    if (chart === null) {
      target.innerHTML = ''
      chart = ns.init(target, null, { renderer: 'canvas' })
      chart.on('click', (params: any) => {
        if (params?.dataType === 'node' && typeof params.data?.id === 'string') {
          selectedNode = params.data.id
          renderDetail()
        }
      })
    }
    chart.resize()
    chart.setOption(buildForceOption(draft.graph, { dark: deps.isDark() }), true)
    /* 只替换图例/提示，不碰 ECharts 自己的 canvas */
    Array.from(target.querySelectorAll('.idea-legend, .idea-hint')).forEach(node => node.remove())
    const legend = document.createElement('div')
    legend.className = 'idea-legend'
    legend.innerHTML = [...new Set(draft.graph.nodes.map(n => n.angle ?? ''))].map(angle => `<span><i style="background:${angleColorOf(angle)}"></i>${angle === '' ? '种子' : angleLabel(angle)}</span>`).join('')
    const hint = document.createElement('div')
    hint.className = 'idea-hint'
    hint.textContent = '悬停高亮相邻 · 拖动节点临时移动 · 滚轮缩放 · 虚线 = 跨支关联'
    target.appendChild(legend)
    target.appendChild(hint)
  }

  function angleColorOf(angle: string): string {
    const colors: Record<string, string> = { users: '#2563eb', pain: '#0f9f6e', form: '#c27c0e', tech: '#7c3aed', biz: '#db2777', risk: '#0891b2', cross: '#8b8b98' }
    return colors[angle] ?? '#5b5bd6'
  }

  function disposeEngines(): void {
    closeNodeMenu()
    if (mind !== null) { try { mind.destroy() } catch { /* ignore */ } mind = null }
    if (chart !== null) { try { chart.dispose() } catch { /* ignore */ } chart = null }
    const target = plot()
    if (target) target.innerHTML = ''
  }

  function onResize(): void {
    if (chart !== null) { try { chart.resize() } catch { /* ignore */ } }
    if (mind !== null) {
      try { const data = mind.getData(); mind.refresh(data) } catch { /* ignore */ }
    }
  }

  /* ------------------------------ 保存 ------------------------------ */
  async function persistGraph(): Promise<void> {
    if (selectedId === '' || preview !== null) return
    try {
      const res = await api(`/ideas/${selectedId}/draft`, { method: 'PUT', body: { graph: draft.graph, rev: draft.rev } })
      if (res.status === 409 && res.body?.current) {
        draft = { rev: Number(res.body.current.rev ?? 0), graph: res.body.current.graph }
        deps.toast('导图已在别处更新，已重新载入')
        renderPlot()
        return
      }
      if (!res.ok) throw new Error(res.body?.message ?? `HTTP ${res.status}`)
      draft.rev = Number(res.body.rev ?? draft.rev)
      if (Array.isArray(res.body.issues) && res.body.issues.length > 0) {
        // 结构修正不打扰用户，只在控制台留痕
        console.warn('[dsh-workbench] 导图已自动修正：', res.body.issues)
      }
    } catch (cause) {
      deps.toast(`保存失败：${String((cause as Error).message ?? cause)}`)
    }
  }

  /* ------------------------------ 生成 ------------------------------ */
  function startPolling(): void {
    if (polling !== 0) return
    if (run === null) return
    const runId = run.id
    polling = window.setInterval(() => { void poll(runId) }, 3000)
    void poll(runId)
  }

  function stopPolling(): void {
    if (polling !== 0) { window.clearInterval(polling); polling = 0 }
  }

  async function poll(runId: string): Promise<void> {
    if (selectedId === '') { stopPolling(); return }
    try {
      const res = await api(`/ideas/${selectedId}/runs/${runId}`)
      if (!res.ok) return
      run = res.body.run
      const next = res.body.draft
      if (next?.graph) {
        draft = { rev: Number(next.rev ?? draft.rev), graph: next.graph }
        if (view === 'tree' && mind !== null) {
          try { mind.refresh(toMindElixir(draft.graph)) } catch { /* ignore */ }
        } else if (view === 'force' && chart !== null) {
          chart.setOption(buildForceOption(draft.graph, { dark: deps.isDark() }), true)
        }
      }
      renderSub()
      renderDetail()
      renderList()
      if (run?.status === 'running') {
        /* 卡死判定改为「按进展」而不是「按总时长」：
           旧逻辑一律在 5 分钟砍掉，与抽屉那条 15 分钟派发预算直接冲突——团队常常 5 分钟后
           才刚进入成员执行阶段，会被误杀。现在只有「进展长时间不动」才算卡死。 */
        const idleLimit = 6 * 60 * 1000
        const progressKey = `${String(run.step ?? '')}/${String(run.total ?? '')}`
        if (progressKey !== lastRunProgressKey) {
          lastRunProgressKey = progressKey
          lastRunProgressAt = Date.now()
        }
        if (lastRunProgressAt !== 0 && Date.now() - lastRunProgressAt > idleLimit) {
          await api(`/ideas/${selectedId}/runs/${run.id}/cancel`, { method: 'POST' }).catch(() => null)
          stopPolling()
          deps.toast('生成已超过 6 分钟没有进展，已停止；已生成的节点保留为草稿')
          await reloadDetail()
          renderAll()
          return
        }
      } else {
        /* 非 running 时重置进展基线，下一次运行重新计时 */
        lastRunProgressKey = ''
        lastRunProgressAt = 0
      }
      if (run?.status === 'done') {
        stopPolling()
        closeChatTimer()
        clearDispatchMemo(selectedId)
        chat?.setStatus('done')
        busy = ''
        deps.toast('已生成，可在右侧版本里对比')
        await reloadDetail()
        renderAll()
      } else if (run?.status === 'failed') {
        stopPolling()
        closeChatTimer()
        clearDispatchMemo(selectedId)
        chat?.setStatus('failed', String(run.error || ''))
        busy = ''
        deps.toast(`生成失败：${run.error || '未知原因'}`)
        renderSub()
      }
    } catch { /* 网络抖动不终止轮询 */ }
  }

  async function generate(mode: 'diverge' | 'continue', targetNodeId = ''): Promise<void> {
    if (selectedId === '') { void openForm('create'); return }
    if (busy !== '') return
    if (run?.status === 'running') {
      /* run 可能只是没收到收尾信号（浏览器刷新/派发被顶掉）：先看派发是否还活着，死了就自动清掉再继续。 */
      const probe = await api(`/ideas/${selectedId}/runs/${run.id}`).catch(() => null)
      const dispatch = probe?.body?.dispatch
      const alive = dispatch !== undefined && dispatch !== null && ['dispatching', 'running'].includes(String(dispatch.status))
      if (alive) { deps.toast('这个灵感正在生成中，可先点「停止」再发起'); return }
      await api(`/ideas/${selectedId}/runs/${run.id}/cancel`, { method: 'POST' }).catch(() => null)
      stopPolling()
      await reloadDetail()
      renderAll()
    }
    busy = 'generate'
    try {
      /* 先确保草稿已落盘：服务端 /runs 按库里的 draft 校验 targetNodeId，
         刚手动新增的节点若还在防抖队列里，会误报「目标节点不存在」。 */
      await persistGraph()
      const angles = anglesOfCurrent()
      const res = await api(`/ideas/${selectedId}/runs`, { method: 'POST', body: { kind: mode, targetNodeId, angles } })
      if (!res.ok) { deps.toast(`创建生成任务失败：${res.body?.message ?? res.status}`); return }
      run = res.body.run
      renderSub()
      const project = projects.find(p => p.id === detail?.idea?.projectId)
      const path = String(res.body.workspacePath || project?.workspacePath || '')
      if (deps.agent !== undefined) {
        /* 先建好 chat 实例再派发：否则 kickoff 后立即到达的事件/历史会因 chat 还是 null 被丢掉。 */
        ensureChat()
        pendingChatEvents.length = 0
        const started = await deps.agent.dispatch(
          { ideaId: selectedId, runId: String(run?.id ?? ''), teamId: '', feature: mode === 'continue' ? 'idea.continue' : 'idea.diverge', goal: String(detail?.idea?.brief || detail?.idea?.title || ''), ideaTitle: String(detail?.idea?.title ?? ''), ideaBrief: String(detail?.idea?.brief ?? ''), workspacePath: path, timeoutMs: 15 * 60 * 1000 },
          {
            event: event => { if (chat === null) pendingChatEvents.push(event); else chat.ingest(event) },
            history: events => { if (chat === null) pendingChatEvents.push(...events); else chat.ingestMany(events) },
            status: (status, note) => chat?.setStatus(status, note),
            team: projection => chat?.setTeam(teamStateOf(projection)),
          },
        )
        if (started !== null) {
          dispatchId = started.dispatchId
          dispatchSessionId = started.sessionId
          writeDispatchMemo({ ideaId: selectedId, dispatchId, sessionId: dispatchSessionId, teamName: started.teamName })
          openChat(started.teamName, started.timeoutMs)
        }
      } else {
        try {
          await deps.dispatch(path, String(res.body.prompt ?? ''))
        } catch (cause) {
          deps.toast(`派发到会话失败：${String((cause as Error).message ?? cause)}`)
        }
      }
      startPolling()
    } finally {
      busy = ''
    }
  }

  function ensureChat(): ChatHandle | null {
    const el = q('idea-chat')
    if (el === null) return null
    if (chat === null) {
      chat = createAgentChat(el, {
        esc: deps.esc, ic: deps.ic,
        onSend: text => { if (dispatchSessionId !== '') void deps.agent?.prompt(dispatchSessionId, text) },
        onStop: () => void stopRun(),
        onRetry: () => void generate('diverge'),
        onOpenSession: () => { if (dispatchSessionId !== '') deps.agent?.openSession(dispatchSessionId) },
      })
      bindChatResizer(el)
    }
    return chat
  }

  function openChat(teamName: string, timeoutMs: number): void {
    const el = q('idea-chat')
    if (el === null) return
    if (ensureChat() === null) return
    el.style.display = ''
    /* 派发早期到达但还没渲染的事件，打开抽屉时补进来 */
    if (pendingChatEvents.length > 0) {
      chat?.ingestMany(pendingChatEvents.splice(0, pendingChatEvents.length))
    }
    chat?.open({ teamName: teamName === '' ? '智能体团队' : teamName, dispatchId, sessionId: dispatchSessionId, timeoutMs })
    chat?.setStatus('running')
    /* 补历史：重新打开抽屉、或事件订阅尚未生效时，也能看到已产生的消息（按 seq 去重） */
    if (dispatchSessionId !== '' && typeof deps.agent?.history === 'function') {
      void deps.agent.history(dispatchSessionId)
        .then(events => { if (events.length > 0) chat?.ingestMany(events) })
        .catch(() => undefined)
    }
    startChatPolling()
    if (dispatchTimer !== 0) window.clearTimeout(dispatchTimer)
    dispatchTimer = window.setTimeout(() => {
      chat?.setStatus('timeout', '超过派发预算')
      void stopRun()
    }, timeoutMs)
  }

  /**
   * 轮询宿主侧会话事件。客户端 session/event 订阅在许多宿主版本里收不到宿主会话事件，
   * 这是页内会话能稳定显示「命令 + 对话」的主通道。
   */
  function startChatPolling(): void {
    if (chatPolling !== 0) return
    if (dispatchSessionId === '') return
    chatPolling = window.setInterval(() => { void pollChatEvents() }, 1500)
    void pollChatEvents()
  }

  function stopChatPolling(): void {
    if (chatPolling !== 0) { window.clearInterval(chatPolling); chatPolling = 0 }
  }

  async function pollChatEvents(): Promise<void> {
    if (dispatchSessionId === '') { stopChatPolling(); return }
    try {
      /* chatSeq 现在是「已收到的最大 seq」（不是数组下标），与 host 的 since 语义一致。
         一次最多 400 条；有 next 就说明还没追平，立刻续拉，避免跳事件。 */
      for (let round = 0; round < 8; round += 1) {
        const res = await api(`/agents/sessions/${encodeURIComponent(dispatchSessionId)}/events?since=${chatSeq}`)
        if (!res.ok) return
        const events = Array.isArray(res.body?.events) ? res.body.events : []
        if (events.length > 0) chat?.ingestMany(events)
        if (Number(res.body?.available) === 0 || events.length === 0) break
        const next = Number(res.body?.next ?? 0)
        if (!Number.isFinite(next) || next <= chatSeq) break
        chatSeq = next
        if (events.length < 400) break
      }
    } catch { /* 网络抖动不终止轮询 */ }
  }

  function closeChatTimer(): void {
    if (dispatchTimer !== 0) { window.clearTimeout(dispatchTimer); dispatchTimer = 0 }
  }

  /**
   * 恢复上一次的派发现场（页面刷新、切走再切回、或重新打开这个灵感）。
   * 判定链：内存已有 → 什么都不做；本地记录属于当前灵感 → 问后端该 dispatch 是否还活着 →
   * 活着就恢复抽屉与轮询，已结束就只回放历史并标终态，然后清掉记录。
   */
  async function restoreDispatchMemo(): Promise<void> {
    if (dispatchId !== '' || dispatchSessionId !== '') return
    if (selectedId === '') return
    const memo = readDispatchMemo()
    if (memo === null || memo.ideaId !== selectedId) return
    /* 后端是权威：本地记录可能陈旧（团队早已跑完或被顶掉）。 */
    const res = await api(`/agents/dispatches/${encodeURIComponent(memo.dispatchId)}`).catch(() => null)
    if (res === null || !res.ok) { clearDispatchMemo(memo.ideaId); return }
    const status = String(res.body?.dispatch?.status ?? '')
    const alive = status === 'dispatching' || status === 'running'
    dispatchId = memo.dispatchId
    dispatchSessionId = memo.sessionId
    if (chat === null) ensureChat()
    /* 先把历史回放进抽屉；alive 再启动轮询与 15 分钟计时。 */
    const el = q('idea-chat')
    if (el !== null) el.style.display = ''
    chat?.open({ teamName: memo.teamName === '' ? '智能体团队' : memo.teamName, dispatchId, sessionId: dispatchSessionId, timeoutMs: 15 * 60 * 1000 })
    if (alive) {
      chat?.setStatus('running')
      startChatPolling()
      if (dispatchTimer !== 0) window.clearTimeout(dispatchTimer)
      dispatchTimer = window.setTimeout(() => {
        chat?.setStatus('timeout', '超过派发预算')
        void stopRun()
      }, 15 * 60 * 1000)
    } else {
      /* 已终结的派发：只回放历史并画终态，不启动轮询/计时，然后清记录。 */
      chat?.setStatus(status === 'done' ? 'done' : status === 'timeout' ? 'timeout' : status === 'failed' ? 'failed' : 'cancelled', String(res.body?.dispatch?.error ?? ''))
      clearDispatchMemo(memo.ideaId)
    }
    if (typeof deps.agent?.history === 'function') {
      void deps.agent.history(dispatchSessionId)
        .then(events => { if (events.length > 0) chat?.ingestMany(events) })
        .catch(() => undefined)
    }
  }

  /**
   * 会话抽屉左缘拖拽调宽：CSS resize 的手柄在右下角且被圆角/阴影盖住，
   * 实测拖不到，所以自己加一条可见的竖向手柄。
   */
  function bindChatResizer(el: HTMLElement): void {
    const KEY = 'dsh-workbench.idea.chatWidth'
    try {
      const saved = Number(window.localStorage.getItem(KEY))
      if (Number.isFinite(saved) && saved >= 300) el.style.width = `${Math.min(560, saved)}px`
    } catch { /* 忽略 */ }
    const handle = document.createElement('div')
    handle.className = 'idea-chat-resizer'
    handle.title = '拖动调整宽度'
    el.appendChild(handle)
    handle.addEventListener('pointerdown', (event: PointerEvent) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = el.getBoundingClientRect().width
      handle.setPointerCapture(event.pointerId)
      const move = (e: PointerEvent): void => {
        /* 手柄在左侧：往左拖变宽 */
        const next = Math.max(300, Math.min(560, startWidth + (startX - e.clientX)))
        el.style.width = `${Math.round(next)}px`
      }
      const up = (): void => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        handle.removeEventListener('pointercancel', up)
        try { window.localStorage.setItem(KEY, String(Math.round(el.getBoundingClientRect().width))) } catch { /* 忽略 */ }
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
      handle.addEventListener('pointercancel', up)
    })
  }

  async function stopRun(): Promise<void> {
    if (run === null || selectedId === '') return
    if (dispatchId !== '' && dispatchSessionId !== '') {
      closeChatTimer()
      clearDispatchMemo(selectedId)
      chat?.setStatus('cancelled')
      await deps.agent?.stop(dispatchId, dispatchSessionId).catch(() => undefined)
    }
    await api(`/ideas/${selectedId}/runs/${run.id}/cancel`, { method: 'POST' })
    stopPolling()
    stopChatPolling()
    await reloadDetail()
    renderAll()
  }

  /* ------------------------------ 版本 ------------------------------ */
  async function previewVersion(versionId: string): Promise<void> {
    if (selectedId === '') return
    const res = await api(`/ideas/${selectedId}/versions/${versionId}`)
    if (!res.ok) { deps.toast('版本读取失败'); return }
    preview = { version: res.body.version, graph: res.body.version.graph }
    renderBar(); renderSub(); renderDetail(); renderPlot()
    deps.toast(`只读预览 v${preview.version.seq} · 点节点详情里的「回到最新」退出`)
  }

  async function archive(): Promise<void> {
    if (selectedId === '') return
    const res = await api(`/ideas/${selectedId}/versions`, { method: 'POST', body: { label: `手动存档 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` } })
    if (!res.ok) { deps.toast(`存档失败：${res.body?.message ?? res.status}`); return }
    deps.toast(`已存档 v${res.body.version.seq}`)
    await reloadDetail()
    renderAll()
  }

  async function rollback(versionId: string): Promise<void> {
    if (selectedId === '' || !deps.confirm('回滚会用该版本覆盖当前草稿（历史仍保留），继续？')) return
    const res = await api(`/ideas/${selectedId}/versions/${versionId}/rollback`, { method: 'POST' })
    if (!res.ok) { deps.toast(`回滚失败：${res.body?.message ?? res.status}`); return }
    preview = null
    deps.toast(`已回滚，产生 v${res.body.version.seq}`)
    await reloadDetail()
    renderAll()
  }

  async function removeVersion(versionId: string): Promise<void> {
    const version = preview?.version
    if (!deps.confirm(`删除版本 v${version?.seq ?? ''}？该版本图不可恢复（草稿不受影响）。`)) return
    const res = await api(`/ideas/${selectedId}/versions/${versionId}`, { method: 'DELETE' })
    if (!res.ok) { deps.toast(`删除失败：${res.body?.message ?? res.status}`); return }
    preview = null
    await reloadDetail()
    renderAll()
    deps.toast('版本已删除')
  }

  async function showDiff(): Promise<void> {
    if (detail === null || detail.versions.length < 2) { deps.toast('至少需要两个版本才能对比'); return }
    diffState = { a: detail.versions[1].id, b: detail.versions[0].id }
    const options = (selected: string): string => detail!.versions.slice(0, 20)
      .map(v => `<option value="${v.id}"${v.id === selected ? ' selected' : ''}>v${v.seq} · ${deps.esc(v.label || '未命名')}${v.source === 'ai' ? '（AI）' : ''}</option>`).join('')
    deps.openModal(`<div class="idea-modal" style="width:620px"><h3>版本对比</h3>
      <div class="idea-diff-pick">
        <label>A（基准）<select id="idea-diff-a" data-idea-input="diff-a">${options(diffState.a)}</select></label>
        <button class="btn tiny" data-idea-act="idea-diff-swap" title="交换">⇄</button>
        <label>B（对比）<select id="idea-diff-b" data-idea-input="diff-b">${options(diffState.b)}</select></label>
      </div>
      <div id="idea-diff-body" class="idea-diff"><div style="color:var(--text-3);font-size:11px">对比中…</div></div>
      <div class="idea-modal-foot"><span class="note">对比基于不可变版本，不包含当前草稿</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">关闭</button>
        <button class="btn" data-idea-act="idea-diff-rollback">回滚到 A</button>
      </div></div></div>`)
    await renderDiffBody()
  }

  function diffList(title: string, cls: string, items: Array<{ label: string }>, render?: (item: any) => string): string {
    if (items.length === 0) return `<div class="idea-diff-sec"><h5>${title}</h5><div class="empty">无</div></div>`
    return `<div class="idea-diff-sec"><h5 class="${cls}">${title}（${items.length}）</h5><ul>${items.map(item => `<li>${render ? render(item) : deps.esc(item.label)}</li>`).join('')}</ul></div>`
  }

  async function renderDiffBody(): Promise<void> {
    const body = q('idea-diff-body')
    if (body === null || diffState === null || detail === null) return
    const versionOf = (id: string): IdeaVersion | undefined => detail!.versions.find(v => v.id === id)
    const a = versionOf(diffState.a)
    const b = versionOf(diffState.b)
    if (a === undefined || b === undefined) { body.innerHTML = '<div class="empty">版本不存在</div>'; return }
    if (a.id === b.id) { body.innerHTML = '<div class="empty">A 与 B 是同一个版本</div>'; return }
    body.innerHTML = '<div style="color:var(--text-3);font-size:11px">对比中…</div>'
    const res = await api(`/ideas/${selectedId}/versions/${a.id}/diff/${b.id}`)
    if (!res.ok) { body.innerHTML = `<div class="empty">对比失败：${deps.esc(res.body?.message ?? res.status)}</div>`; return }
    const diff = res.body.diff
    body.innerHTML = `
      <div class="idea-diff-sum">
        <span>v${a.seq} → v${b.seq}</span>
        <span class="add">+${diff.added.length}</span>
        <span class="del">-${diff.removed.length}</span>
        <span>改 ${diff.changed.length}</span>
        <span>边 +${diff.addedEdges} / -${diff.removedEdges}</span>
        <span style="margin-left:auto;color:var(--text-3)">节点 ${a.nodeCount} → ${b.nodeCount}</span>
      </div>
      ${diffList('新增节点', 'add', diff.added)}
      ${diffList('删除节点', 'del', diff.removed)}
      ${diffList('文案修改', '', diff.changed, (item: any) => `${deps.esc(item.before)} <span style="color:var(--text-3)">→</span> ${deps.esc(item.after)}`)}
      ${diff.added.length + diff.removed.length + diff.changed.length + diff.addedEdges + diff.removedEdges === 0 ? '<div class="empty">两个版本没有差异</div>' : ''}`
  }

  /* ------------------------------ 导出 ------------------------------ */
  function download(name: string, content: string | Blob, mime: string): void {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  async function exportAs(format: 'json' | 'markdown' | 'svg' | 'png', toWorkspace = false): Promise<void> {
    if (detail === null) return
    const graph = preview?.graph ?? draft.graph
    const base = safeName(preview ? `${detail.idea.title}-v${preview.version.seq}` : detail.idea.title)
    if (format === 'png') {
      const svg = graphToSVG(graph, { dark: false })
      try {
        const blob = await svgToPngBlob(svg, 2)
        download(`${base}.png`, blob, 'image/png')
        deps.toast('已导出 PNG')
      } catch (cause) {
        deps.toast(`PNG 导出失败：${String((cause as Error).message ?? cause)}`)
      }
      return
    }
    const content = format === 'json'
      ? JSON.stringify({ title: detail.idea.title, graph }, null, 2)
      : format === 'markdown' ? graphToMarkdown(graph) : graphToSVG(graph, { dark: false })
    if (toWorkspace) {
      const res = await api(`/ideas/${selectedId}/export`, { method: 'POST', body: { format, content, toWorkspace: true, versionSeq: preview?.version.seq ?? 'draft' } })
      if (!res.ok) { deps.toast(`保存失败：${res.body?.message ?? res.status}`); return }
      deps.toast(`已保存到工作区：${res.body.filePath}`)
      return
    }
    const ext = format === 'markdown' ? 'md' : format
    download(`${base}.${ext}`, content, format === 'json' ? 'application/json' : format === 'markdown' ? 'text/markdown' : 'image/svg+xml')
    deps.toast(`已导出 ${ext.toUpperCase()}`)
  }

  function svgToPngBlob(svg: string, scale: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(img.width * scale))
          canvas.height = Math.max(1, Math.round(img.height * scale))
          const ctx = canvas.getContext('2d')
          if (ctx === null) throw new Error('没有 canvas 上下文')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.setTransform(scale, 0, 0, scale, 0, 0)
          ctx.drawImage(img, 0, 0)
          canvas.toBlob(blob => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('toBlob 失败')) }, 'image/png')
        } catch (cause) { URL.revokeObjectURL(url); reject(cause) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 渲染失败')) }
      img.src = url
    })
  }

  function openExportMenu(): void {
    if (detail === null) return
    deps.openModal(`<div class="idea-modal"><h3>导出</h3>
      <div class="idea-actions" style="gap:8px;margin:10px 0">
        <button class="btn" data-idea-act="idea-export-go" data-fmt="png">PNG</button>
        <button class="btn" data-idea-act="idea-export-go" data-fmt="svg">SVG</button>
        <button class="btn" data-idea-act="idea-export-go" data-fmt="json">JSON</button>
        <button class="btn" data-idea-act="idea-export-go" data-fmt="markdown">Markdown</button>
      </div>
      <div style="font-size:11px;color:var(--text-3);line-height:1.6">也可以直接存到项目工作区（<code>.dsh-workbench/ideas/…/exports</code>），随项目备份。</div>
      <div class="idea-modal-foot"><span class="note">${preview ? `当前导出的是只读预览 v${preview.version.seq}` : '导出当前草稿'}</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">关闭</button>
        <button class="btn-primary" data-idea-act="idea-export-workspace">存到工作区</button></div></div></div>`)
  }

  /* ------------------------------ 表单（新建 / 编辑） ------------------------------ */
  async function openForm(mode: 'create' | 'edit'): Promise<void> {
    if (mode === 'edit' && detail === null) return
    const idea = mode === 'edit' ? detail!.idea : null
    const existing = mode === 'edit' ? detail!.inputs : []
    form = {
      id: idea?.id ?? '',
      title: idea?.title ?? '',
      brief: idea?.brief ?? '',
      text: existing.filter(i => i.kind === 'text').map(i => i.text).join('\n'),
      urls: existing.filter(i => i.kind === 'url').map(i => i.url),
      images: existing.filter(i => i.kind === 'image').map(i => ({ id: i.id, name: i.filePath.split('/').pop() ?? '截图' })),
      angles: IDEA_ANGLES.map(a => a.id),
      customAngles: mode === 'edit' ? customAngles().map(a => ({ id: a.id, label: a.label })) : [],
      mode,
    }
    renderForm()
  }

  function renderForm(): void {
    if (form === null) return
    const f = form
    const customList = f.customAngles ?? []
    const openPreset = f.preset ?? ''
    const presetBar = IDEA_ANGLE_PRESETS.map(p => `<button type="button" class="angle-preset${openPreset === p.id ? ' on' : ''}" data-idea-act="idea-preset-toggle" data-id="${p.id}" title="${deps.esc(p.hint)}">${deps.esc(p.label)}</button>`).join('')
    const presetBody = openPreset === ''
      ? ''
      : (() => {
        const preset = IDEA_ANGLE_PRESETS.find(p => p.id === openPreset)
        if (preset === undefined) return ''
        const chips = preset.angles.map(a => {
          const existing = customList.find(c => c.label === a.label)
          const on = existing !== undefined && f.angles.includes(existing.id)
          return `<button type="button" class="${on ? 'on' : ''}" data-idea-act="idea-preset-angle" data-label="${deps.esc(a.label)}" title="${deps.esc(a.hint)}">${deps.esc(a.label)}</button>`
        }).join('')
        return `<div class="angle-preset-body"><div class="angle-preset-hint">${deps.esc(preset.hint)} · 点选加入（自定义维度上限 6 个）</div><div class="idea-angles">${chips}</div></div>`
      })()
    const angleButtons = IDEA_ANGLES.map(a => `<button type="button" class="${f.angles.includes(a.id) ? 'on' : ''}" data-idea-act="idea-modal-angle" data-id="${a.id}" title="${deps.esc(a.hint)}">${a.label}</button>`).join('')
      + `<button type="button" class="${f.angles.includes('cross') ? 'on' : ''}" data-idea-act="idea-modal-angle" data-id="cross">跨界类比</button>`
      + customList.map(a => `<button type="button" class="${f.angles.includes(a.id) ? 'on' : ''}" data-idea-act="idea-modal-angle" data-id="${deps.esc(a.id)}" title="自定义角度"><span style="color:${angleColorFor(a.id)}">◆</span> ${deps.esc(a.label)} <span data-idea-act="idea-modal-angle-del" data-id="${deps.esc(a.id)}" title="移除此角度" style="opacity:.55;padding:0 2px">×</span></button>`).join('')
      + `<button type="button" class="btn tiny" data-idea-act="idea-modal-angle-add" title="添加自定义发散维度">＋ 自定义</button>`
    const thumbs = f.images.map((img, index) => `<div class="idea-thumb" title="${deps.esc(img.name ?? '截图')}">${img.dataUrl ? `<img src="${img.dataUrl}" alt="">` : `<span>${deps.esc(img.name ?? '截图')}</span>`}<span class="x" data-idea-act="idea-modal-image-del" data-index="${index}">×</span></div>`).join('')
    const urls = f.urls.map((url, index) => `<div class="idea-url-row"><span>🔗 ${deps.esc(url)}</span><span class="x" data-idea-act="idea-modal-url-del" data-index="${index}">×</span></div>`).join('')
    deps.openModal(`<div class="idea-modal">
      <h3>${f.mode === 'create' ? '新建灵感' : '编辑输入'}</h3>
      <div class="m-field"><label>标题</label><input type="text" id="idea-form-title" data-idea-input="form-title" maxlength="60" value="${deps.esc(f.title)}" placeholder="一句话说出这件事"></div>
      <div class="m-field"><label>想法正文</label><textarea id="idea-form-brief" data-idea-input="form-brief" maxlength="5000" placeholder="背景、想解决什么、为什么现在做…">${deps.esc(f.brief)}</textarea></div>
      <div class="m-field"><label>补充文字</label><input type="text" id="idea-form-text" data-idea-input="form-text" maxlength="600" value="${deps.esc(f.text)}" placeholder="可粘贴一句关键描述（可选）"></div>
      <div class="m-field"><label>截图 <span style="font-weight:400">粘贴 / 选择，最多 9 张</span></label>
        <div class="idea-thumbs">${thumbs}<div class="idea-thumb add" data-idea-act="idea-modal-pick">＋ 添加</div></div>
        <input type="file" id="idea-form-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple style="display:none">
        <div class="m-hint">图片只存本地工作区；生成时由 Agent 读取内容。</div></div>
      <div class="m-field"><label>参考链接</label><div id="idea-form-urls">${urls}</div>
        <div class="m-row"><div class="m-col"><input type="url" id="idea-form-url" data-idea-input="form-url" value="${deps.esc(f.urlDraft ?? '')}" placeholder="https://…"></div>
        <button type="button" class="btn" data-idea-act="idea-modal-url-add">添加</button></div>
        <div class="m-hint">生成时由 Agent 抓摘要；失败不影响生成。</div></div>
      <div class="m-field"><label>发散角度 <span style="font-weight:400">默认全选 · 至少 3 个</span></label>
        <div class="angle-presets"><span class="angle-presets-label">预设维度组</span>${presetBar}</div>
        ${presetBody}
        <div class="idea-angles">${angleButtons}</div></div>
      <div class="idea-modal-foot"><span class="note">生成会新建一个版本，旧版本保留可对比</span><div class="right">
        <button class="btn" data-idea-act="idea-close-modal">取消</button>
        ${f.mode === 'create' ? '<button class="btn" data-idea-act="idea-modal-create">仅保存</button><button class="btn-primary" data-idea-act="idea-modal-create-generate">保存并生成</button>' : '<button class="btn-primary" data-idea-act="idea-modal-save">保存</button>'}
      </div></div></div>`)
    const fileInput = q<HTMLInputElement>('idea-form-file')
    if (fileInput !== null) fileInput.onchange = () => { void addFiles(fileInput.files); fileInput.value = '' }
    const brief = q<HTMLTextAreaElement>('idea-form-brief')
    if (brief !== null) {
      brief.addEventListener('paste', (event) => {
        const items = Array.from((event.clipboardData?.items ?? []) as DataTransferItemList)
        const files = items.filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((f): f is File => f !== null)
        if (files.length > 0) { event.preventDefault(); void addFiles(files) }
      })
    }
  }

  async function addFiles(files: FileList | File[] | null): Promise<void> {
    if (form === null || files === null) return
    const list = Array.from(files).slice(0, 9 - form.images.length)
    for (const file of list) {
      if (!file.type.startsWith('image/')) continue
      try {
        const compressed = await compressImage(file)
        form.images.push(compressed)
      } catch (cause) {
        deps.toast(`图片处理失败：${String((cause as Error).message ?? cause)}`)
      }
    }
    renderForm()
  }

  function compressImage(file: File): Promise<{ dataUrl: string; name: string; width: number; height: number }> {
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

  async function submitForm(create: boolean, thenGenerate = false): Promise<void> {
    if (form === null) return
    const f = form
    if (f.title.trim() === '') { deps.toast('先给灵感起个标题'); return }
    if (f.angles.length < 3) { deps.toast('至少选 3 个发散角度'); return }
    busy = 'form'
    try {
      let ideaId = f.id
      if (create) {
        const res = await api('/ideas', { method: 'POST', body: { title: f.title.trim(), brief: f.brief, projectId: projectFilter } })
        if (!res.ok) { deps.toast(`创建失败：${res.body?.message ?? res.status}`); return }
        ideaId = res.body.idea.id
      } else {
        const res = await api(`/ideas/${ideaId}`, { method: 'PATCH', body: { title: f.title.trim(), brief: f.brief } })
        if (!res.ok) { deps.toast(`保存失败：${res.body?.message ?? res.status}`); return }
      }
      // 本次弹窗里新增的自定义维度：并入灵感的 customAngles（同名去重），再开始生成
      const addedAngles = f.customAngles ?? []
      if (addedAngles.length > 0) {
        const merged = customAngles()
        for (const angle of addedAngles) {
          if (!merged.some(a => a.id === angle.id || a.label === angle.label)) merged.push({ id: angle.id, label: angle.label })
        }
        const angleRes = await api(`/ideas/${ideaId}`, { method: 'PATCH', body: { customAngles: merged.slice(0, 6).map(a => ({ id: a.id, label: a.label })) } })
        if (!angleRes.ok) deps.toast(`自定义角度保存失败：${angleRes.body?.message ?? angleRes.status}`)
        anglePref = f.angles.slice()
      }
      // 追加本次新增的输入（已存在的只在编辑模式里保留）
      for (const url of f.urls) {
        if (f.mode === 'edit' && (detail?.inputs ?? []).some(i => i.kind === 'url' && i.url === url)) continue
        await api(`/ideas/${ideaId}/inputs`, { method: 'POST', body: { kind: 'url', url } })
      }
      if (f.text.trim() !== '' && !(detail?.inputs ?? []).some(i => i.kind === 'text' && i.text === f.text.trim())) {
        await api(`/ideas/${ideaId}/inputs`, { method: 'POST', body: { kind: 'text', text: f.text.trim() } })
      }
      for (const image of f.images) {
        if (image.id !== undefined || image.dataUrl === undefined) continue
        await api(`/ideas/${ideaId}/inputs`, { method: 'POST', body: { kind: 'image', dataUrl: image.dataUrl, name: image.name } })
      }
      deps.closeModal()
      const shouldGenerate = create && thenGenerate
      form = null
      await loadIdeas()
      await selectIdea(ideaId)
      /* selectIdea 对「已选中的同一条灵感」会早退，编辑模式下不会重新拉库；
         这里强制重载，保证弹窗里新增的自定义维度立刻出现在右侧详情面板。 */
      await reloadDetail()
      renderAll()
      if (shouldGenerate) await generate('diverge')
      else deps.toast('已保存；点右上「✦ 生成」开始发散')
    } finally {
      busy = ''
    }
  }

  /* ------------------------------ 节点操作 ------------------------------ */
  /**
   * 应用内输入弹窗：Electron 不支持 window.prompt，所有文案输入都走这里。
   * 注意 #wb-modal 是 #wb-idea-root 的兄弟节点，本视图的 onClick/onInput 收不到弹窗内事件，
   * 所以这里在 shadow root 上临时挂捕获监听，结束后在 finishAsk 里统一移除。
   */
  function askText(title: string, initial = '', placeholder = ''): Promise<string | null> {
    askResolve?.(null)
    askDispose?.()
    askValue = initial
    return new Promise(resolve => {
      askResolve = resolve
      deps.openModal(`<div class="idea-modal"><h3>${deps.esc(title)}</h3>
        <div class="m-field"><input type="text" id="idea-ask-input" data-idea-input="ask" maxlength="120" value="${deps.esc(initial)}" placeholder="${deps.esc(placeholder)}"></div>
        <div class="idea-modal-foot"><span class="note">Enter 确定 · Esc 取消</span><div class="right">
          <button class="btn" data-idea-act="idea-ask-cancel">取消</button>
          <button class="btn-primary" data-idea-act="idea-ask-ok">确定</button>
        </div></div></div>`)
      const scope = rootNode.getRootNode() as Document | ShadowRoot
      const onModalClick = (event: Event): void => {
        const target = event.target as HTMLElement | null
        const btn = target?.closest('[data-idea-act]') as HTMLElement | null
        if (btn !== null) {
          const act = btn.getAttribute('data-idea-act') ?? ''
          if (act === 'idea-ask-ok' || act === 'idea-ask-cancel') {
            event.preventDefault()
            event.stopPropagation()
            finishAsk(act === 'idea-ask-ok' ? askValue.trim() : null)
          }
          return
        }
        /* 点遮罩（overlay 自身）等同取消 */
        const overlay = target?.closest('[data-act="overlay"]')
        if (overlay !== null && overlay === target) {
          event.preventDefault()
          event.stopPropagation()
          finishAsk(null)
        }
      }
      const onModalInput = (event: Event): void => {
        const el = event.target as HTMLInputElement | null
        if (el?.id === 'idea-ask-input') askValue = el.value
      }
      const onModalKey = (event: Event): void => {
        const key = (event as KeyboardEvent).key
        if (key === 'Enter' && (event.target as HTMLElement | null)?.id === 'idea-ask-input') {
          event.preventDefault()
          event.stopPropagation()
          finishAsk(askValue.trim())
        } else if (key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          finishAsk(null)
        }
      }
      scope.addEventListener('click', onModalClick, true)
      scope.addEventListener('input', onModalInput, true)
      scope.addEventListener('keydown', onModalKey, true)
      askDispose = () => {
        scope.removeEventListener('click', onModalClick, true)
        scope.removeEventListener('input', onModalInput, true)
        scope.removeEventListener('keydown', onModalKey, true)
        askDispose = null
      }
      window.setTimeout(() => {
        const input = (scope as Document | ShadowRoot).querySelector<HTMLInputElement>('#idea-ask-input')
        input?.focus()
        input?.select()
      }, 0)
    })
  }

  function finishAsk(value: string | null): void {
    const resolve = askResolve
    askResolve = null
    askDispose?.()
    deps.closeModal()
    resolve?.(value)
  }

  function slugifyAngle(label: string): string {
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    if (base !== '' && /^[a-z]/.test(base)) return base.slice(0, 20)
    /* 纯中文等无法 slug 的标签：用稳定哈希做 id，保证同一维度在任何一次会话里 id 一致，
       否则后端按 id 去重、前端按 label 去重会错位，产生「同名不同 id」的重复角度。 */
    let hash = 0
    for (const ch of label) hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0
    return `a-${hash.toString(36)}`
  }

  async function addCustomAngle(): Promise<void> {
    if (selectedId === '' || detail === null) return
    const input = await askText('自定义角度名称', '', '≤12 字，例如：合规、硬件形态')
    if (input === null) return
    const label = input.trim().slice(0, 12)
    if (label === '') return
    if (customAngles().some(a => a.label === label)) { deps.toast('这个角度已经存在'); return }
    if (customAngles().length >= 6) { deps.toast('自定义角度最多 6 个'); return }
    const id = slugifyAngle(label)
    const next = customAngles().concat([{ id, label }]).map(a => ({ id: a.id, label: a.label }))
    const res = await api(`/ideas/${selectedId}`, { method: 'PATCH', body: { customAngles: next } })
    if (!res.ok) { deps.toast(`添加失败：${res.body?.message ?? res.status}`); return }
    anglePref.push(id)
    await reloadDetail()
    renderDetail()
    deps.toast(`已添加角度「${label}」`)
  }

  async function deleteCustomAngle(id: string): Promise<void> {
    if (selectedId === '' || detail === null) return
    const next = customAngles().filter(a => a.id !== id)
    const res = await api(`/ideas/${selectedId}`, { method: 'PATCH', body: { customAngles: next } })
    if (!res.ok) { deps.toast('删除失败'); return }
    const index = anglePref.indexOf(id)
    if (index >= 0) anglePref.splice(index, 1)
    await reloadDetail()
    renderDetail()
  }

  async function setNodeStatus(status: 'kept' | 'dropped' | 'pending'): Promise<void> {
    const node = nodeById(draft.graph, selectedNode)
    if (!node) { deps.toast('先选中一个节点'); return }
    node.status = status
    renderDetail()
    renderList()
    deps.toast(status === 'kept' ? `已采纳「${node.label}」` : status === 'dropped' ? `已放弃「${node.label}」` : '已标记待验证')
    await persistGraph()
  }

  async function deleteNode(): Promise<void> {
    const node = nodeById(draft.graph, selectedNode)
    if (!node || node.id === draft.graph.rootId) return
    if (!deps.confirm(`删除「${node.label}」及其子节点？`)) return
    const graph = draft.graph
    const isTreeEdge = (e: { from: string; to: string; kind: string }): boolean => e.kind === 'tree'
    const childMap = new Map<string, string[]>()
    for (const edge of graph.edges.filter(isTreeEdge)) {
      const list = childMap.get(edge.from) ?? []
      list.push(edge.to)
      childMap.set(edge.from, list)
    }
    const drop = new Set<string>([node.id])
    const stack = [...(childMap.get(node.id) ?? [])]
    while (stack.length > 0) {
      const current = stack.pop() as string
      if (drop.has(current)) continue
      drop.add(current)
      for (const child of childMap.get(current) ?? []) stack.push(child)
    }
    draft.graph = {
      ...graph,
      nodes: graph.nodes.filter(n => !drop.has(n.id)),
      edges: graph.edges.filter(e => !drop.has(e.from) && !drop.has(e.to)),
    }
    selectedNode = ''
    renderAll()
    await persistGraph()
  }

  function nodeChildren(id: string): string[] {
    return draft.graph.edges.filter(e => e.kind === 'tree' && e.from === id).map(e => e.to)
  }

  function collectSubtree(id: string): Set<string> {
    const drop = new Set<string>([id])
    const stack = [...nodeChildren(id)]
    while (stack.length > 0) {
      const current = stack.pop() as string
      if (drop.has(current)) continue
      drop.add(current)
      stack.push(...nodeChildren(current))
    }
    return drop
  }

  async function addSiblingNode(): Promise<void> {
    const node = nodeById(draft.graph, selectedNode)
    if (!node) { void addChildNode(); return }
    if (node.id === draft.graph.rootId) { deps.toast('根节点没有同级'); return }
    const parentId = node.parentId ?? draft.graph.rootId
    const label = await askText('新增同级节点', '', '一句话点子（≤24 字）')
    if (label === null) return
    if (label.trim() === '') { deps.toast('名称不能为空'); return }
    const id = `m-${Math.random().toString(36).slice(2, 8)}`
    const index = draft.graph.nodes.findIndex(n => n.id === node.id)
    const next = draft.graph.nodes.slice()
    next.splice(index + 1, 0, { id, type: node.type, label: label.trim().slice(0, 24), parentId, depth: node.depth, angle: node.angle, status: 'kept' })
    draft.graph = { ...draft.graph, nodes: next, edges: draft.graph.edges.concat([{ from: parentId, to: id, kind: 'tree' }]) }
    selectedNode = id
    renderAll()
    deps.toast(`已新增同级「${label.trim().slice(0, 24)}」`)
    void persistGraph()
  }

  function openNodeMenu(x: number, y: number, id: string): void {
    const target = plot()
    if (target === null) return
    closeNodeMenu()
    menuNode = id
    const node = nodeById(draft.graph, id)
    const isRoot = id === draft.graph.rootId
    const menu = document.createElement('div')
    menu.className = 'idea-menu'
    const maxX = Math.max(4, (target.clientWidth || 600) - 190)
    const maxY = Math.max(4, (target.clientHeight || 500) - 260)
    menu.style.left = `${Math.min(Math.max(4, x), maxX)}px`
    menu.style.top = `${Math.min(Math.max(4, y), maxY)}px`
    menu.innerHTML = `
      <button data-idea-act="idea-node-edit">✎ 修改文案</button>
      <button data-idea-act="idea-node-add">＋ 新增子节点</button>
      ${isRoot ? '' : '<button data-idea-act="idea-node-sibling">＋ 新增同级</button>'}
      <button data-idea-act="idea-continue">✦ 发散思维</button>
      <div class="sep"></div>
      <button data-idea-act="idea-node-status" data-status="kept">✓ 采纳</button>
      <button data-idea-act="idea-node-status" data-status="dropped">✕ 放弃</button>
      ${isRoot ? '' : '<div class="sep"></div><button class="danger" data-idea-act="idea-node-delete">🗑 删除该节点</button>'}
      <div class="hint">${deps.esc(node?.label ?? '')}</div>`
    target.appendChild(menu)
  }

  function closeNodeMenu(): void {
    menuNode = ''
    const target = plot()
    if (target === null) return
    target.querySelectorAll('.idea-menu').forEach(node => node.remove())
  }

  /**
   * mind-elixir 给节点容器的属性是 data-nodeid="me<style 节点 id>"，
   * 而图里的 id 不含前缀。这里按「精确命中优先、去 me 前缀次之」还原成图 id。
   */
  function graphIdOf(raw: string): string {
    if (raw === '') return ''
    if (nodeById(draft.graph, raw) !== undefined) return raw
    if (raw.startsWith('me') && nodeById(draft.graph, raw.slice(2)) !== undefined) return raw.slice(2)
    return raw
  }

  function onPlotContext(event: Event): void {
    if (view !== 'tree' || preview !== null) return
    const e = event as MouseEvent
    const target = e.target as HTMLElement | null
    const nodeEl = target?.closest('[data-nodeid]') as HTMLElement | null
    e.preventDefault()
    if (nodeEl === null) { closeNodeMenu(); return }
    const id = graphIdOf(nodeEl.getAttribute('data-nodeid') ?? '')
    if (id === '') return
    selectedNode = id
    renderDetail()
    const rect = plot()?.getBoundingClientRect()
    openNodeMenu(e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0), id)
  }

  function onPlotDblClick(event: Event): void {
    if (view !== 'tree' || preview !== null) return
    const target = event.target as HTMLElement | null
    const nodeEl = target?.closest('[data-nodeid]') as HTMLElement | null
    if (nodeEl === null) return
    event.preventDefault()
    event.stopPropagation()
    const id = graphIdOf(nodeEl.getAttribute('data-nodeid') ?? '')
    if (id === '') return
    selectedNode = id
    renderDetail()
    void editNodeLabel()
  }

  async function editNodeLabel(): Promise<void> {
    const node = nodeById(draft.graph, selectedNode)
    if (!node) return
    const next = await askText('修改节点文案', node.label, '≤24 字')
    if (next === null) return
    node.label = next.trim().slice(0, 24) || node.label
    renderDetail()
    renderPlot()
    void persistGraph()
  }

  async function addChildNode(): Promise<void> {
    const parent = nodeById(draft.graph, selectedNode) ?? nodeById(draft.graph, draft.graph.rootId)
    if (!parent) return
    if ((parent.depth ?? 0) + 1 > 4) { deps.toast('已经到第 4 层，不能再往下加了'); return }
    const label = await askText('新增子节点', '', '一句话点子（≤24 字）')
    if (label === null) return
    if (label.trim() === '') { deps.toast('名称不能为空'); return }
    const id = `m-${Math.random().toString(36).slice(2, 8)}`
    const depth = (parent.depth ?? 0) + 1
    draft.graph = {
      ...draft.graph,
      nodes: draft.graph.nodes.concat([{ id, type: depth === 1 ? 'direction' : 'idea', label: label.trim().slice(0, 24), parentId: parent.id, depth, angle: parent.angle, status: 'kept' }]),
      edges: draft.graph.edges.concat([{ from: parent.id, to: id, kind: 'tree' }]),
    }
    renderAll()
    deps.toast(`已新增「${label.trim().slice(0, 24)}」`)
    void persistGraph()
  }

  /* ------------------------------ 事件 ------------------------------ */
  function onClick(event: Event): void {
    const target = event.target as HTMLElement | null
    const el = target?.closest('[data-idea-act]') as HTMLElement | null
    const appAct = target?.closest('[data-act]') as HTMLElement | null
    /*
     * 注意顺序：弹窗内按钮也位于 [data-act="overlay"] 之下，必须先看 data-idea-act。
     * 否则点“确定”会被当成点遮罩而取消（新增节点点击确认没反应就是这个原因）。
     */
    if (askResolve !== null && el === null && appAct !== null) {
      const act = appAct.getAttribute('data-act')
      if (act === 'overlay' || act === 'close-modal') {
        event.preventDefault()
        event.stopPropagation()
        finishAsk(null)
        return
      }
    }
    if (menuNode !== '' && (target?.closest('.idea-menu') === null)) closeNodeMenu()
    /* 点画布空白 = 退出节点选中，回到灵感概览（节点本身没有 data-idea-act） */
    if (el === null && selectedNode !== '' && target?.closest('#idea-plot') !== null && target?.closest('[data-nodeid]') === null) {
      selectedNode = ''
      renderDetail()
      return
    }
    if (el === null) return
    const act = el.getAttribute('data-idea-act') ?? ''
    event.preventDefault()
    event.stopPropagation()
    switch (act) {
      case 'idea-new': void openForm('create'); break
      case 'idea-edit': void openForm('edit'); break
      case 'idea-delete': void removeIdea(); break
      case 'idea-direction': {
        const next = (el.getAttribute('data-dir') as typeof direction) ?? 'right'
        if (next !== direction) { direction = next; try { window.localStorage.setItem('dsh-workbench.idea.direction', next) } catch { /* 忽略 */ } ; applyDirection() }
        break
      }
      case 'idea-project-new': openProjectModal(); break
      case 'idea-project-manage': openProjectModal(); break
      case 'idea-project-save': void saveProject(); break
      case 'idea-project-sync': void syncFromPortal(); break
      case 'idea-project-del': void deleteProject(el.getAttribute('data-id') ?? ''); break
      case 'idea-project-pick': {
        projectFilter = el.getAttribute('data-id') ?? ''
        deps.closeModal()
        renderProjectBox()
        void loadIdeas().then(() => renderAll())
        break
      }
      case 'idea-version-rollback': if (preview !== null) void rollback(preview.version.id); break
      case 'idea-version-delete': if (preview !== null) void removeVersion(preview.version.id); break
      case 'idea-pick': void selectIdea(el.getAttribute('data-id') ?? ''); break
      case 'idea-filter': filter = (el.getAttribute('data-filter') as typeof filter) ?? 'all'; renderList(); break
      case 'idea-view': {
        const next = (el.getAttribute('data-view') as 'tree' | 'force') ?? 'tree'
        if (next !== view) { view = next; disposeEngines(); renderBar(); renderPlot() }
        break
      }
      case 'idea-zoom': zoom(el.getAttribute('data-dir') ?? 'in'); break
      case 'idea-export': openExportMenu(); break
      case 'idea-export-go': void exportAs((el.getAttribute('data-fmt') as 'json' | 'markdown' | 'svg' | 'png') ?? 'json'); break
      case 'idea-export-workspace': void exportWorkspace(); break
      case 'idea-archive': void archive(); break
      case 'idea-generate': void generate('diverge'); break
      case 'idea-continue': closeNodeMenu(); void generate('continue', selectedNode); break
      case 'idea-stop': void stopRun(); break
      case 'idea-angle': void toggleAngle(el.getAttribute('data-id') ?? ''); break
      case 'idea-angle-add': void addCustomAngle(); break
      case 'idea-angle-del': void deleteCustomAngle(el.getAttribute('data-id') ?? ''); break
      case 'idea-node-status': closeNodeMenu(); void setNodeStatus((el.getAttribute('data-status') as 'kept' | 'dropped') ?? 'kept'); break
      case 'idea-node-delete': closeNodeMenu(); void deleteNode(); break
      case 'idea-node-edit': closeNodeMenu(); void editNodeLabel(); break
      case 'idea-node-add': closeNodeMenu(); void addChildNode(); break
      case 'idea-node-sibling': closeNodeMenu(); void addSiblingNode(); break
      case 'idea-back-overview': {
        selectedNode = ''
        closeNodeMenu()
        renderDetail()
        renderPlot()
        break
      }
      case 'idea-version': void previewVersion(el.getAttribute('data-id') ?? ''); break
      case 'idea-version-back': preview = null; renderBar(); renderSub(); renderDetail(); renderPlot(); break
      case 'idea-chat-toggle': {
        const el = q('idea-chat')
        if (el !== null) el.style.display = el.style.display === 'none' ? '' : 'none'
        break
      }
      case 'idea-diff': void showDiff(); break
      case 'idea-diff-swap':
        if (diffState !== null) {
          const tmp = diffState.a
          diffState.a = diffState.b
          diffState.b = tmp
          const aSel = q<HTMLSelectElement>('idea-diff-a')
          const bSel = q<HTMLSelectElement>('idea-diff-b')
          if (aSel) aSel.value = diffState.a
          if (bSel) bSel.value = diffState.b
          void renderDiffBody()
        }
        break
      case 'idea-diff-rollback':
        if (diffState !== null) {
          deps.closeModal()
          void rollback(diffState.a)
        }
        break
      case 'idea-ask-ok': finishAsk(askValue.trim()); break
      case 'idea-ask-cancel': finishAsk(null); break
      case 'idea-close-modal': deps.closeModal(); break
      case 'idea-modal-pick': q<HTMLInputElement>('idea-form-file')?.click(); break
      case 'idea-modal-url-add': addUrlFromForm(); break
      case 'idea-modal-url-del': form?.urls.splice(Number(el.getAttribute('data-index') ?? 0), 1); renderForm(); break
      case 'idea-modal-image-del': form?.images.splice(Number(el.getAttribute('data-index') ?? 0), 1); renderForm(); break
      case 'idea-modal-angle': toggleFormAngle(el.getAttribute('data-id') ?? ''); break
      case 'idea-modal-angle-add': void addFormCustomAngle(); break
      case 'idea-preset-toggle': togglePreset(el.getAttribute('data-id') ?? ''); break
      case 'idea-preset-angle': togglePresetAngle(el.getAttribute('data-label') ?? ''); break
      case 'idea-modal-angle-del': removeFormCustomAngle(el.getAttribute('data-id') ?? ''); break
      case 'idea-modal-create': void submitForm(true, false); break
      case 'idea-modal-create-generate': void submitForm(true, true); break
      case 'idea-quick-text': void addQuickText(); break
      case 'idea-modal-save': void submitForm(false); break
      default: break
    }
  }

  function onInput(event: Event): void {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | null
    if (target === null) return
    const key = target.getAttribute('data-idea-input') ?? ''
    /* 输入弹窗不依赖 form 状态，必须放在 form === null 早退之前 */
    if (key === 'ask') { askValue = target.value; return }
    if (key === 'search') {
      query = target.value
      if (searchTimer !== 0) window.clearTimeout(searchTimer)
      searchTimer = window.setTimeout(() => { searchTimer = 0; void loadIdeas().then(renderList) }, 240)
      return
    }
    if (form === null) return
    if (key === 'form-title') form.title = target.value.slice(0, 60)
    if (key === 'form-brief') form.brief = target.value
    if (key === 'form-text') form.text = target.value
    if (key === 'form-url') form.urlDraft = target.value
  }

  function onChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null
    if (target === null) return
    const key = target.getAttribute('data-idea-input')
    if (key === 'project') {
      projectFilter = target.value
      void loadIdeas().then(() => renderAll())
      return
    }
    if ((key === 'diff-a' || key === 'diff-b') && diffState !== null) {
      if (key === 'diff-a') diffState.a = target.value
      else diffState.b = target.value
      void renderDiffBody()
    }
  }

  function onKeydown(event: Event): void {
    const key = (event as KeyboardEvent).key
    if (key === 'Escape') {
      if (askResolve !== null) { finishAsk(null); return }
      if (menuNode !== '') { closeNodeMenu(); return }
      if (form !== null) { form = null; deps.closeModal() }
      else if (preview !== null) { preview = null; renderAll() }
    }
    if (key === 'Enter' && (event.target as HTMLElement | null)?.id === 'idea-ask-input') {
      event.preventDefault()
      finishAsk(askValue.trim())
      return
    }
    if (key === 'Enter' && ((event as KeyboardEvent).metaKey || (event as KeyboardEvent).ctrlKey) && (event.target as HTMLElement | null)?.id === 'idea-quick-text') {
      event.preventDefault()
      void addQuickText()
      return
    }
    if (key === 'Enter' && (event.target as HTMLElement | null)?.getAttribute('data-idea-input') === 'form-url') {
      event.preventDefault()
      addUrlFromForm()
    }
  }

  let searchTimer = 0

  function addUrlFromForm(): void {
    if (form === null) return
    const input = q<HTMLInputElement>('idea-form-url')
    const value = (input?.value ?? '').trim()
    if (!/^https?:\/\//i.test(value)) { deps.toast('链接要以 http(s):// 开头'); return }
    if (form.urls.includes(value)) { deps.toast('这个链接已经加过了'); return }
    form.urls.push(value)
    if (input) input.value = ''
    renderForm()
  }

  function toggleFormAngle(id: string): void {
    if (form === null) return
    const index = form.angles.indexOf(id)
    if (index >= 0) form.angles.splice(index, 1)
    else form.angles.push(id)
    renderForm()
  }

  /** 弹窗内新增自定义发散维度：立刻进本次表单（保存灵感时落到 customAngles）。 */
  async function addFormCustomAngle(): Promise<void> {
    if (form === null) return
    const list = form.customAngles ?? []
    const builtin = [...IDEA_ANGLES.map(a => a.label), '跨界类比']
    if (list.length >= 6) { deps.toast('自定义角度最多 6 个'); return }
    const input = await askText('自定义发散维度', '', '≤12 字，例如：合规、硬件形态、竞品')
    if (input === null) return
    const label = input.trim().slice(0, 12)
    if (label === '') return
    if (builtin.includes(label) || list.some(a => a.label === label) || customAngles().some(a => a.label === label)) {
      deps.toast('这个角度已经存在')
      return
    }
    const id = slugifyAngle(label)
    form.customAngles = list.concat([{ id, label }])
    if (!form.angles.includes(id)) form.angles.push(id)
    renderForm()
    deps.toast(`已添加维度「${label}」`)
  }

  /** 移除弹窗内的自定义维度（只影响本次表单，不删库里已有的）。 */
  function removeFormCustomAngle(id: string): void {
    if (form === null) return
    form.customAngles = (form.customAngles ?? []).filter(a => a.id !== id)
    form.angles = form.angles.filter(a => a !== id)
    renderForm()
  }

  /** 展开/收起一个预设维度组（再点一次收起）。 */
  function togglePreset(id: string): void {
    if (form === null) return
    form.preset = form.preset === id ? '' : id
    renderForm()
  }

  /** 点选预设维度：加入本次表单的自定义角度（同名复选切换），受 6 个上限约束。 */
  function togglePresetAngle(label: string): void {
    if (form === null) return
    const list = form.customAngles ?? []
    const existing = list.find(a => a.label === label)
    if (existing !== undefined) {
      const on = form.angles.includes(existing.id)
      form.angles = on ? form.angles.filter(a => a !== existing.id) : form.angles.concat([existing.id])
      renderForm()
      return
    }
    if (list.length >= 6) { deps.toast('自定义维度最多 6 个'); return }
    const id = slugifyAngle(label)
    form.customAngles = list.concat([{ id, label }])
    if (!form.angles.includes(id)) form.angles.push(id)
    renderForm()
    deps.toast(`已加入维度「${label}」`)
  }

  async function toggleAngle(id: string): Promise<void> {
    // 详情面板里的角度开关：只改本地偏好（下次生成生效）
    const index = anglePref.indexOf(id)
    if (index >= 0) anglePref.splice(index, 1)
    else anglePref.push(id)
    renderDetail()
  }

  function zoom(dir: string): void {
    if (mind !== null) {
      const current = Number(mind.scaleVal ?? 1) || 1
      if (dir === 'in') mind.scale(current + 0.15)
      else if (dir === 'out') mind.scale(Math.max(0.4, current - 0.15))
      else { mind.scale(1); mind.toCenter() }
      return
    }
    if (chart !== null) {
      const option = chart.getOption()
      const zoomNow = Number(option?.series?.[0]?.zoom ?? 1) || 1
      if (dir === 'fit') chart.setOption({ series: [{ zoom: 1 }] })
      else chart.setOption({ series: [{ zoom: Math.min(4, Math.max(0.4, zoomNow + (dir === 'in' ? 0.2 : -0.2))) }] })
    }
  }

  /** 详情面板里直接补一句文字（不用打开编辑弹窗）。 */
  async function addQuickText(): Promise<void> {
    if (selectedId === '') return
    const el = q<HTMLTextAreaElement>('idea-quick-text')
    const text = el?.value.trim() ?? ''
    if (text === '') { el?.focus(); return }
    const res = await api(`/ideas/${selectedId}/inputs`, { method: 'POST', body: { kind: 'text', text } })
    if (!res.ok) { deps.toast(`添加失败：${res.body?.message ?? res.status}`); return }
    await reloadDetail()
    renderDetail()
    deps.toast('已添加文字')
  }

  async function removeIdea(): Promise<void> {
    if (detail === null) return
    if (!deps.confirm(`删除灵感「${detail.idea.title}」及其所有版本？`)) return
    await api(`/ideas/${selectedId}`, { method: 'DELETE' })
    selectedId = ''
    detail = null
    draft = { rev: 0, graph: EMPTY_GRAPH }
    await loadIdeas()
    if (ideas.length > 0) await selectIdea(ideas[0].id)
    renderAll()
    deps.toast('已删除')
  }

  async function exportWorkspace(): Promise<void> {
    if (detail === null) return
    const graph = preview?.graph ?? draft.graph
    const res = await api(`/ideas/${selectedId}/export`, { method: 'POST', body: { format: 'markdown', content: graphToMarkdown(graph), toWorkspace: true, versionSeq: preview?.version.seq ?? 'draft' } })
    if (!res.ok) { deps.toast(`保存失败：${res.body?.message ?? res.status}`); return }
    deps.toast(`已保存：${res.body.filePath}`)
  }

  /* ------------------------------ 生命周期 ------------------------------ */
  function show(): void {
    host.style.display = ''
    void ensure()
    /* 面板刚由隐藏切到显示时尺寸还是 0：等两帧再让导图按真实尺寸重排，避免首屏乱图。 */
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (host.style.display === 'none') return
        if (mind !== null) { try { mind.refresh(toMindElixir(draft.graph)) } catch { /* ignore */ } }
        else void renderPlot()
      })
    })
  }
  function hide(): void {
    host.style.display = 'none'
  }
  async function reload(): Promise<void> {
    booted = true
    await loadProjects()
    await loadIdeas()
    if (selectedId !== '') await reloadDetail()
    renderAll()
  }
  function destroy(): void {
    stopPolling()
    stopChatPolling()
    closeChatTimer()
    askDispose?.()
    chat?.destroy()
    disposeEngines()
    resizeObserver?.disconnect()
    if (mindSyncTimer !== 0) window.clearTimeout(mindSyncTimer)
    rootNode.removeEventListener('click', onClick, true)
    rootNode.removeEventListener('input', onInput, true)
    rootNode.removeEventListener('change', onChange, true)
    rootNode.removeEventListener('keydown', onKeydown, true)
    host.innerHTML = ''
  }

  return { ensure, show, hide, destroy, reload, isMounted: () => built }
}
