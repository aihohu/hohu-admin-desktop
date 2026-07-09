<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingsStore } from '../../../store/settings'
import { useI18nHelpers } from '../../../composables/use-i18n'
import { eventToAccelerator, formatAccelerator } from '@shared/accelerator'

defineOptions({ name: 'SectionShortcuts' })

const settingsStore = useSettingsStore()
const message = useMessage()
const { t } = useI18nHelpers()

/** 当前正在录制的 action；null = 非录制态 */
const recordingAction = ref<string | null>(null)
/** 录制态临时显示的 acc（用户按下但未确认） */
const pendingAcc = ref<string>('')
/** 录制态冲突标记 */
const conflict = ref(false)

const recordingInput = ref<HTMLInputElement | null>(null)
const suppressBlur = ref(false)

function startRecording(action: string): void {
  recordingAction.value = action
  pendingAcc.value = ''
  conflict.value = false
  void nextTick(() => recordingInput.value?.focus())
}

function cancelRecording(): void {
  recordingAction.value = null
  pendingAcc.value = ''
  conflict.value = false
}

function onInputBlur(): void {
  if (suppressBlur.value) {
    suppressBlur.value = false
    return
  }
  cancelRecording()
}

async function commitRecording(): Promise<void> {
  if (!recordingAction.value || !pendingAcc.value) {
    cancelRecording()
    return
  }
  const action = recordingAction.value
  const acc = pendingAcc.value
  const ok = await settingsStore.updateShortcut(action, acc)
  if (ok) {
    recordingAction.value = null
    pendingAcc.value = ''
    conflict.value = false
  } else {
    // 清空 pendingAcc 让「冲突，请重按」placeholder 显示；保留录制态等用户重按
    pendingAcc.value = ''
    conflict.value = true
    message.warning(t('settings.shortcuts.conflictMessage'))
    // 阻止 warning 触发的 blur 取消录制；下一帧重新 focus
    suppressBlur.value = true
    void nextTick(() => recordingInput.value?.focus())
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (!recordingAction.value) return
  // Esc 取消、Enter 确认
  if (e.code === 'Escape') {
    e.preventDefault()
    cancelRecording()
    return
  }
  if (e.code === 'Enter') {
    e.preventDefault()
    void commitRecording()
    return
  }
  e.preventDefault()
  const acc = eventToAccelerator(e)
  if (acc) {
    pendingAcc.value = acc
    conflict.value = false
  }
  // acc 为 null（仅 modifier）时保持现状，等用户继续按
}

function displayAcc(action: string): string {
  const acc = settingsStore.shortcuts[action]
  if (!acc) return ''
  return formatAccelerator(acc, settingsStore.platform)
}
</script>

<template>
  <div>
    <NDivider>{{ t('settings.shortcuts.title') }}</NDivider>
    <div class="rows">
      <div class="shortcut-row">
        <span class="label">{{ t('settings.shortcuts.toggleWindow') }}</span>
        <input
          v-if="recordingAction === 'toggleWindow'"
          ref="recordingInput"
          class="acc-input"
          :class="{ conflict }"
          :value="pendingAcc ? formatAccelerator(pendingAcc, settingsStore.platform) : ''"
          :placeholder="conflict ? t('settings.shortcuts.conflict') : t('settings.shortcuts.recording')"
          readonly
          @keydown="onKeydown"
          @blur="onInputBlur"
        />
        <button v-else type="button" class="acc-display" @click="startRecording('toggleWindow')">
          {{ displayAcc('toggleWindow') || '—' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.label {
  flex-shrink: 0;
}
.acc-input,
.acc-display {
  min-width: 120px;
  padding: 4px 10px;
  border: 1px solid var(--n-border-color, #ddd);
  border-radius: 4px;
  background: var(--n-color, transparent);
  color: inherit;
  font-family: monospace;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}
.acc-input:focus {
  outline: none;
  border-color: var(--n-primary-color, #18a058);
}
.acc-input.conflict {
  border-color: #f53f3f;
  color: #f53f3f;
}
.acc-display:hover {
  background: var(--n-color-hover, rgba(0, 0, 0, 0.04));
}
</style>
