// 笔记/设计文档版本自检（1.15 C3）：内容变化才建版本、标签变化不建、回滚、保留上限。
// 用法：node scripts/verify-note-version.mjs
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tmp = join(tmpdir(), `dsh-notev-${process.pid}`)
mkdirSync(tmp, { recursive: true })
process.env.DSH_WORKBENCH_DB = join(tmp, 'wb.sqlite')
const reg = []
const host = await import(pathToFileURL(join(root, 'lib/index.js')).href)
host.apply({ webServer: { register(r) { reg.push(r) } }, tools: { register() {} } })
const route = reg.find(r => r.path === '/workbench-api')
const call = (m, u, b) => new Promise(res => {
  const req = { url: `/workbench-api${u}`, method: m, json: async () => b ?? {} }
  route.handler(req, { status: 0, writeHead(s) { this.status = s }, end(p) { res({ status: this.status, body: p ? JSON.parse(p) : null }) } })
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { if (ok) { pass++; console.log('  ✓', n) } else { fail++; console.log('  ✗', n, d) } }

// 1) 建笔记 → 有 v1
const n1 = (await call('POST', '/notes', { note: { title: '设计文档', content: '第一版内容' } })).body.note
let vers = (await call('GET', `/notes/${n1.id}/versions`)).body.versions
check('建笔记后自动有 v1', vers.length === 1 && vers[0].seq === 1, JSON.stringify(vers.map(v => v.seq)))
const v1 = vers[0].id

// 2) 只改标签 → 不建版本（核心）
await call('POST', '/notes', { note: { id: n1.id, title: '设计文档', content: '第一版内容', tags: ['新标签'] } })
vers = (await call('GET', `/notes/${n1.id}/versions`)).body.versions
check('只改标签不建版本', vers.length === 1, `versions=${vers.length}`)

// 3) 改内容 → 建 v2
await call('POST', '/notes', { note: { id: n1.id, title: '设计文档', content: '第二版内容（重要改动）' } })
vers = (await call('GET', `/notes/${n1.id}/versions`)).body.versions
check('改内容后建 v2', vers.length === 2 && vers[0].seq === 2, JSON.stringify(vers.map(v => v.seq)))
check('v2 保存了新内容', vers[0].content === '第二版内容（重要改动）', vers[0].content)
check('v1 历史内容未被覆盖', vers[1].content === '第一版内容', vers[1].content)

// 4) 改标题也算变化 → v3
await call('POST', '/notes', { note: { id: n1.id, title: '设计文档（改名）', content: '第二版内容（重要改动）' } })
vers = (await call('GET', `/notes/${n1.id}/versions`)).body.versions
check('改标题也建版本（v3）', vers.length === 3, `versions=${vers.length}`)

// 5) 回滚到 v1 → 内容恢复，且回滚本身建版本
const rb = await call('POST', `/notes/${n1.id}/versions/${v1}/rollback`, {})
check('回滚成功', rb.status === 200 && rb.body?.ok === true, JSON.stringify(rb.body).slice(0, 80))
check('回滚后内容回到 v1', rb.body?.note?.content === '第一版内容', rb.body?.note?.content)
vers = (await call('GET', `/notes/${n1.id}/versions`)).body.versions
check('回滚本身也建版本（共 4 版）', vers.length === 4, `versions=${vers.length}`)
check('历史版本都还在', vers.some(v => v.seq === 1) && vers.some(v => v.seq === 2) && vers.some(v => v.seq === 3))

// 6) 保留上限：连写 25 次不同内容，应只留 20 版
for (let i = 0; i < 25; i++) {
  await call('POST', '/notes', { note: { id: n1.id, title: '批量', content: `内容 ${i} ${Date.now()}` } })
}
vers = (await call('GET', `/notes/${n1.id}/versions`)).body.versions
check('版本数上限 20', vers.length === 20, `versions=${vers.length}`)
check('保留的是最近 20 版（seq 最大）', vers[0].seq > vers[19].seq, `${vers[0].seq} > ${vers[19].seq}`)

// 7) 不存在的版本
const bad = await call('POST', `/notes/${n1.id}/versions/nv-notexist/rollback`, {})
check('回滚不存在的版本返回 5xx', bad.status >= 400, `status=${bad.status}`)

console.log(`\n${pass}/${pass + fail} 通过`)
process.exit(fail > 0 ? 1 : 0)
