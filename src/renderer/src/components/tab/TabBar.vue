<script setup lang="ts">
import { computed } from 'vue'
import { Icon as IconifyIcon } from '@iconify/vue'
import { useTabStore } from '../../store/tab'
import { useI18nHelpers } from '../../composables/use-i18n'
import TabItem from './TabItem.vue'

defineOptions({ name: 'TabBar' })

interface Props {
  group: App.Tab.TabGroupKey
  /** 是否显示「切换分栏」按钮（仅左栏显示） */
  showLayoutToggle?: boolean
}
const props = withDefaults(defineProps<Props>(), { showLayoutToggle: false })

const emit = defineEmits<{
  (e: 'contextmenu', x: number, y: number, group: App.Tab.TabGroupKey, tabId: string): void
}>()

const tabStore = useTabStore()
const { t } = useI18nHelpers()

const groupState = computed(() => tabStore.groups[props.group])

function handleClick(tabId: string): void {
  tabStore.setActive(props.group, tabId)
}

function handleClose(tabId: string): void {
  tabStore.closeTab(props.group, tabId)
}

function handleContextmenu(tabId: string, x: number, y: number): void {
  emit('contextmenu', x, y, props.group, tabId)
}

function toggleLayout(): void {
  if (tabStore.layout === 'single') {
    tabStore.setSplitLayout(true)
  } else {
    tabStore.setSplitLayout(false)
  }
}
</script>

<template>
  <div class="tab-bar">
    <div class="tab-strip">
      <TabItem
        v-for="tab in groupState.tabs"
        :key="tab.id"
        :tab="tab"
        :active="tab.id === groupState.activeTabId"
        @click="handleClick(tab.id)"
        @close="handleClose(tab.id)"
        @contextmenu="(x: number, y: number) => handleContextmenu(tab.id, x, y)"
      />
    </div>
    <div v-if="showLayoutToggle" class="tab-tools">
      <button
        type="button"
        class="tool-btn"
        :title="tabStore.layout === 'single' ? t('page.tabs.splitLayout') : t('page.tabs.singleLayout')"
        @click="toggleLayout"
      >
        <IconifyIcon :icon="tabStore.layout === 'single' ? 'carbon:columns' : 'carbon:column'" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--layout-border);
  background: var(--layout-header-bg);
  min-height: 34px;
  flex-shrink: 0;
}
.tab-strip {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  scrollbar-width: thin;
}
.tab-strip::-webkit-scrollbar {
  height: 4px;
}
.tab-strip::-webkit-scrollbar-thumb {
  background: var(--layout-border);
  border-radius: 2px;
}
.tab-tools {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.tool-btn {
  padding: 4px 8px;
  border: 1px solid var(--layout-border);
  background: transparent;
  color: var(--layout-text);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
}
.tool-btn:hover {
  background: var(--layout-content-bg);
}
</style>
