<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal wide">
      <div class="modal-head">
        <h3>演练评估 · {{ drill?.drillNo }}</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>

      <!-- 前置校验：没通知到的岗位不许进评估 -->
      <div v-if="pendingCount > 0" class="rule-banner" style="margin-top:0">
        <strong>暂不能提交评估：</strong>还有 {{ pendingCount }} 个岗位没有确认，未通知到位的岗位不许直接进评估。请先在通知窗口完成确认。
        <div style="margin-top:6px">
          <span v-for="n in pendingNotifications" :key="n.postId" class="badge red" style="margin-right:6px">{{ n.postName }}</span>
        </div>
      </div>

      <p v-else class="sub-text">参演岗位已全部确认到位，可以提交评估。同一场演练只保留一条结论；缺项会直接转入机坪安全巡查整改清单，两边条数一致。</p>

      <div class="form-grid" :style="pendingCount > 0 ? 'opacity:0.55' : ''">
        <div class="form-field full">
          <label>评估结论</label>
          <div class="radio-row">
            <label v-for="r in results" :key="r">
              <input v-model="form.result" type="radio" :value="r" :disabled="blocked" /> {{ r }}
            </label>
          </div>
        </div>
        <label class="form-field full">
          <span>演练总结</span>
          <textarea v-model="form.summary" :disabled="blocked" placeholder="总体情况、联动是否顺畅、主要问题"></textarea>
        </label>

        <div class="form-field full">
          <label>演练发现缺项（逐条填写，提交后转入机坪安全巡查整改清单）</label>
          <div v-for="(item, index) in form.items" :key="index" class="def-row">
            <textarea v-model="item.content" :disabled="blocked" placeholder="缺项描述，如：警戒区设置超时"></textarea>
            <select v-model="item.severity" :disabled="blocked">
              <option value="一般">一般</option>
              <option value="严重">严重</option>
            </select>
            <button class="btn ghost" type="button" :disabled="blocked" @click="removeItem(index)">删除</button>
          </div>
          <div>
            <button class="btn" type="button" :disabled="blocked" @click="addItem">+ 增加一条缺项</button>
          </div>
        </div>
      </div>

      <p v-if="error" class="error-text" style="margin-top:10px">{{ error }}</p>
      <p v-if="doneMessage" style="color:#166534;margin-top:10px">{{ doneMessage }}</p>

      <div class="modal-foot">
        <button class="btn" type="button" @click="$emit('close')">关闭</button>
        <button v-if="doneMessage" class="btn" type="button" @click="goRect">查看整改清单</button>
        <button v-else class="btn primary" type="button" :disabled="blocked || submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : '提交评估（唯一结论）' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { evaluateDrill, getDrill } from '@/api/drill-service'
import type { DeficiencyInput, DrillPlanRec, EvalResult } from '@/data/drill/types'

const props = defineProps<{ drillId: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'done'): void }>()

const router = useRouter()
const drill = ref<DrillPlanRec | undefined>(getDrill(props.drillId))
const results: EvalResult[] = ['合格', '基本合格', '不合格']

const pendingNotifications = computed(() => (drill.value?.notifications ?? []).filter((n) => n.ack !== '已确认'))
const pendingCount = computed(() => pendingNotifications.value.length)
const blocked = computed(() => pendingCount.value > 0 || drill.value?.status !== '进行中')

const form = reactive<{ result: EvalResult; summary: string; items: DeficiencyInput[] }>({
  result: '合格',
  summary: '',
  items: [{ content: '', severity: '一般' }],
})
const error = ref('')
const doneMessage = ref('')
const submitting = ref(false)

function addItem() {
  form.items.push({ content: '', severity: '一般' })
}
function removeItem(index: number) {
  form.items.splice(index, 1)
}

function onSubmit() {
  error.value = ''
  submitting.value = true
  const result = evaluateDrill(props.drillId, {
    result: form.result,
    summary: form.summary,
    items: form.items,
  })
  submitting.value = false
  if (!result.ok) {
    error.value = result.message
    return
  }
  doneMessage.value = result.message
  drill.value = getDrill(props.drillId)
  emit('done')
}

function goRect() {
  emit('close')
  router.push('/apron')
}
</script>
