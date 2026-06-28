<script setup lang="ts">
import { computed, watch, watchEffect } from 'vue'
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  darkTheme,
  type GlobalThemeOverrides
} from 'naive-ui'
import { useThemeStore } from './store/theme'
import { i18n } from './locales'
import { useAppStore } from './store/app'
import { useRouteStore } from './store/route'

const themeStore = useThemeStore()
const appStore = useAppStore()

// 同步 i18n.locale 到 app store（首次启动）
watchEffect(() => {
  i18n.global.locale.value = appStore.locale
})

// 语言切换时重新生成菜单（menus 的 label 是 translate 一次性翻译的，非响应式）
watch(
  () => appStore.locale,
  () => {
    const routeStore = useRouteStore()
    routeStore.regenerateMenus()
  }
)

// NConfigProvider 接收的 theme：darkMode ? darkTheme : null（亮色）
const theme = computed(() => (themeStore.darkMode ? darkTheme : null))

// 主色 overrides
const themeOverrides = computed<GlobalThemeOverrides>(() => ({
  common: {
    primaryColor: themeStore.primaryColorHex,
    primaryColorHover: themeStore.primaryColorHex,
    primaryColorPressed: themeStore.primaryColorHex,
    primaryColorSuppl: themeStore.primaryColorHex
  }
}))

// 同步 html.dark class（自定义 CSS 适配用）
watchEffect(() => {
  document.documentElement.classList.toggle('dark', themeStore.darkMode)
})
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <RouterView />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
