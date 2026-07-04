/**
 * static 模式专用：前端写死的完整路由树。
 * 仅 RENDERER_VITE_ROUTE_MODE=static 时使用（见 store/route.ts#initAuthRoutes）。
 *
 * 适用：fork 出去做独立桌面应用、无后端的离线场景、demo 模板。
 * 切换方式：在 .env / .env.development / .env.production 设置
 *   RENDERER_VITE_ROUTE_MODE=static
 *
 * ════════════════════════════════════════════════════════════════════════
 * component 字符串约定（3 种描述符，见 router/transform.ts）
 * ════════════════════════════════════════════════════════════════════════
 *
 * 1. 单级路由：'layout.base$view.home'
 *    layout + view 合并成一个菜单项，最常用。
 *    等号左边 'layout.base' → 加载 layouts/base-layout.vue
 *    等号右边 'view.home'  → 懒加载 views/home/index.vue
 *
 * 2. 布局容器：'layout.base'（不带 $）
 *    多级菜单的父节点，渲染为可展开的分组，本身不点击。
 *    必须带 children。如果 children=null 或 [] → 渲染为「空目录」disabled 项。
 *
 * 3. 视图组件：'view.system_user'（仅作为 children 出现）
 *    纯视图，不挂自己的 layout，复用父级的 layout.base。
 *
 * view key 推导规则（见 router/components.ts#pathToViewKey）：
 *   views/home/index.vue             → 'home'
 *   views/system/user/index.vue      → 'system_user'
 *   views/system/dict/data/index.vue → 'system_dict_data'
 *   views/_builtin/404/index.vue     → '_builtin_404'
 * 规则：去掉 'views/' 前缀和 '/index.vue' 后缀，剩下目录层级 '/' 全替换成 '_'。
 * 连字符（如 'job-log'）原样保留，与后端 route_name 对齐。
 *
 * ════════════════════════════════════════════════════════════════════════
 * meta 字段
 * ════════════════════════════════════════════════════════════════════════
 *
 *   title        string          菜单/标签页标题（必填）
 *   i18nKey      string          可选，命中则优先走 i18n（key 形如 'route.system_user'）
 *                                未命中或未设置时回退到 title
 *   icon         string          iconify 图标名（如 'carbon:home'），按需懒加载
 *   order        number          同级排序，小的靠前；不填按数组顺序
 *   hideInMenu   boolean         true → 不显示在侧边栏（如详情页、403/404）
 *   keepAlive    boolean         true → 组件被缓存（cacheRoutes 收集 route.name）
 *                                ⚠️ 组件内必须 defineOptions({ name }) 对齐 route.name
 *   roles        string[]        可见/可访问所需角色，命中其一即可（OR 关系）
 *                                'R_ADMIN' 总是通过；空数组或不填 → 所有人可见
 *   href         string          外链 URL，设置后 routePath 留空，菜单项点击调
 *                                shell.openExternal 打开外部浏览器
 *
 * ════════════════════════════════════════════════════════════════════════
 * RBAC 行为（static 模式下）
 * ════════════════════════════════════════════════════════════════════════
 *
 * - 菜单可见性：依赖 userInfo.roles（仍来自后端 /auth/getUserInfo）。
 *   如果你连用户角色也想写死，需要改 store/auth.ts，目前不内置（YAGNI）。
 * - 按钮级权限：v-permission / hasAuth() / TableHeaderOperation 仍工作，
 *   依赖 userInfo.buttons（同样来自后端）。
 * - 不请求后端菜单：fetchGetUserRoutes 不会被调用，断网/无后端也能跑。
 *
 * ════════════════════════════════════════════════════════════════════════
 * 添加新页面示例
 * ════════════════════════════════════════════════════════════════════════
 *
 * 1. 创建文件：src/renderer/src/views/myapp/dashboard/index.vue
 *    （必须叫 index.vue，glob 才扫得到）
 *    在该文件里：defineOptions({ name: 'myapp_dashboard' })
 *
 * 2. 在本文件的 staticRoutes 数组里加：
 *    {
 *      name: 'myapp_dashboard',          // 唯一，建议与文件推导 key 对齐
 *      path: '/myapp/dashboard',
 *      component: 'view.myapp_dashboard', // 自动匹配 views/myapp/dashboard/index.vue
 *      meta: { title: '仪表盘', icon: 'carbon:dashboard' }
 *    }
 *
 * 3. 父级菜单下挂：component 用 'layout.base'，children 放上面的 view 项。
 *
 * 类型 Api.Route.UserRoute / Api.Route.RouteMeta 是全局 declare namespace
 * （见 typings/api/route.d.ts），不需要 import。
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

/** static 模式下的首页路由 name（登录后跳转目标） */
export const staticHome = 'home'
