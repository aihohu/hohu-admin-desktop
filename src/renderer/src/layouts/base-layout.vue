<script setup lang="ts">
import { computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, type MenuOption } from 'naive-ui'
import { Icon as IconifyIcon } from '@iconify/vue'
import { useAuthStore } from '../store/auth'
import { useRouteStore } from '../store/route'
import type { MenuItem } from '../store/route'

defineOptions({ name: 'BaseLayout' })

const router = useRouter()
const authStore = useAuthStore()
const routeStore = useRouteStore()
const message = useMessage()

function renderIcon(icon?: string): (() => ReturnType<typeof h>) | undefined {
  if (!icon) return undefined
  return () => h(IconifyIcon, { icon })
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

  // 外链
  if (target.href) {
    void window.api.shell.openExternal(target.href)
    return
  }
  // 空目录或无路径
  if (!target.routePath) return
  router.push(target.routePath)
}

async function handleLogout(): Promise<void> {
  await authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}
</script>

<template>
  <n-layout class="base-layout" has-sider position="absolute">
    <n-layout-sider
      bordered
      :width="220"
      :native-scrollbar="false"
      content-style="display: flex; flex-direction: column; height: 100%;"
    >
      <div class="logo">
        <IconifyIcon icon="carbon:application-web" class="logo-icon" />
        <span class="logo-text">HoHu Admin</span>
      </div>
      <div class="menu-wrap">
        <n-menu :options="menuOptions" @update:value="handleMenuSelect" />
      </div>
    </n-layout-sider>

    <n-layout>
      <n-layout-header bordered class="header">
        <span class="header-title">{{ authStore.userName || '未登录' }}</span>
        <n-button quaternary size="small" @click="handleLogout">退出登录</n-button>
      </n-layout-header>

      <n-layout-content class="content" :native-scrollbar="false">
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="routeStore.cacheRoutes">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style scoped>
.base-layout {
  height: 100vh;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
  padding: 0 16px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid var(--n-border-color);
  flex-shrink: 0;
  overflow: hidden;
}

.logo-icon {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--n-color-target, #18a058);
}

.logo-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-wrap {
  flex: 1;
  overflow-y: auto;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 50px;
}

.header-title {
  font-size: 14px;
}

.content {
  padding: 16px;
}
</style>
