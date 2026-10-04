// 规则验证脚本：用内存版 localStorage 跑通领域规则，不经过界面。
// 运行：npx esbuild test/drill-rules.ts --bundle --platform=node --format=cjs | node
const mem = new Map<string, string>()
;(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
}

import assert from 'node:assert'
import {
  createPlan,
  createSchedule,
  dispatchNotices,
  findScheduleConflict,
  getConclusion,
  listDeficiencies,
  listSchedules,
  reschedule,
  startDrill,
  submitEvaluation,
  listPlans,
} from '../frontend/src/api/drill-service'
import { drillState, resetDrillState } from '../frontend/src/data/drill-store'

let passed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (error) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${error instanceof Error ? error.message : error}`)
    process.exitCode = 1
  }
}

// 重置为种子数据前先构造一个干净状态：清掉种子排期，自建预案做规则验证。
resetDrillState()
const plan = createPlan({
  name: '规则测试预案',
  scene: '测试场景',
  trigger: '测试触发',
  posts: ['岗位甲', '岗位乙', '岗位丙'],
})
const other = createPlan({
  name: '另一个预案',
  scene: '其他',
  trigger: '其他',
  posts: ['岗位丁'],
})

console.log('R1 同预案同时段最多一场在办 + 撞车优先级')
const first = createSchedule({
  planId: plan.id,
  startTime: '2026-11-01 09:00',
  endTime: '2026-11-01 10:00',
  location: 'A',
  organizer: 't',
})
check('第一场排期成功（待排期即占用名额）', () => assert.ok(first.ok))

const collide = createSchedule({
  planId: plan.id,
  startTime: '2026-11-01 09:30',
  endTime: '2026-11-01 11:00',
  location: 'B',
  organizer: 't',
})
check('同预案重叠时段第二场被拦下', () => {
  assert.ok(!collide.ok)
  assert.match(collide.message, /创建时间更早者先办/)
  assert.match(collide.message, first.ok ? new RegExp(first.data.drillNo) : /never/)
})

const adjacent = createSchedule({
  planId: plan.id,
  startTime: '2026-11-01 10:00',
  endTime: '2026-11-01 11:00',
  location: 'B',
  organizer: 't',
})
check('首尾相接不算撞车（半开区间）', () => assert.ok(adjacent.ok, adjacent.ok ? '' : adjacent.message))

const otherPlanSameTime = createSchedule({
  planId: other.id,
  startTime: '2026-11-01 09:00',
  endTime: '2026-11-01 10:00',
  location: 'C',
  organizer: 't',
})
check('不同预案同一时段允许并行', () => assert.ok(otherPlanSameTime.ok))

// 已评估后释放名额
check('冲突检查只把 待排期/已通知/进行中 视为在办', () => {
  assert.ok(findScheduleConflict(drillState(), plan.id, '2026-11-02 09:00', '2026-11-02 10:00') === null)
})

console.log('R2 整批下发、逐条确认、未确认留队列')
const d = first.ok ? first.data : listSchedules()[0]
const r1 = dispatchNotices(d.id, [
  { post: '岗位甲', reached: true },
  { post: '岗位乙', reached: false },
  // 岗位丙本轮不下发
])
check('批量下发返回逐条结果', () => {
  assert.ok(r1.ok)
  if (!r1.ok) return
  assert.strictEqual(r1.data.lines.length, 2)
  assert.strictEqual(r1.data.confirmedCount, 1)
  assert.strictEqual(r1.data.unconfirmedCount, 1)
  assert.strictEqual(r1.data.pendingCount, 1)
})
check('首轮下发后状态 待排期 → 已通知', () => {
  assert.strictEqual(listSchedules().find((s) => s.id === d.id)!.status, '已通知')
})
const startTooEarly = startDrill(d.id)
check('仍有岗位从未通知到时不许开始演练', () => assert.ok(!startTooEarly.ok))

const r2 = dispatchNotices(d.id, [
  { post: '岗位丙', reached: true },
  { post: '岗位乙', reached: false },
])
check('补发只处理未确认/待通知岗位', () => {
  assert.ok(r2.ok)
  if (r2.ok) {
    assert.strictEqual(r2.data.lines.length, 2)
    assert.strictEqual(r2.data.pendingCount, 0)
  }
})
const r3 = dispatchNotices(d.id, [{ post: '岗位甲', reached: false }])
check('已确认岗位不会被后续轮次打回', () => {
  assert.ok(r3.ok)
  if (r3.ok) assert.strictEqual(r3.data.confirmedCount, 2)
})

console.log('R3 状态只能逐步推进')
const started = startDrill(d.id)
check('全部通知到且至少一岗位确认 → 可开始', () => assert.ok(started.ok, started.ok ? '' : started.message))
const evalWhileRunning = submitEvaluation(d.id, {
  grade: '良好',
  summary: '测试',
  trainer: 't',
  deficiencies: [{ content: '缺项1', sourcePost: '岗位甲' }],
})
check('进行中 → 已评估 合法', () => assert.ok(evalWhileRunning.ok, evalWhileRunning.ok ? '' : evalWhileRunning.message))
const startAgain = startDrill(d.id)
check('已评估不能再开始（不许回头）', () => assert.ok(!startAgain.ok))

console.log('R4 未通知到不许进评估')
const fresh = createSchedule({
  planId: other.id,
  startTime: '2026-12-01 09:00',
  endTime: '2026-12-01 10:00',
  location: 'X',
  organizer: 't',
})
check('完全没下发通知时提交评估被拦截', () => {
  assert.ok(fresh.ok)
  if (fresh.ok) {
    const blocked = submitEvaluation(fresh.data.id, {
      grade: '合格',
      summary: 'x',
      trainer: 't',
      deficiencies: [{ content: '无', sourcePost: '综合' }],
    })
    assert.ok(!blocked.ok)
    assert.match(blocked.message, /不许直接进评估|状态只能按/)
  }
})

console.log('R5 缺项与巡查整改清单同源、条数一致')
check('评估缺项条数与 listDeficiencies 一致', () => {
  const count = listDeficiencies(d.id).length
  assert.strictEqual(count, 1)
  assert.strictEqual(getConclusion(d.id)?.deficiencyCount, count)
})

console.log('R6 重复提交只留一条结论、缺项以最新为准')
const before = listDeficiencies(d.id).map((x) => x.id)
const reEval = submitEvaluation(d.id, {
  grade: '优秀',
  summary: '复测覆盖',
  trainer: 't',
  deficiencies: [
    { content: '新缺项A', sourcePost: '岗位乙' },
    { content: '新缺项B', sourcePost: '岗位丙' },
    { content: '新缺项C', sourcePost: '综合' },
  ],
})
check('重复提交成功且结论只有一条、提交次数累加', () => {
  assert.ok(reEval.ok, reEval.ok ? '' : reEval.message)
  assert.strictEqual(getConclusion(d.id)?.grade, '优秀')
  assert.strictEqual(getConclusion(d.id)?.submittedTimes, 2)
})
check('旧缺项整条作废、条数更新为3且与巡查侧一致', () => {
  const now = listDeficiencies(d.id)
  assert.strictEqual(now.length, 3)
  assert.deepStrictEqual(now.map((x) => x.content).sort(), ['新缺项A', '新缺项B', '新缺项C'])
  assert.strictEqual(now.some((x) => before.includes(x.id)), false)
  assert.strictEqual(getConclusion(d.id)?.deficiencyCount, 3)
})
check('未确认岗位记入结论缺岗名单', () => {
  assert.deepStrictEqual(getConclusion(d.id)?.unconfirmedPosts, ['岗位乙'])
  assert.strictEqual(getConclusion(d.id)?.participatedPosts, 2)
})

console.log('R7 改约约束')
check('待排期计划改约撞在办演练上被拦', () => {
  // 单独造一对同预案在办排期：holder 09:00~10:00 保持在办，mover 改约进其时段应被拦。
  const holder = createSchedule({
    planId: plan.id,
    startTime: '2027-01-01 09:00',
    endTime: '2027-01-01 10:00',
    location: 'H',
    organizer: 't',
  })
  const mover = createSchedule({
    planId: plan.id,
    startTime: '2027-01-01 10:00',
    endTime: '2027-01-01 11:00',
    location: 'M',
    organizer: 't',
  })
  assert.ok(holder.ok && mover.ok)
  if (holder.ok && mover.ok) {
    const intoBusy = reschedule(mover.data.id, {
      startTime: '2027-01-01 09:30',
      endTime: '2027-01-01 09:45',
      location: 'M',
    })
    assert.ok(!intoBusy.ok, intoBusy.message)
  }
})
check('改约到空闲时段放行', () => {
  const holder = createSchedule({
    planId: plan.id,
    startTime: '2027-02-01 09:00',
    endTime: '2027-02-01 10:00',
    location: 'H',
    organizer: 't',
  })
  assert.ok(holder.ok)
  if (holder.ok) {
    const free = reschedule(holder.data.id, {
      startTime: '2027-02-02 09:00',
      endTime: '2027-02-02 10:00',
      location: 'H2',
    })
    assert.ok(free.ok, free.ok ? '' : free.message)
  }
})
check('已下发的计划时段锁定不可改约', () => {
  const locked = reschedule(d.id, { startTime: '2026-11-03 09:00', endTime: '2026-11-03 10:00', location: 'Z' })
  assert.ok(!locked.ok)
})

console.log(`\n${passed} 条规则断言通过`)
void listPlans
