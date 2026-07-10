<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useSettingsStore } from '../../../store/settings'
import { useI18nHelpers } from '../../../composables/use-i18n'
import SectionGeneral from './SectionGeneral.vue'
import SectionAppearance from './SectionAppearance.vue'
import SectionShortcuts from './SectionShortcuts.vue'
import SectionAbout from './SectionAbout.vue'

defineOptions({ name: 'SettingsDrawer' })

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const settingsStore = useSettingsStore()
const { t } = useI18nHelpers()

const showModel = computed({
  get: () => props.show,
  set: v => emit('update:show', v)
})

/** 抽屉首次打开时触发 loadAll */
watch(
  () => props.show,
  open => {
    if (open && !settingsStore.loaded && !settingsStore.loadError) {
      void settingsStore.loadAll()
    }
  }
)

const reloadKey = ref(0)
async function retryLoad(): Promise<void> {
  reloadKey.value++
  await settingsStore.loadAll()
}
</script>

<template>
  <NDrawer v-model:show="showModel" :width="400" placement="right">
    <NDrawerContent :title="t('settings.title')" closable :native-scrollbar="false">
      <NSpin :show="!settingsStore.loaded && !settingsStore.loadError">
        <div v-if="settingsStore.loadError" class="error-state">
          <p>{{ t('settings.common.loadFailed') }}</p>
          <NButton size="small" @click="retryLoad">Retry</NButton>
        </div>
        <NSpace v-else vertical :size="24">
          <SectionGeneral :key="`g-${reloadKey}`" />
          <SectionAppearance :key="`a-${reloadKey}`" />
          <SectionShortcuts :key="`s-${reloadKey}`" />
          <SectionAbout :key="`b-${reloadKey}`" />
        </NSpace>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
}
</style>
