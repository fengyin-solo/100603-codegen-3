<template>
  <section class="page" data-module="apron">
    <header class="page-head">
      <div>
        <h2>机坪安全巡查管理</h2>
        <p class="page-desc">维护巡查记录；下方整改清单与应急演练评估共用同一份，演练缺项自动转入，逐条跟踪整改。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记巡查记录</button>
        <button class="btn" type="button" @click="exportRows">导出机坪安全巡查清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无机坪安全巡查数据，可先登记巡查记录</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">
      整改清单
      <span class="sub-text">（共 {{ rects.length }} 条；其中演练转入 {{ drillRects.length }} 条，与应急演练页同源同数）</span>
    </h3>
    <div style="margin-bottom:8px">
      <button class="btn primary" type="button" @click="showAddRect = true">登记巡查缺项</button>
      <div class="seg-bar" style="display:inline-flex; margin:0 0 0 8px">
        <button
          v-for="seg in rectFilters"
          :key="seg"
          :class="['seg', rectFilter === seg ? 'active' : '']"
          type="button"
          style="padding:2px 10px"
          @click="rectFilter = seg"
        >{{ seg }}</button>
      </div>
    </div>
    <table class="data-table table-wrap">
      <thead>
        <tr>
          <th>单号</th><th>来源</th><th>问题描述</th><th>严重程度</th><th>登记时间</th><th>整改状态</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rect in filteredRects" :key="rect.id">
          <td>{{ rect.sourceNo }}</td>
          <td>
            <span :class="['badge', rect.source === 'drill' ? 'blue' : 'gray']">
              {{ rect.source === 'drill' ? `演练 ${rect.sourceNo}` : '巡查登记' }}
            </span>
          </td>
          <td>
            <div>{{ rect.title }}</div>
            <div class="sub-text">{{ rect.content }}</div>
          </td>
          <td>
            <span :class="['badge', rect.severity === '严重' ? 'red' : 'gray']">{{ rect.severity }}</span>
          </td>
          <td>{{ formatTime(rect.createdAt) }}</td>
          <td>
            <span :class="['badge', rectStatusClass(rect.status)]">{{ rect.status }}</span>
          </td>
          <td>
            <button
              v-if="rect.status !== '已复查'"
              class="link"
              type="button"
              @click="onAdvanceRect(rect.id)"
            >{{ rect.status === '待整改' ? '确认已整改' : '确认复查' }}</button>
            <span v-else class="sub-text">流程结束</span>
          </td>
        </tr>
        <tr v-if="!filteredRects.length">
          <td colspan="7" class="empty-state">整改清单暂无记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条机坪安全巡查记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="rectMessage" :class="rectMessageOk ? '' : 'error-text'">{{ rectMessage }}</span>
    </footer>

    <!-- 登记巡查缺项 -->
    <div v-if="showAddRect" class="modal-mask" @click.self="showAddRect = false">
      <div class="modal">
        <div class="modal-head">
          <h3>登记巡查缺项到整改清单</h3>
          <button class="btn ghost" type="button" @click="showAddRect = false">关闭</button>
        </div>
        <div class="form-grid">
          <label class="form-field full">
            <span>问题描述</span>
            <textarea v-model="rectForm.content" placeholder="巡查发现的缺项/问题"></textarea>
          </label>
          <label class="form-field">
            <span>严重程度</span>
            <select v-model="rectForm.severity">
              <option value="一般">一般</option>
              <option value="严重">严重</option>
            </select>
          </label>
        </div>
        <p v-if="rectFormError" class="error-text" style="margin-top:10px">{{ rectFormError }}</p>
        <div class="modal-foot">
          <button class="btn" type="button" @click="showAddRect = false">取消</button>
          <button class="btn primary" type="button" @click="onAddRect">登记</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  addInspectionRectification,
  advanceRectification,
  listRectifications,
} from '@/api/drill-service'
import type { EntryRow } from '@/data/types'
import type { RectificationItem, RectStatus } from '@/data/drill/types'

const meta = moduleMeta('apron')
const columns = ["巡查编号", "巡查区域", "巡查人员", "发现问题数", "整改单号", "巡查时间", "复查日期", "巡查状态"]
const actions = ["开始巡查", "提交整改", "确认复查"]
const statuses = ["待巡查", "巡查中", "待整改", "已复查"]
const stats = ref([
  { label: '今日巡查次数', value: 0 },
  { label: '巡查中记录', value: 0 },
  { label: '整改清单缺项', value: 0 },
])

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

/* ---------------- 共用整改清单 ---------------- */
const rects = ref<RectificationItem[]>([])
const rectFilter = ref<RectStatus | '全部' | '演练转入'>('全部')
const rectFilters: (RectStatus | '全部' | '演练转入')[] = ['全部', '演练转入', '待整改', '已整改', '已复查']
const rectMessage = ref('')
const rectMessageOk = ref(true)
const showAddRect = ref(false)
const rectFormError = ref('')
const rectForm = reactive({ content: '', severity: '一般' as '一般' | '严重' })

const drillRects = computed(() => rects.value.filter((rect) => rect.source === 'drill'))
const filteredRects = computed(() => {
  if (rectFilter.value === '全部') return rects.value
  if (rectFilter.value === '演练转入') return drillRects.value
  return rects.value.filter((rect) => rect.status === rectFilter.value)
})

function formatTime(value: string): string {
  return value ? value.replace('T', ' ') : '—'
}
function rectStatusClass(status: RectStatus): string {
  if (status === '待整改') return 'red'
  if (status === '已整改') return 'amber'
  return 'green'
}

function reloadRects() {
  rects.value = listRectifications()
  stats.value[2] = { label: '整改清单缺项', value: rects.value.filter((r) => r.status !== '已复查').length }
}
function onAddRect() {
  rectFormError.value = ''
  const result = addInspectionRectification({ content: rectForm.content, severity: rectForm.severity })
  if (!result.ok) {
    rectFormError.value = result.message
    return
  }
  rectForm.content = ''
  rectForm.severity = '一般'
  showAddRect.value = false
  rectMessageOk.value = true
  rectMessage.value = result.message
  reloadRects()
}
function onAdvanceRect(id: number) {
  const result = advanceRectification(id)
  rectMessageOk.value = result.ok
  rectMessage.value = result.message
  reloadRects()
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '巡查记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    stats.value[0] = { label: '今日巡查次数', value: payload.total }
    stats.value[1] = { label: '巡查中记录', value: payload.items.filter((r) => r.status === '巡查中').length }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '机坪安全巡查列表读取失败'
  }
}

onMounted(() => {
  reload()
  reloadRects()
})
</script>
