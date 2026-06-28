<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18nHelpers } from '../../composables/use-i18n'

defineOptions({ name: 'Breadcrumb' })

const route = useRoute()
const { t } = useI18nHelpers()

interface Crumb {
  key: string
  label: string
  path?: string
}

const crumbs = computed<Crumb[]>(() => {
  // route.matched 是从根到当前的 matched route 链
  return route.matched
    .filter(m => m.meta?.title || m.meta?.i18nKey)
    .map(m => {
      const i18nKey = m.meta?.i18nKey as string | undefined
      const fallback = (m.meta?.title as string) || m.name?.toString() || ''
      return {
        key: m.name?.toString() || m.path,
        label: i18nKey ? t(i18nKey, fallback) : fallback,
        path: m.path
      }
    })
})
</script>

<template>
  <NBreadcrumb v-if="crumbs.length > 0">
    <NBreadcrumbItem v-for="c in crumbs" :key="c.key">
      {{ c.label }}
    </NBreadcrumbItem>
  </NBreadcrumb>
</template>
