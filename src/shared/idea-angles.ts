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

/** 预设维度组：新建灵感时按场景一键展开一组维度方向（点选后作为自定义角度加入本次生成）。 */
export interface IdeaAnglePreset {
  id: string
  label: string
  hint: string
  angles: Array<{ label: string; hint: string }>
}

export const IDEA_ANGLE_PRESETS: IdeaAnglePreset[] = [
  {
    id: 'demand',
    label: '需求分析',
    hint: '把模糊诉求拆成可验证的需求',
    angles: [
      { label: '用户角色', hint: '谁在用 · 决策者与使用者是否分离' },
      { label: '核心场景', hint: '什么时刻必须用它 · 频率多高' },
      { label: '真实痛点', hint: '现在怎么凑合 · 代价是什么' },
      { label: '需求优先级', hint: '必须有 / 有了更好 / 可以没有' },
      { label: '验收标准', hint: '怎样算做成 · 谁来判断' },
      { label: '替代方案', hint: '不做这个功能时用户会怎么办' },
    ],
  },
  {
    id: 'research',
    label: '产品调研',
    hint: '看竞品、看用户、看市场空位',
    angles: [
      { label: '竞品格局', hint: '头部是谁 · 各自护城河' },
      { label: '用户访谈', hint: '真实原话 · 意外的使用方式' },
      { label: '市场空位', hint: '没人做好的那一段是什么' },
      { label: '定价模式', hint: '谁付钱 · 按什么计费' },
      { label: '获客渠道', hint: '用户实际从哪来' },
      { label: '失败案例', hint: '同类产品怎么死的' },
    ],
  },
  {
    id: 'data',
    label: '数据分析',
    hint: '用什么指标判断做对了',
    angles: [
      { label: '核心指标', hint: '只看一个数的话看哪个' },
      { label: '数据来源', hint: '埋点 / 日志 / 第三方 · 可信吗' },
      { label: '漏斗转化', hint: '哪一步流失最多' },
      { label: '分群对比', hint: '新老 · 高低活跃差异' },
      { label: '实验设计', hint: '怎么验证改动真的有效' },
      { label: '异常预警', hint: '什么信号说明出事了' },
    ],
  },
  {
    id: 'tech',
    label: '技术选型',
    hint: '技术上怎么落地、代价多大',
    angles: [
      { label: '技术方案', hint: '候选方案与取舍' },
      { label: '依赖与集成', hint: '要接哪些系统 · 谁维护' },
      { label: '性能与规模', hint: '峰值多少 · 先撑到哪一步' },
      { label: '数据与安全', hint: '敏感数据 · 权限与合规' },
      { label: '开发成本', hint: '人天量级 · 能否复用现成' },
      { label: '运维与回滚', hint: '出问题怎么退 · 谁值班' },
    ],
  },
]
