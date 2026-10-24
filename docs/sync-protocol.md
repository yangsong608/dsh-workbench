# 工作台增量同步协议（P1-1）

> 适用版本：dsh-workbench v1.10.0 · P1-1
> 范围：任务 / 记事本 / 笔记本 / 新闻订阅 / 专注记录 / 空间（6 类实体）
> 目标：手机端不再整份拉取 + 整份回写，改为「首次全量快照（`/state`）+ 之后游标增量（`/sync/*`）」。

所有端点都挂在现有前缀 `/workbench-api` 下，JSON 响应风格与既有接口一致：

```bash
# 端口以实际 DSH web 地址为准（例如 http://127.0.0.1:63174）
BASE=http://127.0.0.1:63174/workbench-api

curl -s "$BASE/sync/meta"
curl -s "$BASE/sync/delta?since=0&limit=200"
curl -s -X POST "$BASE/sync/push" -H 'content-type: application/json' \
  -d '{"changes":[{"entity":"tasks","id":"t1","op":"upsert","updatedAt":"2026-10-24 20:00:00","row":{"title":"改标题","status":"doing"}}]}'
```

不做鉴权（与现状一致，只适用于回环/本机访问）。JSON 兜底存储（没有 `node:sqlite` 的环境）下三个端点返回 `501 {"error":"sync_requires_sqlite"}`。

---

## 1. 端点

### 1.1 `GET /sync/meta`

各实体的存活条数与最新时间戳，用于判断「要不要拉」「客户端是否已是最新」。

```json
{
  "entities": {
    "tasks":          { "count": 12, "maxUpdatedAt": "2026-10-24 20:40:02" },
    "notes":          { "count": 30, "maxUpdatedAt": "2026-10-24 20:39:11" },
    "notebooks":      { "count": 3,  "maxUpdatedAt": "2026-10-23 09:12:00" },
    "news_topics":    { "count": 2,  "maxUpdatedAt": "2026-10-22 08:00:00" },
    "focus_sessions": { "count": 5,  "maxUpdatedAt": "2026-10-24 19:00:00" },
    "spaces":         { "count": 3,  "maxUpdatedAt": "2026-10-24 20:40" }
  }
}
```

- `count`：`tasks` 只计 `deleted_at IS NULL` 的行；其它实体计全表。
- `maxUpdatedAt`：该实体的**时间列**最大值（见 §4）；空表为 `null`。
- `focus` 是 `focus_sessions` 的兼容别名，两份内容完全相同（响应里同时给出，规范名仍为 `focus_sessions`）。
- 这是纯读接口，不做游标推进。

### 1.2 `GET /sync/delta?since=<游标>&entity=<可选>&limit=<默认200>`

按时间升序返回**一个批次**的变更：

```json
{
  "cursor": "2026-10-24 20:40:02",
  "changes": [
    { "entity": "tasks", "id": "t1", "op": "upsert", "updatedAt": "2026-10-24 20:40:02", "row": { "...": "任务完整字段" } },
    { "entity": "notes", "id": "n7", "op": "delete", "updatedAt": "2026-10-24 20:40:05" }
  ],
  "more": false
}
```

- `since`：上一次响应的 `cursor`；首次传 `0` 或省略（等价于空串，返回全部）。
- `entity`：只拉单一实体（`tasks` / `notes` / `notebooks` / `news_topics` / `focus_sessions` / `spaces`）；`focus` 作为 `focus_sessions` 的别名同样接受；不传则合并六类。未知实体返回 `400 {"error":"bad_request","message":"未知同步实体：…"}`。
- `limit`：本批上限，默认 200，夹在 1–1000。
- `cursor`：**本批最后一条变更的 `updatedAt`**；本批没有变更时原样回传 `since`。它是**不透明值**，客户端只负责持久化并回传，不要自己拼时间。
- `more=true` 表示还有下一批：立刻用返回的 `cursor` 继续拉，直到 `more=false`。服务端没有「待办变更队列」，靠比较时间戳实现，所以 `more` 只是本批截断标记。
- 变更排序：`updatedAt` 升序，同一时间戳按 `entity:id` 字典序稳定排序。
- `op='delete'` 的行没有 `row`，只有 `entity/id/updatedAt`。

### 1.3 `POST /sync/push`

```json
{
  "changes": [
    { "entity": "tasks", "id": "t1", "op": "upsert", "updatedAt": "2026-10-24 20:50:00", "row": { "title": "手机改的标题", "status": "doing" } },
    { "entity": "notes", "id": "n9", "op": "delete", "updatedAt": "2026-10-24 20:51:00" }
  ]
}
```

响应：

```json
{
  "accepted": ["t1"],
  "conflicts": [
    { "entity": "notes", "id": "n9", "current": { "...": "服务端当前行，若已被删除则为 null" } }
  ]
}
```

- 逐条应用，按提交顺序；`accepted` 记录被接受的 `id`（只有 id，没有 entity 前缀；同批混用实体时按提交顺序对应）。
- 被 LWW 拒绝的进入 `conflicts`，`current` 是服务端当前行（已删除/仅剩墓碑时为 `null`）。客户端收到冲突的标准处理：先用当前游标拉一次 delta 合并，再决定是否重试。
- 整批在一个事务里执行：校验失败（未知实体、空 id、超过 2000 条）整体回滚并返回 `400 bad_request`；`conflicts` 不算失败，正常 200。
- `updatedAt` 缺省时补服务器当前时间。
- `row` 允许**部分字段**：服务端按 `{...当前行, ...row}` 合并后写库，因此只传改动的字段即可。`tasks` 的 `subtasks` 数组是例外：显式传入才整体替换，不传则保留原子待办。

---

## 2. 墓碑（tombstones）

```sql
CREATE TABLE IF NOT EXISTS tombstones (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(entity, id)
);
CREATE INDEX IF NOT EXISTS idx_tombstones_time ON tombstones(deleted_at);
```

写入入口（同一事务或紧随删除）：

| 入口 | entity |
| --- | --- |
| `DELETE /notes/:id`（`deleteNote`） | `notes` |
| `DELETE /notebooks/:id`（`deleteNotebook`；笔记迁到剩余第一个笔记本） | `notebooks` |
| `DELETE /news/topics/:id`（`deleteNewsTopic`；条目一并物理删除） | `news_topics` |
| `PUT /state`（整份快照）里「旧有新无」的任务 / 子待办 / 专注 / 空间 | `tasks` / `subtasks` / `focus_sessions` / `spaces` |
| `POST /sync/push` 的 `op='delete'` | 对应 entity |

- 同一 `(entity, id)` 重复删除时，`deleted_at` 取更晚的一次。
- `subtasks` 的墓碑会记录，但 `delta` 不单独下发子待办（子待办随父任务行整体下发）；保留它是为了后续按实体同步时不必重新比对。
- 墓碑不会自动清理；按需手工执行 `DELETE FROM tombstones WHERE deleted_at < '<保留期起点>'`（清理前要保证所有设备都已越过该游标）。
- upsert 命中的旧墓碑会被删除（复活），见 §5。

---

## 3. 时间戳与游标

- 库内时间戳是「本地时间、无时区的可比较字符串」，形如 `2026-10-24 20:40`（任务）或 `2026-10-24 20:40:02`（笔记 / 墓碑）。delta 用**字符串字典序**比较 `updated_at > since`，所以客户端**不要**把 `since` 改写成 `2026-10-24T20:40:02.000Z` 之类的格式。
- 游标一律来自服务端响应；跨时区/跨端同步只依赖这个不透明串。
- 已知精度差异：`tasks.updated_at` 正常按客户端传入值原样落库，但服务端兜底时间是**分钟级**（`YYYY-MM-DD HH:MM`），笔记/墓碑是秒级；如果客户端混用 `2026-10-24T20:40:02.000Z` 这类格式，字典序比较会失真。同一时间戳内、游标之后新建的任务也可能**被下一批跳过**。当前 P1-1 不改既有写入精度，规避方式：
  - 客户端 `updatedAt` 统一使用秒级 `YYYY-MM-DD HH:MM:SS`；
  - 手机端定时同步时，把 `since` 回退 5 分钟重叠拉取，再用 id 幂等 upsert（服务端 delta 不会因为重复而报错）；
  - 不要把 `updatedAt` 写到未来：游标会直接跳到未来，之后用旧时间戳的写入都会被 LWW 拒绝、也拉不到。
- 墓碑时间取「删除事件时间」：既有删除入口取服务器当前时间；`push` 删除取 `max(客户端 updatedAt, 服务器当前时间)`，保证其它设备用旧游标也能看到这次删除。

---

## 4. Entity 列表

| entity | 表 | 时间列 | 说明 |
| --- | --- | --- | --- |
| `tasks` | `tasks` | `updated_at` | 排除 `deleted_at IS NOT NULL`；`row` 与 `GET /state.tasks[]` 同形（含 `subtasks`） |
| `notes` | `notes` | `updated_at` | `row` 与 `GET /notes.notes[]` 同形 |
| `notebooks` | `notebooks` | `updated_at` | 不含派生的 `count` |
| `news_topics` | `news_topics` | `updated_at` | `row` 与 `GET /news.topics[]` 同形；`news_items` 不参与同步 |
| `focus_sessions` | `focus_sessions` | `started_at` | 该表没有 `updated_at`，用 `started_at` 兜底（编辑不刷新时间） |
| `spaces` | `spaces` | `updated_at` | 注意：`PUT /state` 每次都会把空间的 `updated_at` 刷成当前时间，所以每次保存快照后 delta 会重发全部空间；幂等 upsert 即可 |

`spaces` 的 `row` 含 `createdAt/updatedAt`（`GET /state.spaces` 只暴露 `id/name/color`，增量里多两个只读时间字段）；`focus_sessions.row` 同 `GET /state.focus[]`。

---

## 5. LWW 规则

`updatedAt` 是唯一的版本号，比较方式为**字符串比较**（不是解析日期）：

- **upsert**：服务端取该 id 的「已知最新时间」= `max(当前行时间列, 该 id 墓碑的 deleted_at)`。
  - `已知最新时间 > 推送 updatedAt` → 拒绝，返回 `conflicts[{entity, id, current}]`（行已被删时 `current: null`）；
  - 否则（包括相等）→ 接受并写入：当前行存在则合并更新，不存在则插入；随后清掉旧墓碑（用更新的数据复活已删除条目）。
- **delete**：同样先做 LWW 比较；`已知最新时间 > 推送 updatedAt` 时拒绝并回传 `current`，否则写墓碑 + 物理删除（任务连同子待办/附件/记录，新闻订阅连同条目）。
- 约定：**时间戳相等时写入方胜**。删除没有独立于 LWW 的优先级。
- 写入成功后，该行的 `updated_at` 就是推送的 `updatedAt`（`notes`/`notebooks`/`news_topics` 复用既有 save 方法写库后回填时间戳），因此客户端下一次 delta 能看到自己的改动。
- 冲突不是错误：HTTP 仍为 200，调用方按 `conflicts[]` 处理。

---

## 6. 手机端 `wb.*` 映射建议

现有手机端函数名以 `wb.` 命名空间为准，下面是建议的对应关系（新增/替换实现时按此约定）：

| 手机端 | 调用 | 说明 |
| --- | --- | --- |
| `wb.bootstrap()` | `GET /state` | 仅首次安装 / 本地库为空 / 用户手动「重置同步」时调用；拿到全量后把 `revision` 与本批数据一起落地 |
| `wb.syncMeta()` | `GET /sync/meta` | 同步前轻量探测；与本地各实体 `count/maxUpdatedAt` 比较可跳过空跑 |
| `wb.sync()` | `GET /sync/delta?since=<本地游标>&limit=200` | 循环到 `more=false`，逐条按 `op` upsert/delete 到本地库，最后保存 `cursor` |
| `wb.push(changes)` | `POST /sync/push` | 统一出口；把本地待上传队列转成 `changes[]`（`entity` + `op`） |
| `wb.taskSave(task)` | push upsert `entity=tasks` | 只带改动字段；`updatedAt` 用本地编辑时间（秒级） |
| `wb.taskDelete(id, at)` | push delete `entity=tasks` | 本地立刻物理删除并记入待上传队列 |
| `wb.noteSave/noteDelete` | push upsert/delete `entity=notes` | 笔记正文一并同步；`filePath` 只读、由服务端维护 |
| `wb.notebookSave/notebookDelete` | push upsert/delete `entity=notebooks` | 删除后服务端把笔记迁到剩余第一个笔记本，手机端以 delta 结果为准 |
| `wb.newsTopicSave/newsTopicDelete` | push upsert/delete `entity=news_topics` | `news_items` 不在 P1-1 同步范围，抓取结果仍只在服务端生成 |
| `wb.focusSave/focusDelete` | push upsert/delete `entity=focus_sessions` | `updatedAt` 传 `startedAt` |
| `wb.spaceSave/spaceDelete` | push upsert/delete `entity=spaces` | 空间名/颜色即可 |

推荐同步循环：

1. 本地无数据 → `wb.bootstrap()`（`GET /state`），记录 `revision` 与六类实体的最大时间作为初始游标（或直接 `delta?since=0` 建本地库）。
2. 有本地数据 → `wb.syncMeta()` 对比；有差异则循环 `wb.sync()`。
3. 用户在本机编辑 → 先写本地库（带本地 `updatedAt`）并进待上传队列。
4. 网络可用 → `wb.push()`；`conflicts[]` 非空时先 `wb.sync()` 一次再合并重试（不要直接覆盖服务端行）。
5. 定时（例如前台每 30s / 回到前台）重复 2–4。

约束：

- **`PUT /state` 只用于首次全量**（以及「重置同步」这类显式全量覆盖）。它是「全清重插」语义：快照里没有的任务/子待办/专注/空间会被记为删除并写墓碑。日常增量一律走 `/sync/*`。
- 首次全量也可以不调用 `PUT /state`：直接 `delta?since=0` 拉到本地即可，这样不会误删服务端数据。
- `delta` 的 `row` 可直接替换本地行；不要用 delta 里缺失的字段去清空本地字段（服务端按完整行下发，部分字段缺失说明该实体没有该字段）。
- 上传失败可安全重试（按 id + `updatedAt` 幂等）；同一 `updatedAt` 重复 upsert 会被接受。

---

## 7. 兼容性与已知限制

- 既有 `GET /state`、`PUT /state`、`/notes*`、`/news*`、`/notebooks*` 行为不变；增量协议是纯新增。
- 不参与同步：`news_items`、`attachments`、`logs`、`settings`、Bug / 测试 / 产品 / 灵感 / 智能体团队等实体。
- 任务删除（`writeState` 差异或 push delete）是物理删除，子待办/附件/记录一并删除；`subtasks` 墓碑不外发。
- 同步走回环访问，没有鉴权；不要把这个端口暴露到公网。
- 时间戳不做时区归一；多端时钟偏差大时以「拉 delta + 重试」收敛。
- 没有自动墓碑清理与变更日志（outbox）；delta 靠实体表时间列 + 墓碑表顺序扫描，数据量在单用户本地场景下足够。

---

## 8. 自检

```bash
pnpm run bundle:host          # 构建宿主 bundle
node scripts/sync-smoke.mjs   # 临时库 + 假 req/res 直接调用真实 handler
```

冒烟覆盖：

1. `PUT /state` 造 3 条任务 → `delta(since=0)` 首次全量 3 条 upsert；`limit=2` 分页 `more=true`，用 cursor 取到剩余 1 条；
2. 快照删 1 条 → 从旧游标拉增量只拿到 1 条 delete 墓碑；`since=0` 得到「现存 2 条 upsert + 1 条墓碑」（**物理删除的行不会作为 upsert 出现**，这是 P1-1 的预期语义）；
3. `push` 更新 → 再 `delta` 能取到新行，`GET /state` 同步可见；
4. `push` 旧 `updatedAt` → `conflicts[0].current` 返回服务端当前行，且不落库；
5. `push` delete → `delta` 返回 delete，`GET /state` 中已消失；
6. 笔记 / 笔记本 / 新闻订阅的删除都留下墓碑；
7. `GET /sync/meta` 计数与 `maxUpdatedAt` 正确；未知 entity 返回 400。
