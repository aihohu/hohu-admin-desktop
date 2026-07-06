import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import { constantRoutes } from './routes'
import { setupRouteGuard } from './guard'

/**
 * Electron 渲染进程从 file:// 或 http://localhost:5173 加载，
 * URL 不应被 vue-router 管理（用户看不到 URL bar），用内存 history 最稳。
 */
export const router: Router = createRouter({
  history: createMemoryHistory(),
  routes: constantRoutes
})

setupRouteGuard(router)

// tab 同步：外部导航（菜单点击、前进后退）→ 加/激活左栏 tab。
// 注意：tabStore.addTabFromNavigation 内部读 store 时若 Pinia 未就绪会抛错，
// 用动态 import 避免循环依赖。
router.afterEach(to => {
  void import('../store/tab').then(({ useTabStore }) => {
    useTabStore().addTabFromNavigation(to)
  })
})
