/** 应急演练与预案管理的领域类型。
 *  与通用 EntryRow 不同：演练要带「逐岗位通知回执」和「唯一评估结论」，
 * 	通用的扁平表格表达不了，所以单独建一套模型。 */

/** 演练计划状态机：只能按这个顺序逐格前进，不许跳步。 */
export const DRILL_STATUSES = ['待排期', '已通知', '进行中', '已评估'] as const
export type DrillStatus = (typeof DRILL_STATUSES)[number]

/** 岗位通知回执：要么已确认，要么仍留在待通知队列里等下一轮催办。 */
export type AckStatus = '待通知' | '已确认'

/** 评估结论等级。 */
export type EvalResult = '合格' | '基本合格' | '不合格'

/** 整改清单条目状态，与机坪安全巡查的「待整改 / 已复查」口径对齐。 */
export const RECT_STATUSES = ['待整改', '已整改', '已复查'] as const
export type RectStatus = (typeof RECT_STATUSES)[number]

/** 整改清单是应急演练与安全巡查共用的同一份数据，用来源区分。 */
export type RectSource = 'drill' | 'inspection'

export type Severity = '一般' | '严重'

/** 参演岗位主数据。 */
export interface DrillPost {
  id: string
  name: string
}

/** 应急预案：维护适用场景、启动条件与参演岗位。 */
export interface EmergencyPlan {
  id: number
  planNo: string
  name: string
  /** 适用场景 */
  scenario: string
  /** 启动条件 */
  triggerCondition: string
  /** 参演岗位（岗位 id 列表） */
  postIds: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** 单个参演岗位的一条通知回执。 */
export interface PostNotification {
  postId: string
  postName: string
  ack: AckStatus
  /** 已下发轮次（首次下发 + 催办次数） */
  attempts: number
  lastNotifiedAt: string
  confirmedAt: string
}

/** 同一场演练只允许有一条结论，重复提交覆盖这一条而不是追加。 */
export interface DrillConclusion {
  result: EvalResult | ''
  summary: string
  submittedAt: string
}

/** 演练计划（按预案排出的一场演练排期）。 */
export interface DrillPlanRec {
  id: number
  drillNo: string
  planId: number
  /** 预案名称/场景在排期时留快照，事后预案再改不影响这场演练的台账。 */
  planName: string
  scenario: string
  /** 演练时段，datetime-local 格式 YYYY-MM-DDTHH:mm，用于时段重叠判定。 */
  startTime: string
  endTime: string
  location: string
  status: DrillStatus
  postIds: string[]
  notifications: PostNotification[]
  conclusion: DrillConclusion | null
  /** 排期登记时间，是「同一预案同一时段撞车谁先办」的首要裁决依据。 */
  createdAt: string
}

/** 整改清单条目：机坪安全巡查页读到的缺项与演练评估提交的是同一条记录。 */
export interface RectificationItem {
  id: number
  source: RectSource
  /** 来源单据的主键（演练 id；巡查手工登记时为 0） */
  sourceId: number
  /** 来源单据号，如 DR-2026-0004 / XC-0001 */
  sourceNo: string
  title: string
  content: string
  severity: Severity
  status: RectStatus
  createdAt: string
}

/** 服务层统一返回：ok + 给人看的提示，需要带数据时放 data。 */
export interface OpResult<T = undefined> {
  ok: boolean
  message: string
  data?: T
}

export interface PlanInput {
  name: string
  scenario: string
  triggerCondition: string
  postIds: string[]
  enabled: boolean
}

export interface DrillInput {
  planId: number
  startTime: string
  endTime: string
  location: string
  postIds: string[]
}

export interface DeficiencyInput {
  content: string
  severity: Severity
}

export interface EvaluateInput {
  result: EvalResult
  summary: string
  items: DeficiencyInput[]
}

export interface InspectionRectInput {
  content: string
  severity: Severity
}
