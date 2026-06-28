<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore, type Locale } from '../../store/app'
import { useI18nHelpers } from '../../composables/use-i18n'

defineOptions({ name: 'LangSwitch' })

const appStore = useAppStore()
const { changeLocale } = useI18nHelpers()

// ⚠️ NaiveUI NDropdown 的 option 用 `key` 而不是 `value`；
// @select 触发时传的是 key（string），不是整个 option 对象
const options = computed(() => [
  { label: '简体中文', key: 'zh-cn' },
  { label: 'English', key: 'en-us' }
])

function handleChange(key: string): void {
  changeLocale(key as Locale)
}
</script>

<template>
  <NDropdown :options="options" trigger="click" @select="handleChange">
    <NButton quaternary size="small">
      {{ appStore.locale === 'zh-cn' ? '中' : 'EN' }}
    </NButton>
  </NDropdown>
</template>
