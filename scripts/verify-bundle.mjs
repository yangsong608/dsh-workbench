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
check('客户端含 Bug 看板/批量/AI', client.includes('bug-board') && client.includes('bug-submit-selected') && client.includes('submitBugsToAI') && client.includes('queueRepairSession') && client.includes('markBugsDispatched'))
check('宿主含产品/导图/Demo/工具', host.includes('CREATE TABLE IF NOT EXISTS products') && host.includes('workbench_product_note_publish') && host.includes('workbench_product_demo_publish') && host.includes('/products/demo'))
check('客户端含产品导图/笔记/Demo', client.includes('pm-canvas') && client.includes('product-gen-notes') && client.includes('product-gen-demo') && client.includes('product-demo-preview'))
check('笔记本关联工作区与文件镜像', host.includes('workspace_path') && host.includes('syncNoteFile') && client.includes('wb-nb-rename-workspace'))
check('笔记 AI 完善（直接/按要求）', host.includes('workbench_note_update') && client.includes('note-ai-improve') && client.includes('note-ai-requirements') && client.includes('queueNoteImprove'))
check('测试表/用例工具/部署', host.includes('CREATE TABLE IF NOT EXISTS test_projects') && host.includes('workbench_testcase_publish') && host.includes('runDockerDeploy') && host.includes('/tests/deploy'))
check('测试客户端用例/执行/报告', client.includes('test-case-list') && client.includes('test-run-case') && client.includes('test-report') && client.includes('test-gen'))
check('测试 Bug 录入/回归', client.includes('createBugFromTest') && client.includes('regressionRun') && host.includes('/bugs/status'))
check('AI 会话统一走 sessions（无刷新）', client.includes('dispatchToNewSession') && client.includes('createSessionIn') && client.includes('sendToSession') && !client.includes('location.reload'))
check('AI 发送走公开 retain（ready 可 resolve）', client.includes('.retain(') && client.includes('gateway') && client.includes('会话打开超时'))
check('导图四布局 + 节点右键菜单', client.includes('productMapGeometry') && client.includes('bilateral') && client.includes('pm-layout') && client.includes('ctx-item'))
check('多导图（product_maps + mapId 贯穿）', host.includes('CREATE TABLE IF NOT EXISTS product_maps') && host.includes('listProductMaps') && host.includes('map_id') && client.includes('pm-map-select') && client.includes('productMapSelected') && client.includes('/products/maps'))
check('统一模块/业务/端模型', host.includes('CREATE TABLE IF NOT EXISTS modules') && host.includes('workbench_module_publish') && client.includes('product-gen-modules') && client.includes('module-grid'))
check('Bug/测试平台字段', host.includes('module_id') && host.includes("platform TEXT NOT NULL DEFAULT 'all'") && client.includes('wb-bug-platform') && client.includes('wb-test-platform'))
check('AI 协同新/旧会话', client.includes('appendToExistingSession') && client.includes('ai-dispatch') && client.includes('retainAgentScope'))
check('测试执行实时动画', client.includes('test-live-bars') && client.includes('test-live-scan') && client.includes('prefers-reduced-motion'))
check('UI 命令面板/模块覆盖', client.includes('cmd-palette') && client.includes('cmd-go') && client.includes('module-coverage') && client.includes('head-pills'))
check('侧栏宽度可拖动', client.includes('side-resizer') && client.includes('--wb-side-w') && client.includes('settings.sideWidth') && client.includes('data-resize'))
check('门户功能区按业务分组', client.includes('PORTAL_GROUPS') && client.includes('portal-group') && /id:\s*["']work["']/.test(client) && /id:\s*["']rd["']/.test(client) && client.includes('工作') && client.includes('研发'))
check('宿主含灵感五张表', ['idea_projects','ideas','idea_inputs','idea_versions','idea_runs'].every(t => host.includes(t)))
check('宿主暴露灵感接口与工具', host.includes('/ideas') && host.includes('workbench_idea_expand') && host.includes('workbench_idea_progress'))
check('宿主提供 vendor 资产路由', host.includes('/assets/vendor/') && host.includes('echarts.min.js') && host.includes('MindElixir.iife.js'))
check('宿主归档旧灵感库', host.includes('product_inspirations_legacy'))
check('客户端含灵感视图骨架', client.includes('idea-root') && client.includes('idea-plot') && client.includes('idea-view'))
check('客户端集成导图与力导引擎', client.includes('MindElixir.iife.js') && client.includes('echarts.min.js') && client.includes('buildForceOption'))
check('灵感含项目与方向切换', client.includes('idea-project-box') && client.includes('idea-direction') && client.includes('idea-project-save'))
check('灵感版本可回滚与删除', client.includes('idea-version-rollback') && client.includes('idea-version-delete') && host.includes('rollback'))
check('记忆与知识接口/工具', host.includes('=== "memory"') && host.includes('=== "knowledge"') && host.includes('workbench_memory_search') && host.includes('workbench_knowledge_search'))
check('知识 FTS 与界面入口', host.includes('knowledge_chunks_fts') && client.includes('agent-memory-open') && client.includes('agent-knowledge-open'))
check('灵感含团队选择与页内会话', client.includes('idea-team') && client.includes('idea-chat') && client.includes('createAgentChat'))
check('页内会话接入会话派发', client.includes('startAgentDispatch') && client.includes('agents/dispatches') && client.includes('session/event'))
check('智能体团队宿主具备路由/种子/工具', host.includes('createAgentModule') && host.includes('产品研发') && host.includes('spawn_teammate') && host.includes('workbench_team_list'))
check('门户含智能体团队区块', client.includes('portal-teams') && client.includes('agent-team-open') && client.includes('智能体团队'))
check('团队/成员弹窗与权限动作', client.includes('agent-member-write') && client.includes('agent-member-save') && client.includes('fileWrite'))
check('灵感含 5 分钟超时与防重复生成', client.includes('生成超过 5 分钟') && /status\s*!==\s*["']running["']/.test(client))
check('灵感项目可从门户同步', client.includes('portalProjects') && client.includes('idea-project-sync') && host.includes('saved.created'))
check('灵感支持自定义角度', client.includes('customAngles') && client.includes('idea-angle-add') && host.includes('sanitizeCustomAngles'))
check('导图有右键菜单与增删改', client.includes('idea-menu') && client.includes('idea-node-sibling') && client.includes('onPlotContext'))
check('版本对比可选 A/B', client.includes('idea-diff-a') && client.includes('diff-a') && client.includes('idea-diff-swap'))
check('底部悬浮导航已移除', !client.includes('wb-dock') && !client.includes('renderDock') && !client.includes('class="dock"'))
check('顶栏含灵感模块名', /idea:\s*["']灵感["']/.test(client) && /idea:\s*["']研发["']/.test(client))
check('旧灵感已移除', !client.includes('productInspiration') && !host.includes('workbench_inspiration_publish') && !client.includes('/products/inspirations'))
check('无 TODO 占位符', !/TODO|PLACEHOLDER|FIXME/.test(client + host))

let failed = 0
for (const c of checks) {
  if (!c.ok) failed += 1
  console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`)
}
console.log(`\n${checks.length - failed}/${checks.length} 通过`)
if (failed > 0) process.exitCode = 1
