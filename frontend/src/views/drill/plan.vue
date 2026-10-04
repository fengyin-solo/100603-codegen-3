<template>
  <section class="page" data-module="drill-plan">
    <header class="page-head">
      <div>
        <h2>应急预案管理</h2>
        <p class="page-desc">
          维护预案的适用场景、启动条件与参演岗位；演练计划按预案排期。
          同一预案同一时段最多只放一场在办演练，撞车时创建时间更早者先办（时间相同演练编号靠前者先办）。
        </p>
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
        <span class="stat-label">参演岗位合计（去重前登记数）</span>
        <strong class="stat-value">{{ postRefs }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已用于排演的预案</span>
        <strong class="stat-value">{{ usedPlanCount }}</strong>
      </article>
    </div>

    <form class="filter-bar" @submit.prevent>
      <label class="filter-item">
        <span>预案名称 / 场景</span>
        <input v-model="keyword" placeholder="按名称或适用场景检索" />
      </label>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>预案编号</th>
          <th>预案名称</th>
          <th>适用场景</th>
          <th>启动条件</th>
          <th>参演岗位</th>
          <th>建立时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="plan in filteredPlans" :key="plan.id">
          <td>{{ plan.planNo }}</td>
          <td>{{ plan.name }}</td>
          <td class="cell-wrap">{{ plan.scene }}</td>
          <td class="cell-wrap">{{ plan.trigger }}</td>
          <td>
            <span v-for="post in plan.posts" :key="post" class="tag">{{ post }}</span>
          </td>
          <td>{{ plan.createdAt }}</td>
          <td class="row-actions">
            <button class="link" type="button" @click="openEdit(plan)">编辑</button>
            <button class="link danger" type="button" @click="removePlan(plan)">删除</button>
            <button class="link" type="button" @click="goSchedule(plan.id)">按此预案排期</button>
          </td>
        </tr>
        <tr v-if="!filteredPlans.length">
          <td colspan="7" class="empty-state">暂无预案，先新建一份换季应急预案</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>

    <div v-if="editing" class="modal-mask" @click.self="editing = null">
      <div class="modal">
        <h3>{{ form.id ? '编辑预案' : '新建预案' }}</h3>
        <label class="form-item">
          <span>预案名称</span>
          <input v-model="form.name" placeholder="如：秋冬季低能见度运行预案" />
        </label>
        <label class="form-item">
          <span>适用场景</span>
          <textarea v-model="form.scene" rows="2" placeholder="在什么场景下启用本预案"></textarea>
        </label>
        <label class="form-item">
          <span>启动条件</span>
          <textarea v-model="form.trigger" rows="2" placeholder="达到什么阈值/预警时启动"></textarea>
        </label>
        <div class="form-item">
          <span>参演岗位（每行一个）</span>
          <textarea v-model="postText" rows="5" placeholder="机坪塔台&#10;场务保障"></textarea>
        </div>
        <p v-if="formError" class="error-text">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="editing = null">取消</button>
          <button class="btn primary" type="button" @click="save">保存</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import {
  createPlan,
  deletePlan,
  listPlans,
  listSchedules,
  updatePlan,
} from '@/api/drill-service'
import type { DrillPlan } from '@/data/drill-types'

const router = useRouter()
const plans = ref<DrillPlan[]>([])
const keyword = ref('')
const message = ref('')
const messageOk = ref(false)

const editing = ref<DrillPlan | 'new' | null>(null)
const form = ref({ id: 0, name: '', scene: '', trigger: '' })
const postText = ref('')
const formError = ref('')

const filteredPlans = computed(() => {
  const key = keyword.value.trim()
  if (!key) return plans.value
  return plans.value.filter((p) => p.name.includes(key) || p.scene.includes(key) || p.planNo.includes(key))
})

const usedPlanIds = computed(() => new Set(listSchedules().map((s) => s.planId)))
const usedPlanCount = computed(() => plans.value.filter((p) => usedPlanIds.value.has(p.id)).length)
const postRefs = computed(() => plans.value.reduce((sum, p) => sum + p.posts.length, 0))

function reload() {
  plans.value = listPlans()
}

function flash(text: string, ok = false) {
  message.value = text
  messageOk.value = ok
}

function openCreate() {
  editing.value = 'new'
  form.value = { id: 0, name: '', scene: '', trigger: '' }
  postText.value = ''
  formError.value = ''
}

function openEdit(plan: DrillPlan) {
  editing.value = plan
  form.value = { id: plan.id, name: plan.name, scene: plan.scene, trigger: plan.trigger }
  postText.value = plan.posts.join('\n')
  formError.value = ''
}

function save() {
  formError.value = ''
  const posts = postText.value.split('\n').map((p) => p.trim()).filter(Boolean)
  try {
    if (form.value.id) {
      updatePlan(form.value.id, { ...form.value, posts })
      flash(`预案已更新：参演岗位调整只影响之后的新排期，已排演练沿用排期时的岗位快照`, true)
    } else {
      const plan = createPlan({ ...form.value, posts })
      flash(`预案 ${plan.planNo} 已建立，可按此预案排演练计划`, true)
    }
    editing.value = null
    reload()
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '保存失败'
  }
}

function removePlan(plan: DrillPlan) {
  const result = deletePlan(plan.id)
  flash(result.message, result.ok)
  if (result.ok) reload()
}

function goSchedule(planId: number) {
  router.push({ name: 'drill', query: { plan: String(planId) } })
}

onMounted(() => {
  reload()
})
</script>
