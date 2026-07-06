<script setup lang="ts">
import { computed } from 'vue'
import { useThemeVars } from 'naive-ui'
import { Icon as IconifyIcon } from '@iconify/vue'
import { useI18nHelpers } from '../../composables/use-i18n'

defineOptions({ name: 'TabItem' })

interface Props {
  tab: App.Tab.Tab
  active: boolean
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'close'): void
  (e: 'contextmenu', x: number, y: number): void
}>()

const { t } = useI18nHelpers()
const themeVars = useThemeVars()

/**
 * 主题色 active 样式。NaiveUI 的 primaryColor 在 CSS 变量层不可靠（scoped 上下文），
 * 通过 useThemeVars() 拿到后注入 inline style，确保跟随主题切换。
 */
const activeStyle = computed(() => {
  if (!props.active) return undefined
  const primary = themeVars.value.primaryColor
  return {
    backgroundColor: `${primary}1f`, // ~12% alpha (hex '1f' = 31/255)
    borderColor: primary,
    color: primary
  }
})

const label = computed(() => {
  if (props.tab.i18nKey) {
    const translated = t(props.tab.i18nKey)
    if (translated && translated !== props.tab.i18nKey) return translated
  }
  return props.tab.label
})

function onMousedown(e: MouseEvent): void {
  // 中键关闭（pinned/home 不可）；左键才触发 click
  if (e.button === 1) {
    e.preventDefault()
    if (!props.tab.pinned && !props.tab.isHome) emit('close')
    return
  }
  if (e.button === 0) emit('click')
}

function onContextmenu(e: MouseEvent): void {
  e.preventDefault()
  emit('contextmenu', e.clientX, e.clientY)
}

function onCloseClick(e: MouseEvent): void {
  e.stopPropagation()
  emit('close')
}
</script>

<template>
  <div
    class="tab"
    :class="{ active: active, pinned: tab.pinned }"
    :style="activeStyle"
    @mousedown="onMousedown"
    @contextmenu="onContextmenu"
  >
    <IconifyIcon v-if="tab.icon" :icon="tab.icon" class="tab-icon" />
    <span class="tab-label">{{ label }}</span>
    <span v-if="tab.pinned" class="pin-mark" />
    <button v-else type="button" class="tab-close" :aria-label="t('page.tabs.closeCurrent')" @click="onCloseClick">
      ×
    </button>
  </div>
</template>

<style scoped>
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--layout-content-bg);
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  font-size: 12px;
  user-select: none;
  flex-shrink: 0;
}
.tab-icon {
  font-size: 14px;
}
.tab-label {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pin-mark::after {
  content: '📌';
  font-size: 10px;
}
.tab-close {
  margin-left: 4px;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.tab-close:hover {
  opacity: 1;
  background: rgba(245, 63, 63, 0.8);
  color: #fff;
  border-radius: 3px;
}
</style>
