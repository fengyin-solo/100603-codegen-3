import type { DrillState } from './drill-types'

// 应急演练域单独一个存储键，与通用条目互不影响。
const DRILL_STORAGE_KEY = 'airport-ground-ops:drill-domain:v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// 首次打开时的示例数据：覆盖待排期、已通知（仍有岗位没确认）、已评估（带缺项）三种形态。
function seedState(): DrillState {
  return {
    planSeq: 3,
    scheduleSeq: 4,
    deficiencySeq: 4,
    plans: [
      {
        id: 1,
        planNo: 'PLN-0001',
        name: '秋冬季低能见度运行预案',
        scene: '大雾、低能见度导致跑道视程低于运行标准的换季时段',
        trigger: '气象台发布大雾橙色预警，或跑道视程连续10分钟低于550米',
        posts: ['机坪塔台', '场务保障', '廊桥操作', '摆渡车调度', '机务勤务', '航油加注'],
        createdAt: '2026-09-20 09:12',
      },
      {
        id: 2,
        planNo: 'PLN-0002',
        name: '冬季道面除冰雪应急处置预案',
        scene: '降雪、积冰导致机坪道面摩擦系数不达标',
        trigger: '道面摩擦系数实测低于0.30，或接到降雪通报',
        posts: ['场务保障', '除冰作业', '机坪巡查', '航空器牵引'],
        createdAt: '2026-09-22 14:40',
      },
      {
        id: 3,
        planNo: 'PLN-0003',
        name: '大面积航延旅客疏导预案',
        scene: '多航班集中延误导致候机区滞留',
        trigger: '出港延误航班1小时内达到5架次以上',
        posts: ['要客保障', '摆渡车调度', '航空配餐'],
        createdAt: '2026-09-25 10:05',
      },
    ],
    schedules: [
      {
        id: 1,
        drillNo: 'DRL-0001',
        planId: 1,
        planName: '秋冬季低能见度运行预案',
        startTime: '2026-10-12 09:00',
        endTime: '2026-10-12 10:30',
        location: '1号机坪',
        organizer: '值班管理员',
        status: '待排期',
        createdAt: '2026-09-28 08:30',
        notifiedAt: '',
        startedAt: '',
        lastDispatch: null,
        posts: [
          { post: '机坪塔台', status: '待通知', rounds: 0, lastNotifiedAt: '' },
          { post: '场务保障', status: '待通知', rounds: 0, lastNotifiedAt: '' },
          { post: '廊桥操作', status: '待通知', rounds: 0, lastNotifiedAt: '' },
          { post: '摆渡车调度', status: '待通知', rounds: 0, lastNotifiedAt: '' },
          { post: '机务勤务', status: '待通知', rounds: 0, lastNotifiedAt: '' },
          { post: '航油加注', status: '待通知', rounds: 0, lastNotifiedAt: '' },
        ],
      },
      {
        id: 2,
        drillNo: 'DRL-0002',
        planId: 2,
        planName: '冬季道面除冰雪应急处置预案',
        startTime: '2026-10-15 14:00',
        endTime: '2026-10-15 15:30',
        location: '2号机坪',
        organizer: '值班管理员',
        status: '已通知',
        createdAt: '2026-09-26 16:20',
        notifiedAt: '2026-10-02 09:05',
        startedAt: '',
        posts: [
          { post: '场务保障', status: '已确认', rounds: 1, lastNotifiedAt: '2026-10-02 09:05' },
          { post: '除冰作业', status: '已确认', rounds: 1, lastNotifiedAt: '2026-10-02 09:05' },
          { post: '机坪巡查', status: '未确认', rounds: 1, lastNotifiedAt: '2026-10-02 09:05' },
          { post: '航空器牵引', status: '已确认', rounds: 1, lastNotifiedAt: '2026-10-02 09:05' },
        ],
        lastDispatch: {
          at: '2026-10-02 09:05',
          lines: [
            { post: '场务保障', before: '待通知', after: '已确认', reached: true },
            { post: '除冰作业', before: '待通知', after: '已确认', reached: true },
            { post: '机坪巡查', before: '待通知', after: '未确认', reached: false },
            { post: '航空器牵引', before: '待通知', after: '已确认', reached: true },
          ],
        },
      },
      {
        id: 3,
        drillNo: 'DRL-0003',
        planId: 1,
        planName: '秋冬季低能见度运行预案',
        startTime: '2026-09-18 09:00',
        endTime: '2026-09-18 10:00',
        location: '1号机坪',
        organizer: '值班管理员',
        status: '已评估',
        createdAt: '2026-09-10 11:00',
        notifiedAt: '2026-09-12 10:00',
        startedAt: '2026-09-18 09:00',
        posts: [
          { post: '机坪塔台', status: '已确认', rounds: 1, lastNotifiedAt: '2026-09-12 10:00' },
          { post: '场务保障', status: '已确认', rounds: 1, lastNotifiedAt: '2026-09-12 10:00' },
          { post: '廊桥操作', status: '未确认', rounds: 2, lastNotifiedAt: '2026-09-14 10:00' },
          { post: '摆渡车调度', status: '已确认', rounds: 1, lastNotifiedAt: '2026-09-12 10:00' },
          { post: '机务勤务', status: '已确认', rounds: 1, lastNotifiedAt: '2026-09-12 10:00' },
          { post: '航油加注', status: '未确认', rounds: 2, lastNotifiedAt: '2026-09-14 10:00' },
        ],
        lastDispatch: {
          at: '2026-09-14 10:00',
          lines: [
            { post: '廊桥操作', before: '未确认', after: '未确认', reached: false },
            { post: '航油加注', before: '未确认', after: '未确认', reached: false },
          ],
        },
      },
    ],
    deficiencies: [
      {
        id: 1,
        drillId: 3,
        drillNo: 'DRL-0003',
        content: '低能见度引导车出动超时8分钟',
        sourcePost: '场务保障',
        status: '待整改',
        createdAt: '2026-09-18 11:30',
        updatedAt: '2026-09-18 11:30',
      },
      {
        id: 2,
        drillId: 3,
        drillNo: 'DRL-0003',
        content: '机务口令复诵记录缺失',
        sourcePost: '机务勤务',
        status: '整改中',
        createdAt: '2026-09-18 11:30',
        updatedAt: '2026-09-25 09:00',
      },
      {
        id: 3,
        drillId: 3,
        drillNo: 'DRL-0003',
        content: '塔台与机坪联络频道切换演练不熟练',
        sourcePost: '机坪塔台',
        status: '已复查',
        createdAt: '2026-09-18 11:30',
        updatedAt: '2026-09-30 15:00',
      },
    ],
    conclusions: [
      {
        drillId: 3,
        grade: '良好',
        summary: '整体响应链路顺畅，引导车出动与口令记录两处需按缺项整改后复查。',
        trainer: '值班管理员',
        evaluatedAt: '2026-09-18 11:30',
        participatedPosts: 4,
        unconfirmedPosts: ['廊桥操作', '航油加注'],
        deficiencyCount: 3,
        submittedTimes: 1,
      },
    ],
  }
}

function readState(): DrillState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return seedState()
  }
  const raw = window.localStorage.getItem(DRILL_STORAGE_KEY)
  if (!raw) {
    const seeded = seedState()
    window.localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
  try {
    return JSON.parse(raw) as DrillState
  } catch {
    const seeded = seedState()
    window.localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }
}

let cache: DrillState | null = null

export function drillState(): DrillState {
  if (cache === null) {
    cache = readState()
  }
  return cache
}

// 所有写操作都走这里：落 localStorage 的同时返回一份深拷贝给页面，避免页面改到缓存。
export function commitState(state: DrillState): DrillState {
  cache = state
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(state))
  }
  return clone(state)
}

export function resetDrillState(): DrillState {
  return commitState(seedState())
}

export function snapshot(): DrillState {
  return clone(drillState())
}

export function drillStorageKey(): string {
  return DRILL_STORAGE_KEY
}
