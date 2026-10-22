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
    const header = `<div class="portal-sec-head"><h2>智能体团队</h2><span>${teams.length > 0 ? `${teams.length} 支团队 · 成员可在团队里增删` : '默认产品研发团队'}</span></div>`
    if (teams.length === 0) {
      return `${header}<div class="portal-empty">${deps.ic('users', 16)}<div><b>还没有团队</b><span>创建团队并添加智能体，灵感发散时由主理人调度执行。</span></div><button class="btn" data-act="agent-team-new">${deps.ic('plus', 12)}新建团队</button></div>`
    }
    const cards = teams.map(team => `<article class="team-card${team.isDefault ? ' default' : ''}" data-act="agent-team-open" data-id="${deps.esc(team.id)}">
      <div class="team-card-h"><span class="team-ico">${deps.ic('users', 16)}</span>
        <div class="team-card-t"><b>${deps.esc(team.name)}</b><small>${team.isDefault ? '默认 · ' : ''}${team.memberCount} 名成员</small></div>
        <span class="team-go">${deps.ic('arrowR', 13)}</span></div>
      <div class="team-desc">${deps.esc(team.desc || '未填写说明')}</div>
      <div class="team-members">${(team.members ?? []).slice(0, 8).map(member => `<span class="team-chip" title="${deps.esc(member.intro)}">${deps.esc(member.name)}</span>`).join('') || `<span class="team-chip ghost">${team.memberCount} 名成员</span>`}</div>
    </article>`).join('')
    return `${header}<div class="portal-teams">${cards}<button class="team-card add" data-act="agent-team-new">${deps.ic('plus', 18)}<span>新建团队</span></button></div>`
  }

  async function openTeam(id: string): Promise<void> {
    const res = await fetch(`${deps.api}/agents/teams/${encodeURIComponent(id)}`, { cache: 'no-store' })
    if (!res.ok) { deps.toast('团队读取失败'); return }
    const team: AgentTeam = (await res.json()).team
    const rows = (team.members ?? []).map(member => `<div class="agent-row">
      <div class="agent-row-main"><b>${deps.esc(member.name)}</b><span class="agent-role ${member.role}">${roleLabel(member.role)}</span>
        <small>@${deps.esc(member.handle)} · ${member.fileWrite === 'write' ? '可写文件' : '只读'}</small>
        <div class="agent-intro">${deps.esc(member.intro || '（未填写职责）')}</div></div>
      <div class="agent-row-acts">
        <button class="btn tiny" data-act="agent-member-write" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}" title="切换文件权限（下次派发生效）">${member.fileWrite === 'write' ? '改只读' : '改可写'}</button>
        <button class="btn tiny" data-act="agent-member-edit" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}">编辑</button>
        <button class="btn tiny" data-act="agent-member-del" data-team="${deps.esc(team.id)}" data-id="${deps.esc(member.id)}">移除</button>
      </div></div>`).join('') || '<div class="agent-empty">还没有成员，先添加一个智能体。</div>'
    const available = members.filter(member => !(team.members ?? []).some(item => item.id === member.id))
    deps.openModal(`<div class="idea-modal agent-modal"><h3>${deps.esc(team.name)}</h3>
      <div class="agent-team-meta">${team.isDefault ? '默认团队 · ' : ''}${team.memberCount} 名成员${team.defaultWorkspace !== '' ? ` · ${deps.esc(team.defaultWorkspace)}` : ''}</div>
      <div class="agent-list">${rows}</div>
      <div class="agent-add-row">
        <select id="agent-add-select"><option value="">选择已有智能体…</option>${available.map(member => `<option value="${deps.esc(member.id)}">${deps.esc(member.name)}（${roleLabel(member.role)}）</option>`).join('')}</select>
        <button class="btn tiny" data-act="agent-member-add" data-team="${deps.esc(team.id)}">添加</button>
        <button class="btn tiny" data-act="agent-member-new" data-team="${deps.esc(team.id)}">＋ 新建智能体</button>
        <span style="margin-left:auto"></span>
        <button class="btn tiny danger" data-act="agent-team-delete" data-id="${deps.esc(team.id)}">删除团队</button>
      </div>
      <div class="idea-modal-foot"><span class="note">运行中改权限不会热生效；下次派发或创建替代成员才生效。</span><div class="right"><button class="btn" data-act="agent-close">关闭</button></div></div></div>`)
  }

  function openTeamForm(): void {
    deps.openModal(`<div class="idea-modal"><h3>新建团队</h3>
      <div class="m-field"><label>团队名称</label><input id="agent-team-name" maxlength="40" placeholder="例如：产品研发"></div>
      <div class="m-field"><label>说明</label><input id="agent-team-desc" maxlength="200" placeholder="这个团队负责什么"></div>
      <div class="m-field"><label>默认工作区（可选）</label><input id="agent-team-ws" maxlength="500" placeholder="/Users/you/work/project"></div>
      <div class="idea-modal-foot"><span class="note">创建后进入团队详情添加成员</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-team-save">创建</button></div></div></div>`)
  }

  function openMemberForm(teamId: string, member?: AgentMember): void {
    const m = member
    deps.openModal(`<div class="idea-modal agent-modal"><h3>${m ? '编辑智能体' : '新建智能体'}</h3>
      <div class="agent-form-grid">
        <div class="m-field"><label>名称</label><input id="agent-name" maxlength="12" value="${deps.esc(m?.name ?? '')}" placeholder="≤12 字"></div>
        <div class="m-field"><label>角色</label><select id="agent-role">${['lead','product','architect','frontend','backend','qa','reviewer','custom'].map(role => `<option value="${role}"${m?.role === role ? ' selected' : ''}>${roleLabel(role)}</option>`).join('')}</select></div>
        <div class="m-field"><label>文件权限</label><select id="agent-filewrite"><option value="read"${m?.fileWrite === 'read' ? ' selected' : ''}>只读</option><option value="write"${m?.fileWrite === 'write' ? ' selected' : ''}>可写</option></select></div>
        <div class="m-field"><label>记忆范围</label><select id="agent-memory">${['none','personal','project','team','all'].map(scope => `<option value="${scope}"${(m?.memoryScope ?? 'project') === scope ? ' selected' : ''}>${scope}</option>`).join('')}</select></div>
      </div>
      <div class="m-field"><label>职责（进 kickoff）</label><input id="agent-intro" maxlength="200" value="${deps.esc(m?.intro ?? '')}" placeholder="一句话职责"></div>
      <div class="m-field"><label>系统提示（可选）</label><textarea id="agent-prompt" rows="3" maxlength="4000">${deps.esc(m?.systemPrompt ?? '')}</textarea></div>
      <div class="m-field"><label>模型（可选，留空跟随默认）</label><input id="agent-model" maxlength="80" value="${deps.esc(m?.model ?? '')}"></div>
      <div class="idea-modal-foot"><span class="note">${m ? '名称不可改（DSH 约束）' : '保存后可加入团队'}</span><div class="right"><button class="btn" data-act="agent-close">取消</button><button class="btn-primary" data-act="agent-member-save" data-team="${deps.esc(teamId)}" data-id="${deps.esc(m?.id ?? '')}">保存</button></div></div></div>`)
  }

  function readMemberForm(): any {
    const value = (id: string): string => (deps.q<HTMLInputElement>(id)?.value ?? '').trim()
    return {
      name: value('agent-name'), role: value('agent-role'), intro: value('agent-intro'),
      systemPrompt: value('agent-prompt'), model: value('agent-model'),
      fileWrite: value('agent-filewrite'), memoryScope: value('agent-memory'),
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

  return { teams: () => teams, members: () => members, load, sectionHtml, openTeam, openTeamForm, openMemberForm, saveMember, removeMember, toggleWrite, addMemberToTeam, createTeam, deleteTeam, onRefresh }
}

export type AgentPanel = ReturnType<typeof createAgentPanel>
