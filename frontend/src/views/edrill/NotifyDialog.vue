<template>
  <div class="modal-mask" @click.self="$emit('close')">
    <div class="modal wide">
      <div class="modal-head">
        <h3>通知与确认 · {{ drill?.drillNo }}</h3>
        <button class="btn ghost" type="button" @click="$emit('close')">关闭</button>
      </div>

      <p class="sub-text">
        一次整批下发所有参演岗位，系统逐条给出每个岗位的确认结果；没确认的几条留在待通知队列，其余照常往下推进。
      </p>

      <div style="display:flex; gap:12px; margin:10px 0; align-items:center; flex-wrap:wrap">
        <span class="legend-item">参演岗位 <b>{{ notifications.length }}</b></span>
        <span class="badge green">已确认 {{ confirmedCount }}</span>
        <span :class="['badge', pendingCount ? 'red' : 'gray']">待通知 {{ pendingCount }}</span>
      </div>

      <table class="data-table">
        <thead>
          <tr><th style="width:60px">序</th><th>参演岗位</th><th>通知回执</th><th>下发轮次</th><th>最近下发</th><th>确认时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="(n, i) in notifications" :key="n.postId">
            <td>{{ i + 1 }}</td>
            <td>{{ n.postName }}</td>
            <td>
              <span :class="['badge', n.ack === '已确认' ? 'green' : 'red']">{{ n.ack }}</span>
            </td>
            <td>{{ n.attempts || '—' }}</td>
            <td>{{ fmt(n.lastNotifiedAt) }}</td>
            <td>{{ fmt(n.confirmedAt) }}</td>
            <td>
              <button v-if="n.ack !== '已确认'" class="link" type="button" @click="onConfirmOne(n.postId)">
                登记确认
              </button>
              <span v-else class="sub-text">已到位</span>
            </td>
          </tr>
          <tr v-if="!notifications.length">
            <td colspan="7" class="empty-state">尚未下发通知，点击下方按钮整批下发</td>
          </tr>
        </tbody>
      </table>

      <p v-if="message" :style="messageOk ? 'color:#166534;margin-top:10px' : 'color:#b42318;margin-top:10px'">{{ message }}</p>

      <div class="modal-foot">
        <button class="btn" type="button" @click="$emit('close')">关闭</button>
        <!-- 待排期：首次整批下发 -->
        <button v-if="drill?.status === '待排期'" class="btn primary" type="button" @click="onDispatch">
          整批下发通知
        </button>
        <!-- 已通知 / 进行中：只催待通知的几条；也可一次性补录全部确认 -->
        <template v-if="drill && drill.status !== '待排期' && drill.status !== '已评估'">
          <button class="btn" type="button" :disabled="pendingCount === 0" @click="onConfirmAll">
            一键补录全部确认
          </button>
          <button class="btn primary" type="button" :disabled="pendingCount === 0" @click="onReNotify">
            再次通知待通知岗位（{{ pendingCount }}）
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  confirmAllPending,
  dispatchNotifications,
  getDrill,
  reNotifyUnconfirmed,
  setPostConfirmed,
} from '@/api/drill-service'
import type { DrillPlanRec } from '@/data/drill/types'

const props = defineProps<{ drillId: number }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'changed'): void }>()

function freshDrill(): DrillPlanRec | undefined {
  return getDrill(props.drillId)
}

// 每次动作后从服务层重新读，保证回执、轮次与状态是同一份。
const drill = ref<DrillPlanRec | undefined>(freshDrill())
const message = ref('')
const messageOk = ref(true)

const notifications = computed(() => drill.value?.notifications ?? [])
const confirmedCount = computed(() => notifications.value.filter((n) => n.ack === '已确认').length)
const pendingCount = computed(() => notifications.value.filter((n) => n.ack !== '已确认').length)

function fmt(value: string): string {
  return value ? value.replace('T', ' ') : '—'
}

function refresh() {
  drill.value = freshDrill()
  emit('changed')
}

function run(op: () => { ok: boolean; message: string }) {
  const result = op()
  messageOk.value = result.ok
  message.value = result.message
  refresh()
}

function onDispatch() {
  run(() => dispatchNotifications(props.drillId))
}
function onReNotify() {
  run(() => reNotifyUnconfirmed(props.drillId))
}
function onConfirmOne(postId: string) {
  run(() => setPostConfirmed(props.drillId, postId))
}
function onConfirmAll() {
  run(() => confirmAllPending(props.drillId))
}
</script>
