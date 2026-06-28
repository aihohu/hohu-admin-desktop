import type { RouteRecordRaw } from 'vue-router'

/**
 * 静态常量路由：登录后/未登录都能访问。
 * 扁平结构（不嵌套 blank-layout）—— 登录页和错误页本身不需要导航布局。
 *
 * ⚠️ '/' 必须显式定义且放在 pathMatch 前，否则初始导航会被 pathMatch
 * 抢先匹配，直接重定向到 /404，守卫都没机会执行。
 */
export const constantRoutes: RouteRecordRaw[] = [
  // 根路径：交给守卫处理（守卫会按 token 状态跳 /login 或 home）
  {
    path: '/',
    name: 'root',
    redirect: () => {
      // 动态重定向：守卫介入前的占位，实际跳转由守卫完成
      return { path: '/login' }
    }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/login/index.vue'),
    meta: { constant: true, title: '登录' }
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('../views/_builtin/403/index.vue'),
    meta: { constant: true, title: '无权限' }
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('../views/_builtin/404/index.vue'),
    meta: { constant: true, title: '页面不存在' }
  },
  {
    path: '/500',
    name: 'server-error',
    component: () => import('../views/_builtin/500/index.vue'),
    meta: { constant: true, title: '服务器错误' }
  },
  // 兜底：未匹配路径跳 404（必须放在最后）
  { path: '/:pathMatch(.*)*', redirect: '/404' }
]
