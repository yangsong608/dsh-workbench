import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
//#region src/host/index.ts
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
CREATE TABLE IF NOT EXISTS product_inspirations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  feature_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'web',
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  takeaways TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  stars INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
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
	constructor(file) {
		this.file = file;
		mkdirSync(dirname(file), { recursive: true });
		this.db = new DatabaseSync(file);
		this.db.exec(SCHEMA);
		this.migrateNews();
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
			const insTask = this.db.prepare(`INSERT INTO tasks(id, title, descr, note, space_id, status, priority, date, start, end, duration, tags, grp, sort, created_at, updated_at, completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
			const insSub = this.db.prepare("INSERT INTO subtasks(id, task_id, title, done, planned_start, planned_end, note, sort) VALUES(?,?,?,?,?,?,?,?)");
			const insAtt = this.db.prepare("INSERT INTO attachments(id, task_id, name, kind, size, path) VALUES(?,?,?,?,?,?)");
			const insLog = this.db.prepare("INSERT INTO logs(id, task_id, at, type, text) VALUES(?,?,?,?,?)");
			let taskIndex = 0;
			for (const task of byId.values()) {
				const id = str(task.id);
				insTask.run(id, str(task.title, "未命名任务"), str(task.desc), str(task.note), str(task.space, "life"), str(task.status, "next"), str(task.priority, "normal"), task.date ? str(task.date) : null, task.start ? str(task.start) : null, task.end ? str(task.end) : null, Math.max(0, Math.round(num(task.duration))), JSON.stringify(list(task.tags).map((t) => str(t)).filter(Boolean)), task.group ? str(task.group) : null, taskIndex++, str(task.createdAt, now), str(task.updatedAt, now), task.completedAt ? str(task.completedAt) : null);
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
CREATE TABLE IF NOT EXISTS product_inspirations (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  feature_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'web',
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  takeaways TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  stars INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
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
		this.db.exec(`CREATE TABLE IF NOT EXISTS product_inspirations (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, feature_id TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'web', title TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', takeaways TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]', stars INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
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
			this.db.prepare("UPDATE notes SET notebook_id=?, title=?, content=?, tags=?, pinned=?, file_path=?, updated_at=? WHERE id=?").run(notebookId, title, content, JSON.stringify(tags), pinned, filePath, now, id);
			if (existing.file_path && existing.file_path !== filePath) removeFile(existing.file_path);
		} else this.db.prepare("INSERT INTO notes(id, notebook_id, title, content, tags, pinned, file_path, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id, notebookId, title, content, JSON.stringify(tags), pinned, filePath, createdAt, now);
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
	deleteProduct(id) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(id);
		if (product?.workspace_path) try {
			rmSync(join(str(product.workspace_path), ".dsh-workbench", "products", id), {
				recursive: true,
				force: true
			});
		} catch {}
		this.db.prepare("DELETE FROM product_demos WHERE product_id = ?").run(id);
		this.db.prepare("DELETE FROM product_inspirations WHERE product_id = ?").run(id);
		this.db.prepare("DELETE FROM product_demo_progress WHERE product_id = ?").run(id);
		this.db.prepare("DELETE FROM products WHERE id = ?").run(id);
	}
	listProductDemos(productId) {
		return (productId ? this.db.prepare("SELECT * FROM product_demos WHERE product_id = ? ORDER BY created_at DESC").all(productId) : this.db.prepare("SELECT * FROM product_demos ORDER BY created_at DESC").all()).map(toProductDemo);
	}
	getProductDemo(id) {
		const row = this.db.prepare("SELECT * FROM product_demos WHERE id = ?").get(id);
		return row ? toProductDemo(row) : void 0;
	}
	saveProductDemo(input) {
		const product = this.db.prepare("SELECT * FROM products WHERE id = ?").get(str(input?.productId));
		if (!product) throw new Error("产品不存在");
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
		this.db.prepare("INSERT INTO product_demos(id, product_id, style, scope, feature_id, title, file_path, created_at, platform, kind, status) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, product.id, style, scope, featureId, str(input?.title) || `${product.name} · ${style} · ${scope}`, path, now, platform, kind, "ready");
		return toProductDemo(this.db.prepare("SELECT * FROM product_demos WHERE id = ?").get(id));
	}
	listProductInspirations(productId) {
		return (productId ? this.db.prepare("SELECT * FROM product_inspirations WHERE product_id = ? ORDER BY created_at DESC").all(productId) : this.db.prepare("SELECT * FROM product_inspirations ORDER BY created_at DESC").all()).map(toInspiration);
	}
	saveProductInspiration(input) {
		if (!this.db.prepare("SELECT id FROM products WHERE id = ?").get(str(input?.productId))) throw new Error("产品不存在");
		const title = str(input?.title).trim().slice(0, 200);
		if (title === "") throw new Error("灵感标题不能为空");
		const url = normalizeHttpUrl(input?.url);
		const kind = [
			"github",
			"web",
			"article",
			"design",
			"tool",
			"paper"
		].includes(str(input?.kind)) ? str(input?.kind) : "web";
		const id = `insp-${randomUUID().slice(0, 12)}`;
		const now = isoDateTimeSeconds();
		const takeaways = JSON.stringify(list(input?.takeaways).map((x) => str(x).slice(0, 300)).slice(0, 12));
		const tags = JSON.stringify(list(input?.tags).map((x) => str(x).slice(0, 40)).slice(0, 10));
		this.db.prepare("INSERT INTO product_inspirations(id, product_id, feature_id, kind, title, url, source, summary, takeaways, tags, stars, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id, str(input?.productId), str(input?.featureId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60), kind, title, url, str(input?.source).slice(0, 120), str(input?.summary).slice(0, 2e3), takeaways, tags, Math.max(0, Math.round(Number(input?.stars ?? 0)) || 0), now);
		return toInspiration(this.db.prepare("SELECT * FROM product_inspirations WHERE id = ?").get(id));
	}
	deleteProductInspiration(id) {
		this.db.prepare("DELETE FROM product_inspirations WHERE id = ?").run(id);
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
			tags
		});
		if (str(input?.moduleId)) this.db.prepare("UPDATE modules SET note_id=?, status=?, updated_at=? WHERE id=? AND product_id=?").run(note.id, "designed", isoDateTimeSeconds(), str(input?.moduleId), product.id);
		return note;
	}
	listModules(productId) {
		return (productId ? this.db.prepare("SELECT * FROM modules WHERE product_id = ? ORDER BY created_at, id").all(productId) : this.db.prepare("SELECT * FROM modules ORDER BY created_at, id").all()).map(toModule);
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
		let id = str(input?.id);
		if (id === "") id = this.db.prepare("SELECT id FROM modules WHERE product_id=? AND name=? AND kind=?").get(productId, name, kind)?.id ?? `mod-${randomUUID().slice(0, 12)}`;
		const existing = this.db.prepare("SELECT id, created_at FROM modules WHERE id = ?").get(id);
		if (existing) this.db.prepare("UPDATE modules SET product_id=?, parent_id=?, name=?, kind=?, platform=?, description=?, note_id=?, status=?, updated_at=? WHERE id=?").run(productId, str(input?.parentId), name, kind, platform, str(input?.description).slice(0, 8e3), str(input?.noteId), str(input?.status) || "designing", now, id);
		else this.db.prepare("INSERT INTO modules(id, product_id, parent_id, name, kind, platform, description, note_id, status, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, productId, str(input?.parentId), name, kind, platform, str(input?.description).slice(0, 8e3), str(input?.noteId), str(input?.status) || "designing", existing?.created_at ?? now, now);
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
	productInspirations = [];
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
			this.productInspirations = list(parsed.productInspirations);
			this.demoProgress = list(parsed.demoProgress);
			this.modules = list(parsed.modules);
			this.testProjects = list(parsed.testProjects);
			this.testCases = list(parsed.testCases);
			this.testRuns = list(parsed.testRuns);
			this.revision = Number(parsed.revision ?? 0);
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
			productInspirations: this.productInspirations,
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
			productInspirations: this.productInspirations,
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
		this.productInspirations = this.productInspirations.filter((i) => i.productId !== id);
		this.demoProgress = this.demoProgress.filter((p) => p.productId !== id);
		this.products = this.products.filter((p) => p.id !== id);
		this.persistNews();
	}
	listProductDemos(productId) {
		return this.productDemos.filter((d) => productId === void 0 || d.productId === productId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
	}
	getProductDemo(id) {
		return this.productDemos.find((d) => d.id === id);
	}
	saveProductDemo(input) {
		const product = this.products.find((p) => p.id === str(input?.productId));
		if (!product) throw new Error("产品不存在");
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
	listProductInspirations(productId) {
		return this.productInspirations.filter((i) => productId === void 0 || i.productId === productId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
	}
	saveProductInspiration(input) {
		const product = this.products.find((p) => p.id === str(input?.productId));
		if (!product) throw new Error("产品不存在");
		const title = str(input?.title).trim().slice(0, 200);
		if (title === "") throw new Error("灵感标题不能为空");
		const url = normalizeHttpUrl(input?.url);
		const kind = [
			"github",
			"web",
			"article",
			"design",
			"tool",
			"paper"
		].includes(str(input?.kind)) ? str(input?.kind) : "web";
		const insp = {
			id: `insp-${randomUUID().slice(0, 12)}`,
			productId: product.id,
			featureId: str(input?.featureId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60),
			kind,
			title,
			url,
			source: str(input?.source).slice(0, 120),
			summary: str(input?.summary).slice(0, 2e3),
			takeaways: list(input?.takeaways).map((x) => str(x).slice(0, 300)).slice(0, 12),
			tags: list(input?.tags).map((x) => str(x).slice(0, 40)).slice(0, 10),
			stars: Math.max(0, Math.round(Number(input?.stars ?? 0)) || 0),
			createdAt: isoDateTimeSeconds()
		};
		this.productInspirations.push(insp);
		this.persistNews();
		return insp;
	}
	deleteProductInspiration(id) {
		this.productInspirations = this.productInspirations.filter((i) => i.id !== id);
		this.persistNews();
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
	listModules(productId) {
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
		let id = str(input?.id);
		if (id === "") id = this.modules.find((m) => m.productId === productId && m.name === name && m.kind === kind)?.id ?? `mod-${randomUUID().slice(0, 12)}`;
		const existing = this.modules.find((m) => m.id === id);
		const module = {
			id,
			productId,
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
function toProductDemo(row) {
	return {
		id: row.id,
		productId: row.product_id,
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
function toInspiration(row) {
	return {
		id: row.id,
		productId: row.product_id,
		featureId: row.feature_id ?? "",
		kind: row.kind ?? "web",
		title: row.title,
		url: row.url ?? "",
		source: row.source ?? "",
		summary: row.summary ?? "",
		takeaways: jsonList(row.takeaways),
		tags: jsonList(row.tags),
		stars: Number(row.stars ?? 0),
		createdAt: row.created_at
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
/** 灵感 URL 校验：只放行 http/https，防止 javascript: 等注入。 */
function normalizeHttpUrl(raw) {
	const url = str(raw).trim();
	if (url === "") return "";
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`链接无效：${url}`);
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("链接只支持 http/https");
	return parsed.toString().slice(0, 500);
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
	const inspirationTool = {
		name: "workbench_inspiration_publish",
		description: "把调研到的公开资料（GitHub 仓库 / 网络文章 / 设计参考 / 工具）写入产品灵感库，供产品设计与 Demo 生成引用。产品调研任务中按条调用；每条要有可核实的 URL 与一句话价值点。",
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				productId: {
					type: "string",
					description: "产品 id。"
				},
				featureId: {
					type: "string",
					description: "关联的导图节点 id（可空）。"
				},
				kind: {
					type: "string",
					enum: [
						"github",
						"web",
						"article",
						"design",
						"tool",
						"paper"
					],
					description: "资料类型。"
				},
				title: {
					type: "string",
					description: "资料标题（仓库名/文章标题）。"
				},
				url: {
					type: "string",
					description: "http/https 原文链接，不得编造。"
				},
				source: {
					type: "string",
					description: "来源：GitHub / 媒体名 / 站点名。"
				},
				summary: {
					type: "string",
					description: "内容摘要：它是什么、解决什么问题。"
				},
				takeaways: {
					type: "array",
					items: { type: "string" },
					description: "对本产品的借鉴点（2-5 条）。"
				},
				tags: {
					type: "array",
					items: { type: "string" },
					description: "标签（可空）。"
				},
				stars: {
					type: "number",
					description: "GitHub star 数（可空）。"
				}
			},
			required: [
				"productId",
				"kind",
				"title",
				"url",
				"summary"
			]
		},
		output: {
			schema: {},
			render: (_a, v) => [{
				type: "text",
				text: v?.ok ? `已收录灵感「${v.inspiration?.title ?? ""}」` : `写入失败：${String(v?.error ?? "")}`
			}]
		},
		async execute(args) {
			try {
				return {
					ok: true,
					inspiration: await serialized(() => store.saveProductInspiration(args))
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
	register(inspirationTool, "product inspiration tool");
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
					send(res, 200, { modules: store.listModules(str(url.searchParams.get("productId"))) });
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
				if (method === "DELETE" && path.startsWith("/products/inspirations/")) {
					const id = decodeURIComponent(path.slice(23));
					await serialized(() => store.deleteProductInspiration(id));
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
				if (method === "GET" && path === "/products/inspirations") {
					send(res, 200, { inspirations: store.listProductInspirations(str(url.searchParams.get("productId") ?? "")) });
					return;
				}
				if (method === "POST" && path === "/products/inspirations") {
					const body = await readJson(req);
					send(res, 200, {
						ok: true,
						inspiration: await serialized(() => store.saveProductInspiration(body?.inspiration ?? body))
					});
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
//#endregion
export { apply, inject, name };
