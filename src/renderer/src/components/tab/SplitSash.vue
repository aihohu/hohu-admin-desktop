<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useThemeVars } from 'naive-ui'

defineOptions({ name: 'SplitSash' })

const emit = defineEmits<{
  (e: 'update:ratio', clientX: number): void
  (e: 'reset'): void
}>()

const themeVars = useThemeVars()
const dragging = ref(false)

/** 拖动/悬停时高亮颜色跟随主题 primary color。 */
const highlightStyle = computed(() => ({
  background: dragging.value ? themeVars.value.primaryColor : undefined
}))

function onMouseDown(e: MouseEvent): void {
  e.preventDefault()
  dragging.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging.value) return
  emit('update:ratio', e.clientX)
}

function onMouseUp(): void {
  if (!dragging.value) return
  dragging.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

onMounted(() => {
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
})
onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div
    class="sash"
    :class="{ dragging }"
    :style="highlightStyle"
    @mousedown="onMouseDown"
    @dblclick="emit('reset')"
  ></div>
</template>

<style scoped>
.sash {
  flex-shrink: 0;
  width: 5px;
  cursor: col-resize;
  background: var(--layout-border);
  position: relative;
  transition: background 0.15s;
  z-index: 5;
}
.sash::before {
  /* 加大命中区域：5px 视觉 + 11px 命中 */
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
}
.sash:hover {
  background: var(--n-primary-color, #18a058);
}
/* dragging 时 inline style 覆盖；hover 也走 primary（fallback 防主题未注入） */
</style>
