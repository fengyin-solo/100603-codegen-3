/** 应急演练与预案管理的领域类型。
 *  与通用 EntryRow 不同，这里要承载岗位逐条确认、状态防跳步等规则，单独建模。 */

/** 岗位级通知状态：待通知 = 还没下发到该岗位；已确认 = 岗位确认收到；未确认 = 下发了但没确认，继续留在待通知队列。 */
export type PostNoticeStatus = '待通知' | '已确认' | '未确认'

/** 演练计划状态：只能 待排期 → 已通知 → 进行中 → 已评估 顺次推进，不许跳步。 */
export type DrillStatus = '待排期' | '已通知' | '进行中' | '已评估'

/** 演练缺项的整改状态，机坪安全巡查侧按同一顺序流转。 */
export type RectifyStatus = '待整改' | '整改中' | '已复查'

/** 应急预案：维护适用场景、启动条件与参演岗位。 */
export interface DrillPlan {
  id: number
  planNo: string
  name: string
  scene: string
  trigger: string
  posts: string[]
  createdAt: string
}

/** 演练计划里一个参演岗位的通知确认明细，按岗位逐条留痕。 */
export interface PostNotice {
  post: string
  status: PostNoticeStatus
  rounds: number
  lastNotifiedAt: string
}

/** 一轮批量下发后，每个岗位逐条的确认结果，用于界面回放。 */
export interface DispatchLine {
  post: string
  before: PostNoticeStatus
  after: PostNoticeStatus
  reached: boolean
}

export interface DispatchRecord {
  at: string
  lines: DispatchLine[]
}

/** 演练计划（排期）。 */
export interface DrillSchedule {
  id: number
  drillNo: string
  planId: number
  planName: string
  posts: PostNotice[]
  startTime: string
  endTime: string
  location: string
  organizer: string
  status: DrillStatus
  createdAt: string
  notifiedAt: string
  startedAt: string
  lastDispatch: DispatchRecord | null
}

/** 演练发现的缺项：落在机坪安全巡查整改清单里，两边读的是同一条记录。 */
export interface Deficiency {
  id: number
  drillId: number
  drillNo: string
  content: string
  sourcePost: string
  status: RectifyStatus
  createdAt: string
  updatedAt: string
}

/** 一场演练只有一条评估结论；重复提交在原记录上覆盖，不新增。 */
export interface DrillConclusion {
  drillId: number
  grade: string
  summary: string
  trainer: string
  evaluatedAt: string
  participatedPosts: number
  unconfirmedPosts: string[]
  deficiencyCount: number
  submittedTimes: number
}

export interface DrillState {
  plans: DrillPlan[]
  schedules: DrillSchedule[]
  deficiencies: Deficiency[]
  conclusions: DrillConclusion[]
  planSeq: number
  scheduleSeq: number
  deficiencySeq: number
}
