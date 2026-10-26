/**
 * 测试模块提示词（1.14）
 *
 * 两段式（T6/T7）：
 *   ① buildTestDesignPrompt —— 按角色分组的「测试设计文档」（写笔记）
 *   ② buildTestCasesPrompt  —— 从该文档提炼结构化用例（写 test_cases）
 */

export const TEST_DESIGN_SCHEMA_HINT = `输出契约（必须遵守）：
用工具 workbench_test_doc_publish 一次写完，参数：
- projectId、planId、name、productId、uiDesignId、demoId、platform
- content: Markdown 测试设计文档，**必须按角色分组**，结构如下：

# <产品名> · 测试设计

## 1. 测试范围
- 覆盖页面：page-xxx（页面名）、…
- 不在范围：（明确列出不测的）
- 版本基线：UI 设计 <id>@v<n> / DEMO <id>@v<n>

## 2. 角色清单
| 角色 | 说明 | 主要关注点 |
| --- | --- | --- |
| 新用户 | 首次使用，无历史数据 | 引导、空态、首单流程 |
| 老用户 | 有历史订单 | 快捷复购、默认值 |
…（角色由你从产品设计与页面清单推导，3–6 个）

## 3. 按角色的测试场景
### 3.1 新用户
#### 场景：首次进入首页
- 关注点：空态是否有引导、主 CTA 是否可见
- 前置条件：无任何订单
- 预期方向：明确告知下一步
- 涉及页面/区块：page-home / b1(header) b5(empty)

### 3.2 老用户
…

## 4. 跨角色与异常
- 弱网、超时、权限不足、并发冲突、数据为空

## 5. 优先级与风险
- P0（阻断主流程）/ P1 / P2，并说明理由

## 6. 未覆盖与待确认
- 明确列出本轮做不到或需要产品确认的点

硬约束：
1. 每个场景必须写「涉及页面/区块」，用页面清单里的真实 id；
2. 角色数量 3–6 个，不要为凑数造角色；
3. 只写测试设计，不写具体用例步骤（那是下一段的事）。`

export const TEST_CASES_SCHEMA_HINT = `输出契约（必须遵守）：
用工具 workbench_testcase_publish 逐条写入（每条用例调用一次，或分批多调用），参数：
- projectId、planId
- title：一句话（≤60 字），形如「首页 · 新用户 · 空态显示引导」
- precondition：前置条件
- steps：字符串数组（3–8 步，每步一个动作）
- expected：预期结果（可验证）
- priority：P0/P1/P2/P3
- type：functional|boundary|exception|permission|regression
- role：来自测试设计文档的角色
- uiDesignId / demoId / pageId / blockId：**必须填**，取自文档里的「涉及页面/区块」
- platform：pc|mobile|tablet|all
- designVersion：本轮基线版本（形如 v3）

硬约束：
1. 每条用例必须能对应到具体的 page_id（和 block_id，若有）；
2. 步骤要具体到「点哪个按钮 / 填什么值」，不要写「测试登录功能」；
3. expected 必须可验证（「显示 X」而不是「正常工作」）；
4. 覆盖文档里的每个角色与每个场景，不要漏；异常与边界至少占 20%。`

export interface TestContextInput {
  projectName: string
  workspacePath?: string
  productName?: string
  productDescription?: string
  platform?: string
  /** UI 设计页面清单（含区块/状态/交互） */
  pages?: Array<{
    id: string; name: string; route: string; goal?: string
    blocks?: Array<{ id: string; role: string; desc: string }>
    states?: string[]; interactions?: string[]
  }>
  uiDesignId?: string
  uiDesignVersion?: string
  demoId?: string
  demoVersion?: string
  demoEntry?: string
  /** 产品设计文档摘要 */
  productDoc?: string
  scopePages?: string[]
  requirement?: string
  /** 已有测试设计文档（第二段用） */
  designDoc?: string
}

function section(title: string, body: string | undefined): string {
  if (body === undefined || body.trim() === '') return ''
  return `§ ${title}\n${body.trim()}`
}

function pagesBlock(pages: TestContextInput['pages']): string {
  if (pages === undefined || pages.length === 0) return ''
  return pages.map(p => {
    const blocks = (p.blocks ?? []).map(b => `${b.id}(${b.role})`).join(' ')
    const states = (p.states ?? []).length > 0 ? `｜状态：${(p.states ?? []).join('、')}` : ''
    const acts = (p.interactions ?? []).length > 0 ? `｜交互：${(p.interactions ?? []).join('、')}` : ''
    return `- ${p.id}｜${p.name}｜${p.route}${p.goal !== undefined ? `｜目标：${p.goal}` : ''}\n  区块：${blocks}${states}${acts}`
  }).join('\n')
}

/** ① 测试设计文档提示词（按角色分组）。 */
export function buildTestDesignPrompt(ctx: TestContextInput): string {
  const scope = (ctx.scopePages ?? []).length > 0 ? `本次覆盖页面（只看这些）：${(ctx.scopePages ?? []).join('、')}` : ''
  const parts = [
    `测试设计任务：${ctx.projectName}`,
    '',
    '你是资深 QA 架构师 + 产品测试专家。请为下面的产品写一份**按角色分组的测试设计文档**。',
    '',
    section('产品', `${ctx.productName ?? '（未命名）'}${ctx.productDescription !== undefined ? `\n${ctx.productDescription}` : ''}`),
    section('目标端', ctx.platform),
    section('UI 设计页面清单（真实 id，测试场景必须引用）', pagesBlock(ctx.pages)),
    section('DEMO 产物', ctx.demoEntry !== undefined ? `- ${ctx.demoEntry}` : ''),
    section('版本基线', ctx.uiDesignId !== undefined || ctx.demoId !== undefined
      ? `- UI 设计：${ctx.uiDesignId ?? '无'}${ctx.uiDesignVersion !== undefined ? `@${ctx.uiDesignVersion}` : ''}\n- DEMO：${ctx.demoId ?? '无'}${ctx.demoVersion !== undefined ? `@${ctx.demoVersion}` : ''}`
      : ''),
    section('产品设计文档（关键段落）', ctx.productDoc),
    section('范围限定', scope),
    section('额外要求', ctx.requirement),
    TEST_DESIGN_SCHEMA_HINT,
  ]
  return parts.filter(p => p !== '').join('\n')
}

/** ② 从设计文档提炼用例的提示词。 */
export function buildTestCasesPrompt(ctx: TestContextInput): string {
  const parts = [
    `测试用例提炼任务：${ctx.projectName}`,
    '',
    '你是资深 QA。请把下面的**测试设计文档**提炼成可逐条执行的结构化用例，用工具写入。',
    '',
    section('测试设计文档（唯一依据）', ctx.designDoc),
    section('UI 设计页面清单（填写 pageId/blockId 时必须用这里的真实 id）', pagesBlock(ctx.pages)),
    section('版本基线（填 designVersion）', ctx.uiDesignVersion ?? ctx.demoVersion ?? ''),
    section('额外要求', ctx.requirement),
    TEST_CASES_SCHEMA_HINT,
  ]
  return parts.filter(p => p !== '').join('\n')
}
