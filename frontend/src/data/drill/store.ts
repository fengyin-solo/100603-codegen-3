import { DRILL_SEED } from './seed'
import type { DrillPlanRec, DrillPost, EmergencyPlan, RectificationItem } from './types'

/**
 * 应急演练领域的本地持久化。
 * 通用模块用 local-store.ts（airport-ground-ops:entries），
 * 这里结构不同，单独放一个 key，互不影响；同样落在 localStorage，刷新不丢。
 */
export const DRILL_STORAGE_KEY = 'airport-ground-ops:drill-domain:v1'

type Stored = {
  posts?: DrillPost[]
  plans?: EmergencyPlan[]
  drills?: DrillPlanRec[]
  rectifications?: RectificationItem[]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Stored {
  const fallback = clone(DRILL_SEED)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(DRILL_STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    // 与通用层一致：缺哪个集合就用种子补上，旧版本数据也能平滑升级。
    const parsed = JSON.parse(raw) as Stored
    return {
      posts: parsed.posts ?? fallback.posts,
      plans: parsed.plans ?? fallback.plans,
      drills: parsed.drills ?? fallback.drills,
      rectifications: parsed.rectifications ?? fallback.rectifications,
    }
  } catch {
    window.localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Stored | null = null

function state(): Stored {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

function persist(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(DRILL_STORAGE_KEY, JSON.stringify(state()))
  }
}

/** 读取某个集合的副本，避免页面直接改到缓存里的对象。 */
export function loadCollection<K extends keyof Stored>(key: K): NonNullable<Stored[K]> {
  return clone(state()[key] ?? []) as NonNullable<Stored[K]>
}

/** 写回某个集合并落盘。 */
export function saveCollection<K extends keyof Stored>(key: K, rows: NonNullable<Stored[K]>): void {
  cache = { ...state(), [key]: clone(rows) }
  persist()
}

/** 回到内置示例数据（与通用层「重置」语义一致，供排查时使用）。 */
export function resetDrillDomain(): void {
  cache = clone(DRILL_SEED)
  persist()
}

/** 集合内下一个自增主键，按已有最大 id + 1。 */
export function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) ?? 0), 0) + 1
}
