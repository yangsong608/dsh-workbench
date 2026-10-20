/**
 * 工作台插件产物自检（不启动 DSH）：
 *  - 包声明 / bundle patch 完整；
 *  - 宿主半侧含 SQLite、API 前缀、乐观版本冲突；
 *  - 浏览器半侧含模块工厂横幅、面板注册、Shadow DOM 与 API 调用；
 *  - 无遗留占位符。
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
}
function read(rel) {
  const file = join(root, rel)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

const pkg = JSON.parse(read('package.json'))
const host = read('lib/index.js')
const client = read('lib/client.js')
const patch = read('cordis.patch.yml')

check('package name = dsh-workbench', pkg.name === 'dsh-workbench', pkg.name)
check('dsh.client.platform = web', pkg.dsh?.client?.platform === 'web')
check('bundle patch 已声明', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('patch 插入 workbench 条目', /id:\s*workbench/.test(patch) && /dsh-workbench/.test(patch))
check('宿主产物存在', host.length > 5000, `${host.length} bytes`)
check('客户端产物存在', client.length > 50000, `${client.length} bytes`)
check('宿主使用 node:sqlite', host.includes('node:sqlite'))
check('宿主暴露 /workbench-api', host.includes('/workbench-api') || host.includes('workbench-api'))
check('宿主实现乐观版本冲突', host.includes('revision_conflict'))
check('宿主首次播种示例数据', host.includes('seed-1'))
check('客户端模块工厂 id 正确', client.includes('id: "dsh-workbench"'))
check('客户端注册 main 面板', client.includes('workbench') && client.includes('main'))
check('客户端使用 Shadow DOM', client.includes('attachShadow'))
check('客户端调用 workbench-api', client.includes('/workbench-api'))
check('客户端含六个视图', ['看板', '时间轴', '日历', '专注', '统计', '四象限'].every(w => client.includes(w)))
check('宿主含新闻表', host.includes('news_topics') && host.includes('news_items'))
check('宿主含新闻写入工具', host.includes('workbench_news_publish'))
check('客户端含新闻视图', client.includes('新闻检索') && client.includes('/dsh-cron'))
check('客户端含新闻订阅表单', client.includes('wb-news-title') && client.includes('workbench-news-'))
check('宿主含新闻条数/AI 总结', host.includes('ai_summary') && host.includes('count'))
check('客户端含侧栏克隆入口', client.includes('dsh-workbench-entry-clone') && client.includes('newSession'))
check('客户端含条数设置与预置主题', client.includes('wb-news-count') && client.includes('财经市场') && client.includes('开源项目'))
check('客户端含水瀑流卡片', client.includes('news-list') && client.includes('columns:3') && client.includes('ni-ai'))
check('宿主含记事本表与接口', host.includes('CREATE TABLE IF NOT EXISTS notes') && host.includes('/notes') && host.includes('notes_seeded') && host.includes('welcomeNote'))
check('客户端含记事本视图', client.includes('notes-wrap') && client.includes('wb-note-title') && client.includes('markdownToHtml'))
check('客户端含笔记自动保存与转任务', client.includes('scheduleNoteSave') && client.includes('convertNoteToTask'))
check('记事本预置欢迎笔记', host.includes('欢迎使用记事本') && client.includes('欢迎使用记事本') === false)
check('宿主含笔记本迁移', host.includes('notebook_id') && host.includes('ensureNotebooks') && host.includes('notebooks'))
check('宿主含导出目录/PDF', host.includes('/notes/config') && host.includes('/notes/export') && host.includes('printHtmlToPdf') && host.includes('runChromePdf'))
check('客户端含笔记本选择', client.includes('wb-notebook-filter') && client.includes('notebook-manage') && client.includes('wb-note-notebook'))
check('客户端含另存/PDF/目录', client.includes('note-saveas') && client.includes('note-pdf') && client.includes('export-dir-save') && client.includes('wb-export-dir'))
check('导出成功可打开文件夹', host.includes('/notes/reveal') && host.includes('revealExportPath') && client.includes('open-export-folder'))
check('宿主含 Bug 项目/工具', host.includes('bug_projects') && host.includes('workbench_bug_update') && host.includes('/bugs/projects'))
check('客户端含 Bug 看板/批量/AI', client.includes('bug-board') && client.includes('bug-submit-selected') && client.includes('submitBugsToAI') && client.includes('PENDING_REPAIR_KEY') && client.includes('queueRepairSession'))
check('宿主含产品/导图/Demo/工具', host.includes('CREATE TABLE IF NOT EXISTS products') && host.includes('workbench_product_note_publish') && host.includes('workbench_product_demo_publish') && host.includes('/products/demo'))
check('客户端含产品导图/笔记/Demo', client.includes('pm-canvas') && client.includes('product-gen-notes') && client.includes('product-gen-demo') && client.includes('product-demo-preview'))
check('笔记本关联工作区与文件镜像', host.includes('workspace_path') && host.includes('syncNoteFile') && client.includes('wb-nb-rename-workspace'))
check('笔记 AI 完善（直接/按要求）', host.includes('workbench_note_update') && client.includes('note-ai-improve') && client.includes('note-ai-requirements') && client.includes('PENDING_NOTE_KEY'))
check('测试表/用例工具/部署', host.includes('CREATE TABLE IF NOT EXISTS test_projects') && host.includes('workbench_testcase_publish') && host.includes('runDockerDeploy') && host.includes('/tests/deploy'))
check('测试客户端用例/执行/报告', client.includes('test-case-list') && client.includes('test-run-case') && client.includes('test-report') && client.includes('test-gen'))
check('测试 Bug 录入/回归', client.includes('createBugFromTest') && client.includes('regressionRun') && host.includes('/bugs/status'))
check('测试待发送队列', client.includes('PENDING_TEST_KEY') && client.includes('pending-test'))
check('统一模块/业务/端模型', host.includes('CREATE TABLE IF NOT EXISTS modules') && host.includes('workbench_module_publish') && client.includes('product-gen-modules') && client.includes('module-grid'))
check('Bug/测试平台字段', host.includes('module_id') && host.includes("platform TEXT NOT NULL DEFAULT 'all'") && client.includes('wb-bug-platform') && client.includes('wb-test-platform'))
check('AI 协同新/旧会话', client.includes('appendToExistingSession') && client.includes('ai-dispatch') && client.includes('retainAgentScope'))
check('测试执行实时动画', client.includes('test-live-bars') && client.includes('test-live-scan') && client.includes('prefers-reduced-motion'))
check('UI 命令面板/模块覆盖', client.includes('cmd-palette') && client.includes('cmd-go') && client.includes('module-coverage') && client.includes('head-pills'))
check('无 TODO 占位符', !/TODO|PLACEHOLDER|FIXME/.test(client + host))

let failed = 0
for (const c of checks) {
  if (!c.ok) failed += 1
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 通过`)
if (failed > 0) process.exitCode = 1
