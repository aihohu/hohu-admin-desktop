/**
 * static 模式专用：前端写死的完整路由树。
 * 仅 RENDERER_VITE_ROUTE_MODE=static 时使用。
 *
 * 适用：fork 出去做独立桌面应用、无后端的离线场景、demo 模板。
 *
 * - meta.roles：声明所需角色；用户角色命中其一即可访问；R_ADMIN 总是通过
 * - 其他字段（hideInMenu / order / icon / keepAlive 等）与 dynamic 模式语义一致
 * - 类型 Api.Route.UserRoute 是全局 declare namespace（见 typings/api/route.d.ts），不需要 import
 */
export const staticRoutes: Api.Route.UserRoute[] = [
  {
    name: 'home',
    path: '/home',
    component: 'layout.base$view.home',
    meta: { title: '首页', icon: 'carbon:home', order: 0 }
  },
  {
    name: 'system',
    path: '/system',
    component: 'layout.base',
    meta: { title: '系统管理', icon: 'carbon:cloud-app', order: 1 },
    children: [
      {
        name: 'system_user',
        path: '/system/user',
        component: 'view.system_user',
        meta: { title: '用户管理', icon: 'ic:round-manage-accounts', roles: ['R_ADMIN'] }
      }
    ]
  }
]

export const staticHome = 'home'
