# UI 设计与 DEMO 生成（1.13）

> 设计文档：`设计文档/00-决策记录.md` ～ `04-实施计划.md`
> 自检：`scripts/verify-theme.mjs`、`verify-ui-design.mjs`、`verify-demo.mjs`、`verify-ui-demo-tools.mjs`、`verify-demo-page-patch.mjs`、`verify-demo-files.mjs`、`verify-gen-context.mjs`、`verify-demo-cleanup.mjs`

## 1. 数据表

| 表 | 用途 | 关键字段 |
| --- | --- | --- |
| `themes` | 主题库（预置 + 自定义） | `tokens`(JSON 渲染令牌)、`spec`(Markdown 规范)、`builtin`、`source` |
| `ui_designs` | 页面级 UI 设计 | `project_id`、`pages`(JSON 页面清单)、`doc_key`(幂等)、`theme_id` |
| `demos` | DEMO 主体 | `layout_mode`(single\|multi，**创建后不可变**)、`current_version_id` |
| `demo_versions` | 版本 | `seq`、`source`(ai\|page-patch\|theme\|restore)、`target_page` |
| `demo_files` | 文件索引 | `path`、`role`(entry\|page\|asset)、`bytes` |

`project_id` 必填、`product_id` 可选（D1：以项目为根，兼容产品）。

## 2. REST

| 端点 | 方法 | 说明 |
| --- | --- | --- |
| `/themes` | GET / POST | 列表（`?platform=` `?archived=1`）/ 新建或更新 |
| `/themes/:id` | DELETE | 内置主题拒绝删除（400 `builtin_locked`） |
| `/themes/archive` | POST | 归档 / 恢复 |
| `/ui-designs` | GET / POST | 列表（`?projectId=`）/ 新建或更新（页面清单 schema 校验） |
| `/ui-designs/:id` | GET / DELETE | 详情 / 删除 |
| `/ui-designs/:id/pages/:pageId` | PATCH | **按页更新**（D4），断言其它页不变 |
| `/ui-designs/archive` | POST | 归档 |
| `/demos` | GET / POST | 列表 / 创建或更新（改 `layout_mode` → 400 `layout_mode_immutable`） |
| `/demos/:id` | GET / DELETE | 详情（含版本）/ 删除（级联文件与目录） |
| `/demos/:id/view` | GET | 回 HTML（多文件按 `?page=`） |
| `/demos/:id/pages/:pageId` | GET / PATCH | 提取单页片段 / 写回（按页优化） |
| `/demos/versions` | POST | 新建版本 |
| `/demos/:id/rollback` | POST | 回滚（= 新建 restore 版本） |
| `/demos/:id/versions/:vid` | DELETE | 删版本（不可删当前、至少留 1） |
| `/files/tree` | GET | 只读文件树（防穿越、深度≤6、≤500 项） |
| `/ui-demo/context` | GET | 一次取齐项目/产品/素材/主题/UI 设计 |

## 3. Agent 工具

| 工具 | 用途 | 硬约束 |
| --- | --- | --- |
| `workbench_ui_doc_publish` | 写页面清单 + 规范 | 每页必有 `id/route/≥1 block`；`id` 唯一 |
| `workbench_demo_publish` | 交付 DEMO | 单文件校验 `data-page` 锚点齐全；多文件必须有 `index.html`；路径穿越拒绝 |
| `workbench_theme_publish` | 保存主题 | 必须同时给 `spec` + `tokens` |

## 4. 按页优化（D4）

```
GET  /demos/:id/pages/:pageId         → 取该页片段（单文件按标签配对截取）
   ↓ AI 只重写这一页
PATCH /demos/:id/pages/:pageId        → 校验：
     1) 不能是整份文档（禁 <html>/<body>）
     2) 必须保留 data-page="<pageId>"
     3) 锚点总数不变
     4) 其它页锚点数不变
   ↓ 通过
创建 page-patch 版本（记 target_page）
```

失败一律不写文件。

## 5. 旧 Demo 清理（D6，已执行一次）

`migrateDemoCleanup()` 严格五步，任一步失败即中止且不写标记：

1. 导出 `demos.json` + 复制产物文件到 `~/.dsh/backup/demo-<时间戳>/`
2. 校验：JSON 可解析且条目数与库一致；写 `MANIFEST.txt`
3. 事务删 `product_demos` / `product_demo_progress`（保留空表）
4. 删各工作区 `.dsh-workbench/products/<id>/demo/`
5. 写 `meta.demo_cleanup_done=1`

## 6. 已知限制

- 按页优化依赖 AI 只返回片段；返回整份会被拒绝并要求重试。
- 多文件模式的入口导航（`index.html`）由 AI 生成，切换页面时会丢失当前页状态。
- `layout_mode` 不可变意味着换模式需删除重建（会丢版本历史），UI 已双重提示。
- 单文件模式下页面很大时（>2MB）建议改用多文件模式。
