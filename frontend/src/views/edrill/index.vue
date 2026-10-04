<template>
  <section class="page" data-module="emergency-drill">
    <header class="page-head">
      <div>
        <h2>应急演练计划管理</h2>
        <p class="page-desc">按应急预案排演练，整批下发参演岗位通知并逐条跟踪确认，评估缺项直连机坪安全巡查整改清单。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="showCreate = true">排演练计划</button>
      </div>
    </header>

    <div class="rule-banner">
      <strong>业务规则（系统强校验）</strong>
      <ul>
        <li>状态只允许沿 <b>待排期 → 已通知 → 进行中 → 已评估</b> 逐步推进，不许跳步。</li>
        <li>排期可一次勾选多个参演岗位整批下发；系统逐条给出确认结果，<b>没确认的留在待通知队列</b>，其余照常往下走。</li>
        <li>同一预案同一时段最多只放一场在办演练；撞车时以 <b>排期登记时间更早者先办</b>，登记时间相同再按演练编号（DR 号）更小者先办。已评估的演练时段释放。</li>
        <li><b>未确认到位的岗位不许进评估</b>；同一场演练只保留一条结论，重复提交不新增。</li>
        <li>评估缺项直接落到机坪安全巡查整改清单，两边读到的缺项条数是同一份。</li>
      </ul>
    </div>

    <div class="stat-row">
      <article v-for="card in stats" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <div class="seg-bar">
      <button
        v-for="seg in statusFilters"
        :key="seg"
        :class="['seg', statusFilter === seg ? 'active' : '']"
        type="button"
        @click="statusFilter = seg"
      >{{ seg }}</button>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>演练编号</th><th>依据预案</th><th>演练时段</th><th>地点</th>
          <th>岗位确认</th><th>整改缺项</th><th>状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="drill in filteredDrills" :key="drill.id">
          <tr>
            <td>{{ drill.drillNo }}</td>
            <td style="max-width:180px">{{ drill.planName }}</td>
            <td>{{ fmt(drill.startTime) }} 至 {{ fmt(drill.endTime) }}</td>
            <td>{{ drill.location }}</td>
            <td>
              <template v-if="drill.status === '待排期'">
                <span class="sub-text">待下发（{{ drill.postIds.length }} 岗）</span>
              </template>
              <template v-else>
                <span class="badge green">{{ confirmedOf(drill) }} 已确认</span>
                <span v-if="pendingOf(drill) > 0" class="badge red" style="margin-left:4px">{{ pendingOf(drill) }} 待通知</span>
              </template>
            </td>
            <td>
              <span v-if="drillRectMap[drill.id]" class="tag-count">{{ drillRectMap[drill.id] }} 条</span>
              <span v-else class="sub-text">—</span>
            </td>
            <td><span :class="['badge', statusClass(drill.status)]">{{ drill.status }}</span></td>
            <td class="row-actions">
              <button v-if="drill.status === '待排期'" class="link" type="button" @click="openNotify(drill.id)">整批下发通知</button>
              <button v-if="drill.status === '已通知'" class="link" type="button" @click="openNotify(drill.id)">通知 / 确认</button>
              <button v-if="drill.status === '已通知'" class="link" type="button" @click="onStart(drill.id)">开始演练</button>
              <button v-if="drill.status === '进行中'" class="link" type="button" @click="openNotify(drill.id)">待通知催办</button>
              <button v-if="drill.status === '进行中'" class="link" type="button" @click="openEvaluate(drill.id)">提交评估</button>
              <button v-if="drill.status === '已评估'" class="link" type="button" @click="viewConclusion(drill.id)">查看结论</button>
              <button v-if="drill.status !== '已评估'" class="link" type="button" style="color:#b42318" @click="onDelete(drill)">删除排期</button>
            </td>
          </tr>
        </template>
        <tr v-if="!filteredDrills.length">
          <td colspan="8" class="empty-state">当前状态下暂无演练计划，点击右上角「排演练计划」新建</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span v-if="message" :class="messageOk ? '' : 'error-text'">{{ message }}</span>
    </footer>

    <CreateDrillDialog v-if="showCreate" @close="showCreate = false" @created="onCreated" />
    <NotifyDialog v-if="notifyId" :drill-id="notifyId" @close="notifyId = 0" @changed="reload" />
    <EvaluateDialog v-if="evaluateId" :drill-id="evaluateId" @close="evaluateId = 0" @done="reload" />

    <!-- 结论查看 -->
    <div v-if="conclusionDrill" class="modal-mask" @click.self="conclusionDrill = null">
      <div class="modal">
        <div class="modal-head">
          <h3>评估结论 · {{ conclusionDrill.drillNo }}</h3>
          <button class="btn ghost" type="button" @click="conclusionDrill = null">关闭</button>
        </div>
        <p>结论：<span :class="['badge', conclusionDrill.conclusion?.result === '不合格' ? 'red' : 'green']">{{ conclusionDrill.conclusion?.result }}</span></p>
        <p class="sub-text">提交时间：{{ fmt(conclusionDrill.conclusion?.submittedAt ?? '') }}</p>
        <p style="white-space:pre-wrap">{{ conclusionDrill.conclusion?.summary }}</p>
        <p class="sub-text">本结论为该场演练唯一结论；缺项 {{ drillRectMap[conclusionDrill.id] ?? 0 }} 条已在机坪安全巡查整改清单跟踪。</p>
        <div class="modal-foot">
          <button class="btn" type="button" @click="conclusionDrill = null">关闭</button>
          <button class="btn primary" type="button" @click="goApron">前往整改清单</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  deleteDrill,
  drillRectCount,
  listDrills,
  startDrill,
} from '@/api/drill-service'
import type { DrillPlanRec, DrillStatus } from '@/data/drill/types'
import CreateDrillDialog from './CreateDrillDialog.vue'
import EvaluateDialog from './EvaluateDialog.vue'
import NotifyDialog from './NotifyDialog.vue'

const router = useRouter()

const drills = ref<DrillPlanRec[]>([])
const drillRectMap = ref<Record<number, number>>({})
const message = ref('')
const messageOk = ref(true)
const statusFilter = ref<DrillStatus | '全部'>('全部')
const statusFilters: (DrillStatus | '全部')[] = ['全部', '待排期', '已通知', '进行中', '已评估']

const showCreate = ref(false)
const notifyId = ref(0)
const evaluateId = ref(0)
const conclusionDrill = ref<DrillPlanRec | null>(null)

const filteredDrills = computed(() =>
  statusFilter.value === '全部'
    ? drills.value
    : drills.value.filter((drill) => drill.status === statusFilter.value),
)

const stats = computed(() => {
  const count = (status: DrillStatus) => drills.value.filter((d) => d.status === status).length
  const pendingAcks = drills.value.reduce(
    (sum, d) => (d.status === '待排期' ? sum : sum + pendingOf(d)),
    0,
  )
  return [
    { label: '待排期', value: count('待排期') },
    { label: '已通知', value: count('已通知') },
    { label: '进行中', value: count('进行中') },
    { label: '已评估', value: count('已评估') },
    { label: '待确认岗位（全量）', value: pendingAcks },
  ]
})

function pendingOf(drill: DrillPlanRec): number {
  return drill.notifications.filter((n) => n.ack !== '已确认').length
}
function confirmedOf(drill: DrillPlanRec): number {
  return drill.notifications.filter((n) => n.ack === '已确认').length
}
function fmt(value: string): string {
  return value ? value.replace('T', ' ') : '—'
}
function statusClass(status: DrillStatus): string {
  if (status === '待排期') return 'gray'
  if (status === '已通知') return 'blue'
  if (status === '进行中') return 'amber'
  return 'green'
}

function flash(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function reload() {
  drills.value = listDrills()
  const map: Record<number, number> = {}
  drills.value.forEach((drill) => {
    const count = drillRectCount(drill.id)
    if (count > 0) map[drill.id] = count
  })
  drillRectMap.value = map
}

function onCreated(drill: DrillPlanRec) {
  showCreate.value = false
  reload()
  flash(true, `演练 ${drill.drillNo} 已排期，可整批下发通知`)
}

function openNotify(id: number) {
  notifyId.value = id
}
function openEvaluate(id: number) {
  evaluateId.value = id
}
function viewConclusion(id: number) {
  conclusionDrill.value = drills.value.find((d) => d.id === id) ?? null
}
function goApron() {
  conclusionDrill.value = null
  router.push('/apron')
}

function onStart(id: number) {
  const result = startDrill(id)
  flash(result.ok, result.message)
  reload()
}

function onDelete(drill: DrillPlanRec) {
  if (!window.confirm(`确认删除演练排期 ${drill.drillNo}？`)) return
  const result = deleteDrill(drill.id)
  flash(result.ok, result.message)
  reload()
}

onMounted(reload)
</script>
