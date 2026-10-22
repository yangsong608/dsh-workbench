/** 灵感发散角度：宿主（提示词/校验）与浏览器（选项/配色）共用同一份。 */
export interface IdeaAngle { id: string; label: string; hint: string }

export const IDEA_ANGLES: IdeaAngle[] = [
  { id: 'users', label: '用户与场景', hint: '谁 · 在什么时刻 · 什么事' },
  { id: 'pain', label: '痛点与机会', hint: '现状哪里别扭' },
  { id: 'form', label: '方案形态', hint: '最小可用形态长什么样' },
  { id: 'tech', label: '技术与可行', hint: '哪一步最容易做不成' },
  { id: 'biz', label: '商业与传播', hint: '谁付钱 · 怎么扩散' },
  { id: 'risk', label: '风险与反例', hint: '什么情况下一定失败' },
]

export const IDEA_ANGLE_IDS = IDEA_ANGLES.map(a => a.id).concat('cross')
