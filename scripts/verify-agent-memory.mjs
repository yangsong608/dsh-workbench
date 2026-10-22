/** 记忆/知识自检：分块、索引、检索、注入。 */
import { stripTypeScriptTypes } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'dsh-workbench-mem-'))
const copy = (src, dst) => writeFileSync(join(temp, dst), stripTypeScriptTypes(readFileSync(join(root, src), 'utf8'))
  .replace(/from '\.\/agent-model\.js'/g, "from './agent-model.mjs'")
  .replace(/from '\.\/knowledge\.js'/g, "from './knowledge.mjs'"))
copy('src/host/agent-model.ts', 'agent-model.mjs')
copy('src/host/agent-store.ts', 'agent-store.mjs')
copy('src/host/knowledge.ts', 'knowledge.mjs')
const model = await import(join(temp, 'agent-model.mjs'))
const { AgentStore } = await import(join(temp, 'agent-store.mjs'))
const { KnowledgeIndex, chunkText, collectTextFiles } = await import(join(temp, 'knowledge.mjs'))

let pass = 0
let fail = 0
const check = (name, ok) => { if (ok) { pass += 1; console.log(`  ✓ ${name}`) } else { fail += 1; console.log(`  ✗ ${name}`) } }

console.log('[1] 分块')
{
  const chunks = chunkText('a'.repeat(1500), 600, 80)
  check('长文本分块', chunks.length >= 3 && chunks.every(c => c.length <= 600))
  check('空文本无块', chunkText('   ').length === 0)
  const para = '第一段\n\n第二段内容比较长一些\n\n第三段'
  check('优先段落边界', chunkText(para, 600).length === 1)
}

console.log('[2] 文件收集与索引')
{
  const ws = join(temp, 'ws')
  mkdirSync(join(ws, 'docs'), { recursive: true })
  mkdirSync(join(ws, 'node_modules'), { recursive: true })
  writeFileSync(join(ws, 'docs', 'a.md'), '# 交付\n交付证据必须与 PPT 一致，禁止自造百分比。\n')
  writeFileSync(join(ws, 'docs', 'b.txt'), '复盘：48 倍 Run 积压峰值 12784。')
  writeFileSync(join(ws, 'node_modules', 'skip.md'), '不应被索引')
  writeFileSync(join(ws, 'img.png'), 'binary')
  const { files } = collectTextFiles(ws)
  check('只收集文本且跳过 node_modules', files.length === 2 && files.every(f => !f.includes('node_modules')))
  const db = new DatabaseSync(join(temp, 'k.sqlite'))
  const store = new AgentStore(db)
  const kb = new KnowledgeIndex(store.db)
  const indexed = kb.index(ws)
  check('索引写入 docs/chunks', indexed.docs === 2 && indexed.chunks >= 2)
  const hits = kb.search(ws, '交付证据')
  check('FTS 检索命中', hits.length > 0 && hits[0].path.includes('a.md'))
  const miss = kb.search(ws, '不存在的词')
  check('无关查询为空', miss.length === 0)
  const status = kb.status(ws)
  check('状态统计', status.docs === 2 && status.searchable === true)
  db.close()
}

console.log('[3] 记忆 CRUD 与注入')
{
  const db = new DatabaseSync(join(temp, 'm.sqlite'))
  const store = new AgentStore(db)
  const team = store.listTeams()[0]
  const memory = store.addMemory({ scope: 'project', content: '交付口径必须与 PPT 一致', projectPath: '/tmp/ws', teamId: team.id })
  check('写入记忆', String(memory.id).startsWith('mem-'))
  check('按项目读取', store.listMemory({ projectPath: '/tmp/ws' }).some(row => row.content.includes('PPT')))
  const updated = store.updateMemory(String(memory.id), { pinned: true })
  check('置顶更新', updated.pinned === true)
  store.deleteMemory(String(memory.id))
  check('删除记忆', store.listMemory({ projectPath: '/tmp/ws' }).length === 0)
  const text = model.assembleMemory([{ scope: 'project', content: 'A' }, { scope: 'team', content: 'B' }], 100)
  check('注入带作用域', text.includes('[project] A') && text.includes('[team] B'))
  const knowledgeText = model.assembleKnowledge([{ path: 'docs/a.md', chunk: '交付证据', score: 0.1 }], 100)
  check('知识注入带来源', knowledgeText.includes('docs/a.md') && knowledgeText.includes('交付证据'))
  db.close()
}

rmSync(temp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '全部通过' : '存在失败'}：${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
