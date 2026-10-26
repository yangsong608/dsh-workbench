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
  /** 打开测试页（点覆盖度徽标时）。 */
  onOpenTest?: () => void
}

/** 单页测试覆盖度（来自 /tests/coverage）。 */
export interface PageCoverage { pageId: string; name: string; total: number; passed: number; failed: number; pending: number }

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
  /** 页面覆盖度（uiDesignId → 每页统计） */
  let coverage: PageCoverage[] = []
  /** 1.15 B1：UI 设计版本列表 */
  let versions: Array<{ id: string; seq: number; label: string; source: string; pageCount: number; blockCount: number; createdAt: string }> = []

  async function loadVersions(designId: string): Promise<void> {
    if (designId === '') { versions = []; return }
    try {
      const data = await api(`/ui-designs/${encodeURIComponent(designId)}/versions`)
      versions = Array.isArray(data.versions) ? data.versions : []
    } catch { versions = [] }
  }

  async function rollbackVersion(designId: string, versionId: string, seq: number): Promise<void> {
    if (!deps.confirm(`回滚到 v${seq}？当前页面清单会被覆盖（会新建一条回滚版本，历史不丢）。`)) return
    try {
      await api(`/ui-designs/${encodeURIComponent(designId)}/versions/${encodeURIComponent(versionId)}/rollback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      deps.toast(`已回滚到 v${seq}`)
      await reload()
    } catch (cause) { deps.toast(`回滚失败：${String((cause as Error).message ?? cause)}`) }
  }

  async function loadCoverage(designId: string): Promise<void> {
    if (designId === '') { coverage = []; return }
    try {
      const data = await api(`/tests/coverage?uiDesignId=${encodeURIComponent(designId)}`)
      coverage = Array.isArray(data.pages) ? data.pages : []
    } catch { coverage = [] }
  }

  const current = (): UiDesign | undefined => designs.find(d => d.id === activeId) ?? designs[0]

  async function api(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${deps.api}${path}`, init)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(String((data as any)?.message ?? `HTTP ${res.status}`))
    return data
  }

  let reloadQueued = false
  async function reload(): Promise<void> {
    const projectId = deps.getProjectId()
    if (projectId === '') { designs = []; render(); return }
    /* 并发调用时不能直接 return —— 否则「建完空壳 → reload」会被正在进行的请求吞掉，
       表现为页面停在空态不刷新。改为置标记，本轮结束后再补一次。 */
    if (loading) { reloadQueued = true; return }
    loading = true
    render()
    try {
      const data = await api(`/ui-designs?projectId=${encodeURIComponent(projectId)}&archived=1`)
      designs = Array.isArray(data.designs) ? data.designs : []
      if (!designs.some(d => d.id === activeId)) activeId = designs[0]?.id ?? ''
      const hit = current()
      specDraft = hit?.id === current()?.id ? (specDraft || '') : ''
      if (hit !== undefined) { await loadCoverage(hit.id); await loadVersions(hit.id) }
    } catch (cause) {
      deps.toast(`加载 UI 设计失败：${String((cause as Error).message ?? cause)}`)
    }
    loading = false
    render()
    if (reloadQueued) { reloadQueued = false; void reload() }
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
        ${(() => {
          const cov = coverage.find(c => c.pageId === page.id)
          if (cov === undefined || cov.total === 0) {
            return `<div class="ud-cov ud-cov-none" data-ud="coverage" data-page="${esc(page.id)}">未测</div>`
          }
          const bad = cov.failed > 0
          return `<div class="ud-cov${bad ? ' bad' : ''}" data-ud="coverage" data-page="${esc(page.id)}" title="点击查看测试页">
            用例 ${cov.total} · <span style="color:var(--ud-green)">过 ${cov.passed}</span>${bad ? ` · <span style="color:var(--ud-red)">败 ${cov.failed}</span>` : ''}${cov.pending > 0 ? ` · 待 ${cov.pending}` : ''}
          </div>`
        })()}
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
        ${design ? `<button class="ud-btn" data-ud="archive">${(design.archivedAt ?? '') === '' ? '⌸ 归档' : '↩ 恢复'}</button>` : ''}
        <button class="ud-btn" data-ud="new">＋ 新建 UI 设计</button>
        <button class="ud-btn primary" data-ud="generate">✦ AI 生成 UI 设计</button>
      </div>
    </div>`
    if (design === undefined) {
      root.innerHTML = `<div class="ud-view">${head}<div class="ud-empty">这个项目还没有 UI 设计。点「＋ 新建 UI 设计」手工创建，或「✦ AI 生成 UI 设计」由产品设计文档自动规划页面。</div></div>`
      bind()   /* 空态也要绑定：否则顶部「＋ 新建 UI 设计 / ✦ AI 生成」按钮没有处理器 */
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
    } else if (tab === 'versions') {
      const srcLabel: Record<string, string> = { ai: 'AI 生成', manual: '手工编辑', migrate: '旧数据迁移', rollback: '回滚' }
      const rows = versions.length === 0
        ? '<div class="ud-empty">还没有版本记录。改动页面清单后会自动生成版本。</div>'
        : versions.map((v, i) => {
          const isCurrent = i === 0
          return `<div class="ud-vrow${isCurrent ? ' current' : ''}">
            <div style="flex:1">
              <b>v${v.seq}</b>${isCurrent ? ' <span class="ud-cov" style="cursor:default">当前</span>' : ''}
              <span style="color:var(--ud-text-3);font-size:10px;margin-left:6px">${esc(srcLabel[v.source] ?? v.source)}</span>
              <div style="font-size:10px;color:var(--ud-text-3);margin-top:2px">${v.pageCount} 页 · ${v.blockCount} 区块 · ${esc(String(v.createdAt).slice(0, 16))}</div>
            </div>
            ${isCurrent ? '' : `<button class="ud-btn tiny" data-ud="version-rollback" data-version="${esc(v.id)}" data-seq="${v.seq}">回滚到此版</button>`}
          </div>`
        }).join('')
      body = `<div class="ud-panel"><div class="ud-panel-head"><div><b>版本记录（${versions.length}）</b><span>页面清单变化才建版本；改主题/改名不建</span></div></div>
        <div class="ud-panel-body">${rows}</div></div>`
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
        if (act === 'generate') {
          void (async () => {
            /* 空态也能生成：先落一个空壳（pages=[]），再派发；工具写入时按 doc_key 幂等更新它。 */
            let target = design
            if (target === undefined) {
              try {
                const data = await api('/ui-designs', {
                  method: 'POST', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ design: { projectId: deps.getProjectId(), name: '页面 UI 设计', themeId: 'glass', platform: 'all', status: 'draft', pages: [] } }),
                })
                target = data.design as UiDesign
                activeId = target?.id ?? ''
                designs = Array.isArray(data.design) ? designs : [...designs.filter(d => d.id !== target?.id), target].filter(Boolean) as UiDesign[]
                render()
              } catch (cause) { deps.toast(`创建失败：${String((cause as Error).message ?? cause)}`); return }
            }
            if (target !== undefined) await runGenerate(target)
          })()
          return
        }
        if (act === 'new-theme') { deps.toast('新建主题请在 DEMO 页或主题库操作（A8 后开放）'); return }
        if (act === 'page-new') { if (design) openPageModal(design); return }
        if (act === 'page-edit') { if (design) openPageModal(design, el.getAttribute('data-page') ?? ''); return }
        if (act === 'page-optimize') { if (design) void runOptimize(design, el.getAttribute('data-page') ?? ''); return }
        if (act === 'page-demo') { if (design) deps.onBuildDemo?.(design, el.getAttribute('data-page') ?? ''); return }
        if (act === 'coverage') { deps.onOpenTest?.(); return }
        if (act === 'version-rollback') {
          if (design) void rollbackVersion(design.id, el.getAttribute('data-version') ?? '', Number(el.getAttribute('data-seq') ?? 0))
          return
        }
        if (act === 'spec-edit') { if (design) openSpecModal(design); return }
        if (act === 'archive') {
          if (design) {
            const next = (design.archivedAt ?? '') === ''
            if (!next || deps.confirm('归档后该 UI 设计会从列表隐藏（可在「显示已归档」查看）。继续？')) {
              void (async () => {
                try {
                  await api('/ui-designs/archive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: design.id, archived: next }) })
                  await reload()
                  deps.toast(next ? '已归档' : '已恢复')
                } catch (cause) { deps.toast(`操作失败：${String((cause as Error).message ?? cause)}`) }
              })()
            }
          }
          return
        }
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
    if (deps.onGenerate === undefined) {
      deps.toast('生成通道未接入（deps.onGenerate 缺失）')
      return
    }
    deps.onGenerate(design)
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
