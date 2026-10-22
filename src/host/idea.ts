/**
 * 灵感 · 宿主半侧：路由 + Agent 工具 + vendor 资产
 *
 * 与主工作台共享同一个 SQLite 连接，但数据独立成表、独立端点（不进整份快照）。
 * 路由前缀沿用 /workbench-api：/ideas… 与 /assets/vendor/*。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { IdeaStore } from './idea-store.js'
import {
  IDEA_ANGLES, IDEA_LIMITS, clampText, diffGraphs, graphBytes,
  inputDigest, mergeGraph, normalizeGraph, pushRunLog, type IdeaGraph,
} from './idea-model.js'

const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const VENDOR_DIR = join(PLUGIN_DIR, 'assets', 'vendor')
const VENDOR_FILES: Record<string, string> = {
  'echarts.min.js': 'text/javascript; charset=utf-8',
  'mind-elixir/MindElixir.iife.js': 'text/javascript; charset=utf-8',
  'mind-elixir/MindElixir.css': 'text/css; charset=utf-8',
}

interface RouteRequest { url?: string; method?: string; on?: Function; json?: Function; headers?: Record<string, string> }
interface RouteResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: unknown): void
}

export interface IdeaModuleOptions {
  db: any
  dataDir: string
  prefix: string
}

export interface IdeaModule {
  store: IdeaStore
  handle(req: RouteRequest, res: RouteResponse, path: string, method: string, url: URL): Promise<boolean>
  registerTools(ctx: any): void
}

function send(res: RouteResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
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
      if (size > IDEA_LIMITS.imageBytes * 5) { reject(new Error('请求体过大')); return }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolve({}); return }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (cause) { reject(cause) }
    })
    req.on('error', reject)
  })
}

function safeDir(input: string): string {
  const clean = input.trim()
  return clean === '' ? '' : clean
}

/** 灵感产物目录：优先项目工作区，没有工作区就落在 DSH_HOME 下。 */
function ideaDir(store: IdeaStore, ideaId: string): string {
  const idea = store.getIdea(ideaId)
  if (!idea) throw new Error('灵感不存在')
  const project = store.listProjects().find((p: any) => p.id === idea.projectId)
  const base = safeDir(String(project?.workspacePath ?? ''))
  const root = base !== '' && existsSync(base) ? base : ''
  const dir = root !== ''
    ? join(root, '.dsh-workbench', 'ideas', ideaId)
    : join(process.env.DSH_HOME ?? join(process.env.HOME ?? '.', '.dsh'), 'ideas', ideaId)
  mkdirSync(dir, { recursive: true })
  return dir
}

function extOf(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'bin'
}

function decodeDataUrl(dataUrl: unknown): { mime: string; buffer: Buffer } | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim())
  if (!match) return null
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > IDEA_LIMITS.imageBytes) return null
  const mime = match[1].toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) return null
  return { mime, buffer }
}

function angleLine(): string {
  return IDEA_ANGLES.map((a, i) => `${i + 1}. ${a.label}（angle="${a.id}"）：${a.hint}`).join('\n')
}

/** 生成提示词：唯一交付契约写死在这里，客户端只负责派发。 */
export function buildIdeaPrompt(input: {
  ideaId: string
  runId: string
  mode: 'diverge' | 'continue'
  title: string
  brief: string
  inputs: Array<{ kind: string; text?: string; url?: string; filePath?: string }>
  angles: string[]
  targetNodeId?: string
  targetLabel?: string
}): string {
  const lines = input.inputs.map(item => {
    if (item.kind === 'image' && item.filePath) return `- 截图：${item.filePath}（请先读取该图片）`
    if (item.kind === 'url' && item.url) return `- 链接：${item.url}（可尝试抓取摘要；失败就跳过）`
    return `- 文字：${clampText(item.text, 1200)}`
  })
  const angleText = input.angles.length > 0
    ? input.angles.map(id => IDEA_ANGLES.find(a => a.id === id)?.label ?? id).join(' / ')
    : '全部'
  const head = input.mode === 'continue'
    ? `沿着「${input.targetLabel ?? input.targetNodeId}」这个方向继续发散，只扩这一支，不要重做整张图。`
    : '从 6 个方向把这件事发散开，最后形成一张可继续生长的图。'
  return `你是产品创意发散助手。本次任务${input.mode === 'continue' ? '（继续发散）' : '（首次发散）'}。

## 灵感
- 标题：${input.title}
- 正文：${clampText(input.brief, 2000) || '（无）'}
${lines.length > 0 ? `- 输入：\n${lines.join('\n')}` : ''}

## 要做的事
${head}
本次角度：${angleText}。
可用维度：
${angleLine()}

## 硬性要求
1. 只允许通过工具 **workbench_idea_expand** 交付，参数必须包含 ideaId="${input.ideaId}" 与 runId="${input.runId}"；不要输出长篇正文。
2. 首次发散：每个角度给 3–5 条点子；每条 = 一句话点子（label ≤ 24 字）+ 一句话为什么成立（detail ≤ 120 字）。总共 18–30 条。
3. 至少给 2 条跨支关联（edges 里 kind="relate"，连接不同角度下的两个节点，可带 label）。
4. 节点 id 用 n1、n2…；parentId 指向所属**方向节点**的 id（工具会自动把方向节点落到根下），方向节点 type="direction"、angle 填对应 id。
5. 允许分批调用：先落 6 个方向，再分批落点子；每批 ≤ 30 个节点。**最后一次调用必须带 final: true**。
6. 禁止空话（"提升体验""加强运营"）、禁止重复、禁止编造截图或链接里没有的事实。
7. 需要汇报进度时调用 workbench_idea_progress（step/total/message）。

## 继续发散时
只新增目标节点的子方向（2–4 条），不要修改已有节点；新节点的 parentId 指向 "${input.targetNodeId ?? ''}"。
`
}

export function createIdeaModule(options: IdeaModuleOptions): IdeaModule | null {
  if (options.db === null || options.db === undefined) return null
  const store = new IdeaStore(options.db)
  const prefix = options.prefix

  function handle(req: RouteRequest, res: RouteResponse, path: string, method: string, url: URL): Promise<boolean> {
    return (async () => {
      /* ---------------- vendor 资产 ---------------- */
      if (path.startsWith('/assets/vendor/')) {
        if (method !== 'GET' && method !== 'HEAD') { fail(res, 405, 'method_not_allowed'); return true }
        const rel = path.slice('/assets/vendor/'.length)
        const mime = VENDOR_FILES[rel]
        if (mime === undefined) { fail(res, 404, 'asset_not_found'); return true }
        try {
          const body = readFileSync(join(VENDOR_DIR, rel))
          const cache = rel.endsWith('.css') || rel.endsWith('.js') ? 'no-cache' : 'public, max-age=86400'
          res.writeHead(200, { 'content-type': mime, 'content-length': String(body.length), 'cache-control': cache, 'x-content-type-options': 'nosniff' })
          res.end(body)
        } catch {
          fail(res, 404, 'asset_missing')
        }
        return true
      }
      if (!path.startsWith('/ideas')) return false

      const segments = path.split('/').filter(Boolean) // ['ideas', ...]
      const rest = segments.slice(1)
      const [a, b, c, d, e] = rest

      try {
        /* ---------------- 项目 ---------------- */
        if (a === 'projects' && (b === undefined)) {
          if (method === 'GET') { send(res, 200, { ok: true, projects: store.listProjects() }); return true }
          if (method === 'POST') {
            const body = await readJson(req)
            const saved = store.saveProject(body ?? {})
            send(res, 200, { ok: true, project: saved.project, created: saved.created }); return true
          }
          fail(res, 405, 'method_not_allowed'); return true
        }
        if (a === 'projects' && b !== undefined && method === 'DELETE') {
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(b)) { fail(res, 400, 'project_id_invalid'); return true }
          store.deleteProject(b)
          send(res, 200, { ok: true }); return true
        }

        /* ---------------- 灵感集合 ---------------- */
        if (a === undefined) {
          if (method === 'GET') {
            send(res, 200, { ok: true, ideas: store.listIdeas({ projectId: url.searchParams.get('projectId') ?? '', q: url.searchParams.get('q') ?? '' }) })
            return true
          }
          if (method === 'POST') {
            const body = await readJson(req)
            const idea = store.createIdea(body ?? {})
            send(res, 200, { ok: true, idea }); return true
          }
          fail(res, 405, 'method_not_allowed'); return true
        }

        const ideaId = a as string
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(ideaId)) { fail(res, 400, 'idea_id_invalid'); return true }

        /* ---------------- 单个灵感 ---------------- */
        if (b === undefined) {
          if (method === 'GET') {
            const idea = store.getIdea(ideaId)
            if (!idea) { fail(res, 404, 'idea_not_found'); return true }
            /* 兜底：进程重启/会话挂起后，超时 run 不能永远停在 running。 */
            const latest = store.latestRun(ideaId)
            if (latest?.status === 'running') {
              const started = Date.parse(String(latest.startedAt ?? '').replace(' ', 'T'))
              if (Number.isFinite(started) && Date.now() - started > 10 * 60 * 1000) {
                store.updateRun(latest.id, { status: 'failed', error: '超时未回写', finished: true, message: '生成超时（10 分钟）' })
                store.setStatus(ideaId, 'draft')
              }
            }
            send(res, 200, {
              ok: true,
              idea,
              inputs: store.listInputs(ideaId),
              versions: store.listVersions(ideaId),
              run: store.latestRun(ideaId) ?? null,
            })
            return true
          }
          if (method === 'PATCH' || method === 'PUT') {
            const body = await readJson(req)
            send(res, 200, { ok: true, idea: store.updateIdea(ideaId, body ?? {}) }); return true
          }
          if (method === 'DELETE') {
            store.deleteIdea(ideaId)
            send(res, 200, { ok: true }); return true
          }
          fail(res, 405, 'method_not_allowed'); return true
        }

        /* ---------------- 输入 ---------------- */
        if (b === 'inputs') {
          if (c === undefined && method === 'POST') {
            const body = await readJson(req)
            const kind = String(body?.kind ?? 'text')
            if (kind === 'image') {
              const decoded = decodeDataUrl(body?.dataUrl)
              if (decoded === null) { fail(res, 400, '图片格式不支持或超过 2MB'); return true }
              const dir = join(ideaDir(store, ideaId), 'inputs')
              mkdirSync(dir, { recursive: true })
              const file = join(dir, `${randomUUID().slice(0, 8)}.${extOf(decoded.mime)}`)
              writeFileSync(file, decoded.buffer)
              const input = store.addInput(ideaId, {
                kind: 'image', filePath: file, mime: decoded.mime, size: decoded.buffer.length,
                width: Number(body?.width ?? 0), height: Number(body?.height ?? 0), text: String(body?.text ?? ''),
              })
              send(res, 200, { ok: true, input }); return true
            }
            if (kind === 'url') {
              const value = String(body?.url ?? '').trim()
              if (!/^https?:\/\//i.test(value)) { fail(res, 400, '链接必须以 http(s):// 开头'); return true }
              const input = store.addInput(ideaId, { kind: 'url', url: value.slice(0, 1000) })
              send(res, 200, { ok: true, input }); return true
            }
            const input = store.addInput(ideaId, { kind: 'text', text: String(body?.text ?? '').slice(0, 2000) })
            send(res, 200, { ok: true, input }); return true
          }
          if (c !== undefined && method === 'DELETE') {
            const row = store.deleteInput(ideaId, c)
            if (row?.file_path) { try { writeFileSync(row.file_path, '') } catch { /* 忽略 */ } }
            send(res, 200, { ok: true }); return true
          }
          fail(res, 405, 'method_not_allowed'); return true
        }

        /* ---------------- 草稿 ---------------- */
        if (b === 'draft') {
          if (method === 'GET') {
            const draft = store.getDraft(ideaId)
            send(res, 200, { ok: true, ...draft }); return true
          }
          if (method === 'PUT') {
            const body = await readJson(req)
            const normalized = normalizeGraph(body?.graph, {})
            const size = graphBytes(normalized.graph)
            if (size > IDEA_LIMITS.graph) { fail(res, 413, '导图数据过大'); return true }
            try {
              const result = store.setDraft(ideaId, normalized.graph, body?.rev === undefined ? undefined : Number(body.rev))
              send(res, 200, { ok: true, rev: result.rev, graph: normalized.graph, issues: normalized.issues })
            } catch (cause: any) {
              if (cause?.code === 'draft_conflict') {
                const current = store.getDraft(ideaId)
                send(res, 409, { ok: false, error: 'draft_conflict', current })
              } else throw cause
            }
            return true
          }
          fail(res, 405, 'method_not_allowed'); return true
        }

        /* ---------------- 版本 ---------------- */
        if (b === 'versions') {
          if (c === undefined) {
            if (method === 'GET') { send(res, 200, { ok: true, versions: store.listVersions(ideaId) }); return true }
            if (method === 'POST') {
              const body = await readJson(req)
              const draft = store.getDraft(ideaId)
              const idea = store.getIdea(ideaId)
              const version = store.createVersion(ideaId, {
                graph: draft.graph,
                source: 'manual',
                mode: 'archive',
                label: body?.label,
                inputDigest: inputDigest(store.listInputs(ideaId)),
                summary: `手动存档 · ${draft.graph.nodes.length} 节点`,
              })
              send(res, 200, { ok: true, version, idea }); return true
            }
            fail(res, 405, 'method_not_allowed'); return true
          }
          const versionId = c
          if (d === undefined) {
            if (method === 'GET') {
              const version = store.getVersion(ideaId, versionId)
              if (!version) { fail(res, 404, 'version_not_found'); return true }
              send(res, 200, { ok: true, version }); return true
            }
            if (method === 'DELETE') {
              store.deleteVersion(ideaId, versionId)
              send(res, 200, { ok: true }); return true
            }
            fail(res, 405, 'method_not_allowed'); return true
          }
          if (d === 'rollback' && method === 'POST') {
            const version = store.rollback(ideaId, versionId)
            send(res, 200, { ok: true, version, draft: store.getDraft(ideaId) }); return true
          }
          if (d === 'diff' && method === 'GET' && e !== undefined) {
            const left = store.getVersion(ideaId, versionId)
            const right = store.getVersion(ideaId, e)
            if (!left || !right) { fail(res, 404, 'version_not_found'); return true }
            send(res, 200, { ok: true, diff: diffGraphs(left.graph as IdeaGraph, right.graph as IdeaGraph), left, right })
            return true
          }
          fail(res, 404, 'route_not_found'); return true
        }

        /* ---------------- 导出 / 导入 ---------------- */
        if (b === 'export' && method === 'POST') {
          const body = await readJson(req)
          const format = String(body?.format ?? 'json')
          const content = String(body?.content ?? '')
          if (content === '') { fail(res, 400, '导出内容为空'); return true }
          if (Buffer.byteLength(content, 'utf8') > IDEA_LIMITS.graph * 2) { fail(res, 413, '导出内容过大'); return true }
          const idea = store.getIdea(ideaId)
          if (!idea) { fail(res, 404, 'idea_not_found'); return true }
          if (body?.toWorkspace === true) {
            const dir = join(ideaDir(store, ideaId), 'exports')
            mkdirSync(dir, { recursive: true })
            const ext = format === 'markdown' ? 'md' : format
            const file = join(dir, `${clampText(idea.title, 40) || 'idea'}-v${body?.versionSeq ?? 'draft'}.${ext}`)
            writeFileSync(file, content, 'utf8')
            send(res, 200, { ok: true, filePath: file, directory: dir }); return true
          }
          send(res, 200, { ok: true, content, filename: `${clampText(idea.title, 40) || 'idea'}.${format === 'markdown' ? 'md' : format}` })
          return true
        }
        if (b === 'import' && method === 'POST') {
          const body = await readJson(req)
          const normalized = normalizeGraph(body?.graph, {})
          const result = store.setDraft(ideaId, normalized.graph, undefined)
          send(res, 200, { ok: true, rev: result.rev, graph: normalized.graph, issues: normalized.issues })
          return true
        }

        /* ---------------- 生成运行 ---------------- */
        if (b === 'runs') {
          if (c === undefined && method === 'POST') {
            const body = await readJson(req)
            const idea = store.getIdea(ideaId)
            if (!idea) { fail(res, 404, 'idea_not_found'); return true }
            const mode = body?.kind === 'continue' ? 'continue' : 'diverge'
            const targetNodeId = String(body?.targetNodeId ?? '')
            const draft = store.getDraft(ideaId)
            const target = draft.graph.nodes.find(n => n.id === targetNodeId)
            if (mode === 'continue' && target === undefined) { fail(res, 400, '目标节点不存在'); return true }
            const angles = (Array.isArray(body?.angles) ? body.angles : IDEA_ANGLES.map(a => a.id))
              .map((id: unknown) => String(id)).slice(0, 8)
            const run = store.createRun(ideaId, { kind: mode, targetNodeId, angles })
            const prompt = buildIdeaPrompt({
              ideaId, runId: String(run.id), mode,
              title: String(idea.title), brief: String(idea.brief),
              inputs: store.listInputs(ideaId),
              angles, targetNodeId: targetNodeId || undefined, targetLabel: target?.label,
            })
            const project = store.listProjects().find((p: any) => p.id === idea.projectId)
            send(res, 200, {
              ok: true, run, prompt,
              workspacePath: project?.workspacePath ?? '',
              sessionPath: project?.workspacePath ?? '',
            })
            return true
          }
          if (c !== undefined && d === undefined && method === 'GET') {
            const run = store.getRun(c)
            if (!run || run.ideaId !== ideaId) { fail(res, 404, 'run_not_found'); return true }
            send(res, 200, { ok: true, run, draft: store.getDraft(ideaId) }); return true
          }
          if (c !== undefined && d === 'finalize' && method === 'POST') {
            const body = await readJson(req)
            const run = store.finalizeRun(c, body ?? {})
            send(res, 200, { ok: true, run, draft: store.getDraft(ideaId) }); return true
          }
          if (c !== undefined && d === 'cancel' && method === 'POST') {
            const run = store.updateRun(c, { status: 'failed', error: '用户已停止', finished: true, message: '已停止' })
            store.setStatus(ideaId, 'draft')
            send(res, 200, { ok: true, run }); return true
          }
          fail(res, 405, 'method_not_allowed'); return true
        }

        fail(res, 404, 'route_not_found')
        return true
      } catch (cause: any) {
        const message = String(cause?.message ?? cause)
        if (message.includes('不存在')) { fail(res, 404, message); return true }
        console.warn('[dsh-workbench] 灵感接口失败：', message, path)
        fail(res, 500, message)
        return true
      }
    })()
  }

  function registerTools(ctx: any): void {
    const tools = ctx?.tools
    if (tools === undefined || typeof tools.register !== 'function') {
      console.warn('[dsh-workbench] tools 服务不可用：灵感工具未注册')
      return
    }
    const register = (tool: any, label: string): void => {
      if (typeof ctx.effect === 'function') ctx.effect(() => tools.register(tool), `workbench: ${label}`)
      else tools.register(tool)
    }

    register({
      name: 'workbench_idea_expand',
      description: '把 AI 发散出的节点写入灵感图。可分批调用（先方向、后点子）；nodes 用 n1..nN，parentId 指向父节点；最后一次调用必须带 final:true 以生成版本。',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          ideaId: { type: 'string', description: '灵感 id。' },
          runId: { type: 'string', description: '本次生成 runId（由工作台生成接口返回）。' },
          mode: { type: 'string', enum: ['diverge', 'continue'], description: '首次发散或继续发散。' },
          targetNodeId: { type: 'string', description: '继续发散的目标节点 id（mode=continue 时必填）。' },
          nodes: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['direction', 'idea', 'question', 'risk'] },
                label: { type: 'string', description: '一句话点子，≤24 字。' },
                detail: { type: 'string', description: '为什么成立，≤120 字。' },
                parentId: { type: 'string' },
                angle: { type: 'string', description: 'users / pain / form / tech / biz / risk / cross。' },
              },
              required: ['id', 'label'],
            },
          },
          edges: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { from: { type: 'string' }, to: { type: 'string' }, kind: { type: 'string', enum: ['tree', 'relate'] }, label: { type: 'string' } },
              required: ['from', 'to'],
            },
          },
          summary: { type: 'string', description: '一句话总结本次发散。' },
          final: { type: 'boolean', description: '是否为最后一批：true 时把草稿冻结成版本。' },
        },
        required: ['ideaId', 'runId', 'nodes'],
      },
      output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已写入 ${v.added ?? 0} 个节点（共 ${v.nodes ?? 0}）${v.versionId ? '，已生成版本' : ''}` : `写入失败：${String(v?.error ?? '')}` }] },
      async execute(args: any): Promise<any> {
        try {
          const ideaId = String(args?.ideaId ?? '')
          const runId = String(args?.runId ?? '')
          const run = store.getRun(runId)
          if (!run || run.ideaId !== ideaId) return { ok: false, error: 'run 不存在或不属于该灵感' }
          const draft = store.getDraft(ideaId)
          const patch = normalizeGraph({ rootId: draft.graph.rootId, nodes: args?.nodes, edges: args?.edges }, {})
          if (patch.graph.nodes.length <= 1) return { ok: false, error: '没有可写入的节点' }
          const merged = mergeGraph(draft.graph, patch, args?.targetNodeId)
          const saved = store.setDraft(ideaId, merged.graph, undefined)
          const issues = merged.issues
          const log = pushRunLog(run.log, `写入 ${patch.graph.nodes.length - 1} 个节点${issues.length > 0 ? `（${issues.length} 条被修正）` : ''}`)
          const step = Math.min(Number(run.total ?? 5), Number(run.step ?? 0) + 1)
          store.updateRun(runId, { step, message: String(args?.summary ?? '正在落图').slice(0, 200), log })
          let versionId: string | undefined
          if (args?.final === true) {
            const finished = store.finalizeRun(runId, { summary: args?.summary, inputDigest: inputDigest(store.listInputs(ideaId)) })
            versionId = finished?.versionId ?? undefined
            if (issues.length > 0) store.updateRun(runId, { log: pushRunLog(store.getRun(runId)?.log, issues.map(i => `${i.code}：${i.message}`).join('；')) })
          }
          return { ok: true, added: patch.graph.nodes.length - 1, nodes: merged.graph.nodes.length, rev: saved.rev, versionId, issues }
        } catch (cause: any) {
          return { ok: false, error: String(cause?.message ?? cause) }
        }
      },
    }, 'idea expand tool')

    register({
      name: 'workbench_idea_progress',
      description: '灵感发散的进度上报。开始时 step=0 status=running；每个里程碑调用一次；结束时 status=done（会自动冻结版本）或 failed。',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          ideaId: { type: 'string' },
          runId: { type: 'string' },
          step: { type: 'number' },
          total: { type: 'number' },
          status: { type: 'string', enum: ['running', 'done', 'failed'] },
          message: { type: 'string' },
        },
        required: ['ideaId', 'runId', 'status'],
      },
      output: { schema: {}, render: (_a: unknown, v: any) => [{ type: 'text', text: v?.ok ? `已更新进度：${String(v.run?.status ?? '')}` : `更新失败：${String(v?.error ?? '')}` }] },
      async execute(args: any): Promise<any> {
        try {
          const ideaId = String(args?.ideaId ?? '')
          const runId = String(args?.runId ?? '')
          const run = store.getRun(runId)
          if (!run || run.ideaId !== ideaId) return { ok: false, error: 'run 不存在' }
          const status = args?.status === 'done' ? 'done' : args?.status === 'failed' ? 'failed' : 'running'
          const log = pushRunLog(run.log, String(args?.message ?? status))
          store.updateRun(runId, {
            status: status === 'done' ? 'running' : status,
            step: args?.step, total: args?.total,
            message: String(args?.message ?? '').slice(0, 200),
            log,
            ...(status === 'failed' ? { finished: true, error: String(args?.message ?? '生成失败') } : {}),
          })
          if (status === 'failed') store.setStatus(ideaId, 'draft')
          if (status === 'done') store.finalizeRun(runId, { summary: args?.message, inputDigest: inputDigest(store.listInputs(ideaId)) })
          return { ok: true, run: store.getRun(runId) }
        } catch (cause: any) {
          return { ok: false, error: String(cause?.message ?? cause) }
        }
      },
    }, 'idea progress tool')
  }

  return { store, handle, registerTools }
}

export { IDEA_ANGLES, IDEA_LIMITS, normalizeGraph }
