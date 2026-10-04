<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal wide">
      <div class="modal-head">
        <h3>排演练计划</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>

      <div class="form-grid">
        <label class="form-field full">
          <span>选择预案</span>
          <select v-model="form.planId" @change="onPlanChange">
            <option :value="0">请选择已启用的预案</option>
            <option v-for="plan in enabledPlans" :key="plan.id" :value="plan.id">
              {{ plan.planNo }} · {{ plan.name }}
            </option>
          </select>
        </label>

        <template v-if="selectedPlan">
          <div class="form-field full">
            <label>适用场景（取自预案）</label>
            <div class="sub-text">{{ selectedPlan.scenario }}</div>
          </div>
          <div class="form-field full">
            <label>启动条件（取自预案）</label>
            <div class="sub-text">{{ selectedPlan.triggerCondition }}</div>
          </div>

          <label class="form-field">
            <span>开始时间</span>
            <input v-model="form.startTime" type="datetime-local" />
          </label>
          <label class="form-field">
            <span>结束时间</span>
            <input v-model="form.endTime" type="datetime-local" />
          </label>
          <label class="form-field full">
            <span>演练地点</span>
            <input v-model="form.location" type="text" placeholder="如：除冰一区 / 3号机位" />
          </label>

          <div class="form-field full">
            <label>
              参演岗位（可整批多选；同一预案的岗位才可选）
              <span class="sub-text">已选 {{ form.postIds.length }} / {{ selectablePosts.length }}</span>
            </label>
            <div style="margin-bottom:6px">
              <button class="btn" type="button" @click="selectAll">全选预案岗位</button>
              <button class="btn ghost" type="button" @click="form.postIds = []">清空</button>
            </div>
            <div class="check-grid">
              <label v-for="post in selectablePosts" :key="post.id">
                <input v-model="form.postIds" type="checkbox" :value="post.id" />
                {{ post.name }}
              </label>
            </div>
          </div>
        </template>
      </div>

      <p v-if="error" class="error-text" style="margin-top:10px">{{ error }}</p>
      <div class="modal-foot">
        <button class="btn" type="button" @click="$emit('close')">取消</button>
        <button class="btn primary" type="button" :disabled="submitting" @click="onSubmit">
          {{ submitting ? '正在排期…' : '确认排期' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { createDrill, listPlans, listPosts } from '@/api/drill-service'
import type { DrillPlanRec, DrillPost, EmergencyPlan } from '@/data/drill/types'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'created', drill: DrillPlanRec): void
}>()

const posts = ref<DrillPost[]>([])
const plans = ref<EmergencyPlan[]>([])
const error = ref('')
const submitting = ref(false)

const form = reactive({ planId: 0, startTime: '', endTime: '', location: '', postIds: [] as string[] })

const enabledPlans = computed(() => plans.value.filter((plan) => plan.enabled))
const selectedPlan = computed(() => plans.value.find((plan) => plan.id === form.planId))
const selectablePosts = computed(() => {
  const plan = selectedPlan.value
  if (!plan) return []
  return posts.value.filter((post) => plan.postIds.includes(post.id))
})

function onPlanChange() {
  // 换预案后，参演岗位默认全选该预案岗位（整批下发场景），也可再手工剔除。
  form.postIds = selectedPlan.value ? [...selectedPlan.value.postIds] : []
}

function selectAll() {
  if (selectedPlan.value) form.postIds = [...selectedPlan.value.postIds]
}

function onSubmit() {
  error.value = ''
  submitting.value = true
  const result = createDrill({
    planId: form.planId,
    startTime: form.startTime,
    endTime: form.endTime,
    location: form.location,
    postIds: [...form.postIds],
  })
  submitting.value = false
  if (!result.ok || !result.data) {
    error.value = result.message
    return
  }
  emit('created', result.data)
}

onMounted(() => {
  posts.value = listPosts()
  plans.value = listPlans()
})
</script>
