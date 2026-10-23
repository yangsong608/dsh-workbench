/**
 * 智能体团队 · 门户区块与团队/成员弹窗。
 * 只产出 HTML 与调用回调；动作由 app.ts 的 data-act 分发回来。
 */
export interface AgentMember {
  id: string; name: string; handle: string; role: string; intro: string; systemPrompt: string
  model: string; provider: string; tools: string[]; skills: string[]; mcp: string[]
  memoryScope: string; concurrency: number; fileWrite: 'read' | 'write'; enabled: boolean
}
export interface AgentTeam {
  id: string; name: string; desc: string; isDefault: boolean; defaultWorkspace: string
  memberCount: number; members?: AgentMember[]
}

export interface AgentPanelDeps {
  api: string
  esc: (value: unknown) => string
  ic: (name: string, size?: number) => string
  toast: (message: string) => void
  confirm: (message: string) => boolean
  openModal: (html: string) => void
  closeModal: () => void
  /** Shadow DOM 内的 id 查询（document.getElementById 穿不透 Shadow Root）。 */
  q: <T extends HTMLElement = HTMLElement>(id: string) => T | null
}

export const BINDABLE_FEATURES: Array<{ id: string; label: string }> = [
  { id: 'idea.diverge', label: '灵感 · 多方向发散' },
  { id: 'idea.continue', label: '灵感 · 节点继续发散' },
  { id: 'idea.review', label: '灵感 · 结果评审' },
  { id: 'product.design', label: '产品 · 设计发散' },
  { id: 'bug.fix', label: 'Bug · 修复建议' },
  { id: 'test.design', label: '测试 · 用例设计' },
]

const ROLE_LABEL: Record<string, string> = {
  lead: '主理人', product: '产品', architect: '架构', frontend: '前端', backend: '后端', qa: '测试', reviewer: '评审', custom: '自定义',
}

export function roleLabel(role: string): string { return ROLE_LABEL[role] ?? role }

export function createAgentPanel(deps: AgentPanelDeps) {
  let teams: AgentTeam[] = []
  let members: AgentMember[] = []
  interface OptionsCatalog {
    providers: Array<{ id: string; name: string; models: string[] }>
    skills: Array<{ name: string; description: string; source: string }>
    tools: string[]
    mcpServers: string[]
  }
  let catalog: OptionsCatalog = { providers: [], skills: [], tools: [], mcpServers: [] }

  async function load(): Promise<void> {
    try {
      const res = await fetch(`${deps.api}/agents/teams`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      if (Array.isArray(body?.teams)) teams = body.teams
    } catch { /* 团队接口不可用时保持空态，不影响工作台其它功能 */ }
    try {
      const res = await fetch(`${deps.api}/agents/members`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      if (Array.isArray(body?.members)) members = body.members
    } catch { /* ignore */ }
  }

  function sectionHtml(): string {
    const header = `<div class="portal-sec-head"><h2>智能体团队</h2>
      <div class="portal-sec-actions"><span>${teams.length > 0 ? `${teams.length} 支团队` : '默认产品研发团队'}</span>
        <button class="btn tiny" data-act="agent-memory-open">记忆</button>
        <button class="btn tiny" data-act="agent-knowledge-open">知识</button></div></div>`
    if (teams.length === 0) {
      return `${header}<div class="portal-empty">${deps.ic('users', 16)}<div><b>还没有团队</b><span>创建团队并添加智能体，灵感发散时由主理人调度执行。</span></div><button class="btn" data-act="agent-team-new">${deps.ic('plus', 12)}新建团队</button></div>`
    }
    const cards = teams.map(team => `<article class="team-card${team.isDefault ? ' default' : ''}" data-act="agent-team-open" data-id="${deps.esc(team.id)}">
      <div class="team-card-h"><span class="team-ico">${deps.ic('users', 16)}</span>
        <div class="team-card-t"><b>${deps.esc(team.name)}</b><small>${team.isDefault ? '默认 · ' : ''}${team.memberCount} 名成员</small></div>
        <span class="team-go">${deps.ic('arrowR', 13)}</span></div>
      <div class="team-desc">${deps.esc(team.desc || '未填写说明')}</div>
      <div class="team-members">${(team.members ?? []).slice(0, 8).map(member => `<span class="team-chip${member.role === 'lead' ? ' lead' : ''}" title="${deps.esc(member.intro || member.name)}">${deps.esc(member.name)}</span>`).join('') || `<span class="team-chip ghost">${team.memberCount} 名成员</span>`}</div>
    </article>`).join('')
    return `${header}<div class="portal-teams">${cards}<button class="team-card add" data-act="agent-team-new">${deps.ic('plus', 18)}<span>新建团队</span></button></div>`
  }

  async function openTeam(id: string): Promise<void> {
    const res = await fetch(`${deps.api}/agents/teams/${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!res.ok) { deps.toast('团队读取失败'); return }
    const team: AgentTeam = (await res.json()).team
    const rows = (team.members ?? []).map(member => `<div class="agent-row">
      <div class="agent-row-main"><b>${deps.esc(member.name)}</b><span class="agent-role ${member.role}">${roleLabel(member.role)}</span>
        <small>@${deps.esc(member.handle)} · ${member.fileWrite === 'write' ? '可写文件' : '只读'}${member.provider !== '' || member.model !== '' ? ` · ${deps.esc(member.provider !== '' ? `${member.provider}/${member.model}` : member.model)}` : ''}${member.skills.length > 0 ? ` · 技能 ${member.skills.length}` : ''}</small>
        <div class="agent-intro">${deps.esc(member.intro || '（未填写职责）')}</div></div>
      <div class="agent-row-acts">
        <button class="btn tiny" data-act="agent-member-write" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}" title="切换文件权限（下次派发生效）">${member.fileWrite === 'write' ? '改只读' : '改可写'}</button>
        <button class="btn tiny" data-act="agent-member-edit" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}">编辑</button>
        <button class="btn tiny" data-act="agent-member-del" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}">移除</button>
      </div></div>`).join('') || '<div class="agent-empty">还没有成员，先添加一个智能体。</div>'
    const available = members.filter(member => !(team.members ?? []).some(item => item.id === member.id))
    deps.openModal(`<div class="agent-modal"><h3>${deps.esc(team.name)}</h3>
      <div class="agent-team-meta">${team.isDefault ? '默认团队 · ' : ''}${team.memberCount} 名成员${team.defaultWorkspace !== '' ? ` · ${deps.esc(team.defaultWorkspace)}` : ''}</div>
      ${bindingHtml(team)}
      <div class="agent-list">${rows}</div>
      <div class="agent-add-row">
        <select id="agent-add-select"><option value="">选择已有智能体…</option>${available.map(member => `<option value="${deps.esc(member.id)}">${deps.esc(member.name)}（${roleLabel(member.role)}）</option>`).join('')}</select>
        <button class="btn tiny" data-act="agent-member-add" data-team="${deps.esc(team.id)}">添加</button>
        <button class="btn tiny" data-act="agent-member-new" data-team="${deps.esc(team.id)}">＋ 新建智能体</button>
        <span style="margin-left:auto"></span>
        <button class="btn tiny danger" data-act="agent-team-delete" data-id="${deps.esc(team.id)}">删除团队</button>
      </div>
      <div class="agent-foot"><span class="note">运行中改权限不会热生效；下次派发或创建替代成员才生效。</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`)
  }

  async function openMemoryModal(): Promise<void> {
    let memories: any[] = []
    try {
      const res = await fetch(`${deps.api}/agents/memory`, { cache: 'no-store' })
      if (res.ok) memories = (await res.json()).memories ?? []
    } catch { /* 忽略 */ }
    const rows = memories.map(item => `<div class="agent-row"><div class="agent-row-main"><b>[${deps.esc(item.scope)}]</b><div class="agent-intro">${deps.esc(item.content)}</div></div>
      <div class="agent-row-acts"><button class="btn tiny" data-act="agent-memory-del" data-id="${deps.esc(item.id)}">删除</button></div></div>`).join('') || '<div class="agent-empty">还没有记忆。</div>'
    deps.openModal(`<div class="agent-modal"><h3>记忆</h3>
      <div class="agent-team-meta">派发时会按作用域注入；个人/项目也可放文件里</div>
      <div class="agent-list">${rows}</div>
      <div class="m-field"><label>新增记忆</label><textarea id="agent-memory-text" rows="2" placeholder="要长期记住的结论"></textarea></div>
      <div class="agent-add-row"><select id="agent-memory-scope"><option value="project">项目</option><option value="team">团队</option><option value="personal">个人</option></select>
        <button class="btn tiny" data-act="agent-memory-add">添加</button></div>
      <div class="agent-foot"><span class="note">采纳才写入；删除后不再注入</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`)
  }

  async function addMemory(): Promise<void> {
    const content = (deps.q<HTMLTextAreaElement>('agent-memory-text')?.value ?? '').trim()
    const scope = deps.q<HTMLSelectElement>('agent-memory-scope')?.value ?? 'project'
    if (content === '') { deps.toast('先写内容'); return }
    const res = await fetch(`${deps.api}/agents/memory`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope, content }) })
    if (!res.ok) { deps.toast('保存失败'); return }
    await openMemoryModal()
  }

  async function deleteMemory(id: string): Promise<void> {
    await fetch(`${deps.api}/agents/memory/${encodeURIComponent(id)}`, { method: 'DELETE' })
    await openMemoryModal()
  }

  function openKnowledgeModal(): void {
    const path = teams.find(team => team.defaultWorkspace !== '')?.defaultWorkspace ?? ''
    deps.openModal(`<div class="agent-modal"><h3>知识</h3>
      <div class="agent-team-meta">索引工作区文本（md/代码等），派发时按任务检索注入</div>
      <div class="agent-add-row"><input id="agent-kb-path" value="${deps.esc(path)}" placeholder="工作区绝对路径" style="flex:1;min-width:0;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px">
        <button class="btn tiny" data-act="agent-knowledge-index">索引</button><button class="btn tiny" data-act="agent-knowledge-status">状态</button></div>
      <div id="agent-kb-status" class="agent-team-meta"></div>
      <div class="agent-add-row" style="margin-top:8px"><input id="agent-kb-q" placeholder="检索测试…" style="flex:1;min-width:0;height:26px;border:1px solid var(--line);border-radius:7px;background:var(--panel-2);color:var(--text-2);font:inherit;font-size:11px;padding:0 6px">
        <button class="btn tiny" data-act="agent-knowledge-search">检索</button></div>
      <div id="agent-kb-hits" class="agent-list" style="margin-top:8px"></div>
      <div class="agent-foot"><span class="note">索引按工作区隔离，不会读到别的项目</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`)
  }

  async function indexKnowledge(): Promise<void> {
    const path = (deps.q<HTMLInputElement>('agent-kb-path')?.value ?? '').trim()
    if (path === '') { deps.toast('先填工作区路径'); return }
    const box = deps.q('agent-kb-status')
    if (box) box.textContent = '索引中…'
    const res = await fetch(`${deps.api}/agents/knowledge/index`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectPath: path }) })
    const body = await res.json().catch(() => ({}))
    if (box) box.textContent = res.ok ? `已索引 ${body.result?.docs ?? 0} 个文件 / ${body.result?.chunks ?? 0} 个片段` : `索引失败：${body?.message ?? res.status}`
  }

  async function searchKnowledge(): Promise<void> {
    const path = (deps.q<HTMLInputElement>('agent-kb-path')?.value ?? '').trim()
    const q = (deps.q<HTMLInputElement>('agent-kb-q')?.value ?? '').trim()
    const box = deps.q('agent-kb-hits')
    if (path === '' || q === '') { deps.toast('先填路径与关键词'); return }
    const res = await fetch(`${deps.api}/agents/knowledge/search?projectPath=${encodeURIComponent(path)}&q=${encodeURIComponent(q)}`)
    const body = await res.json().catch(() => ({}))
    if (box) box.innerHTML = (body.hits ?? []).map((hit: any) => `<div class="agent-row"><div class="agent-row-main"><b>${deps.esc(hit.path)}</b><div class="agent-intro">${deps.esc(hit.chunk)}</div></div></div>`).join('') || '<div class="agent-empty">没有命中</div>'
  }

  /** 按功能绑定候选执行人；主理人固定调度，不进候选列表。 */
  function bindingHtml(team: AgentTeam): string {
    const bindings = (team as any).bindings ?? {}
    const executors = (team.members ?? []).filter(member => member.role !== 'lead')
    if (executors.length === 0) return ''
    const rows = BINDABLE_FEATURES.map(feature => {
      const selected: string[] = Array.isArray(bindings[feature.id]) ? bindings[feature.id] : []
      return `<div class="agent-bind-row">
        <div class="agent-bind-label">${deps.esc(feature.label)}${selected.length === 0 ? '<small>（未绑定：全体成员）</small>' : ''}</div>
        <div class="agent-bind-chips">${executors.map(member => `<button class="agent-bind-chip${selected.includes(member.id) ? ' on' : ''}" data-act="agent-binding-toggle" data-team="${deps.esc(team.id)}" data-feature="${deps.esc(feature.id)}" data-member="${deps.esc(member.id)}">${deps.esc(member.name)}</button>`).join('')}</div>
      </div>`
    }).join('')
    return `<div class="agent-bind"><div class="agent-bind-head">按功能绑定执行人 <small>主理人负责调度；选中多个时由主理人从中分配候选执行</small></div>${rows}</div>`
  }

  async function toggleBinding(teamId: string, feature: string, memberId: string): Promise<void> {
    const team = teams.find(item => item.id === teamId)
    const current: string[] = Array.isArray((team as any)?.bindings?.[feature]) ? [...(team as any).bindings[feature]] : []
    const index = current.indexOf(memberId)
    if (index >= 0) current.splice(index, 1)
    else current.push(memberId)
    const bindings = { ...((team as any)?.bindings ?? {}), [feature]: current }
    if (current.length === 0) delete bindings[feature]
    await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bindings }),
    })
    await load()
    await openTeam(teamId)
    renderPortalRefresh?.()
  }

  function openTeamForm(): void {
    deps.openModal(`<div class="agent-modal"><h3>新建团队</h3>
      <div class="m-field"><label>团队名称</label><input id="agent-team-name" maxlength="40" placeholder="例如：产品研发"></div>
      <div class="m-field"><label>说明</label><input id="agent-team-desc" maxlength="200" placeholder="这个团队负责什么"></div>
      <div class="m-field"><label>默认工作区（可选）</label><input id="agent-team-ws" maxlength="500" placeholder="/Users/you/work/project"></div>
      <div class="agent-foot"><span class="note">创建后进入团队详情添加成员</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-team-save">创建</button></div></div></div>`)
  }

  function mockText(value: string, hint: string): string {
    return value === '' ? hint : deps.esc(value)
  }

  /** 多选：用 chip 切换，选中值存在隐藏 input 里（逗号分隔）。 */
  function multiSelect(id: string, values: string[], current: string[], emptyHint: string): string {
    if (values.length === 0) return `<div class="agent-empty" style="padding:8px">${deps.esc(emptyHint)}</div>`
    return `<div class="agent-multi" data-multi="${id}">${values.map(value => {
      const on = current.includes(value)
      return `<button type="button" class="agent-multi-item${on ? ' on' : ''}" data-act="agent-toggle-option" data-field="${id}" data-value="${deps.esc(value)}">${deps.esc(value)}</button>`
    }).join('')}</div><input type="hidden" id="${id}" value="${deps.esc(current.join(','))}">`
  }

  async function loadCatalog(): Promise<void> {
    try {
      const res = await fetch(`${deps.api}/agents/options`, { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      catalog = {
        providers: Array.isArray(body.providers) ? body.providers : [],
        skills: Array.isArray(body.skills) ? body.skills : [],
        tools: Array.isArray(body.tools) ? body.tools : [],
        mcpServers: Array.isArray(body.mcpServers) ? body.mcpServers : [],
      }
    } catch { /* 目录不可用时保留手填能力 */ }
  }

  async function openMemberForm(teamId: string, member?: AgentMember): Promise<void> {
    if (catalog.providers.length === 0 && catalog.tools.length === 0) await loadCatalog()
    const m = member
    deps.openModal(`<div class="agent-modal"><h3>${m ? '编辑智能体' : '新建智能体'}</h3>
      <div class="agent-form-grid">
        <div class="m-field"><label>名称</label><input id="agent-name" maxlength="12" value="${deps.esc(m?.name ?? '')}" placeholder="≤12 字"${m ? ' readonly style="opacity:.7"' : ''}></div>
        <div class="m-field"><label>角色</label><select id="agent-role">${['lead','product','architect','frontend','backend','qa','reviewer','custom'].map(role => `<option value="${role}"${m?.role === role ? ' selected' : ''}>${roleLabel(role)}</option>`).join('')}</select></div>
        <div class="m-field"><label>文件权限</label><select id="agent-filewrite"><option value="read"${m?.fileWrite === 'read' ? ' selected' : ''}>只读</option><option value="write"${m?.fileWrite === 'write' ? ' selected' : ''}>可写</option></select></div>
        <div class="m-field"><label>记忆范围</label><select id="agent-memory">${[['none','不读记忆'],['personal','个人'],['project','项目'],['team','团队'],['all','全部']].map(([scope, label]) => `<option value="${scope}"${(m?.memoryScope ?? 'project') === scope ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      </div>
      <div class="m-field"><label>职责（进 kickoff）</label><input id="agent-intro" maxlength="200" value="${deps.esc(m?.intro ?? '')}" placeholder="一句话职责"></div>
      <div class="m-field"><label>系统提示（可选）</label><textarea id="agent-prompt" rows="3" maxlength="4000">${deps.esc(m?.systemPrompt ?? '')}</textarea></div>
      <div class="m-field"><label>模型（来自 DSH 配置，留空跟随默认）</label>
        <div class="agent-form-grid">
          <select id="agent-provider"><option value="">默认 Provider</option>${catalog.providers.map(provider => `<option value="${deps.esc(provider.id)}"${m?.provider === provider.id ? ' selected' : ''}>${deps.esc(provider.name)}</option>`).join('')}</select>
          <select id="agent-model"><option value="">默认 Model</option>${(catalog.providers.find(provider => provider.id === (m?.provider ?? ''))?.models ?? catalog.providers.flatMap(provider => provider.models)).map(model => `<option value="${deps.esc(model)}"${m?.model === model ? ' selected' : ''}>${deps.esc(model)}</option>`).join('')}</select>
        </div></div>
      <div class="m-field"><label>工具白名单（DSH 已注册工具，不选=按角色默认）</label>${multiSelect('agent-tools', catalog.tools, m?.tools ?? [], '当前 DSH 未提供工具目录')}</div>
      <div class="m-field"><label>技能（DSH 已安装 skills）</label>${multiSelect('agent-skills', catalog.skills.map(skill => skill.name), m?.skills ?? [], '当前 DSH 未发现技能')}</div>
      <div class="m-field"><label>MCP 服务（当前连接）</label>${multiSelect('agent-mcp', catalog.mcpServers, m?.mcp ?? [], '当前没有 MCP 服务')}</div>
      <div class="m-field"><label>并发任务数（1–4）</label><input id="agent-concurrency" type="number" min="1" max="4" value="${m?.concurrency ?? 1}"></div>
      <div class="agent-foot"><span class="note">${m ? '名称不可改（DSH 约束）' : '保存后可加入团队'}</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-member-save" data-team="${deps.esc(teamId)}" data-id="${deps.esc(m?.id ?? '')}">保存</button></div></div></div>`)
  }

  function splitList(raw: string): string[] {
    return raw.split(/[,，\s]+/).map(item => item.trim()).filter(Boolean)
  }

  function readMemberForm(): any {
    const value = (id: string): string => (deps.q<HTMLInputElement>(id)?.value ?? '').trim()
    return {
      name: value('agent-name'), role: value('agent-role'), intro: value('agent-intro'),
      systemPrompt: value('agent-prompt'), model: value('agent-model'), provider: value('agent-provider'),
      fileWrite: value('agent-filewrite'), memoryScope: value('agent-memory'),
      tools: splitList(value('agent-tools')),
      skills: splitList(value('agent-skills')),
      mcp: splitList(value('agent-mcp')),
      concurrency: Number(value('agent-concurrency')) || 1,
    }
  }

  async function saveMember(teamId: string, id: string): Promise<void> {
    const body = readMemberForm()
    if (body.name === '') { deps.toast('先填名称'); return }
    const res = await fetch(`${deps.api}/agents/members${id !== '' ? `/${encodeURIComponent(id)}` : ''}`, {
      method: id !== '' ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member: body }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) { deps.toast(payload?.issues?.[0]?.message ?? payload?.message ?? '保存失败'); return }
    if (teamId !== '') {
      await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId: payload.member.id }),
      })
    }
    deps.closeModal()
    await load()
    deps.toast('已保存')
    renderPortalRefresh?.()
  }

  async function removeMember(teamId: string, memberId: string): Promise<void> {
    if (!deps.confirm('从团队移除这个成员？（不会删除智能体本身）')) return
    await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' })
    await load()
    await openTeam(teamId)
    renderPortalRefresh?.()
  }

  async function toggleWrite(teamId: string, memberId: string): Promise<void> {
    const team = teams.find(item => item.id === teamId)
    const member = team?.members?.find(item => item.id === memberId)
    const next = member?.fileWrite === 'write' ? 'read' : 'write'
    await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileWrite: next }),
    })
    await load()
    await openTeam(teamId)
  }

  async function addMemberToTeam(teamId: string): Promise<void> {
    const select = deps.q<HTMLSelectElement>('agent-add-select')
    const memberId = select?.value ?? ''
    if (memberId === '') { deps.toast('先选择一个智能体'); return }
    await fetch(`${deps.api}/agents/teams/${encodeURIComponent(teamId)}/members`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberId }),
    })
    await load()
    await openTeam(teamId)
  }

  async function createTeam(): Promise<void> {
    const val = (id: string): string => (deps.q<HTMLInputElement>(id)?.value ?? '').trim()
    const res = await fetch(`${deps.api}/agents/teams`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: val('agent-team-name'), desc: val('agent-team-desc'), defaultWorkspace: val('agent-team-ws') }),
    })
    if (!res.ok) { deps.toast('创建失败'); return }
    deps.closeModal()
    await load()
    renderPortalRefresh?.()
    deps.toast('团队已创建，进入团队添加成员')
  }

  async function deleteTeam(id: string): Promise<void> {
    if (!deps.confirm('删除这个团队？成员本身会保留。')) return
    await fetch(`${deps.api}/agents/teams/${encodeURIComponent(id)}`, { method: 'DELETE' })
    deps.closeModal()
    await load()
    renderPortalRefresh?.()
  }

  function toggleOption(field: string, value: string): void {
    const input = deps.q<HTMLInputElement>(field)
    if (input === null) return
    const current = splitList(input.value)
    const index = current.indexOf(value)
    if (index >= 0) current.splice(index, 1)
    else current.push(value)
    input.value = current.join(',')
    const box = deps.q(`[data-multi="${field}"]`) as HTMLElement | null
    box?.querySelectorAll('[data-value]').forEach(node => {
      const el = node as HTMLElement
      el.classList.toggle('on', el.getAttribute('data-value') === value ? index < 0 : current.includes(el.getAttribute('data-value') ?? ''))
    })
    if (box === null) {
      /* 兜底：直接按 include 重画 */
      const items = deps.q<HTMLElement>(`[data-multi="${field}"]`)?.querySelectorAll('[data-value]') ?? []
      for (const item of Array.from(items)) {
        const el = item as HTMLElement
        el.classList.toggle('on', current.includes(el.getAttribute('data-value') ?? ''))
      }
    }
  }

  let renderPortalRefresh: (() => void) | null = null
  function onRefresh(callback: () => void): void { renderPortalRefresh = callback }

  return { teams: () => teams, members: () => members, load, sectionHtml, openTeam, openTeamForm, openMemberForm, saveMember, removeMember, toggleWrite, addMemberToTeam, createTeam, deleteTeam, openMemoryModal, addMemory, deleteMemory, openKnowledgeModal, indexKnowledge, searchKnowledge, toggleOption, toggleBinding, loadCatalog, onRefresh }
}

export type AgentPanel = ReturnType<typeof createAgentPanel>
