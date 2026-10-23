/**
 * 智能体团队 · 纯函数层
 *
 * 只做校验、默认团队种子、kickoff 提示词拼装；不碰数据库、不碰 HTTP。
 * 与灵感模块同样的约定：文本一律 clamp，未知字段忽略，失败返回 issues 而不是抛错。
 */

export const AGENT_LIMITS = {
  teamName: 40,
  teamDesc: 200,
  memberName: 12,
  handle: 23,
  intro: 200,
  prompt: 4000,
  membersPerTeam: 12,
  teams: 20,
  toolsPerMember: 32,
  dispatchGoal: 2000,
  dispatchTimeoutMs: 15 * 60 * 1000,
  memberTimeoutMs: 5 * 60 * 1000,
  maxRunningMembers: 3,
} as const

export const MEMBER_ROLES = ['lead', 'product', 'architect', 'frontend', 'backend', 'qa', 'reviewer', 'custom'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]
export const FILE_WRITES = ['read', 'write'] as const
export type FileWrite = (typeof FILE_WRITES)[number]
export const MEMORY_SCOPES = ['none', 'personal', 'project', 'team', 'all'] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]
export const DISPATCH_STATUS = ['dispatching', 'running', 'done', 'partial', 'failed', 'timeout', 'cancelled'] as const
export type DispatchStatus = (typeof DISPATCH_STATUS)[number]

export interface CustomIssue { code: string; message: string }

export interface MemberInput {
  id?: string
  name?: unknown
  handle?: unknown
  role?: unknown
  intro?: unknown
  systemPrompt?: unknown
  model?: unknown
  provider?: unknown
  tools?: unknown
  skills?: unknown
  mcp?: unknown
  memoryScope?: unknown
  concurrency?: unknown
  fileWrite?: unknown
  enabled?: unknown
}

export interface AgentMember {
  id: string
  name: string
  handle: string
  role: MemberRole
  intro: string
  systemPrompt: string
  model: string
  provider: string
  tools: string[]
  skills: string[]
  mcp: string[]
  memoryScope: MemoryScope
  concurrency: number
  fileWrite: FileWrite
  enabled: boolean
}

export function clampText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, limit)
}

/** 中文名无法直接做 DSH teammate 的 name，用稳定 slug 作为会话内名字。 */
export function handleOf(name: string, fallback = ''): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (base !== '' && /^[a-z]/.test(base)) return base.slice(0, AGENT_LIMITS.handle)
  return fallback !== '' ? fallback : `m-${Math.random().toString(36).slice(2, 7)}`
}

export function validateMember(raw: MemberInput, existing: AgentMember[] = []): { member: AgentMember | null; issues: CustomIssue[] } {
  const issues: CustomIssue[] = []
  const name = clampText(raw.name, AGENT_LIMITS.memberName)
  if (name === '') issues.push({ code: 'NAME_REQUIRED', message: '成员名称不能为空' })
  const handle = clampText(raw.handle, AGENT_LIMITS.handle) || handleOf(name)
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(handle)) issues.push({ code: 'HANDLE_INVALID', message: '成员 handle 只能是小写字母/数字/短横线' })
  const clash = existing.find(m => m.id !== raw.id && (m.name === name || m.handle === handle))
  if (clash !== undefined) issues.push({ code: 'MEMBER_DUPLICATE', message: `成员「${clash.name}」已存在` })
  const role = (MEMBER_ROLES as readonly string[]).includes(String(raw.role)) ? String(raw.role) as MemberRole : 'custom'
  const fileWrite: FileWrite = (FILE_WRITES as readonly string[]).includes(String(raw.fileWrite))
    ? String(raw.fileWrite) as FileWrite
    : role === 'frontend' || role === 'backend' ? 'write' : 'read'
  const memoryScope: MemoryScope = (MEMORY_SCOPES as readonly string[]).includes(String(raw.memoryScope))
    ? String(raw.memoryScope) as MemoryScope
    : 'project'
  const tools = Array.isArray(raw.tools)
    ? raw.tools.map(item => clampText(item, 40)).filter(Boolean).slice(0, AGENT_LIMITS.toolsPerMember)
    : []
  const skills = Array.isArray(raw.skills) ? raw.skills.map(item => clampText(item, 40)).filter(Boolean).slice(0, 20) : []
  const mcp = Array.isArray(raw.mcp) ? raw.mcp.map(item => clampText(item, 60)).filter(Boolean).slice(0, 20) : []
  const concurrency = Math.min(4, Math.max(1, Number(raw.concurrency) || 1))
  if (issues.length > 0) return { member: null, issues }
  return {
    member: {
      id: clampText(raw.id, 64) || `am-${Math.random().toString(36).slice(2, 10)}`,
      name,
      handle,
      role,
      intro: clampText(raw.intro, AGENT_LIMITS.intro),
      systemPrompt: clampText(raw.systemPrompt, AGENT_LIMITS.prompt),
      model: clampText(raw.model, 80),
      provider: clampText(raw.provider, 40),
      tools,
      skills,
      mcp,
      memoryScope,
      concurrency,
      fileWrite,
      enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    },
    issues,
  }
}

/** 默认「产品研发」7 人；提示词按 DSH/Agent Teams 的实际约束写，强调工具契约与产物边界。 */
export function defaultMembers(): Array<Omit<AgentMember, 'id'>> {
  const rows: Array<[string, string, MemberRole, string, string, FileWrite]> = [
    [
      '主理人', 'lead', 'lead',
      '拆任务、建任务板、派成员、验收与汇总；不直接改文件',
      [
        '你是「{team}」的主理人（Lead），负责把一次灵感发散变成可验收的结果。',
        '职责：① 先用 team_task_create 建任务板（每个方向/模块一条，写清验收标准）；② 再按职责用 spawn_teammate 创建成员（name 用给定的 handle，context 用 fresh）；③ 把任务 owner 分给成员，方向任务可并行但同时在跑不超过 3 个；④ 定期用 wait_agent 收进展，失败/超时的成员重派一次，仍失败就记录缺口；⑤ 全部完成后调用 workbench_idea_progress(done)，并用中文给出 3–5 行总结（方向、节点数、缺口）。',
        '约束：不直接写灵感节点（由成员调用 workbench_idea_expand）；不修改任务范围外的文件；成员 handle 创建后不可改、不可复用；不要使用 agent_teams_* 工具，统一用 spawn_teammate / team_task_*。',
      ].join('\n'),
      'read',
    ],
    [
      '产品', 'product', 'product',
      '用户、场景、价值与边界',
      [
        '你是产品负责人，从用户与价值角度发散灵感。',
        '工作方式：先读灵感正文与已有节点，再围绕「谁在什么场景下遇到什么问题」产出 3–5 条点子；每条必须写清用户、场景、收益与不做什么。',
        '产出：调用 workbench_idea_expand 写入节点（parentId 指向分到你的方向节点，type=idea，label ≤24 字，detail ≤120 字说明为什么成立）。不要改工作区文件。',
      ].join('\n'),
      'read',
    ],
    [
      '架构', 'architect', 'architect',
      '技术方案、可行性、关键取舍与风险',
      [
        '你是架构负责人，从技术可行性与取舍角度发散。',
        '工作方式：识别实现该灵感需要的能力（数据/模型/工具/外部服务），给出 2–3 种方案并说明取舍与风险；指出不可行或高成本的部分。',
        '产出：调用 workbench_idea_expand 写节点（type=idea 或 risk），detail 写清「为什么可行/为什么有风险」。不要修改实现文件。',
      ].join('\n'),
      'read',
    ],
    [
      '前端', 'frontend', 'frontend',
      '交互、界面与实现',
      [
        '你是前端负责人，从交互与实现角度发散与落地。',
        '工作方式：围绕用户路径给出界面/交互方案与关键组件；如果任务包含代码实现，只改任务 writeScopes 内的文件，并先读现有代码再改。',
        '产出：点子写入 workbench_idea_expand；代码变更后说明改了哪些文件、如何验证。不要顺手重构无关代码。',
      ].join('\n'),
      'write',
    ],
    [
      '后端', 'backend', 'backend',
      '接口、数据、任务与集成',
      [
        '你是后端负责人，从接口、数据与集成角度发散与落地。',
        '工作方式：明确数据模型、接口契约、异步任务与失败重试；如果任务包含代码实现，只改任务 writeScopes 内的文件。',
        '产出：点子写入 workbench_idea_expand；代码变更后给出接口/数据变更说明与验证方式。不要改前端文件。',
      ].join('\n'),
      'write',
    ],
    [
      '测试', 'qa', 'qa',
      '用例、边界、反例与回归',
      [
        '你是测试负责人，从可验证性与边界角度发散。',
        '工作方式：对每个方向给出「怎么验证」，列关键边界、反例与回归点；优先指出当前方案无法验证的地方。',
        '产出：写入 workbench_idea_expand（type=question 或 risk，detail 写验证方式）。只读，不修改实现文件。',
      ].join('\n'),
      'read',
    ],
    [
      '评审', 'reviewer', 'reviewer',
      '独立复核与挑错',
      [
        '你是独立评审人，只负责挑错，不参与实现。',
        '工作方式：检查其他成员的产出是否有事实错误、逻辑跳跃、不可验证或超出任务范围的改动；每条意见给出「问题 + 建议」。',
        '产出：写入 workbench_idea_expand（type=risk，detail 写问题与建议），或通过 send_message 反馈给主理人。只读，不改文件。',
      ].join('\n'),
      'read',
    ],
  ]
  return rows.map(([name, handle, role, intro, systemPrompt, fileWrite]) => ({
    name, handle, role, intro, systemPrompt, model: '', provider: '', tools: [], skills: [], mcp: [],
    memoryScope: 'project', concurrency: 1, fileWrite, enabled: true,
  }))
}

export interface KickoffInput {
  team: { name: string; desc: string }
  members: AgentMember[]
  goal: string
  idea: { title: string; brief: string }
  ideaId: string
  runId: string
  workspacePath: string
  timeoutMinutes: number
  memory?: string
  knowledge?: string
  /** 团队按功能绑定的候选执行人（不含主理人）；为空则全体成员。 */
  executors?: string[]
  featureLabel?: string
}

/** 派发契约：固定工具名、任务板顺序、并发/超时、写回方式与失败要求。 */
export function buildTeamKickoff(input: KickoffInput): string {
  const roster = input.members
    .filter(member => member.enabled)
    .map(member => {
      const extras: string[] = []
      if (member.model !== '') extras.push(`model=${member.provider !== '' ? `${member.provider}/` : ''}${member.model}`)
      if (member.skills.length > 0) extras.push(`skills=${member.skills.join('|')}`)
      if (member.mcp.length > 0) extras.push(`mcp=${member.mcp.join('|')}`)
      const suffix = extras.length > 0 ? `，${extras.join('，')}` : ''
      return `- ${member.name}（handle="${member.handle}"，role=${member.role}，fileWrite=${member.fileWrite}${suffix}）：${member.intro || member.role}`
    })
    .join('\n')
  const lines = [
    `你是「${input.team.name}」的主理人（Lead）。请用 Agent Teams 完成一次灵感发散。`,
    '',
    `## 目标`,
    input.goal || '围绕这个灵感做多方向发散，产出可直接落图的节点。',
    '',
    `## 灵感`,
    `- 标题：${input.idea.title}`,
    `- 正文：${input.idea.brief || '（无）'}`,
    `- ideaId：${input.ideaId}；runId：${input.runId}`,
    `- 工作区：${input.workspacePath || '（未指定，使用默认工作目录）'}`,
    '',
    `## 团队（最多 ${AGENT_LIMITS.membersPerTeam} 人，本次按下表创建）`,
    input.featureLabel !== undefined ? `功能：${input.featureLabel}` : '',
    input.executors !== undefined && input.executors.length > 0
      ? `按团队配置，本次候选执行人：${input.executors.join('、')}（主理人调度，可从中选人执行；不要创建表外成员）`
      : '团队未绑定具体执行人：从下表中选择最合适的成员执行。',
    roster,
    '',
    `## 执行顺序（必须遵守）`,
    `1. 先建任务板：每个发散方向一条任务（team_task_create / agent_teams_create_task 二选一，优先 team_task_create）。`,
    `2. 再创建成员：用 spawn_teammate 按上表 handle 创建（不要创建上表之外的成员）。`,
    `3. 分配任务：同时进行的成员不超过 ${AGENT_LIMITS.maxRunningMembers} 个。`,
    `4. 成员把点子写回灵感：调用 workbench_idea_expand，参数 ideaId="${input.ideaId}"、runId="${input.runId}"，nodes 的 parentId 指向方向节点 id；每个方向 3–5 条。`,
    `5. 全部完成后调用 workbench_idea_progress，参数 status="done"。`,
    `6. 最后用中文给出一段总结（做了哪些方向、产物在哪、有什么缺口）。`,
    '',
    `## 约束`,
    `- 成员失败或超时：重派一次；仍失败就在总结里写明，不要静默跳过。`,
    `- fileWrite=read 的成员禁止改工作区文件；所有成员都禁止改与本任务无关的文件。`,
    `- 只写灵感节点，不新建仓库文件；需要写文件时先确认任务范围。`,
    `- 整体预算：${input.timeoutMinutes} 分钟；超时前必须完成或给出部分结果。`,
  ]
  if (input.memory !== undefined && input.memory !== '') lines.push('', '## 记忆（由工作台注入，可直接使用）', input.memory)
  if (input.knowledge !== undefined && input.knowledge !== '') lines.push('', '## 知识（工作区检索结果，带来源）', input.knowledge)
  return lines.join('\n')
}

/** 派发状态收敛：done 优先，其次 partial/failed；运行中不覆盖。 */
export function nextDispatchStatus(current: DispatchStatus, incoming: DispatchStatus): DispatchStatus {
  if (current === 'done' || current === 'cancelled') return current
  if (incoming === 'done') return 'done'
  if (current === 'dispatching' || current === 'running') return incoming === 'dispatching' ? current : incoming
  return current
}

/** 团队按功能绑定执行成员：feature → 成员 id 列表（lead 固定，不进列表）。 */
export const BINDABLE_FEATURES = [
  { id: 'idea.diverge', label: '灵感 · 多方向发散' },
  { id: 'idea.continue', label: '灵感 · 节点继续发散' },
  { id: 'idea.review', label: '灵感 · 结果评审' },
  { id: 'product.design', label: '产品 · 设计发散' },
  { id: 'bug.fix', label: 'Bug · 修复建议' },
  { id: 'test.design', label: '测试 · 用例设计' },
] as const
export type BindableFeature = (typeof BINDABLE_FEATURES)[number]['id']
const FEATURE_IDS = new Set<string>(BINDABLE_FEATURES.map(feature => feature.id))

/** 只保留已知功能、去重、每个功能最多 6 个候选执行人。 */
export function normalizeBindings(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (raw === null || typeof raw !== 'object') return out
  for (const [feature, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!FEATURE_IDS.has(feature)) continue
    const ids = Array.isArray(value) ? value.map(item => String(item)).filter(Boolean).slice(0, 6) : []
    if (ids.length > 0) out[feature] = [...new Set(ids)]
  }
  return out
}

export interface MemoryEntryView { scope: string; content: string }
export interface KnowledgeHitView { path: string; chunk: string; score: number }

/** 派发时的记忆注入：按作用域标注来源，总量截断，避免挤占上下文。 */
export function assembleMemory(entries: MemoryEntryView[], limit = 2000): string {
  const lines: string[] = []
  let used = 0
  for (const entry of entries) {
    const line = `- [${entry.scope}] ${entry.content}`.slice(0, 500)
    if (used + line.length > limit) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

/** 知识注入：带路径来源，便于模型判断是否相关。 */
export function assembleKnowledge(hits: KnowledgeHitView[], limit = 1600): string {
  const lines: string[] = []
  let used = 0
  hits.forEach((hit, index) => {
    const body = hit.chunk.replace(/\s+/g, ' ').slice(0, 500)
    const line = `[${index + 1}] ${hit.path}\n${body}`
    if (used + line.length > limit) return
    lines.push(line)
    used += line.length + 1
  })
  return lines.join('\n\n')
}

export function isRunning(status: string): boolean {
  return status === 'dispatching' || status === 'running'
}
