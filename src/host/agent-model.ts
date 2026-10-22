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

/** 默认「产品研发」7 人；fileWrite 按设计 3.1：前端/后端可写，其余只读。 */
export function defaultMembers(): Array<Omit<AgentMember, 'id'>> {
  const rows: Array<[string, string, MemberRole, string, string, FileWrite]> = [
    ['主理人', 'lead', 'lead', '拆任务、派成员、验收与汇总，不直接改文件', '你是团队主理人：先建任务板，再按职责创建成员，控制并发不超过 3，最后统一验收。', 'read'],
    ['产品', 'product', 'product', '用户、场景、价值与边界', '你负责产品视角：说清用户、场景、价值与不做什么。', 'read'],
    ['架构', 'architect', 'architect', '技术方案、风险与取舍', '你负责架构视角：给出方案、关键取舍与风险。', 'read'],
    ['前端', 'frontend', 'frontend', '交互、组件与样式', '你负责前端实现：只改任务范围内的文件。', 'write'],
    ['后端', 'backend', 'backend', '接口、数据与任务', '你负责后端实现：只改任务范围内的文件。', 'write'],
    ['测试', 'qa', 'qa', '用例、边界与回归', '你负责测试视角：列边界、反例与验证方式，不改实现文件。', 'read'],
    ['评审', 'reviewer', 'reviewer', '独立复核、挑错', '你负责独立评审：只读，指出风险与缺失，不顺手改实现。', 'read'],
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
}

/** 派发契约：固定工具名、任务板顺序、并发/超时、写回方式与失败要求。 */
export function buildTeamKickoff(input: KickoffInput): string {
  const roster = input.members
    .filter(member => member.enabled)
    .map(member => `- ${member.name}（handle="${member.handle}"，role=${member.role}，fileWrite=${member.fileWrite}）：${member.intro || member.role}`)
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

export function isRunning(status: string): boolean {
  return status === 'dispatching' || status === 'running'
}
