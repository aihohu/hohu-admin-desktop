<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingsStore } from '../../../store/settings'
import { useI18nHelpers } from '../../../composables/use-i18n'

defineOptions({ name: 'SectionAbout' })

const settingsStore = useSettingsStore()
const message = useMessage()
const { t } = useI18nHelpers()

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  try {
    const status = await window.api.updater.getStatus()
    settingsStore.setUpdaterStatus(status)
    unsubscribe = await window.api.updater.onEvent(e => {
      settingsStore.applyUpdaterEvent(e)
    })
  } catch (e) {
    console.warn('[settings/about] init failed', e)
  }
})
onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})

const status = computed(() => settingsStore.updaterStatus)
const showProgress = computed(() => status.value.state === 'downloading')
const showInstall = computed(() => status.value.state === 'downloaded')
const showSkip = computed(
  () =>
    status.value.state === 'available' &&
    !!status.value.version &&
    status.value.version !== settingsStore.updaterSkipVersion
)
const checkDisabled = computed(() => ['checking', 'available', 'downloading'].includes(status.value.state))
const checkText = computed(() => {
  switch (status.value.state) {
    case 'checking':
      return t('settings.about.checking')
    case 'downloading':
      return t('settings.about.downloading')
    default:
      return t('settings.about.checkUpdate')
  }
})

const subtitle = computed(() => {
  if (status.value.state === 'not-available') return t('settings.about.notAvailable')
  if (status.value.state === 'skipped' && status.value.version) {
    return t('settings.about.skipped', { version: status.value.version })
  }
  if (status.value.state === 'error') {
    return t('settings.about.errorMessage', { message: status.value.message ?? '' })
  }
  return ''
})

async function handleCheck(): Promise<void> {
  try {
    await settingsStore.checkForUpdates()
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleSkip(): Promise<void> {
  try {
    await settingsStore.skipCurrentVersion()
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleInstall(): Promise<void> {
  try {
    await settingsStore.installUpdate()
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleAutoDownload(v: boolean): Promise<void> {
  try {
    await settingsStore.setUpdaterAutoDownload(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
</script>

<template>
  <section class="settings-section">
    <NDivider title-placement="left" class="section-title">
      {{ t('settings.about.title') }}
    </NDivider>

    <div class="row">
      <span>{{ t('settings.about.version') }}</span>
      <code>v{{ settingsStore.appVersion }}</code>
    </div>

    <div class="row">
      <span>{{ t('settings.about.autoDownload') }}</span>
      <NSwitch :value="settingsStore.updaterAutoDownload" @update:value="handleAutoDownload" />
    </div>

    <div class="updater-actions">
      <NButton
        v-if="!showInstall"
        type="primary"
        size="small"
        :loading="status.state === 'checking'"
        :disabled="checkDisabled"
        @click="handleCheck"
      >
        {{ checkText }}
      </NButton>
      <NButton v-if="showInstall" type="primary" size="small" @click="handleInstall">
        {{ t('settings.about.downloadAndRestart') }}
      </NButton>
      <NButton v-if="showSkip" size="small" @click="handleSkip">
        {{ t('settings.about.skipVersion') }}
      </NButton>
    </div>

    <NProgress v-if="showProgress" :percentage="status.progress ?? 0" :height="6" :show-indicator="false" />

    <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  margin-top: 0;
  font-weight: 500;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.updater-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.subtitle {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
}
</style>
