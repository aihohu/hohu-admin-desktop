<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, shallowRef, watch, type Component } from 'vue'
import { useTabStore } from '../../store/tab'
import { views } from '../../router/components'

defineOptions({ name: 'TabPane' })

interface Props {
  group: App.Tab.TabGroupKey
}
const props = defineProps<Props>()

const tabStore = useTabStore()
const activeTab = computed(() => (props.group === 'left' ? tabStore.activeLeftTab : tabStore.activeRightTab))

/**
 * ⚠️ KeepAlive + defineAsyncComponent 坑：
 *   - 在 watch 回调里反复 defineAsyncComponent(...) 包裹 loader → 每次 tab 切换都
 *     创建新的 wrapper → KeepAlive 的 activate/deactivate context 失效，报
 *     `parentComponent.ctx.deactivate is not a function`。
 *   - 直接把 Promise-returning loader 传给 `<component :is>` → Vue 不会自动 resolve，
 *     页面渲染成 `[object Promise]`。
 *
 * 正确做法：模块加载时把每个 view loader 用 defineAsyncComponent 包一次，缓存到
 * componentCache。tab 切换时 watch 只是从缓存里取已 wrap 好的 Component 引用，
 * KeepAlive 看到稳定的引用，缓存正常工作。
 */
const componentCache: Record<string, Component> = {}
for (const [key, loader] of Object.entries(views)) {
  componentCache[key] = markRaw(defineAsyncComponent(loader))
}
const NotFound = markRaw(defineAsyncComponent(() => import('../../views/_builtin/404/index.vue')))

const comp = shallowRef<Component>()
watch(
  activeTab,
  tab => {
    if (!tab) {
      comp.value = undefined
      return
    }
    comp.value = componentCache[tab.routeName] ?? NotFound
  },
  { immediate: true }
)
</script>

<template>
  <div class="tab-pane">
    <template v-if="comp && activeTab">
      <KeepAlive>
        <component :is="comp" :key="activeTab.id" />
      </KeepAlive>
    </template>
    <div v-else class="empty-pane">（无活动 tab）</div>
  </div>
</template>

<style scoped>
.tab-pane {
  flex: 1;
  overflow: auto;
  padding: 16px;
  background: var(--layout-content-bg);
  min-width: 0;
}
.empty-pane {
  color: var(--layout-text-2);
  text-align: center;
  padding: 40px;
  font-size: 13px;
}
</style>
