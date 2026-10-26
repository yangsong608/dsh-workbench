/**
 * DEMO 视图（1.13）
 *
 * 设计约束：
 * - 与 app.ts 只通过 deps 交互；
 * - 预览走 iframe（/demos/:id/view），视口切换只改容器宽度；
 * - 布局模式（D5）创建后不可改：页头徽标 + 生成弹窗警告双提示。
 */
import { UI_DEMO_CSS } from './ui-demo.css.js'

export interface DemoDeps {
  api: string
  esc: (value: unknown) => string
  toast: (message: string) => void
  confirm: (message: string) => boolean
  getProjectId: () => string
  getProjectName: () => string
  themes: () => Array<{ id: string; name: string; platform: string; hint: string }>
  designs: () => Promise<Array<{ id: string; name: string; pages: Array<{ id: string; name: string }> }>>
  ensureStyles: (css: string) => void
  seed: () => { designId: string; pageId: string } | null
  clearSeed: () => void
  openModal: (html: string) => void
  closeModal: () => void
  /** 派发 AI 生成 DEMO 产物（HTML）。 */
  onBuild?: (demo: DemoItem) => void
}

export interface DemoVersion {
  id: string; seq: number; label: string; source: string; targetPage: string
  summary: string; entryPath: string; bytes: number; pageCount: number; createdAt: string
}
export interface DemoItem {
  id: string; projectId: string; uiDesignId: string; themeId: string
  layoutMode: 'single' | 'multi'; scope: string; kind: string; title: string
  entryPath: string; platform: string; status: string; currentVersionId: string
  archivedAt?: string; createdAt?: string; updatedAt?: string; versions?: DemoVersion[]
}

export interface DemoViewHandle {
  mount(): void
  render(): void
  reload(): Promise<void>
  destroy(): void
  isMounted(): boolean
}

export function createDemoView(host: HTMLElement, deps: DemoDeps): DemoViewHandle {
  deps.ensureStyles(UI_DEMO_CSS)
  const esc = deps.esc
  let root: HTMLElement | null = null
  let demos: DemoItem[] = []
  let activeId = ''
  let viewport: 'pc' | 'tablet' | 'mobile' = 'pc'
  let pageId = ''
  let loading = false
  let mounted = false
  let tab: 'preview' | 'files' | 'versions' = 'preview'
  let files: Array<{ path: string; role: string; bytes: number }> = []
  /** 关联 UI 设计的页面清单（用于预览的页面切换）。 */
  let pages: Array<{ id: string; name: string }> = []

  async function loadPagesOf(demo: DemoItem): Promise<void> {
    pages = []
    if (demo.uiDesignId === '') return
    try {
      const data = await api(`/ui-designs/${encodeURIComponent(demo.uiDesignId)}`)
      const list = data.design?.pages
      pages = Array.isArray(list) ? list.map((p: any) => ({ id: String(p.id), name: String(p.name ?? p.id) })) : []
    } catch { pages = [] }
  }

  const current = (): DemoItem | undefined => demos.find(d => d.id === activeId) ?? demos[0]

  /** 弹窗在 Shadow DOM 内，document.getElementById 取不到——必须从宿主 shadowRoot 查。 */
  function $el<T extends HTMLElement = HTMLElement>(id: string): T | null {
    const shadow = root?.getRootNode() instanceof ShadowRoot ? (root.getRootNode() as ShadowRoot) : null
    return (shadow?.getElementById(id) ?? document.getElementById(id)) as T | null
  }

  async function api(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${deps.api}${path}`, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String((data as any)?.message ?? `HTTP ${res.status}`))
    return data
  }

  async function reload(): Promise<void> {
    const projectId = deps.getProjectId()
    if (projectId === '') { demos = []; render(); return }
    if (loading) return
    loading = true
    render()
    try {
      const data = await api(`/demos?projectId=${encodeURIComponent(projectId)}&archived=1`)
      demos = Array.isArray(data.demos) ? data.demos : []
      const seed = deps.seed()
      if (seed !== null && demos.length > 0) {
        const hit = demos.find(d => d.uiDesignId === seed.designId)
        if (hit !== undefined) { activeId = hit.id; if (seed.pageId !== '') pageId = seed.pageId }
        deps.clearSeed()
      }
      if (!demos.some(d => d.id === activeId)) activeId = demos[0]?.id ?? ''
      const hit = current()
      if (hit !== undefined) {
        const detail = await api(`/demos/${hit.id}`)
        if (detail.demo?.versions) {
          const index = demos.findIndex(d => d.id === hit.id)
          if (index >= 0) demos[index] = { ...demos[index], ...detail.demo }
        }
        await loadPagesOf(hit)
        files = await loadFiles(hit.id)
      }
    } catch (cause) {
      deps.toast(`加载 DEMO 失败：${String((cause as Error).message ?? cause)}`)
    }
    loading = false
    render()
  }

  /** 文件索引（B3 接后端 tree 接口；当前按版本尝试读取元信息）。 */
  async function loadFiles(demoId: string): Promise<Array<{ path: string; role: string; bytes: number }>> {
    try {
      const data = await api(`/files/tree?demoId=${encodeURIComponent(demoId)}`)
      return Array.isArray(data.files) ? data.files : []
    } catch { return [] }
  }

  function themeOptions(selected: string): string {
    const list = deps.themes()
    const merged = list.length > 0 ? list : [{ id: 'clean', name: '极简白', platform: 'all', hint: '' }]
    return merged.map(t => `<option value="${esc(t.id)}" ${t.id === selected ? 'selected' : ''}>${esc(t.name)}</option>`).join('')
  }

  function renderPreview(demo: DemoItem): string {
    const src = `${deps.api}/demos/${encodeURIComponent(demo.id)}/view${pageId !== '' ? `?page=${encodeURIComponent(pageId)}` : ''}`
    const pagePicker = pages.length > 0
      ? `<select class="ud-sel" data-demo="page" style="height:22px;font-size:9.5px">${pages.map(p => `<option value="${esc(p.id)}" ${(pageId === p.id || (pageId === '' && pages[0]?.id === p.id)) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`
      : ''
    return `<div class="ud-frame-bar">
        ${(['pc', 'tablet', 'mobile'] as const).map(v => `<button class="ud-vp ${viewport === v ? 'on' : ''}" data-demo="vp" data-v="${v}">${v === 'pc' ? 'PC' : v === 'tablet' ? '平板' : '移动'}</button>`).join('')}
        ${pagePicker}
        <span style="margin-left:auto;display:flex;gap:4px;align-items:center">
          <button class="ud-btn tiny" data-demo="optimize">✦ AI 优化此页</button>
          <button class="ud-btn tiny" data-demo="open">↗ 浏览器打开</button>
        </span>
      </div>
      <div class="ud-frame-wrap ${viewport}"><iframe class="ud-iframe" sandbox="allow-scripts allow-forms allow-modals" src="${esc(src)}" title="${esc(demo.title)}"></iframe></div>`
  }

  function renderFiles(demo: DemoItem): string {
    if (files.length === 0) {
      const version = (demo.versions ?? [])[0]
      return `<div class="ud-empty">${version
        ? `当前版本 v${version.seq} · ${version.pageCount} 页 · ${formatBytes(version.bytes)}。<br/>文件索引在 B3 接入后显示完整树。`
        : '还没有产物文件。生成 DEMO 后会在这里列出。</div>'}`
    }
    return `<div class="ud-tree">${files.map(f => `<div><span class="${f.role === 'entry' ? 'd' : ''}">${esc(f.path)}</span><span class="sz">${formatBytes(f.bytes)}</span>${f.role !== 'asset' ? `<span class="role ${f.role}">${esc(f.role)}</span>` : ''}</div>`).join('')}</div>`
  }

  function formatBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return '0 B'
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / 1024 / 1024).toFixed(2)} MB`
  }

  function renderVersions(demo: DemoItem): string {
    const list = demo.versions ?? []
    if (list.length === 0) return `<div class="ud-empty">还没有版本。生成 DEMO 会自动创建 v1。</div>`
    return `<div class="ud-vlist">${list.map(v => `
      <div class="ud-vrow ${v.id === demo.currentVersionId ? 'current' : ''}">
        <span class="ud-vseq">v${v.seq}</span>
        <span class="ud-vlabel">${esc(v.label || v.source)}</span>
        ${v.targetPage !== '' ? `<span class="ud-tag">${esc(v.targetPage)}</span>` : ''}
        <span class="ud-vmeta">${v.pageCount} 页 · ${formatBytes(v.bytes)} · ${esc((v.createdAt ?? '').slice(5, 16))}</span>
        <span class="ud-vops">
          <button class="ud-btn tiny" data-demo="rollback" data-version="${esc(v.id)}" title="回滚到此版本">↺</button>
        </span>
      </div>`).join('')}</div>`
  }

  function render(): void {
    if (root === null) return
    const projectId = deps.getProjectId()
    if (projectId === '') {
      root.innerHTML = `<div class="ud-view"><div class="ud-empty">先在「项目门户」选择一个项目，再使用 DEMO。</div></div>`
      return
    }
    if (loading && demos.length === 0) {
      root.innerHTML = `<div class="ud-view"><div class="ud-empty">加载中…</div></div>`
      return
    }
    const demo = current()
    const head = `<div class="ud-head">
      <div>
        <div class="ud-eyebrow">DEMO</div>
        <h2>${esc(demo?.title ?? '暂无 DEMO')}</h2>
        <p class="sub">${demo
          ? `${esc(deps.getProjectName())} · ${demo.layoutMode === 'multi' ? '多文件' : '单文件内导航'} · ${(demo.versions ?? []).length} 个版本`
          : '按 UI 设计生成可交互 HTML；支持版本、按页优化与归档'}</p>
      </div>
      <div class="ud-actions">
        ${demo ? `<span class="ud-badge ${demo.layoutMode === 'multi' ? 'multi' : 'single'}" title="布局模式创建后不可更改">${demo.layoutMode === 'multi' ? '多文件 · 不可改' : '单文件 · 不可改'}</span>` : ''}
        ${demo ? `<select class="ud-sel" data-demo="theme">${themeOptions(demo.themeId)}</select>` : ''}
        ${demo ? `<button class="ud-btn" data-demo="archive">${(demo.archivedAt ?? '') === '' ? '⌸ 归档' : '↩ 恢复'}</button>` : ''}
        ${demo ? `<button class="ud-btn" data-demo="build">✦ AI 生成页面</button>` : ''}
        <button class="ud-btn primary" data-demo="generate">${demo ? '重新创建' : '＋ 新建 DEMO'}</button>
      </div>
    </div>`
    if (demo === undefined) {
      root.innerHTML = `<div class="ud-view">${head}<div class="ud-empty">这个项目还没有 DEMO。点「＋ 新建 DEMO」按 UI 设计生成，或直接用描述生成。</div></div>`
      bind()   /* 空态也要绑定：否则「＋ 新建 DEMO」按钮没有处理器（onclick===null） */
      return
    }
    const list = `<div class="ud-demo-list"><div class="ud-panel-head"><div><b>DEMO</b><span>${demos.filter(d => (d.archivedAt ?? '') === '').length} 个</span></div></div>
      <div class="ud-dlist">${demos.map(d => `
        <div class="ud-ditem ${d.id === demo.id ? 'active' : ''}" data-demo="pick" data-id="${esc(d.id)}">
          <b>${esc(d.title)}</b>
          <span>${esc(d.themeId)} · ${d.layoutMode === 'multi' ? '多文件' : '单文件'}${(d.archivedAt ?? '') !== '' ? ' · 已归档' : ''}</span>
        </div>`).join('')}</div></div>`
    const tabs = `<div class="ud-tabs">
      <button class="ud-tab ${tab === 'preview' ? 'active' : ''}" data-demo="tab" data-tab="preview">预览</button>
      <button class="ud-tab ${tab === 'files' ? 'active' : ''}" data-demo="tab" data-tab="files">项目文件</button>
      <button class="ud-tab ${tab === 'versions' ? 'active' : ''}" data-demo="tab" data-tab="versions">版本 · ${(demo.versions ?? []).length}</button>
    </div>`
    let body = ''
    if (tab === 'preview') body = `<div class="ud-panel"><div class="ud-panel-body" style="padding:0">${renderPreview(demo)}</div></div>`
    else if (tab === 'files') body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>项目文件</b><span>只读浏览 · .dsh-workbench/demos/&lt;demoId&gt;/</span></div>
      <button class="ud-btn tiny" data-demo="reload">刷新</button></div><div class="ud-panel-body">${renderFiles(demo)}</div></div>`
    else body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>版本</b><span>生成 / 按页优化 / 换主题都会产生版本</span></div></div>
      <div class="ud-panel-body">${renderVersions(demo)}</div></div>`
    root.innerHTML = `<div class="ud-view">${head}<div class="ud-demo-wrap">${list}<div>${tabs}${body}</div></div></div>`
    bind()
  }

  function bind(): void {
    if (root === null) return
    root.querySelectorAll<HTMLElement>('[data-demo]').forEach(el => {
      el.onclick = () => {
        const act = el.getAttribute('data-demo') ?? ''
        const demo = current()
        if (act === 'tab') { tab = (el.getAttribute('data-tab') ?? 'preview') as typeof tab; render(); return }
        if (act === 'vp') { viewport = (el.getAttribute('data-v') ?? 'pc') as typeof viewport; render(); return }
        if (act === 'pick') { activeId = el.getAttribute('data-id') ?? ''; pageId = ''; void reload(); return }
        if (act === 'reload') { void reload(); return }
        if (act === 'archive') {
          if (demo) {
            const next = (demo.archivedAt ?? '') === ''
            if (!next || deps.confirm('归档后该 DEMO 会从列表隐藏（可在「显示已归档」查看）。继续？')) {
              void (async () => {
                try {
                  await api('/demos/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: demo.id, archived: next }) })
                  await reload()
                  deps.toast(next ? '已归档' : '已恢复')
                } catch (cause) { deps.toast(`操作失败：${String((cause as Error).message ?? cause)}`) }
              })()
            }
          }
          return
        }
        if (act === 'generate') { openGenerateModal(); return }
        if (act === 'build') {
          if (demo === undefined) { deps.toast('先创建一个 DEMO'); return }
          if (deps.onBuild === undefined) { deps.toast('生成通道未接入'); return }
          deps.onBuild(demo)
          return
        }
        if (act === 'optimize') { if (demo) openOptimizeModal(demo); return }
        if (act === 'open') { if (demo) window.open(`${deps.api}/demos/${encodeURIComponent(demo.id)}/view${pageId !== '' ? `?page=${encodeURIComponent(pageId)}` : ''}`, '_blank'); return }
        if (act === 'rollback') { if (demo) void rollback(demo, el.getAttribute('data-version') ?? ''); return }
      }
    })
    const pageSel = root.querySelector<HTMLSelectElement>('[data-demo="page"]')
    if (pageSel !== null) {
      pageSel.onchange = () => { pageId = pageSel.value; render() }
    }
    const themeSel = root.querySelector<HTMLSelectElement>('[data-demo="theme"]')
    if (themeSel !== null) {
      themeSel.onchange = () => {
        const demo = current()
        if (!demo) return
        void (async () => {
          try {
            await api('/demos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ demo: { id: demo.id, title: demo.title, themeId: themeSel.value } }) })
            await reload()
            deps.toast('已换主题（B1 后会自动生成新版本）')
          } catch (cause) { deps.toast(`换主题失败：${String((cause as Error).message ?? cause)}`) }
        })()
      }
    }
  }

  async function rollback(demo: DemoItem, versionId: string): Promise<void> {
    if (versionId === '') return
    if (!deps.confirm('回滚会新建一个版本（历史不丢）。继续？')) return
    try {
      await api(`/demos/${encodeURIComponent(demo.id)}/rollback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ versionId }) })
      await reload()
      deps.toast('已回滚并生成新版本')
    } catch (cause) { deps.toast(`回滚失败：${String((cause as Error).message ?? cause)}`) }
  }

  function openOptimizeModal(demo: DemoItem): void {
    const page = pageId !== '' ? pageId : '整页'
    deps.openModal(`<h3>AI 优化此页 · ${esc(page)}</h3>
      <div class="mfield"><label>这页要改什么</label><textarea id="wb-demo-opt" rows="4" placeholder="例如：更紧凑 / 补空态 / 换布局 / 精简文案"></textarea></div>
      <div class="mfield" style="display:flex;gap:5px;flex-wrap:wrap">
        ${['更紧凑', '更醒目', '换布局', '补空态', '补错误态', '精简文案'].map(t => `<button class="btn tiny" data-demo-chip="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="mfield" style="background:var(--amber-soft);border:1px solid color-mix(in srgb,var(--amber) 35%,var(--line));border-radius:8px;padding:7px 10px;font-size:10px;color:#8a5a08;line-height:1.6">
        只重写「${esc(page)}」这一页；其它页面字节级不变，校验通过才落库，并自动生成新版本。</div>
      <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" id="wb-demo-opt-go">开始优化</button></div>`)
    const shadow = root?.getRootNode() instanceof ShadowRoot ? (root.getRootNode() as ShadowRoot) : null
    ;(shadow ?? document).querySelectorAll<HTMLElement>('[data-demo-chip]').forEach(chip => {
      chip.onclick = () => {
        const target = $el('wb-demo-opt') as HTMLTextAreaElement | null
        if (target === null) return
        const value = chip.getAttribute('data-demo-chip') ?? ''
        target.value = target.value.trim() === '' ? value : `${target.value}；${value}`
      }
    })
    const go = $el('wb-demo-opt-go')
    if (go !== null) {
      go.onclick = () => {
        deps.closeModal()
        deps.toast('按页优化需团队派发（B1 接入后可用）；需求已记录')
      }
    }
  }

  function openGenerateModal(): void {
    void (async () => {
      let designs: Array<{ id: string; name: string; pages: Array<{ id: string; name: string }> }> = []
      try { designs = await deps.designs() } catch (e) { designs = []; deps.toast('读取 UI 设计失败：' + String(e).slice(0,60)) }
      const designOptions = designs.length > 0
        ? designs.map(d => `<option value="${esc(d.id)}">${esc(d.name)}（${d.pages.length} 页）</option>`).join('')
        : '<option value="">（暂无 UI 设计，可直接描述生成）</option>'
      deps.openModal(`<h3>生成 DEMO</h3>
        <div class="mfield"><label>来源</label><select id="wb-demo-design">${designOptions}</select></div>
        <div class="mfield"><label>布局模式 <span style="color:var(--amber)">（创建后不可更改）</span></label>
          <select id="wb-demo-layout"><option value="single">单文件 · 页面内导航切换</option><option value="multi">多文件 · 每页独立文件</option></select>
          <div style="margin-top:5px;background:var(--amber-soft);border:1px solid color-mix(in srgb,var(--amber) 35%,var(--line));border-radius:8px;padding:7px 10px;font-size:10px;color:#8a5a08;line-height:1.6">
            模式创建后不能修改。要换模式需删除该 DEMO 后重新生成（会丢失版本历史）。</div>
        </div>
        <div class="mfield"><label>主题</label><select id="wb-demo-theme">${themeOptions('glass')}</select></div>
        <div class="mfield"><label>名称</label><input id="wb-demo-title" placeholder="例如：收银台 Demo"></div>
        <div class="modal-foot"><button class="btn" data-act="close-modal">取消</button><button class="btn solid" id="wb-demo-create">创建</button></div>`)
      const create = $el('wb-demo-create')
      if (create !== null) {
        create.onclick = () => {
          const designId = $el<HTMLSelectElement>('wb-demo-design')?.value ?? ''
          const layoutMode = $el<HTMLSelectElement>('wb-demo-layout')?.value ?? 'single'
          const themeId = $el<HTMLSelectElement>('wb-demo-theme')?.value ?? 'clean'
          const title = ($el<HTMLInputElement>('wb-demo-title')?.value ?? '').trim() || '新 DEMO'
          void (async () => {
            try {
              const data = await api('/demos', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ demo: { projectId: deps.getProjectId(), uiDesignId: designId, title, themeId, layoutMode, platform: 'all' } }),
              })
              deps.closeModal()
              activeId = data.demo?.id ?? ''
              await reload()
              deps.toast(`已创建（${layoutMode === 'multi' ? '多文件' : '单文件'}）；生成页面需 B1 接入`)
            } catch (cause) { deps.toast(`创建失败：${String((cause as Error).message ?? cause)}`) }
          })()
        }
      }
    })()
  }

  function mount(): void {
    /* 视图切换时 #wb-generic 的 innerHTML 会被整体重建，缓存下来的 root 会脱离文档。
       所以每次 mount 都要确认 DOM 仍挂在宿主里，否则重建。 */
    if (mounted && root !== null && root.isConnected) { render(); return }
    root?.remove()
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
