/**
 * 页内会话：把 SessionEvent 归一化成消息，渲染在灵感右侧抽屉里。
 * 只做展示与输入，不持有会话生命周期（由 app.ts 的 sessions 适配层负责）。
 */

export type ChatKind = 'user' | 'assistant' | 'reasoning' | 'tool-call' | 'tool-result' | 'system'
export interface ChatItem {
  kind: ChatKind
  who: string
  text: string
  at: number
  /** 工具结果是否失败；reasoning 是否可折叠。 */
  failed?: boolean
  /** 工具调用 id：把 call 与 result 配成一对显示。 */
  callId?: string
}
export interface ChatMeta { teamName: string; dispatchId: string; sessionId: string; timeoutMs: number }

export interface TeamMemberState {
  id: string; name: string; role: string
  /** pending | running | done | failed | timeout | idle */
  status: string
  /** 当前任务标题（投影里有就给） */
  task: string
}

export interface TeamState {
  members: number; tasksDone: number; tasksTotal: number
  /** 1.15 C1：成员明细（看板用） */
  memberList: TeamMemberState[]
  running: number; done: number; failed: number
}

/** 从 Lead 会话的 agentTeam 投影提取成员/任务信息（读不到返回 null）。 */
export function teamStateOf(projection: any): TeamState | null {
  if (projection === null || typeof projection !== 'object') return null
  const rawMembers = Array.isArray(projection.members) ? projection.members : []
  /* 排除主理人（lead）：看板统计的是执行成员。
     旧条件 `role !== 'lead' || phase !== 'failed'` 是或关系，会把 running 的 lead 也留下，
     导致 running 计数虚高（实测 running 显示 2 而实际只有 1 个成员在跑）。 */
  const members = rawMembers.filter((member: any) => member?.role !== 'lead')
  const tasks = Array.isArray(projection.tasks) ? projection.tasks.filter((task: any) => task?.status !== 'deleted') : []
  /* 成员状态：投影里可能是 phase / status 两种字段，统一归一化 */
  const memberList: TeamMemberState[] = members.map((m: any) => {
    const raw = String(m?.status ?? m?.phase ?? 'idle')
    const status = ['pending', 'running', 'done', 'failed', 'timeout'].includes(raw) ? raw
      : raw === 'completed' ? 'done' : raw === 'error' ? 'failed' : 'idle'
    /* 找该成员当前任务（投影 tasks 里 assignee 匹配且未完成的那条） */
    const mine = tasks.find((t: any) => String(t?.assigneeId ?? t?.assignee ?? '') === String(m?.id ?? '')
      && t?.status !== 'completed')
    return {
      id: String(m?.id ?? m?.name ?? ''), name: String(m?.name ?? m?.handle ?? '成员'),
      role: String(m?.role ?? ''), status, task: String(mine?.subject ?? mine?.title ?? ''),
    }
  })
  return {
    members: members.length,
    tasksDone: tasks.filter((task: any) => task?.status === 'completed').length,
    tasksTotal: tasks.length,
    memberList,
    running: memberList.filter(m => m.status === 'running').length,
    done: memberList.filter(m => m.status === 'done').length,
    failed: memberList.filter(m => m.status === 'failed' || m.status === 'timeout').length,
  }
}

export interface ChatDeps {
  esc: (value: unknown) => string
  ic: (name: string, size?: number) => string
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onOpenSession: () => void
  /** 1.15 C2：查看该派发的事件时间线。 */
  onTimeline?: () => void
}

export interface ChatHandle {
  open(meta: ChatMeta): void
  close(): void
  ingest(event: any): void
  ingestMany(events: any[]): void
  setStatus(status: string, note?: string): void
  setTeam(state: TeamState | null): void
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

/** 只取思考块（模型只输出 reasoning 时也不能整条丢掉）。 */
function reasoningOf(message: any): string {
  const blocks = Array.isArray(message?.content) ? message.content : []
  const parts = blocks
    .filter((block: any) => block?.type === 'reasoning' && typeof block.text === 'string')
    .map((block: any) => String(block.text))
  return parts.join('\n').trim()
}

/** turn/end 的 reason 在 v4 日志里是对象（如 {kind:'completed'}），兼容字符串与对象。 */
function reasonText(reason: unknown): string {
  if (typeof reason === 'string') return reason
  if (reason !== null && typeof reason === 'object') {
    const kind = (reason as any).kind ?? (reason as any).type ?? (reason as any).reason
    return kind === undefined ? '' : String(kind)
  }
  return ''
}

/** 轻量 Markdown：标题/列表/引用/分割线/行内代码/代码块/粗体；先 esc 再替换，避免注入。 */
export function renderMarkdown(text: string, esc: (v: unknown) => string): string {
  const lines = esc(text).split('\n')
  const out: string[] = []
  let inCode = false
  for (const line of lines) {
    if (line.startsWith('```')) { inCode = !inCode; out.push(inCode ? '<pre><code>' : '</code></pre>'); continue }
    if (inCode) { out.push(`${line}\n`); continue }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) { out.push(`<b class="chat-h">${heading[2]}</b>`); continue }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push('<hr class="chat-hr">'); continue }
    const quote = /^&gt;\s?(.*)$/.exec(line)
    if (quote) { out.push(`<blockquote class="chat-quote">${quote[1]}</blockquote>`); continue }
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) { out.push(`<div class="chat-li">• ${bullet[1]}</div>`); continue }
    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(line)
    if (ordered) { out.push(`<div class="chat-li">${ordered[1]}. ${ordered[2]}</div>`); continue }
    out.push(line === '' ? '<div class="chat-gap"></div>' : `<div>${line}</div>`)
  }
  if (inCode) out.push('</code></pre>')
  return out.join('')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
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
    if (text !== '') {
      const who = String(data?.message?.source?.name ?? data?.message?.source?.agentName ?? '主理人')
      return { kind: 'assistant', who, text, at }
    }
    /* 只有思考块时也展示，否则「模型在思考」阶段抽屉一直空白 */
    const think = reasoningOf(data?.message)
    if (think !== '') return { kind: 'reasoning', who: '思考', text: think, at }
    return null
  }
  if (type === 'tool/call') {
    const name = String(data?.name ?? '工具')
    /* 命令类工具直接把 command 摘出来；其余保留完整参数供展开查看 */
    let args = String(data?.arguments ?? '')
    let brief = args
    try {
      const parsed = JSON.parse(args)
      brief = String(parsed?.command ?? parsed?.description ?? parsed?.path ?? parsed?.query ?? args)
    } catch { /* 非 JSON 就原样展示 */ }
    return { kind: 'tool-call', who: name, text: brief.slice(0, 600), at, callId: String(data?.callId ?? '') }
  }
  if (type === 'tool/result') {
    const message = data?.message ?? {}
    const failed = message?.isError === true || Boolean(data?.reason)
    const body = failed ? reasonText(data?.reason) || '执行失败' : textOf(message)
    return {
      kind: 'tool-result', who: failed ? '工具失败' : '工具完成', text: body.slice(0, 1200), at, failed,
      callId: String(message?.toolCallId ?? message?.source?.callId ?? ''),
    }
  }
  if (type === 'turn/end') {
    const reason = reasonText(data?.reason)
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
  let team: TeamState | null = null
  let open = false

  host.innerHTML = `<div class="chat-head">
      <span class="chat-dot"></span><b class="chat-title">页内会话</b><span class="chat-status"></span>
      <span class="chat-count"></span><span class="grow"></span>
      <button class="btn tiny" data-chat-act="open">在会话中打开</button>
      <button class="btn tiny" data-chat-act="retry">重试</button>
      <button class="btn tiny" data-chat-act="timeline">时间线</button>
      <button class="btn tiny" data-chat-act="stop">停止</button>
      <button class="icon-btn" data-chat-act="close" title="收起">×</button>
    </div>
    <div class="chat-board" id="agent-chat-board"></div>
    <div class="chat-list" id="agent-chat-list"></div>
    <div class="chat-compose"><textarea id="agent-chat-input" rows="2" placeholder="追加指令，Enter 发送（Shift+Enter 换行）"></textarea>
      <button class="btn-primary" data-chat-act="send">发送</button></div>`

  const list = host.querySelector('#agent-chat-list') as HTMLElement
  const input = host.querySelector('#agent-chat-input') as HTMLTextAreaElement
  const title = host.querySelector('.chat-title') as HTMLElement
  const statusEl = host.querySelector('.chat-status') as HTMLElement
  const countEl = host.querySelector('.chat-count') as HTMLElement
  const boardEl = host.querySelector('#agent-chat-board') as HTMLElement

  /** 1.15 C1：成员看板——谁在跑、跑什么、成功/失败各几个。 */
  function paintBoard(): void {
    if (team === null || team.memberList.length === 0) { boardEl.innerHTML = ''; boardEl.style.display = 'none'; return }
    boardEl.style.display = ''
    const statusLabel: Record<string, string> = {
      pending: '待启动', running: '运行中', done: '已完成', failed: '失败', timeout: '超时', idle: '空闲',
    }
    const cards = team.memberList.map(m => `
      <div class="chat-board-card ${m.status}">
        <span class="chat-board-dot"></span>
        <div class="chat-board-main">
          <b>${deps.esc(m.name)}</b>
          <span class="chat-board-status">${statusLabel[m.status] ?? m.status}</span>
          ${m.task !== '' ? `<div class="chat-board-task">${deps.esc(m.task)}</div>` : ''}
        </div>
      </div>`).join('')
    boardEl.innerHTML = `<div class="chat-board-head">
        <b>${team.members}</b> 成员 ·
        <span class="ok">${team.done} 完成</span>${team.running > 0 ? ` · <span class="run">${team.running} 运行中</span>` : ''}${team.failed > 0 ? ` · <span class="bad">${team.failed} 失败</span>` : ''}
        ${team.tasksTotal > 0 ? ` · 任务 ${team.tasksDone}/${team.tasksTotal}` : ''}
      </div><div class="chat-board-cards">${cards}</div>`
  }

  function paintStatus(): void {
    statusEl.textContent = status
    statusEl.className = `chat-status ${status}`
    /* 只保留投影口径：running/total 这套 setCounts 从未被任何地方调用（死代码），
       曾经会让人以为「成员 N/M」在某些场景可用，实际永远为空。要恢复请先接上数据源。 */
    countEl.textContent = team !== null ? `成员 ${team.members} · 任务 ${team.tasksDone}/${team.tasksTotal}` : ''
    paintBoard()
    host.classList.toggle('is-running', status === 'running' || status === 'dispatching')
    if (note !== '') statusEl.title = note
  }

  /** 每条消息按类型渲染：用户气泡 / 助手正文 / 思考折叠 / 工具卡片 / 系统提示。 */
  function itemHtml(item: ChatItem): string {
    const time = new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    if (item.kind === 'user') {
      return `<div class="chat-turn user"><div class="chat-meta"><b>你</b><span>${time}</span></div>
        <div class="chat-body chat-user-body">${renderMarkdown(item.text, deps.esc)}</div></div>`
    }
    if (item.kind === 'assistant') {
      return `<div class="chat-turn assistant"><div class="chat-meta"><b>${deps.esc(item.who)}</b><span>${time}</span></div>
        <div class="chat-body">${renderMarkdown(item.text, deps.esc)}</div></div>`
    }
    if (item.kind === 'reasoning') {
      const preview = item.text.replace(/\s+/g, ' ').slice(0, 80)
      return `<details class="chat-reasoning"><summary><span class="chat-tag think">思考</span><span class="chat-reason-preview">${deps.esc(preview)}…</span></summary>
        <div class="chat-body chat-reason-body">${renderMarkdown(item.text, deps.esc)}</div></details>`
    }
    if (item.kind === 'tool-call') {
      return `<div class="chat-tool call"><div class="chat-tool-head"><span class="chat-tag tool">调用</span><b>${deps.esc(item.who)}</b><span class="chat-time">${time}</span></div>
        <pre class="chat-tool-body">${deps.esc(item.text)}</pre></div>`
    }
    if (item.kind === 'tool-result') {
      const cls = item.failed === true ? 'err' : 'ok'
      const label = item.failed === true ? '失败' : '完成'
      return `<div class="chat-tool result ${cls}"><div class="chat-tool-head"><span class="chat-tag ${cls}">${label}</span><b>${deps.esc(item.who)}</b><span class="chat-time">${time}</span></div>
        <pre class="chat-tool-body">${deps.esc(item.text)}</pre></div>`
    }
    return `<div class="chat-turn system"><span class="chat-tag sys">${deps.esc(item.who)}</span><span>${deps.esc(item.text)}</span></div>`
  }

  /** 相邻的 call/result 归到一组，视觉上是一个工具块。 */
  function append(item: ChatItem): void {
    items.push(item)
    if (items.length > 500) items = items.slice(-500)
    const wrap = document.createElement('div')
    wrap.innerHTML = itemHtml(item)
    list.appendChild(wrap.firstElementChild ?? wrap)
    const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 80
    if (stick) list.scrollTop = list.scrollHeight
    paintEmpty()
  }

  /** 空状态：避免抽屉打开后一片空白，看不出是没输出还是没接上 */
  function paintEmpty(): void {
    const empty = list.querySelector('.idea-chat-empty')
    if (items.length > 0) { if (empty !== null) empty.remove(); return }
    if (empty !== null) return
    const div = document.createElement('div')
    div.className = 'idea-chat-empty'
    div.textContent = status === 'running' || status === 'dispatching'
      ? '已连接会话，等待输出…（团队正在规划，通常十几秒后出现第一条）'
      : '还没有会话内容。点「生成」后这里会实时显示团队消息。'
    list.appendChild(div)
  }

  host.addEventListener('click', event => {
    const target = (event.target as HTMLElement | null)?.closest('[data-chat-act]') as HTMLElement | null
    if (target === null) return
    const act = target.getAttribute('data-chat-act')
    if (act === 'send') { send() }
    else if (act === 'stop') { deps.onStop() }
    else if (act === 'retry') { deps.onRetry() }
    else if (act === 'timeline') { deps.onTimeline?.() }
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
    paintEmpty()
  }

  function close(): void {
    open = false
    host.style.display = 'none'
  }

  /** 事件按 seq 去重：读历史 + 订阅实时可能拿到同一批事件。 */
  const seenSeq = new Set<number>()

  return {
    open: openDrawer,
    close,
    isOpen: () => open,
    ingest(event) {
      const seq = Number(event?.seq)
      if (Number.isFinite(seq)) {
        if (seenSeq.has(seq)) return
        seenSeq.add(seq)
      }
      const item = chatItemOf(event)
      if (item !== null) append(item)
    },
    ingestMany(events) { for (const event of events) this.ingest(event) },
    setStatus(next, nextNote = '') { status = next; note = nextNote; paintStatus(); paintEmpty() },
    setCounts(nextRunning, nextTotal) { running = nextRunning; total = nextTotal; paintStatus() },
    setTeam(state) { team = state; paintStatus() },
    clear() { items = []; seenSeq.clear(); list.innerHTML = ''; paintEmpty() },
    destroy() { host.innerHTML = ''; items = []; seenSeq.clear() },
  }
}
