import { loadCollection, nextId, saveCollection } from '@/data/drill/store'
import {
  DRILL_STATUSES,
  RECT_STATUSES,
} from '@/data/drill/types'
import type {
  DrillInput,
  DrillPlanRec,
  DrillPost,
  DrillStatus,
  EvaluateInput,
  EmergencyPlan,
  InspectionRectInput,
  OpResult,
  PlanInput,
  PostNotification,
  RectificationItem,
} from '@/data/drill/types'

/** 当前时间，datetime-local 格式（YYYY-MM-DDTHH:mm）。 */
function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 单据号：前缀-年份-四位流水。 */
function buildNo(prefix: string, rows: { drillNo?: string; planNo?: string; sourceNo?: string }[]): string {
  const year = new Date().getFullYear()
  const seq = rows.reduce((max, row) => {
    const no = row.drillNo ?? row.planNo ?? row.sourceNo ?? ''
    const match = /-(\d{4})$/.exec(no)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

function sortedDesc<T extends { id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.id - a.id)
}

/* ------------------------------------------------------------------ */
/* 参演岗位                                                            */
/* ------------------------------------------------------------------ */

export function listPosts(): DrillPost[] {
  return loadCollection('posts')
}

/* ------------------------------------------------------------------ */
/* 应急预案                                                            */
/* ------------------------------------------------------------------ */

export function listPlans(): EmergencyPlan[] {
  return sortedDesc(loadCollection('plans'))
}

function findPlanRow(id: number): EmergencyPlan | undefined {
  return loadCollection('plans').find((plan) => plan.id === id)
}

export function getPlan(id: number): EmergencyPlan | undefined {
  return findPlanRow(id)
}

export function createPlan(input: PlanInput): OpResult<EmergencyPlan> {
  if (!input.name.trim()) return { ok: false, message: '预案名称不能为空' }
  if (!input.scenario.trim()) return { ok: false, message: '请填写适用场景' }
  if (!input.triggerCondition.trim()) return { ok: false, message: '请填写启动条件' }
  if (input.postIds.length === 0) return { ok: false, message: '至少勾选一个参演岗位' }

  const plans = loadCollection('plans')
  const plan: EmergencyPlan = {
    id: nextId(plans),
    planNo: buildNo('PL', plans),
    name: input.name.trim(),
    scenario: input.scenario.trim(),
    triggerCondition: input.triggerCondition.trim(),
    postIds: [...input.postIds],
    enabled: input.enabled,
    createdAt: nowLocal(),
    updatedAt: nowLocal(),
  }
  saveCollection('plans', [...plans, plan])
  return { ok: true, message: `预案 ${plan.planNo} 已保存`, data: plan }
}

export function updatePlan(id: number, input: PlanInput): OpResult {
  if (!input.name.trim()) return { ok: false, message: '预案名称不能为空' }
  if (!input.scenario.trim()) return { ok: false, message: '请填写适用场景' }
  if (!input.triggerCondition.trim()) return { ok: false, message: '请填写启动条件' }
  if (input.postIds.length === 0) return { ok: false, message: '至少勾选一个参演岗位' }

  const plans = loadCollection('plans')
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) return { ok: false, message: '没有找到这份预案' }

  // 已排演练只认排期当时的岗位快照，因此改预案岗位不影响存量演练。
  plans[index] = {
    ...plans[index],
    name: input.name.trim(),
    scenario: input.scenario.trim(),
    triggerCondition: input.triggerCondition.trim(),
    postIds: [...input.postIds],
    enabled: input.enabled,
    updatedAt: nowLocal(),
  }
  saveCollection('plans', plans)
  return { ok: true, message: '预案已更新' }
}

export function togglePlanEnabled(id: number): OpResult {
  const plans = loadCollection('plans')
  const index = plans.findIndex((plan) => plan.id === id)
  if (index < 0) return { ok: false, message: '没有找到这份预案' }
  plans[index] = { ...plans[index], enabled: !plans[index].enabled, updatedAt: nowLocal() }
  saveCollection('plans', plans)
  return { ok: true, message: plans[index].enabled ? '预案已启用' : '预案已停用' }
}

export function deletePlan(id: number): OpResult {
  const used = loadCollection('drills').some((drill) => drill.planId === id)
  if (used) {
    return { ok: false, message: '该预案已排出演练计划，不能删除（可改为停用）' }
  }
  const plans = loadCollection('plans').filter((plan) => plan.id !== id)
  saveCollection('plans', plans)
  return { ok: true, message: '预案已删除' }
}

/* ------------------------------------------------------------------ */
/* 演练计划                                                            */
/* ------------------------------------------------------------------ */

/** 在办演练（占用预案时段）的状态；已评估的演练已经办完，时段释放。 */
const ACTIVE_STATUSES: DrillStatus[] = ['待排期', '已通知', '进行中']

/** 半开区间重叠判定：[start, end) 相交即撞车，首尾相接不算。 */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * 同一预案同一时段最多只放一场在办演练。
 * 撞车裁决依据（写死在规则里）：
 *   1）排期登记时间 createdAt 更早者先办；
 *   2）登记时间相同，再按演练编号（id）更小者先办。
 * 返回应当先办的那场，没有冲突返回 null。
 */
export function findConflict(
  drills: DrillPlanRec[],
  planId: number,
  startTime: string,
  endTime: string,
  excludeId = 0,
): DrillPlanRec | null {
  const clashes = drills.filter(
    (drill) =>
      drill.id !== excludeId &&
      drill.planId === planId &&
      ACTIVE_STATUSES.includes(drill.status) &&
      overlaps(startTime, endTime, drill.startTime, drill.endTime),
  )
  if (clashes.length === 0) return null
  return clashes.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)[0]
}

export function listDrills(): DrillPlanRec[] {
  return sortedDesc(loadCollection('drills'))
}

export function getDrill(id: number): DrillPlanRec | undefined {
  return loadCollection('drills').find((drill) => drill.id === id)
}

export function createDrill(input: DrillInput): OpResult<DrillPlanRec> {
  const plan = findPlanRow(input.planId)
  if (!plan) return { ok: false, message: '请选择要演练的预案' }
  if (!plan.enabled) return { ok: false, message: `预案「${plan.name}」已停用，不能排演练` }
  if (!input.startTime || !input.endTime) return { ok: false, message: '请选择演练开始与结束时间' }
  if (input.startTime >= input.endTime) return { ok: false, message: '结束时间必须晚于开始时间' }
  if (!input.location.trim()) return { ok: false, message: '请填写演练地点' }
  if (input.postIds.length === 0) return { ok: false, message: '请至少勾选一个参演岗位' }

  const illegal = input.postIds.filter((postId) => !plan.postIds.includes(postId))
  if (illegal.length > 0) return { ok: false, message: '勾选岗位超出了该预案的参演岗位范围' }

  const drills = loadCollection('drills')
  const winner = findConflict(drills, input.planId, input.startTime, input.endTime)
  if (winner) {
    return {
      ok: false,
      message: `时段冲突：${winner.drillNo} 已排在同一时段（同一预案同一时段只放一场在办演练）。裁决依据：${winner.drillNo} 排期登记时间 ${winner.createdAt} 更早，由其先办，请调整时段后再排。`,
    }
  }

  const drill: DrillPlanRec = {
    id: nextId(drills),
    drillNo: buildNo('DR', drills),
    planId: plan.id,
    planName: plan.name,
    scenario: plan.scenario,
    startTime: input.startTime,
    endTime: input.endTime,
    location: input.location.trim(),
    status: '待排期',
    postIds: [...input.postIds],
    notifications: [],
    conclusion: null,
    createdAt: nowLocal(),
  }
  saveCollection('drills', [...drills, drill])
  return { ok: true, message: `演练 ${drill.drillNo} 已排期`, data: drill }
}

export function deleteDrill(id: number): OpResult {
  const drills = loadCollection('drills')
  const drill = drills.find((item) => item.id === id)
  if (!drill) return { ok: false, message: '没有找到这场演练' }
  // 已评估的演练结论/整改已入账，只能删台账建立前的排期。
  if (drill.status === '已评估') return { ok: false, message: '演练已评估入账，不能删除' }
  saveCollection('drills', drills.filter((item) => item.id !== id))
  return { ok: true, message: `演练 ${drill.drillNo} 已删除` }
}

/**
 * 首轮整批下发通知。只能从「待排期」发起；
 * 逐条生成每个岗位的回执，模拟出每个岗位是否已确认，
 * 没确认的几条留在待通知队列，演练整体照常推进到「已通知」。
 */
export function dispatchNotifications(drillId: number): OpResult {
  const drills = loadCollection('drills')
  const index = drills.findIndex((drill) => drill.id === drillId)
  if (index < 0) return { ok: false, message: '没有找到这场演练' }
  const drill = drills[index]
  if (drill.status !== '待排期') {
    return { ok: false, message: '只有待排期的演练才能首次下发通知' }
  }
  if (drill.postIds.length === 0) return { ok: false, message: '这场演练没有参演岗位' }

  const posts = new Map(listPosts().map((post) => [post.id, post]))
  const now = nowLocal()
  drill.notifications = drill.postIds.map((postId, i) => {
    const postName = posts.get(postId)?.name ?? postId
    // 演示用确定性回执：约三分之一岗位首轮未确认，留进待通知队列。
    const unconfirmed = i % 3 === 1
    return {
      postId,
      postName,
      ack: unconfirmed ? '待通知' : '已确认',
      attempts: 1,
      lastNotifiedAt: now,
      confirmedAt: unconfirmed ? '' : now,
    } satisfies PostNotification
  })
  drill.status = '已通知'
  saveCollection('drills', drills)

  const pending = drill.notifications.filter((n) => n.ack === '待通知').length
  return pending === 0
    ? { ok: true, message: `已向 ${drill.notifications.length} 个岗位整批下发通知，全部确认` }
    : { ok: true, message: `已整批下发 ${drill.notifications.length} 个岗位：${drill.notifications.length - pending} 个已确认，${pending} 个未确认留在待通知队列` }
}

/** 只针对还没确认的那几条再通知一轮，已确认的不动。 */
export function reNotifyUnconfirmed(drillId: number): OpResult {
  const drills = loadCollection('drills')
  const index = drills.findIndex((drill) => drill.id === drillId)
  if (index < 0) return { ok: false, message: '没有找到这场演练' }
  const drill = drills[index]
  if (drill.status !== '已通知' && drill.status !== '进行中') {
    return { ok: false, message: '当前状态没有待通知岗位可以催办' }
  }
  const now = nowLocal()
  let touched = 0
  let stillPending = 0
  drill.notifications = drill.notifications.map((n, i) => {
    if (n.ack === '已确认') return n
    touched += 1
    const attempts = n.attempts + 1
    // 第二轮催办确认前一半，第三轮起全部到位；也可在页面上手工逐条确认。
    const confirmed = attempts >= 3 || (attempts === 2 && i % 2 === 0)
    if (!confirmed) stillPending += 1
    return {
      ...n,
      attempts,
      lastNotifiedAt: now,
      ack: confirmed ? '已确认' : '待通知',
      confirmedAt: confirmed ? now : '',
    }
  })
  if (touched === 0) return { ok: false, message: '参演岗位已全部确认，无需再通知' }
  saveCollection('drills', drills)
  return {
    ok: true,
    message: stillPending === 0
      ? `已对 ${touched} 个待通知岗位再次下发，现全部确认`
      : `已对 ${touched} 个待通知岗位再次下发：${touched - stillPending} 个确认，${stillPending} 个仍未确认`,
  }
}

/** 登记某个岗位的人工确认回执（值班员电话核实后补录）。 */
export function setPostConfirmed(drillId: number, postId: string): OpResult {
  const drills = loadCollection('drills')
  const drill = drills.find((item) => item.id === drillId)
  if (!drill) return { ok: false, message: '没有找到这场演练' }
  const target = drill.notifications.find((n) => n.postId === postId)
  if (!target) return { ok: false, message: '该岗位不在这场演练的通知名单里' }
  if (target.ack === '已确认') return { ok: false, message: `${target.postName}已确认过了` }
  target.ack = '已确认'
  target.confirmedAt = nowLocal()
  saveCollection('drills', drills)
  return { ok: true, message: `${target.postName}已登记确认` }
}

/** 一键把待通知岗位全部补成已确认（用于值班员线下逐个核实后快速补齐）。 */
export function confirmAllPending(drillId: number): OpResult {
  const drills = loadCollection('drills')
  const drill = drills.find((item) => item.id === drillId)
  if (!drill) return { ok: false, message: '没有找到这场演练' }
  const now = nowLocal()
  let count = 0
  drill.notifications.forEach((n) => {
    if (n.ack !== '已确认') {
      n.ack = '已确认'
      n.confirmedAt = now
      count += 1
    }
  })
  if (count === 0) return { ok: false, message: '所有岗位都已确认' }
  saveCollection('drills', drills)
  return { ok: true, message: `已补录 ${count} 个岗位的确认，参演岗位全部确认` }
}

/** 已通知 → 进行中：允许带着尚未确认的岗位照常往下走。 */
export function startDrill(drillId: number): OpResult {
  const drills = loadCollection('drills')
  const drill = drills.find((item) => item.id === drillId)
  if (!drill) return { ok: false, message: '没有找到这场演练' }
  if (drill.status !== '已通知') {
    return { ok: false, message: '只有「已通知」的演练才能开始，状态须逐步推进、不许跳步' }
  }
  drill.status = '进行中'
  saveCollection('drills', drills)
  return { ok: true, message: `演练 ${drill.drillNo} 已开始，进入进行中` }
}

function pendingNames(drill: DrillPlanRec): string[] {
  return drill.notifications.filter((n) => n.ack !== '已确认').map((n) => n.postName)
}

/**
 * 进行中 → 已评估：
 *  - 没通知到（未确认）的岗位不许进评估；
 *  - 结论同一场演练只保留一条，重复提交覆盖旧结论，不重复生成整改项；
 *  - 缺项直接落到机坪安全巡查共用的整改清单，两边读到的条数是同一份。
 */
export function evaluateDrill(drillId: number, input: EvaluateInput): OpResult {
  if (!input.result) return { ok: false, message: '请选择评估结论' }
  if (!input.summary.trim()) return { ok: false, message: '请填写演练总结' }

  const drills = loadCollection('drills')
  const drill = drills.find((item) => item.id === drillId)
  if (!drill) return { ok: false, message: '没有找到这场演练' }
  if (drill.status === '已评估') {
    // 同一场演练重复提交：不再新增结论，直接拦住，保证只留一条。
    return { ok: false, message: '该演练已评估，同一场演练只保留一条结论，不能重复提交' }
  }
  if (drill.status !== '进行中') {
    return { ok: false, message: '只有「进行中」的演练才能提交评估，状态须按 待排期→已通知→进行中→已评估 逐步推进' }
  }

  const pending = pendingNames(drill)
  if (pending.length > 0) {
    return { ok: false, message: `还有 ${pending.length} 个岗位没确认（${pending.join('、')}），未通知到位不许进入评估` }
  }

  const items = input.items.filter((item) => item.content.trim() !== '')
  const now = nowLocal()
  drill.conclusion = { result: input.result, summary: input.summary.trim(), submittedAt: now }
  drill.status = '已评估'
  saveCollection('drills', drills)

  // 幂等关键：先撤掉这场演练之前生成的整改项（正常流程不会有，防重复提交兜底），再写入本次的。
  const remaining = loadCollection('rectifications').filter(
    (rect) => !(rect.source === 'drill' && rect.sourceId === drillId),
  )
  let seq = nextId(remaining)
  const created: RectificationItem[] = items.map((item) => {
    const rect: RectificationItem = {
      id: seq++,
      source: 'drill',
      sourceId: drillId,
      sourceNo: drill.drillNo,
      title: item.content.trim().slice(0, 16),
      content: item.content.trim(),
      severity: item.severity,
      status: '待整改',
      createdAt: now,
    }
    return rect
  })
  saveCollection('rectifications', [...remaining, ...created])

  return {
    ok: true,
    message: created.length === 0
      ? `演练 ${drill.drillNo} 已评估（${input.result}），无缺项`
      : `演练 ${drill.drillNo} 已评估（${input.result}），${created.length} 条缺项已转入机坪安全巡查整改清单`,
  }
}

/* ------------------------------------------------------------------ */
/* 整改清单（演练评估 与 机坪安全巡查 共用同一份）                        */
/* ------------------------------------------------------------------ */

export function listRectifications(): RectificationItem[] {
  return sortedDesc(loadCollection('rectifications'))
}

/** 某场演练落到整改清单的缺项条数——演练页和巡查页都从这里取，保证是同一份。 */
export function drillRectCount(drillId: number): number {
  return loadCollection('rectifications').filter(
    (rect) => rect.source === 'drill' && rect.sourceId === drillId,
  ).length
}

/** 机坪安全巡查手工登记一条缺项，和演练缺项进同一张清单。 */
export function addInspectionRectification(input: InspectionRectInput): OpResult {
  if (!input.content.trim()) return { ok: false, message: '请填写问题描述' }
  const all = loadCollection('rectifications')
  const inspectionCount = all.filter((rect) => rect.source === 'inspection').length
  const item: RectificationItem = {
    id: nextId(all),
    source: 'inspection',
    sourceId: 0,
    sourceNo: `XC-${String(inspectionCount + 1).padStart(4, '0')}`,
    title: input.content.trim().slice(0, 16),
    content: input.content.trim(),
    severity: input.severity,
    status: '待整改',
    createdAt: nowLocal(),
  }
  saveCollection('rectifications', [...all, item])
  return { ok: true, message: `巡查缺项 ${item.sourceNo} 已登记到整改清单` }
}

/** 整改清单状态流转：待整改 → 已整改 → 已复查。 */
export function advanceRectification(id: number): OpResult {
  const rows = loadCollection('rectifications')
  const index = rows.findIndex((rect) => rect.id === id)
  if (index < 0) return { ok: false, message: '没有找到这条整改项' }
  const order = RECT_STATUSES as readonly RectificationItem['status'][]
  const currentIndex = order.indexOf(rows[index].status)
  if (currentIndex >= order.length - 1) {
    return { ok: false, message: '该整改项已复查，流程结束' }
  }
  rows[index] = { ...rows[index], status: order[currentIndex + 1] }
  saveCollection('rectifications', rows)
  return { ok: true, message: `整改项已推进到「${rows[index].status}」` }
}

/** 状态机校验工具：返回当前状态允许的下一步（只允许相邻前进一步）。 */
export function nextDrillStatus(status: DrillStatus): DrillStatus | null {
  const index = DRILL_STATUSES.indexOf(status)
  return index >= 0 && index < DRILL_STATUSES.length - 1 ? DRILL_STATUSES[index + 1] : null
}
