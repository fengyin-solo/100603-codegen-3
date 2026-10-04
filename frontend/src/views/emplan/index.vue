<template>
  <section class="page" data-module="emergency-plan">
    <header class="page-head">
      <div>
        <h2>应急预案管理</h2>
        <p class="page-desc">维护预案的适用场景、启动条件与参演岗位；演练排期必须基于已启用的预案。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">新建预案</button>
      </div>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">预案总数</span>
        <strong class="stat-value">{{ plans.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已启用</span>
        <strong class="stat-value">{{ enabledCount }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已停用</span>
        <strong class="stat-value">{{ plans.length - enabledCount }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>关键字</span>
        <input v-model="keyword" placeholder="按名称 / 场景 / 启动条件检索" />
      </label>
      <button class="btn ghost" type="button" @click="keyword = ''">清空</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>预案编号</th><th>预案名称</th><th>适用场景</th><th>启动条件</th>
          <th>参演岗位</th><th>状态</th><th>更新时间</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="plan in filteredPlans" :key="plan.id">
          <td>{{ plan.planNo }}</td>
          <td>{{ plan.name }}</td>
          <td style="max-width: 220px">{{ plan.scenario }}</td>
          <td style="max-width: 240px">{{ plan.triggerCondition }}</td>
          <td style="max-width: 240px">
            <span v-for="name in postNames(plan.postIds)" :key="name" class="legend-item" style="margin: 2px 4px 2px 0; display: inline-block">{{ name }}</span>
          </td>
          <td>
            <span :class="['badge', plan.enabled ? 'green' : 'gray']">{{ plan.enabled ? '已启用' : '已停用' }}</span>
          </td>
          <td>{{ formatTime(plan.updatedAt) }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openEdit(plan)">编辑</button>
            <button class="link" type="button" @click="onToggle(plan)">{{ plan.enabled ? '停用' : '启用' }}</button>
            <button class="link" type="button" style="color:#b42318" @click="onDelete(plan)">删除</button>
          </td>
        </tr>
        <tr v-if="!filteredPlans.length">
          <td colspan="8" class="empty-state">暂无预案，可先新建一份应急预案</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span v-if="message" :class="messageOk ? '' : 'error-text'">{{ message }}</span>
    </footer>

    <!-- 新建 / 编辑预案 -->
    <div v-if="editing" class="modal-mask" @click.self="editing = null">
      <div class="modal">
        <div class="modal-head">
          <h3>{{ editing.id ? `编辑预案 ${editing.planNo}` : '新建应急预案' }}</h3>
          <button class="btn ghost" type="button" @click="editing = null">关闭</button>
        </div>
        <div class="form-grid">
          <label class="form-field full">
            <span>预案名称</span>
            <input v-model="form.name" type="text" placeholder="如：秋冬季航空器除防冰保障预案" />
          </label>
          <label class="form-field full">
            <span>适用场景</span>
            <textarea v-model="form.scenario" placeholder="什么情况下用这份预案"></textarea>
          </label>
          <label class="form-field full">
            <span>启动条件</span>
            <textarea v-model="form.triggerCondition" placeholder="达到什么条件时启动本预案"></textarea>
          </label>
          <div class="form-field full">
            <label>参演岗位（可多选）</label>
            <div class="check-grid">
              <label v-for="post in posts" :key="post.id">
                <input v-model="form.postIds" type="checkbox" :value="post.id" />
                {{ post.name }}
              </label>
            </div>
          </div>
          <label class="form-field">
            <span>状态</span>
            <select v-model="form.enabled">
              <option :value="true">已启用（可据此排演练）</option>
              <option :value="false">已停用</option>
            </select>
          </label>
        </div>
        <p v-if="formError" class="error-text" style="margin-top:10px">{{ formError }}</p>
        <div class="modal-foot">
          <button class="btn" type="button" @click="editing = null">取消</button>
          <button class="btn primary" type="button" @click="onSave">保存预案</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  createPlan,
  deletePlan,
  listPlans,
  listPosts,
  togglePlanEnabled,
  updatePlan,
} from '@/api/drill-service'
import type { DrillPost, EmergencyPlan } from '@/data/drill/types'

const posts = ref<DrillPost[]>([])
const plans = ref<EmergencyPlan[]>([])
const keyword = ref('')
const message = ref('')
const messageOk = ref(true)

const enabledCount = computed(() => plans.value.filter((plan) => plan.enabled).length)
const filteredPlans = computed(() => {
  const key = keyword.value.trim()
  if (!key) return plans.value
  return plans.value.filter((plan) =>
    [plan.name, plan.scenario, plan.triggerCondition].some((text) => text.includes(key)),
  )
})

const postMap = computed(() => new Map(posts.value.map((post) => [post.id, post.name])))
function postNames(ids: string[]): string[] {
  return ids.map((id) => postMap.value.get(id) ?? id)
}

function formatTime(value: string): string {
  return value ? value.replace('T', ' ') : '—'
}

function flash(ok: boolean, text: string) {
  messageOk.value = ok
  message.value = text
}

function reload() {
  plans.value = listPlans()
}

type Editing = (EmergencyPlan & {}) | null
const editing = ref<Editing>(null)
const form = reactive({
  name: '',
  scenario: '',
  triggerCondition: '',
  postIds: [] as string[],
  enabled: true,
})
const formError = ref('')

function openCreate() {
  formError.value = ''
  Object.assign(form, { name: '', scenario: '', triggerCondition: '', postIds: [], enabled: true })
  editing.value = {} as EmergencyPlan
}

function openEdit(plan: EmergencyPlan) {
  formError.value = ''
  Object.assign(form, {
    name: plan.name,
    scenario: plan.scenario,
    triggerCondition: plan.triggerCondition,
    postIds: [...plan.postIds],
    enabled: plan.enabled,
  })
  editing.value = plan
}

function onSave() {
  const payload = { ...form, postIds: [...form.postIds] }
  const result = editing.value && editing.value.id
    ? updatePlan(editing.value.id, payload)
    : createPlan(payload)
  formError.value = result.ok ? '' : result.message
  if (!result.ok) return
  editing.value = null
  reload()
  flash(true, result.message)
}

function onToggle(plan: EmergencyPlan) {
  const result = togglePlanEnabled(plan.id)
  flash(result.ok, result.message)
  reload()
}

function onDelete(plan: EmergencyPlan) {
  if (!window.confirm(`确认删除预案 ${plan.planNo}？`)) return
  const result = deletePlan(plan.id)
  flash(result.ok, result.message)
  reload()
}

onMounted(() => {
  posts.value = listPosts()
  reload()
})
</script>
