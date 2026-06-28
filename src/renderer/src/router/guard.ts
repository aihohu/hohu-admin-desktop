import type { Router } from 'vue-router'
import { useAuthStore } from '../store/auth'
import { useRouteStore } from '../store/route'
import { getTokens } from '../service/token'

/**
 * 路由守卫：token 检查 + 动态路由初始化 + 首页重定向 + static 模式角色过滤。
 *
 * 顺序很重要：
 *   1. 无 token：常量路由放行，其余跳 /login?redirect=...
 *   2. 已登录但动态路由未初始化：先初始化，再用 to.fullPath 重新触发导航
 *   3. 已登录访问 /login：跳首页（此时 home 一定已初始化）
 *   4. static 模式 meta.roles 检查（dynamic 模式后端已过滤，跳过）
 *   5. 放行
 */
export function setupRouteGuard(router: Router): void {
  router.beforeEach(async to => {
    const authStore = useAuthStore()
    const routeStore = useRouteStore()
    const tokens = await getTokens()

    // 1. 无 token
    if (!tokens) {
      if (to.meta.constant) return true
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 2. 已登录但未初始化动态路由 → 先初始化（同时恢复用户信息）
    if (!routeStore.isInitAuthRoute) {
      try {
        // 恢复用户信息（刷新后 Pinia 状态丢失，需要重新拉 getUserInfo）
        if (!authStore.isLogin) {
          await authStore.getUserInfo()
        }
        await routeStore.initAuthRoutes()
      } catch {
        // 初始化失败（如 401）已在 store 内部触发 logout，这里跳登录
        return { path: '/login' }
      }
      // 用 fullPath 重新触发导航，让新注册的路由生效
      return to.fullPath
    }

    // 3. 已登录访问 /login → 跳首页（此时 home 一定已初始化）
    if (to.path === '/login') {
      return { name: routeStore.home || 'home' }
    }

    // 4. static 模式的 meta.roles 检查（dynamic 模式后端已过滤，跳过）
    const requiredRoles = to.meta.roles as string[] | undefined
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = authStore.roles
      const ok = userRoles.some(r => requiredRoles.includes(r)) || userRoles.includes('R_ADMIN')
      if (!ok) return { name: 'forbidden' }
    }

    // 5. 放行
    return true
  })
}
