/**
 * UI 设计视图（1.13）
 *
 * 设计约束：
 * - 与 app.ts 只通过 deps 交互（不 import app.ts，避免循环依赖）；
 * - 自持 DOM 容器，只重绘内部片段；
 * - 数据走 /workbench-api/ui-designs 与 /themes。
 */
import { UI_DEMO_CSS } from './ui-demo.css.js'

export interface UiDesignDeps {
  api: string
  esc: (value: unknown) => string
  toast: (message: string) => void
  confirm: (message: string) => boolean
  getProjectId: () => string
  getProjectName: () => string
  themes: () => Array<{ id: string; name: string; platform: string; hint: string }>
  ensureStyles: (css: string) => void
  onGenerate?: (design: UiDesign) => void
  onBuildDemo?: (design: UiDesign, pageId?: string) => void
}

export interface UiDesignPageBlock { id: string; role: string; desc: string }
export interface UiDesignPage {
  id: string; name: string; route: string; platform: string; goal: string
  blocks: UiDesignPageBlock[]; states?: string[]; interactions?: string[]; dataNeeds?: string[]
}
export interface UiDesign {
  id: string; projectId: string; productId?: string; mapId?: string; name: string
  themeId: string; platform: string; pages: UiDesignPage[]; status: string
  archivedAt?: string; createdAt?: string; updatedAt?: string
}

export interface UiDesignViewHandle {
  mount(): void
  render(): void
  reload(): Promise<void>
  destroy(): void
  isMounted(): boolean
}

type Tab = 'pages' | 'spec' | 'wire' | 'versions'

export function createUiDesignView(host: HTMLElement, deps: UiDesignDeps): UiDesignViewHandle {
  deps.ensureStyles(UI_DEMO_CSS)
  const esc = deps.esc
  let root: HTMLElement | null = null
  let designs: UiDesign[] = []
  let activeId = ''
  let tab: Tab = 'pages'
  let loading = false
  let mounted = false
  let specDraft = ''

  const current = (): UiDesign | undefined => designs.find(d => d.id === activeId) ?? designs[0]

  async function api(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${deps.api}${path}`, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String((data as any)?.message ?? `HTTP ${res.status}`))
    return data
  }

  async function reload(): Promise<void> {
    const projectId = deps.getProjectId()
    if (projectId === '') { designs = []; render(); return }
    if (loading) return
    loading = true
    render()
    try {
      const data = await api(`/ui-designs?projectId=${encodeURIComponent(projectId)}&archived=1`)
      designs = Array.isArray(data.designs) ? data.designs : []
      if (!designs.some(d => d.id === activeId)) activeId = designs[0]?.id ?? ''
      const hit = current()
      specDraft = hit?.id === current()?.id ? (specDraft || '') : ''
    } catch (cause) {
      deps.toast(`加载 UI 设计失败：${String((cause as Error).message ?? cause)}`)
    }
    loading = false
    render()
  }

  /** 主题下拉选项。 */
  function themeOptions(selected: string): string {
    const list = deps.themes()
    const merged = list.length > 0 ? list : [{ id: 'clean', name: '极简白', platform: 'all', hint: '' }]
    return merged.map(t => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('')
  }

  function renderPages(design: UiDesign): string {
    if (design.pages.length === 0) return `<div class="ud-empty">还没有页面。点「＋ 新增页面」手工创建，或「AI 生成 UI 设计」由产品设计文档自动规划。</div>`
    return `<div class="ud-pages">${design.pages.map(page => `
      <div class="ud-page">
        <div class="top"><b>${esc(page.name)}</b><span class="ud-route">${esc(page.route)}</span>
          <span class="ud-tag">${page.blocks.length} 区块</span></div>
        <div class="goal">${esc(page.goal || '未填写目标')}</div>
        <div class="ud-blocks">${page.blocks.map(b => `<div class="ud-blk"><span class="ud-role">${esc(b.role)}</span>${esc(b.desc)}</div>`).join('')}</div>
        <div class="ud-tags">
          ${(page.states ?? []).length > 0 ? `<span class="ud-tag st">${(page.states ?? []).length} 状态</span>` : ''}
          ${(page.interactions ?? []).length > 0 ? `<span class="ud-tag st">${(page.interactions ?? []).length} 交互</span>` : ''}
        </div>
        <div class="ops">
          <button class="ud-btn tiny" data-ud="page-edit" data-page="${esc(page.id)}">编辑</button>
          <button class="ud-btn tiny" data-ud="page-optimize" data-page="${esc(page.id)}">AI 优化此页</button>
          <button class="ud-btn tiny primary" data-ud="page-demo" data-page="${esc(page.id)}">生成 DEMO</button>
        </div>
      </div>`).join('')}</div>`
  }

  function renderSpec(design: UiDesign): string {
    const spec = specDraft !== '' ? specDraft : `# ${esc(design.name)} · 设计规范\n\n还没有生成规范。点右上角「AI 生成规范与令牌」，或在此手写。\n\n## 1. 色彩体系\n\n## 2. 字体层级\n\n## 3. 间距与圆角\n\n## 4. 组件变体\n\n## 5. 密度与动效\n\n## 6. 无障碍\n`
    return `<div class="ud-spec-wrap">
      <div class="ud-spec" data-ud-spec>${markdownLite(spec)}</div>
      <div class="ud-token-panel">
        <div style="font-size:10px;font-weight:600;margin-bottom:8px">令牌（渲染用）</div>
        <div class="ud-swatches">
          <div class="ud-sw" style="background:var(--bg)"><span>bg</span></div>
          <div class="ud-sw" style="background:var(--panel)"><span>surface</span></div>
          <div class="ud-sw" style="background:var(--text)"><span>text</span></div>
          <div class="ud-sw" style="background:var(--accent)"><span>accent</span></div>
        </div>
        <div class="ud-trow"><label>圆角</label><input type="range" min="0" max="24" value="12" data-ud-token="radius"><span style="width:30px;text-align:right">12px</span></div>
        <div class="ud-trow"><label>密度</label><select class="ud-sel" style="flex:1" data-ud-token="density"><option>紧凑</option><option selected>舒适</option><option>宽松</option></select></div>
        <div class="ud-trow"><label>字体</label><select class="ud-sel" style="flex:1" data-ud-token="font"><option selected>系统无衬线</option><option>衬线</option><option>等宽</option><option>圆润</option></select></div>
        <div class="ud-mini"><div style="font-size:8.5px;color:var(--text-3);margin-bottom:5px">实时小样</div>
          <div class="ud-mini-card"><b style="font-size:10.5px">${esc(design.pages[0]?.name ?? '示例区块')}</b>
            <p style="margin:2px 0 6px;font-size:9px;color:var(--text-3)">${esc(design.pages[0]?.goal ?? '按规范渲染的示例')}</p>
            <button class="ud-btn tiny primary" style="height:20px;font-size:9px">主按钮</button></div></div>
      </div>
    </div>`
  }

  /** 极简 Markdown → HTML（只处理标题/列表/段落，避免引入依赖）。 */
  function markdownLite(text: string): string {
    const lines = String(text).split('\n')
    const out: string[] = []
    let inList = false
    for (const raw of lines) {
      const line = raw.trimEnd()
      if (/^###\s+/.test(line)) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h3>${esc(line.replace(/^###\s+/, ''))}</h3>`); continue }
      if (/^##\s+/.test(line)) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h3>${esc(line.replace(/^##\s+/, ''))}</h3>`); continue }
      if (/^#\s+/.test(line)) { if (inList) { out.push('</ul>'); inList = false } out.push(`<h3 style="font-size:13px">${esc(line.replace(/^#\s+/, ''))}</h3>`); continue }
      if (/^[-*]\s+/.test(line)) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${esc(line.replace(/^[-*]\s+/, ''))}</li>`); continue }
      if (line.trim() === '') { if (inList) { out.push('</ul>'); inList = false } continue }
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p style="margin:3px 0">${esc(line)}</p>`)
    }
    if (inList) out.push('</ul>')
    return out.join('')
  }

  function renderWire(design: UiDesign): string {
    if (design.pages.length === 0) return `<div class="ud-empty">还没有页面，无法生成线框。</div>`
    return `<div class="ud-wires">${design.pages.map(page => `
      <div class="ud-wire">
        <div class="ud-wire-head"><b>${esc(page.name)}</b><span class="ud-route">${esc(page.route)}</span><span class="ud-tag">${page.blocks.length} 区块</span></div>
        <div class="ud-wire-frame">${page.blocks.map(b => `<div class="ud-wire-blk"><span class="ud-role">${esc(b.role)}</span>${esc(b.desc)}</div>`).join('')}</div>
      </div>`).join('')}</div>`
  }

  function renderVersions(): string {
    return `<div class="ud-empty">UI 设计的版本记录将在 B2（按页优化落库）后启用；当前每次生成会覆盖页面清单。</div>`
  }

  function render(): void {
    if (root === null) return
    const design = current()
    const projectId = deps.getProjectId()
    if (projectId === '') {
      root.innerHTML = `<div class="ud-view"><div class="ud-empty">先在「项目门户」选择一个项目，再使用 UI 设计。</div></div>`
      return
    }
    if (loading && designs.length === 0) {
      root.innerHTML = `<div class="ud-view"><div class="ud-empty">加载中…</div></div>`
      return
    }
    const head = `<div class="ud-head">
      <div>
        <div class="ud-eyebrow">UI 设计</div>
        <h2>${esc(design?.name ?? '暂无 UI 设计')}</h2>
        <p class="sub">${design
          ? `${esc(deps.getProjectName())} · ${design.pages.length} 页 · ${design.pages.reduce((n, p) => n + p.blocks.length, 0)} 区块 · 页面清单是 DEMO 的契约`
          : '把产品详细设计转成页面级 UI 设计（规范 + 页面清单），再据此生成 DEMO'}</p>
      </div>
      <div class="ud-actions">
        ${design ? `<span class="ud-badge ${design.status === 'ready' ? 'ready' : ''}">${esc(design.status)}</span>` : ''}
        ${design ? `<select class="ud-sel" data-ud="theme">${themeOptions(design.themeId)}</select>` : ''}
        ${design ? `<button class="ud-btn" data-ud="new-theme">＋ 新建主题</button>` : ''}
        <button class="ud-btn" data-ud="new">＋ 新建 UI 设计</button>
        <button class="ud-btn primary" data-ud="generate">✦ AI 生成 UI 设计</button>
      </div>
    </div>`
    if (design === undefined) {
      root.innerHTML = `<div class="ud-view">${head}<div class="ud-empty">这个项目还没有 UI 设计。点「＋ 新建 UI 设计」手工创建，或「✦ AI 生成 UI 设计」由产品设计文档自动规划页面。</div></div>`
      return
    }
    const tabs = `<div class="ud-tabs">
      <button class="ud-tab ${tab === 'pages' ? 'active' : ''}" data-ud="tab" data-tab="pages">页面清单 · ${design.pages.length}</button>
      <button class="ud-tab ${tab === 'spec' ? 'active' : ''}" data-ud="tab" data-tab="spec">设计规范</button>
      <button class="ud-tab ${tab === 'wire' ? 'active' : ''}" data-ud="tab" data-tab="wire">线框预览</button>
      <button class="ud-tab ${tab === 'versions' ? 'active' : ''}" data-ud="tab" data-tab="versions">版本</button>
    </div>`
    let body = ''
    if (tab === 'pages') {
      body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>页面清单</b><span>${design.pages.length} 页 · 每页含区块 / 状态 / 交互</span></div>
        <button class="ud-btn tiny" data-ud="page-new">＋ 新增页面</button></div>
        <div class="ud-panel-body">${renderPages(design)}</div></div>`
    } else if (tab === 'spec') {
      body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>设计规范</b><span>规范给 AI 读，令牌给渲染用</span></div>
        <div style="display:flex;gap:4px"><button class="ud-btn tiny" data-ud="spec-edit">编辑规范</button>
        <button class="ud-btn tiny">重新生成</button></div></div>
        <div class="ud-panel-body">${renderSpec(design)}</div></div>`
    } else if (tab === 'wire') {
      body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>线框预览</b><span>按页面清单本地渲染，不调用 AI</span></div></div>
        <div class="ud-panel-body">${renderWire(design)}</div></div>`
    } else {
      body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>版本</b><span>存档 / 对比 / 回滚</span></div>
        <button class="ud-btn tiny">存档当前</button></div><div class="ud-panel-body">${renderVersions()}</div></div>`
    }
    root.innerHTML = `<div class="ud-view">${head}${tabs}${body}</div>`
    bind()
  }

  function bind(): void {
    if (root === null) return
    root.querySelectorAll<HTMLElement>('[data-ud]').forEach(el => {
      el.onclick = event => {
        const act = el.getAttribute('data-ud') ?? ''
        const design = current()
        if (act === 'tab') { tab = (el.getAttribute('data-tab') ?? 'pages') as Tab; render(); return }
        if (act === 'reload') { void reload(); return }
        if (act === 'new') { openCreateModal(); return }
        if (act === 'generate') { if (design) void runGenerate(design); else deps.toast('先创建一个 UI 设计'); return }
        if (act === 'new-theme') { deps.toast('新建主题请在 DEMO 页或主题库操作（A8 后开放）'); return }
        if (act === 'page-new') { if (design) openPageModal(design); return }
        if (act === 'page-edit') { if (design) openPageModal(design, el.getAttribute('data-page') ?? ''); return }
        if (act === 'page-optimize') { if (design) void runOptimize(design, el.getAttribute('data-page') ?? ''); return }
        if (act === 'page-demo') { if (design) deps.onBuildDemo?.(design, el.getAttribute('data-page') ?? ''); return }
        if (act === 'spec-edit') { if (design) openSpecModal(design); return }
        void event
      }
    })
    const themeSel = root.querySelector<HTMLSelectElement>('[data-ud="theme"]')
    if (themeSel !== null) {
      themeSel.onchange = () => {
        const design = current()
        if (!design) return
        void saveDesign({ ...design, themeId: themeSel.value })
      }
    }
  }

  async function saveDesign(design: UiDesign): Promise<void> {
    try {
      await api('/ui-designs', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ design: { id: design.id, projectId: design.projectId, productId: design.productId, mapId: design.mapId, name: design.name, themeId: design.themeId, platform: design.platform, pages: design.pages, status: design.status } }),
      })
      await reload()
    } catch (cause) { deps.toast(`保存失败：${String((cause as Error).message ?? cause)}`) }
  }

  function openCreateModal(): void {
    const name = window.prompt('UI 设计名称', '页面 UI 设计')
    if (name === null || name.trim() === '') return
    const projectId = deps.getProjectId()
    void (async () => {
      try {
        const data = await api('/ui-designs', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ design: { projectId, name: name.trim(), themeId: 'clean', platform: 'all', status: 'draft', pages: [] } }),
        })
        activeId = data.design?.id ?? ''
        await reload()
        deps.toast('已创建，接下来新增页面或让 AI 生成')
      } catch (cause) { deps.toast(`创建失败：${String((cause as Error).message ?? cause)}`) }
    })()
  }

  function openPageModal(design: UiDesign, pageId = ''): void {
    const page = design.pages.find(p => p.id === pageId)
    const name = window.prompt('页面名称', page?.name ?? '新页面')
    if (name === null || name.trim() === '') return
    const route = window.prompt('路由（以 / 开头）', page?.route ?? `/${name.trim().toLowerCase().replace(/\s+/g, '-')}`)
    if (route === null || route.trim() === '') return
    const goal = window.prompt('这页要解决什么', page?.goal ?? '')
    if (goal === null) return
    const pages = design.pages.slice()
    if (page !== undefined) {
      const index = pages.findIndex(p => p.id === pageId)
      pages[index] = { ...page, name: name.trim(), route: route.trim(), goal: goal.trim() }
    } else {
      const slug = route.trim().replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || `page-${pages.length + 1}`
      pages.push({
        id: `page-${slug}`, name: name.trim(), route: route.trim(), platform: 'all', goal: goal.trim(),
        blocks: [{ id: `blk-${slug}-1`, role: 'header', desc: '页面标题与说明' }], states: ['默认'], interactions: [], dataNeeds: [],
      })
    }
    void saveDesign({ ...design, pages })
  }

  function openSpecModal(design: UiDesign): void {
    const next = window.prompt('设计规范（Markdown）。保存后写入本地草稿；接 A8 工具后会同步到主题库。', specDraft)
    if (next === null) return
    specDraft = next
    render()
    deps.toast('规范草稿已更新（本地）')
  }

  async function runOptimize(design: UiDesign, pageId: string): Promise<void> {
    const page = design.pages.find(p => p.id === pageId)
    if (page === undefined) return
    const requirement = window.prompt(`只重写「${page.name}」这一页。要改什么？\n（例：更紧凑 / 补空态 / 换布局）`, '')
    if (requirement === null || requirement.trim() === '') return
    deps.toast('按页优化需要团队派发（A8 接入后可用）；当前先记录需求')
    void design
  }

  async function runGenerate(design: UiDesign): Promise<void> {
    deps.toast('AI 生成需要提示词与工具（A8）；当前可手工新增页面后生成 DEMO')
    deps.onGenerate?.(design)
  }

  function mount(): void {
    if (mounted) { render(); return }
    root = document.createElement('div')
    root.className = 'ud-root'
    host.appendChild(root)
    mounted = true
    void reload()
  }

  function destroy(): void {
    root?.remove()
    root = null
    mounted = false
  }

  return { mount, render, reload, destroy, isMounted: () => mounted }
}
