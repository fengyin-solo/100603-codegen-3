<template>
  <section class="page" data-module="drill">
    <header class="page-head">
      <div>
        <h2>应急演练计划与通知确认</h2>
        <p class="page-desc">
          按预案排演练计划，一次勾选多个参演岗位整批下发通知、逐条给出确认结果；未确认的岗位留在待通知队列继续补发，已确认的照常推进。
          状态只能 待排期 → 已通知 → 进行中 → 已评估 顺次推进，未通知到的岗位不许进评估；同一场演练重复提交只留一条结论。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">排演练计划</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span class="legend-item">同一预案同一时段最多一场在办演练（待排期/已通知/进行中）</span>
      <span class="legend-item">撞车依据：创建时间更早者先办，时间相同则演练编号靠前者先办</span>
    </p>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>计划状态</span>
        <select v-model="statusFilter">
          <option value="">全部</option>
          <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>预案 / 演练编号</span>
        <input v-model="keyword" placeholder="按预案名称或演练编号检索" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>演练编号</th>
          <th>所属预案</th>
          <th>演练时段</th>
          <th>地点 / 组织人</th>
          <th>岗位确认（已确认 / 未确认 / 待通知）</th>
          <th>当前状态</th>
          <th>创建时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in filteredSchedules" :key="row.id">
          <td>{{ row.drillNo }}</td>
          <td>{{ row.planName }}</td>
          <td>{{ row.startTime }} ~ {{ row.endTime }}</td>
          <td>{{ row.location }} / {{ row.organizer }}</td>
          <td>
            <span class="badge badge-ok">已确认 {{ countPosts(row, '已确认') }}</span>
            <span class="badge badge-warn">未确认 {{ countPosts(row, '未确认') }}</span>
            <span class="badge badge-muted">待通知 {{ countPosts(row, '待通知') }}</span>
          </td>
          <td><span class="status-pill" :data-status="row.status">{{ row.status }}</span></td>
          <td>{{ row.createdAt }}</td>
          <td class="row-actions wrap">
            <template v-if="row.status === '待排期'">
              <button class="link" type="button" @click="openDispatch(row)">整批下发通知</button>
              <button class="link" type="button" @click="openReschedule(row)">改约</button>
            </template>
            <template v-else-if="row.status === '已通知'">
              <button class="link" type="button" @click="openDispatch(row)">补发通知（{{ countPosts(row, '未确认') + countPosts(row, '待通知') }} 个岗位待通知）</button>
              <button class="link" type="button" @click="start(row)">开始演练</button>
            </template>
            <template v-else-if="row.status === '进行中'">
              <button class="link" type="button" @click="openEvaluate(row)">提交评估</button>
            </template>
            <template v-else>
              <button class="link" type="button" @click="openConclusion(row)">查看结论</button>
              <button class="link" type="button" @click="openEvaluate(row)">重新提交评估</button>
            </template>
          </td>
        </tr>
        <tr v-if="!filteredSchedules.length">
          <td colspan="8" class="empty-state">暂无演练计划，选择预案后排期</td>
        </tr>
      </tbody>
    </table>

    <section class="rectify-block">
      <header class="block-head">
        <h3>演练缺项整改清单（与机坪安全巡查同一份）</h3>
        <p class="page-desc">评估提交的缺项直接落到本清单，机坪安全巡查页读到的条数与这里完全一致；整改在「机坪安全巡查」页按 待整改 → 整改中 → 已复查 推进。</p>
      </header>
      <table class="data-table">
        <thead>
          <tr><th>缺项内容</th><th>来源演练</th><th>责任岗位</th><th>整改状态</th><th>登记时间</th><th>最近更新</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in deficiencies" :key="d.id">
            <td class="cell-wrap">{{ d.content }}</td>
            <td>{{ d.drillNo }}</td>
            <td>{{ d.sourcePost }}</td>
            <td><span class="status-pill" :data-status="d.status">{{ d.status }}</span></td>
            <td>{{ d.createdAt }}</td>
            <td>{{ d.updatedAt }}</td>
          </tr>
          <tr v-if="!deficiencies.length">
            <td colspan="6" class="empty-state">暂无缺项，评估提交后同步到这里和机坪安全巡查整改清单</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <!-- 新建排期 -->
    <div v-if="creating" class="modal-mask" @click.self="creating = false">
      <div class="modal">
        <h3>排演练计划</h3>
        <label class="form-item">
          <span>选择预案</span>
          <select v-model="scheduleForm.planId">
            <option value="" disabled>请选择应急预案</option>
            <option v-for="p in plans" :key="p.id" :value="p.id">
              {{ p.planNo }} {{ p.name }}（参演 {{ p.posts.length }} 个岗位）
            </option>
          </select>
        </label>
        <label class="form-item">
          <span>开始时间</span>
          <input v-model="scheduleForm.startTime" type="datetime-local" />
        </label>
        <label class="form-item">
          <span>结束时间</span>
          <input v-model="scheduleForm.endTime" type="datetime-local" />
        </label>
        <label class="form-item">
          <span>演练地点</span>
          <input v-model="scheduleForm.location" placeholder="如：1号机坪" />
        </label>
        <label class="form-item">
          <span>组织人</span>
          <input v-model="scheduleForm.organizer" placeholder="值班管理员" />
        </label>
        <p class="rule-hint">同一预案同一时段已有在办演练时将被拦下；创建时间更早者先办，时间相同演练编号靠前者先办。</p>
        <p v-if="scheduleError" class="error-text">{{ scheduleError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="creating = false">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">确认排期</button>
        </div>
      </div>
    </div>

    <!-- 改约 -->
    <div v-if="rescheduling" class="modal-mask" @click.self="rescheduling = null">
      <div class="modal">
        <h3>改约演练 {{ rescheduling.drillNo }}</h3>
        <p class="page-desc">仅待排期计划可改约，改约同样受同预案同时段唯一在办演练规则约束。</p>
        <label class="form-item">
          <span>开始时间</span>
          <input v-model="rescheduleForm.startTime" type="datetime-local" />
        </label>
        <label class="form-item">
          <span>结束时间</span>
          <input v-model="rescheduleForm.endTime" type="datetime-local" />
        </label>
        <label class="form-item">
          <span>演练地点</span>
          <input v-model="rescheduleForm.location" />
        </label>
        <p v-if="rescheduleError" class="error-text">{{ rescheduleError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="rescheduling = null">取消</button>
          <button class="btn primary" type="button" @click="submitReschedule">确认改约</button>
        </div>
      </div>
    </div>

    <!-- 整批下发 / 补发通知 -->
    <div v-if="dispatching" class="modal-mask" @click.self="dispatching = null">
      <div class="modal modal-wide">
        <h3>{{ dispatching.status === '待排期' ? '整批下发通知' : '补发通知' }} · {{ dispatching.drillNo }}</h3>
        <p class="page-desc">
          勾选本轮要通知的多个岗位并逐条登记确认结果；未确认的岗位继续留在待通知队列，只补发它们，已确认岗位不回退、照常往下走。
        </p>
        <table class="data-table">
          <thead>
            <tr><th>纳入本轮</th><th>参演岗位</th><th>下发前状态</th><th>本轮确认结果</th></tr>
          </thead>
          <tbody>
            <tr v-for="line in dispatchRows" :key="line.post">
              <td>
                <input v-if="line.before !== '已确认'" v-model="line.selected" type="checkbox" />
                <span v-else class="badge badge-ok">已确认</span>
              </td>
              <td>{{ line.post }}</td>
              <td><span class="badge" :class="badgeClass(line.before)">{{ line.before }}</span></td>
              <td>
                <label v-if="line.before !== '已确认'" class="inline-radio">
                  <input v-model="line.reached" type="radio" :value="true" :disabled="!line.selected" /> 确认收到
                </label>
                <label class="inline-radio">
                  <input v-model="line.reached" type="radio" :value="false" :disabled="!line.selected" /> 未确认
                </label>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="dispatchResult.length" class="dispatch-result">
          <strong>本轮逐条确认结果：</strong>
          <ul>
            <li v-for="l in dispatchResult" :key="l.post">
              <span class="badge" :class="badgeClass(l.after)">{{ l.after }}</span>
              {{ l.post }}：{{ l.before }} → {{ l.after }}
            </li>
          </ul>
        </div>
        <p v-if="dispatchError" class="error-text">{{ dispatchError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="dispatching = null">关闭</button>
          <button class="btn primary" type="button" @click="submitDispatch">下发并登记确认</button>
        </div>
      </div>
    </div>

    <!-- 提交评估 -->
    <div v-if="evaluating" class="modal-mask" @click.self="evaluating = null">
      <div class="modal modal-wide">
        <h3>演练评估 · {{ evaluating.drillNo }}</h3>
        <p v-if="gateBlock" class="error-text">{{ gateBlock }}</p>
        <div class="post-summary">
          <span class="badge badge-ok">已确认参演 {{ countPosts(evaluating, '已确认') }}</span>
          <span class="badge badge-warn">未确认（缺岗记录）{{ countPosts(evaluating, '未确认') }}</span>
          <span class="badge badge-muted">待通知 {{ countPosts(evaluating, '待通知') }}</span>
          <span v-if="countPosts(evaluating, '待通知') === 0" class="rule-hint">全部岗位均已通知到，允许提交评估。</span>
        </div>
        <label class="form-item">
          <span>演练评级</span>
          <select v-model="evaluateForm.grade">
            <option value="" disabled>请选择</option>
            <option v-for="g in grades" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
        <label class="form-item">
          <span>评估人</span>
          <input v-model="evaluateForm.trainer" placeholder="值班管理员" />
        </label>
        <label class="form-item">
          <span>评估结论</span>
          <textarea v-model="evaluateForm.summary" rows="3"></textarea>
        </label>
        <div class="form-item">
          <span>缺项清单（同步机坪安全巡查整改清单，重复提交以本次为准）</span>
          <div v-for="(item, idx) in evaluateForm.deficiencies" :key="idx" class="def-row">
            <input v-model="item.content" placeholder="缺项描述，如：引导车出动超时" />
            <select v-model="item.sourcePost">
              <option value="综合">综合</option>
              <option v-for="p in evaluating.posts" :key="p.post" :value="p.post">{{ p.post }}</option>
            </select>
            <button class="btn ghost" type="button" @click="evaluateForm.deficiencies.splice(idx, 1)">删除</button>
          </div>
          <button class="btn" type="button" @click="addDeficiencyRow">新增一条缺项</button>
        </div>
        <p v-if="evaluateError" class="error-text">{{ evaluateError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="evaluating = null">取消</button>
          <button class="btn primary" type="button" :disabled="gateBlock !== ''" @click="submitEvaluate">提交评估</button>
        </div>
      </div>
    </div>

    <!-- 查看结论 -->
    <div v-if="viewing" class="modal-mask" @click.self="viewing = null">
      <div class="modal">
        <h3>演练结论 · {{ viewing.drillNo }}</h3>
        <template v-if="viewingConclusion">
          <p><strong>评级：</strong>{{ viewingConclusion.grade }}</p>
          <p><strong>评估人：</strong>{{ viewingConclusion.trainer }} ｜ <strong>评估时间：</strong>{{ viewingConclusion.evaluatedAt }}</p>
          <p class="cell-wrap"><strong>结论：</strong>{{ viewingConclusion.summary }}</p>
          <p><strong>实际参演岗位：</strong>{{ viewingConclusion.participatedPosts }} 个；
            <strong>未确认缺岗：</strong>{{ viewingConclusion.unconfirmedPosts.join('、') || '无' }}</p>
          <p><strong>缺项条数：</strong>{{ viewingDeficiencies.length }}（与机坪安全巡查整改清单同源）</p>
          <ul class="concise-list">
            <li v-for="d in viewingDeficiencies" :key="d.id">
              <span class="status-pill" :data-status="d.status">{{ d.status }}</span>
              {{ d.content }}（{{ d.sourcePost }}）
            </li>
          </ul>
          <p v-if="viewingConclusion.submittedTimes > 1" class="rule-hint">本结论为第 {{ viewingConclusion.submittedTimes }} 次提交，重复提交仅保留这一条。</p>
        </template>
        <p v-else class="error-text">未找到评估结论</p>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="viewing = null">关闭</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import {
  createSchedule,
  dispatchNotices,
  getConclusion,
  listDeficiencies,
  listPlans,
  listSchedules,
  reschedule,
  startDrill,
  submitEvaluation,
} from '@/api/drill-service'
import type {
  Deficiency,
  DispatchLine,
  DrillConclusion,
  DrillPlan,
  DrillSchedule,
  DrillStatus,
  PostNoticeStatus,
} from '@/data/drill-types'

const route = useRoute()

const statuses: DrillStatus[] = ['待排期', '已通知', '进行中', '已评估']
const grades = ['优秀', '良好', '合格', '不合格']

const plans = ref<DrillPlan[]>([])
const schedules = ref<DrillSchedule[]>([])
const deficiencies = ref<Deficiency[]>([])
const statusFilter = ref<DrillStatus | ''>('')
const keyword = ref('')
const message = ref('')
const messageOk = ref(false)

function flash(text: string, ok = false) {
  message.value = text
  messageOk.value = ok
}

function countPosts(row: DrillSchedule, status: PostNoticeStatus): number {
  return row.posts.filter((p) => p.status === status).length
}

function badgeClass(status: PostNoticeStatus): string {
  if (status === '已确认') return 'badge-ok'
  if (status === '未确认') return 'badge-warn'
  return 'badge-muted'
}

const stats = computed(() =>
  statuses.map((status) => ({
    label: status,
    value: schedules.value.filter((s) => s.status === status).length,
  })),
)

const filteredSchedules = computed(() => {
  const key = keyword.value.trim()
  return listSchedules(statusFilter.value).filter((row) => {
    if (!key) return true
    return row.planName.includes(key) || row.drillNo.includes(key)
  })
})

function reload() {
  plans.value = listPlans()
  schedules.value = listSchedules()
  deficiencies.value = listDeficiencies()
}

/* ---------- 新建排期 ---------- */
const creating = ref(false)
const scheduleError = ref('')
const scheduleForm = ref({ planId: '' as number | '', startTime: '', endTime: '', location: '', organizer: '值班管理员' })

function toLocalInput(value: string): string {
  // 存储统一是 "YYYY-MM-DD HH:mm"，datetime-local 需要 "YYYY-MM-DDTHH:mm"。
  return value.replace(' ', 'T')
}
function fromLocalInput(value: string): string {
  return value.replace('T', ' ')
}

function openCreate() {
  scheduleForm.value = {
    planId: typeof route.query.plan === 'string' ? Number(route.query.plan) || '' : '',
    startTime: '',
    endTime: '',
    location: '',
    organizer: '值班管理员',
  }
  scheduleError.value = ''
  creating.value = true
}

function submitCreate() {
  scheduleError.value = ''
  const result = createSchedule({
    planId: Number(scheduleForm.value.planId),
    startTime: fromLocalInput(scheduleForm.value.startTime),
    endTime: fromLocalInput(scheduleForm.value.endTime),
    location: scheduleForm.value.location,
    organizer: scheduleForm.value.organizer,
  })
  if (!result.ok) {
    scheduleError.value = result.message
    return
  }
  creating.value = false
  flash(result.message, true)
  reload()
}

/* ---------- 改约 ---------- */
const rescheduling = ref<DrillSchedule | null>(null)
const rescheduleError = ref('')
const rescheduleForm = ref({ startTime: '', endTime: '', location: '' })

function openReschedule(row: DrillSchedule) {
  rescheduling.value = row
  rescheduleForm.value = {
    startTime: toLocalInput(row.startTime),
    endTime: toLocalInput(row.endTime),
    location: row.location,
  }
  rescheduleError.value = ''
}

function submitReschedule() {
  if (!rescheduling.value) return
  const result = reschedule(rescheduling.value.id, {
    startTime: fromLocalInput(rescheduleForm.value.startTime),
    endTime: fromLocalInput(rescheduleForm.value.endTime),
    location: rescheduleForm.value.location,
  })
  if (!result.ok) {
    rescheduleError.value = result.message
    return
  }
  rescheduling.value = null
  flash(result.message, true)
  reload()
}

/* ---------- 整批下发通知 ---------- */
const dispatching = ref<DrillSchedule | null>(null)
const dispatchError = ref('')
interface DispatchRow {
  post: string
  before: PostNoticeStatus
  selected: boolean
  reached: boolean
}
const dispatchRows = ref<DispatchRow[]>([])
const dispatchResult = ref<DispatchLine[]>([])

function openDispatch(row: DrillSchedule) {
  dispatching.value = row
  dispatchError.value = ''
  dispatchResult.value = []
  dispatchRows.value = row.posts.map((p) => ({
    post: p.post,
    before: p.status,
    selected: p.status !== '已确认',
    reached: true,
  }))
}

function submitDispatch() {
  if (!dispatching.value) return
  dispatchError.value = ''
  const choices = dispatchRows.value
    .filter((r) => r.selected && r.before !== '已确认')
    .map((r) => ({ post: r.post, reached: r.reached }))
  if (choices.length === 0) {
    dispatchError.value = '请至少勾选一个待通知岗位'
    return
  }
  const result = dispatchNotices(dispatching.value.id, choices)
  if (!result.ok) {
    dispatchError.value = result.message
    return
  }
  dispatchResult.value = result.data.lines
  flash(result.data.message, true)
  reload()
  // 用最新数据刷新弹窗里的状态，便于接着补发。
  const fresh = listSchedules().find((s) => s.id === dispatching.value?.id)
  if (fresh) {
    dispatching.value = fresh
    dispatchRows.value = fresh.posts.map((p) => ({
      post: p.post,
      before: p.status,
      selected: p.status !== '已确认',
      reached: true,
    }))
  }
}

/* ---------- 开始演练 ---------- */
function start(row: DrillSchedule) {
  const result = startDrill(row.id)
  flash(result.message, result.ok)
  if (result.ok) reload()
}

/* ---------- 提交评估 ---------- */
const evaluating = ref<DrillSchedule | null>(null)
const evaluateError = ref('')
interface DefForm { content: string; sourcePost: string }
const evaluateForm = ref<{ grade: string; trainer: string; summary: string; deficiencies: DefForm[] }>({
  grade: '', trainer: '值班管理员', summary: '', deficiencies: [],
})

const gateBlock = computed(() => {
  if (!evaluating.value) return ''
  if (evaluating.value.status === '已评估') return '' // 已评估的重复提交允许覆盖
  const pending = countPosts(evaluating.value, '待通知')
  if (pending > 0) {
    const names = evaluating.value.posts.filter((p) => p.status === '待通知').map((p) => p.post).join('、')
    return `还有 ${pending} 个岗位没通知到（${names}），未通知到的岗位不许直接进评估，请先补发通知`
  }
  return ''
})

function openEvaluate(row: DrillSchedule) {
  evaluating.value = row
  evaluateError.value = ''
  const conclusion = getConclusion(row.id)
  evaluateForm.value = {
    grade: conclusion?.grade ?? '',
    trainer: conclusion?.trainer ?? '值班管理员',
    summary: conclusion?.summary ?? '',
    deficiencies: listDeficiencies(row.id).map((d) => ({ content: d.content, sourcePost: d.sourcePost })),
  }
  if (evaluateForm.value.deficiencies.length === 0) {
    evaluateForm.value.deficiencies.push({ content: '', sourcePost: '综合' })
  }
}

function addDeficiencyRow() {
  evaluateForm.value.deficiencies.push({ content: '', sourcePost: '综合' })
}

function submitEvaluate() {
  if (!evaluating.value) return
  evaluateError.value = ''
  const result = submitEvaluation(evaluating.value.id, {
    grade: evaluateForm.value.grade,
    trainer: evaluateForm.value.trainer,
    summary: evaluateForm.value.summary,
    deficiencies: evaluateForm.value.deficiencies,
  })
  if (!result.ok) {
    evaluateError.value = result.message
    return
  }
  evaluating.value = null
  flash(result.message, true)
  reload()
}

/* ---------- 查看结论 ---------- */
const viewing = ref<DrillSchedule | null>(null)
const viewingConclusion = ref<DrillConclusion | null>(null)
const viewingDeficiencies = ref<Deficiency[]>([])

function openConclusion(row: DrillSchedule) {
  viewing.value = row
  viewingConclusion.value = getConclusion(row.id)
  viewingDeficiencies.value = listDeficiencies(row.id)
}

onMounted(() => {
  reload()
})
</script>
