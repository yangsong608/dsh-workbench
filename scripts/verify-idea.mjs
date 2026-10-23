// 灵感纯函数自检：graph 校验/合并/差异 + mind-elixir 映射 + ECharts option + 导出。
// 用法：node scripts/verify-idea.mjs
// 说明：源码是 TypeScript，这里用 node:module 的 stripTypeScriptTypes 现场去类型后加载，不引入构建依赖。
import { stripTypeScriptTypes } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`) }
  else { failed += 1; console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`) }
}

/* ---------------- 现场加载 TS ---------------- */
const tmp = join(tmpdir(), `dsh-idea-verify-${process.pid}`)
mkdirSync(join(tmp, 'shared'), { recursive: true })
mkdirSync(join(tmp, 'host'), { recursive: true })
mkdirSync(join(tmp, 'client'), { recursive: true })
function emit(from, to) {
  const code = stripTypeScriptTypes(readFileSync(join(root, from), 'utf8'))
  const rewritten = code
    .replace(/from '\.\.\/shared\/idea-angles\.js'/g, "from '../shared/idea-angles.mjs'")
    .replace(/from '\.\/idea-model\.js'/g, "from './idea-model.mjs'")
  writeFileSync(join(tmp, to), rewritten)
}
emit('src/shared/idea-angles.ts', 'shared/idea-angles.mjs')
emit('src/host/idea-model.ts', 'host/idea-model.mjs')
emit('src/client/idea-model.ts', 'client/idea-model.mjs')
const host = await import(pathToFileURL(join(tmp, 'host/idea-model.mjs')).href)
const client = await import(pathToFileURL(join(tmp, 'client/idea-model.mjs')).href)

/* ---------------- 1. normalizeGraph ---------------- */
console.log('\n[1] graph 校验与规整')
{
  const empty = host.normalizeGraph(null, { title: '测试种子' })
  check('空图生成根节点', empty.graph.nodes.length === 1 && empty.graph.rootId === 'root' && empty.graph.nodes[0].type === 'seed')

  const dup = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' }, { id: 'a', type: 'idea', label: 'A' }, { id: 'a', type: 'idea', label: 'A2' },
  ], edges: [] })
  check('重复 id 被丢弃', dup.graph.nodes.length === 2 && dup.issues.some(i => i.code === 'NODE_ID_DUP'))

  const cycle = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' }, { id: 'a', type: 'idea', label: 'A' }, { id: 'b', type: 'idea', label: 'B' },
  ], edges: [{ from: 'a', to: 'b', kind: 'tree' }, { from: 'b', to: 'a', kind: 'tree' }] })
  check('成环被修正为挂回根', cycle.graph.nodes.every(n => n.parentId !== null || n.id === 'root') && cycle.issues.some(i => i.code === 'CYCLE'))

  const deep = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' }, { id: 'n1', type: 'direction', label: '1' }, { id: 'n2', type: 'idea', label: '2' },
    { id: 'n3', type: 'idea', label: '3' }, { id: 'n4', type: 'idea', label: '4' }, { id: 'n5', type: 'idea', label: '5' },
    { id: 'n6', type: 'idea', label: '6' },
  ], edges: [
    { from: 'root', to: 'n1', kind: 'tree' }, { from: 'n1', to: 'n2', kind: 'tree' }, { from: 'n2', to: 'n3', kind: 'tree' },
    { from: 'n3', to: 'n4', kind: 'tree' }, { from: 'n4', to: 'n5', kind: 'tree' }, { from: 'n5', to: 'n6', kind: 'tree' },
  ] })
  check('超过 4 层被丢弃', deep.graph.nodes.length <= 5 && deep.issues.some(i => i.code === 'DEPTH_LIMIT'))

  const longLabel = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' }, { id: 'a', type: 'idea', label: '这是一个非常非常长的点子标题需要被裁剪掉多余的部分' },
  ], edges: [{ from: 'root', to: 'a', kind: 'tree' }] })
  const label = longLabel.graph.nodes.find(n => n.id === 'a')?.label ?? ''
  check('超长标题被裁剪到 24 字', label.length <= 24 && label.endsWith('…'), label)

  const relate = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' }, { id: 'a', type: 'idea', label: 'A' }, { id: 'b', type: 'idea', label: 'B' },
  ], edges: [{ from: 'root', to: 'a', kind: 'tree' }, { from: 'root', to: 'b', kind: 'tree' }, { from: 'a', to: 'b', kind: 'relate', label: '互补' }, { from: 'a', to: 'b', kind: 'relate' }] })
  check('跨支关联去重并保留标签', relate.graph.edges.filter(e => e.kind === 'relate').length === 1 && relate.graph.edges.some(e => e.label === '互补'))
}

/* ---------------- 2. mergeGraph 保持既有节点 ---------------- */
console.log('\n[2] 继续发散：只追加不动既有')
{
  const base = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' }, { id: 'd1', type: 'direction', label: '用户', angle: 'users', x: 10, y: 20 },
  ], edges: [{ from: 'root', to: 'd1', kind: 'tree' }] }).graph
  const patch = host.normalizeGraph({ rootId: 'root', nodes: [
    { id: 'd1b', type: 'direction', label: '痛点', angle: 'pain', parentId: 'root' },
    { id: 'n1', type: 'idea', label: '点子', parentId: 'd1b' },
  ], edges: [] })
  const merged = host.mergeGraph(base, patch)
  const d1 = merged.graph.nodes.find(n => n.id === 'd1')
  check('新节点被追加', merged.graph.nodes.length === 4)
  check('既有节点坐标不变', d1?.x === 10 && d1?.y === 20)
  check('新节点挂到父级', merged.graph.nodes.find(n => n.id === 'n1')?.parentId === 'd1b')
}

/* ---------------- 2b. 跨批写入：parentId / 关联边指向既有节点 ---------------- */
console.log('\n[2b] 分批写入保持跨批父子与关联边')
{
  let base = host.emptyGraph('跨批')
  const batch = (nodes, edges = []) => host.normalizeGraph(
    { rootId: base.rootId, nodes, edges },
    { knownIds: base.nodes.map(n => n.id) },
  )
  base = host.mergeGraph(base, batch([
    { id: 'd1', type: 'direction', label: '用户与场景', parentId: 'root', angle: 'users' },
    { id: 'd2', type: 'direction', label: '痛点与机会', parentId: 'root', angle: 'pain' },
  ])).graph
  base = host.mergeGraph(base, batch([
    { id: 'n1', type: 'idea', label: '点子1', parentId: 'd1' },
    { id: 'n2', type: 'idea', label: '点子2', parentId: 'd1' },
  ], [{ from: 'n1', to: 'd2', kind: 'relate' }])).graph

  check('跨批 parentId 保留（点子挂在方向下）', base.nodes.find(n => n.id === 'n1')?.parentId === 'd1')
  check('跨批关联边保留', base.edges.some(e => e.kind === 'relate' && e.from === 'n1' && e.to === 'd2'))
  check('同批节点仍正常入图', base.nodes.filter(n => n.type === 'idea').length === 2)

  const cont = host.mergeGraph(base, batch([{ id: 'n3', type: 'idea', label: '子方向', parentId: 'n1' }])).graph
  check('继续发散挂到目标节点', cont.nodes.find(n => n.id === 'n3')?.parentId === 'n1')

  const orphan = host.mergeGraph(base, batch([{ id: 'n4', type: 'idea', label: '孤儿', parentId: 'ghost' }]))
  check('父节点不存在时挂根并上报 PARENT_MISSING',
    orphan.graph.nodes.find(n => n.id === 'n4')?.parentId === 'root'
    && orphan.issues.some(i => i.code === 'PARENT_MISSING'))
}

/* ---------------- 3. diffGraphs ---------------- */
console.log('\n[3] 版本差异')
{
  const a = { v: 1, rootId: 'root', nodes: [{ id: 'root', type: 'seed', label: 'R' }, { id: 'x', type: 'idea', label: '旧文案' }], edges: [{ from: 'root', to: 'x', kind: 'tree' }] }
  const b = { v: 1, rootId: 'root', nodes: [{ id: 'root', type: 'seed', label: 'R' }, { id: 'x', type: 'idea', label: '新文案' }, { id: 'y', type: 'idea', label: '新增' }], edges: [{ from: 'root', to: 'x', kind: 'tree' }, { from: 'root', to: 'y', kind: 'tree' }] }
  const diff = host.diffGraphs(a, b)
  check('新增 1 个', diff.added.length === 1 && diff.added[0].id === 'y')
  check('删除 0 个', diff.removed.length === 0)
  check('改文案 1 条', diff.changed.length === 1 && diff.changed[0].after === '新文案')
  check('边新增 1 条', diff.addedEdges === 1)
}

/* ---------------- 4. 输入摘要 ---------------- */
console.log('\n[4] 输入摘要')
{
  const one = host.inputDigest([{ kind: 'url', url: 'https://a.example' }])
  const two = host.inputDigest([{ kind: 'url', url: 'https://a.example' }])
  const three = host.inputDigest([{ kind: 'url', url: 'https://b.example' }])
  check('稳定摘要', one === two && one.length === 12)
  check('内容变化摘要变化', one !== three)
}

/* ---------------- 5. mind-elixir 双向映射 ---------------- */
console.log('\n[5] mind-elixir 映射')
{
  const graph = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: '根' },
    { id: 'd1', type: 'direction', label: '用户与场景', angle: 'users', parentId: 'root' },
    { id: 'n1', type: 'idea', label: '应届生', detail: '没经验', parentId: 'd1', status: 'kept' },
    { id: 'd2', type: 'direction', label: '痛点', angle: 'pain', parentId: 'root' },
    { id: 'n2', type: 'idea', label: '太贵', parentId: 'd2' },
  ], edges: [{ from: 'n1', to: 'n2', kind: 'relate', label: '互补' }] }).graph
  const mind = client.toMindElixir(graph)
  check('根节点正确', mind.nodeData.id === 'root' && mind.nodeData.topic === '根')
  check('子节点层级正确', (mind.nodeData.children ?? []).length === 2 && (mind.nodeData.children?.[0]?.children ?? []).length === 1)
  const back = client.fromMindElixir(mind, graph)
  check('回环保持节点数', back.nodes.length === graph.nodes.length)
  check('回环保留角度元数据', back.nodes.find(n => n.id === 'd1')?.angle === 'users')
  check('回环保留跨支关联', back.edges.some(e => e.kind === 'relate' && e.label === '互补'))
  mind.nodeData.children?.[0]?.children?.push({ id: 'n9', topic: '新增点子' })
  const grown = client.fromMindElixir(mind, graph)
  check('新增子节点被识别', grown.nodes.some(n => n.id === 'n9' && n.parentId === 'd1'))
}

/* ---------------- 6. ECharts option ---------------- */
console.log('\n[6] 力导图 option')
{
  const graph = { v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: '根', angle: '' },
    { id: 'd1', type: 'direction', label: '用户', angle: 'users' },
    { id: 'n1', type: 'idea', label: '点子', angle: 'users' },
  ], edges: [{ from: 'root', to: 'd1', kind: 'tree' }, { from: 'd1', to: 'n1', kind: 'tree' }, { from: 'root', to: 'n1', kind: 'relate', label: '互补' }] }
  const option = client.buildForceOption(graph, { dark: false })
  const series = option.series[0]
  check('graph + force 布局', series.type === 'graph' && series.layout === 'force')
  check('可拖拽/可缩放', series.draggable === true && series.roam === true)
  check('节点数正确', series.data.length === 3 && series.links.length === 3)
  const relateLink = series.links.find(l => l.source === 'root' && l.target === 'n1')
  check('关联边是虚线并带标签', relateLink.lineStyle.type === 'dashed' && relateLink.label.formatter === '互补')
  check('分类配色存在', series.categories.length >= 2)
}

/* ---------------- 7. 导出 ---------------- */
console.log('\n[7] 导出')
{
  const graph = { v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: '根' },
    { id: 'd1', type: 'direction', label: '用户', angle: 'users', parentId: 'root' },
    { id: 'n1', type: 'idea', label: '点子<&>', detail: '理由', parentId: 'd1' },
  ], edges: [{ from: 'root', to: 'd1', kind: 'tree' }, { from: 'd1', to: 'n1', kind: 'tree' }, { from: 'd1', to: 'n1', kind: 'relate' }] }
  const md = client.graphToMarkdown(graph)
  check('Markdown 有根标题', md.startsWith('# 根'))
  check('Markdown 有层级缩进', md.includes('\n  - 用户') || md.includes('\n  - 用户'))
  const svg = client.graphToSVG(graph, {})
  check('SVG 结构完整', svg.startsWith('<svg') && svg.endsWith('</svg>') && (svg.match(/<rect /g) ?? []).length >= 3)
  check('SVG 转义危险字符', svg.includes('&lt;&amp;&gt;'))
  const layout = client.layoutGraph(graph)
  check('布局覆盖全部节点', graph.nodes.every(n => layout.boxes.has(n.id)))
  check('布局尺寸有限', Number.isFinite(layout.width) && layout.width > 0 && Number.isFinite(layout.height))
  check('导出文件名安全', client.safeName('a/b:c d') === 'a-b-c-d')
}

/* ---------------- 7.5 自定义角度 ---------------- */
console.log('\n[7.5] 自定义角度')
{
  const one = host.sanitizeCustomAngles(['合规', 'Hardware Form'])
  check('中文角度生成 slug id', one.angles.length === 2 && /^[a-z]/.test(one.angles[0].id) && one.angles[0].label === '合规')
  const dedup = host.sanitizeCustomAngles([{ id: 'compliance', label: '合规' }, { id: 'compliance', label: '重复' }])
  check('重复 id 去重', dedup.angles.length === 1 && dedup.issues.some(i => i.code === 'ANGLE_DUP'))
  const many = host.sanitizeCustomAngles(Array.from({ length: 9 }, (_, i) => `角度${i}`))
  check('最多 6 个', many.angles.length === 6)
  const long = host.sanitizeCustomAngles(['这是一个非常非常长的自定义角度名称'])
  check('名称裁剪到 12 字', long.angles[0].label.length <= 12)

  const custom = host.normalizeGraph({ v: 1, rootId: 'root', nodes: [
    { id: 'root', type: 'seed', label: 'R' },
    { id: 'd1', type: 'direction', label: '合规', angle: 'compliance', parentId: 'root' },
    { id: 'n1', type: 'idea', label: 'A', angle: 'bad angle!', parentId: 'd1' },
  ], edges: [] })
  check('合法自定义 angle 保留', custom.graph.nodes.find(n => n.id === 'd1')?.angle === 'compliance')
  check('非法 angle 丢弃', custom.graph.nodes.find(n => n.id === 'n1')?.angle === undefined)
}

/* ---------------- 8. 角度常量 ---------------- */
console.log('\n[8] 角度常量')
{
  check('六个默认角度', host.IDEA_ANGLES.length === 6)
  check('含跨界 id', host.ANGLE_IDS.includes('cross'))
  check('宿主与客户端角度一致', client.ANGLE_COLORS.users === '#2563eb')
}

rmSync(tmp, { recursive: true, force: true })
console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项未通过`}：${passed}/${passed + failed}`)
process.exit(failed === 0 ? 0 : 1)
