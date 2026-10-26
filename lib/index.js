import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { zstdDecompressSync } from "node:zlib";
// src/shared/idea-angles.ts
const IDEA_ANGLES = [
	{
		id: "users",
		label: "用户与场景",
		hint: "谁 · 在什么时刻 · 什么事"
	},
	{
		id: "pain",
		label: "痛点与机会",
		hint: "现状哪里别扭"
	},
	{
		id: "form",
		label: "方案形态",
		hint: "最小可用形态长什么样"
	},
	{
		id: "tech",
		label: "技术与可行",
		hint: "哪一步最容易做不成"
	},
	{
		id: "biz",
		label: "商业与传播",
		hint: "谁付钱 · 怎么扩散"
	},
	{
		id: "risk",
		label: "风险与反例",
		hint: "什么情况下一定失败"
	}
];
IDEA_ANGLES.map((a) => a.id).concat("cross");
// src/host/idea-model.ts
/**
* 灵感 · 纯函数层（宿主）
*
* 只处理数据：字段上限、graph 结构校验与规整、版本差异、输入摘要。
* 不碰数据库、不碰网络，便于 scripts/verify-idea.mjs 直接单测。
*/
/** 统一字段上限；灵感数据**不走**主存储的 str()（20k 一刀切会把 graph 腰斩）。 */
const IDEA_LIMITS = {
	title: 60,
	brief: 5e3,
	graph: 2e6,
	label: 24,
	detail: 200,
	tag: 16,
	tags: 8,
	nodes: 300,
	edges: 600,
	depth: 4,
	batchNodes: 60,
	versions: 50,
	inputs: 12,
	imageBytes: 2097152
};
const NODE_TYPES = [
	"seed",
	"direction",
	"idea",
	"question",
	"risk"
];
/** 角度 id：内置 6 个 + cross，自定义也走同一 slug 形态，便于写进节点与提示词。 */
const ANGLE_PATTERN = /^[a-z][a-z0-9_-]{1,23}$/;
/** 把用户输入的角度名规范成 {id,label}：id 由 label 转 slug，重名去重，最多 6 个。 */
function sanitizeCustomAngles(raw, existing = []) {
	const issues = [];
	const out = [];
	const seen = new Set(existing.map((a) => a.id));
	for (const item of Array.isArray(raw) ? raw : []) {
		const label = clampText$2(typeof item === "string" ? item : item?.label, 12);
		if (label === "") continue;
		const wantedId = typeof item === "object" && item !== null && typeof item.id === "string" ? String(item.id).toLowerCase() : label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
		const id = ANGLE_PATTERN.test(wantedId) ? wantedId : `a-${createHash("sha1").update(label).digest("hex").slice(0, 6)}`;
		if (seen.has(id)) {
			issues.push({
				code: "ANGLE_DUP",
				message: `角度重复：${label}`,
				id
			});
			continue;
		}
		if (out.length >= 6) {
			issues.push({
				code: "ANGLE_LIMIT",
				message: `自定义角度最多 6 个`
			});
			break;
		}
		seen.add(id);
		out.push({
			id,
			label
		});
	}
	return {
		angles: out,
		issues
	};
}
/** 去掉控制字符并裁剪；labels 被裁时补省略号，便于 UI 与 diff 识别。 */
function clampText$2(value, max, ellipsis = false) {
	if (typeof value !== "string") return "";
	const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
	if (clean.length <= max) return clean;
	return ellipsis ? `${clean.slice(0, Math.max(0, max - 1))}…` : clean.slice(0, max);
}
function digest(parts) {
	return createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 12);
}
function graphBytes(graph) {
	return Buffer.byteLength(JSON.stringify(graph), "utf8");
}
/** 新建灵感的空图：只有一个种子节点。 */
function emptyGraph(title) {
	return {
		v: 1,
		rootId: "root",
		nodes: [{
			id: "root",
			type: "seed",
			label: clampText$2(title, IDEA_LIMITS.title) || "新的灵感",
			detail: "",
			depth: 0,
			parentId: null,
			status: "kept"
		}],
		edges: []
	};
}
function asArray$1(value) {
	return Array.isArray(value) ? value : [];
}
/**
* 校验并规整一份 graph：
* - 节点去重、类型/标签/详情裁剪，超出 300 个丢弃并记 issue；
* - tree 边按 parentId 补全，成环或悬空的节点挂回根；
* - depth 由根 BFS 重算，超过 4 层的节点丢弃；
* - relate 边两端必须存在、不能自连、去重。
*
* knownIds：把「当前已有图」的节点 id 视为已知。分批写入时补丁只带本批节点，
* 但 parentId / edges 常常指向上一批的方向节点；不传它会把这些引用当悬空而改挂根。
*/
function normalizeGraph(raw, options = {}) {
	const issues = [];
	const fallback = emptyGraph(options.title ?? "新的灵感");
	if (raw === null || typeof raw !== "object") return {
		graph: fallback,
		issues
	};
	const input = raw;
	const cleaned = [];
	const seen = new Set(options.knownIds ?? []);
	for (const item of asArray$1(input.nodes)) {
		if (item === null || typeof item !== "object") continue;
		const node = item;
		const id = clampText$2(node.id, 64);
		if (id === "") {
			issues.push({
				code: "NODE_ID_EMPTY",
				message: "节点缺少 id，已丢弃"
			});
			continue;
		}
		if (seen.has(id)) {
			issues.push({
				code: "NODE_ID_DUP",
				message: `节点 id 重复：${id}`,
				id
			});
			continue;
		}
		if (cleaned.length >= IDEA_LIMITS.nodes) {
			issues.push({
				code: "NODE_LIMIT",
				message: `节点超过 ${IDEA_LIMITS.nodes} 个，后续已丢弃`
			});
			break;
		}
		const rawLabel = clampText$2(node.label ?? node.topic, IDEA_LIMITS.label, true);
		const type = NODE_TYPES.includes(node.type) ? node.type : "idea";
		const label = rawLabel || (type === "direction" ? "未命名方向" : "未命名点子");
		if (typeof (node.label ?? node.topic) === "string" && (node.label ?? node.topic).length > IDEA_LIMITS.label) issues.push({
			code: "LABEL_CLAMP",
			message: `节点「${label}」标题超长已裁剪`,
			id
		});
		const status = node.status === "dropped" || node.status === "pending" ? node.status : "kept";
		const tags = asArray$1(node.tags).map((t) => clampText$2(t, IDEA_LIMITS.tag)).filter(Boolean).slice(0, IDEA_LIMITS.tags);
		const entry = {
			id,
			type,
			label,
			detail: clampText$2(node.detail, IDEA_LIMITS.detail, true),
			parentId: typeof node.parentId === "string" && node.parentId !== "" ? clampText$2(node.parentId, 64) : null,
			angle: ANGLE_PATTERN.test(clampText$2(node.angle, 24)) ? clampText$2(node.angle, 24) : void 0,
			status,
			tags: tags.length > 0 ? tags : void 0
		};
		const x = Number(node.x);
		const y = Number(node.y);
		const fx = Number(node.fx);
		const fy = Number(node.fy);
		if (Number.isFinite(x)) entry.x = Math.round(x);
		if (Number.isFinite(y)) entry.y = Math.round(y);
		if (Number.isFinite(fx)) entry.fx = Math.round(fx);
		if (Number.isFinite(fy)) entry.fy = Math.round(fy);
		if (node.collapsed === true) entry.collapsed = true;
		seen.add(id);
		cleaned.push(entry);
	}
	if (cleaned.length === 0) return {
		graph: fallback,
		issues
	};
	const wantedRoot = clampText$2(input.rootId, 64);
	let rootCandidate = cleaned.find((n) => n.id === wantedRoot && n.type === "seed") ?? cleaned.find((n) => n.type === "seed");
	if (rootCandidate === void 0) {
		if (wantedRoot !== "") {
			rootCandidate = {
				id: wantedRoot,
				type: "seed",
				label: clampText$2(options.title, IDEA_LIMITS.label) || "灵感",
				detail: "",
				depth: 0,
				parentId: null,
				status: "kept"
			};
			cleaned.unshift(rootCandidate);
		} else rootCandidate = cleaned[0];
	}
	rootCandidate.type = "seed";
	const rootId = rootCandidate.id;
	const treeParent = /* @__PURE__ */ new Map();
	const relateEdges = [];
	const relateKey = /* @__PURE__ */ new Set();
	for (const edge of asArray$1(input.edges)) {
		if (edge === null || typeof edge !== "object") continue;
		const e = edge;
		const from = clampText$2(e.from, 64);
		const to = clampText$2(e.to, 64);
		if (!seen.has(from) || !seen.has(to) || from === to) continue;
		if (e.kind === "relate") {
			const key = [from, to].sort().join("|");
			if (relateKey.has(key)) continue;
			relateKey.add(key);
			relateEdges.push({
				from,
				to,
				kind: "relate",
				label: clampText$2(e.label, IDEA_LIMITS.label, true) || void 0
			});
		} else if (!treeParent.has(to) && to !== rootId) treeParent.set(to, from);
	}
	for (const node of cleaned) {
		if (node.id === rootId || treeParent.has(node.id)) continue;
		if (node.parentId !== null && node.parentId !== void 0 && seen.has(node.parentId) && node.parentId !== node.id) treeParent.set(node.id, node.parentId);
	}
	const parentOf = (id) => treeParent.get(id);
	for (const node of cleaned) {
		if (node.id === rootId) continue;
		const path = /* @__PURE__ */ new Set([node.id]);
		let cursor = parentOf(node.id);
		while (cursor !== void 0) {
			if (cursor === rootId) break;
			if (path.has(cursor)) {
				treeParent.set(node.id, rootId);
				issues.push({
					code: "CYCLE",
					message: `检测到环，已把「${node.label}」挂回根`,
					id: node.id
				});
				break;
			}
			path.add(cursor);
			cursor = parentOf(cursor);
		}
	}
	for (const node of cleaned) {
		if (node.id === rootId) continue;
		if (parentOf(node.id) === void 0) {
			const wanted = node.parentId;
			if (wanted !== null && wanted !== void 0 && wanted !== "" && !seen.has(wanted)) issues.push({
				code: "PARENT_MISSING",
				message: `父节点「${wanted}」不存在，已把「${node.label}」挂回根`,
				id: node.id
			});
			treeParent.set(node.id, rootId);
		}
	}
	const childrenOf = /* @__PURE__ */ new Map();
	for (const [child, parent] of treeParent) {
		const list = childrenOf.get(parent) ?? [];
		list.push(child);
		childrenOf.set(parent, list);
	}
	const depth = /* @__PURE__ */ new Map([[rootId, 0]]);
	const queue = [rootId];
	const dropped = /* @__PURE__ */ new Set();
	const cleanedIds = new Set(cleaned.map((node) => node.id));
	for (const [child, parent] of treeParent) {
		if (parent === rootId || cleanedIds.has(parent)) continue;
		if (seen.has(parent)) {
			depth.set(child, Math.min(2, IDEA_LIMITS.depth));
			queue.push(child);
		}
	}
	while (queue.length > 0) {
		const current = queue.shift();
		const d = depth.get(current) ?? 0;
		for (const child of childrenOf.get(current) ?? []) {
			if (dropped.has(child)) continue;
			if (d + 1 > IDEA_LIMITS.depth) {
				dropped.add(child);
				issues.push({
					code: "DEPTH_LIMIT",
					message: `超过 ${IDEA_LIMITS.depth} 层，已丢弃节点`,
					id: child
				});
				continue;
			}
			depth.set(child, d + 1);
			queue.push(child);
		}
	}
	for (const node of cleaned) if (node.id !== rootId && !depth.has(node.id)) dropped.add(node.id);
	for (const node of cleaned) if (!dropped.has(node.id)) node.depth = depth.get(node.id) ?? 0;
	const kept = cleaned.filter((n) => !dropped.has(n.id));
	for (const node of kept) node.parentId = node.id === rootId ? null : treeParent.get(node.id) ?? rootId;
	const treeEdges = kept.filter((n) => n.id !== rootId).map((n) => ({
		from: n.parentId,
		to: n.id,
		kind: "tree"
	}));
	const relate = relateEdges.filter((e) => !dropped.has(e.from) && !dropped.has(e.to));
	return {
		graph: {
			v: 1,
			rootId,
			nodes: kept,
			edges: treeEdges.concat(relate)
		},
		issues
	};
}
/** 合并一批新节点（继续发散）：保持已有节点坐标与状态，仅追加。 */
function mergeGraph(base, patch, targetNodeId) {
	const issues = [...patch.issues];
	const existing = new Set(base.nodes.map((n) => n.id));
	const additions = patch.graph.nodes.filter((n) => !existing.has(n.id) && n.id !== patch.graph.rootId);
	if (patch.graph.nodes.some((n) => n.id !== patch.graph.rootId && existing.has(n.id))) issues.push({
		code: "NODE_ID_DUP",
		message: "批次里已存在同 id 节点，已跳过"
	});
	const nodes = base.nodes.concat(additions.map((n) => ({
		...n,
		depth: n.depth ?? 1
	})));
	const keepIds = new Set(nodes.map((n) => n.id));
	const edges = base.edges.concat(patch.graph.edges.filter((e) => keepIds.has(e.from) && keepIds.has(e.to)));
	const normalized = normalizeGraph({
		...base,
		nodes,
		edges,
		rootId: base.rootId
	}, { title: base.nodes[0]?.label });
	if (targetNodeId !== void 0 && !keepIds.has(targetNodeId)) issues.push({
		code: "TARGET_MISSING",
		message: `继续发散的目标节点不存在：${targetNodeId}`
	});
	return {
		graph: normalized.graph,
		issues: issues.concat(normalized.issues)
	};
}
function diffGraphs(before, after) {
	const beforeMap = new Map(before.nodes.map((n) => [n.id, n]));
	const afterMap = new Map(after.nodes.map((n) => [n.id, n]));
	const added = after.nodes.filter((n) => !beforeMap.has(n.id)).map((n) => ({
		id: n.id,
		label: n.label
	}));
	const removed = before.nodes.filter((n) => !afterMap.has(n.id)).map((n) => ({
		id: n.id,
		label: n.label
	}));
	const changed = after.nodes.filter((n) => beforeMap.has(n.id)).map((n) => ({
		id: n.id,
		label: n.label,
		before: beforeMap.get(n.id)?.label ?? "",
		after: n.label
	})).filter((entry) => entry.before !== entry.after);
	const beforeEdges = new Set(before.edges.map((e) => `${e.kind}:${e.from}>${e.to}`));
	const afterEdges = new Set(after.edges.map((e) => `${e.kind}:${e.from}>${e.to}`));
	return {
		added,
		removed,
		changed,
		addedEdges: after.edges.filter((e) => !beforeEdges.has(`${e.kind}:${e.from}>${e.to}`)).length,
		removedEdges: before.edges.filter((e) => !afterEdges.has(`${e.kind}:${e.from}>${e.to}`)).length
	};
}
/** 输入的稳定摘要：改了正文/截图/链接就换 digest，用来标注"这版基于哪次输入"。 */
function inputDigest(inputs) {
	return digest(inputs.map((i) => [
		i.kind,
		i.text ?? "",
		i.url ?? "",
		i.filePath ?? "",
		i.size ?? 0
	]));
}
/** 运行日志一条（最多保留 40 条）。 */
function pushRunLog(log, message, limit = 40) {
	const list = asArray$1(log).filter((item) => item !== null && typeof item === "object" && typeof item.message === "string");
	list.push({
		at: (/* @__PURE__ */ new Date()).toISOString(),
		message: clampText$2(message, 300)
	});
	return list.slice(-limit);
}
// src/host/idea-store.ts
/**
* 灵感 · 存储层（SQLite）
*
* 与主存储共用同一个 DatabaseSync 连接（同一 SQLite 文件只留一个写者，避免锁竞争），
* 但**不进主快照**：灵感数据一律走独立表与独立端点，避免「保存任务时把灵感图覆盖」。
*/
function now$1() {
	const d = /* @__PURE__ */ new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function parseJson$2(raw, fallback) {
	if (typeof raw !== "string" || raw.trim() === "") return fallback;
	try {
		const parsed = JSON.parse(raw);
		return parsed === null ? fallback : parsed;
	} catch {
		return fallback;
	}
}
const SCHEMA$2 = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS idea_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  current_version_id TEXT NOT NULL DEFAULT '',
  draft_rev INTEGER NOT NULL DEFAULT 0,
  draft_json TEXT NOT NULL DEFAULT '',
  custom_angles TEXT NOT NULL DEFAULT '[]',
  agent_team_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS idea_inputs (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idea_versions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'ai',
  mode TEXT NOT NULL DEFAULT 'diverge',
  target_node_id TEXT NOT NULL DEFAULT '',
  angles_json TEXT NOT NULL DEFAULT '[]',
  input_digest TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  graph_json TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idea_runs (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  version_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'diverge',
  target_node_id TEXT NOT NULL DEFAULT '',
  angles_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  step INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  log_json TEXT NOT NULL DEFAULT '[]',
  session_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_ideas_project ON ideas(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_inputs_idea ON idea_inputs(idea_id, created_at);
CREATE INDEX IF NOT EXISTS idx_versions_idea ON idea_versions(idea_id, seq);
CREATE INDEX IF NOT EXISTS idx_runs_idea ON idea_runs(idea_id, started_at);
`;
var IdeaStore = class {
	db;
	constructor(db) {
		this.db = db;
		this.db.exec(SCHEMA$2);
		this.migrateColumns();
		this.migrateUnifiedProject();
		this.migrateLegacy();
	}
	/** 旧库补列：idea_projects.project_id（统一项目）。 */
	migrateUnifiedProject() {
		try {
			if (!this.db.prepare("PRAGMA table_info(idea_projects)").all().map((c) => String(c.name)).includes("project_id")) this.db.exec("ALTER TABLE idea_projects ADD COLUMN project_id TEXT NOT NULL DEFAULT ''");
		} catch (cause) {
			console.warn("[dsh-workbench] 灵感项目补列失败：", String(cause));
		}
	}
	/** 旧库补列：ideas.custom_angles（1.7 新增）。 */
	migrateColumns() {
		try {
			const cols = this.db.prepare("PRAGMA table_info(ideas)").all().map((c) => String(c.name));
			if (!cols.includes("custom_angles")) this.db.exec("ALTER TABLE ideas ADD COLUMN custom_angles TEXT NOT NULL DEFAULT '[]'");
			if (!cols.includes("agent_team_id")) this.db.exec("ALTER TABLE ideas ADD COLUMN agent_team_id TEXT NOT NULL DEFAULT ''");
		} catch (cause) {
			console.warn("[dsh-workbench] 灵感表补列失败（不影响使用）：", String(cause));
		}
	}
	/** 旧「灵感调研库」改名归档，不删数据。 */
	migrateLegacy() {
		try {
			if (!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_inspirations'").get()) return;
			if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_inspirations_legacy'").get()) return;
			this.db.exec("ALTER TABLE product_inspirations RENAME TO product_inspirations_legacy");
			console.log("[dsh-workbench] 旧灵感库已归档为 product_inspirations_legacy");
		} catch (cause) {
			console.warn("[dsh-workbench] 旧灵感库归档失败（不影响新功能）：", String(cause));
		}
	}
	listProjects() {
		return this.db.prepare("SELECT * FROM idea_projects ORDER BY updated_at DESC").all().map((row) => ({
			id: row.id,
			name: row.name,
			workspacePath: row.workspace_path,
			workspaceName: row.workspace_name,
			projectId: row.project_id ?? "",
			createdAt: row.created_at,
			updatedAt: row.updated_at
		}));
	}
	/**
	* 保存项目。同名（同工作区路径）视为同一个项目，避免「门户新增一次、灵感再建一次」。
	* 返回 created 标记，供前端提示「已从门户同步 N 个」。
	*/
	/** 由宿主注入：把「工作区 + 名称」映射到统一项目 id（四域共用一份项目清单）。 */
	ensureUnifiedProject;
	saveProject(input) {
		const ts = now$1();
		const name = String(input?.name ?? "").trim().slice(0, 60) || "未命名项目";
		const workspacePath = String(input?.workspacePath ?? "").trim().slice(0, 500);
		const workspaceName = String(input?.workspaceName ?? "").trim().slice(0, 80) || (workspacePath === "" ? "" : workspacePath.split("/").filter(Boolean).pop() ?? "");
		const wantedId = typeof input?.id === "string" && input.id !== "" ? input.id : "";
		const byId = wantedId !== "" ? this.db.prepare("SELECT id FROM idea_projects WHERE id = ?").get(wantedId) : void 0;
		const byPath = byId === void 0 && workspacePath !== "" ? this.db.prepare("SELECT id FROM idea_projects WHERE workspace_path = ? AND workspace_path <> ''").get(workspacePath) : void 0;
		const existing = byId ?? byPath;
		const id = String(existing?.id ?? (wantedId !== "" ? wantedId : `ip-${randomUUID().slice(0, 8)}`));
		const unifiedId = this.ensureUnifiedProject?.(workspacePath, name) ?? "";
		if (existing !== void 0) this.db.prepare("UPDATE idea_projects SET name=?, workspace_path=?, workspace_name=?, project_id=?, updated_at=? WHERE id=?").run(name, workspacePath, workspaceName, unifiedId, ts, id);
		else this.db.prepare("INSERT INTO idea_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(id, name, workspacePath, workspaceName, unifiedId, ts, ts);
		return {
			project: this.listProjects().find((p) => p.id === id) ?? {},
			created: existing === void 0
		};
	}
	deleteProject(id) {
		const ideas = this.db.prepare("SELECT id FROM ideas WHERE project_id = ? AND deleted_at IS NULL").all(id);
		for (const idea of ideas) this.deleteIdea(String(idea.id));
		this.db.prepare("DELETE FROM idea_projects WHERE id = ?").run(id);
	}
	ideaRow(row) {
		const draft = parseJson$2(row.draft_json, null);
		return {
			id: row.id,
			projectId: row.project_id,
			title: row.title,
			brief: row.brief,
			status: row.status,
			currentVersionId: row.current_version_id || "",
			draftRev: Number(row.draft_rev ?? 0),
			customAngles: parseJson$2(row.custom_angles, []),
			agentTeamId: String(row.agent_team_id ?? ""),
			graph: draft,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}
	listIdeas(filter = {}) {
		const rows = this.db.prepare("SELECT * FROM ideas WHERE deleted_at IS NULL ORDER BY updated_at DESC").all();
		const q = (filter.q ?? "").trim().toLowerCase();
		return rows.filter((row) => filter.projectId === void 0 || filter.projectId === "" || row.project_id === filter.projectId).filter((row) => q === "" || String(row.title).toLowerCase().includes(q) || String(row.brief).toLowerCase().includes(q)).map((row) => {
			const meta = this.ideaRow(row);
			const graph = parseJson$2(row.draft_json, null);
			const version = row.current_version_id ? this.db.prepare("SELECT seq FROM idea_versions WHERE id = ?").get(row.current_version_id) : void 0;
			return {
				id: meta.id,
				projectId: meta.projectId,
				title: meta.title,
				brief: meta.brief,
				status: meta.status,
				draftRev: meta.draftRev,
				versionSeq: version?.seq ?? 0,
				nodeCount: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
				updatedAt: meta.updatedAt
			};
		});
	}
	getIdea(id) {
		const row = this.db.prepare("SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL").get(id);
		if (!row) return void 0;
		return this.ideaRow(row);
	}
	createIdea(input) {
		const ts = now$1();
		const id = `idea-${randomUUID().slice(0, 10)}`;
		const title = String(input?.title ?? "").trim().slice(0, IDEA_LIMITS.title) || "未命名灵感";
		const brief = String(input?.brief ?? "").slice(0, IDEA_LIMITS.brief);
		const projectId = String(input?.projectId ?? "").trim().slice(0, 64);
		const customAngles = Array.isArray(input?.customAngles) ? input.customAngles.slice(0, 6) : [];
		const graph = normalizeGraph(null, { title }).graph;
		this.db.prepare("INSERT INTO ideas(id, project_id, title, brief, status, current_version_id, draft_rev, draft_json, custom_angles, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, projectId, title, brief, "draft", "", 1, JSON.stringify(graph), JSON.stringify(customAngles), ts, ts);
		return this.getIdea(id) ?? {};
	}
	updateIdea(id, patch) {
		const row = this.db.prepare("SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL").get(id);
		if (!row) throw new Error("灵感不存在");
		const title = patch.title === void 0 ? row.title : String(patch.title).trim().slice(0, IDEA_LIMITS.title) || row.title;
		const brief = patch.brief === void 0 ? row.brief : String(patch.brief).slice(0, IDEA_LIMITS.brief);
		const projectId = patch.projectId === void 0 ? row.project_id : String(patch.projectId).slice(0, 64);
		const agentTeamId = patch.agentTeamId === void 0 ? String(row.agent_team_id ?? "") : String(patch.agentTeamId).slice(0, 64);
		const customAngles = patch.customAngles === void 0 ? String(row.custom_angles ?? "[]") : JSON.stringify(Array.isArray(patch.customAngles) ? patch.customAngles.slice(0, 6) : []);
		this.db.prepare("UPDATE ideas SET title=?, brief=?, project_id=?, custom_angles=?, agent_team_id=?, updated_at=? WHERE id=?").run(title, brief, projectId, customAngles, agentTeamId, now$1(), id);
		return this.getIdea(id) ?? {};
	}
	deleteIdea(id) {
		this.db.prepare("DELETE FROM idea_inputs WHERE idea_id = ?").run(id);
		this.db.prepare("DELETE FROM idea_runs WHERE idea_id = ?").run(id);
		this.db.prepare("DELETE FROM idea_versions WHERE idea_id = ?").run(id);
		this.db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
	}
	setStatus(id, status) {
		this.db.prepare("UPDATE ideas SET status=?, updated_at=? WHERE id=?").run(status, now$1(), id);
	}
	listInputs(ideaId) {
		return this.db.prepare("SELECT * FROM idea_inputs WHERE idea_id = ? ORDER BY created_at").all(ideaId).map((row) => ({
			id: row.id,
			ideaId: row.idea_id,
			kind: row.kind,
			text: row.text,
			url: row.url,
			filePath: row.file_path,
			mime: row.mime,
			width: Number(row.width ?? 0),
			height: Number(row.height ?? 0),
			size: Number(row.size ?? 0),
			createdAt: row.created_at
		}));
	}
	getInput(id) {
		return this.db.prepare("SELECT * FROM idea_inputs WHERE id = ?").get(id);
	}
	addInput(ideaId, input) {
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM idea_inputs WHERE idea_id = ?").get(ideaId)?.n ?? 0) >= IDEA_LIMITS.inputs) throw new Error(`最多 ${IDEA_LIMITS.inputs} 个输入`);
		const id = `in-${randomUUID().slice(0, 8)}`;
		this.db.prepare("INSERT INTO idea_inputs(id, idea_id, kind, text, url, file_path, mime, width, height, size, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, ideaId, String(input?.kind ?? "text").slice(0, 12), String(input?.text ?? "").slice(0, 2e3), String(input?.url ?? "").slice(0, 1e3), String(input?.filePath ?? "").slice(0, 1e3), String(input?.mime ?? "").slice(0, 60), Math.max(0, Math.round(Number(input?.width ?? 0) || 0)), Math.max(0, Math.round(Number(input?.height ?? 0) || 0)), Math.max(0, Math.round(Number(input?.size ?? 0) || 0)), now$1());
		this.db.prepare("UPDATE ideas SET updated_at=? WHERE id=?").run(now$1(), ideaId);
		return this.listInputs(ideaId).find((item) => item.id === id) ?? {};
	}
	deleteInput(ideaId, inputId) {
		const row = this.db.prepare("SELECT * FROM idea_inputs WHERE id = ? AND idea_id = ?").get(inputId, ideaId);
		if (!row) return void 0;
		this.db.prepare("DELETE FROM idea_inputs WHERE id = ?").run(inputId);
		return row;
	}
	getDraft(id) {
		const row = this.db.prepare("SELECT draft_rev, draft_json, status FROM ideas WHERE id = ? AND deleted_at IS NULL").get(id);
		if (!row) throw new Error("灵感不存在");
		const graph = normalizeGraph(parseJson$2(row.draft_json, null), {}).graph;
		return {
			rev: Number(row.draft_rev ?? 0),
			graph,
			status: row.status
		};
	}
	/** 乐观并发：rev 不一致时抛 CONFLICT，附带当前草稿。 */
	setDraft(id, graph, rev) {
		const row = this.db.prepare("SELECT draft_rev FROM ideas WHERE id = ? AND deleted_at IS NULL").get(id);
		if (!row) throw new Error("灵感不存在");
		const current = Number(row.draft_rev ?? 0);
		if (rev !== void 0 && Number(rev) !== current) {
			const error = /* @__PURE__ */ new Error("draft_conflict");
			error.code = "draft_conflict";
			throw error;
		}
		const next = current + 1;
		const serialized = JSON.stringify(graph);
		if (Buffer.byteLength(serialized, "utf8") > IDEA_LIMITS.graph) throw new Error("导图数据过大");
		this.db.prepare("UPDATE ideas SET draft_json=?, draft_rev=?, updated_at=? WHERE id=?").run(serialized, next, now$1(), id);
		return { rev: next };
	}
	versionRow(row) {
		return {
			id: row.id,
			ideaId: row.idea_id,
			seq: Number(row.seq ?? 0),
			label: row.label,
			source: row.source,
			mode: row.mode,
			targetNodeId: row.target_node_id,
			angles: parseJson$2(row.angles_json, []),
			inputDigest: row.input_digest,
			summary: row.summary,
			nodeCount: Number(row.node_count ?? 0),
			edgeCount: Number(row.edge_count ?? 0),
			createdAt: row.created_at
		};
	}
	listVersions(ideaId) {
		return this.db.prepare("SELECT * FROM idea_versions WHERE idea_id = ? ORDER BY seq DESC").all(ideaId).map((row) => this.versionRow(row));
	}
	getVersion(ideaId, versionId) {
		const row = this.db.prepare("SELECT * FROM idea_versions WHERE id = ? AND idea_id = ?").get(versionId, ideaId);
		if (!row) return void 0;
		return {
			...this.versionRow(row),
			graph: parseJson$2(row.graph_json, {
				v: 1,
				rootId: "root",
				nodes: [],
				edges: []
			})
		};
	}
	latestVersion(ideaId) {
		const row = this.db.prepare("SELECT * FROM idea_versions WHERE idea_id = ? ORDER BY seq DESC LIMIT 1").get(ideaId);
		return row ? this.versionRow(row) : void 0;
	}
	createVersion(ideaId, input) {
		const row = this.db.prepare("SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL").get(ideaId);
		if (!row) throw new Error("灵感不存在");
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM idea_versions WHERE idea_id = ?").get(ideaId)?.n ?? 0) >= IDEA_LIMITS.versions) throw new Error(`每个灵感最多 ${IDEA_LIMITS.versions} 个版本，请先删除旧版本`);
		const graph = normalizeGraph(input?.graph, { title: row.title }).graph;
		const serialized = JSON.stringify(graph);
		if (Buffer.byteLength(serialized, "utf8") > IDEA_LIMITS.graph) throw new Error("导图数据过大");
		const seq = Number(this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS s FROM idea_versions WHERE idea_id = ?").get(ideaId)?.s ?? 0) + 1;
		const id = `v-${randomUUID().slice(0, 8)}`;
		const ts = now$1();
		this.db.prepare(`INSERT INTO idea_versions(id, idea_id, seq, label, source, mode, target_node_id, angles_json, input_digest, summary, graph_json, node_count, edge_count, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, ideaId, seq, String(input?.label ?? "").slice(0, 60) || `v${seq}`, String(input?.source ?? "ai").slice(0, 12), String(input?.mode ?? "diverge").slice(0, 12), String(input?.targetNodeId ?? "").slice(0, 64), JSON.stringify(Array.isArray(input?.angles) ? input.angles.slice(0, 8) : []), String(input?.inputDigest ?? "").slice(0, 32), String(input?.summary ?? "").slice(0, 500), serialized, graph.nodes.length, graph.edges.length, ts);
		this.db.prepare("UPDATE ideas SET current_version_id=?, draft_json=?, draft_rev=draft_rev+1, status=?, updated_at=? WHERE id=?").run(id, serialized, "ready", ts, ideaId);
		return this.versionRow(this.db.prepare("SELECT * FROM idea_versions WHERE id = ?").get(id));
	}
	/** 回滚：把该版本作为新草稿并记一个新版本，历史不丢。 */
	rollback(ideaId, versionId) {
		const version = this.getVersion(ideaId, versionId);
		if (!version) throw new Error("版本不存在");
		if (!this.db.prepare("SELECT title FROM ideas WHERE id = ? AND deleted_at IS NULL").get(ideaId)) throw new Error("灵感不存在");
		return this.createVersion(ideaId, {
			graph: version.graph,
			source: "rollback",
			mode: "restore",
			label: `回滚到 v${version.seq}`,
			summary: `从 v${version.seq} 恢复`,
			angles: version.angles
		});
	}
	deleteVersion(ideaId, versionId) {
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM idea_versions WHERE idea_id = ?").get(ideaId)?.n ?? 0) <= 1) throw new Error("至少保留一个版本");
		this.db.prepare("DELETE FROM idea_versions WHERE id = ? AND idea_id = ?").run(versionId, ideaId);
		const latest = this.latestVersion(ideaId);
		this.db.prepare("UPDATE ideas SET current_version_id=? WHERE id=?").run(latest?.id ?? "", ideaId);
	}
	runRow(row) {
		return {
			id: row.id,
			ideaId: row.idea_id,
			versionId: row.version_id,
			kind: row.kind,
			targetNodeId: row.target_node_id,
			angles: parseJson$2(row.angles_json, []),
			status: row.status,
			step: Number(row.step ?? 0),
			total: Number(row.total ?? 0),
			message: row.message,
			log: parseJson$2(row.log_json, []),
			sessionId: row.session_id,
			error: row.error,
			startedAt: row.started_at,
			finishedAt: row.finished_at
		};
	}
	createRun(ideaId, input) {
		const id = `run-${randomUUID().slice(0, 8)}`;
		this.db.prepare(`INSERT INTO idea_runs(id, idea_id, version_id, kind, target_node_id, angles_json, status, step, total, message, log_json, session_id, error, started_at, finished_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, ideaId, "", String(input?.kind ?? "diverge").slice(0, 12), String(input?.targetNodeId ?? "").slice(0, 64), JSON.stringify(Array.isArray(input?.angles) ? input.angles.slice(0, 8) : []), "running", 0, Math.max(1, Number(input?.total ?? 5) || 5), "已创建生成任务", "[]", "", "", now$1(), "");
		this.db.prepare("UPDATE ideas SET status='generating', updated_at=? WHERE id=?").run(now$1(), ideaId);
		return this.getRun(id) ?? {};
	}
	getRun(id) {
		const row = this.db.prepare("SELECT * FROM idea_runs WHERE id = ?").get(id);
		return row ? this.runRow(row) : void 0;
	}
	updateRun(id, patch) {
		if (!this.db.prepare("SELECT * FROM idea_runs WHERE id = ?").get(id)) return void 0;
		const fields = [];
		const values = [];
		const set = (column, value) => {
			fields.push(`${column}=?`);
			values.push(value);
		};
		if (patch.status !== void 0) set("status", String(patch.status).slice(0, 12));
		if (patch.step !== void 0) set("step", Math.max(0, Math.round(Number(patch.step) || 0)));
		if (patch.total !== void 0) set("total", Math.max(1, Math.round(Number(patch.total) || 1)));
		if (patch.message !== void 0) set("message", String(patch.message).slice(0, 300));
		if (patch.log !== void 0) set("log_json", JSON.stringify(patch.log).slice(0, 2e4));
		if (patch.versionId !== void 0) set("version_id", String(patch.versionId).slice(0, 64));
		if (patch.sessionId !== void 0) set("session_id", String(patch.sessionId).slice(0, 64));
		if (patch.error !== void 0) set("error", String(patch.error).slice(0, 500));
		if (patch.finished !== void 0) set("finished_at", patch.finished ? now$1() : "");
		if (fields.length > 0) {
			values.push(id);
			this.db.prepare(`UPDATE idea_runs SET ${fields.join(", ")} WHERE id=?`).run(...values);
		}
		return this.getRun(id);
	}
	latestRun(ideaId) {
		const row = this.db.prepare("SELECT * FROM idea_runs WHERE idea_id = ? ORDER BY started_at DESC LIMIT 1").get(ideaId);
		return row ? this.runRow(row) : void 0;
	}
	/** 收尾：把草稿冻成版本并结束 run。 */
	finalizeRun(runId, input) {
		const run = this.getRun(runId);
		if (!run) return void 0;
		if (run.status === "done" && run.versionId !== "") return run;
		if (!this.getIdea(run.ideaId)) return void 0;
		const draft = this.getDraft(run.ideaId);
		const version = this.createVersion(run.ideaId, {
			graph: draft.graph,
			source: "ai",
			mode: run.kind,
			targetNodeId: run.targetNodeId,
			angles: run.angles,
			summary: String(input?.summary ?? run.message ?? "").slice(0, 500),
			label: input?.label,
			inputDigest: input?.inputDigest
		});
		return this.updateRun(runId, {
			status: "done",
			versionId: version.id,
			finished: true,
			message: "已生成"
		});
	}
};
// src/host/idea.ts
/**
* 灵感 · 宿主半侧：路由 + Agent 工具 + vendor 资产
*
* 与主工作台共享同一个 SQLite 连接，但数据独立成表、独立端点（不进整份快照）。
* 路由前缀沿用 /workbench-api：/ideas… 与 /assets/vendor/*。
*/
const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const VENDOR_DIR = join(PLUGIN_DIR, "assets", "vendor");
const VENDOR_FILES = {
	"echarts.min.js": "text/javascript; charset=utf-8",
	"mind-elixir/MindElixir.iife.js": "text/javascript; charset=utf-8",
	"mind-elixir/MindElixir.css": "text/css; charset=utf-8"
};
function send$2(res, status, payload, headers = {}) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		...headers
	});
	res.end(JSON.stringify(payload));
}
function fail$1(res, status, message) {
	send$2(res, status, {
		ok: false,
		error: message,
		message
	});
}
function readJson$2(req) {
	if (typeof req.json === "function") return req.json();
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		if (typeof req.on !== "function") {
			reject(/* @__PURE__ */ new Error("请求体不可读"));
			return;
		}
		req.on("data", (chunk) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buf.length;
			if (size > IDEA_LIMITS.imageBytes * 5) {
				reject(/* @__PURE__ */ new Error("请求体过大"));
				return;
			}
			chunks.push(buf);
		});
		req.on("end", () => {
			if (chunks.length === 0) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (cause) {
				reject(cause);
			}
		});
		req.on("error", reject);
	});
}
function safeDir(input) {
	const clean = input.trim();
	return clean === "" ? "" : clean;
}
/** 灵感产物目录：优先项目工作区，没有工作区就落在 DSH_HOME 下。 */
function ideaDir(store, ideaId) {
	const idea = store.getIdea(ideaId);
	if (!idea) throw new Error("灵感不存在");
	const project = store.listProjects().find((p) => p.id === idea.projectId);
	const base = safeDir(String(project?.workspacePath ?? ""));
	const root = base !== "" && existsSync(base) ? base : "";
	const dir = root !== "" ? join(root, ".dsh-workbench", "ideas", ideaId) : join(process.env.DSH_HOME ?? join(process.env.HOME ?? ".", ".dsh"), "ideas", ideaId);
	mkdirSync(dir, { recursive: true });
	return dir;
}
function extOf(mime) {
	if (mime.includes("png")) return "png";
	if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
	if (mime.includes("webp")) return "webp";
	if (mime.includes("gif")) return "gif";
	return "bin";
}
function decodeDataUrl(dataUrl) {
	if (typeof dataUrl !== "string") return null;
	const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
	if (!match) return null;
	const buffer = Buffer.from(match[2], "base64");
	if (buffer.length === 0 || buffer.length > IDEA_LIMITS.imageBytes) return null;
	const mime = match[1].toLowerCase();
	if (![
		"image/png",
		"image/jpeg",
		"image/webp",
		"image/gif"
	].includes(mime)) return null;
	return {
		mime,
		buffer
	};
}
function angleLine(custom = []) {
	const base = IDEA_ANGLES.map((a, i) => `${i + 1}. ${a.label}（angle="${a.id}"）：${a.hint}`);
	const extra = custom.map((a, i) => `${base.length + i + 1}. ${a.label}（angle="${a.id}"）：用户自定义角度，按这个方向发散`);
	return base.concat(extra).join("\n");
}
/** 生成提示词：唯一交付契约写死在这里，客户端只负责派发。 */
function buildIdeaPrompt(input) {
	const lines = input.inputs.map((item) => {
		if (item.kind === "image" && item.filePath) return `- 截图：${item.filePath}（请先读取该图片）`;
		if (item.kind === "url" && item.url) return `- 链接：${item.url}（可尝试抓取摘要；失败就跳过）`;
		return `- 文字：${clampText$2(item.text, 1200)}`;
	});
	const custom = input.customAngles ?? [];
	const labelOf = (id) => IDEA_ANGLES.find((a) => a.id === id)?.label ?? custom.find((a) => a.id === id)?.label ?? id;
	const angleText = input.angles.length > 0 ? input.angles.map(labelOf).join(" / ") : "全部";
	const head = input.mode === "continue" ? `沿着「${input.targetLabel ?? input.targetNodeId}」这个方向继续发散，只扩这一支，不要重做整张图。` : "从 6 个方向把这件事发散开，最后形成一张可继续生长的图。";
	return `你是产品创意发散助手。本次任务${input.mode === "continue" ? "（继续发散）" : "（首次发散）"}。

## 灵感
- 标题：${input.title}
- 正文：${clampText$2(input.brief, 2e3) || "（无）"}
${lines.length > 0 ? `- 输入：\n${lines.join("\n")}` : ""}

## 要做的事
${head}
本次角度：${angleText}。
可用维度：
${angleLine(custom)}

## 硬性要求
1. 只允许通过工具 **workbench_idea_expand** 交付，参数必须包含 ideaId="${input.ideaId}" 与 runId="${input.runId}"；不要输出长篇正文。
2. 首次发散：每个角度给 3–5 条点子；每条 = 一句话点子（label ≤ 24 字）+ 一句话为什么成立（detail ≤ 120 字）。总共 18–30 条。
3. 至少给 2 条跨支关联（edges 里 kind="relate"，连接不同角度下的两个节点，可带 label）。
4. 节点 id 用 n1、n2…；parentId 指向所属**方向节点**的 id（工具会自动把方向节点落到根下），方向节点 type="direction"、angle 填对应 id。
5. 允许分批调用：先落 6 个方向，再分批落点子；每批 ≤ 30 个节点。**最后一次调用必须带 final: true**。
6. 禁止空话（"提升体验""加强运营"）、禁止重复、禁止编造截图或链接里没有的事实。
7. 需要汇报进度时调用 workbench_idea_progress（step/total/message）。

## 继续发散时
只新增目标节点的子方向（2–4 条），不要修改已有节点；新节点的 parentId 指向 "${input.targetNodeId ?? ""}"。
`;
}
function createIdeaModule(options) {
	if (options.db === null || options.db === void 0) return null;
	const store = new IdeaStore(options.db);
	if (typeof options.ensureUnifiedProject === "function") store.ensureUnifiedProject = options.ensureUnifiedProject;
	options.prefix;
	function handle(req, res, path, method, url) {
		return (async () => {
			if (path.startsWith("/assets/vendor/")) {
				if (method !== "GET" && method !== "HEAD") {
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				const rel = path.slice(15);
				const mime = VENDOR_FILES[rel];
				if (mime === void 0) {
					fail$1(res, 404, "asset_not_found");
					return true;
				}
				try {
					const body = readFileSync(join(VENDOR_DIR, rel));
					const cache = rel.endsWith(".css") || rel.endsWith(".js") ? "no-cache" : "public, max-age=86400";
					res.writeHead(200, {
						"content-type": mime,
						"content-length": String(body.length),
						"cache-control": cache,
						"x-content-type-options": "nosniff"
					});
					res.end(body);
				} catch {
					fail$1(res, 404, "asset_missing");
				}
				return true;
			}
			if (!path.startsWith("/ideas")) return false;
			const [a, b, c, d, e] = path.split("/").filter(Boolean).slice(1);
			try {
				if (a === "projects" && b === void 0) {
					if (method === "GET") {
						send$2(res, 200, {
							ok: true,
							projects: store.listProjects()
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$2(req);
						const saved = store.saveProject(body ?? {});
						send$2(res, 200, {
							ok: true,
							project: saved.project,
							created: saved.created
						});
						return true;
					}
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				if (a === "projects" && b !== void 0 && method === "DELETE") {
					if (!/^[A-Za-z0-9_-]{1,64}$/.test(b)) {
						fail$1(res, 400, "project_id_invalid");
						return true;
					}
					store.deleteProject(b);
					send$2(res, 200, { ok: true });
					return true;
				}
				if (a === void 0) {
					if (method === "GET") {
						send$2(res, 200, {
							ok: true,
							ideas: store.listIdeas({
								projectId: url.searchParams.get("projectId") ?? "",
								q: url.searchParams.get("q") ?? ""
							})
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$2(req);
						send$2(res, 200, {
							ok: true,
							idea: store.createIdea({
								...body ?? {},
								customAngles: sanitizeCustomAngles((body ?? {}).customAngles).angles
							})
						});
						return true;
					}
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				const ideaId = a;
				if (!/^[A-Za-z0-9_-]{1,64}$/.test(ideaId)) {
					fail$1(res, 400, "idea_id_invalid");
					return true;
				}
				if (b === void 0) {
					if (method === "GET") {
						const idea = store.getIdea(ideaId);
						if (!idea) {
							fail$1(res, 404, "idea_not_found");
							return true;
						}
						const latest = store.latestRun(ideaId);
						if (latest?.status === "running") {
							const started = Date.parse(String(latest.startedAt ?? "").replace(" ", "T"));
							if (Number.isFinite(started) && Date.now() - started > 6e5) {
								store.updateRun(latest.id, {
									status: "failed",
									error: "超时未回写",
									finished: true,
									message: "生成超时（10 分钟）"
								});
								store.setStatus(ideaId, "draft");
								options.onRunClosed?.(String(latest.id), "failed");
							}
						}
						send$2(res, 200, {
							ok: true,
							idea,
							inputs: store.listInputs(ideaId),
							versions: store.listVersions(ideaId),
							run: store.latestRun(ideaId) ?? null
						});
						return true;
					}
					if (method === "PATCH" || method === "PUT") {
						const body = await readJson$2(req);
						const patch = { ...body ?? {} };
						if (body?.customAngles !== void 0) patch.customAngles = sanitizeCustomAngles(body.customAngles).angles;
						send$2(res, 200, {
							ok: true,
							idea: store.updateIdea(ideaId, patch)
						});
						return true;
					}
					if (method === "DELETE") {
						store.deleteIdea(ideaId);
						send$2(res, 200, { ok: true });
						return true;
					}
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				if (b === "inputs") {
					if (c === void 0 && method === "POST") {
						const body = await readJson$2(req);
						const kind = String(body?.kind ?? "text");
						if (kind === "image") {
							const decoded = decodeDataUrl(body?.dataUrl);
							if (decoded === null) {
								fail$1(res, 400, "图片格式不支持或超过 2MB");
								return true;
							}
							const dir = join(ideaDir(store, ideaId), "inputs");
							mkdirSync(dir, { recursive: true });
							const file = join(dir, `${randomUUID().slice(0, 8)}.${extOf(decoded.mime)}`);
							writeFileSync(file, decoded.buffer);
							send$2(res, 200, {
								ok: true,
								input: store.addInput(ideaId, {
									kind: "image",
									filePath: file,
									mime: decoded.mime,
									size: decoded.buffer.length,
									width: Number(body?.width ?? 0),
									height: Number(body?.height ?? 0),
									text: String(body?.text ?? "")
								})
							});
							return true;
						}
						if (kind === "url") {
							const value = String(body?.url ?? "").trim();
							if (!/^https?:\/\//i.test(value)) {
								fail$1(res, 400, "链接必须以 http(s):// 开头");
								return true;
							}
							send$2(res, 200, {
								ok: true,
								input: store.addInput(ideaId, {
									kind: "url",
									url: value.slice(0, 1e3)
								})
							});
							return true;
						}
						send$2(res, 200, {
							ok: true,
							input: store.addInput(ideaId, {
								kind: "text",
								text: String(body?.text ?? "").slice(0, 2e3)
							})
						});
						return true;
					}
					if (c !== void 0 && method === "DELETE") {
						const row = store.deleteInput(ideaId, c);
						if (row?.file_path) try {
							writeFileSync(row.file_path, "");
						} catch {}
						send$2(res, 200, { ok: true });
						return true;
					}
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				if (b === "draft") {
					if (method === "GET") {
						send$2(res, 200, {
							ok: true,
							...store.getDraft(ideaId)
						});
						return true;
					}
					if (method === "PUT") {
						const body = await readJson$2(req);
						const normalized = normalizeGraph(body?.graph, {});
						if (graphBytes(normalized.graph) > IDEA_LIMITS.graph) {
							fail$1(res, 413, "导图数据过大");
							return true;
						}
						try {
							send$2(res, 200, {
								ok: true,
								rev: store.setDraft(ideaId, normalized.graph, body?.rev === void 0 ? void 0 : Number(body.rev)).rev,
								graph: normalized.graph,
								issues: normalized.issues
							});
						} catch (cause) {
							if (cause?.code === "draft_conflict") send$2(res, 409, {
								ok: false,
								error: "draft_conflict",
								current: store.getDraft(ideaId)
							});
							else throw cause;
						}
						return true;
					}
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				if (b === "versions") {
					if (c === void 0) {
						if (method === "GET") {
							send$2(res, 200, {
								ok: true,
								versions: store.listVersions(ideaId)
							});
							return true;
						}
						if (method === "POST") {
							const body = await readJson$2(req);
							const draft = store.getDraft(ideaId);
							const idea = store.getIdea(ideaId);
							send$2(res, 200, {
								ok: true,
								version: store.createVersion(ideaId, {
									graph: draft.graph,
									source: "manual",
									mode: "archive",
									label: body?.label,
									inputDigest: inputDigest(store.listInputs(ideaId)),
									summary: `手动存档 · ${draft.graph.nodes.length} 节点`
								}),
								idea
							});
							return true;
						}
						fail$1(res, 405, "method_not_allowed");
						return true;
					}
					const versionId = c;
					if (d === void 0) {
						if (method === "GET") {
							const version = store.getVersion(ideaId, versionId);
							if (!version) {
								fail$1(res, 404, "version_not_found");
								return true;
							}
							send$2(res, 200, {
								ok: true,
								version
							});
							return true;
						}
						if (method === "DELETE") {
							store.deleteVersion(ideaId, versionId);
							send$2(res, 200, { ok: true });
							return true;
						}
						fail$1(res, 405, "method_not_allowed");
						return true;
					}
					if (d === "rollback" && method === "POST") {
						send$2(res, 200, {
							ok: true,
							version: store.rollback(ideaId, versionId),
							draft: store.getDraft(ideaId)
						});
						return true;
					}
					if (d === "diff" && method === "GET" && e !== void 0) {
						const left = store.getVersion(ideaId, versionId);
						const right = store.getVersion(ideaId, e);
						if (!left || !right) {
							fail$1(res, 404, "version_not_found");
							return true;
						}
						send$2(res, 200, {
							ok: true,
							diff: diffGraphs(left.graph, right.graph),
							left,
							right
						});
						return true;
					}
					fail$1(res, 404, "route_not_found");
					return true;
				}
				if (b === "export" && method === "POST") {
					const body = await readJson$2(req);
					const format = String(body?.format ?? "json");
					const content = String(body?.content ?? "");
					if (content === "") {
						fail$1(res, 400, "导出内容为空");
						return true;
					}
					if (Buffer.byteLength(content, "utf8") > IDEA_LIMITS.graph * 2) {
						fail$1(res, 413, "导出内容过大");
						return true;
					}
					const idea = store.getIdea(ideaId);
					if (!idea) {
						fail$1(res, 404, "idea_not_found");
						return true;
					}
					if (body?.toWorkspace === true) {
						const dir = join(ideaDir(store, ideaId), "exports");
						mkdirSync(dir, { recursive: true });
						const ext = format === "markdown" ? "md" : format;
						const file = join(dir, `${clampText$2(idea.title, 40) || "idea"}-v${body?.versionSeq ?? "draft"}.${ext}`);
						writeFileSync(file, content, "utf8");
						send$2(res, 200, {
							ok: true,
							filePath: file,
							directory: dir
						});
						return true;
					}
					send$2(res, 200, {
						ok: true,
						content,
						filename: `${clampText$2(idea.title, 40) || "idea"}.${format === "markdown" ? "md" : format}`
					});
					return true;
				}
				if (b === "import" && method === "POST") {
					const normalized = normalizeGraph((await readJson$2(req))?.graph, {});
					send$2(res, 200, {
						ok: true,
						rev: store.setDraft(ideaId, normalized.graph, void 0).rev,
						graph: normalized.graph,
						issues: normalized.issues
					});
					return true;
				}
				if (b === "runs") {
					if (c === void 0 && method === "POST") {
						const body = await readJson$2(req);
						const idea = store.getIdea(ideaId);
						if (!idea) {
							fail$1(res, 404, "idea_not_found");
							return true;
						}
						const mode = body?.kind === "continue" ? "continue" : "diverge";
						const targetNodeId = String(body?.targetNodeId ?? "");
						const target = store.getDraft(ideaId).graph.nodes.find((n) => n.id === targetNodeId);
						if (mode === "continue" && target === void 0) {
							fail$1(res, 400, "目标节点不存在");
							return true;
						}
						const angles = (Array.isArray(body?.angles) ? body.angles : IDEA_ANGLES.map((a) => a.id)).map((id) => String(id)).slice(0, 8);
						const run = store.createRun(ideaId, {
							kind: mode,
							targetNodeId,
							angles
						});
						const prompt = buildIdeaPrompt({
							ideaId,
							runId: String(run.id),
							mode,
							title: String(idea.title),
							brief: String(idea.brief),
							inputs: store.listInputs(ideaId),
							angles,
							customAngles: Array.isArray(idea.customAngles) ? idea.customAngles : [],
							targetNodeId: targetNodeId || void 0,
							targetLabel: target?.label
						});
						const project = store.listProjects().find((p) => p.id === idea.projectId);
						send$2(res, 200, {
							ok: true,
							run,
							prompt,
							workspacePath: project?.workspacePath ?? "",
							sessionPath: project?.workspacePath ?? ""
						});
						return true;
					}
					if (c !== void 0 && d === void 0 && method === "GET") {
						const run = store.getRun(c);
						if (!run || run.ideaId !== ideaId) {
							fail$1(res, 404, "run_not_found");
							return true;
						}
						let dispatch = null;
						try {
							const row = options.db.prepare("SELECT id, status, started_at, session_id FROM agent_dispatches WHERE run_id = ? ORDER BY started_at DESC LIMIT 1").get(String(c));
							if (row !== void 0) dispatch = {
								id: row.id,
								status: row.status,
								startedAt: row.started_at,
								sessionId: row.session_id
							};
						} catch {}
						send$2(res, 200, {
							ok: true,
							run,
							dispatch,
							draft: store.getDraft(ideaId)
						});
						return true;
					}
					if (c !== void 0 && d === "finalize" && method === "POST") {
						const body = await readJson$2(req);
						const run = store.finalizeRun(c, body ?? {});
						if (run?.status === "done") options.onRunClosed?.(c, "done");
						send$2(res, 200, {
							ok: true,
							run,
							draft: store.getDraft(ideaId)
						});
						return true;
					}
					if (c !== void 0 && d === "cancel" && method === "POST") {
						const run = store.updateRun(c, {
							status: "failed",
							error: "用户已停止",
							finished: true,
							message: "已停止"
						});
						store.setStatus(ideaId, "draft");
						options.onRunClosed?.(c, "cancelled");
						send$2(res, 200, {
							ok: true,
							run
						});
						return true;
					}
					fail$1(res, 405, "method_not_allowed");
					return true;
				}
				fail$1(res, 404, "route_not_found");
				return true;
			} catch (cause) {
				const message = String(cause?.message ?? cause);
				if (message.includes("不存在")) {
					fail$1(res, 404, message);
					return true;
				}
				console.warn("[dsh-workbench] 灵感接口失败：", message, path);
				fail$1(res, 500, message);
				return true;
			}
		})();
	}
	function registerTools(ctx) {
		const tools = ctx?.tools;
		if (tools === void 0 || typeof tools.register !== "function") {
			console.warn("[dsh-workbench] tools 服务不可用：灵感工具未注册");
			return;
		}
		const register = (tool, label) => {
			if (typeof ctx.effect === "function") ctx.effect(() => tools.register(tool), `workbench: ${label}`);
			else tools.register(tool);
		};
		register({
			name: "workbench_idea_expand",
			description: "把 AI 发散出的节点写入灵感图。可分批调用（先方向、后点子）；nodes 用 n1..nN，parentId 指向父节点；最后一次调用必须带 final:true 以生成版本。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					ideaId: {
						type: "string",
						description: "灵感 id。"
					},
					runId: {
						type: "string",
						description: "本次生成 runId（由工作台生成接口返回）。"
					},
					mode: {
						type: "string",
						enum: ["diverge", "continue"],
						description: "首次发散或继续发散。"
					},
					targetNodeId: {
						type: "string",
						description: "继续发散的目标节点 id（mode=continue 时必填）。"
					},
					nodes: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string" },
								type: {
									type: "string",
									enum: [
										"direction",
										"idea",
										"question",
										"risk"
									]
								},
								label: {
									type: "string",
									description: "一句话点子，≤24 字。"
								},
								detail: {
									type: "string",
									description: "为什么成立，≤120 字。"
								},
								parentId: { type: "string" },
								angle: {
									type: "string",
									description: "users / pain / form / tech / biz / risk / cross。"
								}
							},
							required: ["id", "label"]
						}
					},
					edges: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								from: { type: "string" },
								to: { type: "string" },
								kind: {
									type: "string",
									enum: ["tree", "relate"]
								},
								label: { type: "string" }
							},
							required: ["from", "to"]
						}
					},
					summary: {
						type: "string",
						description: "一句话总结本次发散。"
					},
					final: {
						type: "boolean",
						description: "是否为最后一批：true 时把草稿冻结成版本。"
					}
				},
				required: [
					"ideaId",
					"runId",
					"nodes"
				]
			},
			output: {
				schema: {},
				render: (_a, v) => [{
					type: "text",
					text: v?.ok ? `已写入 ${v.added ?? 0} 个节点（共 ${v.nodes ?? 0}）${v.versionId ? "，已生成版本" : ""}` : `写入失败：${String(v?.error ?? "")}`
				}]
			},
			async execute(args) {
				try {
					const ideaId = String(args?.ideaId ?? "");
					const runId = String(args?.runId ?? "");
					const run = store.getRun(runId);
					if (!run || run.ideaId !== ideaId) return {
						ok: false,
						error: "run 不存在或不属于该灵感"
					};
					const draft = store.getDraft(ideaId);
					const knownIds = draft.graph.nodes.map((node) => node.id);
					const patch = normalizeGraph({
						rootId: draft.graph.rootId,
						nodes: args?.nodes,
						edges: args?.edges
					}, { knownIds });
					if (patch.graph.nodes.length <= 1) return {
						ok: false,
						error: "没有可写入的节点"
					};
					const merged = mergeGraph(draft.graph, patch, args?.targetNodeId);
					const saved = store.setDraft(ideaId, merged.graph, void 0);
					const issues = merged.issues;
					const log = pushRunLog(run.log, `写入 ${patch.graph.nodes.length - 1} 个节点${issues.length > 0 ? `（${issues.length} 条被修正）` : ""}`);
					const step = Math.min(Number(run.total ?? 5), Number(run.step ?? 0) + 1);
					store.updateRun(runId, {
						step,
						message: String(args?.summary ?? "正在落图").slice(0, 200),
						log
					});
					let versionId;
					if (args?.final === true) {
						const finished = store.finalizeRun(runId, {
							summary: args?.summary,
							inputDigest: inputDigest(store.listInputs(ideaId))
						});
						versionId = finished?.versionId ?? void 0;
						if (finished?.status === "done") options.onRunClosed?.(runId, "done");
						if (issues.length > 0) store.updateRun(runId, { log: pushRunLog(store.getRun(runId)?.log, issues.map((i) => `${i.code}：${i.message}`).join("；")) });
					}
					return {
						ok: true,
						added: patch.graph.nodes.length - 1,
						nodes: merged.graph.nodes.length,
						rev: saved.rev,
						versionId: versionId ?? null,
						issues
					};
				} catch (cause) {
					return {
						ok: false,
						error: String(cause?.message ?? cause)
					};
				}
			}
		}, "idea expand tool");
		register({
			name: "workbench_idea_progress",
			description: "灵感发散的进度上报。开始时 step=0 status=running；每个里程碑调用一次；结束时 status=done（会自动冻结版本）或 failed。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					ideaId: { type: "string" },
					runId: { type: "string" },
					step: { type: "number" },
					total: { type: "number" },
					status: {
						type: "string",
						enum: [
							"running",
							"done",
							"failed"
						]
					},
					message: { type: "string" }
				},
				required: [
					"ideaId",
					"runId",
					"status"
				]
			},
			output: {
				schema: {},
				render: (_a, v) => [{
					type: "text",
					text: v?.ok ? `已更新进度：${String(v.run?.status ?? "")}` : `更新失败：${String(v?.error ?? "")}`
				}]
			},
			async execute(args) {
				try {
					const ideaId = String(args?.ideaId ?? "");
					const runId = String(args?.runId ?? "");
					const run = store.getRun(runId);
					if (!run || run.ideaId !== ideaId) return {
						ok: false,
						error: "run 不存在"
					};
					const status = args?.status === "done" ? "done" : args?.status === "failed" ? "failed" : "running";
					const log = pushRunLog(run.log, String(args?.message ?? status));
					store.updateRun(runId, {
						status: status === "done" ? "running" : status,
						step: args?.step,
						total: args?.total,
						message: String(args?.message ?? "").slice(0, 200),
						log,
						...status === "failed" ? {
							finished: true,
							error: String(args?.message ?? "生成失败")
						} : {}
					});
					if (status === "failed") {
						store.setStatus(ideaId, "draft");
						options.onRunClosed?.(runId, "failed");
					}
					if (status === "done") {
						store.finalizeRun(runId, {
							summary: args?.message,
							inputDigest: inputDigest(store.listInputs(ideaId))
						});
						options.onRunClosed?.(runId, "done");
					}
					return {
						ok: true,
						run: store.getRun(runId)
					};
				} catch (cause) {
					return {
						ok: false,
						error: String(cause?.message ?? cause)
					};
				}
			}
		}, "idea progress tool");
	}
	return {
		store,
		handle,
		registerTools
	};
}
// src/host/agent-model.ts
/**
* 智能体团队 · 纯函数层
*
* 只做校验、默认团队种子、kickoff 提示词拼装；不碰数据库、不碰 HTTP。
* 与灵感模块同样的约定：文本一律 clamp，未知字段忽略，失败返回 issues 而不是抛错。
*/
const AGENT_LIMITS = {
	teamName: 40,
	teamDesc: 200,
	memberName: 12,
	handle: 23,
	intro: 200,
	prompt: 4e3,
	membersPerTeam: 12,
	teams: 20,
	toolsPerMember: 32,
	dispatchGoal: 2e3,
	dispatchTimeoutMs: 9e5,
	memberTimeoutMs: 3e5,
	maxRunningMembers: 3
};
const MEMBER_ROLES = [
	"lead",
	"product",
	"architect",
	"frontend",
	"backend",
	"qa",
	"reviewer",
	"custom"
];
const FILE_WRITES = ["read", "write"];
const MEMORY_SCOPES = [
	"none",
	"personal",
	"project",
	"team",
	"all"
];
function clampText$1(value, limit) {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, limit);
}
/** 中文名无法直接做 DSH teammate 的 name，用稳定 slug 作为会话内名字。 */
function handleOf(name, fallback = "") {
	const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	if (base !== "" && /^[a-z]/.test(base)) return base.slice(0, AGENT_LIMITS.handle);
	return fallback !== "" ? fallback : `m-${Math.random().toString(36).slice(2, 7)}`;
}
function validateMember(raw, existing = []) {
	const issues = [];
	const name = clampText$1(raw.name, AGENT_LIMITS.memberName);
	if (name === "") issues.push({
		code: "NAME_REQUIRED",
		message: "成员名称不能为空"
	});
	const handle = clampText$1(raw.handle, AGENT_LIMITS.handle) || handleOf(name);
	if (!/^[a-z][a-z0-9-]{1,23}$/.test(handle)) issues.push({
		code: "HANDLE_INVALID",
		message: "成员 handle 只能是小写字母/数字/短横线"
	});
	const clash = existing.find((m) => m.id !== raw.id && (m.name === name || m.handle === handle));
	if (clash !== void 0) issues.push({
		code: "MEMBER_DUPLICATE",
		message: `成员「${clash.name}」已存在`
	});
	const role = MEMBER_ROLES.includes(String(raw.role)) ? String(raw.role) : "custom";
	const fileWrite = FILE_WRITES.includes(String(raw.fileWrite)) ? String(raw.fileWrite) : role === "frontend" || role === "backend" ? "write" : "read";
	const memoryScope = MEMORY_SCOPES.includes(String(raw.memoryScope)) ? String(raw.memoryScope) : "project";
	const tools = Array.isArray(raw.tools) ? raw.tools.map((item) => clampText$1(item, 40)).filter(Boolean).slice(0, AGENT_LIMITS.toolsPerMember) : [];
	const skills = Array.isArray(raw.skills) ? raw.skills.map((item) => clampText$1(item, 40)).filter(Boolean).slice(0, 20) : [];
	const mcp = Array.isArray(raw.mcp) ? raw.mcp.map((item) => clampText$1(item, 60)).filter(Boolean).slice(0, 20) : [];
	const concurrency = Math.min(4, Math.max(1, Number(raw.concurrency) || 1));
	if (issues.length > 0) return {
		member: null,
		issues
	};
	return {
		member: {
			id: clampText$1(raw.id, 64) || `am-${Math.random().toString(36).slice(2, 10)}`,
			name,
			handle,
			role,
			intro: clampText$1(raw.intro, AGENT_LIMITS.intro),
			systemPrompt: clampText$1(raw.systemPrompt, AGENT_LIMITS.prompt),
			model: clampText$1(raw.model, 80),
			provider: clampText$1(raw.provider, 40),
			tools,
			skills,
			mcp,
			memoryScope,
			concurrency,
			fileWrite,
			enabled: raw.enabled === void 0 ? true : Boolean(raw.enabled)
		},
		issues
	};
}
/** 默认「产品研发」7 人；提示词按 DSH/Agent Teams 的实际约束写，强调工具契约与产物边界。 */
function defaultMembers() {
	return [
		[
			"主理人",
			"lead",
			"lead",
			"拆任务、建任务板、派成员、验收与汇总；不直接改文件",
			[
				"你是「{team}」的主理人（Lead），负责把一次灵感发散变成可验收的结果。",
				"职责：① 先用 team_task_create 建任务板（每个方向/模块一条，写清验收标准）；② 再按职责用 spawn_teammate 创建成员（name 用给定的 handle，context 用 fresh）；③ 把任务 owner 分给成员，方向任务可并行但同时在跑不超过 3 个；④ 定期用 wait_agent 收进展，失败/超时的成员重派一次，仍失败就记录缺口；⑤ 全部完成后调用 workbench_idea_progress(done)，并用中文给出 3–5 行总结（方向、节点数、缺口）。",
				"约束：不直接写灵感节点（由成员调用 workbench_idea_expand）；不修改任务范围外的文件；成员 handle 创建后不可改、不可复用；不要使用 agent_teams_* 工具，统一用 spawn_teammate / team_task_*。"
			].join("\n"),
			"read"
		],
		[
			"产品",
			"product",
			"product",
			"用户、场景、价值与边界",
			[
				"你是产品负责人，从用户与价值角度发散灵感。",
				"工作方式：先读灵感正文与已有节点，再围绕「谁在什么场景下遇到什么问题」产出 3–5 条点子；每条必须写清用户、场景、收益与不做什么。",
				"产出：调用 workbench_idea_expand 写入节点（parentId 指向分到你的方向节点，type=idea，label ≤24 字，detail ≤120 字说明为什么成立）。不要改工作区文件。"
			].join("\n"),
			"read"
		],
		[
			"架构",
			"architect",
			"architect",
			"技术方案、可行性、关键取舍与风险",
			[
				"你是架构负责人，从技术可行性与取舍角度发散。",
				"工作方式：识别实现该灵感需要的能力（数据/模型/工具/外部服务），给出 2–3 种方案并说明取舍与风险；指出不可行或高成本的部分。",
				"产出：调用 workbench_idea_expand 写节点（type=idea 或 risk），detail 写清「为什么可行/为什么有风险」。不要修改实现文件。"
			].join("\n"),
			"read"
		],
		[
			"前端",
			"frontend",
			"frontend",
			"交互、界面与实现",
			[
				"你是前端负责人，从交互与实现角度发散与落地。",
				"工作方式：围绕用户路径给出界面/交互方案与关键组件；如果任务包含代码实现，只改任务 writeScopes 内的文件，并先读现有代码再改。",
				"产出：点子写入 workbench_idea_expand；代码变更后说明改了哪些文件、如何验证。不要顺手重构无关代码。"
			].join("\n"),
			"write"
		],
		[
			"后端",
			"backend",
			"backend",
			"接口、数据、任务与集成",
			[
				"你是后端负责人，从接口、数据与集成角度发散与落地。",
				"工作方式：明确数据模型、接口契约、异步任务与失败重试；如果任务包含代码实现，只改任务 writeScopes 内的文件。",
				"产出：点子写入 workbench_idea_expand；代码变更后给出接口/数据变更说明与验证方式。不要改前端文件。"
			].join("\n"),
			"write"
		],
		[
			"测试",
			"qa",
			"qa",
			"用例、边界、反例与回归",
			[
				"你是测试负责人，从可验证性与边界角度发散。",
				"工作方式：对每个方向给出「怎么验证」，列关键边界、反例与回归点；优先指出当前方案无法验证的地方。",
				"产出：写入 workbench_idea_expand（type=question 或 risk，detail 写验证方式）。只读，不修改实现文件。"
			].join("\n"),
			"read"
		],
		[
			"评审",
			"reviewer",
			"reviewer",
			"独立复核与挑错",
			[
				"你是独立评审人，只负责挑错，不参与实现。",
				"工作方式：检查其他成员的产出是否有事实错误、逻辑跳跃、不可验证或超出任务范围的改动；每条意见给出「问题 + 建议」。",
				"产出：写入 workbench_idea_expand（type=risk，detail 写问题与建议），或通过 send_message 反馈给主理人。只读，不改文件。"
			].join("\n"),
			"read"
		]
	].map(([name, handle, role, intro, systemPrompt, fileWrite]) => ({
		name,
		handle,
		role,
		intro,
		systemPrompt,
		model: "",
		provider: "",
		tools: [],
		skills: [],
		mcp: [],
		memoryScope: "project",
		concurrency: 1,
		fileWrite,
		enabled: true
	}));
}
/** 派发契约：固定工具名、任务板顺序、并发/超时、写回方式与失败要求。 */
function buildTeamKickoff(input) {
	const roster = input.members.filter((member) => member.enabled).map((member) => {
		const extras = [];
		if (member.model !== "") extras.push(`model=${member.provider !== "" ? `${member.provider}/` : ""}${member.model}`);
		if (member.skills.length > 0) extras.push(`skills=${member.skills.join("|")}`);
		if (member.mcp.length > 0) extras.push(`mcp=${member.mcp.join("|")}`);
		const suffix = extras.length > 0 ? `，${extras.join("，")}` : "";
		return `- ${member.name}（handle="${member.handle}"，role=${member.role}，fileWrite=${member.fileWrite}${suffix}）：${member.intro || member.role}`;
	}).join("\n");
	const lines = [
		`你是「${input.team.name}」的主理人（Lead）。请用 Agent Teams 完成一次灵感发散。`,
		"",
		`## 目标`,
		input.goal || "围绕这个灵感做多方向发散，产出可直接落图的节点。",
		"",
		`## 灵感`,
		`- 标题：${input.idea.title}`,
		`- 正文：${input.idea.brief || "（无）"}`,
		`- ideaId：${input.ideaId}；runId：${input.runId}`,
		`- 工作区：${input.workspacePath || "（未指定，使用默认工作目录）"}`,
		"",
		`## 团队（最多 ${AGENT_LIMITS.membersPerTeam} 人，本次按下表创建）`,
		input.featureLabel !== void 0 ? `功能：${input.featureLabel}` : "",
		input.executors !== void 0 && input.executors.length > 0 ? `按团队配置，本次候选执行人：${input.executors.join("、")}（主理人调度，可从中选人执行；不要创建表外成员）` : "团队未绑定具体执行人：从下表中选择最合适的成员执行。",
		roster,
		"",
		`## 执行顺序（必须遵守）`,
		`1. 先建任务板：每个发散方向一条任务（team_task_create / agent_teams_create_task 二选一，优先 team_task_create）。`,
		`2. 再创建成员：用 spawn_teammate 按上表 handle 创建（不要创建上表之外的成员）。`,
		`3. 分配任务：同时进行的成员不超过 ${AGENT_LIMITS.maxRunningMembers} 个。`,
		`4. 成员把点子写回灵感：调用 workbench_idea_expand，参数 ideaId="${input.ideaId}"、runId="${input.runId}"，nodes 的 parentId 指向方向节点 id；每个方向 3–5 条。`,
		`5. 全部完成后调用 workbench_idea_progress，参数 status="done"。`,
		`6. 最后用中文给出一段总结（做了哪些方向、产物在哪、有什么缺口）。`,
		"",
		`## 约束`,
		`- 成员失败或超时：重派一次；仍失败就在总结里写明，不要静默跳过。`,
		`- fileWrite=read 的成员禁止改工作区文件；所有成员都禁止改与本任务无关的文件。`,
		`- 只写灵感节点，不新建仓库文件；需要写文件时先确认任务范围。`,
		`- 整体预算：${input.timeoutMinutes} 分钟；超时前必须完成或给出部分结果。`
	];
	if (input.memory !== void 0 && input.memory !== "") lines.push("", "## 记忆（由工作台注入，可直接使用）", input.memory);
	if (input.knowledge !== void 0 && input.knowledge !== "") lines.push("", "## 知识（工作区检索结果，带来源）", input.knowledge);
	return lines.join("\n");
}
const FEATURE_IDS = new Set([
	{
		id: "idea.diverge",
		label: "灵感 · 多方向发散"
	},
	{
		id: "idea.continue",
		label: "灵感 · 节点继续发散"
	},
	{
		id: "idea.review",
		label: "灵感 · 结果评审"
	},
	{
		id: "product.design",
		label: "产品 · 设计发散"
	},
	{
		id: "bug.fix",
		label: "Bug · 修复建议"
	},
	{
		id: "test.design",
		label: "测试 · 用例设计"
	}
].map((feature) => feature.id));
/** 只保留已知功能、去重、每个功能最多 6 个候选执行人。 */
function normalizeBindings(raw) {
	const out = {};
	if (raw === null || typeof raw !== "object") return out;
	for (const [feature, value] of Object.entries(raw)) {
		if (!FEATURE_IDS.has(feature)) continue;
		const ids = Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean).slice(0, 6) : [];
		if (ids.length > 0) out[feature] = [...new Set(ids)];
	}
	return out;
}
/** 派发时的记忆注入：按作用域标注来源，总量截断，避免挤占上下文。 */
function assembleMemory(entries, limit = 2e3) {
	const lines = [];
	let used = 0;
	for (const entry of entries) {
		const line = `- [${entry.scope}] ${entry.content}`.slice(0, 500);
		if (used + line.length > limit) break;
		lines.push(line);
		used += line.length + 1;
	}
	return lines.join("\n");
}
/** 知识注入：带路径来源，便于模型判断是否相关。 */
function assembleKnowledge(hits, limit = 1600) {
	const lines = [];
	let used = 0;
	hits.forEach((hit, index) => {
		const body = hit.chunk.replace(/\s+/g, " ").slice(0, 500);
		const line = `[${index + 1}] ${hit.path}\n${body}`;
		if (used + line.length > limit) return;
		lines.push(line);
		used += line.length + 1;
	});
	return lines.join("\n\n");
}
// src/host/agent-store.ts
/**
* 智能体团队 · 存储层
*
* 与灵感共用同一个 SQLite 连接（同一文件只留一个写者），但表独立、端点独立，
* 不进整份任务快照（PUT /state）。
*/
/**
* 本地时间字符串（与 idea-store / 主壳的 isoDateTime 一致）。
* 不能用 toISOString()：那是 UTC，配合 Date.parse（无时区按本地解析）会差 8 小时，
* 导致新建的派发被误判为「已超时」。
*/
const now = () => {
	const d = /* @__PURE__ */ new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const SCHEMA$1 = `
CREATE TABLE IF NOT EXISTS agent_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  desc TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  default_workspace TEXT NOT NULL DEFAULT '',
  bindings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',
  intro TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  tools_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  mcp_json TEXT NOT NULL DEFAULT '[]',
  memory_scope TEXT NOT NULL DEFAULT 'project',
  concurrency INTEGER NOT NULL DEFAULT 1,
  file_write TEXT NOT NULL DEFAULT 'read',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_team_members (
  team_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  file_write_override TEXT NOT NULL DEFAULT '',
  ord INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, member_id)
);
CREATE TABLE IF NOT EXISTS agent_dispatches (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL DEFAULT '',
  run_id TEXT NOT NULL DEFAULT '',
  team_id TEXT NOT NULL,
  session_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'dispatching',
  goal TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  kickoff TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS agent_dispatch_members (
  dispatch_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  session_member_name TEXT NOT NULL DEFAULT '',
  file_write TEXT NOT NULL DEFAULT 'read',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (dispatch_id, member_id)
);
CREATE TABLE IF NOT EXISTS agent_dispatch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  member TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  team_id TEXT NOT NULL DEFAULT '',
  member_id TEXT NOT NULL DEFAULT '',
  project_path TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  mtime INTEGER NOT NULL DEFAULT 0,
  hash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_teams_default ON agent_teams(is_default);
CREATE INDEX IF NOT EXISTS idx_agent_team_members_team ON agent_team_members(team_id, ord);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_idea ON agent_dispatches(idea_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_dispatches_status ON agent_dispatches(status);
CREATE INDEX IF NOT EXISTS idx_agent_dispatch_events_dispatch ON agent_dispatch_events(dispatch_id, seq);
CREATE INDEX IF NOT EXISTS idx_agent_memory_scope ON agent_memory(scope, project_path, team_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_project ON knowledge_docs(project_path);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks(doc_id, ord);
`;
function parseJson$1(raw, fallback) {
	if (typeof raw !== "string" || raw === "") return fallback;
	try {
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}
var AgentStore = class {
	db;
	constructor(db) {
		this.db = db;
		this.db.exec(SCHEMA$1);
		this.migrateColumns();
		this.migrateFts();
		this.seedDefault();
	}
	/** 旧库补列（bindings_json 等）。 */
	migrateColumns() {
		try {
			if (!this.db.prepare("PRAGMA table_info(agent_teams)").all().map((col) => String(col.name)).includes("bindings_json")) this.db.exec("ALTER TABLE agent_teams ADD COLUMN bindings_json TEXT NOT NULL DEFAULT '{}'");
		} catch (cause) {
			console.warn("[dsh-workbench] agent_teams 补列失败：", String(cause));
		}
	}
	/** FTS5 不可用时降级为 LIKE（本机验证可用，仍做保护）。 */
	ftsReady = false;
	migrateFts() {
		try {
			const cols = this.db.prepare("PRAGMA table_info('knowledge_chunks_fts')").all();
			const hasChunkId = cols.some((col) => String(col.name) === "chunk_id");
			if (cols.length > 0 && !hasChunkId) this.db.exec("DROP TABLE knowledge_chunks_fts");
			this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(chunk_id UNINDEXED, text)");
			this.ftsReady = true;
		} catch {
			this.ftsReady = false;
		}
	}
	get searchable() {
		return this.ftsReady;
	}
	/** 首次启动写入默认「产品研发」团队；之后只读不覆盖。 */
	seedDefault() {
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM agent_teams").get()?.n ?? 0) > 0) return;
		const teamId = `at-${randomUUID().slice(0, 8)}`;
		const ts = now();
		this.db.prepare("INSERT INTO agent_teams(id, name, desc, is_default, default_workspace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(teamId, "产品研发", "主理人 + 产品 / 架构 / 前端 / 后端 / 测试 / 评审", 1, "", ts, ts);
		defaultMembers().forEach((seed, index) => {
			const member = {
				...seed,
				id: `am-${randomUUID().slice(0, 8)}`
			};
			this.db.prepare(`INSERT INTO agent_members(id,name,handle,role,intro,system_prompt,model,provider,tools_json,skills_json,mcp_json,memory_scope,concurrency,file_write,enabled,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(member.id, member.name, member.handle, member.role, member.intro, member.systemPrompt, "", "", "[]", "[]", "[]", member.memoryScope, member.concurrency, member.fileWrite, 1, ts, ts);
			this.db.prepare("INSERT INTO agent_team_members(team_id, member_id, file_write_override, ord) VALUES(?,?,?,?)").run(teamId, member.id, "", index);
		});
	}
	listTeams() {
		return this.db.prepare("SELECT * FROM agent_teams ORDER BY is_default DESC, name").all().map((row) => this.teamView(row, true));
	}
	getTeam(id) {
		const row = this.db.prepare("SELECT * FROM agent_teams WHERE id = ?").get(id);
		return row === void 0 ? null : this.teamView(row, true);
	}
	teamView(row, withMembers) {
		const members = withMembers ? this.listTeamMembers(String(row.id)) : [];
		return {
			id: String(row.id),
			name: String(row.name),
			desc: String(row.desc ?? ""),
			isDefault: Number(row.is_default) === 1,
			defaultWorkspace: String(row.default_workspace ?? ""),
			bindings: parseJson$1(row.bindings_json, {}),
			memberCount: Number(this.db.prepare("SELECT COUNT(*) AS n FROM agent_team_members WHERE team_id = ?").get(row.id)?.n ?? 0),
			members
		};
	}
	listTeamMembers(teamId) {
		return this.db.prepare(`SELECT m.*, tm.file_write_override, tm.ord FROM agent_team_members tm
      JOIN agent_members m ON m.id = tm.member_id WHERE tm.team_id = ? ORDER BY tm.ord, m.name`).all(teamId).map((row) => this.memberView(row, String(row.file_write_override ?? "")));
	}
	memberView(row, override = "") {
		return {
			id: String(row.id),
			name: String(row.name),
			handle: String(row.handle),
			role: String(row.role),
			intro: String(row.intro ?? ""),
			systemPrompt: String(row.system_prompt ?? ""),
			model: String(row.model ?? ""),
			provider: String(row.provider ?? ""),
			tools: parseJson$1(row.tools_json, []),
			skills: parseJson$1(row.skills_json, []),
			mcp: parseJson$1(row.mcp_json, []),
			memoryScope: String(row.memory_scope ?? "project"),
			concurrency: Number(row.concurrency ?? 1),
			fileWrite: override === "write" || override === "read" ? override : String(row.file_write ?? "read"),
			enabled: Number(row.enabled ?? 1) === 1
		};
	}
	saveTeam(input) {
		const id = String(input?.id ?? "") || `at-${randomUUID().slice(0, 8)}`;
		const name = String(input?.name ?? "").trim().slice(0, AGENT_LIMITS.teamName) || "未命名团队";
		const desc = String(input?.desc ?? "").trim().slice(0, AGENT_LIMITS.teamDesc);
		const workspace = String(input?.defaultWorkspace ?? "").trim().slice(0, 500);
		const ts = now();
		const exists = this.db.prepare("SELECT id, bindings_json FROM agent_teams WHERE id = ?").get(id);
		const bindings = input?.bindings === void 0 ? String(exists?.bindings_json ?? "{}") : JSON.stringify(normalizeBindings(input.bindings));
		if (exists !== void 0) this.db.prepare("UPDATE agent_teams SET name=?, desc=?, default_workspace=?, bindings_json=?, updated_at=? WHERE id=?").run(name, desc, workspace, bindings, ts, id);
		else {
			if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM agent_teams").get()?.n ?? 0) >= AGENT_LIMITS.teams) throw new Error(`最多 ${AGENT_LIMITS.teams} 个团队`);
			this.db.prepare("INSERT INTO agent_teams(id,name,desc,is_default,default_workspace,bindings_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, name, desc, 0, workspace, bindings, ts, ts);
		}
		return this.getTeam(id) ?? {};
	}
	deleteTeam(id) {
		this.db.prepare("DELETE FROM agent_team_members WHERE team_id = ?").run(id);
		this.db.prepare("DELETE FROM agent_teams WHERE id = ?").run(id);
	}
	addMemberToTeam(teamId, memberId) {
		const ord = Number(this.db.prepare("SELECT COALESCE(MAX(ord),-1)+1 AS n FROM agent_team_members WHERE team_id = ?").get(teamId)?.n ?? 0);
		this.db.prepare("INSERT OR IGNORE INTO agent_team_members(team_id, member_id, file_write_override, ord) VALUES(?,?,?,?)").run(teamId, memberId, "", ord);
		return this.getTeam(teamId) ?? {};
	}
	setTeamMember(teamId, memberId, patch) {
		const override = patch?.fileWrite === "write" || patch?.fileWrite === "read" ? String(patch.fileWrite) : "";
		const ord = Number.isFinite(Number(patch?.ord)) ? Number(patch.ord) : 0;
		this.db.prepare("UPDATE agent_team_members SET file_write_override = ?, ord = ? WHERE team_id = ? AND member_id = ?").run(override, ord, teamId, memberId);
		return this.getTeam(teamId) ?? {};
	}
	removeMemberFromTeam(teamId, memberId) {
		this.db.prepare("DELETE FROM agent_team_members WHERE team_id = ? AND member_id = ?").run(teamId, memberId);
	}
	listMembers() {
		return this.db.prepare("SELECT * FROM agent_members ORDER BY name").all().map((row) => this.memberView(row));
	}
	getMember(id) {
		const row = this.db.prepare("SELECT * FROM agent_members WHERE id = ?").get(id);
		return row === void 0 ? null : this.memberView(row);
	}
	saveMember(raw) {
		const { member, issues } = validateMember(raw, this.listMembers());
		if (member === null) return {
			member: null,
			issues
		};
		const ts = now();
		const exists = this.db.prepare("SELECT id FROM agent_members WHERE id = ?").get(member.id);
		const values = [
			member.name,
			member.handle,
			member.role,
			member.intro,
			member.systemPrompt,
			member.model,
			member.provider,
			JSON.stringify(member.tools),
			JSON.stringify(member.skills),
			JSON.stringify(member.mcp),
			member.memoryScope,
			member.concurrency,
			member.fileWrite,
			member.enabled ? 1 : 0,
			ts
		];
		if (exists !== void 0) this.db.prepare(`UPDATE agent_members SET name=?, handle=?, role=?, intro=?, system_prompt=?, model=?, provider=?,
        tools_json=?, skills_json=?, mcp_json=?, memory_scope=?, concurrency=?, file_write=?, enabled=?, updated_at=? WHERE id=?`).run(...values, member.id);
		else this.db.prepare(`INSERT INTO agent_members(id,name,handle,role,intro,system_prompt,model,provider,tools_json,skills_json,mcp_json,memory_scope,concurrency,file_write,enabled,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(member.id, ...values.slice(0, 14), ts, ts);
		return {
			member: this.getMember(member.id),
			issues: []
		};
	}
	deleteMember(id) {
		this.db.prepare("DELETE FROM agent_team_members WHERE member_id = ?").run(id);
		this.db.prepare("DELETE FROM agent_members WHERE id = ?").run(id);
	}
	createDispatch(input) {
		const id = `ad-${randomUUID().slice(0, 8)}`;
		const ts = now();
		this.db.prepare(`INSERT INTO agent_dispatches(id,idea_id,run_id,team_id,session_id,status,goal,workspace_path,timeout_ms,member_count,kickoff,started_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, String(input.ideaId ?? ""), String(input.runId ?? ""), String(input.teamId ?? ""), "", "dispatching", String(input.goal ?? "").slice(0, AGENT_LIMITS.dispatchGoal), String(input.workspacePath ?? ""), Number(input.timeoutMs) || AGENT_LIMITS.dispatchTimeoutMs, Number(input.memberCount) || 0, String(input.kickoff ?? ""), ts);
		const members = Array.isArray(input.members) ? input.members : [];
		for (const member of members) this.db.prepare("INSERT OR IGNORE INTO agent_dispatch_members(dispatch_id,member_id,member_name,session_member_name,file_write,status,joined_at) VALUES(?,?,?,?,?,?,?)").run(id, String(member.id ?? ""), String(member.name ?? ""), String(member.handle ?? ""), String(member.fileWrite ?? "read"), "pending", ts);
		return this.getDispatch(id) ?? {};
	}
	getDispatch(id) {
		const row = this.db.prepare("SELECT * FROM agent_dispatches WHERE id = ?").get(id);
		if (row === void 0) return null;
		const members = this.db.prepare("SELECT * FROM agent_dispatch_members WHERE dispatch_id = ? ORDER BY joined_at").all(id);
		return this.dispatchView(row, members.map((member) => ({
			memberId: String(member.member_id),
			name: String(member.member_name),
			handle: String(member.session_member_name),
			fileWrite: String(member.file_write),
			status: String(member.status),
			error: String(member.error ?? "")
		})));
	}
	dispatchView(row, members) {
		return {
			id: String(row.id),
			ideaId: String(row.idea_id ?? ""),
			runId: String(row.run_id ?? ""),
			teamId: String(row.team_id),
			sessionId: String(row.session_id ?? ""),
			status: String(row.status),
			goal: String(row.goal ?? ""),
			workspacePath: String(row.workspace_path ?? ""),
			timeoutMs: Number(row.timeout_ms ?? 0),
			memberCount: Number(row.member_count ?? 0),
			startedAt: String(row.started_at ?? ""),
			finishedAt: String(row.finished_at ?? ""),
			error: String(row.error ?? ""),
			members
		};
	}
	updateDispatch(id, patch) {
		const row = this.db.prepare("SELECT * FROM agent_dispatches WHERE id = ?").get(id);
		if (row === void 0) return null;
		const status = typeof patch?.status === "string" ? patch.status : String(row.status);
		const finished = [
			"done",
			"partial",
			"failed",
			"timeout",
			"cancelled"
		].includes(status);
		this.db.prepare(`UPDATE agent_dispatches SET status=?, session_id=?, error=?, member_count=?, tokens=?, finished_at=CASE WHEN ?=1 THEN ? ELSE finished_at END WHERE id=?`).run(status, patch?.sessionId === void 0 ? String(row.session_id ?? "") : String(patch.sessionId), patch?.error === void 0 ? String(row.error ?? "") : String(patch.error).slice(0, 500), patch?.memberCount === void 0 ? Number(row.member_count ?? 0) : Number(patch.memberCount) || 0, patch?.tokens === void 0 ? Number(row.tokens ?? 0) : Number(patch.tokens) || 0, finished ? 1 : 0, finished ? now() : "", id);
		if (Array.isArray(patch?.members)) for (const member of patch.members) this.db.prepare("UPDATE agent_dispatch_members SET status=?, error=? WHERE dispatch_id=? AND member_id=?").run(String(member.status ?? "pending"), String(member.error ?? "").slice(0, 300), id, String(member.memberId ?? ""));
		return this.getDispatch(id);
	}
	listDispatches(ideaId, limit = 10) {
		return (ideaId !== "" ? this.db.prepare("SELECT * FROM agent_dispatches WHERE idea_id = ? ORDER BY started_at DESC LIMIT ?").all(ideaId, limit) : this.db.prepare("SELECT * FROM agent_dispatches ORDER BY started_at DESC LIMIT ?").all(limit)).map((row) => this.dispatchView(row, []));
	}
	/**
	* 找该灵感正在跑的派发。顺手做惰性收尾：
	* 关联 run 已终态、或超过派发预算的 dispatch 会被标记结束，不再挡住下一次派发。
	* （此前没有任何自动收尾，一条卡住的 dispatch 会让该灵感永久 409。）
	*/
	runningDispatchForIdea(ideaId) {
		const rows = this.db.prepare("SELECT * FROM agent_dispatches WHERE idea_id = ? AND status IN ('dispatching','running') ORDER BY started_at DESC").all(ideaId);
		for (const row of rows) {
			const runId = String(row.run_id ?? "");
			let run;
			let tableMissing = false;
			if (runId !== "") try {
				run = this.db.prepare("SELECT status, finished_at FROM idea_runs WHERE id = ?").get(runId);
			} catch {
				tableMissing = true;
			}
			if (runId !== "" && run !== void 0 && [
				"done",
				"failed",
				"cancelled"
			].includes(String(run.status))) {
				this.updateDispatch(String(row.id), {
					status: run.status === "done" ? "done" : "cancelled",
					error: `关联运行已${run.status === "done" ? "完成" : "结束"}（自动收尾）`
				});
				continue;
			}
			const budget = Number(row.timeout_ms) > 0 ? Number(row.timeout_ms) : 9e5;
			const started = Date.parse(String(row.started_at ?? "").replace(" ", "T"));
			const age = Number.isFinite(started) ? Date.now() - started : 0;
			if (runId !== "" && run === void 0 && !tableMissing && age > 12e4) {
				this.updateDispatch(String(row.id), {
					status: "cancelled",
					error: "关联运行不存在（自动收尾）"
				});
				continue;
			}
			if (age > budget) {
				this.updateDispatch(String(row.id), {
					status: "timeout",
					error: "派发超时（自动收尾）"
				});
				continue;
			}
			return this.getDispatch(String(row.id));
		}
		return null;
	}
	/** 运行结束时按 run_id 关闭对应派发（由灵感模块回调）。 */
	finishDispatchByRun(runId, status) {
		if (runId === "") return;
		const row = this.db.prepare("SELECT id FROM agent_dispatches WHERE run_id = ? AND status IN ('dispatching','running') ORDER BY started_at DESC LIMIT 1").get(runId);
		if (row === void 0) return;
		const next = status === "done" ? "done" : status === "failed" ? "failed" : "cancelled";
		this.updateDispatch(String(row.id), { status: next });
	}
	appendEvent(dispatchId, kind, member, payload) {
		const seq = Number(this.db.prepare("SELECT COALESCE(MAX(seq),0)+1 AS n FROM agent_dispatch_events WHERE dispatch_id = ?").get(dispatchId)?.n ?? 1);
		this.db.prepare("INSERT INTO agent_dispatch_events(dispatch_id,seq,kind,member,payload_json,at) VALUES(?,?,?,?,?,?)").run(dispatchId, seq, kind.slice(0, 40), member.slice(0, 40), JSON.stringify(payload ?? {}).slice(0, 8e3), now());
	}
	listEvents(dispatchId, limit = 200) {
		return this.db.prepare("SELECT * FROM agent_dispatch_events WHERE dispatch_id = ? ORDER BY seq LIMIT ?").all(dispatchId, limit).map((row) => ({
			seq: Number(row.seq),
			kind: String(row.kind),
			member: String(row.member ?? ""),
			payload: parseJson$1(row.payload_json, {}),
			at: String(row.at)
		}));
	}
	addMemory(input) {
		const id = `mem-${randomUUID().slice(0, 8)}`;
		const ts = now();
		const content = String(input?.content ?? "").trim().slice(0, 4e3);
		if (content === "") throw new Error("记忆内容不能为空");
		const scope = [
			"personal",
			"project",
			"team",
			"global"
		].includes(String(input?.scope)) ? String(input.scope) : "project";
		this.db.prepare("INSERT INTO agent_memory(id,scope,team_id,member_id,project_path,content,source,pinned,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, scope, String(input?.teamId ?? ""), String(input?.memberId ?? ""), String(input?.projectPath ?? ""), content, String(input?.source ?? "manual").slice(0, 40), input?.pinned === true ? 1 : 0, ts, ts);
		return this.getMemory(id) ?? {};
	}
	getMemory(id) {
		const row = this.db.prepare("SELECT * FROM agent_memory WHERE id = ?").get(id);
		if (row === void 0) return null;
		return {
			id: String(row.id),
			scope: String(row.scope),
			teamId: String(row.team_id ?? ""),
			memberId: String(row.member_id ?? ""),
			projectPath: String(row.project_path ?? ""),
			content: String(row.content),
			source: String(row.source ?? "manual"),
			pinned: Number(row.pinned ?? 0) === 1,
			createdAt: String(row.created_at),
			updatedAt: String(row.updated_at)
		};
	}
	updateMemory(id, patch) {
		const row = this.getMemory(id);
		if (row === null) return null;
		const content = patch?.content === void 0 ? String(row.content) : String(patch.content).trim().slice(0, 4e3);
		const pinned = patch?.pinned === void 0 ? row.pinned ? 1 : 0 : patch.pinned === true ? 1 : 0;
		this.db.prepare("UPDATE agent_memory SET content = ?, pinned = ?, updated_at = ? WHERE id = ?").run(content, pinned, now(), id);
		return this.getMemory(id);
	}
	deleteMemory(id) {
		this.db.prepare("DELETE FROM agent_memory WHERE id = ?").run(id);
	}
	listMemory(filter = {}) {
		const clauses = [];
		const args = [];
		if (typeof filter.scope === "string" && filter.scope !== "") {
			clauses.push("scope = ?");
			args.push(filter.scope);
		}
		if (typeof filter.teamId === "string" && filter.teamId !== "") {
			clauses.push("team_id = ?");
			args.push(filter.teamId);
		}
		if (typeof filter.projectPath === "string" && filter.projectPath !== "") {
			clauses.push("(project_path = ? OR project_path = '')");
			args.push(filter.projectPath);
		}
		const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
		return this.db.prepare(`SELECT * FROM agent_memory ${where} ORDER BY pinned DESC, updated_at DESC LIMIT 200`).all(...args).map((row) => ({
			id: String(row.id),
			scope: String(row.scope),
			teamId: String(row.team_id ?? ""),
			memberId: String(row.member_id ?? ""),
			projectPath: String(row.project_path ?? ""),
			content: String(row.content),
			source: String(row.source ?? "manual"),
			pinned: Number(row.pinned ?? 0) === 1,
			createdAt: String(row.created_at),
			updatedAt: String(row.updated_at)
		}));
	}
};
// src/host/knowledge.ts
/**
* 知识索引：工作区文本 → 分块 → SQLite FTS5 检索。
*
* 本地优先：不引入向量库；FTS5 不可用时退化为 LIKE。索引按工作区隔离。
*/
const KNOWLEDGE_LIMITS = {
	files: 2e3,
	fileBytes: 524288,
	chunkSize: 600,
	chunkOverlap: 80,
	topK: 8
};
const TEXT_EXT = /* @__PURE__ */ new Set([
	".md",
	".txt",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".json",
	".py",
	".java",
	".go",
	".rs",
	".sql",
	".yml",
	".yaml",
	".html",
	".css",
	".vue",
	".sh"
]);
const SKIP_DIR = /* @__PURE__ */ new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"coverage",
	".next",
	".nuxt",
	".turbo",
	".dsh-workbench",
	".idea",
	".vscode",
	"target",
	"__pycache__"
]);
function chunkText(text, size = KNOWLEDGE_LIMITS.chunkSize, overlap = KNOWLEDGE_LIMITS.chunkOverlap) {
	const clean = text.replace(/\r\n/g, "\n").trim();
	if (clean === "") return [];
	const chunks = [];
	let start = 0;
	while (start < clean.length) {
		const end = Math.min(clean.length, start + size);
		let cut = end;
		if (end < clean.length) {
			const slice = clean.slice(start, end);
			const at = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf("。"));
			if (at > size * .4) cut = start + at + 1;
		}
		const piece = clean.slice(start, cut).trim();
		if (piece !== "") chunks.push(piece);
		if (cut >= clean.length) break;
		start = Math.max(start + 1, cut - overlap);
	}
	return chunks;
}
function collectTextFiles(root, limits = KNOWLEDGE_LIMITS) {
	const files = [];
	let skipped = 0;
	const walk = (dir, depth) => {
		if (files.length >= limits.files || depth > 12) return;
		let entries = [];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries) {
			if (files.length >= limits.files) return;
			if (name.startsWith(".") && name !== ".env.example") {
				skipped += 1;
				continue;
			}
			const full = join(dir, name);
			let stat;
			try {
				stat = statSync(full);
			} catch {
				skipped += 1;
				continue;
			}
			if (stat.isDirectory()) {
				if (SKIP_DIR.has(name)) {
					skipped += 1;
					continue;
				}
				walk(full, depth + 1);
				continue;
			}
			if (!stat.isFile()) continue;
			if (!TEXT_EXT.has(extname(name).toLowerCase())) {
				skipped += 1;
				continue;
			}
			if (stat.size > limits.fileBytes) {
				skipped += 1;
				continue;
			}
			files.push(full);
		}
	};
	walk(root, 0);
	return {
		files,
		skipped
	};
}
var KnowledgeIndex = class {
	db;
	constructor(db) {
		this.db = db;
	}
	status(projectPath) {
		return {
			docs: Number(this.db.prepare("SELECT COUNT(*) AS n FROM knowledge_docs WHERE project_path = ?").get(projectPath)?.n ?? 0),
			chunks: Number(this.db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks c JOIN knowledge_docs d ON d.id = c.doc_id WHERE d.project_path = ?").get(projectPath)?.n ?? 0),
			searchable: this.ftsReady()
		};
	}
	ftsReady() {
		try {
			this.db.prepare("SELECT rowid FROM knowledge_chunks_fts LIMIT 0").all();
			return true;
		} catch {
			return false;
		}
	}
	/** 重建一个工作区的索引（先删后建，单事务）。 */
	index(projectPath) {
		const { files, skipped } = collectTextFiles(projectPath);
		const ts = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 19);
		const existing = this.db.prepare("SELECT id FROM knowledge_docs WHERE project_path = ?").all(projectPath);
		this.db.exec("BEGIN");
		try {
			for (const row of existing) {
				this.db.prepare("DELETE FROM knowledge_chunks_fts WHERE chunk_id IN (SELECT id FROM knowledge_chunks WHERE doc_id = ?)").run(row.id);
				this.db.prepare("DELETE FROM knowledge_chunks WHERE doc_id = ?").run(row.id);
				this.db.prepare("DELETE FROM knowledge_docs WHERE id = ?").run(row.id);
			}
			let chunkCount = 0;
			for (const file of files) {
				let text = "";
				try {
					text = readFileSync(file, "utf8");
				} catch {
					continue;
				}
				if (text.trim() === "") continue;
				const docId = `kd-${createHash("sha1").update(file).digest("hex").slice(0, 12)}`;
				const rel = relative(projectPath, file);
				this.db.prepare("INSERT INTO knowledge_docs(id, project_path, path, title, mtime, hash) VALUES(?,?,?,?,?,?)").run(docId, projectPath, rel, rel.split("/").pop() ?? rel, ts, createHash("sha1").update(text).digest("hex").slice(0, 16));
				chunkText(text).forEach((chunk, ord) => {
					const chunkId = `kc-${docId.slice(3)}-${ord}`;
					this.db.prepare("INSERT INTO knowledge_chunks(id, doc_id, ord, text, tokens) VALUES(?,?,?,?,?)").run(chunkId, docId, ord, chunk, Math.ceil(chunk.length / 2));
					this.db.prepare("INSERT INTO knowledge_chunks_fts(chunk_id, text) VALUES(?,?)").run(chunkId, chunk);
					chunkCount += 1;
				});
			}
			this.db.exec("COMMIT");
			return {
				docs: files.length,
				chunks: chunkCount,
				skipped
			};
		} catch (cause) {
			try {
				this.db.exec("ROLLBACK");
			} catch {}
			throw cause;
		}
	}
	search(projectPath, query, topK = KNOWLEDGE_LIMITS.topK) {
		const q = query.trim();
		if (q === "") return [];
		const limit = Math.min(20, Math.max(1, topK));
		if (this.ftsReady()) try {
			const terms = q.split(/\s+/).map((term) => term.replace(/["'*]/g, "")).filter(Boolean).map((term) => `"${term}"`).join(" OR ");
			if (terms !== "") {
				const rows = this.db.prepare(`SELECT d.path AS path, c.text AS chunk, bm25(knowledge_chunks_fts) AS score
            FROM knowledge_chunks_fts f JOIN knowledge_chunks c ON c.id = f.chunk_id JOIN knowledge_docs d ON d.id = c.doc_id
            WHERE knowledge_chunks_fts MATCH ? AND d.project_path = ? ORDER BY score LIMIT ?`).all(terms, projectPath, limit);
				if (rows.length > 0) return rows.map((row) => ({
					path: String(row.path),
					chunk: String(row.chunk),
					score: Number(row.score)
				}));
			}
		} catch {}
		const terms = q.split(/\s+/).map((term) => term.trim()).filter(Boolean).slice(0, 4);
		if (terms.length === 0) return [];
		const clause = terms.map(() => "c.text LIKE ?").join(" OR ");
		return this.db.prepare(`SELECT d.path AS path, c.text AS chunk FROM knowledge_chunks c JOIN knowledge_docs d ON d.id = c.doc_id
      WHERE d.project_path = ? AND (${clause}) LIMIT ?`).all(projectPath, ...terms.map((term) => `%${term.slice(0, 40)}%`), limit).map((row) => ({
			path: String(row.path),
			chunk: String(row.chunk),
			score: 1
		}));
	}
};
// src/host/agent.ts
/**
* 智能体团队 · 宿主半侧：/agents 路由 + Agent 工具
*
* 数据独立成表、独立端点，不进整份任务快照；团队成员与派发记录由工作台管理，
* 真正的执行仍由 DSH 会话（Agent Teams）完成。
*/
const MAX_BODY = 2097152;
function send$1(res, status, payload) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(payload));
}
function fail(res, status, message) {
	send$1(res, status, {
		ok: false,
		error: message,
		message
	});
}
function readJson$1(req) {
	if (typeof req.json === "function") return req.json();
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		if (typeof req.on !== "function") {
			reject(/* @__PURE__ */ new Error("请求体不可读"));
			return;
		}
		req.on("data", (chunk) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buf.length;
			if (size > MAX_BODY) {
				reject(/* @__PURE__ */ new Error("请求体过大"));
				return;
			}
			chunks.push(buf);
		});
		req.on("end", () => {
			if (chunks.length === 0) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (cause) {
				reject(cause);
			}
		});
		req.on("error", reject);
	});
}
const ID = /^[A-Za-z0-9_-]{1,64}$/;
/**
* 会话日志是「多个独立 zstd 帧首尾相接」（每帧一批），Node 的 zstdDecompressSync 只解第一帧，
* 所以按 magic 切帧后逐帧解压再拼接。
*/
function zstdText(raw) {
	const MAGIC = Buffer.from([
		40,
		181,
		47,
		253
	]);
	const starts = [];
	let cursor = raw.indexOf(MAGIC);
	while (cursor !== -1) {
		starts.push(cursor);
		cursor = raw.indexOf(MAGIC, cursor + 4);
	}
	if (starts.length === 0) return "";
	let text = "";
	for (let i = 0; i < starts.length; i += 1) {
		const slice = raw.subarray(starts[i], i + 1 < starts.length ? starts[i + 1] : raw.length);
		try {
			text += zstdDecompressSync(slice).toString("utf8");
		} catch {}
	}
	return text;
}
/**
* 从磁盘会话日志读事件（agent 释放后的兜底）。
* 日志位置：<DSH_HOME>/sessions/<工作区目录>/<sessionId>/session.v4.jsonl.zstd。
*/
function readSessionLog(_dataDir, sessionId) {
	try {
		if (!/^[A-Za-z0-9_-]{1,80}$/.test(sessionId)) return [];
		const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
		const sessionsDir = join(home, "sessions");
		if (!existsSync(sessionsDir)) return [];
		for (const group of readdirSync(sessionsDir)) {
			const dir = join(sessionsDir, group, sessionId);
			if (!existsSync(dir)) continue;
			let file = "";
			for (const name of readdirSync(dir)) {
				if (name.startsWith("session") && name.endsWith(".jsonl.zstd")) {
					file = join(dir, name);
					break;
				}
				if (name.endsWith(".jsonl")) {
					file = join(dir, name);
					break;
				}
			}
			if (file === "") continue;
			let text = "";
			try {
				const raw = readFileSync(file);
				text = file.endsWith(".zstd") ? zstdText(raw) : raw.toString("utf8");
			} catch {
				continue;
			}
			const events = [];
			for (const line of text.split("\n")) {
				if (line.trim() === "") continue;
				try {
					events.push(JSON.parse(line));
				} catch {}
			}
			if (events.length > 0) return events;
		}
	} catch {}
	return [];
}
function createAgentModule(options) {
	const store = new AgentStore(options.db);
	const knowledge = new KnowledgeIndex(store.db);
	/** 个人/项目记忆优先用文件（可随仓库走），读不到再看数据库。 */
	function fileMemory(path) {
		try {
			if (!existsSync(path)) return "";
			return readFileSync(path, "utf8").slice(0, 4e3).trim();
		} catch {
			return "";
		}
	}
	function injectMemory(teamId, projectPath) {
		const dbEntries = store.listMemory({
			teamId,
			projectPath
		}).map((row) => ({
			scope: String(row.scope),
			content: String(row.content)
		}));
		const personal = fileMemory(join(options.dataDir, "dsh-workbench", "memory", "personal.md"));
		const project = projectPath !== "" ? fileMemory(join(projectPath, ".dsh-workbench", "memory.md")) : "";
		const parts = [];
		if (personal !== "") parts.push(`- [personal] ${personal}`);
		if (project !== "") parts.push(`- [project] ${project}`);
		return (parts.join("\n") + (dbEntries.length > 0 ? `\n${assembleMemory(dbEntries, 1600)}` : "")).trim();
	}
	async function handle(req, res, path, method, url) {
		if (path !== "/agents" && !path.startsWith("/agents/")) return false;
		const [a, b, c, d] = path.slice(7).split("/").filter(Boolean);
		try {
			if (a === void 0) {
				fail(res, 404, "未知接口");
				return true;
			}
			if (a === "teams") {
				if (b === void 0) {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							teams: store.listTeams()
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							team: store.saveTeam(body)
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (!ID.test(b)) {
					fail(res, 400, "team_id_invalid");
					return true;
				}
				if (c === void 0) {
					if (method === "GET") {
						const team = store.getTeam(b);
						if (team === null) {
							fail(res, 404, "团队不存在");
							return true;
						}
						send$1(res, 200, {
							ok: true,
							team
						});
						return true;
					}
					if (method === "PATCH" || method === "PUT") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							team: store.saveTeam({
								...body,
								id: b
							})
						});
						return true;
					}
					if (method === "DELETE") {
						store.deleteTeam(b);
						send$1(res, 200, { ok: true });
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (c === "members" && d === void 0) {
					if (method === "POST") {
						const body = await readJson$1(req);
						let memberId = String(body?.memberId ?? "");
						if (memberId === "" && body?.member !== void 0) {
							const saved = store.saveMember(body.member);
							if (saved.member === null) {
								send$1(res, 400, {
									ok: false,
									error: "成员校验失败",
									issues: saved.issues
								});
								return true;
							}
							memberId = saved.member.id;
						}
						if (memberId === "" || store.getMember(memberId) === null) {
							fail(res, 400, "成员不存在");
							return true;
						}
						send$1(res, 200, {
							ok: true,
							team: store.addMemberToTeam(b, memberId)
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (c === "members" && d !== void 0) {
					if (!ID.test(d)) {
						fail(res, 400, "member_id_invalid");
						return true;
					}
					if (method === "PATCH" || method === "PUT") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							team: store.setTeamMember(b, d, body ?? {})
						});
						return true;
					}
					if (method === "DELETE") {
						store.removeMemberFromTeam(b, d);
						send$1(res, 200, { ok: true });
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				fail(res, 404, "未知接口");
				return true;
			}
			if (a === "members") {
				if (b === void 0) {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							members: store.listMembers()
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$1(req);
						const saved = store.saveMember(body?.member ?? body);
						if (saved.member === null) {
							send$1(res, 400, {
								ok: false,
								error: "成员校验失败",
								issues: saved.issues
							});
							return true;
						}
						send$1(res, 200, {
							ok: true,
							member: saved.member
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (!ID.test(b)) {
					fail(res, 400, "member_id_invalid");
					return true;
				}
				if (method === "PATCH" || method === "PUT") {
					const body = await readJson$1(req);
					const saved = store.saveMember({
						...body?.member ?? body ?? {},
						id: b
					});
					if (saved.member === null) {
						send$1(res, 400, {
							ok: false,
							error: "成员校验失败",
							issues: saved.issues
						});
						return true;
					}
					send$1(res, 200, {
						ok: true,
						member: saved.member
					});
					return true;
				}
				if (method === "DELETE") {
					store.deleteMember(b);
					send$1(res, 200, { ok: true });
					return true;
				}
				if (method === "GET") {
					const member = store.getMember(b);
					if (member === null) {
						fail(res, 404, "成员不存在");
						return true;
					}
					send$1(res, 200, {
						ok: true,
						member
					});
					return true;
				}
				fail(res, 405, "不支持的方法");
				return true;
			}
			if (a === "dispatches") {
				if (b === void 0) {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							dispatches: store.listDispatches(String(url.searchParams.get("ideaId") ?? ""))
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$1(req);
						const ideaId = String(body?.ideaId ?? "");
						const feature = String(body?.feature ?? "idea.diverge");
						let teamId = String(body?.teamId ?? "");
						if (teamId === "") {
							const bound = store.listTeams().find((row) => Array.isArray((row.bindings ?? {})[feature]) && (row.bindings ?? {})[feature].length > 0);
							if (bound !== void 0) teamId = String(bound.id);
						}
						if (ideaId === "" && body?.allowNoIdea !== true) {
							fail(res, 400, "ideaId 不能为空");
							return true;
						}
						const team = store.getTeam(teamId);
						if (team === null) {
							fail(res, 404, "团队不存在");
							return true;
						}
						const boundIds = Array.isArray(team.bindings?.[feature]) ? team.bindings[feature] : [];
						const lead = team.members.find((member) => member.role === "lead" && member.enabled);
						if (lead === void 0) {
							fail(res, 400, "团队缺少主理人");
							return true;
						}
						const candidates = boundIds.length > 0 ? team.members.filter((member) => boundIds.includes(member.id) && member.enabled) : team.members.filter((member) => member.enabled);
						if (ideaId !== "") {
							const running = store.runningDispatchForIdea(ideaId);
							if (running !== null) {
								if (body?.force === true) store.updateDispatch(String(running.id), {
									status: "cancelled",
									error: "被新的派发取代（force）"
								});
								else {
									send$1(res, 409, {
										ok: false,
										error: "这个灵感已有团队在执行",
										dispatch: running,
										retryWith: {
											body: "force",
											value: true
										}
									});
									return true;
								}
							}
						}
						const members = [lead, ...candidates.filter((member) => member.id !== lead.id)];
						const timeoutMinutes = Math.min(120, Math.max(1, Math.round((Number(body?.timeoutMs) || AGENT_LIMITS.dispatchTimeoutMs) / 6e4)));
						const workspacePath = String(body?.workspacePath ?? team.defaultWorkspace ?? "");
						const injectedMemory = typeof body?.memory === "string" ? body.memory : injectMemory(teamId, workspacePath);
						const injectedKnowledge = typeof body?.knowledge === "string" ? body.knowledge : assembleKnowledge(knowledge.search(workspacePath, `${clampText$1(body?.ideaTitle, 80)} ${clampText$1(body?.goal, 120)}`, 5));
						const kickoff = buildTeamKickoff({
							team: {
								name: String(team.name),
								desc: String(team.desc ?? "")
							},
							members,
							goal: clampText$1(body?.goal, AGENT_LIMITS.dispatchGoal),
							idea: {
								title: clampText$1(body?.ideaTitle, 200),
								brief: clampText$1(body?.ideaBrief, 4e3)
							},
							ideaId,
							runId: String(body?.runId ?? ""),
							workspacePath,
							timeoutMinutes,
							memory: injectedMemory !== "" ? injectedMemory : void 0,
							knowledge: injectedKnowledge !== "" ? injectedKnowledge : void 0,
							executors: candidates.map((member) => member.name),
							featureLabel: feature
						});
						send$1(res, 200, {
							ok: true,
							dispatch: store.createDispatch({
								ideaId,
								runId: body?.runId,
								teamId,
								goal: body?.goal,
								workspacePath: body?.workspacePath ?? team.defaultWorkspace,
								timeoutMs: timeoutMinutes * 6e4,
								memberCount: members.length,
								kickoff,
								members: members.map((member) => ({
									id: member.id,
									name: member.name,
									handle: member.handle,
									fileWrite: member.fileWrite
								}))
							}),
							kickoff,
							team,
							feature,
							lead: {
								id: lead.id,
								name: lead.name,
								handle: lead.handle
							},
							executors: candidates.map((member) => ({
								id: member.id,
								name: member.name,
								handle: member.handle
							}))
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (!ID.test(b)) {
					fail(res, 400, "dispatch_id_invalid");
					return true;
				}
				if (c === void 0) {
					if (method === "GET") {
						const dispatch = store.getDispatch(b);
						if (dispatch === null) {
							fail(res, 404, "派发不存在");
							return true;
						}
						send$1(res, 200, {
							ok: true,
							dispatch,
							events: store.listEvents(b)
						});
						return true;
					}
					if (method === "PATCH" || method === "PUT") {
						const body = await readJson$1(req);
						const dispatch = store.updateDispatch(b, body ?? {});
						if (dispatch === null) {
							fail(res, 404, "派发不存在");
							return true;
						}
						send$1(res, 200, {
							ok: true,
							dispatch
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (c === "events") {
					if (method === "POST") {
						const body = await readJson$1(req);
						store.appendEvent(b, String(body?.kind ?? "event"), String(body?.member ?? ""), body?.payload ?? {});
						send$1(res, 200, { ok: true });
						return true;
					}
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							events: store.listEvents(b)
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				fail(res, 404, "未知接口");
				return true;
			}
			if (a === "memory") {
				if (b === void 0) {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							memories: store.listMemory({
								scope: String(url.searchParams.get("scope") ?? ""),
								teamId: String(url.searchParams.get("teamId") ?? ""),
								projectPath: String(url.searchParams.get("projectPath") ?? "")
							})
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							memory: store.addMemory(body ?? {})
						});
						return true;
					}
					fail(res, 405, "不支持的方法");
					return true;
				}
				if (!ID.test(b)) {
					fail(res, 400, "memory_id_invalid");
					return true;
				}
				if (method === "PATCH" || method === "PUT") {
					const body = await readJson$1(req);
					const memory = store.updateMemory(b, body ?? {});
					if (memory === null) {
						fail(res, 404, "记忆不存在");
						return true;
					}
					send$1(res, 200, {
						ok: true,
						memory
					});
					return true;
				}
				if (method === "DELETE") {
					store.deleteMemory(b);
					send$1(res, 200, { ok: true });
					return true;
				}
				if (method === "GET") {
					const memory = store.getMemory(b);
					if (memory === null) {
						fail(res, 404, "记忆不存在");
						return true;
					}
					send$1(res, 200, {
						ok: true,
						memory
					});
					return true;
				}
				fail(res, 405, "不支持的方法");
				return true;
			}
			if (a === "knowledge") {
				if (b === "index" && method === "POST") {
					const body = await readJson$1(req);
					const projectPath = String(body?.projectPath ?? "").trim();
					if (projectPath === "") {
						fail(res, 400, "projectPath 不能为空");
						return true;
					}
					try {
						send$1(res, 200, {
							ok: true,
							result: knowledge.index(projectPath),
							status: knowledge.status(projectPath)
						});
						return true;
					} catch (cause) {
						fail(res, 500, `索引失败：${cause instanceof Error ? cause.message : String(cause)}`);
						return true;
					}
				}
				if (b === "status" && method === "GET") {
					const projectPath = String(url.searchParams.get("projectPath") ?? "");
					send$1(res, 200, {
						ok: true,
						status: knowledge.status(projectPath)
					});
					return true;
				}
				if (b === "search" && method === "GET") {
					const projectPath = String(url.searchParams.get("projectPath") ?? "");
					const q = String(url.searchParams.get("q") ?? "");
					if (projectPath === "" || q === "") {
						fail(res, 400, "projectPath 与 q 必填");
						return true;
					}
					send$1(res, 200, {
						ok: true,
						hits: knowledge.search(projectPath, q, Math.min(20, Number(url.searchParams.get("topK")) || KNOWLEDGE_LIMITS.topK))
					});
					return true;
				}
				fail(res, 404, "未知接口");
				return true;
			}
			if (a === "options") {
				const providers = [];
				try {
					const llm = options.ctx?.llm;
					if (llm !== void 0 && typeof llm.listProviders === "function") for (const provider of llm.listProviders()) {
						let models = [];
						try {
							models = (await llm.listModels(provider.id)).map((model) => String(model.id));
						} catch {
							models = [];
						}
						providers.push({
							id: String(provider.id),
							name: String(provider.name ?? provider.id),
							models
						});
					}
				} catch (cause) {
					console.warn("[dsh-workbench] 读取模型目录失败：", String(cause));
				}
				let skills = [];
				try {
					const registry = options.ctx?.skills;
					if (registry !== void 0 && typeof registry.list === "function") skills = (await registry.list({})).map((skill) => ({
						name: String(skill.name),
						description: String(skill.description ?? ""),
						source: String(skill.source ?? "")
					}));
				} catch (cause) {
					console.warn("[dsh-workbench] 读取技能目录失败：", String(cause));
				}
				let tools = [];
				try {
					const registry = options.ctx?.tools;
					if (registry !== void 0 && typeof registry.schemas === "function") tools = registry.schemas().map((schema) => String(schema.name)).sort();
				} catch (cause) {
					console.warn("[dsh-workbench] 读取工具目录失败：", String(cause));
				}
				const mcpServers = [...new Set(tools.filter((name) => name.startsWith("mcp__")).map((name) => name.split("__")[1]).filter(Boolean))].sort();
				send$1(res, 200, {
					ok: true,
					providers,
					skills,
					tools,
					mcpServers
				});
				return true;
			}
			if (a === "sessions" && b !== void 0 && c === "events") {
				if (method !== "GET") {
					fail(res, 405, "不支持的方法");
					return true;
				}
				const sessionId = b;
				const sinceSeq = Math.max(0, Number(url.searchParams.get("since") ?? 0) || 0);
				const session = (() => {
					try {
						return options.ctx?.get?.("agents")?.get?.(sessionId) ?? options.ctx?.agents?.get?.(sessionId);
					} catch {
						return;
					}
				})()?.session;
				let all = [];
				if (session !== void 0 && typeof session.snapshotEvents === "function") try {
					all = Array.from(session.snapshotEvents(0) ?? []);
				} catch {
					all = [];
				}
				if (all.length === 0) all = readSessionLog(options.dataDir, sessionId);
				if (all.length === 0) {
					send$1(res, 200, {
						ok: true,
						events: [],
						total: 0,
						next: 0,
						available: false
					});
					return true;
				}
				const sliced = (sinceSeq === 0 ? all : all.filter((event) => {
					const seq = Number(event?.seq);
					return Number.isFinite(seq) && seq > sinceSeq;
				})).slice(0, 400).map((event) => ({
					type: event.type,
					seq: event.seq,
					time: event.time,
					data: event.data
				}));
				const lastSeq = sliced.length > 0 ? Number(sliced[sliced.length - 1]?.seq ?? sinceSeq) : sinceSeq;
				const next = Number.isFinite(lastSeq) ? lastSeq : sinceSeq;
				send$1(res, 200, {
					ok: true,
					events: sliced,
					total: all.length,
					next,
					available: true
				});
				return true;
			}
			if (a === "meta") {
				send$1(res, 200, {
					ok: true,
					roles: MEMBER_ROLES,
					fileWrites: FILE_WRITES,
					memoryScopes: MEMORY_SCOPES,
					limits: AGENT_LIMITS
				});
				return true;
			}
			fail(res, 404, "未知接口");
			return true;
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			fail(res, /不存在/.test(message) ? 404 : /最多|不能为空|校验/.test(message) ? 400 : 500, message);
			return true;
		}
	}
	function registerTools(ctx) {
		const tools = ctx?.tools;
		if (tools === void 0 || typeof tools.register !== "function") {
			console.warn("[dsh-workbench] tools 服务不可用：团队工具未注册");
			return;
		}
		const register = (tool, label) => {
			if (typeof ctx.effect === "function") ctx.effect(() => tools.register(tool), `workbench: ${label}`);
			else tools.register(tool);
		};
		register({
			name: "workbench_memory_search",
			description: "在个人/项目/团队记忆里搜索（团队与灵感发散时用）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					query: { type: "string" },
					teamId: { type: "string" },
					projectPath: { type: "string" },
					limit: { type: "number" }
				},
				required: ["query"]
			},
			execute: async (args) => {
				const query = String(args?.query ?? "").toLowerCase().trim();
				if (query === "") return {
					ok: false,
					error: "query 不能为空"
				};
				return {
					ok: true,
					memories: store.listMemory({
						teamId: String(args?.teamId ?? ""),
						projectPath: String(args?.projectPath ?? "")
					}).filter((row) => String(row.content).toLowerCase().includes(query)).slice(0, Math.min(20, Number(args?.limit) || 8))
				};
			}
		});
		register({
			name: "workbench_memory_write",
			description: "把一条结论写入团队/项目/个人记忆（用户明确要求记住时调用）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					content: { type: "string" },
					scope: {
						type: "string",
						enum: [
							"personal",
							"project",
							"team"
						]
					},
					teamId: { type: "string" },
					projectPath: { type: "string" }
				},
				required: ["content", "scope"]
			},
			execute: async (args) => {
				try {
					return {
						ok: true,
						memory: store.addMemory({
							content: args?.content,
							scope: args?.scope,
							teamId: args?.teamId,
							projectPath: args?.projectPath,
							source: "agent"
						})
					};
				} catch (cause) {
					return {
						ok: false,
						error: cause instanceof Error ? cause.message : String(cause)
					};
				}
			}
		});
		register({
			name: "workbench_knowledge_search",
			description: "在项目已索引的知识里做全文检索（BM25），返回带路径的片段。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					projectPath: { type: "string" },
					query: { type: "string" },
					topK: { type: "number" }
				},
				required: ["projectPath", "query"]
			},
			execute: async (args) => {
				const projectPath = String(args?.projectPath ?? "");
				const query = String(args?.query ?? "");
				if (projectPath === "" || query === "") return {
					ok: false,
					error: "projectPath 与 query 必填"
				};
				return {
					ok: true,
					hits: knowledge.search(projectPath, query, Math.min(20, Number(args?.topK) || KNOWLEDGE_LIMITS.topK))
				};
			}
		});
		register({
			name: "workbench_team_list",
			description: "读取个人工作台里的智能体团队与成员（含角色、文件权限、是否启用）。写灵感节点前可用它确认团队约定。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { teamId: {
					type: "string",
					description: "可选；只看某支团队。"
				} }
			},
			execute: async (args) => {
				try {
					const teamId = String(args?.teamId ?? "");
					if (teamId !== "") {
						const team = store.getTeam(teamId);
						if (team === null) return {
							ok: false,
							error: "团队不存在"
						};
						return {
							ok: true,
							team
						};
					}
					return {
						ok: true,
						teams: store.listTeams()
					};
				} catch (cause) {
					return {
						ok: false,
						error: cause instanceof Error ? cause.message : String(cause)
					};
				}
			}
		});
	}
	return {
		store,
		handle,
		registerTools
	};
}
// src/host/sync.ts
/**
* 增量同步（P1-1）：墓碑记账 + 游标增量 + 条目级 LWW 写入。
*
* 设计要点：
*  - 时间戳统一用「可字典序比较的 ISO 字符串」（YYYY-MM-DD HH:MM[:SS]），游标是
*    不透明值：客户端只回传上一次拿到的 cursor，不要自己拼时间；
*  - delta 只读：按各实体的时间列 + tombstones.deleted_at 升序合并，每批最多 limit 条；
*  - push 逐条做 LWW：本地（含墓碑）更新时间更晚则拒绝，并回传 current 行；
*  - 墓碑由 index.ts 的删除入口写入，本文件只负责读取/补写。
*
* 依赖注入：SQL 直接走 node:sqlite 连接（与 index.ts 的 SqliteStore 同一连接），
* notes / notebooks / news_topics 的写入复用 store 既有 save 方法，保持副作用一致。
*/
const SYNC_ENTITIES = [
	"tasks",
	"notes",
	"notebooks",
	"news_topics",
	"focus_sessions",
	"spaces"
];
function str$1(value, fallback = "") {
	return typeof value === "string" ? value : fallback;
}
function num$1(value, fallback = 0) {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}
function list$1(value) {
	return Array.isArray(value) ? value : [];
}
function parseJson(value, fallback) {
	if (typeof value !== "string") return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
}
function isoNow(d = /* @__PURE__ */ new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function maxTime(a, b) {
	return a > b ? a : b;
}
/** 缺省时间补服务器当前时间；其余原样保留（LWW 以字符串比较为准）。 */
function normalizeTime(raw) {
	const text = str$1(raw).trim();
	return text === "" ? isoNow() : text;
}
const ENTITIES = {
	tasks: {
		table: "tasks",
		time: "updated_at",
		live: "deleted_at IS NULL"
	},
	notes: {
		table: "notes",
		time: "updated_at"
	},
	notebooks: {
		table: "notebooks",
		time: "updated_at"
	},
	news_topics: {
		table: "news_topics",
		time: "updated_at"
	},
	focus_sessions: {
		table: "focus_sessions",
		time: "started_at"
	},
	spaces: {
		table: "spaces",
		time: "updated_at"
	}
};
function isEntity(value) {
	return SYNC_ENTITIES.includes(value);
}
/** 兼容旧命名：meta 草稿里的 focus 等价于 focus_sessions（响应里统一用规范名）。 */
function canonicalEntity(value) {
	const name = value === "focus" ? "focus_sessions" : value;
	return isEntity(name) ? name : null;
}
/** 写一条墓碑；同一 (entity, id) 重复删除时以更晚的时间覆盖。 */
function writeTombstone(db, entity, id, at = isoNow()) {
	db.prepare(`INSERT INTO tombstones(entity, id, deleted_at) VALUES(?,?,?)
    ON CONFLICT(entity, id) DO UPDATE SET deleted_at = max(tombstones.deleted_at, excluded.deleted_at)`).run(entity, id, at);
}
function clearTombstone(db, entity, id) {
	db.prepare("DELETE FROM tombstones WHERE entity = ? AND id = ?").run(entity, id);
}
function tombstoneAt(db, entity, id) {
	return str$1(db.prepare("SELECT deleted_at FROM tombstones WHERE entity = ? AND id = ?").get(entity, id)?.deleted_at);
}
function toSubtask$1(row) {
	return {
		id: row.id,
		title: row.title,
		done: Number(row.done) === 1,
		start: row.planned_start ?? "",
		end: row.planned_end ?? "",
		note: row.note ?? ""
	};
}
function taskRow(row, subtasks) {
	return {
		id: row.id,
		title: row.title,
		desc: row.descr ?? "",
		note: row.note ?? "",
		space: row.space_id,
		projectPath: row.project_path ?? "",
		status: row.status,
		priority: row.priority ?? "normal",
		tags: parseJson(row.tags, []),
		date: row.date ?? null,
		start: row.start ?? "",
		end: row.end ?? "",
		duration: Number(row.duration ?? 0),
		group: row.grp ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at ?? null,
		subtasks: subtasks.map(toSubtask$1)
	};
}
function noteRow(row) {
	return {
		id: row.id,
		notebookId: row.notebook_id ?? "",
		title: row.title,
		content: row.content ?? "",
		tags: parseJson(row.tags, []),
		pinned: Number(row.pinned) === 1,
		filePath: row.file_path ?? "",
		mapId: row.map_id ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function notebookRow(row) {
	return {
		id: row.id,
		name: row.name,
		workspacePath: row.workspace_path ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function newsTopicRow(row) {
	return {
		id: row.id,
		title: row.title,
		query: row.query,
		scheduleKind: row.schedule_kind,
		times: parseJson(row.times, []),
		weekday: Number(row.weekday ?? 1),
		customCron: row.custom_cron ?? "",
		scheduleText: row.schedule_text ?? "",
		cronTaskIds: parseJson(row.cron_task_ids, []),
		enabled: Number(row.enabled) === 1,
		count: Number(row.count ?? 6),
		lastRunAt: row.last_run_at ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function focusRow(row) {
	return {
		id: row.id,
		taskId: row.task_id ?? null,
		startedAt: row.started_at,
		minutes: Number(row.minutes ?? 0),
		completed: Number(row.completed) === 1
	};
}
function spaceRow(row) {
	return {
		id: row.id,
		name: row.name,
		color: row.color,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toRow(entity, row, subtasks = []) {
	switch (entity) {
		case "tasks": return taskRow(row, subtasks);
		case "notes": return noteRow(row);
		case "notebooks": return notebookRow(row);
		case "news_topics": return newsTopicRow(row);
		case "focus_sessions": return focusRow(row);
		case "spaces": return spaceRow(row);
	}
}
function syncMeta(db) {
	const entities = {};
	for (const name of SYNC_ENTITIES) {
		const cfg = ENTITIES[name];
		const where = cfg.live === void 0 ? "" : `WHERE ${cfg.live}`;
		const row = db.prepare(`SELECT COUNT(*) AS count, MAX(${cfg.time}) AS max FROM ${cfg.table} ${where}`).get();
		entities[name] = {
			count: Number(row?.count ?? 0),
			maxUpdatedAt: row?.max === null || row?.max === void 0 ? null : String(row.max)
		};
	}
	entities.focus = entities.focus_sessions;
	return { entities };
}
function subtasksFor(db, taskIds) {
	const map = /* @__PURE__ */ new Map();
	if (taskIds.length === 0) return map;
	const placeholders = taskIds.map(() => "?").join(",");
	const rows = db.prepare(`SELECT * FROM subtasks WHERE task_id IN (${placeholders}) ORDER BY sort, id`).all(...taskIds);
	for (const row of rows) {
		const bucket = map.get(String(row.task_id));
		if (bucket === void 0) map.set(String(row.task_id), [row]);
		else bucket.push(row);
	}
	return map;
}
function entityUpserts(db, entity, since, take) {
	const cfg = ENTITIES[entity];
	const where = cfg.live === void 0 ? `WHERE ${cfg.time} > ?` : `WHERE ${cfg.time} > ? AND ${cfg.live}`;
	const rows = db.prepare(`SELECT * FROM ${cfg.table} ${where} ORDER BY ${cfg.time} ASC, id ASC LIMIT ?`).all(since, take);
	const subs = entity === "tasks" ? subtasksFor(db, rows.map((row) => String(row.id))) : /* @__PURE__ */ new Map();
	return rows.map((row) => ({
		entity,
		id: String(row.id),
		op: "upsert",
		updatedAt: String(row[cfg.time] ?? ""),
		row: toRow(entity, row, subs.get(String(row.id)) ?? [])
	}));
}
/**
* 游标增量：取 updated_at > since 的行 + deleted_at > since 的墓碑，
* 按时间升序合并；cursor = 本批最后一条的时间（没有变更则回传 since）。
*/
function syncDelta(db, query = {}) {
	let since = str$1(query.since).trim();
	if (since === "0") since = "";
	const limit = Math.max(1, Math.min(1e3, Math.round(num$1(query.limit, 200))));
	const wanted = str$1(query.entity).trim();
	const only = wanted === "" ? null : canonicalEntity(wanted);
	if (wanted !== "" && only === null) throw new Error(`未知同步实体：${wanted}`);
	const targets = only === null ? [...SYNC_ENTITIES] : [only];
	const changes = [];
	for (const entity of targets) changes.push(...entityUpserts(db, entity, since, limit + 1));
	const placeholders = targets.map(() => "?").join(",");
	const dead = db.prepare(`SELECT entity, id, deleted_at FROM tombstones
    WHERE entity IN (${placeholders}) AND deleted_at > ? ORDER BY deleted_at ASC, entity ASC, id ASC LIMIT ?`).all(...targets, since, limit + 1);
	for (const row of dead) changes.push({
		entity: String(row.entity),
		id: String(row.id),
		op: "delete",
		updatedAt: String(row.deleted_at)
	});
	changes.sort((a, b) => {
		if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
		return `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`);
	});
	const more = changes.length > limit;
	const batch = more ? changes.slice(0, limit) : changes;
	return {
		cursor: batch.length > 0 ? String(batch[batch.length - 1].updatedAt) : since,
		changes: batch,
		more
	};
}
function nextSort(db, table) {
	const row = db.prepare(`SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM ${table}`).get();
	return Number(row?.next ?? 0);
}
function upsertTask(db, id, row, at, incomingSubtasks) {
	const now = isoNow();
	const values = {
		title: str$1(row.title).trim() === "" ? "未命名任务" : str$1(row.title),
		descr: str$1(row.desc),
		note: str$1(row.note),
		space_id: str$1(row.space) || "life",
		project_path: str$1(row.projectPath),
		status: str$1(row.status) || "next",
		priority: str$1(row.priority) || "normal",
		tags: JSON.stringify(list$1(row.tags).map((tag) => str$1(tag)).filter(Boolean)),
		date: row.date ? str$1(row.date) : null,
		start: row.start ? str$1(row.start) : null,
		end: row.end ? str$1(row.end) : null,
		duration: Math.max(0, Math.round(num$1(row.duration))),
		grp: row.group ? str$1(row.group) : null,
		created_at: str$1(row.createdAt) || now,
		completed_at: row.completedAt ? str$1(row.completedAt) : null
	};
	if (db.prepare("SELECT id FROM tasks WHERE id = ?").get(id) === void 0) db.prepare(`INSERT INTO tasks(id, title, descr, note, space_id, project_path, status, priority, date, start, end, duration, tags, grp, sort, created_at, updated_at, completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, values.title, values.descr, values.note, values.space_id, values.project_path, values.status, values.priority, values.date, values.start, values.end, values.duration, values.tags, values.grp, nextSort(db, "tasks"), values.created_at, at, values.completed_at);
	else db.prepare(`UPDATE tasks SET title=?, descr=?, note=?, space_id=?, project_path=?, status=?, priority=?, date=?, start=?, end=?,
      duration=?, tags=?, grp=?, updated_at=?, completed_at=? WHERE id=?`).run(values.title, values.descr, values.note, values.space_id, values.project_path, values.status, values.priority, values.date, values.start, values.end, values.duration, values.tags, values.grp, at, values.completed_at, id);
	if (incomingSubtasks !== void 0) {
		db.prepare("DELETE FROM subtasks WHERE task_id = ?").run(id);
		const ins = db.prepare("INSERT INTO subtasks(id, task_id, title, done, planned_start, planned_end, note, sort) VALUES(?,?,?,?,?,?,?,?)");
		incomingSubtasks.slice(0, 500).forEach((sub, index) => {
			const sid = str$1(sub?.id) || `sub-${randomUUID().slice(0, 8)}`;
			ins.run(sid, id, str$1(sub?.title, "子待办"), sub?.done === true ? 1 : 0, sub?.start ? str$1(sub.start) : null, sub?.end ? str$1(sub.end) : null, sub?.note ? str$1(sub.note) : null, index);
		});
	}
}
function upsertSpace(db, id, row, at) {
	const now = isoNow();
	if (db.prepare("SELECT id FROM spaces WHERE id = ?").get(id) === void 0) db.prepare("INSERT INTO spaces(id, name, color, sort, created_at, updated_at) VALUES(?,?,?,?,?,?)").run(id, str$1(row.name) || id, str$1(row.color) || "#5b5bd6", nextSort(db, "spaces"), str$1(row.createdAt) || now, at);
	else db.prepare("UPDATE spaces SET name=?, color=?, updated_at=? WHERE id=?").run(str$1(row.name) || id, str$1(row.color) || "#5b5bd6", at, id);
}
function upsertFocus(db, id, row, at) {
	const startedAt = str$1(row.startedAt) || at;
	const taskId = str$1(row.taskId);
	const minutes = Math.max(0, Math.round(num$1(row.minutes)));
	const completed = row.completed === false ? 0 : 1;
	if (db.prepare("SELECT id FROM focus_sessions WHERE id = ?").get(id) === void 0) db.prepare("INSERT INTO focus_sessions(id, task_id, started_at, minutes, completed) VALUES(?,?,?,?,?)").run(id, taskId === "" ? null : taskId, startedAt, minutes, completed);
	else db.prepare("UPDATE focus_sessions SET task_id=?, started_at=?, minutes=?, completed=? WHERE id=?").run(taskId === "" ? null : taskId, startedAt, minutes, completed, id);
}
function removeEntity(db, entity, id, hooks, existed) {
	switch (entity) {
		case "tasks":
			db.prepare("DELETE FROM subtasks WHERE task_id = ?").run(id);
			db.prepare("DELETE FROM attachments WHERE task_id = ?").run(id);
			db.prepare("DELETE FROM logs WHERE task_id = ?").run(id);
			db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
			return;
		case "notes":
			if (existed) hooks.deleteNote(id);
			else db.prepare("DELETE FROM notes WHERE id = ?").run(id);
			return;
		case "news_topics":
			db.prepare("DELETE FROM news_items WHERE topic_id = ?").run(id);
			db.prepare("DELETE FROM news_topics WHERE id = ?").run(id);
			return;
		case "notebooks": {
			const other = db.prepare("SELECT id FROM notebooks WHERE id <> ? ORDER BY created_at, id LIMIT 1").get(id);
			if (other !== void 0) db.prepare("UPDATE notes SET notebook_id = ? WHERE notebook_id = ?").run(String(other.id), id);
			db.prepare("DELETE FROM notebooks WHERE id = ?").run(id);
			return;
		}
		case "focus_sessions":
			db.prepare("DELETE FROM focus_sessions WHERE id = ?").run(id);
			return;
		case "spaces":
			db.prepare("DELETE FROM spaces WHERE id = ?").run(id);
			return;
	}
}
function applyUpsert(db, entity, id, row, at, current, hooks) {
	const incoming = row !== null && typeof row === "object" && !Array.isArray(row) ? row : {};
	const merged = {
		...current ?? {},
		...incoming
	};
	switch (entity) {
		case "tasks":
			upsertTask(db, id, merged, at, Array.isArray(incoming.subtasks) ? incoming.subtasks : void 0);
			return;
		case "spaces":
			upsertSpace(db, id, merged, at);
			return;
		case "focus_sessions":
			upsertFocus(db, id, merged, at);
			return;
		case "notes":
			hooks.saveNote({
				id,
				notebookId: str$1(merged.notebookId),
				title: str$1(merged.title),
				content: str$1(merged.content),
				tags: list$1(merged.tags),
				pinned: merged.pinned === true,
				mapId: str$1(merged.mapId)
			});
			db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?").run(at, id);
			return;
		case "notebooks":
			hooks.saveNotebook({
				id,
				name: str$1(merged.name),
				workspacePath: str$1(merged.workspacePath)
			});
			db.prepare("UPDATE notebooks SET updated_at = ? WHERE id = ?").run(at, id);
			return;
		case "news_topics":
			hooks.saveNewsTopic({
				id,
				title: str$1(merged.title),
				query: str$1(merged.query),
				scheduleKind: str$1(merged.scheduleKind),
				times: list$1(merged.times),
				weekday: merged.weekday,
				customCron: str$1(merged.customCron),
				scheduleText: str$1(merged.scheduleText),
				cronTaskIds: list$1(merged.cronTaskIds),
				enabled: merged.enabled !== false,
				count: merged.count
			});
			db.prepare("UPDATE news_topics SET updated_at = ? WHERE id = ?").run(at, id);
			return;
	}
}
/**
* 条目级写入：body.changes[] 逐条应用。
*  - upsert：LWW 通过后写入（notes/notebooks/news_topics 复用 save 方法，其余直接 SQL）；
*  - delete：写墓碑 + 物理删除；墓碑时间取「push 的 updatedAt 与服务器当前时间较大者」，
*    保证其它设备用旧游标也能看到这次删除。
*  - 返回 { accepted: [id...], conflicts: [{entity, id, current}] }。
*/
function syncPush(db, payload, hooks) {
	const changes = list$1(payload?.changes);
	if (changes.length > 2e3) throw new Error("changes 过多（单次最多 2000 条）");
	const accepted = [];
	const conflicts = [];
	db.exec("BEGIN IMMEDIATE");
	try {
		for (const change of changes) {
			const entityText = str$1(change?.entity).trim();
			const entity = canonicalEntity(entityText);
			if (entity === null) throw new Error(`未知同步实体：${entityText}`);
			const id = str$1(change?.id).trim();
			if (id === "") throw new Error("同步条目的 id 不能为空");
			const op = str$1(change?.op, "upsert") === "delete" ? "delete" : "upsert";
			const at = normalizeTime(change?.updatedAt);
			const currentRaw = db.prepare(`SELECT * FROM ${ENTITIES[entity].table} WHERE id = ?`).get(id);
			const current = currentRaw === void 0 ? null : toRow(entity, currentRaw);
			const latest = maxTime(currentRaw === void 0 ? "" : String(currentRaw[ENTITIES[entity].time] ?? ""), tombstoneAt(db, entity, id));
			if (latest !== "" && latest > at) {
				conflicts.push({
					entity,
					id,
					current
				});
				continue;
			}
			if (op === "delete") {
				removeEntity(db, entity, id, hooks, current !== null);
				writeTombstone(db, entity, id, maxTime(at, isoNow()));
			} else {
				applyUpsert(db, entity, id, change?.row, at, current, hooks);
				clearTombstone(db, entity, id);
			}
			accepted.push(id);
		}
		db.exec("COMMIT");
	} catch (cause) {
		try {
			db.exec("ROLLBACK");
		} catch {}
		throw cause;
	}
	return {
		accepted,
		conflicts
	};
}
// src/shared/product-graph-model.ts
const PRODUCT_NODE_KINDS = [
	"root",
	"module",
	"business",
	"feature",
	"requirement"
];
const PRODUCT_PLATFORMS = [
	"pc",
	"mobile",
	"tablet",
	"all"
];
const PRODUCT_GRAPH_LIMITS = {
	label: 24,
	detail: 200,
	tag: 16,
	tags: 8,
	nodes: 300,
	edges: 600,
	depth: 4,
	graph: 2e6,
	versions: 50,
	summary: 500,
	labelLong: 60
};
const PRODUCT_KIND_LABEL = {
	root: "产品",
	module: "模块",
	business: "业务",
	feature: "功能",
	requirement: "需求"
};
function clampText(value, max, ellipsis = false) {
	if (typeof value !== "string") return "";
	const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
	if (clean.length <= max) return clean;
	return ellipsis ? `${clean.slice(0, Math.max(0, max - 1))}…` : clean.slice(0, max);
}
function asArray(value) {
	return Array.isArray(value) ? value : [];
}
/** UTF-8 字节数（两端都有 TextEncoder）。 */
function productGraphBytes(graph) {
	try {
		return new TextEncoder().encode(JSON.stringify(graph)).length;
	} catch {
		return JSON.stringify(graph).length * 3;
	}
}
function emptyProductGraph(title) {
	return {
		v: 2,
		rootId: "root",
		nodes: [{
			id: "root",
			label: clampText(title, PRODUCT_GRAPH_LIMITS.label) || "产品",
			kind: "root",
			detail: "",
			depth: 0,
			parentId: null,
			status: "kept"
		}],
		edges: []
	};
}
/** `<mapId>:<nodeId>`：同产品另一张导图的节点引用。 */
function isExternalRef(ref) {
	return typeof ref === "string" && /^[A-Za-z0-9_-]{1,64}:[A-Za-z0-9_-]{1,64}$/.test(ref);
}
function parseExternalRef(ref) {
	if (!isExternalRef(ref)) return null;
	const index = ref.indexOf(":");
	return {
		mapId: ref.slice(0, index),
		nodeId: ref.slice(index + 1)
	};
}
/**
* 校验并规整一份产品导图（参照灵感 normalizeGraph）：
* - 节点去重、字段裁剪，超 300 个丢弃并记 issue；
* - tree 边按 parentId 补全，成环/悬空的挂回根（说出来，不静默）；
* - depth 由根 BFS 重算，超 4 层（根不计）丢弃；
* - relate 边两端必须存在（或 to 是合法跨图引用）、不能自连、去重。
*/
function normalizeProductGraph(raw, options = {}) {
	const issues = [];
	const fallback = emptyProductGraph(options.title ?? "产品");
	if (raw === null || typeof raw !== "object") return {
		graph: fallback,
		issues
	};
	const input = raw;
	const cleaned = [];
	const seen = new Set(options.knownIds ?? []);
	for (const item of asArray(input.nodes)) {
		if (item === null || typeof item !== "object") continue;
		const node = item;
		const id = clampText(node.id, 64);
		if (id === "") {
			issues.push({
				code: "NODE_ID_EMPTY",
				message: "节点缺少 id，已丢弃"
			});
			continue;
		}
		if (seen.has(id)) {
			issues.push({
				code: "NODE_ID_DUP",
				message: `节点 id 重复：${id}`,
				id
			});
			continue;
		}
		if (cleaned.length >= PRODUCT_GRAPH_LIMITS.nodes) {
			issues.push({
				code: "NODE_LIMIT",
				message: `节点超过 ${PRODUCT_GRAPH_LIMITS.nodes} 个，后续已丢弃`
			});
			break;
		}
		const rawLabel = clampText(node.label ?? node.topic, PRODUCT_GRAPH_LIMITS.label, true);
		const kind = PRODUCT_NODE_KINDS.includes(node.kind) ? node.kind : "feature";
		const label = rawLabel || `未命名${PRODUCT_KIND_LABEL[kind]}`;
		if (String(node.label ?? node.topic ?? "").length > PRODUCT_GRAPH_LIMITS.label) issues.push({
			code: "LABEL_CLAMP",
			message: `节点「${label}」标题超长已裁剪`,
			id
		});
		const status = node.status === "dropped" || node.status === "pending" ? node.status : "kept";
		const tags = asArray(node.tags).map((t) => clampText(t, PRODUCT_GRAPH_LIMITS.tag)).filter(Boolean).slice(0, PRODUCT_GRAPH_LIMITS.tags);
		const platform = PRODUCT_PLATFORMS.includes(node.platform) ? node.platform : void 0;
		const entry = {
			id,
			label,
			kind,
			detail: clampText(node.detail, PRODUCT_GRAPH_LIMITS.detail, true),
			parentId: typeof node.parentId === "string" && node.parentId !== "" ? clampText(node.parentId, 64) : null,
			status,
			platform,
			tags: tags.length > 0 ? tags : void 0
		};
		if (node.collapsed === true) entry.collapsed = true;
		seen.add(id);
		cleaned.push(entry);
	}
	if (cleaned.length === 0) return {
		graph: fallback,
		issues
	};
	const wantedRoot = clampText(input.rootId, 64);
	let rootCandidate = cleaned.find((n) => n.id === wantedRoot && n.kind === "root") ?? cleaned.find((n) => n.kind === "root");
	if (rootCandidate === void 0) {
		if (wantedRoot !== "") {
			rootCandidate = {
				id: wantedRoot,
				label: clampText(options.title, PRODUCT_GRAPH_LIMITS.label) || "产品",
				kind: "root",
				detail: "",
				depth: 0,
				parentId: null,
				status: "kept"
			};
			cleaned.unshift(rootCandidate);
		} else rootCandidate = cleaned[0];
	}
	rootCandidate.kind = "root";
	const rootId = rootCandidate.id;
	const treeParent = /* @__PURE__ */ new Map();
	const relateEdges = [];
	const relateKey = /* @__PURE__ */ new Set();
	for (const edge of asArray(input.edges)) {
		if (edge === null || typeof edge !== "object") continue;
		const e = edge;
		const from = clampText(e.from, 64);
		const to = clampText(e.to, 80);
		if (e.kind === "relate") {
			const external = isExternalRef(to);
			if (!seen.has(from) || from === to) continue;
			if (!external && !seen.has(to)) continue;
			const key = [from, to].sort().join("|");
			if (relateKey.has(key)) continue;
			relateKey.add(key);
			relateEdges.push({
				from,
				to,
				kind: "relate",
				label: clampText(e.label, PRODUCT_GRAPH_LIMITS.label, true) || void 0
			});
			continue;
		}
		if (!seen.has(from) || !seen.has(to) || from === to) continue;
		if (!treeParent.has(to) && to !== rootId) treeParent.set(to, from);
	}
	for (const node of cleaned) {
		if (node.id === rootId || treeParent.has(node.id)) continue;
		if (node.parentId !== null && node.parentId !== void 0 && seen.has(node.parentId) && node.parentId !== node.id) treeParent.set(node.id, node.parentId);
	}
	const parentOf = (id) => treeParent.get(id);
	for (const node of cleaned) {
		if (node.id === rootId) continue;
		const path = /* @__PURE__ */ new Set([node.id]);
		let cursor = parentOf(node.id);
		while (cursor !== void 0) {
			if (cursor === rootId) break;
			if (path.has(cursor)) {
				treeParent.set(node.id, rootId);
				issues.push({
					code: "CYCLE",
					message: `检测到环，已把「${node.label}」挂回根`,
					id: node.id
				});
				break;
			}
			path.add(cursor);
			cursor = parentOf(cursor);
		}
	}
	for (const node of cleaned) {
		if (node.id === rootId) continue;
		if (parentOf(node.id) === void 0) {
			const wanted = node.parentId;
			if (wanted !== null && wanted !== void 0 && wanted !== "" && !seen.has(wanted)) issues.push({
				code: "PARENT_MISSING",
				message: `父节点「${wanted}」不存在，已把「${node.label}」挂回根`,
				id: node.id
			});
			treeParent.set(node.id, rootId);
		}
	}
	const childrenOf = /* @__PURE__ */ new Map();
	for (const [child, parent] of treeParent) {
		const list = childrenOf.get(parent) ?? [];
		list.push(child);
		childrenOf.set(parent, list);
	}
	const depth = /* @__PURE__ */ new Map([[rootId, 0]]);
	const queue = [rootId];
	const dropped = /* @__PURE__ */ new Set();
	const cleanedIds = new Set(cleaned.map((node) => node.id));
	for (const [child, parent] of treeParent) {
		if (parent === rootId || cleanedIds.has(parent)) continue;
		if (seen.has(parent)) {
			depth.set(child, Math.min(2, PRODUCT_GRAPH_LIMITS.depth));
			queue.push(child);
		}
	}
	while (queue.length > 0) {
		const current = queue.shift();
		const d = depth.get(current) ?? 0;
		for (const child of childrenOf.get(current) ?? []) {
			if (dropped.has(child)) continue;
			if (d + 1 > PRODUCT_GRAPH_LIMITS.depth) {
				dropped.add(child);
				issues.push({
					code: "DEPTH_LIMIT",
					message: `超过 ${PRODUCT_GRAPH_LIMITS.depth} 层，已丢弃节点`,
					id: child
				});
				continue;
			}
			depth.set(child, d + 1);
			queue.push(child);
		}
	}
	for (const node of cleaned) if (node.id !== rootId && !depth.has(node.id)) dropped.add(node.id);
	for (const node of cleaned) if (!dropped.has(node.id)) node.depth = depth.get(node.id) ?? 0;
	const kept = cleaned.filter((n) => !dropped.has(n.id));
	for (const node of kept) node.parentId = node.id === rootId ? null : treeParent.get(node.id) ?? rootId;
	const treeEdges = kept.filter((n) => n.id !== rootId).map((n) => ({
		from: n.parentId,
		to: n.id,
		kind: "tree"
	}));
	const relate = relateEdges.filter((e) => !dropped.has(e.from) && (isExternalRef(e.to) || !dropped.has(e.to)));
	return {
		graph: {
			v: 2,
			rootId,
			nodes: kept,
			edges: treeEdges.concat(relate)
		},
		issues
	};
}
/** v1 mindmap（{nodes:[{id,label,type,parentId}]}）→ v2 图；节点 id 原样保留。 */
function productGraphFromV1(raw, title = "产品") {
	const issues = [];
	const source = (() => {
		if (typeof raw === "string") try {
			return JSON.parse(raw);
		} catch {
			return { nodes: [] };
		}
		if (raw !== null && typeof raw === "object") return raw;
		return { nodes: [] };
	})();
	const nodes = [];
	for (const item of asArray(source.nodes)) {
		if (item === null || typeof item !== "object") continue;
		const node = item;
		const id = clampText(node.id, 64);
		if (id === "") continue;
		const type = clampText(node.type, 16);
		const kind = type === "root" ? "root" : type === "requirement" ? "requirement" : "feature";
		nodes.push({
			id,
			label: clampText(node.label, PRODUCT_GRAPH_LIMITS.label, true) || `未命名${PRODUCT_KIND_LABEL[kind]}`,
			kind,
			detail: clampText(node.note, PRODUCT_GRAPH_LIMITS.detail, true),
			parentId: typeof node.parentId === "string" && node.parentId !== "" ? node.parentId : null,
			status: "kept"
		});
	}
	const normalized = normalizeProductGraph({
		v: 2,
		rootId: nodes.find((n) => n.kind === "root")?.id ?? nodes[0]?.id ?? "root",
		nodes,
		edges: []
	}, { title });
	return {
		graph: normalized.graph,
		issues: issues.concat(normalized.issues)
	};
}
/** v2 图 → v1 mindmap JSON 字符串（向后兼容镜像：products.mindmap / mindmap.json）。 */
function productGraphToV1(graph) {
	const nodes = graph.nodes.map((n) => ({
		id: n.id,
		label: n.label,
		type: n.kind === "root" ? "root" : n.kind === "requirement" ? "requirement" : "feature",
		parentId: n.parentId ?? null,
		note: n.detail ?? ""
	}));
	return JSON.stringify({ nodes });
}
// src/host/index.ts
/**
* dsh-workbench · 宿主半侧
*
* 职责：
*  - 本地 SQLite 轻量库（node:sqlite，WAL）持久化整份工作台状态；
*  - 在 webServer 上挂 /workbench-api 路由，供浏览器半侧读写；
*  - 首次启动写入一组最小示例数据（3 空间 + 7 任务），并带乐观版本号。
*
* 数据按实体分表（spaces / tasks / subtasks / attachments / logs / focus_sessions），
* 写入按「整份快照」在一个事务里替换：单用户本地工作台，数据量小、语义简单，
* 换来的是永不出现半写状态。读侧一次组装成前端直接可用的 JSON。
*/
const require = createRequire(import.meta.url);
/** 可选：若运行环境没有 node:sqlite，降级为同目录 JSON 文件（保持接口不变）。 */
let DatabaseSync = null;
try {
	DatabaseSync = require("node:sqlite").DatabaseSync;
} catch (cause) {
	console.warn(`[dsh-workbench] node:sqlite 不可用，降级为 JSON 存储：${String(cause)}`);
}
const PREFIX = "/workbench-api";
const MAX_BODY_BYTES = 8388608;
const MAX_TASKS = 5e4;
function isoDate(d = /* @__PURE__ */ new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function isoDateTime(d = /* @__PURE__ */ new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${isoDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function isoDateTimeSeconds(d = /* @__PURE__ */ new Date()) {
	const p = (n) => String(n).padStart(2, "0");
	return `${isoDateTime(d)}:${p(d.getSeconds())}`;
}
function addDays(date, delta) {
	const [y, m, d] = date.split("-").map(Number);
	const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
	dt.setDate(dt.getDate() + delta);
	return isoDate(dt);
}
function str(value, fallback = "") {
	return typeof value === "string" ? value.slice(0, 2e4) : fallback;
}
function num(value, fallback = 0) {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}
function list(value) {
	return Array.isArray(value) ? value : [];
}
/** SQLite 里 JSON 列读出来是字符串，统一解析成数组。 */
function jsonList(value) {
	if (Array.isArray(value)) return value;
	const text = str(value).trim();
	if (text === "") return [];
	try {
		const parsed = JSON.parse(text);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
function dataDir() {
	return process.env.DSH_HOME ?? join(homedir(), ".dsh");
}
const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  descr TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  space_id TEXT NOT NULL,
  project_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  date TEXT,
  start TEXT,
  end TEXT,
  duration INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  grp TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  planned_start TEXT,
  planned_end TEXT,
  note TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  size INTEGER,
  path TEXT
);
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  at TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'edit',
  text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  started_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_topics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  query TEXT NOT NULL,
  schedule_kind TEXT NOT NULL DEFAULT 'daily',
  times TEXT NOT NULL DEFAULT '[]',
  weekday INTEGER NOT NULL DEFAULT 1,
  custom_cron TEXT NOT NULL DEFAULT '',
  schedule_text TEXT NOT NULL DEFAULT '',
  cron_task_ids TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  count INTEGER NOT NULL DEFAULT 6,
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bug_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'minor',
  priority TEXT NOT NULL DEFAULT 'P2',
  planned_date TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT '',
  ai_thread_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  assignee TEXT NOT NULL DEFAULT '我',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id, status, updated_at);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  bug_project_id TEXT NOT NULL DEFAULT '',
  deploy_mode TEXT NOT NULL DEFAULT 'local',
  ssh_host TEXT NOT NULL DEFAULT '',
  remote_dir TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_name TEXT NOT NULL DEFAULT '',
  host_port TEXT NOT NULL DEFAULT '',
  container_port TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  precondition TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  expected TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2',
  type TEXT NOT NULL DEFAULT 'functional',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  results TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  deploy_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  notebook_id TEXT NOT NULL DEFAULT '',
  mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}',
  styles TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_demos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  style TEXT NOT NULL,
  scope TEXT NOT NULL,
  feature_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all',
  kind TEXT NOT NULL DEFAULT 'page',
  status TEXT NOT NULL DEFAULT 'ready'
);
CREATE TABLE IF NOT EXISTS product_demo_progress (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  demo_id TEXT NOT NULL DEFAULT '',
  step INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT NOT NULL DEFAULT '',
  log TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notebooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  notebook_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  file_path TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  ai_summary TEXT NOT NULL DEFAULT '',
  fetched_at TEXT NOT NULL,
  hash TEXT NOT NULL,
  UNIQUE(topic_id, hash)
);
CREATE TABLE IF NOT EXISTS tombstones (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(entity, id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_news_items_topic ON news_items(topic_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tombstones_time ON tombstones(deleted_at);
/* ---------- 1.13 UI 设计 / DEMO（D1：以项目为根） ---------- */
CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, hint TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  tokens TEXT NOT NULL DEFAULT '{}', spec TEXT NOT NULL DEFAULT '',
  builtin INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'builtin',
  source_ref TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL DEFAULT '',
  archived_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ui_designs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, product_id TEXT NOT NULL DEFAULT '',
  map_id TEXT NOT NULL DEFAULT '', note_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  theme_id TEXT NOT NULL DEFAULT '', platform TEXT NOT NULL DEFAULT 'all',
  pages TEXT NOT NULL DEFAULT '[]', doc_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft', archived_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demos (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, product_id TEXT NOT NULL DEFAULT '',
  ui_design_id TEXT NOT NULL DEFAULT '', theme_id TEXT NOT NULL,
  layout_mode TEXT NOT NULL DEFAULT 'single', scope TEXT NOT NULL DEFAULT 'all',
  kind TEXT NOT NULL DEFAULT 'page', title TEXT NOT NULL, entry_path TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all', status TEXT NOT NULL DEFAULT 'ready',
  current_version_id TEXT NOT NULL DEFAULT '', archived_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_versions (
  id TEXT PRIMARY KEY, demo_id TEXT NOT NULL, seq INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
  target_page TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
  entry_path TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_files (
  id TEXT PRIMARY KEY, demo_id TEXT NOT NULL, version_id TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'asset', page_id TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0, sha TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ui_designs_project ON ui_designs(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_demos_project ON demos(project_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_demo_versions ON demo_versions(demo_id, seq);
CREATE INDEX IF NOT EXISTS idx_demo_files ON demo_files(demo_id, version_id);
CREATE INDEX IF NOT EXISTS idx_themes_project ON themes(project_id, builtin);
`;
var SqliteStore = class {
	engine = "sqlite";
	file;
	db;
	revision = 0;
	/** 灵感模块复用同一连接：同一 SQLite 文件只留一个写者，避免锁竞争。 */
	connection() {
		return this.db;
	}
	constructor(file) {
		this.file = file;
		mkdirSync(dirname(file), { recursive: true });
		this.db = new DatabaseSync(file);
		this.db.exec(SCHEMA);
		this.migrateNews();
		this.migrateTasks();
		this.migrateProductMaps();
		this.ensureNotebooks();
		this.ensureProducts();
		this.ensureTests();
		this.migrateUnifiedProjects();
		this.migrateUiAndDemo();
		this.seedNotes();
		this.revision = Number(this.readMeta("revision") ?? 0);
		if (!(Number(this.readMeta("seeded") ?? 0) === 1)) {
			this.writeState(seedState());
			this.writeMeta("seeded", "1");
			this.writeMeta("revision", "1");
			this.revision = 1;
		}
	}
	/** 旧库升级：补 news_topics.count / news_items.ai_summary 两列。 */
	migrateNews() {
		const columns = (table) => this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name));
		if (!columns("news_topics").includes("count")) this.db.exec("ALTER TABLE news_topics ADD COLUMN count INTEGER NOT NULL DEFAULT 6");
		if (!columns("news_items").includes("ai_summary")) this.db.exec("ALTER TABLE news_items ADD COLUMN ai_summary TEXT NOT NULL DEFAULT ''");
		if (!columns("notes").includes("map_id")) this.db.exec("ALTER TABLE notes ADD COLUMN map_id TEXT NOT NULL DEFAULT ''");
		for (const [col, sql] of [
			["kind", "TEXT NOT NULL DEFAULT ''"],
			["node_id", "TEXT NOT NULL DEFAULT ''"],
			["module_id", "TEXT NOT NULL DEFAULT ''"],
			["doc_key", "TEXT NOT NULL DEFAULT ''"]
		]) if (!columns("notes").includes(col)) this.db.exec(`ALTER TABLE notes ADD COLUMN ${col} ${sql}`);
		this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_doc_key ON notes(doc_key) WHERE doc_key <> ''");
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_inputs (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, map_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'url', url TEXT NOT NULL DEFAULT '', file_path TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '', mime TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
		this.db.exec("CREATE INDEX IF NOT EXISTS idx_product_inputs ON product_inputs(product_id, created_at)");
		for (const table of [
			"products",
			"modules",
			"notes"
		]) if (!columns(table).includes("archived_at")) this.db.exec(`ALTER TABLE ${table} ADD COLUMN archived_at TEXT NOT NULL DEFAULT ''`);
	}
	/**
	* 旧库升级：一个产品可拥有多张导图。
	* - 新建 product_maps 表；每个产品的旧 products.mindmap 迁成一张「主导图」。
	* - modules / product_demos 增加 map_id，并回填到产品的第一张导图。
	* products.mindmap 保留为第一张导图的镜像（旧版本仍能读到导图）。
	*/
	migrateProductMaps() {
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_maps (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '主导图',
      description TEXT NOT NULL DEFAULT '', mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}',
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      graph_json TEXT NOT NULL DEFAULT '', draft_rev INTEGER NOT NULL DEFAULT 0,
      current_version_id TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
      source_ref TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT ''
    )`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_map_versions (
      id TEXT PRIMARY KEY, map_id TEXT NOT NULL, seq INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'manual', source_ref TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '',
      graph_json TEXT NOT NULL, node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
		this.db.exec("CREATE INDEX IF NOT EXISTS idx_map_versions ON product_map_versions(map_id, seq)");
		const columns = (table) => this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name));
		for (const table of ["modules", "product_demos"]) if (!columns(table).includes("map_id")) this.db.exec(`ALTER TABLE ${table} ADD COLUMN map_id TEXT NOT NULL DEFAULT ''`);
		const now = isoDateTimeSeconds();
		const products = this.db.prepare("SELECT id, name, mindmap, created_at FROM products").all();
		for (const product of products) {
			const existing = this.db.prepare("SELECT id FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at LIMIT 1").get(product.id);
			let mapId = existing?.id;
			if (mapId === void 0) {
				mapId = `map-${randomUUID().slice(0, 12)}`;
				this.db.prepare("INSERT INTO product_maps(id, product_id, name, description, mindmap, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)").run(mapId, product.id, "主导图", "", String(product.mindmap ?? "{\"nodes\":[]}"), 0, product.created_at ?? now, now);
			}
			for (const table of ["modules", "product_demos"]) this.db.prepare(`UPDATE ${table} SET map_id = ? WHERE product_id = ? AND map_id = ''`).run(mapId, product.id);
			if (existing === void 0) {
				const saved = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
				this.writeMapFile(product.id, saved);
			}
		}
		this.migrateProductMapGraphs();
	}
	/**
	* 导图 v2 升级：mindmap(v1) → graph_json(v2 图模型)，节点 id 原样保留（featureId 不悬空）。
	* 升级后立即存档 v1 版本（source=migration），此后每张导图有独立版本序列。
	* mindmap 列继续作为 v1 向后兼容镜像（由 v2 反向导出）。
	*/
	migrateProductMapGraphs() {
		const columns = (table) => this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name));
		const mapCols = columns("product_maps");
		const add = (name, sql) => {
			if (!mapCols.includes(name)) this.db.exec(`ALTER TABLE product_maps ADD COLUMN ${name} ${sql}`);
		};
		add("graph_json", "TEXT NOT NULL DEFAULT ''");
		add("draft_rev", "INTEGER NOT NULL DEFAULT 0");
		add("current_version_id", "TEXT NOT NULL DEFAULT ''");
		add("source", "TEXT NOT NULL DEFAULT 'manual'");
		add("source_ref", "TEXT NOT NULL DEFAULT ''");
		add("summary", "TEXT NOT NULL DEFAULT ''");
		const now = isoDateTimeSeconds();
		const rows = this.db.prepare("SELECT * FROM product_maps WHERE graph_json IS NULL OR graph_json = ''").all();
		for (const row of rows) {
			const product = this.db.prepare("SELECT name FROM products WHERE id = ?").get(row.product_id);
			const { graph } = productGraphFromV1(row.mindmap, String(product?.name ?? "产品"));
			const graphJson = JSON.stringify(graph);
			this.db.prepare("UPDATE product_maps SET graph_json=?, mindmap=?, updated_at=? WHERE id=?").run(graphJson, productGraphToV1(graph), now, row.id);
			if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_map_versions WHERE map_id = ?").get(row.id)?.n ?? 0) === 0) {
				const versionId = `mv-${randomUUID().slice(0, 12)}`;
				this.db.prepare("INSERT INTO product_map_versions(id, map_id, seq, label, source, source_ref, summary, graph_json, node_count, edge_count, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(versionId, row.id, 1, "v1 迁移", "migration", "", "从 v1 导图迁移", graphJson, graph.nodes.length, graph.edges.length, now);
				this.db.prepare("UPDATE product_maps SET current_version_id=? WHERE id=?").run(versionId, row.id);
			}
		}
	}
	/** 旧库升级：任务补 project_path（项目 / 工作区绝对路径；空串表示未归属）。 */
	migrateTasks() {
		if (!this.db.prepare("PRAGMA table_info(tasks)").all().map((c) => String(c.name)).includes("project_path")) this.db.exec("ALTER TABLE tasks ADD COLUMN project_path TEXT NOT NULL DEFAULT ''");
	}
	readMeta(key) {
		return this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key)?.value ?? null;
	}
	writeMeta(key, value) {
		this.db.prepare("INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
	}
	/** 快照写入前先记下旧 id 集合，用于识别「原有但新快照里不存在」的删除项。 */
	idsOf(table) {
		return this.db.prepare(`SELECT id FROM ${table}`).all().map((row) => String(row.id));
	}
	/** 读整份状态（一次组装，任务内嵌子待办/附件/记录）。 */
	readState() {
		const spaces = this.db.prepare("SELECT * FROM spaces ORDER BY sort, created_at").all();
		const tasks = this.db.prepare("SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort, created_at").all();
		const subtasks = this.db.prepare("SELECT * FROM subtasks ORDER BY sort, id").all();
		const attachments = this.db.prepare("SELECT * FROM attachments ORDER BY id").all();
		const logs = this.db.prepare("SELECT * FROM logs ORDER BY at DESC, id").all();
		const focus = this.db.prepare("SELECT * FROM focus_sessions ORDER BY started_at DESC").all();
		const settings = {};
		for (const row of this.db.prepare("SELECT key, value FROM settings").all()) try {
			settings[row.key] = JSON.parse(row.value);
		} catch {
			settings[row.key] = row.value;
		}
		const subBy = groupBy(subtasks, "task_id");
		const attBy = groupBy(attachments, "task_id");
		const logBy = groupBy(logs, "task_id");
		return {
			revision: this.revision,
			spaces: spaces.map((s) => ({
				id: s.id,
				name: s.name,
				color: s.color
			})),
			tasks: tasks.map((t) => ({
				id: t.id,
				title: t.title,
				desc: t.descr ?? "",
				note: t.note ?? "",
				space: t.space_id,
				projectPath: t.project_path ?? "",
				status: t.status,
				priority: t.priority ?? "normal",
				tags: safeJson(t.tags, []),
				date: t.date ?? null,
				start: t.start ?? "",
				end: t.end ?? "",
				duration: Number(t.duration ?? 0),
				group: t.grp ?? "",
				createdAt: t.created_at,
				updatedAt: t.updated_at,
				completedAt: t.completed_at ?? null,
				subtasks: (subBy.get(t.id) ?? []).map(toSubtask),
				attachments: (attBy.get(t.id) ?? []).map(toAttachment),
				logs: (logBy.get(t.id) ?? []).map((l) => ({
					at: l.at,
					type: l.type,
					text: l.text
				}))
			})),
			focus: focus.map((f) => ({
				id: f.id,
				taskId: f.task_id,
				startedAt: f.started_at,
				minutes: Number(f.minutes),
				completed: Number(f.completed) === 1
			})),
			settings
		};
	}
	/** 整份快照写入：一个事务内清空 + 全量插入；失败回滚。 */
	writeState(state) {
		const now = isoDateTime();
		const tasks = list(state.tasks).slice(0, MAX_TASKS);
		const spaces = list(state.spaces);
		const byId = /* @__PURE__ */ new Map();
		for (const task of tasks) {
			const id = str(task?.id);
			if (id !== "" && !byId.has(id)) byId.set(id, task);
		}
		const taskIds = new Set(byId.keys());
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const oldTaskIds = this.idsOf("tasks");
			const oldSubtaskIds = this.idsOf("subtasks");
			const oldFocusIds = this.idsOf("focus_sessions");
			const oldSpaceIds = this.idsOf("spaces");
			const newSubtaskIds = /* @__PURE__ */ new Set();
			const newFocusIds = /* @__PURE__ */ new Set();
			const newSpaceIds = /* @__PURE__ */ new Set();
			this.db.exec("DELETE FROM subtasks; DELETE FROM attachments; DELETE FROM logs; DELETE FROM tasks; DELETE FROM spaces; DELETE FROM focus_sessions; DELETE FROM settings;");
			const insSpace = this.db.prepare("INSERT INTO spaces(id, name, color, sort, created_at, updated_at) VALUES(?,?,?,?,?,?)");
			spaces.forEach((space, index) => {
				const id = str(space?.id);
				if (id === "") return;
				newSpaceIds.add(id);
				insSpace.run(id, str(space.name, id), str(space.color, "#5b5bd6"), index, now, now);
			});
			const insTask = this.db.prepare(`INSERT INTO tasks(id, title, descr, note, space_id, project_path, status, priority, date, start, end, duration, tags, grp, sort, created_at, updated_at, completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
			const insSub = this.db.prepare("INSERT INTO subtasks(id, task_id, title, done, planned_start, planned_end, note, sort) VALUES(?,?,?,?,?,?,?,?)");
			const insAtt = this.db.prepare("INSERT INTO attachments(id, task_id, name, kind, size, path) VALUES(?,?,?,?,?,?)");
			const insLog = this.db.prepare("INSERT INTO logs(id, task_id, at, type, text) VALUES(?,?,?,?,?)");
			let taskIndex = 0;
			for (const task of byId.values()) {
				const id = str(task.id);
				insTask.run(id, str(task.title, "未命名任务"), str(task.desc), str(task.note), str(task.space, "life"), str(task.projectPath), str(task.status, "next"), str(task.priority, "normal"), task.date ? str(task.date) : null, task.start ? str(task.start) : null, task.end ? str(task.end) : null, Math.max(0, Math.round(num(task.duration))), JSON.stringify(list(task.tags).map((t) => str(t)).filter(Boolean)), task.group ? str(task.group) : null, taskIndex++, str(task.createdAt, now), str(task.updatedAt, now), task.completedAt ? str(task.completedAt) : null);
				list(task.subtasks).slice(0, 500).forEach((sub, i) => {
					const sid = str(sub?.id);
					if (sid === "") return;
					newSubtaskIds.add(sid);
					insSub.run(sid, id, str(sub.title, "子待办"), sub.done ? 1 : 0, sub.start ? str(sub.start) : null, sub.end ? str(sub.end) : null, sub.note ? str(sub.note) : null, i);
				});
				list(task.attachments).slice(0, 200).forEach((a) => {
					const aid = str(a?.id);
					if (aid === "") return;
					insAtt.run(aid, id, str(a.name, "附件"), str(a.kind, "other"), a.size === void 0 ? null : Math.round(num(a.size)), null);
				});
				list(task.logs).slice(0, 2e3).forEach((log, i) => {
					insLog.run(`${id}:log:${i}`, id, str(log?.at, now), str(log?.type, "edit"), str(log?.text));
				});
			}
			const insFocus = this.db.prepare("INSERT INTO focus_sessions(id, task_id, started_at, minutes, completed) VALUES(?,?,?,?,?)");
			list(state.focus).slice(0, 5e4).forEach((f, i) => {
				const id = str(f?.id, `focus:${i}`);
				const taskId = str(f.taskId);
				newFocusIds.add(id);
				insFocus.run(id, taskIds.has(taskId) ? taskId : null, str(f.startedAt, now), Math.max(0, Math.round(num(f.minutes))), f.completed === false ? 0 : 1);
			});
			const insSetting = this.db.prepare("INSERT INTO settings(key, value) VALUES(?,?)");
			const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
			for (const [key, value] of Object.entries(settings)) insSetting.run(str(key).slice(0, 120), JSON.stringify(value));
			const deletedAt = isoDateTimeSeconds();
			for (const id of oldTaskIds) if (!taskIds.has(id)) writeTombstone(this.db, "tasks", id, deletedAt);
			for (const id of oldSubtaskIds) if (!newSubtaskIds.has(id)) writeTombstone(this.db, "subtasks", id, deletedAt);
			for (const id of oldFocusIds) if (!newFocusIds.has(id)) writeTombstone(this.db, "focus_sessions", id, deletedAt);
			for (const id of oldSpaceIds) if (!newSpaceIds.has(id)) writeTombstone(this.db, "spaces", id, deletedAt);
			this.revision += 1;
			this.writeMeta("revision", String(this.revision));
			this.db.exec("COMMIT");
		} catch (cause) {
			try {
				this.db.exec("ROLLBACK");
			} catch {}
			throw cause;
		}
		return this.revision;
	}
	/** 新闻：订阅 + 条目（与任务快照分开，避免工作台整份保存覆盖异步写入的新闻）。 */
	listNews() {
		return {
			topics: this.db.prepare("SELECT * FROM news_topics ORDER BY created_at").all().map(toNewsTopic),
			items: this.db.prepare("SELECT * FROM news_items ORDER BY fetched_at DESC, id DESC LIMIT 400").all().map(toNewsItem)
		};
	}
	saveNewsTopic(input) {
		const now = isoDateTime();
		const id = str(input?.id) || `news-${randomUUID().slice(0, 12)}`;
		const title = str(input?.title).trim();
		const query = str(input?.query).trim() || title;
		if (title === "") throw new Error("主题名称不能为空");
		const kind = [
			"daily",
			"workdays",
			"weekly",
			"custom"
		].includes(str(input?.scheduleKind)) ? str(input?.scheduleKind) : "daily";
		const times = cleanTimes(input?.times);
		const weekday = Math.max(0, Math.min(6, Math.round(num(input?.weekday, 1))));
		const customCron = str(input?.customCron).trim();
		const scheduleText = str(input?.scheduleText) || customCron || times.join(" / ");
		const cronTaskIds = list(input?.cronTaskIds).map((x) => str(x)).filter(Boolean);
		const enabled = input?.enabled === false ? 0 : 1;
		const count = Math.max(1, Math.min(20, Math.round(num(input?.count, 6))));
		const existing = this.db.prepare("SELECT id, created_at FROM news_topics WHERE id = ?").get(id);
		const createdAt = existing?.created_at ?? now;
		if (existing) this.db.prepare(`UPDATE news_topics SET title=?, query=?, schedule_kind=?, times=?, weekday=?, custom_cron=?, schedule_text=?, cron_task_ids=?, enabled=?, count=?, updated_at=? WHERE id=?`).run(title, query, kind, JSON.stringify(times), weekday, customCron, scheduleText, JSON.stringify(cronTaskIds), enabled, count, now, id);
		else this.db.prepare(`INSERT INTO news_topics(id, title, query, schedule_kind, times, weekday, custom_cron, schedule_text, cron_task_ids, enabled, count, last_run_at, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, title, query, kind, JSON.stringify(times), weekday, customCron, scheduleText, JSON.stringify(cronTaskIds), enabled, count, null, createdAt, now);
		return toNewsTopic(this.db.prepare("SELECT * FROM news_topics WHERE id = ?").get(id));
	}
	deleteNewsTopic(id) {
		this.db.exec("BEGIN IMMEDIATE");
		try {
			this.db.prepare("DELETE FROM news_items WHERE topic_id = ?").run(id);
			this.db.prepare("DELETE FROM news_topics WHERE id = ?").run(id);
			writeTombstone(this.db, "news_topics", id);
			this.db.exec("COMMIT");
		} catch (cause) {
			try {
				this.db.exec("ROLLBACK");
			} catch {}
			throw cause;
		}
	}
	/** 供 workbench_news_publish 工具调用：按 URL/title 去重写入。 */
	publishNews(topicId, rawItems) {
		const topic = this.db.prepare("SELECT id, title, count FROM news_topics WHERE id = ?").get(topicId);
		if (!topic) return {
			ok: false,
			inserted: 0,
			skipped: 0,
			error: `未知订阅：${topicId}`
		};
		const now = isoDateTimeSeconds();
		const limit = Math.max(1, Math.min(20, Math.round(Number(topic.count ?? 6))));
		const rows = cleanNewsItems(rawItems).slice(0, limit);
		let inserted = 0;
		let skipped = 0;
		this.db.exec("BEGIN IMMEDIATE");
		try {
			const ins = this.db.prepare("INSERT OR IGNORE INTO news_items(id, topic_id, title, url, source, published_at, summary, ai_summary, fetched_at, hash) VALUES(?,?,?,?,?,?,?,?,?,?)");
			for (const item of rows) {
				const result = ins.run(`ni-${randomUUID().slice(0, 16)}`, topicId, item.title, item.url, item.source, item.publishedAt, item.summary, item.aiSummary, now, item.hash);
				if (Number(result?.changes ?? 0) > 0) inserted += 1;
				else skipped += 1;
			}
			this.db.prepare("UPDATE news_topics SET last_run_at = ?, updated_at = ? WHERE id = ?").run(now, now, topicId);
			this.db.prepare(`DELETE FROM news_items WHERE topic_id = ? AND id NOT IN (SELECT id FROM news_items WHERE topic_id = ? ORDER BY fetched_at DESC, id DESC LIMIT 200)`).run(topicId, topicId);
			this.db.exec("COMMIT");
		} catch (cause) {
			try {
				this.db.exec("ROLLBACK");
			} catch {}
			throw cause;
		}
		return {
			ok: true,
			inserted,
			skipped
		};
	}
	ensureNotebooks() {
		this.db.exec(`CREATE TABLE IF NOT EXISTS bug_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bugs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'minor',
  priority TEXT NOT NULL DEFAULT 'P2',
  planned_date TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT '',
  ai_thread_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  assignee TEXT NOT NULL DEFAULT '我',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bugs_project ON bugs(project_id, status, updated_at);
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  bug_project_id TEXT NOT NULL DEFAULT '',
  deploy_mode TEXT NOT NULL DEFAULT 'local',
  ssh_host TEXT NOT NULL DEFAULT '',
  remote_dir TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_name TEXT NOT NULL DEFAULT '',
  host_port TEXT NOT NULL DEFAULT '',
  container_port TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  precondition TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  expected TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2',
  type TEXT NOT NULL DEFAULT 'functional',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  results TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  deploy_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  notebook_id TEXT NOT NULL DEFAULT '',
  mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}',
  styles TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_demos (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  style TEXT NOT NULL,
  scope TEXT NOT NULL,
  feature_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'all',
  kind TEXT NOT NULL DEFAULT 'page',
  status TEXT NOT NULL DEFAULT 'ready'
);
CREATE TABLE IF NOT EXISTS product_demo_progress (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  demo_id TEXT NOT NULL DEFAULT '',
  step INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  message TEXT NOT NULL DEFAULT '',
  log TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notebooks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
		const cols = this.db.prepare("PRAGMA table_info(notes)").all();
		if (!cols.some((c) => c.name === "notebook_id")) this.db.exec("ALTER TABLE notes ADD COLUMN notebook_id TEXT NOT NULL DEFAULT ''");
		if (!cols.some((c) => c.name === "file_path")) this.db.exec("ALTER TABLE notes ADD COLUMN file_path TEXT NOT NULL DEFAULT ''");
		if (!this.db.prepare("PRAGMA table_info(notebooks)").all().some((c) => c.name === "workspace_path")) this.db.exec("ALTER TABLE notebooks ADD COLUMN workspace_path TEXT NOT NULL DEFAULT ''");
		let def = this.db.prepare("SELECT id FROM notebooks ORDER BY created_at, id LIMIT 1").get();
		if (!def) {
			const now = isoDateTimeSeconds();
			this.db.prepare("INSERT INTO notebooks(id, name, created_at, updated_at) VALUES(?,?,?,?)").run("nb-default", "随手记", now, now);
			def = { id: "nb-default" };
		}
		this.db.prepare("UPDATE notes SET notebook_id=? WHERE notebook_id IS NULL OR notebook_id=''").run(def.id);
	}
	ensureTests() {
		this.db.exec(`CREATE TABLE IF NOT EXISTS modules (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'module', platform TEXT NOT NULL DEFAULT 'all',
      description TEXT NOT NULL DEFAULT '', note_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'designing',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '', product_id TEXT NOT NULL DEFAULT '',
      bug_project_id TEXT NOT NULL DEFAULT '', deploy_mode TEXT NOT NULL DEFAULT 'local',
      ssh_host TEXT NOT NULL DEFAULT '', remote_dir TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
      container_name TEXT NOT NULL DEFAULT '', host_port TEXT NOT NULL DEFAULT '', container_port TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      precondition TEXT NOT NULL DEFAULT '', steps TEXT NOT NULL DEFAULT '[]', expected TEXT NOT NULL DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'P2', type TEXT NOT NULL DEFAULT 'functional',
      source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running', results TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '{}', deploy_log TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, finished_at TEXT
    )`);
		const addCol = (table, name, sql) => {
			if (!this.db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sql}`);
		};
		addCol("bugs", "module_id", "TEXT NOT NULL DEFAULT ''");
		addCol("bugs", "platform", "TEXT NOT NULL DEFAULT 'all'");
		addCol("test_projects", "module_id", "TEXT NOT NULL DEFAULT ''");
		addCol("test_projects", "platform", "TEXT NOT NULL DEFAULT 'all'");
		addCol("test_cases", "module_id", "TEXT NOT NULL DEFAULT ''");
		addCol("test_cases", "platform", "TEXT NOT NULL DEFAULT 'all'");
	}
	ensureProducts() {
		this.db.exec(`CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'module',
  platform TEXT NOT NULL DEFAULT 'all',
  description TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'designing',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL DEFAULT '',
  product_id TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  bug_project_id TEXT NOT NULL DEFAULT '',
  deploy_mode TEXT NOT NULL DEFAULT 'local',
  ssh_host TEXT NOT NULL DEFAULT '',
  remote_dir TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_name TEXT NOT NULL DEFAULT '',
  host_port TEXT NOT NULL DEFAULT '',
  container_port TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  precondition TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  expected TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P2',
  type TEXT NOT NULL DEFAULT 'functional',
  source TEXT NOT NULL DEFAULT 'manual',
  module_id TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  results TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT '{}',
  deploy_log TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '', notebook_id TEXT NOT NULL DEFAULT '',
      mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}', styles TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_demos (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, style TEXT NOT NULL, scope TEXT NOT NULL,
      feature_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL, file_path TEXT NOT NULL, created_at TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'all', kind TEXT NOT NULL DEFAULT 'page', status TEXT NOT NULL DEFAULT 'ready'
    )`);
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_demo_progress (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, demo_id TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running',
      message TEXT NOT NULL DEFAULT '', log TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL
    )`);
		const cols = this.db.prepare("PRAGMA table_info(products)").all();
		const add = (name, sql) => {
			if (!cols.some((c) => c.name === name)) this.db.exec(`ALTER TABLE products ADD COLUMN ${name} ${sql}`);
		};
		add("description", "TEXT NOT NULL DEFAULT ''");
		add("workspace_path", "TEXT NOT NULL DEFAULT ''");
		add("notebook_id", "TEXT NOT NULL DEFAULT ''");
		add("mindmap", `TEXT NOT NULL DEFAULT '{"nodes":[]}'`);
		add("styles", "TEXT NOT NULL DEFAULT '[]'");
		const demoCols = this.db.prepare("PRAGMA table_info(product_demos)").all();
		const addDemo = (name, sql) => {
			if (!demoCols.some((c) => c.name === name)) this.db.exec(`ALTER TABLE product_demos ADD COLUMN ${name} ${sql}`);
		};
		addDemo("platform", "TEXT NOT NULL DEFAULT 'all'");
		addDemo("kind", "TEXT NOT NULL DEFAULT 'page'");
		addDemo("status", "TEXT NOT NULL DEFAULT 'ready'");
		const moduleCols = this.db.prepare("PRAGMA table_info(modules)").all();
		if (!moduleCols.some((c) => c.name === "node_id")) this.db.exec("ALTER TABLE modules ADD COLUMN node_id TEXT NOT NULL DEFAULT ''");
		if (!moduleCols.some((c) => c.name === "sort_order")) this.db.exec("ALTER TABLE modules ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_progress (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'modules',
      demo_id TEXT NOT NULL DEFAULT '', map_id TEXT NOT NULL DEFAULT '',
      step INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running', message TEXT NOT NULL DEFAULT '',
      log TEXT NOT NULL DEFAULT '[]', session_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )`);
	}
	defaultNotebookId() {
		let row = this.db.prepare("SELECT id FROM notebooks ORDER BY created_at, id LIMIT 1").get();
		if (!row) {
			const now = isoDateTimeSeconds();
			this.db.prepare("INSERT INTO notebooks(id, name, created_at, updated_at) VALUES(?,?,?,?)").run("nb-default", "随手记", now, now);
			row = { id: "nb-default" };
		}
		return String(row.id);
	}
	seedNotes() {
		const notebookId = this.defaultNotebookId();
		if (this.readMeta("notes_seeded") !== "1") {
			this.writeMeta("notes_seeded", "1");
			const row = this.db.prepare("SELECT COUNT(*) AS n FROM notes").get();
			if (Number(row?.n ?? 0) === 0) {
				const note = welcomeNote();
				this.db.prepare("INSERT INTO notes(id, notebook_id, title, content, tags, pinned, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)").run(note.id, notebookId, note.title, note.content, JSON.stringify(note.tags), 1, note.createdAt, note.updatedAt);
			}
		}
	}
	/** 记事本：与任务/新闻分开的独立表。 */
	listNotes(includeArchived = false) {
		const sql = includeArchived ? "SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC" : "SELECT * FROM notes WHERE archived_at = '' ORDER BY pinned DESC, updated_at DESC";
		return this.db.prepare(sql).all().map(toNote);
	}
	listNotebooks() {
		return this.db.prepare(`SELECT nb.*, (SELECT COUNT(*) FROM notes n WHERE n.notebook_id = nb.id) AS count
      FROM notebooks nb ORDER BY nb.created_at, nb.id`).all().map((row) => ({
			id: row.id,
			name: row.name,
			workspacePath: row.workspace_path ?? "",
			count: Number(row.count ?? 0),
			createdAt: row.created_at,
			updatedAt: row.updated_at
		}));
	}
	saveNotebook(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `nb-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 80);
		if (name === "") throw new Error("笔记本名称不能为空");
		const workspacePath = str(input?.workspacePath).trim();
		const existing = this.db.prepare("SELECT id, created_at FROM notebooks WHERE id = ?").get(id);
		if (existing) this.db.prepare("UPDATE notebooks SET name=?, workspace_path=?, updated_at=? WHERE id=?").run(name, workspacePath, now, id);
		else this.db.prepare("INSERT INTO notebooks(id, name, workspace_path, created_at, updated_at) VALUES(?,?,?,?,?)").run(id, name, workspacePath, existing?.created_at ?? now, now);
		const row = this.db.prepare("SELECT * FROM notebooks WHERE id = ?").get(id);
		return {
			id: row.id,
			name: row.name,
			workspacePath: row.workspace_path ?? "",
			count: 0,
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}
	deleteNotebook(id) {
		if (!this.db.prepare("SELECT id FROM notebooks WHERE id = ?").get(id)) throw new Error("笔记本不存在");
		const other = this.db.prepare("SELECT id FROM notebooks WHERE id <> ? ORDER BY created_at, id LIMIT 1").get(id);
		if (!other) throw new Error("至少保留一个笔记本");
		const moved = Number(this.db.prepare("SELECT COUNT(*) AS n FROM notes WHERE notebook_id = ?").get(id)?.n ?? 0);
		this.db.prepare("UPDATE notes SET notebook_id = ? WHERE notebook_id = ?").run(other.id, id);
		this.db.prepare("DELETE FROM notebooks WHERE id = ?").run(id);
		writeTombstone(this.db, "notebooks", id);
		return {
			ok: true,
			moved,
			notebookId: other.id
		};
	}
	saveNote(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `note-${randomUUID().slice(0, 12)}`;
		const title = str(input?.title).trim().slice(0, 200) || "未命名笔记";
		const content = str(input?.content).slice(0, 5e5);
		const tags = cleanTags(input?.tags);
		const pinned = input?.pinned === true ? 1 : 0;
		const wanted = str(input?.notebookId);
		const notebook = this.db.prepare("SELECT id, name, workspace_path FROM notebooks WHERE id = ?").get(wanted);
		const notebookId = notebook?.id ? String(notebook.id) : this.defaultNotebookId();
		const nb = notebook?.id ? notebook : this.db.prepare("SELECT id, name, workspace_path FROM notebooks WHERE id = ?").get(notebookId);
		const mapId = str(input?.mapId);
		const kind = [
			"module_design",
			"product_design",
			"feature_design"
		].includes(str(input?.kind)) ? str(input.kind) : "";
		const nodeId = str(input?.nodeId).slice(0, 64);
		const moduleId = str(input?.moduleId).slice(0, 64);
		let docKey = str(input?.docKey).slice(0, 160);
		if (docKey === "" && kind !== "") {
			if (kind === "module_design" && moduleId !== "") docKey = `md:${moduleId}`;
			else if (kind === "feature_design" && nodeId !== "") docKey = `fd:${mapId}:${nodeId}`;
			else if (kind === "product_design") {
				const pid = str(input?.productId) || "all";
				docKey = moduleId !== "" ? `pd:${pid}:${moduleId}` : `pd:${pid}`;
			}
		}
		let existing = this.db.prepare("SELECT id, created_at, file_path FROM notes WHERE id = ?").get(id);
		if (existing === void 0 && docKey !== "") existing = this.db.prepare("SELECT id, created_at, file_path FROM notes WHERE doc_key = ?").get(docKey);
		const finalId = existing?.id !== void 0 ? String(existing.id) : id;
		const createdAt = existing?.created_at ?? now;
		let filePath = "";
		try {
			filePath = syncNoteFile({
				id,
				title,
				content
			}, nb);
		} catch (cause) {
			console.warn(`[dsh-workbench] 笔记文件写入失败：${String(cause)}`);
		}
		if (existing) {
			this.db.prepare("UPDATE notes SET notebook_id=?, title=?, content=?, tags=?, pinned=?, file_path=?, map_id=?, kind=?, node_id=?, module_id=?, doc_key=?, updated_at=? WHERE id=?").run(notebookId, title, content, JSON.stringify(tags), pinned, filePath, mapId, kind, nodeId, moduleId, docKey, now, finalId);
			if (existing.file_path && existing.file_path !== filePath) removeFile(existing.file_path);
		} else this.db.prepare("INSERT INTO notes(id, notebook_id, title, content, tags, pinned, file_path, map_id, kind, node_id, module_id, doc_key, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(finalId, notebookId, title, content, JSON.stringify(tags), pinned, filePath, mapId, kind, nodeId, moduleId, docKey, createdAt, now);
		return toNote(this.db.prepare("SELECT * FROM notes WHERE id = ?").get(finalId));
	}
	deleteNote(id) {
		const row = this.db.prepare("SELECT file_path FROM notes WHERE id = ?").get(id);
		if (row?.file_path) removeFile(String(row.file_path));
		this.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
		if (row !== void 0) writeTombstone(this.db, "notes", id);
	}
	getExportConfig() {
		return {
			exportDir: str(this.readMeta("export_dir")) || homedir(),
			defaultExportDir: homedir()
		};
	}
	setExportDir(raw) {
		const dir = normalizeExportDir(raw);
		this.writeMeta("export_dir", dir);
		return this.getExportConfig();
	}
	/**
	* 统一项目（projects 主表）。
	*
	* 背景：产品 / Bug / 测试 / 灵感原本各有一张「项目」表，字段几乎相同（name + workspace_path），
	* 但互不相通——门户按 workspace_path 只读聚合，用户在门户建了「产品」，进 Bug 页还要再建一次。
	*
	* 现在统一为一张 `projects` 主表：
	*  - 产品 / Bug 项目 / 测试项目 / 灵感项目 通过各自的 `project_id` 指向它（保留原表作为领域数据容器）；
	*  - 老数据迁移时按 workspace_path + name 归并，保证同一个工作区只对应一个统一项目；
	*  - 门户、Bug、测试、灵感的「项目」列表都从 `projects` 读，只有一份。
	*/
	/**
	* 1.13 迁移：UI 设计 / DEMO / 主题。
	* - 建表由 SCHEMA 负责（CREATE IF NOT EXISTS）；
	* - 这里只做「内置主题入库」：12 套预置主题写入 themes（builtin=1），幂等（已存在则跳过）；
	* - 主题的 spec 由 tokens 推导出一段简短规范说明，供 AI 后续读取。
	*/
	migrateUiAndDemo() {
		const now = isoDateTimeSeconds();
		const builtin = [
			{
				id: "clean",
				name: "极简白",
				hint: "白底 / 蓝色主色 / 轻阴影 · 通用",
				platform: "all",
				tokens: {
					bg: "#f7f9fc",
					surface: "#ffffff",
					text: "#111827",
					muted: "#5b6577",
					line: "#e4e9f2",
					accent: "#2563eb",
					accentInk: "#ffffff",
					radius: 10,
					font: "system",
					density: "comfortable",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "极简白：白底、单一蓝色强调、轻阴影、10px 圆角；信息密度舒适，适合大多数 B 端与工具型产品。"
			},
			{
				id: "glass",
				name: "玻璃拟态",
				hint: "深色渐变 / 半透明卡片 / 模糊 · 2024-26 主流",
				platform: "all",
				tokens: {
					bg: "#0c1222",
					surface: "rgba(255,255,255,0.06)",
					text: "#eef4ff",
					muted: "#a8b6d4",
					line: "rgba(255,255,255,0.14)",
					accent: "#7aa2ff",
					accentInk: "#0a1020",
					radius: 14,
					font: "system",
					density: "comfortable",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "玻璃拟态：深色底 + 半透明卡片 + 背景模糊（backdrop-blur 14px）；强调色仅用于可操作元素，卡片细边框 1px。"
			},
			{
				id: "neo",
				name: "新拟态",
				hint: "灰底 / 双层阴影 / 柔和圆角 · 通用",
				platform: "all",
				tokens: {
					bg: "#e8ebf0",
					surface: "#eef1f6",
					text: "#2b3340",
					muted: "#6a7485",
					line: "#d5dbe5",
					accent: "#4f6bed",
					accentInk: "#ffffff",
					radius: 16,
					font: "system",
					density: "comfortable",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "新拟态：灰底、双层柔和阴影（外深内亮）、16px 圆角、无硬边框；强调色用于主按钮与选中态。"
			},
			{
				id: "editorial",
				name: "编辑杂志",
				hint: "米白 / 衬线标题 / 强网格 · PC 内容型",
				platform: "pc",
				tokens: {
					bg: "#f6f1e7",
					surface: "#fbf7ef",
					text: "#1f1b16",
					muted: "#6b6156",
					line: "#ded4c4",
					accent: "#c2410c",
					accentInk: "#ffffff",
					radius: 8,
					font: "serif",
					density: "spacious",
					shadow: "none",
					motion: "subtle"
				},
				spec: "编辑杂志：米白纸感底、衬线标题（Georgia/宋体）、强网格与留白、无阴影；适合内容型 PC 站点。"
			},
			{
				id: "dashboard",
				name: "暗色仪表盘",
				hint: "深色 / 数据卡片 / 霓虹强调 · PC 后台标配",
				platform: "pc",
				tokens: {
					bg: "#0f172a",
					surface: "#1e293b",
					text: "#e2e8f0",
					muted: "#94a3b8",
					line: "#334155",
					accent: "#38bdf8",
					accentInk: "#04121f",
					radius: 12,
					font: "system",
					density: "compact",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "暗色仪表盘：深蓝底 + 分层卡片、细边框、霓虹青强调；密度紧凑，适合数据密集型后台。"
			},
			{
				id: "bento",
				name: "Bento 网格",
				hint: "拼色卡片 / 大圆角 / 非对称栅格 · 当下流行",
				platform: "pc",
				tokens: {
					bg: "#ffffff",
					surface: "#f8fafc",
					text: "#111827",
					muted: "#6b7280",
					line: "#e5e7eb",
					accent: "#4f46e5",
					accentInk: "#ffffff",
					radius: 20,
					font: "system",
					density: "spacious",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "Bento 网格：多色卡片块交错（白/淡黄/淡蓝/淡绿）、20px 大圆角、非对称栅格、强留白与大标题。"
			},
			{
				id: "tech",
				name: "科技终端",
				hint: "深蓝黑 / 等宽字 / 网格线 · 工具型产品",
				platform: "pc",
				tokens: {
					bg: "#0a0f1a",
					surface: "#111827",
					text: "#d1fae5",
					muted: "#6b8f80",
					line: "#1f2937",
					accent: "#22d3ee",
					accentInk: "#04121a",
					radius: 6,
					font: "mono",
					density: "compact",
					shadow: "none",
					motion: "none"
				},
				spec: "科技终端：深蓝黑底、等宽字体点缀、网格线背景、细线描边、6px 小圆角、无动效。"
			},
			{
				id: "aurora",
				name: "流光渐变",
				hint: "极光紫蓝 / 大渐变 / 毛玻璃 · 移动端流行",
				platform: "mobile",
				tokens: {
					bg: "linear-gradient(135deg,#667eea,#764ba2,#f093fb)",
					surface: "rgba(255,255,255,0.14)",
					text: "#ffffff",
					muted: "rgba(255,255,255,0.78)",
					line: "rgba(255,255,255,0.22)",
					accent: "#f472b6",
					accentInk: "#2a0d1e",
					radius: 20,
					font: "rounded",
					density: "comfortable",
					shadow: "soft",
					motion: "expressive"
				},
				spec: "流光渐变：极光紫蓝 135° 渐变底、毛玻璃卡片、白色文字、20px 大圆角；移动端优先，动效可略强。"
			},
			{
				id: "cream",
				name: "温暖奶油",
				hint: "奶油色 / 大字重 / 软阴影 · 移动端流行",
				platform: "mobile",
				tokens: {
					bg: "#faf6f1",
					surface: "#ffffff",
					text: "#3d3128",
					muted: "#8b7d70",
					line: "#efe6db",
					accent: "#e07a5f",
					accentInk: "#ffffff",
					radius: 18,
					font: "rounded",
					density: "comfortable",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "温暖奶油：奶油底、白色卡片、软阴影（0 8px 24px rgba(0,0,0,.06)）、18px 圆角、大字重标题。"
			},
			{
				id: "clay",
				name: "黏土拟态",
				hint: "3D 软塑 / 饱和色 / 厚圆角 · 移动端",
				platform: "mobile",
				tokens: {
					bg: "#f0f4ff",
					surface: "#ffffff",
					text: "#1d2b53",
					muted: "#6b7ba8",
					line: "#dde5f7",
					accent: "#4cc9f0",
					accentInk: "#062a3a",
					radius: 24,
					font: "rounded",
					density: "comfortable",
					shadow: "strong",
					motion: "expressive"
				},
				spec: "黏土拟态：浅蓝底、饱和色块（黄/绿/蓝）、24px 厚圆角、内外阴影组合形成软塑感。"
			},
			{
				id: "brutal",
				name: "新粗野",
				hint: "高对比 / 硬边框 / 鲜艳色块 · 移动端潮牌风",
				platform: "mobile",
				tokens: {
					bg: "#ffffff",
					surface: "#ffffff",
					text: "#000000",
					muted: "#4b5563",
					line: "#000000",
					accent: "#ff6b6b",
					accentInk: "#000000",
					radius: 0,
					font: "system",
					density: "compact",
					shadow: "none",
					motion: "none"
				},
				spec: "新粗野：纯白底、3px 纯黑硬边框、offset 阴影（4px 4px 0 #000）、鲜艳色块、粗体无衬线、0 圆角。"
			},
			{
				id: "padflow",
				name: "平板双栏",
				hint: "侧栏 + 内容 / 大触控目标 · 平板优先",
				platform: "tablet",
				tokens: {
					bg: "#f8fafc",
					surface: "#ffffff",
					text: "#0f172a",
					muted: "#64748b",
					line: "#e2e8f0",
					accent: "#0ea5e9",
					accentInk: "#ffffff",
					radius: 12,
					font: "system",
					density: "comfortable",
					shadow: "soft",
					motion: "subtle"
				},
				spec: "平板双栏：左侧 280px 侧栏 + 右内容区，12px 圆角，按钮高度 ≥44px 满足触控目标。"
			}
		];
		const insert = this.db.prepare(`INSERT INTO themes(id, name, hint, platform, tokens, spec, builtin, source, source_ref, project_id, archived_at, created_at, updated_at)
       VALUES(?,?,?,?,?,?,1,'builtin','','','',?,?)
       ON CONFLICT(id) DO NOTHING`);
		for (const theme of builtin) try {
			insert.run(theme.id, theme.name, theme.hint, theme.platform, JSON.stringify(theme.tokens), theme.spec, now, now);
		} catch (cause) {
			console.warn(`[dsh-workbench] 内置主题写入失败 ${theme.id}：${String(cause)}`);
		}
	}
	migrateUnifiedProjects() {
		this.db.exec(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      workspace_path TEXT NOT NULL DEFAULT '', workspace_name TEXT NOT NULL DEFAULT '',
      archived_at TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
		this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_ws ON projects(workspace_path) WHERE workspace_path <> ''");
		const cols = (table) => this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => String(c.name));
		for (const table of [
			"products",
			"bug_projects",
			"test_projects"
		]) if (!cols(table).includes("project_id")) this.db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
		const now = isoDateTimeSeconds();
		const candidates = [];
		for (const row of this.db.prepare("SELECT name, workspace_path, created_at FROM products WHERE archived_at = ''").all()) candidates.push({
			name: String(row.name),
			workspacePath: String(row.workspace_path ?? ""),
			createdAt: row.created_at
		});
		for (const row of this.db.prepare("SELECT name, workspace_path, created_at FROM bug_projects").all()) {
			const name = String(row.name).replace(/^测试：/, "");
			candidates.push({
				name,
				workspacePath: String(row.workspace_path ?? ""),
				createdAt: row.created_at
			});
		}
		for (const row of this.db.prepare("SELECT name, workspace_path, created_at FROM test_projects").all()) candidates.push({
			name: String(row.name),
			workspacePath: String(row.workspace_path ?? ""),
			createdAt: row.created_at
		});
		const byKey = /* @__PURE__ */ new Map();
		for (const item of candidates) {
			const key = item.workspacePath !== "" ? `ws:${item.workspacePath}` : `name:${item.name}`;
			if (byKey.has(key)) continue;
			const existing = this.db.prepare(item.workspacePath !== "" ? "SELECT id FROM projects WHERE workspace_path = ?" : "SELECT id FROM projects WHERE workspace_path = '' AND name = ?").get(...item.workspacePath !== "" ? [item.workspacePath] : [item.name]);
			if (existing !== void 0) {
				byKey.set(key, {
					id: String(existing.id),
					name: item.name,
					workspacePath: item.workspacePath,
					createdAt: item.createdAt ?? now
				});
				continue;
			}
			const id = `prj-${randomUUID().slice(0, 12)}`;
			this.db.prepare("INSERT INTO projects(id, name, description, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(id, item.name.slice(0, 100), "", item.workspacePath, basename(item.workspacePath || ""), item.createdAt ?? now, now);
			byKey.set(key, {
				id,
				name: item.name,
				workspacePath: item.workspacePath,
				createdAt: item.createdAt ?? now
			});
		}
		const pick = (workspacePath, name) => {
			const key = workspacePath !== "" ? `ws:${workspacePath}` : `name:${name}`;
			return byKey.get(key)?.id ?? "";
		};
		for (const row of this.db.prepare("SELECT id, name, workspace_path, project_id FROM products WHERE project_id = ''").all()) {
			const pid = pick(String(row.workspace_path ?? ""), String(row.name));
			if (pid !== "") this.db.prepare("UPDATE products SET project_id = ? WHERE id = ?").run(pid, row.id);
		}
		for (const row of this.db.prepare("SELECT id, name, workspace_path, project_id FROM bug_projects WHERE project_id = ''").all()) {
			const pid = pick(String(row.workspace_path ?? ""), String(row.name).replace(/^测试：/, ""));
			if (pid !== "") this.db.prepare("UPDATE bug_projects SET project_id = ? WHERE id = ?").run(pid, row.id);
		}
		for (const row of this.db.prepare("SELECT id, name, workspace_path, project_id FROM test_projects WHERE project_id = ''").all()) {
			const pid = pick(String(row.workspace_path ?? ""), String(row.name));
			if (pid !== "") this.db.prepare("UPDATE test_projects SET project_id = ? WHERE id = ?").run(pid, row.id);
		}
		for (const project of this.db.prepare("SELECT id, name, workspace_path FROM projects WHERE workspace_path <> '' AND archived_at = ''").all()) {
			if (this.db.prepare("SELECT id FROM bug_projects WHERE project_id = ? LIMIT 1").get(project.id) !== void 0) continue;
			const ts = isoDateTimeSeconds();
			this.db.prepare("INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(`bugp-${randomUUID().slice(0, 12)}`, String(project.name), String(project.workspace_path), basename(String(project.workspace_path)), String(project.id), ts, ts);
		}
	}
	listProjects(includeArchived = false) {
		const sql = includeArchived ? "SELECT * FROM projects ORDER BY sort_order, created_at" : "SELECT * FROM projects WHERE archived_at = '' ORDER BY sort_order, created_at";
		return this.db.prepare(sql).all().map(toProject);
	}
	getProject(id) {
		const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(str(id));
		return row === void 0 ? void 0 : toProject(row);
	}
	/** 按工作区路径取/建统一项目（产品、Bug、测试、灵感建域对象时共用）。 */
	ensureProject(workspacePath, name) {
		let ws = "";
		try {
			ws = normalizeWorkspacePath(workspacePath);
		} catch {
			ws = "";
		}
		const existing = ws !== "" ? this.db.prepare("SELECT * FROM projects WHERE workspace_path = ?").get(ws) : this.db.prepare("SELECT * FROM projects WHERE workspace_path = '' AND name = ?").get(str(name).slice(0, 100));
		if (existing !== void 0) return toProject(existing);
		const now = isoDateTimeSeconds();
		const id = `prj-${randomUUID().slice(0, 12)}`;
		this.db.prepare("INSERT INTO projects(id, name, description, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(id, str(name).slice(0, 100) || "未命名项目", "", ws, basename(ws), now, now);
		return toProject(this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
	}
	/** 保存统一项目；改名会同步到各域展示（各域仍保留自己的 name 作领域内叫法）。 */
	saveProject(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id);
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("项目名称不能为空");
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		if ((id !== "" ? this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) : void 0) !== void 0) {
			this.db.prepare("UPDATE projects SET name=?, description=?, workspace_path=?, workspace_name=?, sort_order=?, updated_at=? WHERE id=?").run(name, str(input?.description).slice(0, 5e3), workspacePath, basename(workspacePath), Math.max(0, Math.round(Number(input?.sortOrder) || 0)), now, id);
			return toProject(this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
		}
		const dup = workspacePath !== "" ? this.db.prepare("SELECT * FROM projects WHERE workspace_path = ?").get(workspacePath) : void 0;
		if (dup !== void 0) {
			if (str(input?.description) !== "") this.db.prepare("UPDATE projects SET description=?, updated_at=? WHERE id=?").run(str(input.description).slice(0, 5e3), now, dup.id);
			return toProject(this.db.prepare("SELECT * FROM projects WHERE id = ?").get(dup.id));
		}
		const newId = id !== "" ? id : `prj-${randomUUID().slice(0, 12)}`;
		this.db.prepare("INSERT INTO projects(id, name, description, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(newId, name, str(input?.description).slice(0, 5e3), workspacePath, basename(workspacePath), now, now);
		return toProject(this.db.prepare("SELECT * FROM projects WHERE id = ?").get(newId));
	}
	deleteProject(id) {
		if (this.db.prepare("SELECT * FROM projects WHERE id = ?").get(str(id)) === void 0) return;
		for (const table of [
			"products",
			"bug_projects",
			"test_projects"
		]) this.db.prepare(`UPDATE ${table} SET project_id = '' WHERE project_id = ?`).run(str(id));
		this.db.prepare("DELETE FROM projects WHERE id = ?").run(str(id));
	}
	/** 项目概览：统一项目 → 各域对象与计数（门户卡片直接用这个）。 */
	listProjectOverviews(includeArchived = false) {
		return this.listProjects(includeArchived).map((project) => {
			const products = this.db.prepare("SELECT * FROM products WHERE project_id = ?").all(project.id).map(toProduct);
			const bugProjects = this.db.prepare("SELECT * FROM bug_projects WHERE project_id = ?").all(project.id).map(toBugProject);
			const testProjects = this.db.prepare("SELECT * FROM test_projects WHERE project_id = ?").all(project.id).map(toTestProject);
			const bugCount = Number(this.db.prepare("SELECT COUNT(*) AS n FROM bugs WHERE project_id IN (SELECT id FROM bug_projects WHERE project_id = ?)").get(project.id)?.n ?? 0);
			return {
				project,
				products,
				bugProjects,
				testProjects,
				counts: {
					products: products.length,
					bugProjects: bugProjects.length,
					testProjects: testProjects.length,
					bugs: bugCount
				}
			};
		});
	}
	listProducts(includeArchived = false) {
		const sql = includeArchived ? "SELECT * FROM products ORDER BY updated_at DESC, id" : "SELECT * FROM products WHERE archived_at = '' ORDER BY updated_at DESC, id";
		return this.db.prepare(sql).all().map(toProduct);
	}
	saveProduct(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `prod-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("产品名称不能为空");
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		const existing = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id);
		let notebookId = str(input?.notebookId) || str(existing?.notebook_id);
		if (notebookId === "") notebookId = this.saveNotebook({
			name: `产品：${name}`,
			workspacePath
		}).id;
		else this.saveNotebook({
			id: notebookId,
			name: `产品：${name}`,
			workspacePath
		});
		let mindmap = typeof input?.mindmap === "string" ? input.mindmap : existing?.mindmap ?? "{\"nodes\":[]}";
		try {
			const parsed = JSON.parse(mindmap);
			if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
				parsed.nodes = [{
					id: "root",
					label: name,
					type: "root",
					parentId: null,
					note: ""
				}];
				mindmap = JSON.stringify(parsed);
			}
		} catch {
			mindmap = JSON.stringify({ nodes: [{
				id: "root",
				label: name,
				type: "root",
				parentId: null,
				note: ""
			}] });
		}
		const styles = Array.isArray(input?.styles) ? input.styles : safeJson(existing?.styles, []);
		if (existing) this.db.prepare("UPDATE products SET name=?, description=?, workspace_path=?, notebook_id=?, mindmap=?, styles=?, updated_at=? WHERE id=?").run(name, str(input?.description).slice(0, 5e3), workspacePath, notebookId, mindmap, JSON.stringify(styles), now, id);
		else this.db.prepare("INSERT INTO products(id, name, description, workspace_path, notebook_id, mindmap, styles, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id, name, str(input?.description).slice(0, 5e3), workspacePath, notebookId, mindmap, JSON.stringify(styles), existing?.created_at ?? now, now);
		try {
			const unified = this.ensureProject(workspacePath, name);
			this.db.prepare("UPDATE products SET project_id = ? WHERE id = ?").run(unified.id, id);
			if (this.db.prepare("SELECT id FROM bug_projects WHERE project_id = ? LIMIT 1").get(unified.id) === void 0 && workspacePath !== "") {
				const bugId = `bugp-${randomUUID().slice(0, 12)}`;
				const ts = isoDateTimeSeconds();
				this.db.prepare("INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(bugId, name, workspacePath, basename(workspacePath), unified.id, ts, ts);
			}
		} catch (cause) {
			console.warn(`[dsh-workbench] 统一项目关联失败：${String(cause)}`);
		}
		const row = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id);
		if (this.defaultMapId(id) === "") this.saveProductMap({
			productId: id,
			name: "主导图",
			description: "",
			graph: productGraphFromV1(mindmap, name).graph
		});
		this.saveProductMindmapFile(row);
		return toProduct(row);
	}
	saveProductMindmapFile(product) {
		try {
			const workspace = str(product?.workspace_path).trim();
			if (workspace === "") return;
			const dir = join(workspace, ".dsh-workbench", "products", product.id);
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "mindmap.json"), String(product.mindmap ?? "{\"nodes\":[]}"), "utf8");
			for (const map of this.listProductMaps(product.id)) this.writeMapFile(product.id, map);
		} catch (cause) {
			console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`);
		}
	}
	saveProductMindmap(productId, mindmap) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
		if (!product) throw new Error("产品不存在");
		const mapId = this.defaultMapId(productId);
		const map = mapId === "" ? void 0 : this.getProductMap(mapId);
		if (map !== void 0) this.saveProductMap({
			id: map.id,
			productId,
			name: map.name,
			description: map.description,
			graph: productGraphFromV1(mindmap, product.name).graph
		});
		else {
			const now = isoDateTimeSeconds();
			this.db.prepare("UPDATE products SET mindmap=?, updated_at=? WHERE id=?").run(mindmap, now, productId);
		}
		const next = this.db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
		this.saveProductMindmapFile(next);
		return toProduct(next);
	}
	listProductMaps(productId) {
		return this.db.prepare("SELECT * FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at").all(productId).map(toProductMap);
	}
	getProductMap(mapId) {
		const row = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		return row === void 0 ? void 0 : toProductMap(row);
	}
	/** 产品的默认导图（第一张），供未指定 mapId 的旧调用使用。 */
	defaultMapId(productId) {
		const row = this.db.prepare("SELECT id FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at LIMIT 1").get(productId);
		return String(row?.id ?? "");
	}
	saveProductMap(input) {
		const now = isoDateTimeSeconds();
		const productId = str(input?.productId);
		if (!this.db.prepare("SELECT * FROM products WHERE id = ?").get(productId)) throw new Error("产品不存在");
		const name = str(input?.name).trim().slice(0, 80) || "未命名导图";
		const description = str(input?.description).slice(0, 2e3);
		let id = str(input?.id);
		const existing = id === "" ? void 0 : this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(id);
		if (input?.graph !== void 0 && input?.graph !== null && !Array.isArray(input.graph?.nodes)) throw new Error("导图 graph 形状不正确：缺少 nodes 数组（是否误传了 { graph, issues } 包装对象？）");
		const normalized = normalizeProductGraph(input?.graph ?? (typeof input?.mindmap === "string" ? productGraphFromV1(input.mindmap, name).graph : void 0) ?? (existing !== void 0 ? mapGraphOf(existing) : productGraphFromV1(normalizeMindmap(void 0, name), name).graph), { title: name });
		if (normalized.issues.length > 0) console.warn(`[dsh-workbench] 导图规范化：${normalized.issues.map((i) => i.message).join("；")}`);
		const graph = this.pruneExternalRefs(productId, normalized.graph);
		const graphJson = JSON.stringify(graph);
		const mindmap = productGraphToV1(graph);
		const source = str(input?.source).trim().slice(0, 12) || str(existing?.source) || "manual";
		const sourceRef = str(input?.sourceRef).trim().slice(0, 120) || str(existing?.source_ref) || "";
		const summary = str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary) || str(existing?.summary) || "";
		if (existing === void 0) {
			id = `map-${randomUUID().slice(0, 12)}`;
			const order = Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_maps WHERE product_id = ?").get(productId)?.n ?? 0);
			this.db.prepare(`INSERT INTO product_maps(id, product_id, name, description, mindmap, sort_order, created_at, updated_at, graph_json, draft_rev, current_version_id, source, source_ref, summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, productId, name, description, mindmap, order, now, now, graphJson, 0, "", source, sourceRef, summary);
		} else this.db.prepare("UPDATE product_maps SET name=?, description=?, mindmap=?, graph_json=?, source=?, source_ref=?, summary=?, updated_at=? WHERE id=?").run(name, description, mindmap, graphJson, source, sourceRef, summary, now, id);
		this.syncFirstMapMirror(productId);
		const saved = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(id);
		this.writeMapFile(productId, saved);
		this.cleanInboundRefs(productId, id, graph);
		return toProductMap(saved);
	}
	/** 跨图引用校验：relate 边指向 <mapId>:<nodeId> 时，目标导图必须是同产品的另一张图。 */
	pruneExternalRefs(productId, graph) {
		const ids = new Set(this.db.prepare("SELECT id FROM product_maps WHERE product_id = ?").all(productId).map((r) => String(r.id)));
		const edges = graph.edges.filter((edge) => {
			if (edge.kind !== "relate") return true;
			const ref = parseExternalRef(String(edge.to));
			if (ref === null) return true;
			if (!ids.has(ref.mapId)) {
				console.warn(`[dsh-workbench] 跨图引用目标不存在，已丢弃：${edge.to}`);
				return false;
			}
			return true;
		});
		return edges.length === graph.edges.length ? graph : {
			...graph,
			edges
		};
	}
	/** 入向跨图引用清理：本图删掉节点后，其他导图指向 <mapId>:<nodeId> 的引用一并移除，不留悬空。 */
	cleanInboundRefs(productId, mapId, graph) {
		try {
			const alive = new Set(graph.nodes.map((n) => n.id));
			const others = this.db.prepare("SELECT * FROM product_maps WHERE product_id = ? AND id <> ?").all(productId, mapId);
			for (const other of others) {
				const g = mapGraphOf(other);
				const edges = g.edges.filter((e) => !(e.kind === "relate" && String(e.to).startsWith(`${mapId}:`) && !alive.has(String(e.to).slice(mapId.length + 1))));
				if (edges.length !== g.edges.length) {
					const next = {
						...g,
						edges
					};
					this.db.prepare("UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=draft_rev+1, updated_at=? WHERE id=?").run(JSON.stringify(next), productGraphToV1(next), isoDateTimeSeconds(), other.id);
					this.writeMapFile(productId, {
						id: other.id,
						graph_json: JSON.stringify(next),
						mindmap: productGraphToV1(next)
					});
				}
			}
		} catch (cause) {
			console.warn(`[dsh-workbench] 入向引用清理失败：${String(cause)}`);
		}
	}
	/**
	* 追加/更新一个导图节点（供 AI 工具调用）。
	* 语义：按 parentId 挂到树上；同名同 kind 且同父则更新，否则新增。
	* 走 saveMapDraft，保证 draft_rev / 版本镜像 / 文件镜像一致。
	*/
	addMapNode(input) {
		const productId = str(input?.productId);
		const mapId = str(input?.mapId);
		const row = this.db.prepare("SELECT * FROM product_maps WHERE id = ? AND product_id = ?").get(mapId, productId);
		if (row === void 0) throw new Error("导图不存在或不属于该产品");
		const name = str(input?.name).trim().slice(0, 24);
		if (name === "") throw new Error("节点名称不能为空");
		const kind = [
			"module",
			"business",
			"feature",
			"requirement"
		].includes(str(input?.kind)) ? str(input.kind) : "feature";
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input.platform) : void 0;
		const parentId = str(input?.parentId);
		const graph = mapGraphOf(row);
		const existing = graph.nodes.find((n) => n.label === name && n.kind === kind && (parentId === "" ? n.parentId === null || n.parentId === graph.rootId : n.parentId === parentId));
		if (existing !== void 0) {
			if (platform !== void 0) existing.platform = platform;
			if (str(input?.detail) !== "") existing.detail = str(input.detail).slice(0, 200);
			return this.saveMapDraft({
				mapId,
				graph
			}).map;
		}
		const id = `pn-${randomUUID().slice(2, 8)}`;
		graph.nodes.push({
			id,
			label: name,
			kind,
			parentId: parentId === "" ? graph.rootId : parentId,
			status: "kept",
			...platform === void 0 ? {} : { platform },
			...str(input?.detail) === "" ? {} : { detail: str(input.detail).slice(0, 200) }
		});
		return this.saveMapDraft({
			mapId,
			graph
		}).map;
	}
	/** 草稿保存：乐观并发（rev 不一致抛 draft_conflict，携带当前草稿）。 */
	saveMapDraft(input) {
		const mapId = str(input?.mapId);
		const row = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		if (!row) throw new Error("导图不存在");
		const current = Number(row.draft_rev ?? 0);
		if (input?.rev !== void 0 && Number(input.rev) !== current) {
			const error = /* @__PURE__ */ new Error("draft_conflict");
			error.code = "draft_conflict";
			error.current = toProductMap(row);
			throw error;
		}
		if (input?.graph !== void 0 && input?.graph !== null && !Array.isArray(input.graph?.nodes)) throw new Error("导图 graph 形状不正确：缺少 nodes 数组（是否误传了 { graph, issues } 包装对象？）");
		const normalized = normalizeProductGraph(input?.graph, { title: row.name });
		const graph = this.pruneExternalRefs(row.product_id, normalized.graph);
		if (productGraphBytes(graph) > PRODUCT_GRAPH_LIMITS.graph) throw new Error("导图数据过大");
		const next = current + 1;
		this.db.prepare("UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=?, updated_at=? WHERE id=?").run(JSON.stringify(graph), productGraphToV1(graph), next, isoDateTimeSeconds(), mapId);
		this.syncFirstMapMirror(row.product_id);
		const saved = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		this.writeMapFile(row.product_id, saved);
		this.cleanInboundRefs(row.product_id, mapId, graph);
		return {
			rev: next,
			map: toProductMap(saved)
		};
	}
	mapVersionRow(row) {
		return {
			id: row.id,
			mapId: row.map_id,
			seq: Number(row.seq ?? 0),
			label: row.label ?? `v${row.seq}`,
			source: row.source ?? "manual",
			sourceRef: row.source_ref ?? "",
			summary: row.summary ?? "",
			nodeCount: Number(row.node_count ?? 0),
			edgeCount: Number(row.edge_count ?? 0),
			createdAt: row.created_at
		};
	}
	listMapVersions(mapId) {
		return this.db.prepare("SELECT * FROM product_map_versions WHERE map_id = ? ORDER BY seq DESC").all(mapId).map((row) => this.mapVersionRow(row));
	}
	getMapVersion(id) {
		const row = this.db.prepare("SELECT * FROM product_map_versions WHERE id = ?").get(id);
		if (row === void 0) return void 0;
		let graph;
		try {
			graph = JSON.parse(String(row.graph_json));
		} catch {
			graph = productGraphFromV1("{\"nodes\":[]}").graph;
		}
		return {
			...this.mapVersionRow(row),
			graph
		};
	}
	/** 存档版本：图写入版本序列并成为当前草稿（手动 / 导入 / AI / 回滚统一走这里）。 */
	createMapVersion(input) {
		const mapId = str(input?.mapId);
		const row = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		if (!row) throw new Error("导图不存在");
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_map_versions WHERE map_id = ?").get(mapId)?.n ?? 0) >= PRODUCT_GRAPH_LIMITS.versions) throw new Error(`每个导图最多 ${PRODUCT_GRAPH_LIMITS.versions} 个版本，请先删除旧版本`);
		if (input?.graph !== void 0 && input?.graph !== null && !Array.isArray(input.graph?.nodes)) throw new Error("导图 graph 形状不正确：缺少 nodes 数组（是否误传了 { graph, issues } 包装对象？）");
		const normalized = normalizeProductGraph(input?.graph ?? mapGraphOf(row), { title: row.name });
		const graph = this.pruneExternalRefs(row.product_id, normalized.graph);
		if (productGraphBytes(graph) > PRODUCT_GRAPH_LIMITS.graph) throw new Error("导图数据过大");
		const graphJson = JSON.stringify(graph);
		const seq = Number(this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS s FROM product_map_versions WHERE map_id = ?").get(mapId)?.s ?? 0) + 1;
		const id = `mv-${randomUUID().slice(0, 12)}`;
		const ts = isoDateTimeSeconds();
		this.db.prepare("INSERT INTO product_map_versions(id, map_id, seq, label, source, source_ref, summary, graph_json, node_count, edge_count, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, mapId, seq, clampText(input?.label, PRODUCT_GRAPH_LIMITS.labelLong) || `v${seq}`, [
			"manual",
			"outline",
			"idea",
			"ai",
			"rollback",
			"migration"
		].includes(str(input?.source)) ? str(input?.source) : "manual", str(input?.sourceRef).slice(0, 120), str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary), graphJson, graph.nodes.length, graph.edges.length, ts);
		this.db.prepare("UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=draft_rev+1, current_version_id=?, updated_at=? WHERE id=?").run(graphJson, productGraphToV1(graph), id, ts, mapId);
		this.syncFirstMapMirror(row.product_id);
		const saved = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		this.writeMapFile(row.product_id, saved);
		this.cleanInboundRefs(row.product_id, mapId, graph);
		return this.mapVersionRow(this.db.prepare("SELECT * FROM product_map_versions WHERE id = ?").get(id));
	}
	deleteMapVersion(id) {
		const row = this.db.prepare("SELECT * FROM product_map_versions WHERE id = ?").get(id);
		if (!row) return;
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_map_versions WHERE map_id = ?").get(row.map_id)?.n ?? 0) <= 1) throw new Error("至少保留一个版本");
		this.db.prepare("DELETE FROM product_map_versions WHERE id = ?").run(id);
		if (this.db.prepare("SELECT current_version_id FROM product_maps WHERE id = ?").get(row.map_id)?.current_version_id === id) {
			const latest = this.db.prepare("SELECT id FROM product_map_versions WHERE map_id = ? ORDER BY seq DESC LIMIT 1").get(row.map_id);
			this.db.prepare("UPDATE product_maps SET current_version_id = ? WHERE id = ?").run(latest?.id ?? "", row.map_id);
		}
	}
	/** 回滚：把该版本图写回草稿并记一条 rollback 版本，历史不丢。 */
	rollbackMapVersion(mapId, versionId) {
		const version = this.getMapVersion(versionId);
		if (!version || version.mapId !== mapId) throw new Error("版本不存在");
		return this.createMapVersion({
			mapId,
			graph: version.graph,
			source: "rollback",
			label: `回滚到 v${version.seq}`,
			summary: `从 v${version.seq} 恢复`
		});
	}
	/** 每张导图镜像到工作区 maps/<mapId>.json（v2 图；mindmap.json 仍是 v1 兼容镜像）。 */
	writeMapFile(productId, map) {
		try {
			const workspace = str(this.db.prepare("SELECT workspace_path FROM products WHERE id = ?").get(productId)?.workspace_path).trim();
			if (workspace === "" || !map) return;
			const dir = join(workspace, ".dsh-workbench", "products", productId, "maps");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, `${map.id}.json`), JSON.stringify(mapGraphOf(map)), "utf8");
		} catch (cause) {
			console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`);
		}
	}
	deleteProductMap(mapId) {
		const row = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		if (!row) return;
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_maps WHERE product_id = ?").get(row.product_id)?.n ?? 0) <= 1) throw new Error("至少保留一张导图");
		this.db.prepare("DELETE FROM product_maps WHERE id = ?").run(mapId);
		this.db.prepare("DELETE FROM product_map_versions WHERE map_id = ?").run(mapId);
		for (const table of [
			"modules",
			"product_demos",
			"notes"
		]) this.db.prepare(`UPDATE ${table} SET map_id = '' WHERE map_id = ?`).run(mapId);
		const others = this.db.prepare("SELECT * FROM product_maps WHERE product_id = ?").all(row.product_id);
		for (const other of others) {
			const graph = mapGraphOf(other);
			const edges = graph.edges.filter((e) => !(e.kind === "relate" && String(e.to).startsWith(`${mapId}:`)));
			if (edges.length !== graph.edges.length) {
				const next = {
					...graph,
					edges
				};
				this.db.prepare("UPDATE product_maps SET graph_json=?, mindmap=?, draft_rev=draft_rev+1, updated_at=? WHERE id=?").run(JSON.stringify(next), productGraphToV1(next), isoDateTimeSeconds(), other.id);
				this.writeMapFile(row.product_id, {
					id: other.id,
					graph_json: JSON.stringify(next),
					mindmap: productGraphToV1(next)
				});
			}
		}
		this.syncFirstMapMirror(row.product_id);
		try {
			const workspace = str(this.db.prepare("SELECT workspace_path FROM products WHERE id = ?").get(row.product_id)?.workspace_path).trim();
			if (workspace !== "") removeFile(join(workspace, ".dsh-workbench", "products", row.product_id, "maps", `${mapId}.json`));
		} catch {}
	}
	/** products.mindmap 作为第一张导图的镜像，旧版本读取时仍能拿到导图。 */
	syncFirstMapMirror(productId) {
		const first = this.db.prepare("SELECT mindmap FROM product_maps WHERE product_id = ? ORDER BY sort_order, created_at LIMIT 1").get(productId);
		if (first) this.db.prepare("UPDATE products SET mindmap = ? WHERE id = ?").run(first.mindmap, productId);
	}
	deleteProduct(id) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id);
		if (product?.workspace_path) try {
			rmSync(join(str(product.workspace_path), ".dsh-workbench", "products", id), {
				recursive: true,
				force: true
			});
		} catch {}
		this.db.prepare("DELETE FROM product_demos WHERE product_id = ?").run(id);
		this.db.prepare("DELETE FROM product_demo_progress WHERE product_id = ?").run(id);
		this.db.prepare("DELETE FROM product_map_versions WHERE map_id IN (SELECT id FROM product_maps WHERE product_id = ?)").run(id);
		this.db.prepare("DELETE FROM product_maps WHERE product_id = ?").run(id);
		this.db.prepare("DELETE FROM products WHERE id = ?").run(id);
	}
	listProductDemos(productId, mapId) {
		const map = str(mapId);
		return (productId ? map === "" || map === "all" ? this.db.prepare("SELECT * FROM product_demos WHERE product_id = ? ORDER BY created_at DESC").all(productId) : this.db.prepare("SELECT * FROM product_demos WHERE product_id = ? AND map_id = ? ORDER BY created_at DESC").all(productId, map) : this.db.prepare("SELECT * FROM product_demos ORDER BY created_at DESC").all()).map(toProductDemo);
	}
	getProductDemo(id) {
		const row = this.db.prepare("SELECT * FROM product_demos WHERE id = ?").get(id);
		return row ? toProductDemo(row) : void 0;
	}
	saveProductDemo(input) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(str(input?.productId));
		if (!product) throw new Error("产品不存在");
		const mapId = str(input?.mapId) || this.defaultMapId(product.id);
		const workspace = str(product.workspace_path).trim();
		if (workspace === "") throw new Error("产品未关联工作区");
		const style = str(input?.style).replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "clean";
		const scope = str(input?.scope) === "feature" ? "feature" : "all";
		const featureId = scope === "feature" ? str(input?.featureId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) : "";
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all";
		const kind = str(input?.kind) === "system" ? "system" : "page";
		const html = str(input?.html);
		if (html.trim() === "") throw new Error("Demo HTML 为空");
		const id = `demo-${randomUUID().slice(0, 12)}`;
		const dir = join(workspace, ".dsh-workbench", "products", product.id, "demo", style);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `${scope === "feature" ? featureId : "all"}-${id.slice(-6)}.html`);
		writeFileSync(path, html.slice(0, 2e6), "utf8");
		const now = isoDateTimeSeconds();
		this.db.prepare("INSERT INTO product_demos(id, product_id, style, scope, feature_id, title, file_path, created_at, platform, kind, status, map_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id, product.id, style, scope, featureId, str(input?.title) || `${product.name} · ${style} · ${scope}`, path, now, platform, kind, "ready", mapId);
		return toProductDemo(this.db.prepare("SELECT * FROM product_demos WHERE id = ?").get(id));
	}
	getDemoProgress(productId) {
		const row = this.db.prepare("SELECT * FROM product_demo_progress WHERE product_id = ?").get(str(productId));
		return row ? toDemoProgress(row) : void 0;
	}
	saveDemoProgress(input) {
		const productId = str(input?.productId);
		if (productId === "") throw new Error("缺少 productId");
		const id = `dp-${productId}`;
		const now = isoDateTimeSeconds();
		const status = [
			"running",
			"done",
			"failed"
		].includes(str(input?.status)) ? str(input?.status) : "running";
		const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0);
		const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0);
		const message = str(input?.message).slice(0, 500);
		const log = jsonList(this.db.prepare("SELECT log FROM product_demo_progress WHERE id = ?").get(id)?.log);
		if (message !== "") log.push({
			step,
			message,
			at: now
		});
		const capped = JSON.stringify(log.slice(-50));
		this.db.prepare(`INSERT INTO product_demo_progress(id, product_id, demo_id, step, total, status, message, log, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET demo_id=excluded.demo_id, step=excluded.step, total=excluded.total, status=excluded.status, message=excluded.message, log=excluded.log, updated_at=excluded.updated_at`).run(id, productId, str(input?.demoId).slice(0, 60), step, total, status, message, capped, now);
		return toDemoProgress(this.db.prepare("SELECT * FROM product_demo_progress WHERE id = ?").get(id));
	}
	deleteProductDemo(id) {
		const row = this.db.prepare("SELECT * FROM product_demos WHERE id = ?").get(id);
		if (row?.file_path) try {
			rmSync(str(row.file_path), { force: true });
		} catch {}
		this.db.prepare("DELETE FROM product_demos WHERE id = ?").run(id);
	}
	/** 设计文档清单：按 kind 分组（module_design / product_design / feature_design）。 */
	listDesignDocs(productId) {
		const rows = this.db.prepare("SELECT * FROM notes WHERE kind <> '' AND notebook_id IN (SELECT notebook_id FROM products WHERE id = ?) ORDER BY kind, updated_at DESC").all(str(productId));
		const map = {
			module_design: [],
			product_design: [],
			feature_design: []
		};
		for (const row of rows) {
			const note = toNote(row);
			const bucket = map[note.kind];
			if (bucket !== void 0) bucket.push(note);
		}
		return map;
	}
	publishProductNote(input) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(str(input?.productId));
		if (!product) throw new Error("产品不存在");
		const featureId = str(input?.featureId);
		const moduleId = str(input?.moduleId);
		const kind = [
			"module_design",
			"product_design",
			"feature_design"
		].includes(str(input?.kind)) ? str(input.kind) : moduleId !== "" ? "module_design" : featureId !== "" ? "feature_design" : "product_design";
		const mapId = str(input?.mapId) || this.defaultMapId(product.id);
		const tags = cleanTags([
			...list(input?.tags),
			"产品",
			product.name,
			...featureId ? [featureId] : [],
			...moduleId ? [moduleId] : [],
			...str(input?.platform) ? [`platform:${str(input.platform)}`] : [],
			`design:${kind}`
		]);
		const note = this.saveNote({
			notebookId: product.notebook_id,
			title: str(input?.title) || (kind === "module_design" ? "模块设计文档" : kind === "product_design" ? "产品设计文档" : "产品设计笔记"),
			content: str(input?.content),
			tags,
			mapId,
			kind,
			nodeId: featureId,
			moduleId,
			productId: product.id
		});
		if (moduleId !== "") this.db.prepare("UPDATE modules SET note_id=?, status=?, updated_at=? WHERE id=? AND product_id=?").run(note.id, "designed", isoDateTimeSeconds(), moduleId, product.id);
		return note;
	}
	/** 归档 / 取消归档：products / modules / notes 通用。 */
	setArchived(target, id, archived) {
		const table = target === "products" ? "products" : target === "modules" ? "modules" : "notes";
		if (!this.db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(str(id))) throw new Error("目标不存在");
		this.db.prepare(`UPDATE ${table} SET archived_at=?, updated_at=? WHERE id=?`).run(archived ? isoDateTimeSeconds() : "", isoDateTimeSeconds(), str(id));
	}
	listProductInputs(productId, mapId = "") {
		return (str(mapId) === "" || str(mapId) === "all" ? this.db.prepare("SELECT * FROM product_inputs WHERE product_id = ? ORDER BY created_at").all(str(productId)) : this.db.prepare("SELECT * FROM product_inputs WHERE product_id = ? AND (map_id = ? OR map_id = '') ORDER BY created_at").all(str(productId), str(mapId))).map((row) => ({
			id: row.id,
			productId: row.product_id,
			mapId: row.map_id ?? "",
			kind: row.kind,
			url: row.url ?? "",
			filePath: row.file_path ?? "",
			note: row.note ?? "",
			label: row.label ?? "",
			mime: row.mime ?? "",
			width: Number(row.width ?? 0),
			height: Number(row.height ?? 0),
			size: Number(row.size ?? 0),
			createdAt: row.created_at
		}));
	}
	/** 新增素材：url / image（已落盘的截图）/ text */
	addProductInput(input) {
		const productId = str(input?.productId);
		if (!this.db.prepare("SELECT id FROM products WHERE id = ?").get(productId)) throw new Error("产品不存在");
		const kind = [
			"url",
			"image",
			"text"
		].includes(str(input?.kind)) ? str(input?.kind) : "url";
		const url = str(input?.url).slice(0, 1e3);
		if (kind === "url") {
			if (!/^https?:\/\//i.test(url)) throw new Error("链接必须以 http(s):// 开头");
		}
		if (kind === "image" && str(input?.filePath) === "") throw new Error("截图缺少文件路径");
		const id = `pin-${randomUUID().slice(0, 12)}`;
		const now = isoDateTimeSeconds();
		this.db.prepare(`INSERT INTO product_inputs(id, product_id, map_id, kind, url, file_path, note, label, mime, width, height, size, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, productId, str(input?.mapId), kind, url, str(input?.filePath), str(input?.note).slice(0, 2e3), str(input?.label).slice(0, 120), str(input?.mime).slice(0, 60), Math.max(0, Math.round(Number(input?.width) || 0)), Math.max(0, Math.round(Number(input?.height) || 0)), Math.max(0, Math.round(Number(input?.size) || 0)), now);
		return this.listProductInputs(productId).find((item) => item.id === id);
	}
	deleteProductInput(id) {
		const row = this.db.prepare("SELECT file_path FROM product_inputs WHERE id = ?").get(str(id));
		if (row?.file_path) removeFile(String(row.file_path));
		this.db.prepare("DELETE FROM product_inputs WHERE id = ?").run(str(id));
	}
	themeRow(row) {
		return {
			id: row.id,
			name: row.name,
			hint: row.hint ?? "",
			platform: row.platform ?? "all",
			tokens: safeJson(row.tokens, {}),
			spec: row.spec ?? "",
			builtin: Number(row.builtin ?? 0) === 1,
			source: row.source ?? "builtin",
			sourceRef: row.source_ref ?? "",
			projectId: row.project_id ?? "",
			archivedAt: row.archived_at ?? "",
			createdAt: row.created_at,
			updatedAt: row.updated_at
		};
	}
	listThemes(opts = {}) {
		const platform = str(opts.platform);
		const projectId = str(opts.projectId);
		const conds = [];
		const params = [];
		if (opts.includeArchived !== true) conds.push("archived_at = ''");
		if (platform !== "" && platform !== "all") {
			conds.push("(platform = ? OR platform = 'all')");
			params.push(platform);
		}
		if (projectId !== "") {
			conds.push("(project_id = '' OR project_id = ?)");
			params.push(projectId);
		}
		const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
		return this.db.prepare(`SELECT * FROM themes ${where} ORDER BY builtin DESC, created_at`).all(...params).map((row) => this.themeRow(row));
	}
	getTheme(id) {
		const row = this.db.prepare("SELECT * FROM themes WHERE id = ?").get(str(id));
		return row === void 0 ? void 0 : this.themeRow(row);
	}
	/** 令牌最小校验（D3：不做白名单，只保证能渲染）。 */
	validateThemeTokens(tokens) {
		if (tokens === null || typeof tokens !== "object" || Array.isArray(tokens)) return {
			ok: false,
			error: "tokens 必须是对象"
		};
		const t = tokens;
		const isColor = (v) => typeof v === "string" && v.trim() !== "";
		for (const key of [
			"bg",
			"surface",
			"text",
			"accent"
		]) if (!isColor(t[key])) return {
			ok: false,
			error: `缺少或非法的颜色：${key}`
		};
		const radius = Number(t.radius);
		if (!Number.isFinite(radius) || radius < 0 || radius > 48) return {
			ok: false,
			error: "radius 必须是 0–48 的数值"
		};
		return {
			ok: true,
			value: {
				...t,
				radius
			}
		};
	}
	saveTheme(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id).trim().slice(0, 48) || `th-${randomUUID().slice(0, 10)}`;
		if (!/^[a-z0-9][a-z0-9-]{1,47}$/i.test(id)) throw new Error("主题 id 只能由字母数字与 - 组成");
		const name = str(input?.name).trim().slice(0, 40);
		if (name === "") throw new Error("主题名称不能为空");
		const tokensRaw = typeof input?.tokens === "string" ? (() => {
			try {
				return JSON.parse(input.tokens);
			} catch {
				return null;
			}
		})() : input?.tokens;
		const checked = this.validateThemeTokens(tokensRaw);
		if (!checked.ok) throw new Error(checked.error ?? "主题令牌非法");
		const existing = this.db.prepare("SELECT * FROM themes WHERE id = ?").get(id);
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input.platform) : "all";
		const source = [
			"builtin",
			"text",
			"image",
			"url",
			"mixed",
			"manual"
		].includes(str(input?.source)) ? str(input.source) : "manual";
		const spec = str(input?.spec).slice(0, 2e4);
		const hint = str(input?.hint).slice(0, 200);
		const sourceRef = str(input?.sourceRef).slice(0, 500);
		const projectId = str(input?.projectId);
		const tokensJson = JSON.stringify(checked.value);
		if (existing !== void 0) {
			if (Number(existing.builtin ?? 0) === 1 && str(input?.force) !== "1") {
				this.db.prepare("UPDATE themes SET hint=?, spec=?, updated_at=? WHERE id=?").run(hint || existing.hint, spec || existing.spec, now, id);
				return this.themeRow(this.db.prepare("SELECT * FROM themes WHERE id = ?").get(id));
			}
			this.db.prepare("UPDATE themes SET name=?, hint=?, platform=?, tokens=?, spec=?, source=?, source_ref=?, project_id=?, updated_at=? WHERE id=?").run(name, hint, platform, tokensJson, spec, source, sourceRef, projectId, now, id);
		} else this.db.prepare(`INSERT INTO themes(id,name,hint,platform,tokens,spec,builtin,source,source_ref,project_id,archived_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,0,?,?,?,'',?,?)`).run(id, name, hint, platform, tokensJson, spec, source, sourceRef, projectId, now, now);
		return this.themeRow(this.db.prepare("SELECT * FROM themes WHERE id = ?").get(id));
	}
	deleteTheme(id) {
		const row = this.db.prepare("SELECT builtin FROM themes WHERE id = ?").get(str(id));
		if (row === void 0) return;
		if (Number(row.builtin ?? 0) === 1) {
			const error = /* @__PURE__ */ new Error("内置主题不可删除");
			error.code = "builtin_locked";
			throw error;
		}
		this.db.prepare("DELETE FROM themes WHERE id = ?").run(str(id));
	}
	archiveTheme(id, archived) {
		const row = this.db.prepare("SELECT builtin FROM themes WHERE id = ?").get(str(id));
		if (row === void 0) throw new Error("主题不存在");
		if (Number(row.builtin ?? 0) === 1) throw new Error("内置主题不可归档");
		this.db.prepare("UPDATE themes SET archived_at=?, updated_at=? WHERE id=?").run(archived ? isoDateTimeSeconds() : "", isoDateTimeSeconds(), str(id));
	}
	listModules(productId, mapId, includeArchived = false) {
		const map = str(mapId);
		const arch = includeArchived ? "" : " AND archived_at = ''";
		return (productId ? map === "" || map === "all" ? this.db.prepare(`SELECT * FROM modules WHERE product_id = ?${arch} ORDER BY created_at, id`).all(productId) : this.db.prepare(`SELECT * FROM modules WHERE product_id = ? AND map_id = ?${arch} ORDER BY created_at, id`).all(productId, map) : this.db.prepare(`SELECT * FROM modules WHERE 1=1${arch} ORDER BY created_at, id`).all()).map(toModule);
	}
	saveModule(input) {
		const now = isoDateTimeSeconds();
		const productId = str(input?.productId);
		if (!this.db.prepare("SELECT id FROM products WHERE id = ?").get(productId)) throw new Error("产品不存在");
		const name = str(input?.name).trim().slice(0, 120);
		if (name === "") throw new Error("模块名称不能为空");
		const kind = [
			"module",
			"business",
			"feature",
			"requirement"
		].includes(str(input?.kind)) ? str(input?.kind) : "module";
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all";
		const mapId = str(input?.mapId) || this.defaultMapId(productId);
		let id = str(input?.id);
		if (id === "") id = this.db.prepare("SELECT id FROM modules WHERE product_id=? AND map_id=? AND name=? AND kind=?").get(productId, mapId, name, kind)?.id ?? `mod-${randomUUID().slice(0, 12)}`;
		const existing = this.db.prepare("SELECT * FROM modules WHERE id = ?").get(id);
		input?.patch;
		const nodeId = input?.nodeId !== void 0 ? str(input.nodeId) : str(existing?.node_id);
		const parentId = input?.parentId !== void 0 ? str(input.parentId) : str(existing?.parent_id);
		const description = input?.description !== void 0 ? str(input.description).slice(0, 8e3) : str(existing?.description);
		const noteId = input?.noteId !== void 0 ? str(input.noteId) : str(existing?.note_id);
		const status = input?.status !== void 0 ? str(input.status).slice(0, 24) : str(existing?.status) || "designing";
		const sortOrder = input?.sortOrder !== void 0 ? Math.max(0, Math.round(Number(input.sortOrder) || 0)) : Number(existing?.sort_order ?? 0);
		if (existing) this.db.prepare("UPDATE modules SET product_id=?, map_id=?, parent_id=?, name=?, kind=?, platform=?, description=?, note_id=?, status=?, node_id=?, sort_order=?, updated_at=? WHERE id=?").run(productId, mapId, parentId, name, kind, platform, description, noteId, status, nodeId, sortOrder, now, id);
		else this.db.prepare("INSERT INTO modules(id, product_id, map_id, parent_id, name, kind, platform, description, note_id, status, node_id, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, productId, mapId, parentId, name, kind, platform, description, noteId, status, nodeId, sortOrder, now, now);
		return toModule(this.db.prepare("SELECT * FROM modules WHERE id = ?").get(id));
	}
	/** 删模块：连带把挂在该模块上的笔记解除 moduleId 标记（笔记本身保留）。 */
	deleteModule(id) {
		if (this.db.prepare("SELECT id, note_id FROM modules WHERE id = ?").get(str(id)) === void 0) return;
		this.db.prepare("DELETE FROM modules WHERE id = ?").run(str(id));
	}
	getProductProgress(productId, kind = "modules") {
		const row = this.db.prepare("SELECT * FROM product_progress WHERE product_id = ? AND kind = ?").get(str(productId), str(kind) || "modules");
		return row === void 0 ? void 0 : toProductProgress(row);
	}
	saveProductProgress(input) {
		const productId = str(input?.productId);
		if (productId === "") throw new Error("缺少 productId");
		const kind = [
			"modules",
			"notes",
			"demo"
		].includes(str(input?.kind)) ? str(input.kind) : "modules";
		const id = `pp-${productId}-${kind}`;
		const now = isoDateTimeSeconds();
		const status = [
			"running",
			"done",
			"failed"
		].includes(str(input?.status)) ? str(input.status) : "running";
		const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0);
		const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0);
		const message = str(input?.message).slice(0, 500);
		const log = jsonList(this.db.prepare("SELECT log FROM product_progress WHERE id = ?").get(id)?.log);
		if (message !== "") log.push({
			step,
			message,
			at: now
		});
		this.db.prepare(`INSERT INTO product_progress(id, product_id, kind, demo_id, map_id, step, total, status, message, log, session_id, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET demo_id=excluded.demo_id, map_id=excluded.map_id, step=excluded.step, total=excluded.total,
        status=excluded.status, message=excluded.message, log=excluded.log, session_id=excluded.session_id, updated_at=excluded.updated_at`).run(id, productId, kind, str(input?.demoId).slice(0, 60), str(input?.mapId).slice(0, 64), step, total, status, message, JSON.stringify(log.slice(-50)), str(input?.sessionId).slice(0, 64), now);
		return toProductProgress(this.db.prepare("SELECT * FROM product_progress WHERE id = ?").get(id));
	}
	listTestProjects() {
		return this.db.prepare(`SELECT p.*,
      (SELECT COUNT(*) FROM test_cases c WHERE c.project_id = p.id) AS case_count,
      (SELECT COUNT(*) FROM test_runs r WHERE r.project_id = p.id) AS run_count
      FROM test_projects p ORDER BY p.updated_at DESC, p.id`).all().map((row) => ({
			...toTestProject(row),
			caseCount: Number(row.case_count ?? 0),
			runCount: Number(row.run_count ?? 0)
		}));
	}
	saveTestProject(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `testp-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("测试项目名称不能为空");
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		const existing = this.db.prepare("SELECT * FROM test_projects WHERE id = ?").get(id);
		let bugProjectId = str(input?.bugProjectId) || str(existing?.bug_project_id);
		if (bugProjectId === "") bugProjectId = this.saveBugProject({
			name: `测试：${name}`,
			workspacePath
		}).id;
		const fields = {
			name,
			description: input?.description !== void 0 ? str(input?.description).slice(0, 5e3) : existing?.description ?? "",
			workspacePath,
			productId: str(input?.productId),
			moduleId: str(input?.moduleId),
			platform: [
				"pc",
				"mobile",
				"tablet",
				"all"
			].includes(str(input?.platform)) ? str(input?.platform) : "all",
			bugProjectId,
			deployMode: input?.deployMode !== void 0 ? str(input?.deployMode) === "ssh" ? "ssh" : "local" : existing?.deploy_mode ?? "local",
			sshHost: input?.sshHost !== void 0 ? str(input?.sshHost) : existing?.ssh_host ?? "",
			remoteDir: input?.remoteDir !== void 0 ? str(input?.remoteDir) : existing?.remote_dir ?? "",
			image: input?.image !== void 0 ? str(input?.image) : existing?.image ?? "",
			containerName: input?.containerName !== void 0 ? str(input?.containerName) : existing?.container_name ?? "",
			hostPort: input?.hostPort !== void 0 ? str(input?.hostPort) : existing?.host_port ?? "",
			containerPort: input?.containerPort !== void 0 ? str(input?.containerPort) : existing?.container_port ?? ""
		};
		const unifiedTest = this.ensureProject(workspacePath, name);
		if (workspacePath !== "") {
			if (this.db.prepare("SELECT id FROM bug_projects WHERE project_id = ? LIMIT 1").get(unifiedTest.id) === void 0) {
				const bugId = `bugp-${randomUUID().slice(0, 12)}`;
				const ts = isoDateTimeSeconds();
				this.db.prepare("INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(bugId, name, workspacePath, basename(workspacePath), unifiedTest.id, ts, ts);
			}
		}
		if (existing) this.db.prepare(`UPDATE test_projects SET name=?, description=?, workspace_path=?, product_id=?, module_id=?, platform=?, bug_project_id=?,
        deploy_mode=?, ssh_host=?, remote_dir=?, image=?, container_name=?, host_port=?, container_port=?, project_id=?, updated_at=? WHERE id=?`).run(fields.name, fields.description, fields.workspacePath, fields.productId, fields.moduleId, fields.platform, fields.bugProjectId, fields.deployMode, fields.sshHost, fields.remoteDir, fields.image, fields.containerName, fields.hostPort, fields.containerPort, unifiedTest.id, now, id);
		else this.db.prepare(`INSERT INTO test_projects(id, name, description, workspace_path, product_id, module_id, platform, bug_project_id,
        deploy_mode, ssh_host, remote_dir, image, container_name, host_port, container_port, project_id, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, fields.name, fields.description, fields.workspacePath, fields.productId, fields.moduleId, fields.platform, fields.bugProjectId, fields.deployMode, fields.sshHost, fields.remoteDir, fields.image, fields.containerName, fields.hostPort, fields.containerPort, unifiedTest.id, existing?.created_at ?? now, now);
		return toTestProject(this.db.prepare("SELECT * FROM test_projects WHERE id = ?").get(id));
	}
	deleteTestProject(id) {
		this.db.prepare("DELETE FROM test_cases WHERE project_id = ?").run(id);
		this.db.prepare("DELETE FROM test_runs WHERE project_id = ?").run(id);
		this.db.prepare("DELETE FROM test_projects WHERE id = ?").run(id);
	}
	listTestCases(projectId) {
		return (projectId ? this.db.prepare("SELECT * FROM test_cases WHERE project_id = ? ORDER BY created_at, id").all(projectId) : this.db.prepare("SELECT * FROM test_cases ORDER BY created_at, id").all()).map(toTestCase);
	}
	saveTestCase(input) {
		const now = isoDateTimeSeconds();
		const projectId = str(input?.projectId);
		if (!this.db.prepare("SELECT id FROM test_projects WHERE id = ?").get(projectId)) throw new Error("测试项目不存在");
		const title = str(input?.title).trim().slice(0, 300);
		if (title === "") throw new Error("用例标题不能为空");
		const steps = list(input?.steps).map((x) => str(x)).filter(Boolean).slice(0, 30);
		let id = str(input?.id);
		if (id === "") id = this.db.prepare("SELECT id FROM test_cases WHERE project_id=? AND title=?").get(projectId, title)?.id ?? `tc-${randomUUID().slice(0, 12)}`;
		const existing = this.db.prepare("SELECT id, created_at FROM test_cases WHERE id = ?").get(id);
		const priority = [
			"P0",
			"P1",
			"P2",
			"P3"
		].includes(str(input?.priority)) ? str(input?.priority) : "P2";
		if (existing) this.db.prepare("UPDATE test_cases SET project_id=?, title=?, precondition=?, steps=?, expected=?, priority=?, type=?, source=?, module_id=?, platform=?, updated_at=? WHERE id=?").run(projectId, title, str(input?.precondition), JSON.stringify(steps), str(input?.expected), priority, str(input?.type) || "functional", str(input?.source) || "manual", str(input?.moduleId), [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all", now, id);
		else this.db.prepare("INSERT INTO test_cases(id, project_id, title, precondition, steps, expected, priority, type, source, module_id, platform, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, projectId, title, str(input?.precondition), JSON.stringify(steps), str(input?.expected), priority, str(input?.type) || "functional", str(input?.source) || "manual", str(input?.moduleId), [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all", existing?.created_at ?? now, now);
		const result = toTestCase(this.db.prepare("SELECT * FROM test_cases WHERE id = ?").get(id));
		writeTestCasesSnapshot(this.db.prepare("SELECT * FROM test_projects WHERE id = ?").get(projectId), this.listTestCases(projectId));
		return result;
	}
	deleteTestCase(id) {
		const row = this.db.prepare("SELECT project_id FROM test_cases WHERE id = ?").get(id);
		this.db.prepare("DELETE FROM test_cases WHERE id = ?").run(id);
		if (row?.project_id) writeTestCasesSnapshot(this.db.prepare("SELECT * FROM test_projects WHERE id = ?").get(String(row.project_id)), this.listTestCases(String(row.project_id)));
	}
	listTestRuns(projectId) {
		return (projectId ? this.db.prepare("SELECT * FROM test_runs WHERE project_id = ? ORDER BY created_at DESC").all(projectId) : this.db.prepare("SELECT * FROM test_runs ORDER BY created_at DESC").all()).map(toTestRun);
	}
	saveTestRun(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `run-${randomUUID().slice(0, 12)}`;
		const projectId = str(input?.projectId);
		if (!this.db.prepare("SELECT id FROM test_projects WHERE id = ?").get(projectId)) throw new Error("测试项目不存在");
		const results = list(input?.results);
		const status = [
			"running",
			"passed",
			"failed",
			"blocked"
		].includes(str(input?.status)) ? str(input?.status) : "running";
		const summary = input?.summary && typeof input.summary === "object" ? input.summary : {};
		const existing = this.db.prepare("SELECT id, created_at FROM test_runs WHERE id = ?").get(id);
		const finished = status === "running" ? null : str(input?.finishedAt) || now;
		if (existing) this.db.prepare("UPDATE test_runs SET project_id=?, name=?, status=?, results=?, summary=?, deploy_log=?, finished_at=? WHERE id=?").run(projectId, str(input?.name) || "测试运行", status, JSON.stringify(results), JSON.stringify(summary), str(input?.deployLog), finished, id);
		else this.db.prepare("INSERT INTO test_runs(id, project_id, name, status, results, summary, deploy_log, created_at, finished_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id, projectId, str(input?.name) || "测试运行", status, JSON.stringify(results), JSON.stringify(summary), str(input?.deployLog), existing?.created_at ?? now, finished);
		const result = toTestRun(this.db.prepare("SELECT * FROM test_runs WHERE id = ?").get(id));
		writeTestRunSnapshot(this.db.prepare("SELECT * FROM test_projects WHERE id = ?").get(projectId), result);
		return result;
	}
	deleteTestRun(id) {
		this.db.prepare("DELETE FROM test_runs WHERE id = ?").run(id);
	}
	saveTestReport(projectId, runId, html) {
		const project = this.db.prepare("SELECT * FROM test_projects WHERE id = ?").get(projectId);
		if (!project?.workspace_path) throw new Error("测试项目未关联工作区");
		const dir = join(project.workspace_path, ".dsh-workbench", "tests", projectId, "reports");
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `${sanitizeFilename(runId)}.html`);
		writeFileSync(path, html.slice(0, 5e6), "utf8");
		return path;
	}
	listBugProjects() {
		return this.db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM bugs b WHERE b.project_id = p.id) AS count
      FROM bug_projects p ORDER BY p.created_at, p.id`).all().map((row) => ({
			id: row.id,
			name: row.name,
			workspacePath: row.workspace_path ?? "",
			workspaceName: row.workspace_name ?? "",
			projectId: row.project_id ?? "",
			count: Number(row.count ?? 0),
			createdAt: row.created_at,
			updatedAt: row.updated_at
		}));
	}
	saveBugProject(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `bugp-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("项目名称不能为空");
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		const workspaceName = str(input?.workspaceName).trim() || (workspacePath === "" ? "" : basename(workspacePath));
		const existing = this.db.prepare("SELECT id, created_at FROM bug_projects WHERE id = ?").get(id);
		const unified = this.ensureProject(workspacePath, name.replace(/^测试：/, ""));
		if (existing) this.db.prepare("UPDATE bug_projects SET name=?, workspace_path=?, workspace_name=?, project_id=?, updated_at=? WHERE id=?").run(name, workspacePath, workspaceName, unified.id, now, id);
		else this.db.prepare("INSERT INTO bug_projects(id, name, workspace_path, workspace_name, project_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?)").run(id, name, workspacePath, workspaceName, unified.id, existing?.created_at ?? now, now);
		return this.listBugProjects().find((p) => p.id === id);
	}
	deleteBugProject(id) {
		this.db.prepare("DELETE FROM bugs WHERE project_id = ?").run(id);
		this.db.prepare("DELETE FROM bug_projects WHERE id = ?").run(id);
	}
	listBugs() {
		return this.db.prepare("SELECT * FROM bugs ORDER BY updated_at DESC").all().map(toBug);
	}
	saveBug(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `bug-${randomUUID().slice(0, 12)}`;
		const projectId = str(input?.projectId);
		if (!this.db.prepare("SELECT id FROM bug_projects WHERE id = ?").get(projectId)) throw new Error("请选择项目");
		const title = str(input?.title).trim().slice(0, 300);
		if (title === "") throw new Error("Bug 标题不能为空");
		const existing = this.db.prepare("SELECT * FROM bugs WHERE id = ?").get(id);
		const status = [
			"open",
			"doing",
			"verify",
			"resolved"
		].includes(str(input?.status)) ? str(input?.status) : "open";
		const severity = [
			"blocker",
			"major",
			"minor",
			"trivial"
		].includes(str(input?.severity)) ? str(input?.severity) : "minor";
		const priority = [
			"P0",
			"P1",
			"P2",
			"P3"
		].includes(str(input?.priority)) ? str(input?.priority) : "P2";
		const plannedDate = str(input?.plannedDate).trim().slice(0, 10);
		const tags = cleanTags(input?.tags);
		const verification = str(input?.verification).slice(0, 2e4);
		const aiThreadId = str(input?.aiThreadId);
		const moduleId = str(input?.moduleId);
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all";
		const assignee = str(input?.assignee).trim().slice(0, 40) || "我";
		const code = str(input?.code) || existing?.code || `BUG-${randomUUID().slice(0, 4).toUpperCase()}`;
		const resolvedAt = status === "resolved" ? existing?.resolved_at || now : null;
		if (existing) this.db.prepare(`UPDATE bugs SET project_id=?, title=?, description=?, status=?, severity=?, priority=?, planned_date=?, tags=?, verification=?, ai_thread_id=?, module_id=?, platform=?, assignee=?, updated_at=?, resolved_at=? WHERE id=?`).run(projectId, title, str(input?.description).slice(0, 5e4), status, severity, priority, plannedDate, JSON.stringify(tags), verification, aiThreadId, moduleId, platform, assignee, now, resolvedAt, id);
		else this.db.prepare(`INSERT INTO bugs(id, project_id, code, title, description, status, severity, priority, planned_date, tags, verification, ai_thread_id, module_id, platform, assignee, created_at, updated_at, resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, projectId, code, title, str(input?.description).slice(0, 5e4), status, severity, priority, plannedDate, JSON.stringify(tags), verification, aiThreadId, moduleId, platform, assignee, existing?.created_at ?? now, now, resolvedAt);
		return toBug(this.db.prepare("SELECT * FROM bugs WHERE id = ?").get(id));
	}
	updateBug(input) {
		const bug = this.db.prepare("SELECT * FROM bugs WHERE id = ?").get(str(input?.bugId));
		if (!bug) throw new Error("Bug 不存在");
		return this.saveBug({
			...toBug(bug),
			status: str(input?.status) || bug.status,
			verification: appendVerification(bug.verification, input?.verification),
			aiThreadId: str(input?.aiThreadId) || bug.ai_thread_id
		});
	}
	deleteBug(id) {
		this.db.prepare("DELETE FROM bugs WHERE id = ?").run(id);
	}
	stats() {
		const one = (sql) => Number(this.db.prepare(sql).get()?.n ?? 0);
		return {
			tasks: one("SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL"),
			spaces: one("SELECT COUNT(*) AS n FROM spaces"),
			focus: one("SELECT COUNT(*) AS n FROM focus_sessions")
		};
	}
	sqliteVersion() {
		try {
			return String(this.db.prepare("SELECT sqlite_version() AS v").get()?.v ?? "");
		} catch {
			return "";
		}
	}
};
/** JSON 降级实现：接口与 SqliteStore 一致，整份状态写文件。 */
var JsonStore = class {
	engine = "json";
	file;
	revision = 0;
	state;
	newsTopics = [];
	newsItems = [];
	notes = [];
	notebooks = [];
	notesSeeded = false;
	exportDir = "";
	bugProjects = [];
	bugs = [];
	products = [];
	productDemos = [];
	productMaps = [];
	productMapVersions = [];
	demoProgress = [];
	modules = [];
	productProgress = [];
	productInputs = [];
	unifiedProjects = [];
	themes = [];
	uiDesigns = [];
	demos = [];
	demoVersions = [];
	demoFiles = [];
	testProjects = [];
	testCases = [];
	testRuns = [];
	constructor(file) {
		this.file = file;
		mkdirSync(dirname(file), { recursive: true });
		const { readFileSync, writeFileSync, existsSync } = require("node:fs");
		if (existsSync(file)) try {
			const parsed = JSON.parse(readFileSync(file, "utf8"));
			this.state = {
				spaces: list(parsed.spaces),
				tasks: list(parsed.tasks),
				focus: list(parsed.focus),
				settings: parsed.settings ?? {}
			};
			this.newsTopics = list(parsed.newsTopics);
			this.newsItems = list(parsed.newsItems);
			this.notes = list(parsed.notes);
			this.notebooks = list(parsed.notebooks);
			this.notesSeeded = parsed.notesSeeded === true;
			this.exportDir = str(parsed.exportDir);
			this.bugProjects = list(parsed.bugProjects);
			this.bugs = list(parsed.bugs);
			this.products = list(parsed.products);
			this.productDemos = list(parsed.productDemos);
			this.productMaps = list(parsed.productMaps);
			this.productMapVersions = list(parsed.productMapVersions);
			this.productProgress = list(parsed.productProgress);
			this.productInputs = list(parsed.productInputs);
			this.unifiedProjects = list(parsed.unifiedProjects);
			this.themes = list(parsed.themes);
			this.uiDesigns = list(parsed.uiDesigns);
			this.demos = list(parsed.demos);
			this.demoVersions = list(parsed.demoVersions);
			this.demoFiles = list(parsed.demoFiles);
			this.demoProgress = list(parsed.demoProgress);
			this.modules = list(parsed.modules);
			this.testProjects = list(parsed.testProjects);
			this.testCases = list(parsed.testCases);
			this.testRuns = list(parsed.testRuns);
			this.revision = Number(parsed.revision ?? 0);
			this.backfillProductMaps();
			this.seedNotebooks();
			this.seedNotes();
		} catch {
			this.state = seedState();
			this.revision = 0;
		}
		else {
			this.state = seedState();
			this.revision = 1;
			this.seedNotes();
		}
	}
	seedNotebooks() {
		if (this.notebooks.length === 0) {
			const now = isoDateTimeSeconds();
			this.notebooks.push({
				id: "nb-default",
				name: "随手记",
				createdAt: now,
				updatedAt: now
			});
		}
		const def = this.notebooks[0].id;
		for (const note of this.notes) if (!note.notebookId) note.notebookId = def;
	}
	seedNotes() {
		this.seedNotebooks();
		if (!this.notesSeeded) {
			this.notesSeeded = true;
			if (this.notes.length === 0) this.notes.push(welcomeNote());
		}
		this.persistNews();
	}
	readState() {
		return {
			...this.state,
			revision: this.revision
		};
	}
	writeState(state) {
		const { writeFileSync } = require("node:fs");
		this.state = {
			spaces: list(state.spaces),
			tasks: list(state.tasks),
			focus: list(state.focus),
			settings: state.settings ?? {}
		};
		this.revision += 1;
		writeFileSync(this.file, JSON.stringify({
			...this.state,
			revision: this.revision,
			newsTopics: this.newsTopics,
			newsItems: this.newsItems,
			notes: this.notes,
			notebooks: this.notebooks,
			notesSeeded: this.notesSeeded,
			exportDir: this.exportDir,
			bugProjects: this.bugProjects,
			bugs: this.bugs,
			products: this.products,
			productDemos: this.productDemos,
			productMaps: this.productMaps,
			productMapVersions: this.productMapVersions,
			demoProgress: this.demoProgress,
			productProgress: this.productProgress,
			productInputs: this.productInputs,
			unifiedProjects: this.unifiedProjects,
			themes: this.themes,
			uiDesigns: this.uiDesigns,
			demos: this.demos,
			demoVersions: this.demoVersions,
			demoFiles: this.demoFiles,
			modules: this.modules,
			testProjects: this.testProjects,
			testCases: this.testCases,
			testRuns: this.testRuns
		}, null, 2));
		return this.revision;
	}
	/** 新闻：与任务快照同文件，但由独立方法读写，任务快照保存不会覆盖它。 */
	listNews() {
		return {
			topics: this.newsTopics.map((t) => ({
				...t,
				count: Number(t.count ?? 6),
				times: list(t.times),
				cronTaskIds: list(t.cronTaskIds)
			})),
			items: this.newsItems.slice().sort((x, y) => String(y.fetchedAt).localeCompare(String(x.fetchedAt))).slice(0, 400).map((i) => ({
				...i,
				aiSummary: String(i.aiSummary ?? "")
			}))
		};
	}
	saveNewsTopic(input) {
		const now = isoDateTime();
		const id = str(input?.id) || `news-${randomUUID().slice(0, 12)}`;
		const title = str(input?.title).trim();
		const query = str(input?.query).trim() || title;
		if (title === "") throw new Error("主题名称不能为空");
		const existing = this.newsTopics.find((t) => t.id === id);
		const topic = {
			id,
			title,
			query,
			scheduleKind: [
				"daily",
				"workdays",
				"weekly",
				"custom"
			].includes(str(input?.scheduleKind)) ? str(input?.scheduleKind) : "daily",
			times: cleanTimes(input?.times),
			weekday: Math.max(0, Math.min(6, Math.round(num(input?.weekday, 1)))),
			customCron: str(input?.customCron).trim(),
			scheduleText: str(input?.scheduleText) || str(input?.customCron).trim() || cleanTimes(input?.times).join(" / "),
			cronTaskIds: list(input?.cronTaskIds).map((x) => str(x)).filter(Boolean),
			enabled: input?.enabled !== false,
			count: Math.max(1, Math.min(20, Math.round(num(input?.count, 6)))),
			lastRunAt: existing?.lastRunAt ?? null,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) Object.assign(existing, topic);
		else this.newsTopics.push(topic);
		this.persistNews();
		return topic;
	}
	deleteNewsTopic(id) {
		this.newsTopics = this.newsTopics.filter((t) => t.id !== id);
		this.newsItems = this.newsItems.filter((i) => i.topicId !== id);
		this.persistNews();
	}
	publishNews(topicId, rawItems) {
		const topic = this.newsTopics.find((t) => t.id === topicId);
		if (!topic) return {
			ok: false,
			inserted: 0,
			skipped: 0,
			error: `未知订阅：${topicId}`
		};
		const now = isoDateTimeSeconds();
		const rows = cleanNewsItems(rawItems);
		let inserted = 0;
		let skipped = 0;
		for (const item of rows) {
			if (this.newsItems.some((i) => i.topicId === topicId && i.hash === item.hash)) {
				skipped += 1;
				continue;
			}
			this.newsItems.push({
				id: `ni-${randomUUID().slice(0, 16)}`,
				topicId,
				title: item.title,
				url: item.url,
				source: item.source,
				publishedAt: item.publishedAt,
				summary: item.summary,
				aiSummary: item.aiSummary,
				fetchedAt: now,
				hash: item.hash
			});
			inserted += 1;
		}
		topic.lastRunAt = now;
		topic.updatedAt = now;
		const own = this.newsItems.filter((i) => i.topicId === topicId).sort((x, y) => String(y.fetchedAt).localeCompare(String(x.fetchedAt)));
		const keep = new Set(own.slice(0, 200).map((i) => i.id));
		this.newsItems = this.newsItems.filter((i) => i.topicId !== topicId || keep.has(i.id));
		this.persistNews();
		return {
			ok: true,
			inserted,
			skipped
		};
	}
	persistNews() {
		const { writeFileSync } = require("node:fs");
		writeFileSync(this.file, JSON.stringify({
			...this.state,
			revision: this.revision,
			newsTopics: this.newsTopics,
			newsItems: this.newsItems,
			notes: this.notes,
			notebooks: this.notebooks,
			notesSeeded: this.notesSeeded,
			exportDir: this.exportDir,
			bugProjects: this.bugProjects,
			bugs: this.bugs,
			products: this.products,
			productDemos: this.productDemos,
			productMaps: this.productMaps,
			productMapVersions: this.productMapVersions,
			demoProgress: this.demoProgress,
			productProgress: this.productProgress,
			productInputs: this.productInputs,
			unifiedProjects: this.unifiedProjects,
			themes: this.themes,
			uiDesigns: this.uiDesigns,
			demos: this.demos,
			demoVersions: this.demoVersions,
			demoFiles: this.demoFiles,
			modules: this.modules,
			testProjects: this.testProjects,
			testCases: this.testCases,
			testRuns: this.testRuns
		}, null, 2));
	}
	/** 记事本（JSON 降级）。 */
	listNotes() {
		return this.notes.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
	}
	listNotebooks() {
		return this.notebooks.map((nb) => ({
			...nb,
			count: this.notes.filter((n) => n.notebookId === nb.id).length
		}));
	}
	saveNotebook(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `nb-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 80);
		const workspacePath = str(input?.workspacePath).trim();
		if (name === "") throw new Error("笔记本名称不能为空");
		const existing = this.notebooks.find((n) => n.id === id);
		if (existing) {
			existing.name = name;
			existing.workspacePath = workspacePath;
			existing.updatedAt = now;
		} else this.notebooks.push({
			id,
			name,
			workspacePath,
			createdAt: now,
			updatedAt: now
		});
		this.persistNews();
		return {
			...existing ?? this.notebooks[this.notebooks.length - 1],
			count: this.notes.filter((n) => n.notebookId === id).length
		};
	}
	deleteNotebook(id) {
		if (!this.notebooks.find((n) => n.id === id)) throw new Error("笔记本不存在");
		const other = this.notebooks.find((n) => n.id !== id);
		if (!other) throw new Error("至少保留一个笔记本");
		let moved = 0;
		for (const note of this.notes) if (note.notebookId === id) {
			note.notebookId = other.id;
			moved += 1;
		}
		this.notebooks = this.notebooks.filter((n) => n.id !== id);
		this.persistNews();
		return {
			ok: true,
			moved,
			notebookId: other.id
		};
	}
	saveNote(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `note-${randomUUID().slice(0, 12)}`;
		const title = str(input?.title).trim().slice(0, 200) || "未命名笔记";
		const content = str(input?.content).slice(0, 5e5);
		const tags = cleanTags(input?.tags);
		const pinned = input?.pinned === true;
		const wanted = str(input?.notebookId);
		const notebookId = this.notebooks.some((n) => n.id === wanted) ? wanted : this.notebooks[0]?.id ?? "nb-default";
		const nb = this.notebooks.find((n) => n.id === notebookId);
		const existing = this.notes.find((n) => n.id === id);
		let filePath = "";
		try {
			filePath = syncNoteFile({
				id,
				title,
				content
			}, nb);
		} catch (cause) {
			console.warn(`[dsh-workbench] 笔记文件写入失败：${String(cause)}`);
		}
		const note = {
			id,
			notebookId,
			title,
			content,
			tags,
			pinned,
			filePath,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) {
			if (existing.filePath && existing.filePath !== filePath) removeFile(existing.filePath);
			Object.assign(existing, note);
		} else this.notes.push(note);
		this.persistNews();
		return note;
	}
	deleteNote(id) {
		const note = this.notes.find((n) => n.id === id);
		if (note?.filePath) removeFile(note.filePath);
		this.notes = this.notes.filter((n) => n.id !== id);
		this.persistNews();
	}
	getExportConfig() {
		return {
			exportDir: this.exportDir || homedir(),
			defaultExportDir: homedir()
		};
	}
	setExportDir(raw) {
		this.exportDir = normalizeExportDir(raw);
		this.persistNews();
		return this.getExportConfig();
	}
	listProducts(includeArchived = false) {
		return this.products.filter((p) => includeArchived || !p.archivedAt).slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
	}
	saveProduct(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `prod-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("产品名称不能为空");
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		const existing = this.products.find((p) => p.id === id);
		let notebookId = str(input?.notebookId) || existing?.notebookId || "";
		if (notebookId === "") notebookId = this.saveNotebook({
			name: `产品：${name}`,
			workspacePath
		}).id;
		else this.saveNotebook({
			id: notebookId,
			name: `产品：${name}`,
			workspacePath
		});
		let mindmap = typeof input?.mindmap === "string" ? input.mindmap : existing?.mindmap ?? "{\"nodes\":[]}";
		try {
			const parsed = JSON.parse(mindmap);
			if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
				parsed.nodes = [{
					id: "root",
					label: name,
					type: "root",
					parentId: null,
					note: ""
				}];
				mindmap = JSON.stringify(parsed);
			}
		} catch {
			mindmap = JSON.stringify({ nodes: [{
				id: "root",
				label: name,
				type: "root",
				parentId: null,
				note: ""
			}] });
		}
		const product = {
			id,
			name,
			description: input?.description !== void 0 ? str(input?.description).slice(0, 5e3) : existing?.description ?? "",
			workspacePath,
			notebookId,
			mindmap,
			styles: Array.isArray(input?.styles) ? input.styles : existing?.styles ?? [],
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) Object.assign(existing, product);
		else this.products.push(product);
		this.persistNews();
		this.writeProductMindmapFile(product);
		if (this.listProductMaps(product.id).length === 0) this.saveProductMap({
			productId: product.id,
			name: "主导图",
			description: "",
			graph: productGraphFromV1(product.mindmap, name).graph
		});
		return product;
	}
	writeProductMindmapFile(product) {
		if (!product?.workspacePath) return;
		try {
			const dir = join(product.workspacePath, ".dsh-workbench", "products", product.id);
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, "mindmap.json"), String(product.mindmap ?? "{\"nodes\":[]}"), "utf8");
		} catch (cause) {
			console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`);
		}
	}
	/** 旧 JSON 数据升级：每个产品的 mindmap 迁成「主导图」，artefact 回填 mapId；导图补 v2 图与版本。 */
	backfillProductMaps() {
		const now = isoDateTimeSeconds();
		for (const product of this.products) {
			let first = this.productMaps.find((m) => m.productId === product.id);
			if (first === void 0) {
				first = {
					id: `map-${randomUUID().slice(0, 12)}`,
					productId: product.id,
					name: "主导图",
					description: "",
					mindmap: String(product.mindmap ?? "{\"nodes\":[]}"),
					sortOrder: 0,
					createdAt: product.createdAt ?? now,
					updatedAt: now
				};
				this.productMaps.push(first);
			}
			for (const item of [...this.modules, ...this.productDemos]) if (item.productId === product.id && !item.mapId) item.mapId = first.id;
		}
		for (const map of this.productMaps) {
			if (map.graph === void 0 || map.graph === null) {
				const { graph } = productGraphFromV1(map.mindmap ?? "{\"nodes\":[]}", map.name ?? "产品");
				map.graph = graph;
				map.mindmap = productGraphToV1(graph);
				map.graphRev = Number(map.graphRev ?? 0);
				map.currentVersionId = str(map.currentVersionId);
				map.source = str(map.source) || "manual";
				map.sourceRef = str(map.sourceRef);
				map.summary = str(map.summary);
				map.updatedAt = map.updatedAt ?? now;
			}
			if (!this.productMapVersions.some((v) => v.mapId === map.id)) {
				const version = {
					id: `mv-${randomUUID().slice(0, 12)}`,
					mapId: map.id,
					seq: 1,
					label: "v1 迁移",
					source: "migration",
					sourceRef: "",
					summary: "从 v1 导图迁移",
					graph: map.graph,
					nodeCount: map.graph.nodes.length,
					edgeCount: map.graph.edges.length,
					createdAt: now
				};
				this.productMapVersions.push(version);
				if (!map.currentVersionId) map.currentVersionId = version.id;
			}
		}
	}
	/** JSON 存储的导图图：对象直接挂 graph 字段（v2），缺失时从 v1 兜底转换。 */
	jsonMapGraph(map) {
		if (map?.graph !== void 0 && map?.graph !== null && Array.isArray(map.graph.nodes)) return map.graph;
		return productGraphFromV1(map?.mindmap ?? "{\"nodes\":[]}", map?.name ?? "产品").graph;
	}
	pruneExternalRefsJson(productId, graph) {
		const ids = new Set(this.productMaps.filter((m) => m.productId === productId).map((m) => String(m.id)));
		const edges = graph.edges.filter((edge) => {
			if (edge.kind !== "relate") return true;
			const ref = parseExternalRef(String(edge.to));
			if (ref === null) return true;
			if (!ids.has(ref.mapId)) {
				console.warn(`[dsh-workbench] 跨图引用目标不存在，已丢弃：${edge.to}`);
				return false;
			}
			return true;
		});
		return edges.length === graph.edges.length ? graph : {
			...graph,
			edges
		};
	}
	/** 入向跨图引用清理：本图删掉节点后，其他导图指向 <mapId>:<nodeId> 的引用一并移除。 */
	cleanInboundRefsJson(productId, mapId, graph) {
		const alive = new Set(graph.nodes.map((n) => n.id));
		for (const other of this.productMaps.filter((m) => m.productId === productId && m.id !== mapId)) {
			const g = this.jsonMapGraph(other);
			const edges = g.edges.filter((e) => !(e.kind === "relate" && String(e.to).startsWith(`${mapId}:`) && !alive.has(String(e.to).slice(mapId.length + 1))));
			if (edges.length !== g.edges.length) {
				other.graph = {
					...g,
					edges
				};
				other.mindmap = productGraphToV1(other.graph);
				other.graphRev = Number(other.graphRev ?? 0) + 1;
				this.writeProductMapFile(other);
			}
		}
	}
	listProductMaps(productId) {
		return this.productMaps.filter((m) => m.productId === productId).sort((a, b) => a.sortOrder - b.sortOrder);
	}
	getProductMap(mapId) {
		return this.productMaps.find((m) => m.id === mapId);
	}
	defaultMapId(productId) {
		return this.listProductMaps(productId)[0]?.id ?? "";
	}
	saveProductMap(input) {
		const productId = str(input?.productId);
		if (!this.products.some((p) => p.id === productId)) throw new Error("产品不存在");
		const now = isoDateTimeSeconds();
		const name = str(input?.name).trim().slice(0, 80) || "未命名导图";
		const description = str(input?.description).slice(0, 2e3);
		let id = str(input?.id);
		let map = id === "" ? void 0 : this.productMaps.find((m) => m.id === id);
		const normalized = normalizeProductGraph(input?.graph ?? (typeof input?.mindmap === "string" ? productGraphFromV1(input.mindmap, name).graph : void 0) ?? (map !== void 0 ? this.jsonMapGraph(map) : productGraphFromV1(normalizeMindmap(void 0, name), name).graph), { title: name });
		const graph = this.pruneExternalRefsJson(productId, normalized.graph);
		if (map === void 0) {
			id = `map-${randomUUID().slice(0, 12)}`;
			map = {
				id,
				productId,
				name,
				description,
				mindmap: productGraphToV1(graph),
				graph,
				graphRev: 0,
				currentVersionId: "",
				source: str(input?.source) || "manual",
				sourceRef: str(input?.sourceRef),
				summary: str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary),
				sortOrder: this.listProductMaps(productId).length,
				createdAt: now,
				updatedAt: now
			};
			this.productMaps.push(map);
		} else {
			map.name = name;
			map.description = description;
			map.graph = graph;
			map.mindmap = productGraphToV1(graph);
			map.source = str(input?.source) || str(map.source) || "manual";
			map.sourceRef = str(input?.sourceRef) || str(map.sourceRef) || "";
			map.summary = str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary) || str(map.summary) || "";
			map.updatedAt = now;
		}
		this.syncFirstMapMirror(productId);
		this.writeProductMapFile(map);
		this.cleanInboundRefsJson(map.productId, map.id, map.graph);
		this.persistNews();
		return map;
	}
	saveMapDraft(input) {
		const map = this.productMaps.find((m) => m.id === str(input?.mapId));
		if (!map) throw new Error("导图不存在");
		const current = Number(map.graphRev ?? 0);
		if (input?.rev !== void 0 && Number(input.rev) !== current) {
			const error = /* @__PURE__ */ new Error("draft_conflict");
			error.code = "draft_conflict";
			error.current = map;
			throw error;
		}
		const normalized = normalizeProductGraph(input?.graph, { title: map.name });
		const graph = this.pruneExternalRefsJson(map.productId, normalized.graph);
		map.graph = graph;
		map.mindmap = productGraphToV1(graph);
		map.graphRev = current + 1;
		map.updatedAt = isoDateTimeSeconds();
		this.syncFirstMapMirror(map.productId);
		this.writeProductMapFile(map);
		this.cleanInboundRefsJson(map.productId, map.id, map.graph);
		this.persistNews();
		return {
			rev: map.graphRev,
			map
		};
	}
	listMapVersions(mapId) {
		return this.productMapVersions.filter((v) => v.mapId === mapId).sort((a, b) => b.seq - a.seq);
	}
	getMapVersion(id) {
		return this.productMapVersions.find((v) => v.id === id);
	}
	createMapVersion(input) {
		const map = this.productMaps.find((m) => m.id === str(input?.mapId));
		if (!map) throw new Error("导图不存在");
		const mine = this.productMapVersions.filter((v) => v.mapId === map.id);
		if (mine.length >= PRODUCT_GRAPH_LIMITS.versions) throw new Error(`每个导图最多 ${PRODUCT_GRAPH_LIMITS.versions} 个版本，请先删除旧版本`);
		const normalized = normalizeProductGraph(input?.graph ?? this.jsonMapGraph(map), { title: map.name });
		const graph = this.pruneExternalRefsJson(map.productId, normalized.graph);
		const seq = Math.max(0, ...mine.map((v) => Number(v.seq ?? 0))) + 1;
		const version = {
			id: `mv-${randomUUID().slice(0, 12)}`,
			mapId: map.id,
			seq,
			label: str(input?.label).slice(0, PRODUCT_GRAPH_LIMITS.labelLong) || `v${seq}`,
			source: [
				"manual",
				"outline",
				"idea",
				"ai",
				"rollback",
				"migration"
			].includes(str(input?.source)) ? str(input?.source) : "manual",
			sourceRef: str(input?.sourceRef).slice(0, 120),
			summary: str(input?.summary).slice(0, PRODUCT_GRAPH_LIMITS.summary),
			graph,
			nodeCount: graph.nodes.length,
			edgeCount: graph.edges.length,
			createdAt: isoDateTimeSeconds()
		};
		this.productMapVersions.push(version);
		map.graph = graph;
		map.mindmap = productGraphToV1(graph);
		map.graphRev = Number(map.graphRev ?? 0) + 1;
		map.currentVersionId = version.id;
		map.updatedAt = version.createdAt;
		this.syncFirstMapMirror(map.productId);
		this.writeProductMapFile(map);
		this.cleanInboundRefsJson(map.productId, map.id, map.graph);
		this.persistNews();
		return version;
	}
	deleteMapVersion(id) {
		const version = this.productMapVersions.find((v) => v.id === id);
		if (!version) return;
		if (this.productMapVersions.filter((v) => v.mapId === version.mapId).length <= 1) throw new Error("至少保留一个版本");
		this.productMapVersions = this.productMapVersions.filter((v) => v.id !== id);
		const map = this.productMaps.find((m) => m.id === version.mapId);
		if (map?.currentVersionId === id) map.currentVersionId = this.productMapVersions.filter((v) => v.mapId === version.mapId).sort((a, b) => b.seq - a.seq)[0]?.id ?? "";
		this.persistNews();
	}
	rollbackMapVersion(mapId, versionId) {
		const version = this.getMapVersion(versionId);
		if (!version || version.mapId !== mapId) throw new Error("版本不存在");
		return this.createMapVersion({
			mapId,
			graph: version.graph,
			source: "rollback",
			label: `回滚到 v${version.seq}`,
			summary: `从 v${version.seq} 恢复`
		});
	}
	writeProductMapFile(map) {
		try {
			const workspace = str(this.products.find((p) => p.id === map.productId)?.workspacePath).trim();
			if (workspace === "") return;
			const dir = join(workspace, ".dsh-workbench", "products", map.productId, "maps");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, `${map.id}.json`), JSON.stringify(this.jsonMapGraph(map)), "utf8");
		} catch (cause) {
			console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`);
		}
	}
	deleteProductMap(mapId) {
		const map = this.productMaps.find((m) => m.id === mapId);
		if (!map) return;
		if (this.listProductMaps(map.productId).length <= 1) throw new Error("至少保留一张导图");
		this.productMaps = this.productMaps.filter((m) => m.id !== mapId);
		this.productMapVersions = this.productMapVersions.filter((v) => v.mapId !== mapId);
		for (const item of [
			...this.modules,
			...this.productDemos,
			...this.notes
		]) if (item.mapId === mapId) item.mapId = "";
		for (const other of this.productMaps.filter((m) => m.productId === map.productId)) {
			const graph = this.jsonMapGraph(other);
			const edges = graph.edges.filter((e) => !(e.kind === "relate" && String(e.to).startsWith(`${mapId}:`)));
			if (edges.length !== graph.edges.length) {
				other.graph = {
					...graph,
					edges
				};
				other.mindmap = productGraphToV1(other.graph);
				other.graphRev = Number(other.graphRev ?? 0) + 1;
				this.writeProductMapFile(other);
			}
		}
		this.syncFirstMapMirror(map.productId);
		this.persistNews();
	}
	syncFirstMapMirror(productId) {
		const product = this.products.find((p) => p.id === productId);
		const first = this.listProductMaps(productId)[0];
		if (product && first) product.mindmap = first.mindmap;
	}
	saveProductMindmap(productId, mindmap) {
		const product = this.products.find((p) => p.id === productId);
		if (!product) throw new Error("产品不存在");
		const map = this.listProductMaps(productId)[0];
		if (map !== void 0) this.saveProductMap({
			id: map.id,
			productId,
			name: map.name,
			description: map.description,
			graph: productGraphFromV1(mindmap, product.name).graph
		});
		else {
			product.mindmap = mindmap;
			product.updatedAt = isoDateTimeSeconds();
			this.persistNews();
		}
		this.writeProductMindmapFile(product);
		return product;
	}
	deleteProduct(id) {
		const product = this.products.find((p) => p.id === id);
		if (product?.workspacePath) try {
			rmSync(join(product.workspacePath, ".dsh-workbench", "products", id), {
				recursive: true,
				force: true
			});
		} catch {}
		this.productDemos = this.productDemos.filter((d) => d.productId !== id);
		const doomedMaps = new Set(this.productMaps.filter((m) => m.productId === id).map((m) => m.id));
		this.productMapVersions = this.productMapVersions.filter((v) => !doomedMaps.has(v.mapId));
		this.productMaps = this.productMaps.filter((m) => m.productId !== id);
		this.demoProgress = this.demoProgress.filter((p) => p.productId !== id);
		this.products = this.products.filter((p) => p.id !== id);
		this.persistNews();
	}
	listProductDemos(productId, mapId) {
		if (productId && mapId && mapId !== "all") return this.productDemos.filter((d) => d.productId === productId && d.mapId === mapId);
		return this.productDemos.filter((d) => productId === void 0 || d.productId === productId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
	}
	getProductDemo(id) {
		return this.productDemos.find((d) => d.id === id);
	}
	saveProductDemo(input) {
		const product = this.products.find((p) => p.id === str(input?.productId));
		if (!product) throw new Error("产品不存在");
		const mapId = str(input?.mapId) || this.defaultMapId(product.id);
		if (!product.workspacePath) throw new Error("产品未关联工作区");
		const style = str(input?.style).replace(/[^a-z0-9-]/gi, "").slice(0, 24) || "clean";
		const scope = str(input?.scope) === "feature" ? "feature" : "all";
		const featureId = scope === "feature" ? str(input?.featureId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) : "";
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all";
		const kind = str(input?.kind) === "system" ? "system" : "page";
		const html = str(input?.html);
		if (html.trim() === "") throw new Error("Demo HTML 为空");
		const id = `demo-${randomUUID().slice(0, 12)}`;
		const dir = join(product.workspacePath, ".dsh-workbench", "products", product.id, "demo", style);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `${scope === "feature" ? featureId : "all"}-${id.slice(-6)}.html`);
		writeFileSync(path, html.slice(0, 2e6), "utf8");
		const demo = {
			id,
			productId: product.id,
			mapId,
			style,
			scope,
			featureId,
			title: str(input?.title) || `${product.name} · ${style} · ${scope}`,
			filePath: path,
			createdAt: isoDateTimeSeconds(),
			platform,
			kind,
			status: "ready"
		};
		this.productDemos.push(demo);
		this.persistNews();
		return demo;
	}
	getDemoProgress(productId) {
		return this.demoProgress.find((p) => p.productId === str(productId));
	}
	saveDemoProgress(input) {
		const productId = str(input?.productId);
		if (productId === "") throw new Error("缺少 productId");
		const now = isoDateTimeSeconds();
		const status = [
			"running",
			"done",
			"failed"
		].includes(str(input?.status)) ? str(input?.status) : "running";
		const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0);
		const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0);
		const message = str(input?.message).slice(0, 500);
		const existing = this.demoProgress.find((p) => p.productId === productId);
		const log = list(existing?.log);
		if (message !== "") log.push({
			step,
			message,
			at: now
		});
		const record = {
			id: existing?.id ?? `dp-${productId}`,
			productId,
			demoId: str(input?.demoId).slice(0, 60),
			step,
			total,
			status,
			message,
			log: log.slice(-50),
			updatedAt: now
		};
		if (existing) Object.assign(existing, record);
		else this.demoProgress.push(record);
		this.persistNews();
		return record;
	}
	deleteProductDemo(id) {
		const demo = this.productDemos.find((d) => d.id === id);
		if (demo?.filePath) try {
			rmSync(str(demo.filePath), { force: true });
		} catch {}
		this.productDemos = this.productDemos.filter((d) => d.id !== id);
		this.persistNews();
	}
	publishProductNote(input) {
		const product = this.products.find((p) => p.id === str(input?.productId));
		if (!product) throw new Error("产品不存在");
		const featureId = str(input?.featureId);
		const tags = cleanTags([
			...list(input?.tags),
			"产品",
			product.name,
			...featureId ? [featureId] : [],
			...str(input?.moduleId) ? [str(input.moduleId)] : [],
			...str(input?.platform) ? [`platform:${str(input.platform)}`] : []
		]);
		const note = this.saveNote({
			notebookId: product.notebookId,
			title: str(input?.title) || "产品设计笔记",
			content: str(input?.content),
			tags
		});
		const module = this.modules.find((m) => m.id === str(input?.moduleId) && m.productId === product.id);
		if (module) {
			module.noteId = note.id;
			module.status = "designed";
			module.updatedAt = isoDateTimeSeconds();
			this.persistNews();
		}
		return note;
	}
	listModules(productId, mapId, includeArchived = false) {
		const keep = (m) => includeArchived || !m.archivedAt;
		if (productId && mapId && mapId !== "all") return this.modules.filter((m) => keep(m) && m.productId === productId && m.mapId === mapId);
		return this.modules.filter((m) => keep(m) && (productId === void 0 || m.productId === productId));
	}
	saveModule(input) {
		const now = isoDateTimeSeconds();
		const productId = str(input?.productId);
		if (!this.products.some((p) => p.id === productId)) throw new Error("产品不存在");
		const name = str(input?.name).trim().slice(0, 120);
		if (name === "") throw new Error("模块名称不能为空");
		const kind = [
			"module",
			"business",
			"feature",
			"requirement"
		].includes(str(input?.kind)) ? str(input?.kind) : "module";
		const platform = [
			"pc",
			"mobile",
			"tablet",
			"all"
		].includes(str(input?.platform)) ? str(input?.platform) : "all";
		const mapId = str(input?.mapId) || this.defaultMapId(productId);
		let id = str(input?.id);
		if (id === "") id = this.modules.find((m) => m.productId === productId && m.mapId === mapId && m.name === name && m.kind === kind)?.id ?? `mod-${randomUUID().slice(0, 12)}`;
		const existing = this.modules.find((m) => m.id === id);
		const module = {
			id,
			productId,
			mapId,
			parentId: input?.parentId !== void 0 ? str(input.parentId) : str(existing?.parentId),
			name,
			kind,
			platform,
			description: input?.description !== void 0 ? str(input.description).slice(0, 8e3) : str(existing?.description),
			noteId: input?.noteId !== void 0 ? str(input.noteId) : str(existing?.noteId),
			status: input?.status !== void 0 ? str(input.status).slice(0, 24) : str(existing?.status) || "designing",
			nodeId: input?.nodeId !== void 0 ? str(input.nodeId) : str(existing?.nodeId),
			sortOrder: input?.sortOrder !== void 0 ? Math.max(0, Math.round(Number(input.sortOrder) || 0)) : Number(existing?.sortOrder ?? 0),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) Object.assign(existing, module);
		else this.modules.push(module);
		this.persistNews();
		return this.modules.find((m) => m.id === id) ?? module;
	}
	deleteModule(id) {
		this.modules = this.modules.filter((m) => m.id !== str(id));
		this.persistNews();
	}
	listProjects(includeArchived = false) {
		return (this.unifiedProjects ?? []).filter((p) => includeArchived || !p.archivedAt).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
	}
	getProject(id) {
		return (this.unifiedProjects ?? []).find((p) => p.id === str(id));
	}
	ensureProject(workspacePath, name) {
		const ws = str(workspacePath).trim();
		const existing = ws !== "" ? (this.unifiedProjects ?? []).find((p) => p.workspacePath === ws) : (this.unifiedProjects ?? []).find((p) => p.workspacePath === "" && p.name === str(name).slice(0, 100));
		if (existing !== void 0) return existing;
		const now = isoDateTimeSeconds();
		const project = {
			id: `prj-${randomUUID().slice(0, 12)}`,
			name: str(name).slice(0, 100) || "未命名项目",
			description: "",
			workspacePath: ws,
			workspaceName: ws === "" ? "" : basename(ws),
			archivedAt: "",
			sortOrder: 0,
			createdAt: now,
			updatedAt: now
		};
		this.unifiedProjects = this.unifiedProjects ?? [];
		this.unifiedProjects.push(project);
		this.persistNews();
		return project;
	}
	saveProject(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id);
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("项目名称不能为空");
		this.unifiedProjects = this.unifiedProjects ?? [];
		const existing = id !== "" ? this.unifiedProjects.find((p) => p.id === id) : void 0;
		if (existing !== void 0) {
			Object.assign(existing, {
				name,
				description: str(input?.description).slice(0, 5e3),
				workspacePath: str(input?.workspacePath),
				workspaceName: basename(str(input?.workspacePath)),
				updatedAt: now
			});
			this.persistNews();
			return existing;
		}
		const project = {
			id: id || `prj-${randomUUID().slice(0, 12)}`,
			name,
			description: str(input?.description).slice(0, 5e3),
			workspacePath: str(input?.workspacePath),
			workspaceName: basename(str(input?.workspacePath)),
			archivedAt: "",
			sortOrder: 0,
			createdAt: now,
			updatedAt: now
		};
		this.unifiedProjects.push(project);
		this.persistNews();
		return project;
	}
	deleteProject(id) {
		this.unifiedProjects = (this.unifiedProjects ?? []).filter((p) => p.id !== str(id));
		for (const item of [
			...this.products,
			...this.bugProjects,
			...this.testProjects
		]) if (item.projectId === str(id)) item.projectId = "";
		this.persistNews();
	}
	listProjectOverviews(includeArchived = false) {
		return this.listProjects(includeArchived).map((project) => {
			const products = this.products.filter((p) => p.projectId === project.id);
			const bugProjects = this.bugProjects.filter((p) => p.projectId === project.id);
			const testProjects = this.testProjects.filter((p) => p.projectId === project.id);
			const bugs = this.bugs.filter((b) => bugProjects.some((p) => p.id === b.projectId));
			return {
				project,
				products,
				bugProjects,
				testProjects,
				counts: {
					products: products.length,
					bugProjects: bugProjects.length,
					testProjects: testProjects.length,
					bugs: bugs.length
				}
			};
		});
	}
	listProductInputs(productId, mapId = "") {
		const map = str(mapId);
		return this.productInputs.filter((i) => i.productId === str(productId) && (map === "" || map === "all" || i.mapId === "" || i.mapId === map));
	}
	addProductInput(input) {
		const productId = str(input?.productId);
		if (!this.products.some((p) => p.id === productId)) throw new Error("产品不存在");
		const kind = [
			"url",
			"image",
			"text"
		].includes(str(input?.kind)) ? str(input.kind) : "url";
		const url = str(input?.url).slice(0, 1e3);
		if (kind === "url" && !/^https?:\/\//i.test(url)) throw new Error("链接必须以 http(s):// 开头");
		if (kind === "image" && str(input?.filePath) === "") throw new Error("截图缺少文件路径");
		const item = {
			id: `pin-${randomUUID().slice(0, 12)}`,
			productId,
			mapId: str(input?.mapId),
			kind,
			url,
			filePath: str(input?.filePath),
			note: str(input?.note).slice(0, 2e3),
			label: str(input?.label).slice(0, 120),
			mime: str(input?.mime).slice(0, 60),
			width: Math.max(0, Math.round(Number(input?.width) || 0)),
			height: Math.max(0, Math.round(Number(input?.height) || 0)),
			size: Math.max(0, Math.round(Number(input?.size) || 0)),
			createdAt: isoDateTimeSeconds()
		};
		this.productInputs.push(item);
		this.persistNews();
		return item;
	}
	deleteProductInput(id) {
		const row = this.productInputs.find((i) => i.id === str(id));
		if (row?.filePath) removeFile(String(row.filePath));
		this.productInputs = this.productInputs.filter((i) => i.id !== str(id));
		this.persistNews();
	}
	addMapNode(input) {
		const productId = str(input?.productId);
		const mapId = str(input?.mapId);
		const map = this.productMaps.find((m) => m.id === mapId && m.productId === productId);
		if (map === void 0) throw new Error("导图不存在或不属于该产品");
		const name = str(input?.name).trim().slice(0, 24);
		if (name === "") throw new Error("节点名称不能为空");
		const kind = [
			"module",
			"business",
			"feature",
			"requirement"
		].includes(str(input?.kind)) ? str(input.kind) : "feature";
		const parentId = str(input?.parentId);
		const graph = this.jsonMapGraph(map);
		if (graph.nodes.find((n) => n.label === name && n.kind === kind && (parentId === "" ? n.parentId === null || n.parentId === graph.rootId : n.parentId === parentId)) !== void 0) return this.saveMapDraft({
			mapId,
			graph: this.jsonMapGraph(map)
		}).map;
		graph.nodes.push({
			id: `pn-${randomUUID().slice(2, 8)}`,
			label: name,
			kind,
			parentId: parentId === "" ? graph.rootId : parentId,
			status: "kept"
		});
		return this.saveMapDraft({
			mapId,
			graph
		}).map;
	}
	/** 设计文档清单（JSON 兜底实现，语义与 SqliteStore 一致）。 */
	listDesignDocs(productId) {
		const product = this.products.find((p) => p.id === str(productId));
		const map = {
			module_design: [],
			product_design: [],
			feature_design: []
		};
		if (product === void 0) return map;
		for (const note of this.notes) {
			if (note.notebookId !== product.notebookId) continue;
			const bucket = map[note.kind];
			if (bucket !== void 0) bucket.push(note);
		}
		return map;
	}
	setArchived(target, id, archived) {
		const found = (target === "products" ? this.products : target === "modules" ? this.modules : this.notes).find((x) => x.id === str(id));
		if (found === void 0) throw new Error("目标不存在");
		found.archivedAt = archived ? isoDateTimeSeconds() : "";
		found.updatedAt = isoDateTimeSeconds();
		this.persistNews();
	}
	getProductProgress(productId, kind = "modules") {
		return this.productProgress.find((p) => p.productId === str(productId) && p.kind === (str(kind) || "modules")) ?? void 0;
	}
	saveProductProgress(input) {
		const productId = str(input?.productId);
		if (productId === "") throw new Error("缺少 productId");
		const kind = [
			"modules",
			"notes",
			"demo"
		].includes(str(input?.kind)) ? str(input.kind) : "modules";
		const id = `pp-${productId}-${kind}`;
		const now = isoDateTimeSeconds();
		const status = [
			"running",
			"done",
			"failed"
		].includes(str(input?.status)) ? str(input.status) : "running";
		const step = Math.max(0, Math.round(Number(input?.step ?? 0)) || 0);
		const total = Math.max(0, Math.round(Number(input?.total ?? 0)) || 0);
		const message = str(input?.message).slice(0, 500);
		const existing = this.productProgress.find((p) => p.id === id);
		const log = Array.isArray(existing?.log) ? existing.log.slice() : [];
		if (message !== "") log.push({
			step,
			message,
			at: now
		});
		const progress = {
			id,
			productId,
			kind,
			demoId: str(input?.demoId).slice(0, 60),
			mapId: str(input?.mapId).slice(0, 64),
			step,
			total,
			status,
			message,
			log: log.slice(-50),
			sessionId: str(input?.sessionId).slice(0, 64),
			updatedAt: now
		};
		if (existing) Object.assign(existing, progress);
		else this.productProgress.push(progress);
		this.persistNews();
		return progress;
	}
	listTestProjects() {
		return this.testProjects.map((p) => ({
			...p,
			caseCount: this.testCases.filter((c) => c.projectId === p.id).length,
			runCount: this.testRuns.filter((r) => r.projectId === p.id).length
		}));
	}
	saveTestProject(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `testp-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("测试项目名称不能为空");
		const existing = this.testProjects.find((p) => p.id === id);
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		let bugProjectId = str(input?.bugProjectId) || existing?.bugProjectId || "";
		if (bugProjectId === "") bugProjectId = this.saveBugProject({
			name: `测试：${name}`,
			workspacePath
		}).id;
		const project = {
			id,
			name,
			description: str(input?.description).slice(0, 5e3),
			workspacePath,
			productId: str(input?.productId),
			moduleId: str(input?.moduleId),
			platform: [
				"pc",
				"mobile",
				"tablet",
				"all"
			].includes(str(input?.platform)) ? str(input?.platform) : "all",
			bugProjectId,
			deployMode: input?.deployMode !== void 0 ? str(input?.deployMode) === "ssh" ? "ssh" : "local" : existing?.deployMode ?? "local",
			sshHost: input?.sshHost !== void 0 ? str(input?.sshHost) : existing?.sshHost ?? "",
			remoteDir: input?.remoteDir !== void 0 ? str(input?.remoteDir) : existing?.remoteDir ?? "",
			image: input?.image !== void 0 ? str(input?.image) : existing?.image ?? "",
			containerName: input?.containerName !== void 0 ? str(input?.containerName) : existing?.containerName ?? "",
			hostPort: input?.hostPort !== void 0 ? str(input?.hostPort) : existing?.hostPort ?? "",
			containerPort: input?.containerPort !== void 0 ? str(input?.containerPort) : existing?.containerPort ?? "",
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) Object.assign(existing, project);
		else this.testProjects.push(project);
		this.persistNews();
		return project;
	}
	deleteTestProject(id) {
		this.testCases = this.testCases.filter((c) => c.projectId !== id);
		this.testRuns = this.testRuns.filter((r) => r.projectId !== id);
		this.testProjects = this.testProjects.filter((p) => p.id !== id);
		this.persistNews();
	}
	listTestCases(projectId) {
		return this.testCases.filter((c) => projectId === void 0 || c.projectId === projectId);
	}
	saveTestCase(input) {
		const now = isoDateTimeSeconds();
		const projectId = str(input?.projectId);
		if (!this.testProjects.some((p) => p.id === projectId)) throw new Error("测试项目不存在");
		const title = str(input?.title).trim().slice(0, 300);
		if (title === "") throw new Error("用例标题不能为空");
		const steps = list(input?.steps).map((x) => str(x)).filter(Boolean).slice(0, 30);
		let id = str(input?.id);
		if (id === "") id = this.testCases.find((c) => c.projectId === projectId && c.title === title)?.id ?? `tc-${randomUUID().slice(0, 12)}`;
		const existing = this.testCases.find((c) => c.id === id);
		const testCase = {
			id,
			projectId,
			title,
			precondition: str(input?.precondition),
			steps,
			expected: str(input?.expected),
			priority: [
				"P0",
				"P1",
				"P2",
				"P3"
			].includes(str(input?.priority)) ? str(input?.priority) : "P2",
			type: str(input?.type) || "functional",
			source: str(input?.source) || "manual",
			moduleId: str(input?.moduleId),
			platform: [
				"pc",
				"mobile",
				"tablet",
				"all"
			].includes(str(input?.platform)) ? str(input?.platform) : "all",
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) Object.assign(existing, testCase);
		else this.testCases.push(testCase);
		this.persistNews();
		writeTestCasesSnapshot(this.testProjects.find((p) => p.id === projectId), this.testCases.filter((c) => c.projectId === projectId));
		return testCase;
	}
	deleteTestCase(id) {
		const found = this.testCases.find((c) => c.id === id);
		this.testCases = this.testCases.filter((c) => c.id !== id);
		this.persistNews();
		if (found) writeTestCasesSnapshot(this.testProjects.find((p) => p.id === found.projectId), this.testCases.filter((c) => c.projectId === found.projectId));
	}
	listTestRuns(projectId) {
		return this.testRuns.filter((r) => projectId === void 0 || r.projectId === projectId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
	}
	saveTestRun(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `run-${randomUUID().slice(0, 12)}`;
		const projectId = str(input?.projectId);
		if (!this.testProjects.some((p) => p.id === projectId)) throw new Error("测试项目不存在");
		const status = [
			"running",
			"passed",
			"failed",
			"blocked"
		].includes(str(input?.status)) ? str(input?.status) : "running";
		const existing = this.testRuns.find((r) => r.id === id);
		const run = {
			id,
			projectId,
			name: str(input?.name) || "测试运行",
			status,
			results: list(input?.results),
			summary: input?.summary && typeof input.summary === "object" ? input.summary : {},
			deployLog: str(input?.deployLog),
			createdAt: existing?.createdAt ?? now,
			finishedAt: status === "running" ? null : str(input?.finishedAt) || now
		};
		if (existing) Object.assign(existing, run);
		else this.testRuns.push(run);
		this.persistNews();
		writeTestRunSnapshot(this.testProjects.find((p) => p.id === projectId), run);
		return run;
	}
	deleteTestRun(id) {
		this.testRuns = this.testRuns.filter((r) => r.id !== id);
		this.persistNews();
	}
	saveTestReport(projectId, runId, html) {
		const project = this.testProjects.find((p) => p.id === projectId);
		if (!project?.workspacePath) throw new Error("测试项目未关联工作区");
		const dir = join(project.workspacePath, ".dsh-workbench", "tests", projectId, "reports");
		mkdirSync(dir, { recursive: true });
		const path = join(dir, `${sanitizeFilename(runId)}.html`);
		writeFileSync(path, html.slice(0, 5e6), "utf8");
		return path;
	}
	listBugProjects() {
		return this.bugProjects.map((project) => ({
			...project,
			count: this.bugs.filter((b) => b.projectId === project.id).length
		}));
	}
	saveBugProject(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `bugp-${randomUUID().slice(0, 12)}`;
		const name = str(input?.name).trim().slice(0, 100);
		if (name === "") throw new Error("项目名称不能为空");
		const workspacePath = normalizeWorkspacePath(input?.workspacePath);
		const workspaceName = str(input?.workspaceName).trim() || (workspacePath === "" ? "" : basename(workspacePath));
		const existing = this.bugProjects.find((p) => p.id === id);
		if (existing) Object.assign(existing, {
			name,
			workspacePath,
			workspaceName,
			updatedAt: now
		});
		else this.bugProjects.push({
			id,
			name,
			workspacePath,
			workspaceName,
			createdAt: now,
			updatedAt: now
		});
		this.persistNews();
		return this.listBugProjects().find((p) => p.id === id);
	}
	deleteBugProject(id) {
		this.bugs = this.bugs.filter((b) => b.projectId !== id);
		this.bugProjects = this.bugProjects.filter((p) => p.id !== id);
		this.persistNews();
	}
	listBugs() {
		return this.bugs.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
	}
	saveBug(input) {
		const now = isoDateTimeSeconds();
		const id = str(input?.id) || `bug-${randomUUID().slice(0, 12)}`;
		const projectId = str(input?.projectId);
		if (!this.bugProjects.some((p) => p.id === projectId)) throw new Error("请选择项目");
		const title = str(input?.title).trim().slice(0, 300);
		if (title === "") throw new Error("Bug 标题不能为空");
		const existing = this.bugs.find((b) => b.id === id);
		const status = [
			"open",
			"doing",
			"verify",
			"resolved"
		].includes(str(input?.status)) ? str(input?.status) : "open";
		const severity = [
			"blocker",
			"major",
			"minor",
			"trivial"
		].includes(str(input?.severity)) ? str(input?.severity) : "minor";
		const priority = [
			"P0",
			"P1",
			"P2",
			"P3"
		].includes(str(input?.priority)) ? str(input?.priority) : "P2";
		const bug = {
			id,
			projectId,
			code: str(input?.code) || existing?.code || `BUG-${randomUUID().slice(0, 4).toUpperCase()}`,
			title,
			description: str(input?.description).slice(0, 5e4),
			status,
			severity,
			priority,
			plannedDate: str(input?.plannedDate).trim().slice(0, 10),
			tags: cleanTags(input?.tags),
			verification: str(input?.verification).slice(0, 2e4),
			aiThreadId: str(input?.aiThreadId),
			moduleId: str(input?.moduleId),
			platform: [
				"pc",
				"mobile",
				"tablet",
				"all"
			].includes(str(input?.platform)) ? str(input?.platform) : "all",
			assignee: str(input?.assignee).trim().slice(0, 40) || "我",
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			resolvedAt: status === "resolved" ? existing?.resolvedAt ?? now : null
		};
		if (existing) Object.assign(existing, bug);
		else this.bugs.push(bug);
		this.persistNews();
		return bug;
	}
	updateBug(input) {
		const bug = this.bugs.find((b) => b.id === str(input?.bugId));
		if (!bug) throw new Error("Bug 不存在");
		return this.saveBug({
			...bug,
			status: str(input?.status) || bug.status,
			verification: appendVerification(bug.verification, input?.verification),
			aiThreadId: str(input?.aiThreadId) || bug.aiThreadId
		});
	}
	deleteBug(id) {
		this.bugs = this.bugs.filter((b) => b.id !== id);
		this.persistNews();
	}
	stats() {
		return {
			tasks: this.state.tasks.length,
			spaces: this.state.spaces.length,
			focus: this.state.focus.length
		};
	}
	sqliteVersion() {
		return "";
	}
};
function safeJson(raw, fallback) {
	if (typeof raw !== "string") return fallback;
	try {
		return JSON.parse(raw);
	} catch {
		return fallback;
	}
}
function toSubtask(s) {
	return {
		id: s.id,
		title: s.title,
		done: Number(s.done) === 1,
		start: s.planned_start ?? "",
		end: s.planned_end ?? "",
		note: s.note ?? ""
	};
}
function toAttachment(a) {
	return {
		id: a.id,
		name: a.name,
		kind: a.kind,
		size: a.size ?? null
	};
}
function groupBy(rows, key) {
	const map = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const value = row[key];
		const bucket = map.get(value);
		if (bucket) bucket.push(row);
		else map.set(value, [row]);
	}
	return map;
}
function toNewsTopic(row) {
	return {
		id: row.id,
		title: row.title,
		query: row.query,
		scheduleKind: row.schedule_kind,
		times: safeJson(row.times, []),
		weekday: Number(row.weekday ?? 1),
		customCron: row.custom_cron ?? "",
		scheduleText: row.schedule_text ?? "",
		cronTaskIds: safeJson(row.cron_task_ids, []),
		enabled: Number(row.enabled) === 1,
		count: Number(row.count ?? 6),
		lastRunAt: row.last_run_at ?? null,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toNewsItem(row) {
	return {
		id: row.id,
		topicId: row.topic_id,
		title: row.title,
		url: row.url,
		source: row.source ?? "",
		publishedAt: row.published_at ?? "",
		summary: row.summary ?? "",
		aiSummary: row.ai_summary ?? "",
		fetchedAt: row.fetched_at
	};
}
function cleanTimes(value) {
	const out = [];
	for (const raw of list(value)) {
		const m = str(raw).trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
		if (m) out.push(`${m[1]}:${m[2]}`);
	}
	return Array.from(new Set(out)).sort();
}
function cleanNewsItems(value) {
	const out = [];
	for (const raw of list(value).slice(0, 20)) {
		const title = str(raw?.title).trim().slice(0, 300);
		const urlText = str(raw?.url).trim();
		if (title === "" || urlText === "") continue;
		let url = "";
		try {
			const parsed = new URL(urlText);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.toString().slice(0, 2e3);
		} catch {}
		if (url === "") continue;
		const source = str(raw?.source).trim().slice(0, 120);
		const publishedAt = str(raw?.publishedAt).trim().slice(0, 40);
		const summary = str(raw?.summary).trim().slice(0, 600);
		const aiSummary = str(raw?.aiSummary).trim().slice(0, 1600);
		const hash = createHash("sha256").update(url.toLowerCase()).digest("hex").slice(0, 32);
		out.push({
			title,
			url,
			source,
			publishedAt,
			summary,
			aiSummary,
			hash
		});
		if (out.length >= 20) break;
	}
	return out;
}
function normalizeExportDir(raw) {
	let dir = str(raw).trim();
	if (dir === "" || dir === "~") dir = homedir();
	else if (dir.startsWith("~/")) dir = join(homedir(), dir.slice(2));
	if (!isAbsolute(dir)) dir = resolve(homedir(), dir);
	dir = resolve(dir);
	try {
		mkdirSync(dir, { recursive: true });
		if (!statSync(dir).isDirectory()) throw new Error("不是目录");
		accessSync(dir, constants.W_OK);
	} catch (cause) {
		throw new Error(`保存目录不可写：${dir}（${String(cause?.message ?? cause)}）`);
	}
	return dir;
}
function sanitizeFilename(raw) {
	const cleaned = str(raw).replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 70);
	return cleaned === "" ? "未命名笔记" : cleaned;
}
function uniqueExportPath(dir, base, ext) {
	let path = join(dir, `${base}${ext}`);
	let i = 2;
	while (existsSync(path)) {
		path = join(dir, `${base} (${i})${ext}`);
		i += 1;
	}
	return path;
}
/** 工作区路径校验：非空时必须是存在且可写的绝对路径（防止 .dsh-workbench 写进 DSH 进程 cwd）。 */
function normalizeWorkspacePath(raw) {
	const path = str(raw).trim();
	if (path === "") return "";
	if (!isAbsolute(path)) throw new Error(`工作区路径必须是绝对路径：${path}`);
	const resolved = resolve(path);
	if (!existsSync(resolved)) throw new Error(`工作区路径不存在：${resolved}`);
	try {
		if (!statSync(resolved).isDirectory()) throw new Error("不是目录");
		accessSync(resolved, constants.W_OK);
	} catch (cause) {
		throw new Error(`工作区路径不可用：${resolved}（${String(cause?.message ?? cause)}）`);
	}
	return resolved;
}
/** 追加式验证记录：保留历史，每条带时间戳。 */
function appendVerification(previous, addition) {
	const prev = str(previous).trimEnd();
	const add = str(addition).trim();
	if (add === "") return prev;
	if (prev === "") return `[${isoDateTimeSeconds()}]\n${add}`;
	return `${prev}\n\n[${isoDateTimeSeconds()}]\n${add}`;
}
function escapeHtmlHost(text) {
	return String(text).replace(/[&<>"']/g, (ch) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[ch] ?? ch);
}
function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser"
	].filter(Boolean);
	for (const candidate of candidates) try {
		if (existsSync(candidate)) return candidate;
	} catch {}
	return null;
}
async function runChromePdf(chrome, htmlPath, pdfPath) {
	const profile = mkdtempSync(join(tmpdir(), "dsh-wb-chrome-"));
	const args = [
		"--headless=new",
		"--disable-gpu",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--disable-background-networking",
		"--disable-crash-reporter",
		"--no-pdf-header-footer",
		"--virtual-time-budget=1200",
		`--user-data-dir=${profile}`,
		`--print-to-pdf=${pdfPath}`,
		pathToFileURL(htmlPath).href
	];
	try {
		await new Promise((resolvePromise, reject) => {
			const child = spawn(chrome, args, { stdio: [
				"ignore",
				"ignore",
				"pipe"
			] });
			let stderr = "";
			const timer = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {}
				reject(/* @__PURE__ */ new Error("Chrome 打印超时"));
			}, 45e3);
			child.stderr?.on("data", (chunk) => {
				stderr = `${stderr}${String(chunk)}`.slice(-1200);
			});
			child.on("error", (cause) => {
				clearTimeout(timer);
				reject(cause);
			});
			child.on("close", (code) => {
				clearTimeout(timer);
				if (code === 0) resolvePromise();
				else reject(/* @__PURE__ */ new Error(`Chrome 退出 ${code}：${stderr.replace(/\s+/g, " ").slice(-300)}`));
			});
		});
	} finally {
		try {
			rmSync(profile, {
				recursive: true,
				force: true
			});
		} catch {}
	}
	if (!existsSync(pdfPath) || statSync(pdfPath).size === 0) throw new Error("Chrome 没有生成 PDF");
}
async function printHtmlToPdf(html, pdfPath) {
	const tmp = mkdtempSync(join(tmpdir(), "dsh-wb-pdf-"));
	const htmlPath = join(tmp, "note.html");
	writeFileSync(htmlPath, html, "utf8");
	try {
		const chrome = findChrome();
		if (chrome !== null) try {
			await runChromePdf(chrome, htmlPath, pdfPath);
			if (existsSync(pdfPath) && statSync(pdfPath).size > 0) return;
		} catch (cause) {
			console.warn(`[dsh-workbench] Chrome PDF 失败，尝试 Electron：${String(cause)}`);
		}
		const electron = require("electron");
		if (electron?.BrowserWindow === void 0) throw new Error("当前环境没有可用的 PDF 渲染器");
		const win = new electron.BrowserWindow({
			show: false,
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				javascript: false
			}
		});
		try {
			await win.loadFile(htmlPath);
			const data = await win.webContents.printToPDF({
				printBackground: true,
				pageSize: "A4",
				landscape: false,
				displayHeaderFooter: false,
				margins: {
					marginType: "custom",
					top: .4,
					bottom: .4,
					left: .4,
					right: .4
				}
			});
			writeFileSync(pdfPath, data);
		} finally {
			try {
				win.destroy();
			} catch {}
		}
		if (!existsSync(pdfPath) || statSync(pdfPath).size === 0) throw new Error("Electron 没有生成 PDF");
	} finally {
		try {
			rmSync(tmp, {
				recursive: true,
				force: true
			});
		} catch {}
	}
}
function notePdfHtml(note, notebookName, bodyHtml) {
	const tags = cleanTags(note.tags);
	let safeBody = String(bodyHtml ?? "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
	const heading = safeBody.match(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>/i);
	if (heading) {
		if (heading[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").trim() === note.title.trim()) safeBody = safeBody.slice(heading[0].length);
	}
	const body = safeBody.trim() === "" ? `<pre>${escapeHtmlHost(note.content)}</pre>` : safeBody;
	return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtmlHost(note.title)}</title>
<style>
@page{size:A4;margin:18mm 16mm}
*{box-sizing:border-box}
body{margin:0;color:#1f1f1f;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:11.5pt;line-height:1.75;-webkit-print-color-adjust:exact}
h1{font-size:23pt;line-height:1.3;margin:0 0 8pt;color:#111}
h1,h2,h3,h4{break-after:avoid}
h2{font-size:15.5pt;margin:16pt 0 6pt;border-bottom:1px solid #e7e2da;padding-bottom:4pt}
h3{font-size:13pt;margin:12pt 0 4pt}
p{margin:5pt 0;color:#333}
ul,ol{margin:5pt 0;padding-left:18pt}
li{margin:2pt 0}
blockquote{margin:8pt 0;padding:6pt 10pt;border-left:3px solid #c2410c;background:#faf7f2;color:#555}
code{font-family:"SFMono-Regular",Menlo,monospace;font-size:9.5pt;background:#f3f1ed;padding:1pt 3pt;border-radius:3pt}
pre{background:#f7f5f1;border:1px solid #e7e2da;border-radius:5pt;padding:8pt 10pt;white-space:pre-wrap;word-break:break-word}
pre code{background:none;padding:0}
a{color:#b45309;text-decoration:none}
img{max-width:100%;border-radius:5pt}
hr{border:0;border-top:1px solid #e7e2da;margin:12pt 0}
.meta{color:#777;font-size:9.5pt;margin:0 0 14pt;padding-bottom:8pt;border-bottom:1px solid #e7e2da}
.md-check{color:#c2410c;margin-right:3pt}
</style></head><body>
<h1>${escapeHtmlHost(note.title)}</h1>
<div class="meta">笔记本：${escapeHtmlHost(notebookName)}${tags.length > 0 ? ` · 标签：${escapeHtmlHost(tags.map((t) => `#${t}`).join(" "))}` : ""} · 导出：${escapeHtmlHost(isoDateTimeSeconds())}</div>
${body}
</body></html>`;
}
async function revealExportPath(store, rawPath) {
	const dir = normalizeExportDir(store.getExportConfig().exportDir);
	const target = resolve(str(rawPath));
	if (!existsSync(target)) throw new Error("文件或目录不存在");
	const rel = relative(dir, target);
	if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("只能打开保存目录中的文件");
	const stat = statSync(target);
	const directory = stat.isDirectory() ? target : dirname(target);
	try {
		const shell = require("electron")?.shell;
		if (shell?.showItemInFolder !== void 0 && stat.isFile()) {
			shell.showItemInFolder(target);
			return {
				ok: true,
				path: target,
				directory
			};
		}
		if (shell?.openPath !== void 0) {
			if (!await shell.openPath(directory)) return {
				ok: true,
				path: target,
				directory
			};
		}
	} catch {}
	const [cmd, args] = process.platform === "darwin" ? ["open", stat.isFile() ? ["-R", target] : [directory]] : process.platform === "win32" ? ["explorer.exe", stat.isFile() ? [`/select,${target}`] : [directory]] : ["xdg-open", [directory]];
	await new Promise((resolvePromise, reject) => {
		const child = spawn(cmd, args, { stdio: "ignore" });
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {}
			reject(/* @__PURE__ */ new Error("打开文件夹超时"));
		}, 1e4);
		child.on("error", (cause) => {
			clearTimeout(timer);
			reject(cause);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolvePromise();
			else reject(/* @__PURE__ */ new Error(`打开文件夹失败（退出 ${code}）`));
		});
	});
	return {
		ok: true,
		path: target,
		directory
	};
}
async function exportNoteFile(store, noteId, format, bodyHtml) {
	const note = store.listNotes().find((n) => n.id === noteId);
	if (!note) throw new Error("笔记不存在");
	const notebookName = store.listNotebooks().find((n) => n.id === note.notebookId)?.name ?? "未分类";
	const dir = normalizeExportDir(store.getExportConfig().exportDir);
	const base = sanitizeFilename(note.title || "未命名笔记");
	const isPdf = format === "pdf";
	const path = uniqueExportPath(dir, base, isPdf ? ".pdf" : ".md");
	if (isPdf) try {
		await printHtmlToPdf(notePdfHtml(note, notebookName, bodyHtml), path);
	} catch (cause) {
		try {
			if (existsSync(path)) rmSync(path, { force: true });
		} catch {}
		throw cause;
	}
	else {
		let content = String(note.content ?? "");
		const title = note.title.trim() || "未命名笔记";
		const firstLine = content.split("\n")[0] ?? "";
		if (/^#\s+/.test(firstLine) && firstLine.replace(/^#\s+/, "").trim() === title) content = content.split("\n").slice(1).join("\n").replace(/^\n+/, "");
		const tags = cleanTags(note.tags);
		const meta = `> 笔记本：${notebookName}${tags.length > 0 ? ` · 标签：${tags.map((t) => `#${t}`).join(" ")}` : ""} · 导出：${isoDateTimeSeconds()}\n\n`;
		writeFileSync(path, `<!-- 由 dsh-workbench 导出 -->\n# ${title}\n\n${meta}${content}\n`, "utf8");
	}
	return {
		ok: true,
		path,
		filename: basename(path),
		format: isPdf ? "pdf" : "md",
		dir
	};
}
function syncNoteFile(note, notebook) {
	const workspace = str(notebook?.workspace_path).trim();
	if (workspace === "") return "";
	const dir = join(workspace, ".dsh-workbench", "notes", sanitizeFilename(str(notebook?.name) || "笔记本"));
	mkdirSync(dir, { recursive: true });
	const suffix = note.id.slice(-6);
	const path = join(dir, `${sanitizeFilename(note.title)}-${suffix}.md`);
	writeFileSync(path, `# ${note.title}\n\n${note.content}\n`, "utf8");
	return path;
}
function removeFile(path) {
	try {
		if (existsSync(path)) rmSync(path, { force: true });
	} catch {}
}
function toBug(row) {
	return {
		id: row.id,
		projectId: row.project_id,
		code: row.code ?? "",
		title: row.title,
		description: row.description ?? "",
		status: row.status ?? "open",
		severity: row.severity ?? "minor",
		priority: row.priority ?? "P2",
		plannedDate: row.planned_date ?? "",
		tags: safeJson(row.tags, []),
		verification: row.verification ?? "",
		aiThreadId: row.ai_thread_id ?? "",
		moduleId: row.module_id ?? "",
		platform: row.platform ?? "all",
		assignee: row.assignee ?? "我",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		resolvedAt: row.resolved_at ?? null
	};
}
function writeTestCasesSnapshot(project, cases) {
	try {
		const workspace = str(project?.workspace_path ?? project?.workspacePath).trim();
		if (workspace === "") return;
		const dir = join(workspace, ".dsh-workbench", "tests", project.id);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "cases.json"), JSON.stringify(cases, null, 2), "utf8");
		writeFileSync(join(dir, "project.json"), JSON.stringify(toTestProject(project), null, 2), "utf8");
	} catch (cause) {
		console.warn(`[dsh-workbench] 测试快照写入失败：${String(cause)}`);
	}
}
function writeTestRunSnapshot(project, run) {
	try {
		const workspace = str(project?.workspace_path ?? project?.workspacePath).trim();
		if (workspace === "") return;
		const dir = join(workspace, ".dsh-workbench", "tests", project.id, "runs");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${run.id}.json`), JSON.stringify(run, null, 2), "utf8");
	} catch (cause) {
		console.warn(`[dsh-workbench] 测试运行快照写入失败：${String(cause)}`);
	}
}
function toProject(row) {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? "",
		workspacePath: row.workspace_path ?? "",
		workspaceName: row.workspace_name ?? "",
		archivedAt: row.archived_at ?? "",
		sortOrder: Number(row.sort_order ?? 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toBugProject(row) {
	return {
		id: row.id,
		name: row.name,
		workspacePath: row.workspace_path ?? "",
		workspaceName: row.workspace_name ?? "",
		projectId: row.project_id ?? "",
		count: Number(row.count ?? 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toTestProject(row) {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? "",
		workspacePath: row.workspace_path ?? "",
		productId: row.product_id ?? "",
		moduleId: row.module_id ?? "",
		platform: row.platform ?? "all",
		bugProjectId: row.bug_project_id ?? "",
		deployMode: row.deploy_mode ?? "local",
		sshHost: row.ssh_host ?? "",
		remoteDir: row.remote_dir ?? "",
		image: row.image ?? "",
		containerName: row.container_name ?? "",
		hostPort: row.host_port ?? "",
		containerPort: row.container_port ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toTestCase(row) {
	return {
		id: row.id,
		projectId: row.project_id,
		title: row.title,
		precondition: row.precondition ?? "",
		steps: safeJson(row.steps, []),
		expected: row.expected ?? "",
		priority: row.priority ?? "P2",
		type: row.type ?? "functional",
		source: row.source ?? "manual",
		moduleId: row.module_id ?? "",
		platform: row.platform ?? "all",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toTestRun(row) {
	return {
		id: row.id,
		projectId: row.project_id,
		name: row.name,
		status: row.status ?? "running",
		results: safeJson(row.results, []),
		summary: safeJson(row.summary, {}),
		deployLog: row.deploy_log ?? "",
		createdAt: row.created_at,
		finishedAt: row.finished_at ?? null
	};
}
function toModule(row) {
	return {
		id: row.id,
		productId: row.product_id,
		mapId: row.map_id ?? "",
		parentId: row.parent_id ?? "",
		name: row.name,
		kind: row.kind ?? "module",
		platform: row.platform ?? "all",
		description: row.description ?? "",
		noteId: row.note_id ?? "",
		status: row.status ?? "designing",
		nodeId: row.node_id ?? "",
		sortOrder: Number(row.sort_order ?? 0),
		archivedAt: row.archived_at ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toProductProgress(row) {
	return {
		id: row.id,
		productId: row.product_id,
		kind: row.kind ?? "modules",
		demoId: row.demo_id ?? "",
		mapId: row.map_id ?? "",
		step: Number(row.step ?? 0),
		total: Number(row.total ?? 0),
		status: row.status ?? "running",
		message: row.message ?? "",
		log: jsonList(row.log),
		sessionId: row.session_id ?? "",
		updatedAt: row.updated_at
	};
}
function toProduct(row) {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? "",
		workspacePath: row.workspace_path ?? "",
		notebookId: row.notebook_id ?? "",
		mindmap: row.mindmap ?? "{\"nodes\":[]}",
		styles: safeJson(row.styles, []),
		archivedAt: row.archived_at ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
/** 行 → v2 图：graph_json 优先；旧数据就地从 v1 mindmap 转（不写库，只读侧兼容）。 */
function mapGraphOf(row) {
	const raw = String(row?.graph_json ?? "").trim();
	if (raw !== "") try {
		return JSON.parse(raw);
	} catch {}
	return productGraphFromV1(row?.mindmap ?? "{\"nodes\":[]}", "产品").graph;
}
function toProductMap(row) {
	return {
		id: row.id,
		productId: row.product_id,
		name: row.name,
		description: row.description ?? "",
		mindmap: row.mindmap ?? "{\"nodes\":[]}",
		graph: mapGraphOf(row),
		graphRev: Number(row.draft_rev ?? 0),
		currentVersionId: row.current_version_id ?? "",
		source: row.source ?? "manual",
		sourceRef: row.source_ref ?? "",
		summary: row.summary ?? "",
		sortOrder: Number(row.sort_order ?? 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
/** 截图 dataURL 解码：只放行常见图片格式，单张上限 2MB。 */
function decodeImageDataUrl(dataUrl) {
	if (typeof dataUrl !== "string") return null;
	const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
	if (!match) return null;
	const buffer = Buffer.from(match[2], "base64");
	if (buffer.length === 0 || buffer.length > 2097152) return null;
	const mime = match[1].toLowerCase();
	if (![
		"image/png",
		"image/jpeg",
		"image/webp",
		"image/gif"
	].includes(mime)) return null;
	return {
		mime,
		buffer
	};
}
/** 产品素材目录：<工作区>/.dsh-workbench/products/<产品id>/inputs */
function productInputDir(product) {
	const workspace = str(product?.workspace_path ?? product?.workspacePath).trim();
	if (workspace === "") throw new Error("产品未关联工作区，无法保存截图");
	return join(workspace, ".dsh-workbench", "products", str(product?.id), "inputs");
}
/** 导图 JSON 规范化：保证有 nodes 数组且至少有一个根节点。 */
function normalizeMindmap(raw, fallbackName) {
	try {
		const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
		if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) return JSON.stringify(parsed);
	} catch {}
	return JSON.stringify({ nodes: [{
		id: "root",
		label: fallbackName,
		type: "root",
		parentId: null,
		note: ""
	}] });
}
function toProductDemo(row) {
	return {
		id: row.id,
		productId: row.product_id,
		mapId: row.map_id ?? "",
		style: row.style,
		scope: row.scope,
		featureId: row.feature_id ?? "",
		title: row.title,
		filePath: row.file_path,
		createdAt: row.created_at,
		platform: row.platform ?? "all",
		kind: row.kind ?? "page",
		status: row.status ?? "ready"
	};
}
function toDemoProgress(row) {
	return {
		id: row.id,
		productId: row.product_id,
		demoId: row.demo_id ?? "",
		step: Number(row.step ?? 0),
		total: Number(row.total ?? 0),
		status: row.status ?? "running",
		message: row.message ?? "",
		log: jsonList(row.log),
		updatedAt: row.updated_at
	};
}
function toNote(row) {
	return {
		id: row.id,
		notebookId: row.notebook_id ?? "",
		title: row.title,
		content: row.content ?? "",
		tags: safeJson(row.tags, []),
		pinned: Number(row.pinned) === 1,
		filePath: row.file_path ?? "",
		mapId: row.map_id ?? "",
		kind: row.kind ?? "",
		nodeId: row.node_id ?? "",
		moduleId: row.module_id ?? "",
		docKey: row.doc_key ?? "",
		archivedAt: row.archived_at ?? "",
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function cleanTags(value) {
	const out = [];
	for (const raw of list(value)) {
		const tag = str(raw).trim().replace(/^#/, "").slice(0, 24);
		if (tag !== "" && !out.includes(tag)) out.push(tag);
		if (out.length >= 20) break;
	}
	return out;
}
function welcomeNote() {
	const now = isoDateTimeSeconds();
	return {
		id: "note-welcome",
		notebookId: "nb-default",
		title: "欢迎使用记事本",
		tags: ["指南"],
		pinned: true,
		createdAt: now,
		updatedAt: now,
		content: `# 欢迎使用记事本

这是工作台里的随手记，和任务、新闻放在一起，数据保存在本机 SQLite。

## 能做什么

- **自动保存**：停止输入后写入本机，不需要手动保存
- **Markdown**：标题、列表、引用、代码块、链接、图片
- **笔记本 / 标签 / 收藏 / 搜索**：按笔记本分类，快速找回
- **另存 / PDF**：导出 Markdown 或 PDF 到设置里的保存目录
- **转为任务**：把一条笔记一键变成看板任务

## 小技巧

> 右侧切到「预览」可以看 Markdown 渲染效果。

\`\`\`js
const note = 'hello workbench'
console.log(note)
\`\`\`

祝记录顺利。`
	};
}
function seedState() {
	const today = isoDate();
	const now = isoDateTime();
	const spaces = [
		{
			id: "work",
			name: "工作",
			color: "#d97706"
		},
		{
			id: "study",
			name: "学习",
			color: "#0f9f6e"
		},
		{
			id: "life",
			name: "生活",
			color: "#2563eb"
		}
	];
	const task = (id, title, space, status, opts = {}) => ({
		id,
		title,
		desc: "",
		note: "",
		space,
		status,
		priority: "normal",
		tags: [],
		date: today,
		start: "",
		end: "",
		duration: 0,
		group: "",
		createdAt: now,
		updatedAt: now,
		completedAt: null,
		subtasks: [],
		attachments: [],
		logs: [],
		...opts
	});
	return {
		spaces,
		tasks: [
			task("seed-1", "学习 Excel 条件求和", "study", "doing", {
				desc: "上次：已读第 3 节讲义，接下来：完成函数练习，再整理易错点。",
				note: "上次：已读第 3 节讲义。\n接下来：完成函数练习，再整理易错点。\n\n打开讲义，完成 SUMIF 与 SUMIFS 组合练习。",
				priority: "high",
				tags: ["个人学习"],
				start: "14:00",
				end: "14:45",
				duration: 45,
				group: "Excel 学习",
				subtasks: [
					{
						id: "seed-1-s1",
						title: "读完函数讲义",
						done: true,
						start: "14:00",
						end: "14:20",
						note: ""
					},
					{
						id: "seed-1-s2",
						title: "完成函数练习",
						done: false,
						start: "14:35",
						end: "14:45",
						note: ""
					},
					{
						id: "seed-1-s3",
						title: "整理两个易错点",
						done: false,
						start: "14:45",
						end: "15:00",
						note: ""
					}
				],
				attachments: [{
					id: "seed-1-a1",
					name: "1.pdf",
					kind: "pdf"
				}, {
					id: "seed-1-a2",
					name: "表.csv",
					kind: "csv"
				}],
				logs: [
					{
						at: `${today} 14:02`,
						type: "status",
						text: "开始执行"
					},
					{
						at: `${today} 13:58`,
						type: "edit",
						text: "设置时间 14:00–14:45"
					},
					{
						at: `${today} 13:55`,
						type: "created",
						text: "创建任务"
					}
				]
			}),
			task("seed-2", "预约体检时间", "life", "next", {
				desc: "先看可预约日期，再确认检查前注意事项。",
				start: "15:00",
				end: "15:10",
				duration: 10
			}),
			task("seed-3", "整理本月支出", "life", "next", {
				desc: "核对本账记录，补上漏记的支出。",
				start: "16:00",
				end: "16:20",
				duration: 20
			}),
			task("seed-4", "列出周一要处理的三件事", "work", "next", {
				desc: "只列需要先动手的三件事。",
				start: "17:30",
				end: "17:40",
				duration: 10
			}),
			task("seed-5", "复习昨天的两个错题", "study", "next", {
				desc: "先独立重做一遍，再对照答案。",
				start: "19:30",
				end: "19:50",
				duration: 20
			}),
			task("seed-6", "等报销审核结果", "life", "waiting", {
				desc: "已提交资料，周一查看审核进度。",
				start: "08:00",
				end: "18:00",
				duration: 600
			}),
			task("seed-7", "整理本周工作记录", "work", "done", {
				desc: "把本周工作记录归档，并补上遗漏项。",
				start: "09:00",
				end: "09:30",
				duration: 30,
				completedAt: `${today} 09:31`,
				logs: [{
					at: `${today} 09:31`,
					type: "completed",
					text: "完成任务"
				}]
			}),
			task("seed-8", "整理文件与备份", "life", "done", {
				desc: "把本周文件按项目归档并备份。",
				start: "20:00",
				end: "20:30",
				duration: 30,
				completedAt: `${today} 20:32`,
				logs: [{
					at: `${today} 20:32`,
					type: "completed",
					text: "完成任务"
				}]
			}),
			task("seed-9", "整理会议记录", "work", "next", {
				desc: "整理周会记录，提取三条行动项。",
				date: addDays(today, 1),
				start: "09:30",
				end: "10:00",
				duration: 30
			}),
			task("seed-10", "练习公式一组", "study", "next", {
				desc: "VLOOKUP + IF 嵌套，先看例题再独立完成。",
				date: addDays(today, 2),
				start: "14:00",
				end: "14:40",
				duration: 40
			})
		],
		focus: [],
		settings: {
			theme: "auto",
			weekStart: "sun"
		}
	};
}
function send(res, status, payload, headers = {}) {
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff",
		...headers
	});
	res.end(body);
}
function readJson(req) {
	if (typeof req.json === "function") return req.json();
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		if (typeof req.on !== "function") {
			reject(/* @__PURE__ */ new Error("请求体不可读"));
			return;
		}
		req.on("data", (chunk) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += buf.length;
			if (size > MAX_BODY_BYTES) {
				reject(/* @__PURE__ */ new Error("请求体过大"));
				return;
			}
			chunks.push(buf);
		});
		req.on("end", () => {
			if (chunks.length === 0) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch (cause) {
				reject(cause);
			}
		});
		req.on("error", reject);
	});
}
function normalizeState(raw) {
	if (!raw || typeof raw !== "object") throw new Error("缺少 state");
	return {
		spaces: list(raw.spaces),
		tasks: list(raw.tasks),
		focus: list(raw.focus),
		settings: raw.settings && typeof raw.settings === "object" ? raw.settings : {}
	};
}
let queue = Promise.resolve();
function serialized(fn) {
	const next = queue.then(fn, fn);
	queue = next.catch(() => void 0);
	return next;
}
/**
* 给定时任务里的 DSH agent 暴露一个「写入新闻」工具。
* 工具只做一件事：校验 + 去重 + 落库，避免让模型直接操作数据库。
*/
function registerNewsTool(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") {
		console.warn("[dsh-workbench] tools 服务不可用：workbench_news_publish 未注册");
		return;
	}
	const tool = {
		name: "workbench_news_publish",
		description: "把一次新闻检索的结果写入个人工作台的新闻订阅。仅用于定时新闻任务：传入订阅 id 与新闻数组（title/source/url/publishedAt/summary）。服务端会按 URL 去重；没有新闻时传空数组。不要用它写其他内容。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				topicId: {
					type: "string",
					description: "新闻订阅 id（由任务提示词给出）。"
				},
				items: {
					type: "array",
					description: "最多 20 条新闻；没有合适新闻时传空数组。",
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							title: {
								type: "string",
								description: "新闻标题（准确标题或准确译名）。"
							},
							url: {
								type: "string",
								description: "http/https 原文链接，不得编造。"
							},
							source: {
								type: "string",
								description: "来源媒体名。"
							},
							publishedAt: {
								type: "string",
								description: "发布时间 YYYY-MM-DD，可留空。"
							},
							summary: {
								type: "string",
								description: "中文一句话摘要，不超过 60 字。"
							},
							aiSummary: {
								type: "string",
								description: "AI 总结：100–180 字中文，说明事件、关键数据与影响/看点；卡片会直接展示。"
							}
						},
						required: ["title", "url"]
					}
				}
			},
			required: ["topicId", "items"]
		},
		output: {
			schema: {},
			render: (_args, value) => {
				if (value?.ok) return [{
					type: "text",
					text: `已写入 ${value.inserted} 条新闻，跳过重复 ${value.skipped} 条。`
				}];
				return [{
					type: "text",
					text: `写入失败：${String(value?.error ?? "unknown")}`
				}];
			}
		},
		async execute(args) {
			try {
				const topicId = str(args?.topicId).trim();
				if (topicId === "") return {
					ok: false,
					inserted: 0,
					skipped: 0,
					error: "topicId 不能为空"
				};
				const items = list(args?.items);
				return await serialized(() => store.publishNews(topicId, items));
			} catch (cause) {
				return {
					ok: false,
					inserted: 0,
					skipped: 0,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), "workbench: news publish tool");
	else ctx.tools.register(tool);
	console.log("[dsh-workbench] 已注册工具 workbench_news_publish");
}
function registerBugTool(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") {
		console.warn("[dsh-workbench] tools 服务不可用：workbench_bug_update 未注册");
		return;
	}
	const tool = {
		name: "workbench_bug_update",
		description: "更新个人工作台里 Bug 的状态与验证说明。仅用于 Bug 修复任务：修复并在工作区验证后调用；status 取 open/doing/verify/resolved，verified 才设 resolved。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				bugId: {
					type: "string",
					description: "Bug id（任务提示词里给出的 id）。"
				},
				status: {
					type: "string",
					enum: [
						"open",
						"doing",
						"verify",
						"resolved"
					],
					description: "新状态。"
				},
				verification: {
					type: "string",
					description: "验证方式与结果（测试/构建/复现步骤），会显示在 Bug 详情里。"
				},
				note: {
					type: "string",
					description: "可选补充说明。"
				}
			},
			required: ["bugId", "status"]
		},
		output: {
			schema: {},
			render: (_args, value) => {
				if (value?.ok) return [{
					type: "text",
					text: `已更新 ${value.bug?.code ?? value.bug?.id} → ${value.bug?.status}`
				}];
				return [{
					type: "text",
					text: `更新失败：${String(value?.error ?? "unknown")}`
				}];
			}
		},
		async execute(args) {
			try {
				const bugId = str(args?.bugId).trim();
				if (bugId === "") return {
					ok: false,
					error: "bugId 不能为空"
				};
				const verification = [str(args?.verification), str(args?.note)].filter(Boolean).join("\n");
				return {
					ok: true,
					bug: await serialized(() => store.updateBug({
						bugId,
						status: args?.status,
						verification
					}))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), "workbench: bug update tool");
	else ctx.tools.register(tool);
	console.log("[dsh-workbench] 已注册工具 workbench_bug_update");
}
function registerModuleTool(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") return;
	const tool = {
		name: "workbench_module_publish",
		description: "写入产品模块/业务/功能/需求节点；kind=module|business|feature|requirement，platform=pc|mobile|tablet|all。AI 拆分产品模块时逐条调用。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: { type: "string" },
				mapId: {
					type: "string",
					description: "导图 id（不传则归到该产品第一张导图）。"
				},
				parentId: {
					type: "string",
					description: "父级模块 id（顶层留空）"
				},
				nodeId: {
					type: "string",
					description: "对应的导图节点 id（可选，便于导图与模块互相跳转）"
				},
				name: { type: "string" },
				kind: {
					type: "string",
					enum: [
						"module",
						"business",
						"feature",
						"requirement"
					]
				},
				platform: {
					type: "string",
					enum: [
						"pc",
						"mobile",
						"tablet",
						"all"
					]
				},
				description: { type: "string" },
				noteId: { type: "string" },
				status: { type: "string" }
			},
			required: [
				"productId",
				"name",
				"kind"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已写入${v.module?.kind ?? "模块"}「${v.module?.name ?? ""}」` : `写入失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					module: await serialized(() => store.saveModule(args))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), "workbench: module tool");
	else ctx.tools.register(tool);
	console.log("[dsh-workbench] 已注册工具 workbench_module_publish");
	const progressTool = {
		name: "product_progress_publish",
		description: "产品模块/笔记生成进度上报。开始时 step=0 status=running；每写完一个模块调用一次（step 递增）；结束 status=done；失败 status=failed 并说明原因。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: { type: "string" },
				kind: {
					type: "string",
					enum: ["modules", "notes"],
					description: "生成的是模块还是设计笔记"
				},
				mapId: { type: "string" },
				step: { type: "number" },
				total: { type: "number" },
				status: {
					type: "string",
					enum: [
						"running",
						"done",
						"failed"
					]
				},
				message: { type: "string" }
			},
			required: [
				"productId",
				"step",
				"total",
				"status",
				"message"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `进度 ${v.progress?.step ?? 0}/${v.progress?.total ?? 0} 已记录` : `上报失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					progress: await serialized(() => store.saveProductProgress(args))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(progressTool), "workbench: product progress tool");
	else ctx.tools.register(progressTool);
	console.log("[dsh-workbench] 已注册工具 product_progress_publish");
	const nodeTool = {
		name: "workbench_map_node_publish",
		description: "向产品导图写入一个节点（模块/业务/功能/需求）。AI 从素材提炼导图结构时逐条调用；同名同 kind 同父会更新而非新增。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: { type: "string" },
				mapId: {
					type: "string",
					description: "目标导图 id（必填，不要新建导图）"
				},
				parentId: {
					type: "string",
					description: "父节点 id；根节点留空"
				},
				name: {
					type: "string",
					description: "节点名称（≤12 字）"
				},
				kind: {
					type: "string",
					enum: [
						"module",
						"business",
						"feature",
						"requirement"
					]
				},
				platform: {
					type: "string",
					enum: [
						"pc",
						"mobile",
						"tablet",
						"all"
					]
				},
				detail: {
					type: "string",
					description: "一句话说明（可选，≤200 字）"
				}
			},
			required: [
				"productId",
				"mapId",
				"name",
				"kind"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已写入节点「${v.name ?? ""}」` : `写入失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				const map = await serialized(() => store.addMapNode(args));
				return {
					ok: true,
					name: args?.name,
					nodes: Array.isArray(map?.graph?.nodes) ? map.graph.nodes.length : void 0
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(nodeTool), "workbench: map node tool");
	else ctx.tools.register(nodeTool);
	console.log("[dsh-workbench] 已注册工具 workbench_map_node_publish");
}
function registerTestCaseTool(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") return;
	const tool = {
		name: "workbench_testcase_publish",
		description: "把 AI 生成的一条测试用例写入指定测试项目。按功能/需求逐条调用；支持需求文本、产品设计笔记、Demo 页面来源。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				projectId: { type: "string" },
				title: { type: "string" },
				precondition: { type: "string" },
				steps: {
					type: "array",
					items: { type: "string" }
				},
				expected: { type: "string" },
				priority: {
					type: "string",
					enum: [
						"P0",
						"P1",
						"P2",
						"P3"
					]
				},
				type: { type: "string" },
				source: { type: "string" },
				moduleId: { type: "string" },
				platform: {
					type: "string",
					enum: [
						"pc",
						"mobile",
						"tablet",
						"all"
					]
				}
			},
			required: [
				"projectId",
				"title",
				"steps",
				"expected"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已写入用例「${v.case?.title ?? ""}」` : `写入失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					case: await serialized(() => store.saveTestCase(args))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), "workbench: test case tool");
	else ctx.tools.register(tool);
	console.log("[dsh-workbench] 已注册工具 workbench_testcase_publish");
}
function registerTestFlowTools(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") return;
	const register = (tool, label) => {
		if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), `workbench: ${label}`);
		else ctx.tools.register(tool);
		console.log(`[dsh-workbench] 已注册工具 ${tool.name}`);
	};
	const resultTool = {
		name: "workbench_test_result_publish",
		description: "把一条测试用例的执行结果写入测试运行（AI 自动化测试的唯一回写通道）。runId 为空时自动新建一次运行。失败/阻塞时请同时给出 bugTitle，自动录入 Bug。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				projectId: {
					type: "string",
					description: "测试项目 id。"
				},
				runId: {
					type: "string",
					description: "测试运行 id；留空自动新建。"
				},
				caseId: {
					type: "string",
					description: "用例 id。"
				},
				status: {
					type: "string",
					enum: [
						"pass",
						"fail",
						"blocked",
						"pending"
					]
				},
				note: {
					type: "string",
					description: "实际结果 / 证据。"
				},
				bugTitle: {
					type: "string",
					description: "status=fail/blocked 时录入 Bug 的标题（可选）。"
				},
				bugDescription: {
					type: "string",
					description: "Bug 描述（可选）。"
				}
			},
			required: [
				"projectId",
				"caseId",
				"status"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已记录 ${v.result?.status ?? ""}${v.bug ? `，录 Bug ${v.bug.code ?? ""}` : ""}` : `记录失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return await serialized(() => {
					const projectId = str(args?.projectId);
					const cases = store.listTestCases(projectId);
					const testCase = cases.find((c) => c.id === str(args?.caseId));
					if (!testCase) throw new Error("用例不存在");
					let runId = str(args?.runId);
					let run = runId ? store.listTestRuns(projectId).find((r) => r.id === runId) : void 0;
					if (!run) run = store.saveTestRun({
						projectId,
						name: `AI 测试 ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
						status: "running",
						results: cases.map((c) => ({
							caseId: c.id,
							status: "pending",
							note: "",
							bugId: ""
						})),
						summary: {}
					});
					const results = run.results.map((r) => r.caseId === testCase.id ? {
						...r,
						status: str(args?.status) || "fail",
						note: str(args?.note) || r.note
					} : r);
					let bug;
					const bugTitle = str(args?.bugTitle).trim();
					if (bugTitle !== "" && (str(args?.status) === "fail" || str(args?.status) === "blocked")) {
						const projects = store.listBugProjects();
						const testProject = store.listTestProjects().find((p) => p.id === projectId);
						const bugProject = projects.find((p) => p.id === testProject?.bugProjectId) ?? projects[0];
						if (bugProject) {
							bug = store.saveBug({
								projectId: bugProject.id,
								title: bugTitle,
								description: str(args?.bugDescription) || `来源：AI 自动化测试 / ${testCase.title}`,
								status: "open",
								severity: testCase.priority === "P0" ? "blocker" : testCase.priority === "P1" ? "major" : "minor",
								priority: testCase.priority,
								platform: testCase.platform || "all",
								moduleId: testCase.moduleId || "",
								tags: ["测试", testCase.id]
							});
							for (const r of results) if (r.caseId === testCase.id) r.bugId = bug.id;
						}
					}
					run = store.saveTestRun({
						...run,
						results
					});
					return {
						ok: true,
						result: results.find((r) => r.caseId === testCase.id),
						runId: run.id,
						bug
					};
				});
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	const bugTool = {
		name: "workbench_bug_publish",
		description: "在 Bug 项目里新建一条 Bug（AI 测试发现问题或用户要求录 Bug 时使用）。修复回写请用 workbench_bug_update。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				projectId: {
					type: "string",
					description: "Bug 项目 id（测试项目自动建的「测试：X」项目可在上下文中找到）。"
				},
				title: { type: "string" },
				description: { type: "string" },
				severity: {
					type: "string",
					enum: [
						"blocker",
						"major",
						"minor",
						"trivial"
					]
				},
				priority: {
					type: "string",
					enum: [
						"P0",
						"P1",
						"P2",
						"P3"
					]
				},
				platform: {
					type: "string",
					enum: [
						"pc",
						"mobile",
						"tablet",
						"all"
					]
				},
				moduleId: { type: "string" },
				tags: {
					type: "array",
					items: { type: "string" }
				}
			},
			required: ["projectId", "title"]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已录 Bug ${v.bug?.code ?? ""}「${v.bug?.title ?? ""}」` : `录入失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					bug: await serialized(() => store.saveBug({
						...args,
						status: "open"
					}))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	register(resultTool, "test result tool");
	register(bugTool, "bug publish tool");
}
async function runDockerDeploy(project) {
	const image = str(project.image) || "dsh-workbench-test";
	const container = str(project.containerName) || "dsh-workbench-test";
	const hostPort = str(project.hostPort) || "8080";
	const containerPort = str(project.containerPort) || "80";
	const lines = [];
	const run = (cmd, args, cwd) => new Promise((resolve) => {
		lines.push(`$ ${cmd} ${args.join(" ")}`);
		const child = spawn(cmd, args, {
			cwd,
			shell: false,
			env: process.env
		});
		let done = false;
		const timer = setTimeout(() => {
			if (!done) {
				done = true;
				lines.push("TIMEOUT");
				child.kill("SIGKILL");
				resolve(false);
			}
		}, 12e4);
		child.stdout.on("data", (d) => lines.push(String(d).trimEnd()));
		child.stderr.on("data", (d) => lines.push(String(d).trimEnd()));
		child.on("error", (cause) => {
			lines.push(String(cause));
			if (!done) {
				done = true;
				clearTimeout(timer);
				resolve(false);
			}
		});
		child.on("close", (code) => {
			if (!done) {
				done = true;
				clearTimeout(timer);
				lines.push(`exit ${code}`);
				resolve(code === 0);
			}
		});
	});
	if (project.deployMode === "ssh") {
		if (!str(project.sshHost)) return {
			ok: false,
			log: "未配置 SSH 主机"
		};
		const safeToken = (value, label, pattern) => {
			const v = value.trim();
			if (v === "") return "";
			if (!pattern.test(v)) throw new Error(`${label} 含非法字符：${v}`);
			return v;
		};
		let remote;
		try {
			const sshHost = safeToken(str(project.sshHost), "SSH 主机", /^[A-Za-z0-9_.@:-]+$/);
			const remoteDir = safeToken(str(project.remoteDir) || ".", "远端目录", /^[A-Za-z0-9_./-]+$/);
			const image2 = safeToken(image, "镜像名", /^[A-Za-z0-9_.:-]+$/);
			const container2 = safeToken(container, "容器名", /^[A-Za-z0-9_.-]+$/);
			remote = `cd ${remoteDir} && docker build -t ${image2} . ; docker rm -f ${container2} ; docker run -d --name ${container2} -p ${safeToken(hostPort, "宿主端口", /^\d{1,5}$/)}:${safeToken(containerPort, "容器端口", /^\d{1,5}$/)} ${image2}`;
			return {
				ok: await run("ssh", [sshHost, remote]),
				log: lines.join("\n")
			};
		} catch (cause) {
			return {
				ok: false,
				log: `部署参数非法，已阻止执行：${String(cause?.message ?? cause)}`
			};
		}
	}
	const workspace = str(project.workspacePath);
	if (!await run("docker", [
		"build",
		"-t",
		image,
		workspace || "."
	], workspace || void 0)) return {
		ok: false,
		log: lines.join("\n")
	};
	await run("docker", [
		"rm",
		"-f",
		container
	]);
	return {
		ok: await run("docker", [
			"run",
			"-d",
			"--name",
			container,
			"-p",
			`${hostPort}:${containerPort}`,
			image
		]),
		log: lines.join("\n")
	};
}
function registerNoteTool(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") return;
	const tool = {
		name: "workbench_note_update",
		description: "用 AI 完善后的完整 Markdown 更新一篇工作台笔记；保留所属笔记本、标签与收藏，只改标题/正文。仅用于工作台笔记完善。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				noteId: {
					type: "string",
					description: "笔记 id。"
				},
				title: {
					type: "string",
					description: "可选新标题；不传保留原标题。"
				},
				content: {
					type: "string",
					description: "完整改进后的 Markdown 正文。"
				}
			},
			required: ["noteId", "content"]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已更新笔记「${v.note?.title ?? ""}」` : `更新失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				const noteId = str(args?.noteId);
				const existing = store.listNotes().find((n) => n.id === noteId);
				if (!existing) return {
					ok: false,
					error: "笔记不存在"
				};
				return {
					ok: true,
					note: await serialized(() => store.saveNote({
						...existing,
						title: str(args?.title) || existing.title,
						content: str(args?.content)
					}))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), "workbench: note update tool");
	else ctx.tools.register(tool);
	console.log("[dsh-workbench] 已注册工具 workbench_note_update");
}
function registerProductTools(ctx, store) {
	if (ctx?.tools === void 0 || typeof ctx.tools.register !== "function") {
		console.warn("[dsh-workbench] tools 服务不可用：产品工具未注册");
		return;
	}
	const noteTool = {
		name: "workbench_product_note_publish",
		description: "把一条产品设计笔记写入工作台的产品笔记本（走现有 notes 保存与工作区 Markdown 镜像）。产品 AI 生成 PRD 时按功能/需求逐条调用。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: {
					type: "string",
					description: "产品 id。"
				},
				mapId: {
					type: "string",
					description: "导图 id（不传则归到该产品第一张导图）。"
				},
				featureId: {
					type: "string",
					description: "导图节点 id（功能/需求）。"
				},
				moduleId: {
					type: "string",
					description: "模块/业务节点 id。"
				},
				platform: {
					type: "string",
					enum: [
						"pc",
						"mobile",
						"tablet",
						"all"
					],
					description: "端。"
				},
				title: {
					type: "string",
					description: "笔记标题。"
				},
				content: {
					type: "string",
					description: "完整设计笔记 Markdown（背景/目标/用户故事/流程/交互/边界/验收）。"
				},
				tags: {
					type: "array",
					items: { type: "string" },
					description: "可选标签。"
				}
			},
			required: [
				"productId",
				"title",
				"content"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已写入笔记「${v.note?.title ?? ""}」` : `写入失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					note: await serialized(() => store.publishProductNote(args))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	const demoTool = {
		name: "workbench_product_demo_publish",
		description: "把产品设计笔记/灵感生成的自包含 HTML Demo 写入工作区并登记，供工作台预览。支持单页（kind=page）与多页产品系统（kind=system，单文件内用导航切页）。style 取值见工作台主题库（clean/editorial/neo/glass/dashboard/bento/tech/cream/aurora/clay/brutal 等）。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: { type: "string" },
				mapId: {
					type: "string",
					description: "导图 id（不传则归到该产品第一张导图）。"
				},
				scope: {
					type: "string",
					enum: ["feature", "all"]
				},
				kind: {
					type: "string",
					enum: ["page", "system"],
					description: "page=单页面原型；system=带导航的多页产品系统。"
				},
				platform: {
					type: "string",
					enum: [
						"pc",
						"mobile",
						"tablet",
						"all"
					],
					description: "目标端，影响布局与主题。"
				},
				style: {
					type: "string",
					description: "主题 id：clean | editorial | neo | glass | dashboard | bento | tech | cream | aurora | clay | brutal | padflow"
				},
				featureId: {
					type: "string",
					description: "scope=feature 时的导图节点 id。"
				},
				title: { type: "string" },
				html: {
					type: "string",
					description: "完整单文件 HTML（内联 CSS/JS，无外部依赖）。"
				}
			},
			required: [
				"productId",
				"scope",
				"style",
				"html"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已生成 Demo「${v.demo?.title ?? ""}」` : `生成失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					demo: await serialized(() => store.saveProductDemo(args))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	const progressTool = {
		name: "workbench_demo_progress_publish",
		description: "Demo 生成过程中的进度上报。开始时 step=0 status=running；每个里程碑调用一次；结束时 status=done；失败时 status=failed 并说明原因。工作台 Demo 页会实时展示。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: { type: "string" },
				demoId: {
					type: "string",
					description: "Demo id（若已有）。"
				},
				step: {
					type: "number",
					description: "当前步（从 1 开始）。"
				},
				total: {
					type: "number",
					description: "总步数。"
				},
				status: {
					type: "string",
					enum: [
						"running",
						"done",
						"failed"
					]
				},
				message: {
					type: "string",
					description: "当前步骤说明（做了什么/正在做什么）。"
				}
			},
			required: [
				"productId",
				"step",
				"total",
				"status",
				"message"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `进度 ${v.progress?.step ?? 0}/${v.progress?.total ?? 0} 已记录` : `上报失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					progress: await serialized(() => store.saveDemoProgress(args))
				};
			} catch (cause) {
				return {
					ok: false,
					error: String(cause?.message ?? cause)
				};
			}
		}
	};
	const register = (tool, label) => {
		if (typeof ctx.effect === "function") ctx.effect(() => ctx.tools.register(tool), `workbench: ${label}`);
		else ctx.tools.register(tool);
		console.log(`[dsh-workbench] 已注册工具 ${tool.name}`);
	};
	register(noteTool, "product note tool");
	register(demoTool, "product demo tool");
	register(progressTool, "demo progress tool");
}
const name = "dsh-workbench";
const inject = ["webServer", "tools"];
function apply(ctx) {
	const dbFile = process.env.DSH_WORKBENCH_DB ?? join(dataDir(), "dsh-workbench.sqlite");
	let store;
	if (DatabaseSync) store = new SqliteStore(dbFile);
	else store = new JsonStore(dbFile.replace(/\.sqlite$/, ".json"));
	console.log(`[dsh-workbench] ${store.engine} 存储就绪：${store.file}`);
	let ideaModule = null;
	try {
		if (typeof store.connection === "function") ideaModule = createIdeaModule({
			db: store.connection(),
			dataDir: dataDir(),
			prefix: PREFIX,
			onRunClosed: (runId, status) => {
				try {
					agentModule?.store.finishDispatchByRun(runId, status);
				} catch (cause) {
					console.warn("[dsh-workbench] 派发收尾失败：", String(cause));
				}
			},
			ensureUnifiedProject: (workspacePath, name) => {
				try {
					return store.ensureProject?.(workspacePath, name)?.id ?? "";
				} catch {
					return "";
				}
			}
		});
	} catch (cause) {
		console.warn("[dsh-workbench] 灵感模块初始化失败（其它功能不受影响）：", String(cause));
	}
	if (ideaModule !== null) try {
		ideaModule.registerTools(ctx);
	} catch (cause) {
		console.warn("[dsh-workbench] 灵感工具注册失败：", String(cause));
	}
	else console.warn("[dsh-workbench] 灵感需要 SQLite，当前为 JSON 兜底存储：灵感入口将提示不可用");
	let agentModule = null;
	try {
		if (typeof store.connection === "function") agentModule = createAgentModule({
			db: store.connection(),
			dataDir: dataDir(),
			prefix: PREFIX,
			ctx
		});
	} catch (cause) {
		console.warn("[dsh-workbench] 智能体团队初始化失败（主工作台不受影响）：", String(cause));
	}
	if (agentModule !== null) try {
		agentModule.registerTools(ctx);
	} catch (cause) {
		console.warn("[dsh-workbench] 团队工具注册失败：", String(cause));
	}
	else console.warn("[dsh-workbench] 智能体团队需要 SQLite，当前为 JSON 兜底存储：团队入口将提示不可用");
	registerNewsTool(ctx, store);
	registerBugTool(ctx, store);
	registerProductTools(ctx, store);
	registerNoteTool(ctx, store);
	registerModuleTool(ctx, store);
	registerTestCaseTool(ctx, store);
	registerTestFlowTools(ctx, store);
	const webServer = ctx.webServer;
	if (webServer === void 0 || typeof webServer.register !== "function") {
		console.warn("[dsh-workbench] webServer 不可用：工作台接口未注册");
		return;
	}
	const handler = (req, res) => {
		(async () => {
			const url = new URL(req.url ?? "/", "http://dsh.internal");
			const path = url.pathname.slice(14) || "/";
			const method = (req.method ?? "GET").toUpperCase();
			try {
				if (ideaModule !== null && await ideaModule.handle(req, res, path, method, url)) return;
				if (agentModule !== null && await agentModule.handle(req, res, path, method, url)) return;
				if (method === "GET" && (path === "/state" || path === "/")) {
					send(res, 200, store.readState());
					return;
				}
				if (method === "GET" && path === "/health") {
					send(res, 200, {
						ok: true,
						engine: store.engine,
						file: basename(store.file),
						sqlite: store.sqliteVersion(),
						revision: store.readState().revision,
						...store.stats()
					});
					return;
				}
				if (method === "GET" && path === "/export") {
					send(res, 200, store.readState(), { "content-disposition": "attachment; filename=\"dsh-workbench.json\"" });
					return;
				}
				if (method === "PUT" && path === "/state") {
					const body = await readJson(req);
					const state = normalizeState(body?.state);
					send(res, 200, await serialized(() => {
						const current = store.readState().revision;
						if (body?.revision !== void 0 && Number(body.revision) !== current) {
							const conflict = /* @__PURE__ */ new Error("revision_conflict");
							conflict.code = "revision_conflict";
							conflict.current = store.readState();
							throw conflict;
						}
						return { revision: store.writeState(state) };
					}));
					return;
				}
				if (path === "/sync/meta" || path === "/sync/delta" || path === "/sync/push") {
					if (store.engine !== "sqlite") {
						send(res, 501, {
							error: "sync_requires_sqlite",
							message: "增量同步依赖 node:sqlite 存储；当前为 JSON 兜底"
						});
						return;
					}
					const db = store.connection();
					if (method === "GET" && path === "/sync/meta") {
						send(res, 200, syncMeta(db));
						return;
					}
					if (method === "GET" && path === "/sync/delta") {
						send(res, 200, syncDelta(db, {
							since: url.searchParams.get("since"),
							entity: url.searchParams.get("entity"),
							limit: url.searchParams.get("limit")
						}));
						return;
					}
					if (method === "POST" && path === "/sync/push") {
						const body = await readJson(req);
						send(res, 200, await serialized(() => syncPush(db, body, store)));
						return;
					}
				}
				if (method === "GET" && path === "/news") {
					send(res, 200, store.listNews());
					return;
				}
				if (method === "POST" && path === "/news/topics") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						topic: await serialized(() => store.saveNewsTopic(body?.topic ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/news/topics/")) {
					const id = decodeURIComponent(path.slice(13));
					await serialized(() => store.deleteNewsTopic(id));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "GET" && path === "/notes") {
					const withArchived = url.searchParams.get("archived") === "1";
					send(res, 200, {
						notes: store.listNotes(withArchived),
						notebooks: store.listNotebooks()
					});
					return;
				}
				if (method === "GET" && path === "/notes/config") {
					send(res, 200, store.getExportConfig());
					return;
				}
				if (method === "POST" && path === "/notes/config") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						...await serialized(() => store.setExportDir(str(body?.exportDir)))
					});
					return;
				}
				if (method === "POST" && path === "/notes/export") {
					const body = await readJson(req);
					const format = str(body?.format) === "pdf" ? "pdf" : "md";
					send(res, 200, await exportNoteFile(store, str(body?.noteId), format, str(body?.html)));
					return;
				}
				if (method === "POST" && path === "/notes/reveal") {
					const body = await readJson(req);
					send(res, 200, await revealExportPath(store, str(body?.path)));
					return;
				}
				if (method === "GET" && path === "/tests") {
					send(res, 200, {
						projects: store.listTestProjects(),
						cases: store.listTestCases(),
						runs: store.listTestRuns()
					});
					return;
				}
				if (method === "POST" && path === "/tests/projects") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						project: await serialized(() => store.saveTestProject(body?.project ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/tests/projects/")) {
					await serialized(() => store.deleteTestProject(decodeURIComponent(path.slice(16))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/tests/cases") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						case: await serialized(() => store.saveTestCase(body?.case ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/tests/cases/")) {
					await serialized(() => store.deleteTestCase(decodeURIComponent(path.slice(13))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/tests/runs") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						run: await serialized(() => store.saveTestRun(body?.run ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/tests/runs/")) {
					await serialized(() => store.deleteTestRun(decodeURIComponent(path.slice(12))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/tests/report") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						filePath: await serialized(() => store.saveTestReport(str(body?.projectId), str(body?.runId), str(body?.html)))
					});
					return;
				}
				if (method === "POST" && path === "/tests/deploy") {
					const body = await readJson(req);
					const project = store.listTestProjects().find((p) => p.id === str(body?.projectId));
					if (!project) {
						send(res, 404, { error: "project_not_found" });
						return;
					}
					send(res, 200, await runDockerDeploy(project));
					return;
				}
				if (method === "GET" && path === "/products") {
					const withArchived = url.searchParams.get("archived") === "1";
					send(res, 200, {
						products: store.listProducts(withArchived),
						demos: store.listProductDemos(),
						modules: store.listModules(str(url.searchParams.get("productId")), void 0, withArchived)
					});
					return;
				}
				if (method === "GET" && path === "/modules") {
					send(res, 200, { modules: store.listModules(str(url.searchParams.get("productId")), str(url.searchParams.get("mapId")), url.searchParams.get("archived") === "1") });
					return;
				}
				if (method === "POST" && path === "/modules") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						module: await serialized(() => store.saveModule(body?.module ?? body))
					});
					return;
				}
				if ((method === "PATCH" || method === "PUT") && path.startsWith("/modules/")) {
					const id = decodeURIComponent(path.slice(9));
					const body = await readJson(req);
					const patch = {
						...body?.module ?? body,
						id,
						patch: true
					};
					if (str(patch?.productId) === "") {
						const existing = store.listModules().find((m) => m.id === id);
						if (existing !== void 0) {
							patch.productId = existing.productId;
							if (patch.mapId === void 0) patch.mapId = existing.mapId;
							if (patch.name === void 0) patch.name = existing.name;
							if (patch.kind === void 0) patch.kind = existing.kind;
							if (patch.platform === void 0) patch.platform = existing.platform;
						}
					}
					send(res, 200, {
						ok: true,
						module: await serialized(() => store.saveModule(patch))
					});
					return;
				}
				if (method === "GET" && path === "/themes") {
					send(res, 200, { themes: store.listThemes({
						platform: str(url.searchParams.get("platform")),
						projectId: str(url.searchParams.get("projectId")),
						includeArchived: url.searchParams.get("archived") === "1"
					}) });
					return;
				}
				if (method === "POST" && path === "/themes") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						theme: await serialized(() => store.saveTheme(body?.theme ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/themes/")) {
					const id = decodeURIComponent(path.slice(8));
					try {
						await serialized(() => store.deleteTheme(id));
						send(res, 200, { ok: true });
					} catch (cause) {
						if (cause?.code === "builtin_locked") {
							send(res, 400, {
								error: "builtin_locked",
								message: "内置主题不可删除"
							});
							return;
						}
						throw cause;
					}
					return;
				}
				if (method === "POST" && path === "/themes/archive") {
					const body = await readJson(req);
					await serialized(() => store.archiveTheme(str(body?.id), body?.archived !== false));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "GET" && path === "/projects") {
					const archived = url.searchParams.get("archived") === "1";
					if (url.searchParams.get("overview") === "1") {
						send(res, 200, { overviews: store.listProjectOverviews(archived) });
						return;
					}
					send(res, 200, { projects: store.listProjects(archived) });
					return;
				}
				if (method === "POST" && path === "/projects") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						project: await serialized(() => store.saveProject(body?.project ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/projects/")) {
					await serialized(() => store.deleteProject(decodeURIComponent(path.slice(10))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "GET" && path === "/products/inputs") {
					send(res, 200, { inputs: store.listProductInputs(str(url.searchParams.get("productId")), str(url.searchParams.get("mapId"))) });
					return;
				}
				if (method === "POST" && path === "/products/inputs") {
					const body = await readJson(req);
					if ((str(body?.kind) || "url") === "image") {
						const product = store.listProducts(true).find((p) => p.id === str(body?.productId));
						if (product === void 0) {
							send(res, 404, { error: "product_not_found" });
							return;
						}
						const decoded = decodeImageDataUrl(body?.dataUrl);
						if (decoded === null) {
							send(res, 400, {
								error: "image_invalid",
								message: "截图格式不支持或超过 2MB"
							});
							return;
						}
						const dir = productInputDir(product);
						mkdirSync(dir, { recursive: true });
						const ext = decoded.mime === "image/png" ? "png" : decoded.mime === "image/gif" ? "gif" : decoded.mime === "image/jpeg" ? "jpg" : "webp";
						const file = join(dir, `${randomUUID().slice(0, 8)}.${ext}`);
						writeFileSync(file, decoded.buffer);
						send(res, 200, {
							ok: true,
							input: await serialized(() => store.addProductInput({
								productId: body?.productId,
								mapId: body?.mapId,
								kind: "image",
								filePath: file,
								mime: decoded.mime,
								width: body?.width,
								height: body?.height,
								size: decoded.buffer.length,
								label: body?.label,
								note: body?.note
							}))
						});
						return;
					}
					send(res, 200, {
						ok: true,
						input: await serialized(() => store.addProductInput(body ?? {}))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/products/inputs/")) {
					await serialized(() => store.deleteProductInput(decodeURIComponent(path.slice(17))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/archive") {
					const body = await readJson(req);
					const target = str(body?.target);
					if (![
						"products",
						"modules",
						"notes"
					].includes(target)) {
						send(res, 400, { error: "bad_target" });
						return;
					}
					await serialized(() => store.setArchived(target, str(body?.id), body?.archived !== false));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "GET" && path === "/products/design-docs") {
					const productId = str(url.searchParams.get("productId") ?? "");
					send(res, 200, { docs: store.listDesignDocs(productId) });
					return;
				}
				if (method === "GET" && path === "/products/progress") {
					const productId = str(url.searchParams.get("productId") ?? "");
					const kind = str(url.searchParams.get("kind") ?? "modules") || "modules";
					send(res, 200, { progress: store.getProductProgress(productId, kind) ?? null });
					return;
				}
				if (method === "POST" && path === "/products/progress") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						progress: await serialized(() => store.saveProductProgress(body?.progress ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/modules/")) {
					await serialized(() => store.deleteModule(decodeURIComponent(path.slice(9))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/products") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						product: await serialized(() => store.saveProduct(body?.product ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/products/demo/")) {
					const id = decodeURIComponent(path.slice(15));
					await serialized(() => store.deleteProductDemo(id));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "GET" && path === "/products/maps") {
					send(res, 200, { maps: store.listProductMaps(str(url.searchParams.get("productId"))) });
					return;
				}
				if (method === "POST" && path === "/products/maps") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						map: await serialized(() => store.saveProductMap(body?.map ?? body))
					});
					return;
				}
				if (method === "PUT" && path === "/products/maps/draft") {
					const body = await readJson(req);
					try {
						send(res, 200, {
							ok: true,
							...await serialized(() => store.saveMapDraft(body ?? {}))
						});
					} catch (cause) {
						if (cause?.code === "draft_conflict") {
							send(res, 409, {
								error: "draft_conflict",
								current: cause.current
							});
							return;
						}
						throw cause;
					}
					return;
				}
				if (method === "GET" && path === "/products/maps/versions") {
					send(res, 200, { versions: store.listMapVersions(str(url.searchParams.get("mapId"))) });
					return;
				}
				if (method === "POST" && path === "/products/maps/versions") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						version: await serialized(() => store.createMapVersion(body?.version ?? body))
					});
					return;
				}
				if (method === "GET" && path === "/products/maps/versions/view") {
					const version = store.getMapVersion(url.searchParams.get("id") ?? "");
					if (!version) {
						send(res, 404, { error: "version_not_found" });
						return;
					}
					send(res, 200, { version });
					return;
				}
				if (method === "POST" && path === "/products/maps/versions/rollback") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						version: await serialized(() => store.rollbackMapVersion(str(body?.mapId), str(body?.versionId)))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/products/maps/versions/")) {
					await serialized(() => store.deleteMapVersion(decodeURIComponent(path.slice(24))));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "DELETE" && path.startsWith("/products/maps/")) {
					const id = decodeURIComponent(path.slice(15));
					await serialized(() => store.deleteProductMap(id));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "DELETE" && path.startsWith("/products/") && path !== "/products/demo") {
					const id = decodeURIComponent(path.slice(10));
					await serialized(() => store.deleteProduct(id));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/products/demo") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						demo: await serialized(() => store.saveProductDemo(body))
					});
					return;
				}
				if (method === "POST" && path === "/products/mindmap") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						product: await serialized(() => store.saveProductMindmap(str(body?.productId), str(body?.mindmap)))
					});
					return;
				}
				if (method === "GET" && path === "/products/demo") {
					const demo = store.getProductDemo(url.searchParams.get("id") ?? "");
					if (!demo) {
						send(res, 404, { error: "demo_not_found" });
						return;
					}
					try {
						const html = readFileSync(demo.filePath);
						res.writeHead(200, {
							"content-type": "text/html; charset=utf-8",
							"cache-control": "no-store",
							"x-content-type-options": "nosniff"
						});
						res.end(html);
					} catch {
						send(res, 404, { error: "demo_file_missing" });
					}
					return;
				}
				if (method === "GET" && path === "/products/demo-progress") {
					send(res, 200, { progress: store.getDemoProgress(str(url.searchParams.get("productId") ?? "")) ?? null });
					return;
				}
				if (method === "POST" && path === "/products/demo-progress") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						progress: await serialized(() => store.saveDemoProgress(body?.progress ?? body))
					});
					return;
				}
				if (method === "GET" && path === "/search/github") {
					const q = str(url.searchParams.get("q")).trim().slice(0, 120);
					const perPage = Math.min(12, Math.max(1, Number(url.searchParams.get("perPage") ?? 6) || 6));
					if (q === "") {
						send(res, 400, { error: "missing_query" });
						return;
					}
					try {
						const controller = new AbortController();
						const timer = setTimeout(() => controller.abort(), 8e3);
						const gh = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perPage}`, {
							headers: {
								"user-agent": "dsh-workbench",
								accept: "application/vnd.github+json"
							},
							signal: controller.signal
						});
						clearTimeout(timer);
						if (!gh.ok) throw new Error(`GitHub HTTP ${gh.status}`);
						const data = await gh.json();
						send(res, 200, {
							ok: true,
							items: Array.isArray(data?.items) ? data.items.map((it) => ({
								fullName: String(it?.full_name ?? ""),
								title: String(it?.name ?? it?.full_name ?? ""),
								url: String(it?.html_url ?? ""),
								summary: String(it?.description ?? "").slice(0, 2e3),
								stars: Number(it?.stargazers_count ?? 0),
								language: String(it?.language ?? ""),
								topics: Array.isArray(it?.topics) ? it.topics.slice(0, 6).map((t) => String(t)) : [],
								updatedAt: String(it?.updated_at ?? "")
							})) : [],
							quota: {
								limit: String(gh.headers.get("x-ratelimit-limit") ?? ""),
								remaining: String(gh.headers.get("x-ratelimit-remaining") ?? "")
							}
						});
					} catch (cause) {
						send(res, 502, {
							error: "github_search_failed",
							message: String(cause?.message ?? cause)
						});
					}
					return;
				}
				if (method === "GET" && path === "/bugs") {
					send(res, 200, {
						projects: store.listBugProjects(),
						bugs: store.listBugs()
					});
					return;
				}
				if (method === "POST" && path === "/bugs/projects") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						project: await serialized(() => store.saveBugProject(body?.project ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/bugs/projects/")) {
					const id = decodeURIComponent(path.slice(15));
					await serialized(() => store.deleteBugProject(id));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "POST" && path === "/bugs/status") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						bug: await serialized(() => store.updateBug({
							bugId: str(body?.bugId),
							status: str(body?.status),
							verification: str(body?.verification)
						}))
					});
					return;
				}
				if (method === "POST" && path === "/bugs") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						bug: await serialized(() => store.saveBug(body?.bug ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/bugs/")) {
					const id = decodeURIComponent(path.slice(6));
					await serialized(() => store.deleteBug(id));
					send(res, 200, { ok: true });
					return;
				}
				if (method === "GET" && path === "/notebooks") {
					send(res, 200, { notebooks: store.listNotebooks() });
					return;
				}
				if (method === "POST" && path === "/notebooks") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						notebook: await serialized(() => store.saveNotebook(body?.notebook ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/notebooks/")) {
					const id = decodeURIComponent(path.slice(11));
					send(res, 200, await serialized(() => store.deleteNotebook(id)));
					return;
				}
				if (method === "POST" && path === "/notes") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						note: await serialized(() => store.saveNote(body?.note ?? body))
					});
					return;
				}
				if (method === "DELETE" && path.startsWith("/notes/")) {
					const id = decodeURIComponent(path.slice(7));
					await serialized(() => store.deleteNote(id));
					send(res, 200, { ok: true });
					return;
				}
				send(res, 404, { error: "not_found" });
			} catch (cause) {
				if (cause?.code === "revision_conflict") {
					send(res, 409, {
						error: "revision_conflict",
						current: cause.current
					});
					return;
				}
				console.warn(`[dsh-workbench] ${method} ${path} 失败：${String(cause)}`);
				send(res, 400, {
					error: "bad_request",
					message: String(cause?.message ?? cause)
				});
			}
		})();
	};
	const route = {
		kind: "prefix",
		path: PREFIX,
		handler
	};
	if (typeof ctx.effect === "function") ctx.effect(() => webServer.register(route), "workbench: /workbench-api");
	else webServer.register(route);
}
export { apply, inject, name };
