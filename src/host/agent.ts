/**
 * 智能体团队 · 宿主半侧：/agents 路由 + Agent 工具
 *
 * 数据独立成表、独立端点，不进整份任务快照；团队成员与派发记录由工作台管理，
 * 真正的执行仍由 DSH 会话（Agent Teams）完成。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AgentStore } from './agent-store.js'
import { KnowledgeIndex, KNOWLEDGE_LIMITS } from './knowledge.js'
import {
  AGENT_LIMITS, FILE_WRITES, MEMORY_SCOPES, MEMBER_ROLES, assembleKnowledge, assembleMemory,
  buildTeamKickoff, clampText, type AgentMember,
} from './agent-model.js'

interface RouteRequest { url?: string; method?: string; on?: Function; json?: Function; headers?: Record<string, string> }
interface RouteResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: unknown): void
}

export interface AgentModuleOptions {
  db: any
  dataDir: string
  prefix: string
}

export interface AgentModule {
  store: AgentStore
  handle(req: RouteRequest, res: RouteResponse, path: string, method: string, url: URL): Promise<boolean>
  registerTools(ctx: any): void
}

const MAX_BODY = 2 * 1024 * 1024

function send(res: RouteResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

function fail(res: RouteResponse, status: number, message: string): void {
  send(res, status, { ok: false, error: message, message })
}

function readJson(req: RouteRequest): Promise<any> {
  if (typeof req.json === 'function') return req.json()
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    if (typeof req.on !== 'function') { reject(new Error('请求体不可读')); return }
    req.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > MAX_BODY) { reject(new Error('请求体过大')); return }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (cause) { reject(cause) }
    })
    req.on('error', reject)
  })
}

const ID = /^[A-Za-z0-9_-]{1,64}$/

export function createAgentModule(options: AgentModuleOptions): AgentModule {
  const store = new AgentStore(options.db)
  const knowledge = new KnowledgeIndex(store.db)
  /** 个人/项目记忆优先用文件（可随仓库走），读不到再看数据库。 */
  function fileMemory(path: string): string {
    try {
      if (!existsSync(path)) return ''
      return readFileSync(path, 'utf8').slice(0, 4000).trim()
    } catch { return '' }
  }
  function injectMemory(teamId: string, projectPath: string): string {
    const dbEntries = store.listMemory({ teamId, projectPath }).map(row => ({ scope: String(row.scope), content: String(row.content) }))
    const personal = fileMemory(join(options.dataDir, 'dsh-workbench', 'memory', 'personal.md'))
    const project = projectPath !== '' ? fileMemory(join(projectPath, '.dsh-workbench', 'memory.md')) : ''
    const parts: string[] = []
    if (personal !== '') parts.push(`- [personal] ${personal}`)
    if (project !== '') parts.push(`- [project] ${project}`)
    const merged = parts.join('\n') + (dbEntries.length > 0 ? `\n${assembleMemory(dbEntries, 1600)}` : '')
    return merged.trim()
  }
  const membersOf = (teamId: string): AgentMember[] => store.listTeamMembers(teamId) as unknown as AgentMember[]

  async function handle(req: RouteRequest, res: RouteResponse, path: string, method: string, url: URL): Promise<boolean> {
    if (path !== '/agents' && !path.startsWith('/agents/')) return false
    const rest = path.slice('/agents'.length).split('/').filter(Boolean)
    const [a, b, c, d] = rest
    try {
      if (a === undefined) { fail(res, 404, '未知接口'); return true }

      /* ---------------- 团队 ---------------- */
      if (a === 'teams') {
        if (b === undefined) {
          if (method === 'GET') { send(res, 200, { ok: true, teams: store.listTeams() }); return true }
          if (method === 'POST') {
            const body = await readJson(req)
            const team = store.saveTeam(body)
            send(res, 200, { ok: true, team }); return true
          }
          fail(res, 405, '不支持的方法'); return true
        }
        if (!ID.test(b)) { fail(res, 400, 'team_id_invalid'); return true }
        if (c === undefined) {
          if (method === 'GET') {
            const team = store.getTeam(b)
            if (team === null) { fail(res, 404, '团队不存在'); return true }
            send(res, 200, { ok: true, team }); return true
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await readJson(req)
            send(res, 200, { ok: true, team: store.saveTeam({ ...body, id: b }) }); return true
          }
          if (method === 'DELETE') { store.deleteTeam(b); send(res, 200, { ok: true }); return true }
          fail(res, 405, '不支持的方法'); return true
        }
        if (c === 'members' && d === undefined) {
          if (method === 'POST') {
            const body = await readJson(req)
            let memberId = String(body?.memberId ?? '')
            if (memberId === '' && body?.member !== undefined) {
              const saved = store.saveMember(body.member)
              if (saved.member === null) { send(res, 400, { ok: false, error: '成员校验失败', issues: saved.issues }); return true }
              memberId = saved.member.id
            }
            if (memberId === '' || store.getMember(memberId) === null) { fail(res, 400, '成员不存在'); return true }
            const team = store.addMemberToTeam(b, memberId)
            send(res, 200, { ok: true, team }); return true
          }
          fail(res, 405, '不支持的方法'); return true
        }
        if (c === 'members' && d !== undefined) {
          if (!ID.test(d)) { fail(res, 400, 'member_id_invalid'); return true }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await readJson(req)
            send(res, 200, { ok: true, team: store.setTeamMember(b, d, body ?? {}) }); return true
          }
          if (method === 'DELETE') { store.removeMemberFromTeam(b, d); send(res, 200, { ok: true }); return true }
          fail(res, 405, '不支持的方法'); return true
        }
        fail(res, 404, '未知接口'); return true
      }

      /* ---------------- 成员 ---------------- */
      if (a === 'members') {
        if (b === undefined) {
          if (method === 'GET') { send(res, 200, { ok: true, members: store.listMembers() }); return true }
          if (method === 'POST') {
            const body = await readJson(req)
            const saved = store.saveMember(body?.member ?? body)
            if (saved.member === null) { send(res, 400, { ok: false, error: '成员校验失败', issues: saved.issues }); return true }
            send(res, 200, { ok: true, member: saved.member }); return true
          }
          fail(res, 405, '不支持的方法'); return true
        }
        if (!ID.test(b)) { fail(res, 400, 'member_id_invalid'); return true }
        if (method === 'PATCH' || method === 'PUT') {
          const body = await readJson(req)
          /* 客户端两种写法都接受：{member:{…}} 或直接字段。 */
          const saved = store.saveMember({ ...(body?.member ?? body ?? {}), id: b })
          if (saved.member === null) { send(res, 400, { ok: false, error: '成员校验失败', issues: saved.issues }); return true }
          send(res, 200, { ok: true, member: saved.member }); return true
        }
        if (method === 'DELETE') { store.deleteMember(b); send(res, 200, { ok: true }); return true }
        if (method === 'GET') {
          const member = store.getMember(b)
          if (member === null) { fail(res, 404, '成员不存在'); return true }
          send(res, 200, { ok: true, member }); return true
        }
        fail(res, 405, '不支持的方法'); return true
      }

      /* ---------------- 派发 ---------------- */
      if (a === 'dispatches') {
        if (b === undefined) {
          if (method === 'GET') {
            send(res, 200, { ok: true, dispatches: store.listDispatches(String(url.searchParams.get('ideaId') ?? '')) }); return true
          }
          if (method === 'POST') {
            const body = await readJson(req)
            const ideaId = String(body?.ideaId ?? '')
            const teamId = String(body?.teamId ?? '')
            if (ideaId === '' && body?.allowNoIdea !== true) { fail(res, 400, 'ideaId 不能为空'); return true }
            const team = store.getTeam(teamId)
            if (team === null) { fail(res, 404, '团队不存在'); return true }
            if (ideaId !== '') {
              const running = store.runningDispatchForIdea(ideaId)
              if (running !== null) { send(res, 409, { ok: false, error: '这个灵感已有团队在执行', dispatch: running }); return true }
            }
            const members = (team.members as AgentMember[]).filter(member => member.enabled)
            const timeoutMinutes = Math.min(120, Math.max(1, Math.round((Number(body?.timeoutMs) || AGENT_LIMITS.dispatchTimeoutMs) / 60000)))
            const workspacePath = String(body?.workspacePath ?? team.defaultWorkspace ?? '')
            const injectedMemory = typeof body?.memory === 'string' ? body.memory : injectMemory(teamId, workspacePath)
            const injectedKnowledge = typeof body?.knowledge === 'string'
              ? body.knowledge
              : assembleKnowledge(knowledge.search(workspacePath, `${clampText(body?.ideaTitle, 80)} ${clampText(body?.goal, 120)}`, 5))
            const kickoff = buildTeamKickoff({
              team: { name: String(team.name), desc: String(team.desc ?? '') },
              members,
              goal: clampText(body?.goal, AGENT_LIMITS.dispatchGoal),
              idea: { title: clampText(body?.ideaTitle, 200), brief: clampText(body?.ideaBrief, 4000) },
              ideaId,
              runId: String(body?.runId ?? ''),
              workspacePath,
              timeoutMinutes,
              memory: injectedMemory !== '' ? injectedMemory : undefined,
              knowledge: injectedKnowledge !== '' ? injectedKnowledge : undefined,
            })
            const dispatch = store.createDispatch({
              ideaId, runId: body?.runId, teamId, goal: body?.goal,
              workspacePath: body?.workspacePath ?? team.defaultWorkspace,
              timeoutMs: timeoutMinutes * 60000, memberCount: members.length, kickoff,
              members: members.map(member => ({ id: member.id, name: member.name, handle: member.handle, fileWrite: member.fileWrite })),
            })
            send(res, 200, { ok: true, dispatch, kickoff, team }); return true
          }
          fail(res, 405, '不支持的方法'); return true
        }
        if (!ID.test(b)) { fail(res, 400, 'dispatch_id_invalid'); return true }
        if (c === undefined) {
          if (method === 'GET') {
            const dispatch = store.getDispatch(b)
            if (dispatch === null) { fail(res, 404, '派发不存在'); return true }
            send(res, 200, { ok: true, dispatch, events: store.listEvents(b) }); return true
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await readJson(req)
            const dispatch = store.updateDispatch(b, body ?? {})
            if (dispatch === null) { fail(res, 404, '派发不存在'); return true }
            send(res, 200, { ok: true, dispatch }); return true
          }
          fail(res, 405, '不支持的方法'); return true
        }
        if (c === 'events') {
          if (method === 'POST') {
            const body = await readJson(req)
            store.appendEvent(b, String(body?.kind ?? 'event'), String(body?.member ?? ''), body?.payload ?? {})
            send(res, 200, { ok: true }); return true
          }
          if (method === 'GET') { send(res, 200, { ok: true, events: store.listEvents(b) }); return true }
          fail(res, 405, '不支持的方法'); return true
        }
        fail(res, 404, '未知接口'); return true
      }

      /* ---------------- 记忆 ---------------- */
      if (a === 'memory') {
        if (b === undefined) {
          if (method === 'GET') {
            send(res, 200, { ok: true, memories: store.listMemory({
              scope: String(url.searchParams.get('scope') ?? ''),
              teamId: String(url.searchParams.get('teamId') ?? ''),
              projectPath: String(url.searchParams.get('projectPath') ?? ''),
            }) }); return true
          }
          if (method === 'POST') {
            const body = await readJson(req)
            const memory = store.addMemory(body ?? {})
            send(res, 200, { ok: true, memory }); return true
          }
          fail(res, 405, '不支持的方法'); return true
        }
        if (!ID.test(b)) { fail(res, 400, 'memory_id_invalid'); return true }
        if (method === 'PATCH' || method === 'PUT') {
          const body = await readJson(req)
          const memory = store.updateMemory(b, body ?? {})
          if (memory === null) { fail(res, 404, '记忆不存在'); return true }
          send(res, 200, { ok: true, memory }); return true
        }
        if (method === 'DELETE') { store.deleteMemory(b); send(res, 200, { ok: true }); return true }
        if (method === 'GET') {
          const memory = store.getMemory(b)
          if (memory === null) { fail(res, 404, '记忆不存在'); return true }
          send(res, 200, { ok: true, memory }); return true
        }
        fail(res, 405, '不支持的方法'); return true
      }

      /* ---------------- 知识 ---------------- */
      if (a === 'knowledge') {
        if (b === 'index' && method === 'POST') {
          const body = await readJson(req)
          const projectPath = String(body?.projectPath ?? '').trim()
          if (projectPath === '') { fail(res, 400, 'projectPath 不能为空'); return true }
          try {
            const result = knowledge.index(projectPath)
            send(res, 200, { ok: true, result, status: knowledge.status(projectPath) }); return true
          } catch (cause) {
            fail(res, 500, `索引失败：${cause instanceof Error ? cause.message : String(cause)}`); return true
          }
        }
        if (b === 'status' && method === 'GET') {
          const projectPath = String(url.searchParams.get('projectPath') ?? '')
          send(res, 200, { ok: true, status: knowledge.status(projectPath) }); return true
        }
        if (b === 'search' && method === 'GET') {
          const projectPath = String(url.searchParams.get('projectPath') ?? '')
          const q = String(url.searchParams.get('q') ?? '')
          if (projectPath === '' || q === '') { fail(res, 400, 'projectPath 与 q 必填'); return true }
          const hits = knowledge.search(projectPath, q, Math.min(20, Number(url.searchParams.get('topK')) || KNOWLEDGE_LIMITS.topK))
          send(res, 200, { ok: true, hits }); return true
        }
        fail(res, 404, '未知接口'); return true
      }

      /* ---------------- 元信息 ---------------- */
      if (a === 'meta') {
        send(res, 200, {
          ok: true,
          roles: MEMBER_ROLES, fileWrites: FILE_WRITES, memoryScopes: MEMORY_SCOPES,
          limits: AGENT_LIMITS,
        }); return true
      }

      fail(res, 404, '未知接口')
      return true
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      const status = /不存在/.test(message) ? 404 : /最多|不能为空|校验/.test(message) ? 400 : 500
      fail(res, status, message)
      return true
    }
  }

  function registerTools(ctx: any): void {
    const tools = ctx?.tools
    if (tools === undefined || typeof tools.register !== 'function') {
      console.warn('[dsh-workbench] tools 服务不可用：团队工具未注册')
      return
    }
    const register = (tool: any, label: string): void => {
      if (typeof ctx.effect === 'function') ctx.effect(() => tools.register(tool), `workbench: ${label}`)
      else tools.register(tool)
    }
    register({
      name: 'workbench_memory_search',
      description: '在个人/项目/团队记忆里搜索（团队与灵感发散时用）。',
      parameters: { type: 'object', additionalProperties: false, properties: {
        query: { type: 'string' }, teamId: { type: 'string' }, projectPath: { type: 'string' }, limit: { type: 'number' },
      }, required: ['query'] },
      execute: async (args: any) => {
        const query = String(args?.query ?? '').toLowerCase().trim()
        if (query === '') return { ok: false, error: 'query 不能为空' }
        const rows = store.listMemory({ teamId: String(args?.teamId ?? ''), projectPath: String(args?.projectPath ?? '') })
          .filter(row => String(row.content).toLowerCase().includes(query))
          .slice(0, Math.min(20, Number(args?.limit) || 8))
        return { ok: true, memories: rows }
      },
    })
    register({
      name: 'workbench_memory_write',
      description: '把一条结论写入团队/项目/个人记忆（用户明确要求记住时调用）。',
      parameters: { type: 'object', additionalProperties: false, properties: {
        content: { type: 'string' }, scope: { type: 'string', enum: ['personal', 'project', 'team'] },
        teamId: { type: 'string' }, projectPath: { type: 'string' },
      }, required: ['content', 'scope'] },
      execute: async (args: any) => {
        try {
          const memory = store.addMemory({ content: args?.content, scope: args?.scope, teamId: args?.teamId, projectPath: args?.projectPath, source: 'agent' })
          return { ok: true, memory }
        } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : String(cause) } }
      },
    })
    register({
      name: 'workbench_knowledge_search',
      description: '在项目已索引的知识里做全文检索（BM25），返回带路径的片段。',
      parameters: { type: 'object', additionalProperties: false, properties: {
        projectPath: { type: 'string' }, query: { type: 'string' }, topK: { type: 'number' },
      }, required: ['projectPath', 'query'] },
      execute: async (args: any) => {
        const projectPath = String(args?.projectPath ?? '')
        const query = String(args?.query ?? '')
        if (projectPath === '' || query === '') return { ok: false, error: 'projectPath 与 query 必填' }
        return { ok: true, hits: knowledge.search(projectPath, query, Math.min(20, Number(args?.topK) || KNOWLEDGE_LIMITS.topK)) }
      },
    })
    register({
      name: 'workbench_team_list',
      description: '读取个人工作台里的智能体团队与成员（含角色、文件权限、是否启用）。写灵感节点前可用它确认团队约定。',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: { teamId: { type: 'string', description: '可选；只看某支团队。' } },
      },
      execute: async (args: any) => {
        try {
          const teamId = String(args?.teamId ?? '')
          if (teamId !== '') {
            const team = store.getTeam(teamId)
            if (team === null) return { ok: false, error: '团队不存在' }
            return { ok: true, team }
          }
          return { ok: true, teams: store.listTeams() }
        } catch (cause) {
          return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }
        }
      },
    })
  }

  return { store, handle, registerTools }
}
