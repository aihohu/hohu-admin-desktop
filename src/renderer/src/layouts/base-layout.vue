<script setup lang="ts">
import { computed, h, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, useThemeVars, type MenuOption } from 'naive-ui'
import { Icon as IconifyIcon } from '@iconify/vue'
import { useAuthStore } from '../store/auth'
import { useRouteStore } from '../store/route'
import { useAppStore } from '../store/app'
import { useI18nHelpers } from '../composables/use-i18n'
import type { MenuItem } from '../store/route'
import LangSwitch from './modules/lang-switch.vue'
import Breadcrumb from './modules/breadcrumb.vue'
import ThemeDrawer from './modules/theme-drawer.vue'

defineOptions({ name: 'BaseLayout' })

const router = useRouter()
const authStore = useAuthStore()
const routeStore = useRouteStore()
const appStore = useAppStore()
const message = useMessage()
const themeVars = useThemeVars()
const { t } = useI18nHelpers()

const showThemeDrawer = ref(false)

// 把 NaiveUI 的主题变量桥接到 CSS 变量，让原生 HTML 元素也能跟随暗黑模式
const cssVars = computed(() => ({
  '--layout-sider-bg': themeVars.value.cardColor,
  '--layout-header-bg': themeVars.value.cardColor,
  '--layout-content-bg': themeVars.value.bodyColor,
  '--layout-border': themeVars.value.dividerColor,
  '--layout-text': themeVars.value.textColor1,
  '--layout-text-2': themeVars.value.textColor3
}))

function renderIcon(icon?: string): (() => ReturnType<typeof h>) | undefined {
  if (!icon) return undefined
  return () => h(IconifyIcon, { icon, style: 'font-size: 20px;' })
}

const menuOptions = computed<MenuOption[]>(() =>
  routeStore.menus.map(m => ({
    key: m.key,
    label: m.label,
    disabled: m.disabled,
    icon: renderIcon(m.icon),
    children: m.children?.map(c => ({
      key: c.key,
      label: c.label,
      disabled: c.disabled,
      icon: renderIcon(c.icon)
    }))
  }))
)

function findMenuItem(items: MenuItem[], key: string): MenuItem | undefined {
  for (const item of items) {
    if (item.key === key) return item
    if (item.children) {
      const found = findMenuItem(item.children, key)
      if (found) return found
    }
  }
  return undefined
}

function handleMenuSelect(key: string): void {
  const target = findMenuItem(routeStore.menus, key)
  if (!target) return
  if (target.href) {
    void window.api.shell.openExternal(target.href)
    return
  }
  if (!target.routePath) return
  router.push(target.routePath)
}

async function handleLogout(): Promise<void> {
  await authStore.logout()
  message.success(t('common.logout'))
  router.push('/login')
}
</script>

<template>
  <div class="layout-root" :style="cssVars">
    <!-- Sider：原生 CSS 控制宽度，不用 NLayoutSider 避免双重 collapse 冲突 -->
    <aside class="layout-sider" :class="{ collapsed: appStore.siderCollapse }">
      <div class="logo" :class="{ collapsed: appStore.siderCollapse }">
        <IconifyIcon icon="carbon:application-web" class="logo-icon" />
        <span v-if="!appStore.siderCollapse" class="logo-text">HoHu Admin</span>
      </div>
      <NScrollbar class="menu-scroll">
        <NMenu
          :options="menuOptions"
          :collapsed="appStore.siderCollapse"
          :collapsed-width="64"
          :collapsed-icon-size="20"
          :indent="18"
          @update:value="handleMenuSelect"
        />
      </NScrollbar>
    </aside>

    <!-- Main -->
    <div class="layout-main" :class="{ 'sider-collapsed': appStore.siderCollapse }">
      <header class="layout-header">
        <div class="header-left">
          <NButton quaternary circle @click="appStore.toggleSiderCollapse()">
            <template #icon>
              <IconifyIcon :icon="appStore.siderCollapse ? 'carbon:side-panel-close' : 'carbon:side-panel-open'" />
            </template>
          </NButton>
          <Breadcrumb />
        </div>
        <div class="header-right">
          <NButton quaternary size="small" @click="showThemeDrawer = true">
            <template #icon>
              <IconifyIcon icon="carbon:settings-adjust" />
            </template>
          </NButton>
          <LangSwitch />
          <NDropdown :options="[{ label: t('common.logout'), key: 'logout' }]" trigger="click" @select="handleLogout">
            <div class="user-info">
              <NAvatar v-if="authStore.userAvatar" :src="authStore.userAvatar" round :size="28" />
              <NAvatar v-else round :size="28">{{ authStore.userName.slice(0, 1).toUpperCase() }}</NAvatar>
              <span class="user-name">{{ authStore.userName || t('common.login') }}</span>
            </div>
          </NDropdown>
        </div>
      </header>

      <main class="layout-content">
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="routeStore.cacheRoutes">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>

    <ThemeDrawer v-model:show="showThemeDrawer" />
  </div>
</template>

<style scoped>
.layout-root {
  display: flex;
  height: 100vh;
  overflow: hidden;
  color: var(--layout-text);
}

/* ---- Sider ---- */
.layout-sider {
  flex-shrink: 0;
  width: 220px;
  display: flex;
  flex-direction: column;
  background-color: var(--layout-sider-bg);
  border-right: 1px solid var(--layout-border);
  transition: width 0.25s ease;
  overflow: hidden;
}

.layout-sider.collapsed {
  width: 64px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
  padding: 0 16px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid var(--layout-border);
  flex-shrink: 0;
  overflow: hidden;
}

.logo.collapsed {
  justify-content: center;
  padding: 0;
}

.logo-icon {
  flex-shrink: 0;
  font-size: 20px;
  color: #18a058;
}

.logo-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-scroll {
  flex: 1;
  overflow: hidden;
}

/* ---- Main ---- */
.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--layout-content-bg);
}

.layout-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 50px;
  background-color: var(--layout-header-bg);
  border-bottom: 1px solid var(--layout-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.user-name {
  font-size: 13px;
}

.layout-content {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}
</style>
