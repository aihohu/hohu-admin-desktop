<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingsStore } from '../../../store/settings'
import { useAppStore, type Locale } from '../../../store/app'
import { useI18nHelpers } from '../../../composables/use-i18n'

defineOptions({ name: 'SectionGeneral' })

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const message = useMessage()
const { t, changeLocale } = useI18nHelpers()

const isLinux = computed(() => settingsStore.platform === 'linux')

async function handleCloseToTray(v: boolean): Promise<void> {
  try {
    await settingsStore.setCloseToTray(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleLaunchAtLogin(v: boolean): Promise<void> {
  try {
    await settingsStore.setLaunchAtLogin(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleNotificationsEnabled(v: boolean): Promise<void> {
  try {
    await settingsStore.setNotificationsEnabled(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
function handleLocale(v: Locale): void {
  changeLocale(v)
}

// closeToTray NRadio 用 string 值，组件内转换
const closeBehavior = computed<'exit' | 'tray'>({
  get: () => (settingsStore.closeToTray ? 'tray' : 'exit'),
  set: v => handleCloseToTray(v === 'tray')
})

const localeOptions = [
  { label: '简体中文', value: 'zh-cn' },
  { label: 'English', value: 'en-us' }
]
</script>

<template>
  <section class="settings-section">
    <NDivider class="section-title">
      {{ t('settings.general.title') }}
    </NDivider>

    <div class="row">
      <span>{{ t('settings.general.launchAtLogin') }}</span>
      <NSwitch :value="settingsStore.launchAtLogin" :disabled="isLinux" @update:value="handleLaunchAtLogin" />
    </div>
    <div v-if="isLinux" class="hint">{{ t('settings.general.launchAtLoginUnsupported') }}</div>

    <div class="row">
      <span>{{ t('settings.general.notificationsEnabled') }}</span>
      <NSwitch :value="settingsStore.notificationsEnabled" @update:value="handleNotificationsEnabled" />
    </div>

    <div class="row">
      <span>{{ t('settings.general.closeBehavior') }}</span>
      <NRadioGroup :value="closeBehavior" @update:value="(v: 'exit' | 'tray') => (closeBehavior = v)">
        <NRadio value="exit">{{ t('settings.general.closeToExit') }}</NRadio>
        <NRadio value="tray">{{ t('settings.general.closeToTray') }}</NRadio>
      </NRadioGroup>
    </div>

    <div class="row">
      <span>{{ t('settings.general.language') }}</span>
      <NSelect
        :value="appStore.locale"
        :options="localeOptions"
        size="small"
        style="max-width: 140px"
        @update:value="(v: Locale) => handleLocale(v)"
      />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
.hint {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
  margin-top: -8px;
}
</style>
