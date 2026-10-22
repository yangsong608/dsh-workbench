import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
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
const IDEA_ANGLE_IDS = IDEA_ANGLES.map((a) => a.id).concat("cross");
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
const ANGLE_IDS = IDEA_ANGLE_IDS;
/** 去掉控制字符并裁剪；labels 被裁时补省略号，便于 UI 与 diff 识别。 */
function clampText(value, max, ellipsis = false) {
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
			label: clampText(title, IDEA_LIMITS.title) || "新的灵感",
			detail: "",
			depth: 0,
			parentId: null,
			status: "kept"
		}],
		edges: []
	};
}
function asArray(value) {
	return Array.isArray(value) ? value : [];
}
/**
* 校验并规整一份 graph：
* - 节点去重、类型/标签/详情裁剪，超出 300 个丢弃并记 issue；
* - tree 边按 parentId 补全，成环或悬空的节点挂回根；
* - depth 由根 BFS 重算，超过 4 层的节点丢弃；
* - relate 边两端必须存在、不能自连、去重。
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
	const seen = /* @__PURE__ */ new Set();
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
		if (cleaned.length >= IDEA_LIMITS.nodes) {
			issues.push({
				code: "NODE_LIMIT",
				message: `节点超过 ${IDEA_LIMITS.nodes} 个，后续已丢弃`
			});
			break;
		}
		const rawLabel = clampText(node.label ?? node.topic, IDEA_LIMITS.label, true);
		const type = NODE_TYPES.includes(node.type) ? node.type : "idea";
		const label = rawLabel || (type === "direction" ? "未命名方向" : "未命名点子");
		if (typeof (node.label ?? node.topic) === "string" && (node.label ?? node.topic).length > IDEA_LIMITS.label) issues.push({
			code: "LABEL_CLAMP",
			message: `节点「${label}」标题超长已裁剪`,
			id
		});
		const status = node.status === "dropped" || node.status === "pending" ? node.status : "kept";
		const tags = asArray(node.tags).map((t) => clampText(t, IDEA_LIMITS.tag)).filter(Boolean).slice(0, IDEA_LIMITS.tags);
		const entry = {
			id,
			type,
			label,
			detail: clampText(node.detail, IDEA_LIMITS.detail, true),
			parentId: typeof node.parentId === "string" && node.parentId !== "" ? clampText(node.parentId, 64) : null,
			angle: ANGLE_IDS.includes(clampText(node.angle, 24)) ? clampText(node.angle, 24) : void 0,
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
	const wantedRoot = clampText(input.rootId, 64);
	let rootCandidate = cleaned.find((n) => n.id === wantedRoot && n.type === "seed") ?? cleaned.find((n) => n.type === "seed");
	if (rootCandidate === void 0) {
		if (wantedRoot !== "") {
			rootCandidate = {
				id: wantedRoot,
				type: "seed",
				label: clampText(options.title, IDEA_LIMITS.label) || "灵感",
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
	for (const edge of asArray(input.edges)) {
		if (edge === null || typeof edge !== "object") continue;
		const e = edge;
		const from = clampText(e.from, 64);
		const to = clampText(e.to, 64);
		if (!seen.has(from) || !seen.has(to) || from === to) continue;
		if (e.kind === "relate") {
			const key = [from, to].sort().join("|");
			if (relateKey.has(key)) continue;
			relateKey.add(key);
			relateEdges.push({
				from,
				to,
				kind: "relate",
				label: clampText(e.label, IDEA_LIMITS.label, true) || void 0
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
		if (parentOf(node.id) === void 0) treeParent.set(node.id, rootId);
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
	const list = asArray(log).filter((item) => item !== null && typeof item === "object" && typeof item.message === "string");
	list.push({
		at: (/* @__PURE__ */ new Date()).toISOString(),
		message: clampText(message, 300)
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
function now() {
	const d = /* @__PURE__ */ new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function parseJson(raw, fallback) {
	if (typeof raw !== "string" || raw.trim() === "") return fallback;
	try {
		const parsed = JSON.parse(raw);
		return parsed === null ? fallback : parsed;
	} catch {
		return fallback;
	}
}
const SCHEMA$1 = `
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
CREATE TABLE IF NOT EXISTS idea_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL DEFAULT '',
  workspace_name TEXT NOT NULL DEFAULT '',
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
		this.db.exec(SCHEMA$1);
		this.migrateLegacy();
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
			createdAt: row.created_at,
			updatedAt: row.updated_at
		}));
	}
	saveProject(input) {
		const ts = now();
		const id = typeof input?.id === "string" && input.id !== "" ? input.id : `ip-${randomUUID().slice(0, 8)}`;
		const name = String(input?.name ?? "").trim().slice(0, 60) || "未命名项目";
		const workspacePath = String(input?.workspacePath ?? "").trim().slice(0, 500);
		const workspaceName = String(input?.workspaceName ?? "").trim().slice(0, 80) || (workspacePath === "" ? "" : workspacePath.split("/").filter(Boolean).pop() ?? "");
		if (this.db.prepare("SELECT id, created_at FROM idea_projects WHERE id = ?").get(id)) this.db.prepare("UPDATE idea_projects SET name=?, workspace_path=?, workspace_name=?, updated_at=? WHERE id=?").run(name, workspacePath, workspaceName, ts, id);
		else this.db.prepare("INSERT INTO idea_projects(id, name, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?)").run(id, name, workspacePath, workspaceName, ts, ts);
		return this.listProjects().find((p) => p.id === id) ?? {};
	}
	deleteProject(id) {
		const ideas = this.db.prepare("SELECT id FROM ideas WHERE project_id = ? AND deleted_at IS NULL").all(id);
		for (const idea of ideas) this.deleteIdea(String(idea.id));
		this.db.prepare("DELETE FROM idea_projects WHERE id = ?").run(id);
	}
	ideaRow(row) {
		const draft = parseJson(row.draft_json, null);
		return {
			id: row.id,
			projectId: row.project_id,
			title: row.title,
			brief: row.brief,
			status: row.status,
			currentVersionId: row.current_version_id || "",
			draftRev: Number(row.draft_rev ?? 0),
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
			const graph = parseJson(row.draft_json, null);
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
		const ts = now();
		const id = `idea-${randomUUID().slice(0, 10)}`;
		const title = String(input?.title ?? "").trim().slice(0, IDEA_LIMITS.title) || "未命名灵感";
		const brief = String(input?.brief ?? "").slice(0, IDEA_LIMITS.brief);
		const projectId = String(input?.projectId ?? "").trim().slice(0, 64);
		const graph = normalizeGraph(null, { title }).graph;
		this.db.prepare("INSERT INTO ideas(id, project_id, title, brief, status, current_version_id, draft_rev, draft_json, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, projectId, title, brief, "draft", "", 1, JSON.stringify(graph), ts, ts);
		return this.getIdea(id) ?? {};
	}
	updateIdea(id, patch) {
		const row = this.db.prepare("SELECT * FROM ideas WHERE id = ? AND deleted_at IS NULL").get(id);
		if (!row) throw new Error("灵感不存在");
		const title = patch.title === void 0 ? row.title : String(patch.title).trim().slice(0, IDEA_LIMITS.title) || row.title;
		const brief = patch.brief === void 0 ? row.brief : String(patch.brief).slice(0, IDEA_LIMITS.brief);
		const projectId = patch.projectId === void 0 ? row.project_id : String(patch.projectId).slice(0, 64);
		this.db.prepare("UPDATE ideas SET title=?, brief=?, project_id=?, updated_at=? WHERE id=?").run(title, brief, projectId, now(), id);
		return this.getIdea(id) ?? {};
	}
	deleteIdea(id) {
		this.db.prepare("DELETE FROM idea_inputs WHERE idea_id = ?").run(id);
		this.db.prepare("DELETE FROM idea_runs WHERE idea_id = ?").run(id);
		this.db.prepare("DELETE FROM idea_versions WHERE idea_id = ?").run(id);
		this.db.prepare("DELETE FROM ideas WHERE id = ?").run(id);
	}
	setStatus(id, status) {
		this.db.prepare("UPDATE ideas SET status=?, updated_at=? WHERE id=?").run(status, now(), id);
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
		this.db.prepare("INSERT INTO idea_inputs(id, idea_id, kind, text, url, file_path, mime, width, height, size, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, ideaId, String(input?.kind ?? "text").slice(0, 12), String(input?.text ?? "").slice(0, 2e3), String(input?.url ?? "").slice(0, 1e3), String(input?.filePath ?? "").slice(0, 1e3), String(input?.mime ?? "").slice(0, 60), Math.max(0, Math.round(Number(input?.width ?? 0) || 0)), Math.max(0, Math.round(Number(input?.height ?? 0) || 0)), Math.max(0, Math.round(Number(input?.size ?? 0) || 0)), now());
		this.db.prepare("UPDATE ideas SET updated_at=? WHERE id=?").run(now(), ideaId);
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
		const graph = normalizeGraph(parseJson(row.draft_json, null), {}).graph;
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
		this.db.prepare("UPDATE ideas SET draft_json=?, draft_rev=?, updated_at=? WHERE id=?").run(serialized, next, now(), id);
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
			angles: parseJson(row.angles_json, []),
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
			graph: parseJson(row.graph_json, {
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
		const ts = now();
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
			angles: parseJson(row.angles_json, []),
			status: row.status,
			step: Number(row.step ?? 0),
			total: Number(row.total ?? 0),
			message: row.message,
			log: parseJson(row.log_json, []),
			sessionId: row.session_id,
			error: row.error,
			startedAt: row.started_at,
			finishedAt: row.finished_at
		};
	}
	createRun(ideaId, input) {
		const id = `run-${randomUUID().slice(0, 8)}`;
		this.db.prepare(`INSERT INTO idea_runs(id, idea_id, version_id, kind, target_node_id, angles_json, status, step, total, message, log_json, session_id, error, started_at, finished_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, ideaId, "", String(input?.kind ?? "diverge").slice(0, 12), String(input?.targetNodeId ?? "").slice(0, 64), JSON.stringify(Array.isArray(input?.angles) ? input.angles.slice(0, 8) : []), "running", 0, Math.max(1, Number(input?.total ?? 5) || 5), "已创建生成任务", "[]", "", "", now(), "");
		this.db.prepare("UPDATE ideas SET status='generating', updated_at=? WHERE id=?").run(now(), ideaId);
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
		if (patch.finished !== void 0) set("finished_at", patch.finished ? now() : "");
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
function send$1(res, status, payload, headers = {}) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		...headers
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
function angleLine() {
	return IDEA_ANGLES.map((a, i) => `${i + 1}. ${a.label}（angle="${a.id}"）：${a.hint}`).join("\n");
}
/** 生成提示词：唯一交付契约写死在这里，客户端只负责派发。 */
function buildIdeaPrompt(input) {
	const lines = input.inputs.map((item) => {
		if (item.kind === "image" && item.filePath) return `- 截图：${item.filePath}（请先读取该图片）`;
		if (item.kind === "url" && item.url) return `- 链接：${item.url}（可尝试抓取摘要；失败就跳过）`;
		return `- 文字：${clampText(item.text, 1200)}`;
	});
	const angleText = input.angles.length > 0 ? input.angles.map((id) => IDEA_ANGLES.find((a) => a.id === id)?.label ?? id).join(" / ") : "全部";
	const head = input.mode === "continue" ? `沿着「${input.targetLabel ?? input.targetNodeId}」这个方向继续发散，只扩这一支，不要重做整张图。` : "从 6 个方向把这件事发散开，最后形成一张可继续生长的图。";
	return `你是产品创意发散助手。本次任务${input.mode === "continue" ? "（继续发散）" : "（首次发散）"}。

## 灵感
- 标题：${input.title}
- 正文：${clampText(input.brief, 2e3) || "（无）"}
${lines.length > 0 ? `- 输入：\n${lines.join("\n")}` : ""}

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
只新增目标节点的子方向（2–4 条），不要修改已有节点；新节点的 parentId 指向 "${input.targetNodeId ?? ""}"。
`;
}
function createIdeaModule(options) {
	if (options.db === null || options.db === void 0) return null;
	const store = new IdeaStore(options.db);
	options.prefix;
	function handle(req, res, path, method, url) {
		return (async () => {
			if (path.startsWith("/assets/vendor/")) {
				if (method !== "GET" && method !== "HEAD") {
					fail(res, 405, "method_not_allowed");
					return true;
				}
				const rel = path.slice(15);
				const mime = VENDOR_FILES[rel];
				if (mime === void 0) {
					fail(res, 404, "asset_not_found");
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
					fail(res, 404, "asset_missing");
				}
				return true;
			}
			if (!path.startsWith("/ideas")) return false;
			const [a, b, c, d, e] = path.split("/").filter(Boolean).slice(1);
			try {
				if (a === "projects" && b === void 0) {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							projects: store.listProjects()
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							project: store.saveProject(body ?? {})
						});
						return true;
					}
					fail(res, 405, "method_not_allowed");
					return true;
				}
				if (a === "projects" && b !== void 0 && method === "DELETE") {
					if (!/^[A-Za-z0-9_-]{1,64}$/.test(b)) {
						fail(res, 400, "project_id_invalid");
						return true;
					}
					store.deleteProject(b);
					send$1(res, 200, { ok: true });
					return true;
				}
				if (a === void 0) {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							ideas: store.listIdeas({
								projectId: url.searchParams.get("projectId") ?? "",
								q: url.searchParams.get("q") ?? ""
							})
						});
						return true;
					}
					if (method === "POST") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							idea: store.createIdea(body ?? {})
						});
						return true;
					}
					fail(res, 405, "method_not_allowed");
					return true;
				}
				const ideaId = a;
				if (!/^[A-Za-z0-9_-]{1,64}$/.test(ideaId)) {
					fail(res, 400, "idea_id_invalid");
					return true;
				}
				if (b === void 0) {
					if (method === "GET") {
						const idea = store.getIdea(ideaId);
						if (!idea) {
							fail(res, 404, "idea_not_found");
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
							}
						}
						send$1(res, 200, {
							ok: true,
							idea,
							inputs: store.listInputs(ideaId),
							versions: store.listVersions(ideaId),
							run: store.latestRun(ideaId) ?? null
						});
						return true;
					}
					if (method === "PATCH" || method === "PUT") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							idea: store.updateIdea(ideaId, body ?? {})
						});
						return true;
					}
					if (method === "DELETE") {
						store.deleteIdea(ideaId);
						send$1(res, 200, { ok: true });
						return true;
					}
					fail(res, 405, "method_not_allowed");
					return true;
				}
				if (b === "inputs") {
					if (c === void 0 && method === "POST") {
						const body = await readJson$1(req);
						const kind = String(body?.kind ?? "text");
						if (kind === "image") {
							const decoded = decodeDataUrl(body?.dataUrl);
							if (decoded === null) {
								fail(res, 400, "图片格式不支持或超过 2MB");
								return true;
							}
							const dir = join(ideaDir(store, ideaId), "inputs");
							mkdirSync(dir, { recursive: true });
							const file = join(dir, `${randomUUID().slice(0, 8)}.${extOf(decoded.mime)}`);
							writeFileSync(file, decoded.buffer);
							send$1(res, 200, {
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
								fail(res, 400, "链接必须以 http(s):// 开头");
								return true;
							}
							send$1(res, 200, {
								ok: true,
								input: store.addInput(ideaId, {
									kind: "url",
									url: value.slice(0, 1e3)
								})
							});
							return true;
						}
						send$1(res, 200, {
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
						send$1(res, 200, { ok: true });
						return true;
					}
					fail(res, 405, "method_not_allowed");
					return true;
				}
				if (b === "draft") {
					if (method === "GET") {
						send$1(res, 200, {
							ok: true,
							...store.getDraft(ideaId)
						});
						return true;
					}
					if (method === "PUT") {
						const body = await readJson$1(req);
						const normalized = normalizeGraph(body?.graph, {});
						if (graphBytes(normalized.graph) > IDEA_LIMITS.graph) {
							fail(res, 413, "导图数据过大");
							return true;
						}
						try {
							send$1(res, 200, {
								ok: true,
								rev: store.setDraft(ideaId, normalized.graph, body?.rev === void 0 ? void 0 : Number(body.rev)).rev,
								graph: normalized.graph,
								issues: normalized.issues
							});
						} catch (cause) {
							if (cause?.code === "draft_conflict") send$1(res, 409, {
								ok: false,
								error: "draft_conflict",
								current: store.getDraft(ideaId)
							});
							else throw cause;
						}
						return true;
					}
					fail(res, 405, "method_not_allowed");
					return true;
				}
				if (b === "versions") {
					if (c === void 0) {
						if (method === "GET") {
							send$1(res, 200, {
								ok: true,
								versions: store.listVersions(ideaId)
							});
							return true;
						}
						if (method === "POST") {
							const body = await readJson$1(req);
							const draft = store.getDraft(ideaId);
							const idea = store.getIdea(ideaId);
							send$1(res, 200, {
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
						fail(res, 405, "method_not_allowed");
						return true;
					}
					const versionId = c;
					if (d === void 0) {
						if (method === "GET") {
							const version = store.getVersion(ideaId, versionId);
							if (!version) {
								fail(res, 404, "version_not_found");
								return true;
							}
							send$1(res, 200, {
								ok: true,
								version
							});
							return true;
						}
						if (method === "DELETE") {
							store.deleteVersion(ideaId, versionId);
							send$1(res, 200, { ok: true });
							return true;
						}
						fail(res, 405, "method_not_allowed");
						return true;
					}
					if (d === "rollback" && method === "POST") {
						send$1(res, 200, {
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
							fail(res, 404, "version_not_found");
							return true;
						}
						send$1(res, 200, {
							ok: true,
							diff: diffGraphs(left.graph, right.graph),
							left,
							right
						});
						return true;
					}
					fail(res, 404, "route_not_found");
					return true;
				}
				if (b === "export" && method === "POST") {
					const body = await readJson$1(req);
					const format = String(body?.format ?? "json");
					const content = String(body?.content ?? "");
					if (content === "") {
						fail(res, 400, "导出内容为空");
						return true;
					}
					if (Buffer.byteLength(content, "utf8") > IDEA_LIMITS.graph * 2) {
						fail(res, 413, "导出内容过大");
						return true;
					}
					const idea = store.getIdea(ideaId);
					if (!idea) {
						fail(res, 404, "idea_not_found");
						return true;
					}
					if (body?.toWorkspace === true) {
						const dir = join(ideaDir(store, ideaId), "exports");
						mkdirSync(dir, { recursive: true });
						const ext = format === "markdown" ? "md" : format;
						const file = join(dir, `${clampText(idea.title, 40) || "idea"}-v${body?.versionSeq ?? "draft"}.${ext}`);
						writeFileSync(file, content, "utf8");
						send$1(res, 200, {
							ok: true,
							filePath: file,
							directory: dir
						});
						return true;
					}
					send$1(res, 200, {
						ok: true,
						content,
						filename: `${clampText(idea.title, 40) || "idea"}.${format === "markdown" ? "md" : format}`
					});
					return true;
				}
				if (b === "import" && method === "POST") {
					const normalized = normalizeGraph((await readJson$1(req))?.graph, {});
					send$1(res, 200, {
						ok: true,
						rev: store.setDraft(ideaId, normalized.graph, void 0).rev,
						graph: normalized.graph,
						issues: normalized.issues
					});
					return true;
				}
				if (b === "runs") {
					if (c === void 0 && method === "POST") {
						const body = await readJson$1(req);
						const idea = store.getIdea(ideaId);
						if (!idea) {
							fail(res, 404, "idea_not_found");
							return true;
						}
						const mode = body?.kind === "continue" ? "continue" : "diverge";
						const targetNodeId = String(body?.targetNodeId ?? "");
						const target = store.getDraft(ideaId).graph.nodes.find((n) => n.id === targetNodeId);
						if (mode === "continue" && target === void 0) {
							fail(res, 400, "目标节点不存在");
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
							targetNodeId: targetNodeId || void 0,
							targetLabel: target?.label
						});
						const project = store.listProjects().find((p) => p.id === idea.projectId);
						send$1(res, 200, {
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
							fail(res, 404, "run_not_found");
							return true;
						}
						send$1(res, 200, {
							ok: true,
							run,
							draft: store.getDraft(ideaId)
						});
						return true;
					}
					if (c !== void 0 && d === "finalize" && method === "POST") {
						const body = await readJson$1(req);
						send$1(res, 200, {
							ok: true,
							run: store.finalizeRun(c, body ?? {}),
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
						send$1(res, 200, {
							ok: true,
							run
						});
						return true;
					}
					fail(res, 405, "method_not_allowed");
					return true;
				}
				fail(res, 404, "route_not_found");
				return true;
			} catch (cause) {
				const message = String(cause?.message ?? cause);
				if (message.includes("不存在")) {
					fail(res, 404, message);
					return true;
				}
				console.warn("[dsh-workbench] 灵感接口失败：", message, path);
				fail(res, 500, message);
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
					const patch = normalizeGraph({
						rootId: draft.graph.rootId,
						nodes: args?.nodes,
						edges: args?.edges
					}, {});
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
						versionId = store.finalizeRun(runId, {
							summary: args?.summary,
							inputDigest: inputDigest(store.listInputs(ideaId))
						})?.versionId ?? void 0;
						if (issues.length > 0) store.updateRun(runId, { log: pushRunLog(store.getRun(runId)?.log, issues.map((i) => `${i.code}：${i.message}`).join("；")) });
					}
					return {
						ok: true,
						added: patch.graph.nodes.length - 1,
						nodes: merged.graph.nodes.length,
						rev: saved.rev,
						versionId,
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
					if (status === "failed") store.setStatus(ideaId, "draft");
					if (status === "done") store.finalizeRun(runId, {
						summary: args?.message,
						inputDigest: inputDigest(store.listInputs(ideaId))
					});
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
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_logs_task ON logs(task_id);
CREATE INDEX IF NOT EXISTS idx_news_items_topic ON news_items(topic_id, fetched_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(pinned DESC, updated_at DESC);
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
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
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
			this.db.exec("DELETE FROM subtasks; DELETE FROM attachments; DELETE FROM logs; DELETE FROM tasks; DELETE FROM spaces; DELETE FROM focus_sessions; DELETE FROM settings;");
			const insSpace = this.db.prepare("INSERT INTO spaces(id, name, color, sort, created_at, updated_at) VALUES(?,?,?,?,?,?)");
			spaces.forEach((space, index) => {
				const id = str(space?.id);
				if (id === "") return;
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
				insFocus.run(id, taskIds.has(taskId) ? taskId : null, str(f.startedAt, now), Math.max(0, Math.round(num(f.minutes))), f.completed === false ? 0 : 1);
			});
			const insSetting = this.db.prepare("INSERT INTO settings(key, value) VALUES(?,?)");
			const settings = state.settings && typeof state.settings === "object" ? state.settings : {};
			for (const [key, value] of Object.entries(settings)) insSetting.run(str(key).slice(0, 120), JSON.stringify(value));
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
	listNotes() {
		return this.db.prepare("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC").all().map(toNote);
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
		const existing = this.db.prepare("SELECT id, created_at, file_path FROM notes WHERE id = ?").get(id);
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
			this.db.prepare("UPDATE notes SET notebook_id=?, title=?, content=?, tags=?, pinned=?, file_path=?, map_id=?, updated_at=? WHERE id=?").run(notebookId, title, content, JSON.stringify(tags), pinned, filePath, mapId, now, id);
			if (existing.file_path && existing.file_path !== filePath) removeFile(existing.file_path);
		} else this.db.prepare("INSERT INTO notes(id, notebook_id, title, content, tags, pinned, file_path, map_id, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, notebookId, title, content, JSON.stringify(tags), pinned, filePath, mapId, createdAt, now);
		return toNote(this.db.prepare("SELECT * FROM notes WHERE id = ?").get(id));
	}
	deleteNote(id) {
		const row = this.db.prepare("SELECT file_path FROM notes WHERE id = ?").get(id);
		if (row?.file_path) removeFile(String(row.file_path));
		this.db.prepare("DELETE FROM notes WHERE id = ?").run(id);
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
	listProducts() {
		return this.db.prepare("SELECT * FROM products ORDER BY updated_at DESC, id").all().map(toProduct);
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
		const row = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id);
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
		if (!this.db.prepare("SELECT * FROM products WHERE id = ?").get(productId)) throw new Error("产品不存在");
		const now = isoDateTimeSeconds();
		this.db.prepare("UPDATE products SET mindmap=?, updated_at=? WHERE id=?").run(mindmap, now, productId);
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
		if (existing === void 0) {
			id = `map-${randomUUID().slice(0, 12)}`;
			const order = Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_maps WHERE product_id = ?").get(productId)?.n ?? 0);
			const mindmap = normalizeMindmap(input?.mindmap, name);
			this.db.prepare("INSERT INTO product_maps(id, product_id, name, description, mindmap, sort_order, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, productId, name, description, mindmap, order, now, now);
		} else {
			const mindmap = typeof input?.mindmap === "string" ? normalizeMindmap(input.mindmap, name) : existing.mindmap;
			this.db.prepare("UPDATE product_maps SET name=?, description=?, mindmap=?, updated_at=? WHERE id=?").run(name, description, mindmap, now, id);
		}
		this.syncFirstMapMirror(productId);
		const saved = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(id);
		this.writeMapFile(productId, saved);
		return toProductMap(saved);
	}
	/** 每张导图镜像到工作区 maps/<mapId>.json（与旧的 mindmap.json 并存）。 */
	writeMapFile(productId, map) {
		try {
			const workspace = str(this.db.prepare("SELECT workspace_path FROM products WHERE id = ?").get(productId)?.workspace_path).trim();
			if (workspace === "" || !map) return;
			const dir = join(workspace, ".dsh-workbench", "products", productId, "maps");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, `${map.id}.json`), String(map.mindmap ?? "{\"nodes\":[]}"), "utf8");
		} catch (cause) {
			console.warn(`[dsh-workbench] 导图文件写入失败：${String(cause)}`);
		}
	}
	deleteProductMap(mapId) {
		const row = this.db.prepare("SELECT * FROM product_maps WHERE id = ?").get(mapId);
		if (!row) return;
		if (Number(this.db.prepare("SELECT COUNT(*) AS n FROM product_maps WHERE product_id = ?").get(row.product_id)?.n ?? 0) <= 1) throw new Error("至少保留一张导图");
		this.db.prepare("DELETE FROM product_maps WHERE id = ?").run(mapId);
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
	publishProductNote(input) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(str(input?.productId));
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
			notebookId: product.notebook_id,
			title: str(input?.title) || "产品设计笔记",
			content: str(input?.content),
			tags,
			mapId: str(input?.mapId) || this.defaultMapId(product.id)
		});
		if (str(input?.moduleId)) this.db.prepare("UPDATE modules SET note_id=?, status=?, updated_at=? WHERE id=? AND product_id=?").run(note.id, "designed", isoDateTimeSeconds(), str(input?.moduleId), product.id);
		return note;
	}
	listModules(productId, mapId) {
		const map = str(mapId);
		return (productId ? map === "" || map === "all" ? this.db.prepare("SELECT * FROM modules WHERE product_id = ? ORDER BY created_at, id").all(productId) : this.db.prepare("SELECT * FROM modules WHERE product_id = ? AND map_id = ? ORDER BY created_at, id").all(productId, map) : this.db.prepare("SELECT * FROM modules ORDER BY created_at, id").all()).map(toModule);
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
		const existing = this.db.prepare("SELECT id, created_at FROM modules WHERE id = ?").get(id);
		if (existing) this.db.prepare("UPDATE modules SET product_id=?, map_id=?, parent_id=?, name=?, kind=?, platform=?, description=?, note_id=?, status=?, updated_at=? WHERE id=?").run(productId, mapId, str(input?.parentId), name, kind, platform, str(input?.description).slice(0, 8e3), str(input?.noteId), str(input?.status) || "designing", now, id);
		else this.db.prepare("INSERT INTO modules(id, product_id, map_id, parent_id, name, kind, platform, description, note_id, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id, productId, mapId, str(input?.parentId), name, kind, platform, str(input?.description).slice(0, 8e3), str(input?.noteId), str(input?.status) || "designing", existing?.created_at ?? now, now);
		return toModule(this.db.prepare("SELECT * FROM modules WHERE id = ?").get(id));
	}
	deleteModule(id) {
		this.db.prepare("DELETE FROM modules WHERE id = ?").run(id);
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
		if (existing) this.db.prepare(`UPDATE test_projects SET name=?, description=?, workspace_path=?, product_id=?, module_id=?, platform=?, bug_project_id=?,
        deploy_mode=?, ssh_host=?, remote_dir=?, image=?, container_name=?, host_port=?, container_port=?, updated_at=? WHERE id=?`).run(fields.name, fields.description, fields.workspacePath, fields.productId, fields.moduleId, fields.platform, fields.bugProjectId, fields.deployMode, fields.sshHost, fields.remoteDir, fields.image, fields.containerName, fields.hostPort, fields.containerPort, now, id);
		else this.db.prepare(`INSERT INTO test_projects(id, name, description, workspace_path, product_id, module_id, platform, bug_project_id,
        deploy_mode, ssh_host, remote_dir, image, container_name, host_port, container_port, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, fields.name, fields.description, fields.workspacePath, fields.productId, fields.moduleId, fields.platform, fields.bugProjectId, fields.deployMode, fields.sshHost, fields.remoteDir, fields.image, fields.containerName, fields.hostPort, fields.containerPort, existing?.created_at ?? now, now);
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
		if (existing) this.db.prepare("UPDATE bug_projects SET name=?, workspace_path=?, workspace_name=?, updated_at=? WHERE id=?").run(name, workspacePath, workspaceName, now, id);
		else this.db.prepare("INSERT INTO bug_projects(id, name, workspace_path, workspace_name, created_at, updated_at) VALUES(?,?,?,?,?,?)").run(id, name, workspacePath, workspaceName, existing?.created_at ?? now, now);
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
	demoProgress = [];
	modules = [];
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
			demoProgress: this.demoProgress,
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
			demoProgress: this.demoProgress,
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
	listProducts() {
		return this.products.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
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
	/** 旧 JSON 数据升级：每个产品的 mindmap 迁成「主导图」，artefact 回填 mapId。 */
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
		if (map === void 0) {
			id = `map-${randomUUID().slice(0, 12)}`;
			map = {
				id,
				productId,
				name,
				description,
				mindmap: normalizeMindmap(input?.mindmap, name),
				sortOrder: this.listProductMaps(productId).length,
				createdAt: now,
				updatedAt: now
			};
			this.productMaps.push(map);
		} else {
			map.name = name;
			map.description = description;
			if (typeof input?.mindmap === "string") map.mindmap = normalizeMindmap(input.mindmap, name);
			map.updatedAt = now;
		}
		this.syncFirstMapMirror(productId);
		this.persistNews();
		return map;
	}
	deleteProductMap(mapId) {
		const map = this.productMaps.find((m) => m.id === mapId);
		if (!map) return;
		if (this.listProductMaps(map.productId).length <= 1) throw new Error("至少保留一张导图");
		this.productMaps = this.productMaps.filter((m) => m.id !== mapId);
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
		product.mindmap = mindmap;
		product.updatedAt = isoDateTimeSeconds();
		this.persistNews();
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
	listModules(productId, mapId) {
		if (productId && mapId && mapId !== "all") return this.modules.filter((m) => m.productId === productId && m.mapId === mapId);
		return this.modules.filter((m) => productId === void 0 || m.productId === productId);
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
			parentId: str(input?.parentId),
			name,
			kind,
			platform,
			description: str(input?.description).slice(0, 8e3),
			noteId: str(input?.noteId),
			status: str(input?.status) || "designing",
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		if (existing) Object.assign(existing, module);
		else this.modules.push(module);
		this.persistNews();
		return module;
	}
	deleteModule(id) {
		this.modules = this.modules.filter((m) => m.id !== id);
		this.persistNews();
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
		createdAt: row.created_at,
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
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
function toProductMap(row) {
	return {
		id: row.id,
		productId: row.product_id,
		name: row.name,
		description: row.description ?? "",
		mindmap: row.mindmap ?? "{\"nodes\":[]}",
		sortOrder: Number(row.sort_order ?? 0),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
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
				parentId: { type: "string" },
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
	const ideaModule = typeof store.connection === "function" ? createIdeaModule({
		db: store.connection(),
		dataDir: dataDir(),
		prefix: PREFIX
	}) : null;
	if (ideaModule !== null) ideaModule.registerTools(ctx);
	else console.warn("[dsh-workbench] 灵感需要 SQLite，当前为 JSON 兜底存储：灵感入口将提示不可用");
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
					send(res, 200, {
						notes: store.listNotes(),
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
					send(res, 200, {
						products: store.listProducts(),
						demos: store.listProductDemos(),
						modules: store.listModules(str(url.searchParams.get("productId")))
					});
					return;
				}
				if (method === "GET" && path === "/modules") {
					send(res, 200, { modules: store.listModules(str(url.searchParams.get("productId")), str(url.searchParams.get("mapId"))) });
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
