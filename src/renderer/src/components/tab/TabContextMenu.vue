<script setup lang="ts">
import { computed } from 'vue'
import { NDropdown } from 'naive-ui'
import { useTabStore } from '../../store/tab'
import { useI18nHelpers } from '../../composables/use-i18n'

defineOptions({ name: 'TabContextMenu' })

interface Props {
  visible: boolean
  x: number
  y: number
  group: App.Tab.TabGroupKey
  tabId: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const tabStore = useTabStore()
const { t } = useI18nHelpers()

const visibleModel = computed({
  get: () => props.visible,
  set: v => emit('update:visible', v)
})

const targetTab = computed(() => tabStore.groups[props.group].tabs.find(x => x.id === props.tabId) ?? null)

/** 关闭/移动等 action 是否可用 */
const disabledKeys = computed<Set<string>>(() => {
  const s = new Set<string>()
  if (!targetTab.value) return s
  if (targetTab.value.pinned || targetTab.value.isHome) {
    s.add('closeCurrent')
    s.add('closeLeft')
  }
  if (targetTab.value.isHome) {
    s.add('moveToOtherGroup')
    s.add('openInOtherGroup')
    s.add('pin')
  }
  return s
})

const options = computed(() => {
  type Opt = { key?: string; label: string; disabled?: boolean } | { type: 'divider' }
  const opts: Opt[] = [
    { key: 'closeCurrent', label: t('dropdown.closeCurrent') },
    { key: 'closeOther', label: t('dropdown.closeOther') },
    { key: 'closeLeft', label: t('dropdown.closeLeft') },
    { key: 'closeRight', label: t('dropdown.closeRight') },
    { key: 'closeAll', label: t('dropdown.closeAll') },
    { type: 'divider' },
    targetTab.value?.pinned ? { key: 'unpin', label: t('dropdown.unpin') } : { key: 'pin', label: t('dropdown.pin') },
    { type: 'divider' },
    { key: 'moveToOtherGroup', label: t('dropdown.moveToOtherGroup') },
    { key: 'openInOtherGroup', label: t('dropdown.openInOtherGroup') }
  ]
  return opts.map(o => {
    if ('key' in o && o.key && disabledKeys.value.has(o.key)) {
      return { ...o, disabled: true }
    }
    return o
  })
})

function handleSelect(key: string): void {
  const g = props.group
  const id = props.tabId
  switch (key) {
    case 'closeCurrent':
      tabStore.closeTab(g, id)
      break
    case 'closeOther':
      tabStore.closeOthers(g, id)
      break
    case 'closeLeft':
      tabStore.closeLeft(g, id)
      break
    case 'closeRight':
      tabStore.closeRight(g, id)
      break
    case 'closeAll':
      tabStore.closeAll(g)
      break
    case 'pin':
      tabStore.pinTab(g, id)
      break
    case 'unpin':
      tabStore.unpinTab(g, id)
      break
    case 'moveToOtherGroup':
      tabStore.moveToOtherGroup(g, id, 'move')
      break
    case 'openInOtherGroup':
      tabStore.moveToOtherGroup(g, id, 'copy')
      break
  }
  visibleModel.value = false
}
</script>

<template>
  <NDropdown
    v-model:show="visibleModel"
    placement="bottom-start"
    trigger="manual"
    :x="x"
    :y="y"
    :options="options"
    @select="handleSelect($event as string)"
    @clickoutside="visibleModel = false"
  />
</template>
