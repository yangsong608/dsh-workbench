/**
 * dsh-workbench · 浏览器半侧入口
 *
 * 注册：
 *  - main 面板 key=workbench（个人工作台主体，Shadow DOM 隔离）
 *  - 侧栏「工作台」入口：克隆 DSH 原生「新建会话」按钮，与 dsh-cron 的「定时任务」
 *    放在同一组（同为 sidebar-entry），因此尺寸、图标、文字、收起行为完全一致。
 *
 * 工作台是独立面板：不抢启动落点，用户从侧栏随时进入。
 */
import { createElement, useEffect, useRef, type ReactElement } from 'react'
import { mountWorkbench, type WorkbenchHandle } from './app'

const PANEL_ID = 'workbench'
const ENTRY_ATTR = 'data-dsh-workbench-entry'
const ENTRY_CLASS = 'dsh-workbench-entry-clone'
const SIDEBAR_HANDLE = '__dshWorkbenchSidebarEntry'

const ENTRY_CSS = `
.${ENTRY_CLASS}{display:flex;align-items:center;gap:8px}
.dsh-workbench-entry-icon{display:flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px}
.dsh-workbench-entry-label{text-overflow:ellipsis;overflow:hidden}
[data-sidebar-collapsed] .dsh-workbench-entry-label,
[data-dsh-frame][data-sidebar-collapsed] .dsh-workbench-entry-label{display:none}
`

/** 工作台容器：占满面板高度；内部由 mountWorkbench 建立 Shadow DOM。 */
function WorkbenchPanel(props: { ctx: ClientContext }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (el === null) return undefined
    let handle: WorkbenchHandle | null = null
    try {
      handle = mountWorkbench(el, props.ctx)
    } catch (cause) {
      console.warn('[dsh-workbench] 挂载失败：', String(cause))
    }
    return () => {
      try { handle?.destroy() } catch (cause) { console.warn('[dsh-workbench] 卸载失败：', String(cause)) }
    }
  }, [])
  return createElement('div', {
    ref,
    'data-dsh-workbench-panel': '',
    style: { height: '100%', minHeight: '620px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  })
}

interface SlotEntry { options: Record<string, unknown> }
interface ClientContext {
  slots: {
    inject(slot: string, contribute: () => unknown): unknown
    register(options: Record<string, unknown>, component: unknown): unknown
    entries(slot: string): SlotEntry[]
  }
  layout?: { selectPanel(panelId: string | null): void }
}

interface SidebarController { dispose(): void }

function ensureCss(): void {
  if (document.getElementById('dsh-workbench-entry-css') !== null) return
  const style = document.createElement('style')
  style.id = 'dsh-workbench-entry-css'
  style.textContent = ENTRY_CSS
  document.head.appendChild(style)
}

/** 原生「新建会话」按钮（带 newSession 类、排除 label 变体）。 */
function nativeButton(): HTMLButtonElement | undefined {
  for (const node of Array.from(document.querySelectorAll<HTMLButtonElement>('button[class*="newSession"]'))) {
    if (String(node.className).indexOf('newSessionLabel') === -1) return node
  }
  return undefined
}

/**
 * 克隆侧栏入口，插到 dsh-cron 的「定时任务」之后；cron 尚未挂载时先跟在
 * 「新建会话」后面，MutationObserver 会在 cron 出现后把工作台移到它后面。
 */
function mountSidebarEntry(ctx: ClientContext): SidebarController {
  ensureCss()
  const previous = (window as unknown as Record<string, SidebarController | undefined>)[SIDEBAR_HANDLE]
  previous?.dispose()
  document.querySelectorAll(`[${ENTRY_ATTR}]`).forEach(node => node.remove())

  let entry: HTMLButtonElement | null = null
  let disposed = false

  const place = (): void => {
    if (disposed) return
    const target = nativeButton()
    if (target === undefined || target.parentElement === null) return
    if (entry === null) {
      entry = target.cloneNode(true) as HTMLButtonElement
      entry.className = `${String(target.className)} ${ENTRY_CLASS}`
      entry.setAttribute(ENTRY_ATTR, '')
      entry.setAttribute('data-dsh-plugin', 'dsh-workbench')
      entry.setAttribute('data-dsh-part', 'sidebar-entry')
      entry.setAttribute('aria-label', '工作台')
      entry.removeAttribute('id')
      entry.removeAttribute('aria-keyshortcuts')
      entry.innerHTML = ''
      const icon = document.createElement('span')
      icon.className = 'dsh-workbench-entry-icon'
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>'
      const label = document.createElement('span')
      label.className = 'dsh-workbench-entry-label'
      label.textContent = '工作台'
      entry.appendChild(icon)
      entry.appendChild(label)
      entry.addEventListener('click', event => {
        event.preventDefault()
        event.stopPropagation()
        try { ctx.layout?.selectPanel(PANEL_ID) } catch (cause) { console.warn('[dsh-workbench] 打开面板失败：', String(cause)) }
      })
    }
    const cron = document.querySelector('[data-dsh-plugin="dsh-cron"][data-dsh-part="sidebar-entry"]')
    const anchor = cron instanceof HTMLElement ? cron : target
    if (entry.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', entry)
  }

  const observer = new MutationObserver(place)
  observer.observe(document.body, { childList: true, subtree: true })
  const timer = window.setInterval(place, 2000)
  place()

  const controller: SidebarController = {
    dispose(): void {
      disposed = true
      observer.disconnect()
      window.clearInterval(timer)
      entry?.remove()
      entry = null
    },
  }
  ;(window as unknown as Record<string, SidebarController | undefined>)[SIDEBAR_HANDLE] = controller
  return controller
}

const PENDING_REPAIR_KEY = 'dsh-workbench:pending-repair'

function wait(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

interface PendingRepair { prompt: string; bugIds: string[]; project: string; previousSessionId?: string; at: number }

/**
 * 消费 queueRepairSession 落下的待发送修复提示词：等待新会话输入框出现，
 * 用 Lexical 的 beforeinput 写入提示词并点击发送；随后把 Bug 标记为 doing
 * 并记录会话 id。Reload 前已经切到工作区新会话，这里只做输入与提交。
 */
async function consumePendingRepair(): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_REPAIR_KEY)
  if (raw === null) return
  let pending: PendingRepair
  try { pending = JSON.parse(raw) as PendingRepair } catch { sessionStorage.removeItem(PENDING_REPAIR_KEY); return }
  if (typeof pending.prompt !== 'string' || pending.prompt === '' || Date.now() - Number(pending.at ?? 0) > 120_000) {
    sessionStorage.removeItem(PENDING_REPAIR_KEY)
    return
  }
  let editor: HTMLElement | null = null
  for (let attempt = 0; attempt < 150; attempt += 1) {
    editor = document.querySelector<HTMLElement>('[data-composer-input]')
    if (editor !== null) break
    await wait(100)
  }
  if (editor === null) {
    console.warn('[dsh-workbench] 修复会话输入框未出现，修复提示词保留在剪贴板')
    sessionStorage.removeItem(PENDING_REPAIR_KEY)
    return
  }
  const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
  if (typeof pending.previousSessionId === 'string' && pending.previousSessionId !== '' && sessionId === pending.previousSessionId) {
    console.warn('[dsh-workbench] 新会话没有切换成功，取消自动发送；修复提示词保留在剪贴板')
    sessionStorage.removeItem(PENDING_REPAIR_KEY)
    return
  }
  editor.focus()
  if (!(editor.innerText ?? '').includes('Bug 修复任务')) {
    editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: pending.prompt, bubbles: true, cancelable: true }))
    await wait(350)
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const send = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.getAttribute('aria-label') === '发送消息' && btn.offsetParent !== null && !btn.disabled)
    if (send !== undefined) { send.click(); break }
    await wait(100)
  }
  sessionStorage.removeItem(PENDING_REPAIR_KEY)
  try {
    const res = await fetch('/workbench-api/bugs')
    const data = await res.json() as { bugs?: Array<Record<string, unknown>> }
    for (const bugId of pending.bugIds) {
      const bug = data.bugs?.find(item => item.id === bugId)
      if (bug === undefined) continue
      const next = { ...bug, status: bug.status === 'resolved' ? 'resolved' : 'doing', aiThreadId: sessionId || 'new-session' }
      await fetch('/workbench-api/bugs', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bug: next }),
      })
    }
  } catch (cause) {
    console.warn('[dsh-workbench] 修复会话已发送，但 Bug 状态回写失败：', cause)
  }
}

const PENDING_PRODUCT_KEY = 'dsh-workbench:pending-product'

async function consumePendingProduct(): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_PRODUCT_KEY)
  if (raw === null) return
  let pending: { prompt?: string; previousSessionId?: string; at?: number }
  try { pending = JSON.parse(raw) } catch { sessionStorage.removeItem(PENDING_PRODUCT_KEY); return }
  if (typeof pending.prompt !== 'string' || pending.prompt === '' || Date.now() - Number(pending.at ?? 0) > 120_000) {
    sessionStorage.removeItem(PENDING_PRODUCT_KEY)
    return
  }
  let editor: HTMLElement | null = null
  for (let attempt = 0; attempt < 150; attempt += 1) {
    editor = document.querySelector<HTMLElement>('[data-composer-input]')
    if (editor !== null) break
    await wait(100)
  }
  if (editor === null) { sessionStorage.removeItem(PENDING_PRODUCT_KEY); return }
  const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
  if (pending.previousSessionId && sessionId === pending.previousSessionId) {
    console.warn('[dsh-workbench] 产品新会话未切换，取消自动发送')
    sessionStorage.removeItem(PENDING_PRODUCT_KEY)
    return
  }
  editor.focus()
  if (!(editor.innerText ?? '').includes('产品')) {
    editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: pending.prompt, bubbles: true, cancelable: true }))
    await wait(350)
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const send = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.getAttribute('aria-label') === '发送消息' && btn.offsetParent !== null && !btn.disabled)
    if (send !== undefined) { send.click(); break }
    await wait(100)
  }
  sessionStorage.removeItem(PENDING_PRODUCT_KEY)
}

const PENDING_NOTE_KEY = 'dsh-workbench:pending-note'

async function consumePendingNote(): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_NOTE_KEY)
  if (raw === null) return
  let pending: { prompt?: string; previousSessionId?: string; at?: number }
  try { pending = JSON.parse(raw) } catch { sessionStorage.removeItem(PENDING_NOTE_KEY); return }
  if (typeof pending.prompt !== 'string' || pending.prompt === '' || Date.now() - Number(pending.at ?? 0) > 120_000) {
    sessionStorage.removeItem(PENDING_NOTE_KEY)
    return
  }
  let editor: HTMLElement | null = null
  for (let attempt = 0; attempt < 150; attempt += 1) {
    editor = document.querySelector<HTMLElement>('[data-composer-input]')
    if (editor !== null) break
    await wait(100)
  }
  if (editor === null) { sessionStorage.removeItem(PENDING_NOTE_KEY); return }
  const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
  if (pending.previousSessionId && sessionId === pending.previousSessionId) {
    console.warn('[dsh-workbench] 笔记编辑会话未切换，取消自动发送')
    sessionStorage.removeItem(PENDING_NOTE_KEY)
    return
  }
  editor.focus()
  if (!(editor.innerText ?? '').includes('笔记完善任务')) {
    editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: pending.prompt, bubbles: true, cancelable: true }))
    await wait(350)
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const send = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.getAttribute('aria-label') === '发送消息' && btn.offsetParent !== null && !btn.disabled)
    if (send !== undefined) { send.click(); break }
    await wait(100)
  }
  sessionStorage.removeItem(PENDING_NOTE_KEY)
}

const PENDING_TEST_KEY = 'dsh-workbench:pending-test'

async function consumePendingTest(): Promise<void> {
  const raw = sessionStorage.getItem(PENDING_TEST_KEY)
  if (raw === null) return
  let pending: { prompt?: string; previousSessionId?: string; at?: number }
  try { pending = JSON.parse(raw) } catch { sessionStorage.removeItem(PENDING_TEST_KEY); return }
  if (typeof pending.prompt !== 'string' || pending.prompt === '' || Date.now() - Number(pending.at ?? 0) > 120_000) {
    sessionStorage.removeItem(PENDING_TEST_KEY)
    return
  }
  let editor: HTMLElement | null = null
  for (let attempt = 0; attempt < 150; attempt += 1) {
    editor = document.querySelector<HTMLElement>('[data-composer-input]')
    if (editor !== null) break
    await wait(100)
  }
  if (editor === null) { sessionStorage.removeItem(PENDING_TEST_KEY); return }
  const sessionId = document.querySelector('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
  if (pending.previousSessionId && sessionId === pending.previousSessionId) {
    console.warn('[dsh-workbench] 测试用例生成会话未切换，取消自动发送')
    sessionStorage.removeItem(PENDING_TEST_KEY)
    return
  }
  editor.focus()
  if (!(editor.innerText ?? '').includes('测试用例生成任务')) {
    editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: pending.prompt, bubbles: true, cancelable: true }))
    await wait(350)
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const send = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(btn => btn.getAttribute('aria-label') === '发送消息' && btn.offsetParent !== null && !btn.disabled)
    if (send !== undefined) { send.click(); break }
    await wait(100)
  }
  sessionStorage.removeItem(PENDING_TEST_KEY)
}

/**
 * DSH 的 main 是「面板/会话」共用的插槽。工作台作为自定义 main 面板打开后，
 * 直接点侧栏会话仍会保留 workbench 面板 key，导致会话区渲染为空。
 * 在捕获阶段先清空面板选择，再让 DSH 自己的会话点击继续切换。
 */
const SESSION_RESET_HANDLE = '__dshWorkbenchSessionReset'

function installSessionPanelReset(ctx: ClientContext): () => void {
  const previous = (window as unknown as Record<string, (() => void) | undefined>)[SESSION_RESET_HANDLE]
  previous?.()
  const isSessionTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false
    const row = target.closest('[data-row-key^="session:"], [data-session-id]')
    if (row !== null) return true
    const button = target.closest('button')
    return button !== null && (button.getAttribute('aria-label') === '新建会话' || button.textContent?.trim() === '新建会话')
  }
  const closePanel = (event: Event): void => {
    if (!isSessionTarget(event.target)) return
    try { ctx.layout?.selectPanel(null) } catch (cause) { console.warn('[dsh-workbench] 退出面板失败：', String(cause)) }
    window.setTimeout(() => {
      try {
        if (document.querySelector('[data-dsh-workbench-panel]') !== null) ctx.layout?.selectPanel(null)
      } catch { /* ignore */ }
    }, 80)
  }
  document.addEventListener('click', closePanel, true)
  const dispose = (): void => { document.removeEventListener('click', closePanel, true) }
  ;(window as unknown as Record<string, (() => void) | undefined>)[SESSION_RESET_HANDLE] = dispose
  return dispose
}

export const inject = ['slots', 'layout']

export function apply(ctx: ClientContext): void {
  const Panel = (): ReactElement => createElement(WorkbenchPanel, { ctx })
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    inject: () => ({}),
  }, Panel))

  // 不再注册 sidebar.panellist：工作台入口克隆「新建会话」，与「定时任务」同一套样式。
  mountSidebarEntry(ctx)
  installSessionPanelReset(ctx)
  window.setTimeout(() => { void consumePendingRepair() }, 600)
  window.setTimeout(() => { void consumePendingProduct() }, 700)
  window.setTimeout(() => { void consumePendingNote() }, 800)
  window.setTimeout(() => { void consumePendingTest() }, 900)
}
