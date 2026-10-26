# 设计流水线（导图 → 模块 → 设计文档）

> 适用版本：1.11.0 ｜ 相关代码：`src/shared/product-graph-model.ts`、`src/host/index.ts`（product-* 段）、`src/client/app.ts`（产品域）
> 自检：`node scripts/verify-product-map.mjs` / `verify-product-module.mjs` / `verify-product-docs.mjs` / `verify-product-archive.mjs`

## 1. 为什么颠倒顺序

早期实现是「导图 → AI 拆模块 → 按模块写笔记」。问题：模块是 AI 对图的一次性解释，写完就丢了推导依据；文档只能被动跟着模块，无法反过来修正结构。

现行顺序把**文档**放在模块之前：

```
导图（唯一事实基准）
  → ① 业务模块设计文档（kind=module_design）
  → ② 从文档提炼模块（modules 表）
  → ③ 产品设计文档（kind=product_design，单份或分册）
  → ④ 交叉检查，以导图为基准修复文档与模块
```

理由：文档能承载「为什么这样拆」的论证与边界，模块只是它的结构化投影。所以模块应当可重建（②可反复跑），而文档是主要资产。

## 2. 四个阶段

### ① 业务模块设计文档

- 输入：参与生成的导图（可多选）+ 已有文档清单。
- 粒度：每张图的每个分组节点（`kind=module|business`）一份；没有分组时按功能聚类自行归纳。
- 结构：模块背景 / 业务目标与指标 / 角色与权限 / 核心流程（含异常分支）/ 数据与字段 / 与其他模块的边界与依赖 / 多端差异 / 非功能要求 / 验收标准。
- 硬约束：只依据导图事实；导图没写的写「待确认」，不许编造。
- 落库：`kind=module_design`，`doc_key = md:<moduleId>`（模块尚不存在时先按标题独立成篇，②之后可补 moduleId）。

### ② 从文档提炼模块

- 输入：①产出的文档清单（标题 + noteId + moduleId）。
- 动作：**读文档正文**归纳「产品→模块→业务→功能/需求」，用 `workbench_module_publish` 落库。
- 幂等：`(product_id, map_id, name, kind)` upsert，重跑不产生重复。
- 冲突处理：文档与导图不一致时，**以导图为基准**，并在模块 `description` 里注明冲突点。
- 反向回写：`workbench_product_note_publish` 带 `moduleId` 时，模块的 `note_id` 与 `status='designed'` 会被回填。

### ③ 产品设计文档

- 建议规则：模块数 ≤ 6 → 单份；> 6 → 按模块分册（每模块一份 + 一份总纲）。**可手动覆盖建议**。
- 内容边界：只写跨模块的东西——产品定位与目标用户 / 整体信息架构 / 核心用户旅程 / 模块职责矩阵 / 模块间依赖与数据流 / 分阶段路线图 / 全局性约束（权限·合规·性能）/ 风险 / 整体验收。
- 禁止：整段复制模块设计文档。
- 落库：`kind=product_design`；`doc_key = pd:<产品>`（单份）或 `pd:<产品>:<模块>`（分册）——**与模块设计的 `md:<模块>` 隔离**，不会互相覆盖。

### ④ 交叉检查与修复

四方比对，输出四类偏差：

| 类型 | 含义 | 处理 |
| --- | --- | --- |
| A | 导图有、模块缺 | 补模块；若属结构遗漏，给出导图节点建议（不直接改图） |
| B | 模块有、导图没有 | 标记「待确认」，**不自删** |
| C | 有模块、无模块设计文档 | 补写 `module_design` |
| D | 产品文档 ↔ 模块文档矛盾 | 以导图解为准改写，并在文档内标注冲突 |

产出：`kind=product_design`、标题「产品名 · 设计一致性检查报告」的 Markdown 表格。

**绝不修改导图本身**——导图只能人工编辑，或通过有版本可回滚的导入修改。

## 2.5 素材来源：网站 / 截图 → 导图

导图不只是人画出来的，也可以从外部素材提炼：

- **入口**：新建导图 → 来源选「AI 分析素材生成（网站 / 截图）」。
- **素材类型**：多个网站链接 + 多张截图（前端压到 ≤1600px webp），可加补充说明限定关注点。
- **落盘**：截图存 `<工作区>/.dsh-workbench/products/<id>/inputs/<随机>.<ext>`，元数据进 `product_inputs` 表（按产品归属，可跨导图复用）。
- **提炼流程**：派发给团队（`feature=product.design`）→ AI 逐个读图/抓链接 → 归纳共性结构（多素材重复出现的合并，单素材孤证标注待确认）→ 逐节点调 `workbench_map_node_publish` 落图。
- **写入语义**：`workbench_map_node_publish` 内部走 `saveMapDraft`，所以 `draft_rev` 递增、版本可回滚、文件镜像同步；同名同 kind 且同父 = 更新而非新增（幂等）。
- **边界**：素材提炼只产结构，不写设计文档；文档仍由流水线阶段 ① 生成。

## 3. 多导图与增量

- **联合生成**：面板多选导图，`pipelineMapContext` 按图分节汇总（分组节点 / 功能与需求），提示词带全部 `mapId`。
- **增量**：只处理「节点改动过 / 尚无文档」的部分；**依赖 `doc_key` 幂等**，否则增量会退化成重复堆叠。

## 4. 执行与可观测

- **团队派发**：每阶段独立 `startAgentDispatch`（`feature=product.design`，`allowNoIdea`），按团队绑定自动选成员。
- **页内会话**：`createAgentChat` 展示流式事件、成员/任务投影，支持停止与重开外部会话。
- **进度**：`product_progress`（`kind=modules|notes`），3 秒轮询；提示词要求开始/每篇/完成各上报一次。
- **串行**：`runPipeline` 每步派发后轮询 `waitForStageSettled` 直到 `done`（超时 20 分钟）才进下一阶段；失败即停。**分步模式**下一次只跑一步，其余由「继续下一步」推进。
- **已知限制**：进度准确性依赖 AI 主动调用 `product_progress_publish`；漏报会一直等到超时。判断真实进展请看页内会话。

## 5. 数据模型

```
products          产品壳（工作区 / 笔记本 / archived_at）
product_maps      每张导图：graph_json(v2) + draft_rev + current_version_id + source/source_ref
product_map_versions  导图版本（seq / label / source / graph_json / node_count）
modules           product_id + map_id + parent_id + kind + platform + node_id + note_id + status + archived_at
notes             kind(module_design|product_design|feature_design) + node_id + module_id + doc_key + map_id + archived_at
product_progress  生成进度（kind + step/total + status + log + session_id）
```

关键约束：

- `notes.doc_key` 唯一索引（`WHERE doc_key <> ''`）——同 scope 重跑更新而非新增。
- `modules` 幂等键 `(product_id, map_id, name, kind)`。
- 三张表都有 `archived_at`，列表默认过滤，`?archived=1` 查看全部。

## 6. 工作区文件镜像

```
<工作区>/.dsh-workbench/products/<产品id>/
  mindmap.json                  v1 兼容镜像（第一张图）
  maps/<mapId>.json             v2 图
  demo/<style>/<scope>-xxxx.html
<工作区>/.dsh-workbench/notes/<笔记本>/<标题>-<noteId>.md
```

## 7. 自检覆盖

| 脚本 | 覆盖 |
| --- | --- |
| `verify-product-map.mjs` | 图模型迁移/规范化、草稿乐观锁、版本序列、跨图引用级联、灵感导入 |
| `verify-product-module.mjs` | 模块 CRUD、局部更新不丢字段、幂等、进度 upsert |
| `verify-product-docs.mjs` | `doc_key` 幂等、kind 归类、归档字段 |
| `verify-product-archive.mjs` | 归档过滤、`archived=1`、分册与模块设计不撞键 |
| `verify-bundle.mjs` | 打包产物断言（含产品域能力清单） |
