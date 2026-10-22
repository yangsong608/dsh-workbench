# 智能体团队 · R0 Spike 结论（2026-10-23）

> 方法：源码核对 + 本机可执行探针（不依赖真实模型会话的部分）；标注"待运行时"的项需要在 DSH 窗口里用真实会话确认。

## 结论总表

| ID | 验证内容 | 结论 | 证据 | 后续 |
|---|---|---|---|---|
| S1 | 面板内订阅会话事件、回放历史 | **源码层通过，运行时待确认** | 客户端包 `packages/client/file-upload/src/index.ts:80`、`product-analytics/src/index.ts:55` 均用 `ctx.on('session/event', (session,event)=>…)`；`@Remote` 会话控制器提供 `attach`（返回 `events` 快照）与 history 页 | R1 实现后由用户在窗口内验证流式与刷新补齐 |
| S2 | 读取 `agentTeam` 投影 | **可行** | `ClientSessions` 公开 `readonly list: SnapshotStore<SessionListState>`（`service.ts:243`），快照含 `projectionsBySession[sessionId]`；官方 Team UI 正是读 `state.projectionsBySession[leadSessionId]?.values.agentTeam`（`TeamAction.tsx:193`） | R1 直接读 `sessions.list`，加能力探测；读不到降级解析工具事件 |
| S3 | 提示词驱动建 7 人团队 | **无法离线验证** | 需要真实模型会话 | R1 先实现 kickoff + 事件校验；由用户在窗口内跑一次；若不稳定，提前 R3 的 host 确定性建队 |
| S4 | 成员调用工作台工具 | **可行（源码）** | `ctx.tools.register` 注册即进入 profile 工具集，系统提示按 agent 限制收窄（`packages/core/tools/README.zh.md`）；团队成员同 profile | R1 保留全局注册；运行时确认成员可调用 `workbench_idea_expand` |
| S6 | 会话指定模型 | **部分可行** | `session.create` 不接受模型；Host 有 `@Remote('selectModel')`，但客户端 `ClientSessions` 未暴露同名方法 | R1 用默认模型；成员级模型推迟到 R3（走 host 或 `sessions.remote`） |
| S8 | 成员级工具策略（read 不能写） | **实验版不支持** | `spawn_teammate` 请求只有 name/description/prompt/context/provider/cancellation；`@nanmicoder/dsh-agent-teams` 支持 `tool_policy`，但走的是另一套团队协议（需审批） | R1 用 kickoff 软约束 + DSH 审批 + 审计，UI 标注"软约束"；R3 再评估切换/合并 |

## 对实施计划的影响

1. **不阻塞 R1**：S1/S2/S4 有源码级证据，按计划实现并加能力探测；S3 先按提示词驱动实现，保留 host 直连后路。
2. **权限降级**：R1 的 `fileWrite` 只做"声明 + 软约束 + 审计"，不承诺硬隔离；R3 再补硬约束。
3. **模型**：R1 全部用 DSH 默认模型；成员级模型放 R3。
4. **需要用户参与的一次验证**：R1 完成后，在 DSH 窗口里跑一次真实发散，确认 S1/S3/S4。

## 待运行时确认清单（R1 验收时执行）

- [ ] 预览抽屉能实时出现主理人/成员消息
- [ ] 关闭再打开抽屉，历史从 attach 快照补齐
- [ ] Lead 按 kickoff 建出 7±1 成员、任务板非空
- [ ] 成员调用 `workbench_idea_expand` 成功写节点
- [ ] read 成员写文件被审批/拒绝（或确认仅软约束）
