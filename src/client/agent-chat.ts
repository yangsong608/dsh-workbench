/**
 * 页内会话：把 SessionEvent 归一化成消息，渲染在灵感右侧抽屉里。
 * 只做展示与输入，不持有会话生命周期（由 app.ts 的 sessions 适配层负责）。
 */

export type ChatKind = 'user' | 'assistant' | 'tool' | 'system'
export interface ChatItem { kind: ChatKind; who: string; text: string; at: number }
export interface ChatMeta { teamName: string; dispatchId: string; sessionId: string; timeoutMs: number }

export interface ChatDeps {
  esc: (value: unknown) => string
  ic: (name: string, size?: number) => string
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onOpenSession: () => void
}

export interface ChatHandle {
  open(meta: ChatMeta): void
  close(): void
  ingest(event: any): void
  ingestMany(events: any[]): void
  setStatus(status: string, note?: string): void
  setCounts(running: number, total: number): void
  clear(): void
  destroy(): void
  isOpen(): boolean
}

function textOf(message: any): string {
  const blocks = Array.isArray(message?.content) ? message.content : []
  const parts: string[] = []
  for (const block of blocks) {
    if (typeof block === 'string') parts.push(block)
    else if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  if (parts.length > 0) return parts.join('\n').trim()
  return typeof message?.text === 'string' ? message.text.trim() : ''
}

/** 极简 Markdown：仅标题/列表/行内代码/代码块/链接；先 esc 再替换，避免注入。 */
export function renderMarkdown(text: string, esc: (v: unknown) => string): string {
  const lines = esc(text).split('\n')
  const out: string[] = []
  let inCode = false
  for (const line of lines) {
    if (line.startsWith('```')) { inCode = !inCode; out.push(inCode ? '<pre><code>' : '</code></pre>'); continue }
    if (inCode) { out.push(`${line}\n`); continue }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) { out.push(`<b class="chat-h">${heading[2]}</b>`); continue }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) { out.push(`<div class="chat-li">• ${bullet[1]}</div>`); continue }
    out.push(line === '' ? '<div class="chat-gap"></div>' : `<div>${line}</div>`)
  }
  if (inCode) out.push('</code></pre>')
  return out.join('').replace(/`([^`]+)`/g, '<code>$1</code>')
}

/** 事件 → 聊天项；未知事件返回 null。 */
export function chatItemOf(event: any): ChatItem | null {
  const type = String(event?.type ?? '')
  const data = event?.data ?? {}
  const at = Number(event?.time ?? Date.now())
  if (type === 'user/message') {
    const text = textOf(data?.message ?? data)
    return text === '' ? null : { kind: 'user', who: '你', text, at }
  }
  if (type === 'assistant/message') {
    const text = textOf(data?.message)
    if (text === '') return null
    const who = String(data?.message?.source?.name ?? data?.message?.source?.agentName ?? '主理人')
    return { kind: 'assistant', who, text, at }
  }
  if (type === 'tool/call') {
    const name = String(data?.name ?? '工具')
    const args = String(data?.arguments ?? '').slice(0, 160)
    return { kind: 'tool', who: name, text: args, at }
  }
  if (type === 'tool/result') {
    const message = data?.message ?? {}
    const failed = message?.isError === true || Boolean(data?.reason)
    return { kind: 'tool', who: failed ? '工具失败' : '工具完成', text: failed ? String(data?.reason ?? '执行失败').slice(0, 200) : textOf(message).slice(0, 200), at }
  }
  if (type === 'turn/end') {
    const reason = String(data?.reason ?? '')
    if (reason === 'aborted') return { kind: 'system', who: '系统', text: '本轮被中止', at }
    if (reason !== '' && reason !== 'completed') return { kind: 'system', who: '系统', text: `本轮结束：${reason}`, at }
    return null
  }
  return null
}

export function createAgentChat(host: HTMLElement, deps: ChatDeps): ChatHandle {
  let items: ChatItem[] = []
  let meta: ChatMeta | null = null
  let status = 'idle'
  let note = ''
  let running = 0
  let total = 0
  let open = false

  host.innerHTML = `<div class="chat-head">
      <span class="chat-dot"></span><b class="chat-title">页内会话</b><span class="chat-status"></span>
      <span class="chat-count"></span><span class="grow"></span>
      <button class="btn tiny" data-chat-act="open">在会话中打开</button>
      <button class="btn tiny" data-chat-act="retry">重试</button>
      <button class="btn tiny" data-chat-act="stop">停止</button>
      <button class="icon-btn" data-chat-act="close" title="收起">×</button>
    </div>
    <div class="chat-list" id="agent-chat-list"></div>
    <div class="chat-compose"><textarea id="agent-chat-input" rows="2" placeholder="追加指令，Enter 发送（Shift+Enter 换行）"></textarea>
      <button class="btn-primary" data-chat-act="send">发送</button></div>`

  const list = host.querySelector('#agent-chat-list') as HTMLElement
  const input = host.querySelector('#agent-chat-input') as HTMLTextAreaElement
  const title = host.querySelector('.chat-title') as HTMLElement
  const statusEl = host.querySelector('.chat-status') as HTMLElement
  const countEl = host.querySelector('.chat-count') as HTMLElement

  function paintStatus(): void {
    statusEl.textContent = status
    statusEl.className = `chat-status ${status}`
    countEl.textContent = total > 0 ? `成员 ${running}/${total}` : ''
    host.classList.toggle('is-running', status === 'running' || status === 'dispatching')
    if (note !== '') statusEl.title = note
  }

  function itemHtml(item: ChatItem): string {
    const body = renderMarkdown(item.text, deps.esc)
    if (item.kind === 'tool') {
      return `<div class="chat-item tool"><span class="chat-who">${deps.esc(item.who)}</span><span class="chat-args">${deps.esc(item.text)}</span></div>`
    }
    if (item.kind === 'system') return `<div class="chat-item system">${deps.esc(item.text)}</div>`
    return `<div class="chat-item ${item.kind}"><div class="chat-who">${deps.esc(item.who)}</div><div class="chat-body">${body}</div></div>`
  }

  function append(item: ChatItem): void {
    items.push(item)
    if (items.length > 500) items = items.slice(-500)
    const wrap = document.createElement('div')
    wrap.innerHTML = itemHtml(item)
    list.appendChild(wrap.firstElementChild ?? wrap)
    list.scrollTop = list.scrollHeight
  }

  host.addEventListener('click', event => {
    const target = (event.target as HTMLElement | null)?.closest('[data-chat-act]') as HTMLElement | null
    if (target === null) return
    const act = target.getAttribute('data-chat-act')
    if (act === 'send') { send() }
    else if (act === 'stop') { deps.onStop() }
    else if (act === 'retry') { deps.onRetry() }
    else if (act === 'open') { deps.onOpenSession() }
    else if (act === 'close') { close() }
  })

  function send(): void {
    const text = input.value.trim()
    if (text === '') return
    input.value = ''
    deps.onSend(text)
  }

  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  })

  function openDrawer(next: ChatMeta): void {
    meta = next
    open = true
    host.style.display = ''
    title.textContent = `页内会话 · ${next.teamName}`
    paintStatus()
  }

  function close(): void {
    open = false
    host.style.display = 'none'
  }

  return {
    open: openDrawer,
    close,
    isOpen: () => open,
    ingest(event) {
      const item = chatItemOf(event)
      if (item !== null) append(item)
    },
    ingestMany(events) { for (const event of events) this.ingest(event) },
    setStatus(next, nextNote = '') { status = next; note = nextNote; paintStatus() },
    setCounts(nextRunning, nextTotal) { running = nextRunning; total = nextTotal; paintStatus() },
    clear() { items = []; list.innerHTML = '' },
    destroy() { host.innerHTML = ''; items = [] },
  }
}
