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

const ROLE_LABEL: Record<string, string> = {
  lead: '主理人', product: '产品', architect: '架构', frontend: '前端', backend: '后端', qa: '测试', reviewer: '评审', custom: '自定义',
}

export function roleLabel(role: string): string { return ROLE_LABEL[role] ?? role }

export function createAgentPanel(deps: AgentPanelDeps) {
  let teams: AgentTeam[] = []
  let members: AgentMember[] = []

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

  function openTeamForm(): void {
    deps.openModal(`<div class="agent-modal"><h3>新建团队</h3>
      <div class="m-field"><label>团队名称</label><input id="agent-team-name" maxlength="40" placeholder="例如：产品研发"></div>
      <div class="m-field"><label>说明</label><input id="agent-team-desc" maxlength="200" placeholder="这个团队负责什么"></div>
      <div class="m-field"><label>默认工作区（可选）</label><input id="agent-team-ws" maxlength="500" placeholder="/Users/you/work/project"></div>
      <div class="agent-foot"><span class="note">创建后进入团队详情添加成员</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-team-save">创建</button></div></div></div>`)
  }

  function openMemberForm(teamId: string, member?: AgentMember): void {
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
      <div class="m-field"><label>工具白名单（逗号分隔，空=按角色默认）</label><input id="agent-tools" value="${deps.esc((m?.tools ?? []).join(', '))}" placeholder="write, edit, workbench_idea_expand"></div>
      <div class="agent-form-grid">
        <div class="m-field"><label>技能（逗号分隔）</label><input id="agent-skills" value="${deps.esc((m?.skills ?? []).join(', '))}" placeholder="office, univer-sheet"></div>
        <div class="m-field"><label>MCP（逗号分隔）</label><input id="agent-mcp" value="${deps.esc((m?.mcp ?? []).join(', '))}" placeholder="filesystem, github"></div>
        <div class="m-field"><label>并发任务数（1–4）</label><input id="agent-concurrency" type="number" min="1" max="4" value="${m?.concurrency ?? 1}"></div>
      </div>
      <div class="agent-form-grid">
        <div class="m-field"><label>Provider（可选）</label><input id="agent-provider" maxlength="40" value="${deps.esc(m?.provider ?? '')}" placeholder="如 deepseek-official"></div>
        <div class="m-field"><label>Model（可选）</label><input id="agent-model" maxlength="80" value="${deps.esc(m?.model ?? '')}" placeholder="留空跟随默认"></div>
      </div>
      <div class="agent-foot"><span class="note">${m ? '名称不可改（DSH 约束）' : '保存后可加入团队'}</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-member-save" data-team="${deps.esc(teamId)}" data-id="${deps.esc(m?.id ?? '')}">保存</button></div></div></div>`)
  }

  function readMemberForm(): any {
    const value = (id: string): string => (deps.q<HTMLInputElement>(id)?.value ?? '').trim()
    return {
      name: value('agent-name'), role: value('agent-role'), intro: value('agent-intro'),
      systemPrompt: value('agent-prompt'), model: value('agent-model'), provider: value('agent-provider'),
      fileWrite: value('agent-filewrite'), memoryScope: value('agent-memory'),
      tools: value('agent-tools').split(/[,，\s]+/).filter(Boolean),
      skills: value('agent-skills').split(/[,，\s]+/).filter(Boolean),
      mcp: value('agent-mcp').split(/[,，\s]+/).filter(Boolean),
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

  let renderPortalRefresh: (() => void) | null = null
  function onRefresh(callback: () => void): void { renderPortalRefresh = callback }

  return { teams: () => teams, members: () => members, load, sectionHtml, openTeam, openTeamForm, openMemberForm, saveMember, removeMember, toggleWrite, addMemberToTeam, createTeam, deleteTeam, openMemoryModal, addMemory, deleteMemory, openKnowledgeModal, indexKnowledge, searchKnowledge, onRefresh }
}

export type AgentPanel = ReturnType<typeof createAgentPanel>
