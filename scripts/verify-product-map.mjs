// 产品导图 v2 自检：图模型纯函数 + 存储/REST 集成（mock webServer 走真实分发）。
// 用法：node scripts/verify-product-map.mjs
// 模型层用 node:module 的 stripTypeScriptTypes 现场去类型加载；集成层直接跑 lib/index.js（真实 SqliteStore + 迁移）。
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

/* ---------------- 模型层：现场加载 TS ---------------- */
const tmp = join(tmpdir(), `dsh-pmap-verify-${process.pid}`)
mkdirSync(join(tmp, 'shared'), { recursive: true })
const modelSrc = stripTypeScriptTypes(readFileSync(join(root, 'src/shared/product-graph-model.ts'), 'utf8'))
writeFileSync(join(tmp, 'shared/product-graph-model.mjs'), modelSrc)
const model = await import(pathToFileURL(join(tmp, 'shared/product-graph-model.mjs')).href)

console.log('· 图模型（shared/product-graph-model）')
{
  const v1 = JSON.stringify({ nodes: [
    { id: 'root', label: '产品A', type: 'root', parentId: null },
    { id: 'pn-1', label: '登录', type: 'feature', parentId: 'root' },
    { id: 'pn-2', label: '支持手机号登录', type: 'requirement', parentId: 'pn-1' },
  ] })
  const { graph } = model.productGraphFromV1(v1, '产品A')
  check('v1 → v2 迁移保留节点 id（featureId 不悬空）', graph.nodes.map(n => n.id).sort().join(',') === 'pn-1,pn-2,root')
  check('v1 type 映射到 kind（root/feature/requirement）', graph.nodes.find(n => n.id === 'root')?.kind === 'root' && graph.nodes.find(n => n.id === 'pn-2')?.kind === 'requirement')
  const back = JSON.parse(model.productGraphToV1(graph))
  check('v2 → v1 向后兼容镜像可往返', back.nodes.length === 3 && back.nodes.find(n => n.id === 'pn-2')?.type === 'requirement')

  const normalized = model.normalizeProductGraph({ v: 2, rootId: 'root', nodes: [
    { id: 'root', label: 'X', kind: 'root' },
    { id: 'a', label: '模块A', kind: 'module', parentId: 'root' },
    { id: 'b', label: '功能B', kind: 'feature', parentId: 'a' },
    { id: 'c', label: '环', kind: 'feature', parentId: 'b' },
  ], edges: [{ from: 'b', to: 'c', kind: 'tree' }, { from: 'c', to: 'b', kind: 'tree' }] })
  check('normalize 防环（挂回根并记 issue）', normalized.issues.some(i => i.code === 'CYCLE'))

  const outline = model.parseOutlineToProductGraph('- 登录（模块）\n  - 验证码登录\n  - 一键登录（需求）\n- 订单（业务）', '产品B')
  check('大纲解析 kind 标记（模块/业务/需求）',
    outline.graph.nodes.find(n => n.label === '登录')?.kind === 'module'
    && outline.graph.nodes.find(n => n.label === '一键登录')?.kind === 'requirement'
    && outline.graph.nodes.find(n => n.label === '订单')?.kind === 'business')

  // 导出 → 回读往返：根标题不重复、关联段不产生垃圾节点、detail 后缀不污染 label
  const roundSrc = model.emptyProductGraph('往返产品')
  roundSrc.nodes.push({ id: 'f1', label: '登录', kind: 'feature', parentId: 'root', status: 'kept', detail: '支持手机验证码' })
  roundSrc.edges.push({ from: 'root', to: 'f1', kind: 'tree' })
  roundSrc.edges.push({ from: 'f1', to: 'f1', kind: 'relate', label: '依赖' })
  const exported = model.productGraphToMarkdown(roundSrc)
  const reimported = model.parseOutlineToProductGraph(exported, '往返产品')
  check('导出→回读：根标题不重复', reimported.graph.nodes.filter(n => n.label === '往返产品').length === 1)
  check('导出→回读：关联段不产生垃圾节点', !reimported.graph.nodes.some(n => n.label.includes('↔') || n.label === '关联'))
  check('导出→回读：detail 后缀不污染 label', reimported.graph.nodes.some(n => n.label === '登录'))

  const ideaGraph = {
    rootId: 'root',
    nodes: [
      { id: 'root', type: 'seed', label: '灵感', parentId: null },
      { id: 'd1', type: 'direction', label: '方向一', parentId: 'root', angle: 'users' },
      { id: 'i1', type: 'idea', label: '点子一', parentId: 'd1' },
      { id: 'q1', type: 'question', label: '问题一', parentId: 'd1' },
      { id: 'r1', type: 'risk', label: '风险一', parentId: 'i1' },
    ],
    edges: [{ from: 'root', to: 'd1', kind: 'tree' }, { from: 'd1', to: 'i1', kind: 'tree' }, { from: 'd1', to: 'q1', kind: 'tree' }, { from: 'i1', to: 'r1', kind: 'tree' }],
  }
  const fromIdea = model.productGraphFromIdea(ideaGraph, { title: '产品C' }).graph
  check('灵感导入映射（direction→module / idea→feature）',
    fromIdea.nodes.find(n => n.id === 'd1')?.kind === 'module' && fromIdea.nodes.find(n => n.id === 'i1')?.kind === 'feature')
  check('灵感导入映射（question→需求待定 / risk→需求+风险标签）',
    fromIdea.nodes.find(n => n.id === 'q1')?.kind === 'requirement' && fromIdea.nodes.find(n => n.id === 'q1')?.status === 'pending'
    && fromIdea.nodes.find(n => n.id === 'r1')?.tags?.includes('风险'))
  check('灵感导入保留 angle 溯源标签', fromIdea.nodes.find(n => n.id === 'd1')?.tags?.includes('angle:users'))
  const branch = model.productGraphFromIdea(ideaGraph, { title: '产品C', branchNodeId: 'i1' }).graph
  check('灵感分支导入（i1 子树：不含方向/问题节点）', branch.nodes.some(n => n.id === 'r1') && !branch.nodes.some(n => n.id === 'd1' || n.id === 'q1') && branch.nodes.length === 3)

  // 2026-10-26 回归：返回的是 { graph, issues } 包装对象；整对象当图用会静默退化成只剩根节点
  const wrapped = model.productGraphFromIdea(ideaGraph, { title: '产品C' })
  check('导入返回包装对象 { graph, issues }', Array.isArray(wrapped.graph?.nodes) && wrapped.graph.nodes.length === 5 && Array.isArray(wrapped.issues))
  const bugShape = model.normalizeProductGraph(wrapped, { title: '产品C' })
  check('误传包装对象时 normalize 会退化成根节点（需上层守卫拦截）', bugShape.graph.nodes.length === 1)

  const a = model.emptyProductGraph('P')
  const b = { ...a, nodes: a.nodes.concat([{ id: 'x1', label: '新功能', kind: 'feature', parentId: 'root', status: 'kept' }]) }
  const diff = model.diffProductGraphs(a, b)
  check('diffProductGraphs 版本对比', diff.added.length === 1 && diff.removed.length === 0)

  const withExt = model.normalizeProductGraph({
    v: 2, rootId: 'root',
    nodes: [{ id: 'root', label: 'P', kind: 'root' }, { id: 'n1', label: 'F', kind: 'feature', parentId: 'root', status: 'kept' }],
    edges: [{ from: 'n1', to: 'map-2:n9', kind: 'relate' }],
  }).graph
  const meData = model.toMindElixir(withExt)
  const round = model.fromMindElixir(meData, withExt)
  check('mind-elixir 往返保留跨图引用边', round.edges.some(e => e.to === 'map-2:n9'))
  check('mind-elixir 往返保留 kind', round.nodes.find(n => n.id === 'n1')?.kind === 'feature')
  const option = model.buildProductForceOption(withExt, {})
  check('力导图含跨图引用伪节点', option.series[0].data.some(d => d.id === 'map-2:n9'))
  check('图大小/节点上限生效', model.PRODUCT_GRAPH_LIMITS.nodes === 300 && model.PRODUCT_GRAPH_LIMITS.versions === 50)
}

/* ---------------- 集成层：真实 SqliteStore + REST 分发 ---------------- */
console.log('· 存储与 REST（lib/index.js + 临时 SQLite）')
const dbFile = join(tmp, 'workbench.sqlite')
process.env.DSH_WORKBENCH_DB = dbFile

const registered = []
const ctx = {
  webServer: { register(route) { registered.push(route) } },
  tools: { register() { /* noop */ } },
}
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply(ctx)
const route = registered.find(r => r.kind === 'prefix' && r.path === '/workbench-api')
check('宿主注册 /workbench-api 前缀路由', route !== undefined)

function call(method, url, body) {
  return new Promise(resolve => {
    const req = { url: `/workbench-api${url}`, method, json: async () => body ?? {} }
    const res = {
      status: 0,
      writeHead(status) { this.status = status },
      end(payload) {
        let parsed = null
        try { parsed = payload ? JSON.parse(payload) : null } catch { parsed = payload }
        resolve({ status: this.status, body: parsed })
      },
    }
    route.handler(req, res)
  })
}

// 1. 建产品（自动建笔记本 + 首张导图）
const productRes = await call('POST', '/products', { product: { name: '集成产品', description: 'verify', workspacePath: tmp } })
const product = productRes.body?.product
check('POST /products 建产品', productRes.status === 200 && product?.id !== undefined)

// 2. 首张导图带 v2 图（根节点 kind=root）
const mapsRes = await call('GET', `/products/maps?productId=${product.id}`)
const map = mapsRes.body?.maps?.[0]
check('首张导图自动创建且为 v2 图', map?.graph?.v === 2 && map?.graph?.nodes?.[0]?.kind === 'root')

// 3. 草稿乐观锁：rev 正常 +1；旧 rev 冲突 409
const graph2 = { ...map.graph, nodes: map.graph.nodes.concat([{ id: 'pn-a', label: '功能A', kind: 'feature', parentId: map.graph.rootId, status: 'kept' }]) }
const draftRes = await call('PUT', '/products/maps/draft', { mapId: map.id, graph: graph2, rev: map.graphRev })
check('PUT 草稿 rev 递增', draftRes.status === 200 && draftRes.body?.rev === map.graphRev + 1)
const conflictRes = await call('PUT', '/products/maps/draft', { mapId: map.id, graph: map.graph, rev: map.graphRev })
check('旧 rev 保存冲突返回 409 draft_conflict', conflictRes.status === 409 && conflictRes.body?.error === 'draft_conflict')

// 4. 版本：存档 → 回滚 → 至少保留 1 个
const v1Res = await call('POST', '/products/maps/versions', { version: { mapId: map.id, graph: graph2, source: 'manual', label: 'v1' } })
const v2Res = await call('POST', '/products/maps/versions', { version: { mapId: map.id, graph: draftRes.body.map.graph, source: 'outline', label: '导入' } })
check('存档版本 seq 递增', v1Res.body?.version?.seq === 1 && v2Res.body?.version?.seq === 2)
const rollbackRes = await call('POST', '/products/maps/versions/rollback', { mapId: map.id, versionId: v1Res.body.version.id })
check('回滚=新建 rollback 版本且写回草稿', rollbackRes.body?.version?.source === 'rollback' && rollbackRes.body?.version?.seq === 3)
const delRes1 = await call('DELETE', `/products/maps/versions/${v1Res.body.version.id}`)
const delRes2 = await call('DELETE', `/products/maps/versions/${v2Res.body.version.id}`)
const delRes3 = await call('DELETE', `/products/maps/versions/${rollbackRes.body.version.id}`)
check('删除版本受「至少保留 1 个」保护', delRes1.status === 200 && delRes2.status === 200 && delRes3.status === 400)

// 4b. 灵感导入落库（2026-10-26 回归）：正确传 .graph → 节点全在；误传包装对象 → 400 而非静默写空
{
  const ideaLike = {
    rootId: 'root',
    nodes: [
      { id: 'root', type: 'seed', label: '导入源', parentId: null },
      { id: 'd1', type: 'direction', label: '方向A', parentId: 'root', angle: 'users' },
      { id: 'i1', type: 'idea', label: '点子A1', parentId: 'd1' },
      { id: 'i2', type: 'idea', label: '点子A2', parentId: 'd1' },
    ],
    edges: [{ from: 'root', to: 'd1', kind: 'tree' }, { from: 'd1', to: 'i1', kind: 'tree' }, { from: 'd1', to: 'i2', kind: 'tree' }],
  }
  const converted = model.productGraphFromIdea(ideaLike, { title: '灵感导入图' })
  const okRes = await call('POST', '/products/maps', {
    map: { productId: product.id, name: '灵感导入图', graph: converted.graph, source: 'idea', sourceRef: 'idea-x@v2' },
  })
  check('灵感导入传 .graph：节点全部落库', okRes.status === 200 && (okRes.body?.map?.graph?.nodes ?? []).length === converted.graph.nodes.length && converted.graph.nodes.length === 4)
  const badRes = await call('POST', '/products/maps', {
    map: { productId: product.id, name: '坏形状', graph: converted, source: 'idea' },
  })
  check('误传包装对象被宿主拒绝（400 而非静默空图）', badRes.status === 400 && String(badRes.body?.message ?? '').includes('nodes'))
  await call('DELETE', `/products/maps/${okRes.body?.map?.id}`, undefined)
}

// 5. 跨图引用：合法保留 / 非法剪除 / 删图级联清理
const map2Res = await call('POST', '/products/maps', { map: { productId: product.id, name: '互补图', graph: model.emptyProductGraph('互补图') } })
const map2 = map2Res.body?.map
const extGraph = {
  ...draftRes.body.map.graph,
  edges: draftRes.body.map.graph.edges.concat([
    { from: 'pn-a', to: `${map2.id}:${map2.graph.rootId}`, kind: 'relate' },
    { from: 'pn-a', to: 'map-ghost:n1', kind: 'relate' },
  ]),
}
const extRes = await call('PUT', '/products/maps/draft', { mapId: map.id, graph: extGraph })
const extEdges = extRes.body?.map?.graph?.edges?.filter(e => e.kind === 'relate') ?? []
check('跨图引用：合法保留 / 目标不存在被剪除', extEdges.length === 1 && extEdges[0].to === `${map2.id}:${map2.graph.rootId}`)
await call('POST', '/modules', { module: { productId: product.id, mapId: map2.id, name: '归属模块', kind: 'module' } })
await call('DELETE', `/products/maps/${map2.id}`)
const afterDelete = await call('GET', `/products/maps?productId=${product.id}`)
const cleaned = afterDelete.body?.maps?.find(m => m.id === map.id)
check('删除目标导图级联清理跨图引用', !(cleaned?.graph?.edges ?? []).some(e => String(e.to).startsWith(`${map2.id}:`)))
const modsRes = await call('GET', `/modules?productId=${product.id}`)
check('删除导图后模块失去归属（map_id 置空）', (modsRes.body?.modules ?? []).some(m => m.name === '归属模块' && (m.mapId ?? '') === ''))

// 7b. 入向跨图引用清理：删除被引用节点后，其他导图的引用一并移除
{
  const map3Res = await call('POST', '/products/maps', { map: { productId: product.id, name: '引用图', graph: model.emptyProductGraph('引用图') } })
  const map3 = map3Res.body?.map
  const refGraph = { ...map3.graph, edges: [{ from: map3.graph.rootId, to: `${map.id}:pn-a`, kind: 'relate' }] }
  await call('PUT', '/products/maps/draft', { mapId: map3.id, graph: refGraph })
  const cur = (await call('GET', `/products/maps?productId=${product.id}`)).body.maps.find(m => m.id === map.id)
  const without = {
    ...cur.graph,
    nodes: cur.graph.nodes.filter(n => n.id !== 'pn-a'),
    edges: cur.graph.edges.filter(e => e.from !== 'pn-a' && e.to !== 'pn-a'),
  }
  await call('PUT', '/products/maps/draft', { mapId: map.id, graph: without })
  const check3 = (await call('GET', `/products/maps?productId=${product.id}`)).body.maps.find(m => m.id === map3.id)
  check('删除节点后入向跨图引用一并清理', !(check3.graph.edges ?? []).some(e => String(e.to) === `${map.id}:pn-a`))
}

// 6. v1 旧库迁移：先造 v1 数据再加载
const dbFile2 = join(tmp, 'workbench-v1.sqlite')
const { DatabaseSync } = await import('node:sqlite')
{
  const db = new DatabaseSync(dbFile2)
  db.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', workspace_path TEXT NOT NULL DEFAULT '', notebook_id TEXT NOT NULL DEFAULT '', mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}', styles TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE product_maps (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '主导图', description TEXT NOT NULL DEFAULT '', mindmap TEXT NOT NULL DEFAULT '{"nodes":[]}', sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
  const v1Mindmap = JSON.stringify({ nodes: [
    { id: 'root', label: '旧产品', type: 'root', parentId: null },
    { id: 'legacy-f1', label: '旧功能', type: 'feature', parentId: 'root' },
  ] })
  db.prepare('INSERT INTO products(id,name,mindmap,created_at,updated_at) VALUES(?,?,?,?,?)').run('prod-old', '旧产品', v1Mindmap, '2026-01-01 00:00:00', '2026-01-01 00:00:00')
  db.prepare('INSERT INTO product_maps(id,product_id,name,mindmap,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('map-old', 'prod-old', '主导图', v1Mindmap, '2026-01-01 00:00:00', '2026-01-01 00:00:00')
  db.close()
}
const registered2 = []
process.env.DSH_WORKBENCH_DB = dbFile2
host.apply({ webServer: { register(r) { registered2.push(r) } }, tools: { register() {} } })
const route2 = registered2.find(r => r.kind === 'prefix' && r.path === '/workbench-api')
function call2(method, url, body) {
  return new Promise(resolve => {
    const req = { url: `/workbench-api${url}`, method, json: async () => body ?? {} }
    const res = { status: 0, writeHead(s) { this.status = s }, end(p) { resolve({ status: this.status, body: p ? JSON.parse(p) : null }) } }
    route2.handler(req, res)
  })
}
const migrated = await call2('GET', '/products/maps?productId=prod-old')
const oldMap = migrated.body?.maps?.[0]
check('v1 旧库自动迁移：mindmap → v2 且 id 保留', oldMap?.graph?.nodes?.some(n => n.id === 'legacy-f1') && oldMap?.graph?.v === 2)
const migratedVersions = await call2('GET', `/products/maps/versions?mapId=map-old`)
check('迁移自动存档 v1 版本', (migratedVersions.body?.versions ?? []).some(v => v.source === 'migration'))
check('迁移版本成为当前版本', oldMap?.currentVersionId === (migratedVersions.body?.versions ?? []).find(v => v.source === 'migration')?.id)

// 7. 删除产品级联清理版本行（防孤儿）
{
  const pRes = await call('POST', '/products', { product: { name: '待删产品', workspacePath: tmp } })
  const p = pRes.body?.product
  const mRes = await call('GET', `/products/maps?productId=${p.id}`)
  const m = mRes.body?.maps?.[0]
  await call('POST', '/products/maps/versions', { version: { mapId: m.id, graph: m.graph, source: 'manual', label: 'v1' } })
  await call('DELETE', `/products/${p.id}`)
  const after = await call('GET', `/products/maps/versions?mapId=${m.id}`)
  check('删除产品级联清理导图版本', (after.body?.versions ?? []).length === 0)
}

console.log(`\n${passed}/${passed + failed} 通过`)
rmSync(tmp, { recursive: true, force: true })
if (failed > 0) process.exit(1)
process.exit(0)
