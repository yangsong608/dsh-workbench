/**
 * UI 设计 / DEMO / 主题 的提示词构造（1.13）
 *
 * 原则（见 02-技术分析.md §5.2）：
 * - 完整文档只在「本阶段直接需要」时全文注入，其余给摘要 + id 由 Agent 按需读取；
 * - 输出契约必须显式给出（pages schema / data-page 锚点 / spec+tokens），否则 AI 产出无法落库。
 */

export const UI_DESIGN_SCHEMA_HINT = `输出契约（必须遵守）：
用工具 workbench_ui_doc_publish 一次写完，参数：
- projectId、name、themeId、platform
- pages: 页面数组，每项形如
  { "id":"page-login", "name":"登录", "route":"/login", "platform":"all",
    "goal":"一句话说明这页要解决什么",
    "blocks":[{"id":"blk-login-1","role":"header","desc":"品牌 + 返回"}],
    "states":["默认","格式错误","登录中"],
    "interactions":["获取验证码 → 60s 倒计时"],
    "dataNeeds":["手机号","验证码"] }
硬约束：
1. 每页必须有 id / route / 至少 1 个 block；
2. id 全局唯一，形如 page-<slug>；block id 形如 blk-<pageSlug>-<n>；
3. role 取值建议：header / nav / list / form / card / table / footer / empty；
4. 页面数量与真实产品一致，不要为凑数拆分；
5. 只写页面结构与交互，不写实现代码。`

export const DEMO_CONTRACT_HINT = `输出契约（必须遵守）：
用工具 workbench_demo_publish 交付，参数 projectId / demoId / html（单文件）或 files（多文件）。
硬约束：
1. 单文件模式：一个完整 HTML，内联 CSS/JS，零外部依赖（禁 <link>、禁 src="http…"）；
2. 多文件模式：index.html 作为入口导航，每页 pages/<pageId>.html；
3. **每个页面必须带锚点**：<div data-page="page-xxx"> 或 <section data-page="page-xxx">，
   其中 data-page 的值必须与 UI 设计页面清单的 id 完全一致；
4. 遵守给定主题令牌（颜色/圆角/密度/字体气质），不要自创另一套视觉；
5. 页面数量必须与页面清单一致，不多不少；
6. 交付前自检：data-page 数量 == 页面数。`

export const THEME_CONTRACT_HINT = `输出契约（必须遵守）：
用工具 workbench_theme_publish 一次写完，两份产物缺一不可：
1. spec（Markdown 设计规范）：必须包含以下 6 节
   ## 1. 色彩体系（主色/辅色/语义色/中性阶，含取值）
   ## 2. 字体层级（H1–caption 的字号/行高/字重）
   ## 3. 间距与圆角（刻度 + 圆角档位 + 阴影档位）
   ## 4. 组件变体（按钮/输入/卡片/表格/导航）
   ## 5. 密度与动效
   ## 6. 无障碍（对比度与触控目标）
2. tokens（JSON）：至少包含
   { "bg":"#…","surface":"#…","text":"#…","muted":"#…","line":"#…",
     "accent":"#…","accentInk":"#…","radius":<0-48 数值>,
     "font":"system|serif|mono|rounded",
     "density":"compact|comfortable|spacious",
     "shadow":"none|soft|strong","motion":"none|subtle|expressive" }
硬约束：
- 颜色必须是合法 CSS 颜色；radius 必须是 0–48 的数字；
- 规范与令牌必须一致（令牌里的主色要能在规范里找到出处）；
- 若素材不足（如截图读不到），在 spec 末尾注明「未参与素材」，不要编造。`

export interface PromptContext {
  projectName: string
  productName?: string
  productDescription?: string
  mapSummary?: string
  productDocSections?: string
  moduleDocLines?: string[]
  themeSpec?: string
  themeTokens?: unknown
  inputs?: Array<{ kind: string; url?: string; filePath?: string; label?: string }>
  platform?: string
  pageCount?: number
  requirement?: string
  pageList?: Array<{ id: string; name: string; route: string }>
  targetPage?: { id: string; name: string; html?: string }
  layoutMode?: 'single' | 'multi'
}

function section(title: string, body: string | undefined): string {
  if (body === undefined || body.trim() === '') return ''
  return `§ ${title}\n${body.trim()}`
}

/** UI 设计生成提示词。 */
export function buildUiDesignPrompt(ctx: PromptContext): string {
  const parts = [
    `项目：${ctx.projectName}`,
    ctx.productName !== undefined ? `产品：${ctx.productName}｜${ctx.productDescription ?? ''}` : '（独立模式：无关联产品）',
    section('导图结构摘要', ctx.mapSummary),
    section('产品设计文档（关键段落）', ctx.productDocSections),
    section('模块设计（标题 + 一句话）', (ctx.moduleDocLines ?? []).join('\n')),
    section('主题规范', ctx.themeSpec),
    ctx.themeTokens !== undefined ? `主题令牌：${JSON.stringify(ctx.themeTokens)}` : '',
    section('参考素材', (ctx.inputs ?? []).map(i => i.kind === 'image'
      ? `- 截图：${i.filePath ?? ''}（请先读取该图片）`
      : `- 链接：${i.url ?? ''}（抓不到就跳过并说明）`).join('\n')),
    `目标端：${ctx.platform ?? 'all'}${ctx.pageCount !== undefined ? `｜期望页面数：约 ${ctx.pageCount}` : ''}`,
    ctx.requirement !== undefined ? `额外要求：${ctx.requirement}` : '',
    '你是资深产品设计师。请把以上「产品详细设计」转成**页面级 UI 设计文档**：页面清单（页面 / 区块 / 状态 / 交互）+ 设计规范。只写结构与交互，不写代码。',
    UI_DESIGN_SCHEMA_HINT,
  ]
  return parts.filter(p => p !== '').join('\n\n')
}

/** DEMO 生成提示词。 */
export function buildDemoPrompt(ctx: PromptContext): string {
  const pages = (ctx.pageList ?? []).map(p => `- ${p.id}｜${p.name}｜${p.route}`).join('\n')
  const parts = [
    `项目：${ctx.projectName}`,
    ctx.productName !== undefined ? `产品：${ctx.productName}` : '',
    section('页面清单（必须一一对应）', pages),
    section('主题规范', ctx.themeSpec),
    ctx.themeTokens !== undefined ? `主题令牌（严格遵守）：${JSON.stringify(ctx.themeTokens)}` : '',
    section('参考素材', (ctx.inputs ?? []).map(i => i.kind === 'image'
      ? `- 截图：${i.filePath ?? ''}（请先读取该图片）`
      : `- 链接：${i.url ?? ''}`).join('\n')),
    `布局模式：${ctx.layoutMode === 'multi' ? '多文件（每页一个 HTML + 入口 index.html）' : '单文件（一个 HTML 内导航切换）'}`,
    `目标端：${ctx.platform ?? 'all'}`,
    ctx.requirement !== undefined ? `额外要求：${ctx.requirement}` : '',
    '你是资深前端工程师 + 视觉设计师。请按页面清单产出可交互 HTML DEMO。视觉必须服从主题令牌，不要自创风格。',
    DEMO_CONTRACT_HINT,
  ]
  return parts.filter(p => p !== '').join('\n\n')
}

/** 按页优化提示词（D4：只重写一页）。 */
export function buildPagePatchPrompt(ctx: PromptContext): string {
  const page = ctx.targetPage
  const parts = [
    `项目：${ctx.projectName}`,
    page !== undefined ? `目标页：${page.id}｜${page.name}` : '目标页：（未知）',
    section('主题规范', ctx.themeSpec),
    ctx.themeTokens !== undefined ? `主题令牌：${JSON.stringify(ctx.themeTokens)}` : '',
    section('需要修改的要求', ctx.requirement),
    page?.html !== undefined ? `§ 当前该页 HTML\n\`\`\`html\n${page.html}\n\`\`\`` : '',
    `请**只重写这一页**的 HTML 片段，要求：
1. 保持根元素上的 data-page="${page?.id ?? ''}" 不变；
2. 不要输出整份文档，不要包含 <html>/<head>/<body> 或其它页面；
3. 视觉继续服从主题令牌；
4. 只返回片段本身，不要额外解释。`,
  ]
  return parts.filter(p => p !== '').join('\n\n')
}

/** 主题生成提示词（D2/D3：综合描述 → 规范 + 令牌）。 */
export function buildThemePrompt(ctx: PromptContext): string {
  const inputs = (ctx.inputs ?? []).map(i => {
    if (i.kind === 'image') return `- 截图：${i.filePath ?? ''}（请先读取该图片，提取主色/明暗/圆角气质/信息密度）`
    if (i.kind === 'url') return `- 网址：${i.url ?? ''}（抓取页面主色与视觉气质；失败就跳过并说明）`
    return `- 文字：${i.label ?? ''}`
  }).join('\n')
  const parts = [
    '你是资深视觉设计师。请综合以下素材，产出一套**统一的设计规范 + 渲染令牌**。',
    section('文字描述', ctx.requirement),
    section('参考素材（综合归纳，不要照搬）', inputs),
    `目标端：${ctx.platform ?? 'all'}`,
    THEME_CONTRACT_HINT,
  ]
  return parts.filter(p => p !== '').join('\n\n')
}
