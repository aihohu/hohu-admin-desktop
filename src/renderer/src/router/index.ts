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
