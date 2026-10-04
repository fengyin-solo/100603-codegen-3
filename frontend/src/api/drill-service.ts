import { commitState, snapshot } from '@/data/drill-store'
import type {
  Deficiency,
  DispatchLine,
  DrillConclusion,
  DrillPlan,
  DrillSchedule,
  DrillState,
  DrillStatus,
  PostNotice,
  RectifyStatus,
} from '@/data/drill-types'

/*
 * 状态推进顺序（硬规则，不允许跳步）：
 *   待排期 ──整批下发通知──▶ 已通知 ──开始演练──▶ 进行中 ──提交评估──▶ 已评估
 * 通知可以多轮下发：只有「未确认」的岗位留在待通知队列里继续补发，「已确认」的照常往下走。
 */
const STATUS_ORDER: DrillStatus[] = ['待排期', '已通知', '进行中', '已评估']
const RECTIFY_ORDER: RectifyStatus[] = ['待整改', '整改中', '已复查']

function nowText(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function assertNext(current: DrillStatus, next: DrillStatus): void {
  const from = STATUS_ORDER.indexOf(current)
  const to = STATUS_ORDER.indexOf(next)
  if (to <= from) {
    throw new Error(`演练已处于「${current}」，不能重复推进到「${next}」`)
  }
  if (to !== from + 1) {
    throw new Error(`状态只能按 待排期 → 已通知 → 进行中 → 已评估 顺次推进，不能从「${current}」跳到「${next}」`)
  }
}

export type OkResult<T> = { ok: true; data: T; message: string }
export type FailResult = { ok: false; message: string }
export type Result<T> = OkResult<T> | FailResult

/** 时段重叠判定：半开区间，首尾相接（上一场结束=下一场开始）不算撞车。 */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

export type ConflictInfo = {
  holderId: number
  holderNo: string
  holderCreatedAt: string
  startTime: string
  endTime: string
  reason: 'same-plan-active' | 'time-overlap'
}

/**
 * 排期冲突检查，两条规则：
 * 1. 同一预案在同一时段最多只有一场「在办演练」——在办 = 待排期/已通知/进行中（已评估的已办完，不占名额）；
 * 2. 同一预案的两场在办演练时段不得重叠。
 * 撞车时谁先办：以「创建时间（createdAt）更早」为准，早创建的先办，后来的被拦下；
 *   创建时间相同再比演练编号，编号靠前者先办。判定依据固定写死在这里，不靠人工协调。
 */
export function findScheduleConflict(
  state: DrillState,
  planId: number,
  startTime: string,
  endTime: string,
  selfId?: number,
): ConflictInfo | null {
  if (!(startTime < endTime)) {
    throw new Error('演练开始时间必须早于结束时间')
  }
  const actives = state.schedules.filter(
    (item) => item.planId === planId && item.status !== '已评估' && item.id !== selfId,
  )
  const sameTime = actives.filter((item) => overlaps(startTime, endTime, item.startTime, item.endTime))
  if (sameTime.length === 0) {
    return null
  }
  // 规则1：同一预案、同时段已经有在办演练，直接占用名额。
  const holder = sameTime.slice().sort(compareHolder)[0]
  return {
    holderId: holder.id,
    holderNo: holder.drillNo,
    holderCreatedAt: holder.createdAt,
    startTime: holder.startTime,
    endTime: holder.endTime,
    reason: 'same-plan-active',
  }
}

function compareHolder(a: DrillSchedule, b: DrillSchedule): number {
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1
  }
  return a.drillNo < b.drillNo ? -1 : a.drillNo > b.drillNo ? 1 : 0
}

/* ---------------- 预案 ---------------- */

export interface PlanInput {
  name: string
  scene: string
  trigger: string
  posts: string[]
}

export function listPlans(): DrillPlan[] {
  return snapshot().plans.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export function getPlan(id: number): DrillPlan {
  const plan = snapshot().plans.find((item) => item.id === id)
  if (!plan) {
    throw new Error(`没有找到编号为 ${id} 的预案`)
  }
  return plan
}

function normalizePlanInput(input: PlanInput): { name: string; scene: string; trigger: string; posts: string[] } {
  const name = input.name.trim()
  const scene = input.scene.trim()
  const trigger = input.trigger.trim()
  const posts = [...new Set(input.posts.map((p) => p.trim()).filter(Boolean))]
  if (!name) throw new Error('预案名称必填')
  if (!scene) throw new Error('适用场景必填')
  if (!trigger) throw new Error('启动条件必填')
  if (posts.length === 0) throw new Error('参演岗位至少维护一个')
  return { name, scene, trigger, posts }
}

export function createPlan(input: PlanInput): DrillPlan {
  const fields = normalizePlanInput(input)
  const state = snapshot()
  const id = state.planSeq + 1
  const plan: DrillPlan = {
    id,
    planNo: `PLN-${String(id).padStart(4, '0')}`,
    ...fields,
    createdAt: nowText(),
  }
  commitState({ ...state, plans: [...state.plans, plan], planSeq: id })
  return plan
}

export function updatePlan(id: number, input: PlanInput): DrillPlan {
  const fields = normalizePlanInput(input)
  const state = snapshot()
  const index = state.plans.findIndex((item) => item.id === id)
  if (index < 0) {
    throw new Error(`没有找到编号为 ${id} 的预案`)
  }
  const plan = { ...state.plans[index], ...fields }
  const plans = [...state.plans]
  plans[index] = plan
  commitState({ ...state, plans })
  return plan
}

/** 已被演练引用的预案不允许删除，防止排期挂空预案。 */
export function deletePlan(id: number): Result<null> {
  const state = snapshot()
  const used = state.schedules.some((item) => item.planId === id)
  if (used) {
    return { ok: false, message: '该预案已经排过演练计划，不能删除；如不再使用可保留备查' }
  }
  commitState({ ...state, plans: state.plans.filter((item) => item.id !== id) })
  return { ok: true, data: null, message: '预案已删除' }
}

/* ---------------- 演练计划 ---------------- */

export interface ScheduleInput {
  planId: number
  startTime: string
  endTime: string
  location: string
  organizer: string
}

export function listSchedules(status?: DrillStatus | ''): DrillSchedule[] {
  const state = snapshot()
  const rows = status ? state.schedules.filter((item) => item.status === status) : state.schedules
  return rows.slice().sort((a, b) => (a.startTime < b.startTime ? 1 : -1))
}

export function getSchedule(id: number): DrillSchedule {
  const item = snapshot().schedules.find((row) => row.id === id)
  if (!item) {
    throw new Error(`没有找到编号为 ${id} 的演练计划`)
  }
  return item
}

export function createSchedule(input: ScheduleInput): Result<DrillSchedule> {
  const state = snapshot()
  const plan = state.plans.find((item) => item.id === Number(input.planId))
  if (!plan) {
    return { ok: false, message: '请选择要排演的预案' }
  }
  const startTime = input.startTime.trim()
  const endTime = input.endTime.trim()
  const location = input.location.trim()
  const organizer = input.organizer.trim() || '值班管理员'
  if (!startTime || !endTime) {
    return { ok: false, message: '演练开始与结束时间必填' }
  }
  try {
    const conflict = findScheduleConflict(state, plan.id, startTime, endTime)
    if (conflict) {
      return {
        ok: false,
        message:
          `同一预案「${plan.name}」在 ${conflict.startTime}~${conflict.endTime} 已有在办演练 ${conflict.holderNo}（创建于 ${conflict.holderCreatedAt}）。` +
          `依据“创建时间更早者先办，时间相同则演练编号靠前者先办”的规则，本场排期被拦下，请改约其他时段。`,
      }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '排期校验失败' }
  }
  const id = state.scheduleSeq + 1
  const schedule: DrillSchedule = {
    id,
    drillNo: `DRL-${String(id).padStart(4, '0')}`,
    planId: plan.id,
    planName: plan.name,
    posts: plan.posts.map((post): PostNotice => ({ post, status: '待通知', rounds: 0, lastNotifiedAt: '' })),
    startTime,
    endTime,
    location: location || '待定',
    organizer,
    status: '待排期',
    createdAt: nowText(),
    notifiedAt: '',
    startedAt: '',
    lastDispatch: null,
  }
  commitState({ ...state, schedules: [...state.schedules, schedule], scheduleSeq: id })
  return { ok: true, data: schedule, message: `演练计划 ${schedule.drillNo} 已排为待排期，等待下发通知` }
}

/** 待排期计划允许改约；改约同样要过冲突规则。 */
export function reschedule(id: number, patch: Pick<ScheduleInput, 'startTime' | 'endTime' | 'location'>): Result<DrillSchedule> {
  const state = snapshot()
  const index = state.schedules.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, message: '演练计划不存在' }
  const current = state.schedules[index]
  if (current.status !== '待排期') {
    return { ok: false, message: `计划已进入「${current.status}」，时段锁定，不能再改约` }
  }
  const startTime = patch.startTime.trim() || current.startTime
  const endTime = patch.endTime.trim() || current.endTime
  try {
    const conflict = findScheduleConflict(state, current.planId, startTime, endTime, id)
    if (conflict) {
      return {
        ok: false,
        message:
          `改约时段与在办演练 ${conflict.holderNo}（创建于 ${conflict.holderCreatedAt}）撞车。` +
          `依据“创建时间更早者先办，时间相同则编号靠前者先办”，本场需另选时段。`,
      }
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '排期校验失败' }
  }
  const updated: DrillSchedule = {
    ...current,
    startTime,
    endTime,
    location: patch.location.trim() || current.location,
  }
  const schedules = [...state.schedules]
  schedules[index] = updated
  commitState({ ...state, schedules })
  return { ok: true, data: updated, message: `演练 ${updated.drillNo} 已改约到 ${startTime}~${endTime}` }
}

/* ---------------- 通知下发（按岗位逐条确认） ---------------- */

export interface DispatchChoice {
  post: string
  reached: boolean
}

export interface DispatchOutcome {
  schedule: DrillSchedule
  lines: DispatchLine[]
  confirmedCount: number
  unconfirmedCount: number
  pendingCount: number
  message: string
}

/**
 * 整批下发通知：一次勾选多个参演岗位，逐条返回每个岗位的确认结果。
 * 确认到的岗位置「已确认」，没确认的置「未确认」并留在待通知队列里，下一轮只补发它们；
 * 已经确认过的岗位不回退。首轮下发后计划状态 待排期 → 已通知。
 */
export function dispatchNotices(drillId: number, choices: DispatchChoice[]): Result<DispatchOutcome> {
  const state = snapshot()
  const index = state.schedules.findIndex((item) => item.id === drillId)
  if (index < 0) return { ok: false, message: '演练计划不存在' }
  const schedule = state.schedules[index]
  if (schedule.status !== '待排期' && schedule.status !== '已通知') {
    return { ok: false, message: `演练已「${schedule.status}」，通知通道已关闭，不能再下发` }
  }
  const choiceByPost = new Map(choices.map((c) => [c.post, c.reached]))
  const at = nowText()
  const lines: DispatchLine[] = []
  const posts = schedule.posts.map((notice) => {
    if (!choiceByPost.has(notice.post)) {
      return notice
    }
    // 已确认的照常往下走，不允许被后续轮次打回未确认。
    if (notice.status === '已确认') {
      lines.push({ post: notice.post, before: notice.status, after: '已确认', reached: true })
      return notice
    }
    const reached = choiceByPost.get(notice.post) ?? false
    const after: PostNotice['status'] = reached ? '已确认' : '未确认'
    lines.push({ post: notice.post, before: notice.status, after, reached })
    return {
      ...notice,
      status: after,
      rounds: notice.rounds + 1,
      lastNotifiedAt: at,
    }
  })
  if (lines.length === 0) {
    return { ok: false, message: '请至少勾选一个参演岗位再下发' }
  }
  const nextStatus: DrillStatus = '已通知'
  const updated: DrillSchedule = {
    ...schedule,
    posts,
    status: nextStatus,
    notifiedAt: schedule.notifiedAt || at,
    lastDispatch: { at, lines },
  }
  const schedules = [...state.schedules]
  schedules[index] = updated
  commitState({ ...state, schedules })
  const confirmedCount = posts.filter((p) => p.status === '已确认').length
  const unconfirmedCount = posts.filter((p) => p.status === '未确认').length
  const pendingCount = posts.filter((p) => p.status === '待通知').length
  const reachedNow = lines.filter((l) => l.after === '已确认').length
  const missedNow = lines.filter((l) => l.after === '未确认').length
  return {
    ok: true,
    data: {
      schedule: updated,
      lines,
      confirmedCount,
      unconfirmedCount,
      pendingCount,
      message:
        `本轮下发 ${lines.length} 个岗位：${reachedNow} 个确认收到，${missedNow} 个未确认、留在待通知队列。` +
        (unconfirmedCount + pendingCount > 0
          ? `当前仍有 ${unconfirmedCount + pendingCount} 个岗位未确认，可继续补发；未全部通知到不影响已确认岗位推进，但不许进入评估。`
          : '全部参演岗位已确认收到，可开始演练。'),
    },
    message: '',
  }
}

/** 开始演练：已通知 → 进行中。要求所有岗位都至少下发过一轮（不再有待通知），且至少一个岗位确认。 */
export function startDrill(id: number): Result<DrillSchedule> {
  const state = snapshot()
  const index = state.schedules.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, message: '演练计划不存在' }
  const schedule = state.schedules[index]
  try {
    assertNext(schedule.status, '进行中')
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '状态推进失败' }
  }
  const neverNotified = schedule.posts.filter((p) => p.status === '待通知')
  if (neverNotified.length > 0) {
    return {
      ok: false,
      message: `还有 ${neverNotified.length} 个岗位从未下发通知（${neverNotified.map((p) => p.post).join('、')}），请先补发通知再开始演练`,
    }
  }
  const confirmed = schedule.posts.filter((p) => p.status === '已确认')
  if (confirmed.length === 0) {
    return { ok: false, message: '没有任何岗位确认收到通知，演练不能开始' }
  }
  const updated: DrillSchedule = { ...schedule, status: '进行中', startedAt: nowText() }
  const schedules = [...state.schedules]
  schedules[index] = updated
  commitState({ ...state, schedules })
  return { ok: true, data: updated, message: `演练 ${schedule.drillNo} 已开始，未确认岗位按缺岗记录` }
}

/* ---------------- 评估结论与缺项 ---------------- */

export interface DeficiencyInput {
  content: string
  sourcePost: string
}

export interface EvaluateInput {
  grade: string
  summary: string
  trainer: string
  deficiencies: DeficiencyInput[]
}

/**
 * 提交评估：进行中 → 已评估。
 * - 没通知到的岗位不许直接进评估：仍有「待通知」岗位时拦截（未确认属于已通知但缺岗，记入结论）。
 * - 同一场演练重复提交只留一条结论：按 drillId 覆盖原结论，旧缺项整条作废、以本次清单为准；
 *   机坪安全巡查侧读到的缺项条数永远和这里是同一份。
 */
export function submitEvaluation(drillId: number, input: EvaluateInput): Result<{ schedule: DrillSchedule; conclusion: DrillConclusion; deficiencies: Deficiency[] }> {
  const state = snapshot()
  const index = state.schedules.findIndex((item) => item.id === drillId)
  if (index < 0) return { ok: false, message: '演练计划不存在' }
  const schedule = state.schedules[index]
  try {
    assertNext(schedule.status, '已评估')
  } catch (error) {
    // 已评估的重复提交：幂等覆盖，不报“跳步”错误，但下面按同一结论记录处理。
    if (schedule.status !== '已评估') {
      return { ok: false, message: error instanceof Error ? error.message : '状态推进失败' }
    }
  }
  const neverNotified = schedule.posts.filter((p) => p.status === '待通知')
  if (neverNotified.length > 0) {
    return {
      ok: false,
      message: `还有 ${neverNotified.length} 个岗位没通知到（${neverNotified.map((p) => p.post).join('、')}），未通知到的岗位不许直接进评估，请先补发通知`,
    }
  }
  const grade = input.grade.trim()
  const summary = input.summary.trim()
  if (!grade) return { ok: false, message: '请选择演练评级' }
  if (!summary) return { ok: false, message: '请填写演练评估结论' }
  const items = input.deficiencies
    .map((d) => ({ content: d.content.trim(), sourcePost: d.sourcePost.trim() || '综合' }))
    .filter((d) => d.content)
  if (items.length === 0) return { ok: false, message: '至少登记一条缺项，无缺项也请写明“无”' }

  const at = nowText()
  let seq = state.deficiencySeq
  // 缺项与结论同源：重复提交时先清掉本场旧缺项，保证巡查侧条数与本次一致。
  const kept = state.deficiencies.filter((d) => d.drillId !== drillId)
  const fresh: Deficiency[] = items.map((d) => {
    seq += 1
    return {
      id: seq,
      drillId,
      drillNo: schedule.drillNo,
      content: d.content,
      sourcePost: d.sourcePost,
      status: '待整改',
      createdAt: at,
      updatedAt: at,
    }
  })
  const participatedPosts = schedule.posts.filter((p) => p.status === '已确认').length
  const unconfirmedPosts = schedule.posts.filter((p) => p.status !== '已确认').map((p) => p.post)
  const previous = state.conclusions.find((c) => c.drillId === drillId)
  const conclusion: DrillConclusion = {
    drillId,
    grade,
    summary,
    trainer: input.trainer.trim() || '值班管理员',
    evaluatedAt: previous ? previous.evaluatedAt : at,
    participatedPosts,
    unconfirmedPosts,
    deficiencyCount: fresh.length,
    submittedTimes: (previous?.submittedTimes ?? 0) + 1,
  }
  const updatedSchedule: DrillSchedule = { ...schedule, status: '已评估' }
  const schedules = [...state.schedules]
  schedules[index] = updatedSchedule
  commitState({
    ...state,
    schedules,
    deficiencies: [...kept, ...fresh],
    deficiencySeq: seq,
    conclusions: [...state.conclusions.filter((c) => c.drillId !== drillId), conclusion],
  })
  return {
    ok: true,
    data: { schedule: updatedSchedule, conclusion, deficiencies: fresh },
    message:
      `演练 ${schedule.drillNo} 评估已提交，生成 ${fresh.length} 条缺项并同步到机坪安全巡查整改清单。` +
      (previous ? `（第 ${conclusion.submittedTimes} 次提交，仅保留本次这一条结论与缺项清单）` : ''),
  }
}

export function getConclusion(drillId: number): DrillConclusion | null {
  return snapshot().conclusions.find((c) => c.drillId === drillId) ?? null
}

/* ---------------- 缺项（与机坪安全巡查同一份整改清单） ---------------- */

/** 机坪安全巡查侧和演练侧共用这一个读取口，保证条数、内容完全一致。 */
export function listDeficiencies(drillId?: number): Deficiency[] {
  const rows = snapshot().deficiencies
  return (drillId ? rows.filter((d) => d.drillId === drillId) : rows)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

/** 整改清单在巡查侧按 待整改 → 整改中 → 已复查 推进，只改这一份数据。 */
export function advanceDeficiency(id: number): Result<Deficiency> {
  const state = snapshot()
  const index = state.deficiencies.findIndex((d) => d.id === id)
  if (index < 0) return { ok: false, message: '缺项记录不存在' }
  const current = state.deficiencies[index]
  const step = RECTIFY_ORDER.indexOf(current.status)
  if (step === RECTIFY_ORDER.length - 1) {
    return { ok: false, message: '该缺项已复查完成' }
  }
  const updated: Deficiency = { ...current, status: RECTIFY_ORDER[step + 1], updatedAt: nowText() }
  const deficiencies = [...state.deficiencies]
  deficiencies[index] = updated
  commitState({ ...state, deficiencies })
  return { ok: true, data: updated, message: `缺项已推进到「${updated.status}」` }
}
