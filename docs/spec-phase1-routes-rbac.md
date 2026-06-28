# Phase 1 · 动态路由 + RBAC 设计 Spec

> 目标：让框架「能跳页面」。登录后从后端拉菜单，按权限渲染侧边栏，路由守卫保护受限页面，按钮级权限通过 `v-permission` 控制。

## 1. 范围

### 包含

- 装 `vue-router 5`，用 `createMemoryHistory()`（Electron 无 URL bar）
- 静态路由：`/login`、`/403`、`/404`、`/500`
- **双模式路由**（见 §1.1）：
  - **dynamic**：登录后调 `GET /auth/getUserRoutes` 拉取，按后端返回注册
  - **static**：菜单/路由前端写死，按 `meta.roles` 前端过滤
- 路由守卫：token 检查、动态路由初始化、首页重定向
- 按钮级权限：`v-if="hasPermission(...)"`（首选）+ `v-permission` 指令（补充）
- 简易 BaseLayout（Header + Sider + Content + 顶部用户菜单），Phase 1 第 4 项再完善主题/i18n
- 用户登出 → 清路由 → 跳登录

### 不包含（留到后续 Phase）

- 复杂布局模式（vertical-mix / horizontal 等 6 种） → Phase 1 第 4 项
- 暗黑模式 + ThemeDrawer → Phase 1 第 4 项
- vue-i18n 集成（菜单先用 `meta.title` 原文） → Phase 1 第 4 项
- 多标签页（Tabs） → Phase 2
- 面包屑 → Phase 2
- 全局搜索 → Phase 2

### 1.1 双模式路由

通过 `.env` 的 `RENDERER_VITE_ROUTE_MODE` 切换：

| 值                | 路由来源                            | 权限过滤                   | 适用场景                                     |
| ----------------- | ----------------------------------- | -------------------------- | -------------------------------------------- |
| `dynamic`（默认） | 后端 `getUserRoutes`                | 后端按角色返回有权限的菜单 | hohu-admin 生态内                            |
| `static`          | 前端 `router/static-routes.ts` 写死 | 前端按 `meta.roles` 过滤   | fork 出去做独立桌面应用、离线场景、demo 模板 |

**dynamic 模式**：后端 `UserRoute.meta` 不返回 `roles` 字段，前端不做角色检查（后端已过滤）。如果后端某天返回了 `meta.roles`，前端仍然忽略，避免双重判断。

**static 模式**：前端在 `router/static-routes.ts` 写完整路由树，每条路由可在 `meta.roles` 声明所需角色，路由守卫用 `authStore.roles` 过滤；`hideInMenu` / `order` 等其他字段语义不变。

**切换方式**：env 改一个值，无需改业务代码。route store 根据 mode 走不同分支：

```ts
async initAuthRoutes() {
  const mode = import.meta.env.RENDERER_VITE_ROUTE_MODE ?? 'dynamic'
  if (mode === 'dynamic') {
    const { data, error } = await fetchGetUserRoutes()
    if (error) throw new Error('拉路由失败')
    this.setAuthRoutes(data.routes, { home: data.home })
  } else {
    const { routes, home } = await import('../router/static-routes')
    this.setAuthRoutes(routes, { home })
  }
}
```

**static 模式的 `meta.roles` 检查**（守卫里，RouteMeta 类型已加 `roles?: string[]`）：

```ts
const requiredRoles = to.meta.roles as string[] | undefined
if (requiredRoles && requiredRoles.length > 0) {
  const userRoles = authStore.roles
  const ok = userRoles.some(r => requiredRoles.includes(r)) || userRoles.includes('R_ADMIN')
  if (!ok) return { name: 'forbidden' }
}
```

## 2. 后端契约（来自 hohu-admin）

### 2.1 `GET /auth/getUserRoutes` —— 核心接口

返回当前用户有权访问的路由树 + 首页 key。

```ts
interface UserRoutesResponse {
  home: string // 首页路由 name，如 "home"
  routes: UserRoute[] // 路由树
}

interface UserRoute {
  name: string // 路由 name（唯一），如 "system_user"
  path: string // 路由 path，如 "/system/user"
  component: string // 组件描述符（见 §2.4）
  meta: RouteMeta
  children?: UserRoute[] | null
}

interface RouteMeta {
  title: string
  i18nKey?: string | null // Phase 1 第 4 项接入，本阶段先用 title
  keepAlive?: boolean | null
  constant?: boolean | null
  icon?: string | null
  order?: number
  href?: string | null // 外链
  hideInMenu?: boolean | null
  activeMenu?: string | null
  multiTab?: boolean | null
  roles?: string[] // **仅 static 模式用**：dynamic 模式后端不返回此字段（已按角色过滤）
}
```

### 2.2 `GET /auth/getConstantRoutes`

返回无需登录即可访问的常量路由（登录页、错误页等）。结构同 `UserRoute[]`。

> **决策**：Phase 1 不调这个接口，**常量路由前端写死**（更快、更可控）。等 Phase 2 接 AI 浮窗等场景再考虑接入。

### 2.3 `GET /auth/getUserInfo`

已在 Phase 1 第 1 项实现，返回 `{ userId, userName, userAvatar, roles, buttons }`。其中：

- `roles: string[]` —— 角色码（如 `["R_ADMIN"]`）
- `buttons: string[]` —— 按钮权限码（如 `["sys:user:add", ...]`，超管返回 `["*"]`）

### 2.4 component 字符串约定

后端返回 3 种格式（与 web 端 elegant-router 约定一致）：

| 格式                  | 含义                          | 例子                            |
| --------------------- | ----------------------------- | ------------------------------- |
| `layout.<name>`       | 布局组件（一级容器）          | `layout.base`、`layout.blank`   |
| `view.<name>`         | 视图组件（叶子页面）          | `view.home`、`view.system_user` |
| `layout.<a>$view.<b>` | 单级路由（layout + 视图合并） | `layout.base$view.home`         |

约定：`.` 分隔命名空间，`$` 分隔 layout/view（仅单级路由用）。

### 2.5 真实接口响应样本（实测）

```jsonc
{
  "code": 200,
  "msg": "success",
  "data": {
    "home": "home",
    "routes": [
      // 单级路由：layout.base$view.home
      {
        "name": "home",
        "path": "/home",
        "component": "layout.base$view.home",
        "meta": {
          "title": "首页",
          "i18nKey": "route.home",
          "icon": "carbon:home",
          "order": 0,
          "keepAlive": false,
          "constant": false,
          "hideInMenu": false,
          "href": null,
          "activeMenu": null,
          "multiTab": false
        },
        "children": null
      },

      // 多级路由：layout.base + children
      {
        "name": "ai",
        "path": "/ai",
        "component": "layout.base",
        "meta": { "title": "AI 助手", "i18nKey": "route.ai", "icon": "carbon:chat-bot", "order": 1 },
        "children": [
          {
            "name": "ai_chat",
            "path": "/ai/chat",
            "component": "view.ai_chat",
            "meta": { "title": "AI 对话" },
            "children": null
          },
          {
            "name": "ai_provider",
            "path": "/ai/provider",
            "component": "view.ai_provider",
            "meta": { "title": "模型管理" },
            "children": null
          }
        ]
      },

      // ⚠️ 空目录：layout.base 但 children 为 null
      {
        "name": "auth",
        "path": "/auth",
        "component": "layout.base",
        "meta": { "title": "权限管理", "icon": "carbon:security", "order": 98 },
        "children": null
      },

      // ⚠️ 跨前缀子路由：task 的 children path 是 /system/...
      {
        "name": "task",
        "path": "/task",
        "component": "layout.base",
        "meta": { "title": "任务中心", "icon": "carbon:task", "order": 100 },
        "children": [
          { "name": "system_job", "path": "/system/job", "component": "view.system_job" },
          { "name": "system_job-log", "path": "/system/job-log", "component": "view.system_job-log" }
        ]
      }
    ]
  }
}
```

### 2.6 边界情况（实测发现，必须在 spec 中明确）

| 情况                    | 后端表现                                          | 前端处理                                                                                                     |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **空目录**              | `component: "layout.base"` + `children: null`     | 菜单显示但点击不跳转（或灰显），不注册子路由                                                                 |
| **跨前缀 path**         | `task` 的子路由 path 是 `/system/job`             | 前端不纠正，按后端给的 path 注册（vue-router 不强制父子 path 前缀一致）                                      |
| **route_name 带连字符** | `system_job-log`、`system_operation-log`          | glob 扫描时**保留连字符**，目录名也带连字符（如 `system/job-log/index.vue`）                                 |
| **目录嵌套任意深度**    | `system/dict/data/index.vue` → `system_dict_data` | glob 支持任意深度，`/` 全部替换为 `_`                                                                        |
| **`children: null`**    | 后端返回 null（不是空数组）                       | transform 和菜单生成都要兼容两种                                                                             |
| **home 单级路由**       | `layout.base$view.home`（无 children）            | 单级路由专用 transform 分支处理                                                                              |
| **`_builtin` 目录**     | web 把 403/404/500/profile 放 `views/_builtin/`   | glob 照常扫描（key 为 `_builtin_403` 等），但**只供前端静态路由用**；dynamic 模式后端不会返回这种 route_name |

> **注意**：`_builtin/*` 目录的视图会被 glob 扫到并注册到 `views` 映射表，但只在 §6 的 `constantRoutes` 里被引用。dynamic 模式下后端不会返回 `_builtin_xxx` 这种 route_name，所以动态路由解析不会用到它们。

## 3. 前端架构

### 3.1 新增目录结构

```
src/renderer/src/
├── router/
│   ├── index.ts                  # createRouter + memory history + guard 注册
│   ├── guard.ts                  # beforeEach 守卫（核心逻辑）
│   ├── routes.ts                 # 静态常量路由（login / 403 / 404 / 500）
│   ├── static-routes.ts          # static 模式专用完整路由树
│   ├── components.ts             # glob import 组件映射表（替代 elegant-router）
│   └── transform.ts              # component 字符串解析
├── store/
│   └── route.ts                  # Pinia route store（authRoutes / menus / home）
├── directives/
│   └── permission.ts             # v-permission 指令
├── layouts/
│   ├── base-layout.vue           # 主布局（Header + Sider + RouterView）
│   └── blank-layout.vue          # 空白布局（403/404/500 用）
├── views/
│   ├── login/index.vue           # ⚠️ 重构：现有 login.vue → login/index.vue（对齐 web 约定）
│   ├── dashboard/index.vue       # ⚠️ 重构：现有 dashboard.vue → dashboard/index.vue
│   └── _builtin/
│       ├── 403/index.vue
│       ├── 404/index.vue
│       └── 500/index.vue
├── App.vue                       # 改：去掉 AppShell，改用 RouterView
├── main.ts                       # 改：注册 router + v-permission + token 预热
└── components/AppShell.vue       # 删除（职责交给 router guard）
```

> **重构说明**：当前仓库里 `login.vue` 和 `dashboard.vue` 是单文件，按 web 约定（`<module>/index.vue`）需要重构成目录形式。glob 扫描也按这个约定，单文件不会被扫到。

### 3.2 数据流

```
1. 应用启动
   main.ts → createRouter(memory history)
            → 注册静态路由（login / 403 / 404 / 500）
            → 注册 beforeEach 守卫
            → app.use(router) → app.mount

2. 首次导航（无 token）
   guard: to.path !== '/login' && 无 token → redirect /login?redirect=...

3. 登录成功（store 内部完成 + 调用方跳转）
   authStore.login() 内部：setTokens → getUserInfo → routeStore.initAuthRoutes()
   └─ 调用方 Login.vue：router.push(routeStore.home)

4. initAuthRoutes（在 route store 内）
   ├─ fetchGetUserRoutes()
   ├─ transformToVueRoutes(routes) → router.addRoute(...) 逐个注册
   ├─ generateMenus(routes) → routeStore.menus
   ├─ generateCacheRoutes(routes) → routeStore.cacheRoutes
   └─ 更新 '/' 重定向到 home

5. 已登录再次访问 /login
   guard: 已登录 + to.path === '/login' → redirect home

6. 登出（由 Header 组件触发，**store 不调 router**）
   authStore.logout() → clearTokens + routeStore.resetRoutes() + $reset()
   └─ 调用方接着 router.push('/login')
```

## 4. 关键实现细节

### 4.1 组件映射（`router/components.ts`）

不用 @elegant-router，用 Vite 的 `import.meta.glob` 自动扫描 `views/`：

```ts
import BaseLayout from '../layouts/base-layout.vue'
import BlankLayout from '../layouts/blank-layout.vue'

// 懒加载所有视图：key 形如 '../views/system/dict/data/index.vue'
const viewModules = import.meta.glob('../views/**/index.vue')

export const layouts: Record<string, Component> = {
  base: BaseLayout,
  blank: BlankLayout
}

/**
 * 把路径 '../views/system/job-log/index.vue' → 'system_job-log'
 * 把路径 '../views/system/dict/data/index.vue' → 'system_dict_data'
 *
 * 规则：
 * - 去掉前缀 '../views/' 和后缀 '/index.vue'
 * - 剩下的目录层级用 '/' 分隔 → 全部替换为 '_'
 * - 保留连字符（如 'job-log' 与后端 route_name 一致）
 * - _builtin 目录照常扫描（'../views/_builtin/403/index.vue' → '_builtin_403'）
 */
function pathToViewKey(p: string): string {
  return p
    .replace('../views/', '')
    .replace(/\/index\.vue$/, '')
    .replace(/\//g, '_')
}

export const views: Record<string, () => Promise<Component>> = Object.fromEntries(
  Object.entries(viewModules).map(([p, loader]) => [pathToViewKey(p), loader as () => Promise<Component>])
)
```

**约定**：目录路径 `/` → route*name `*`，连字符保留。

| 文件路径                           | view key           |
| ---------------------------------- | ------------------ |
| `views/home/index.vue`             | `home`             |
| `views/system/user/index.vue`      | `system_user`      |
| `views/system/job-log/index.vue`   | `system_job-log`   |
| `views/system/dict/data/index.vue` | `system_dict_data` |
| `views/_builtin/403/index.vue`     | `_builtin_403`     |

### 4.2 component 字符串解析（`router/transform.ts`）

需要处理：单级路由、嵌套路由、**空目录**（layout.base + children=null）、**children 可能是 null 或 []**。

```ts
const LAYOUT_PREFIX = 'layout.'
const VIEW_PREFIX = 'view.'
const SPLIT = '$'

export function transformRouteToVueRoute(route: UserRoute): RouteRecordRaw {
  const { component } = route

  // 单级路由：layout.base$view.home
  if (component.includes(SPLIT)) {
    const [layoutPart, viewPart] = component.split(SPLIT)
    const layoutName = layoutPart.replace(LAYOUT_PREFIX, '')
    const viewKey = viewPart.replace(VIEW_PREFIX, '')
    return {
      path: route.path,
      component: layouts[layoutName],
      children: [
        {
          name: route.name,
          path: '',
          component: views[viewKey],
          meta: route.meta
        }
      ]
    }
  }

  // 布局容器：layout.base（可能是空目录，也可能有 children）
  if (component.startsWith(LAYOUT_PREFIX)) {
    const layoutName = component.replace(LAYOUT_PREFIX, '')
    const kids = route.children ?? []
    return {
      path: route.path,
      name: route.name,
      component: layouts[layoutName],
      meta: route.meta,
      children: kids.map(transformRouteToVueRoute) // 空数组也是合法的
    }
  }

  // 视图：view.system_user
  if (component.startsWith(VIEW_PREFIX)) {
    const viewKey = component.replace(VIEW_PREFIX, '')
    return {
      path: route.path,
      name: route.name,
      component: views[viewKey],
      meta: route.meta
    }
  }

  throw new Error(`[router] unknown component descriptor: ${component}`)
}
```

**空目录处理（实测后端会有）**：

- 后端返回 `{ component: "layout.base", children: null }`（如 `auth`）
- transform 后变成 `{ component: BaseLayout, children: [] }` —— vue-router 接受空 children
- 菜单生成时单独处理（§4.3）：**显示但禁用点击**（或仅作为分组标题），避免用户点了无反应

递归处理 children：父路由为 `layout.*`，子路由为 `view.*`。`children ?? []` 兼容 null。

### 4.3 Route Store（`store/route.ts`）

```ts
interface RouteState {
  authRoutes: UserRoute[] // 原始数据（用于重置）
  vueRoutes: RouteRecordRaw[] // 转换后的 vue-router 记录
  menus: MenuItem[] // 菜单数据（侧边栏渲染用）
  home: string // 首页路由 name
  isInitAuthRoute: boolean // 动态路由是否已初始化
  removeRouteFns: (() => void)[] // addRoute 返回的注销函数
  cacheRoutes: string[] // meta.keepAlive === true 的路由 name 列表
}

interface MenuItem {
  key: string // = route.name
  label: string // = meta.title（Phase 1 第 4 项接 i18n）
  icon?: string
  routePath: string // 为空表示「分组标题/不可点击」（用于空目录）
  children?: MenuItem[]
  disabled?: boolean // 空目录（layout.base + children=null）置为 true
}
```

NaiveUI NMenu 支持 `disabled` 字段，渲染时自动置灰、不响应点击。

关键 actions：

- `initAuthRoutes()` —— 调 API、转换、注册，并生成 menus + cacheRoutes
- `resetRoutes()` —— 遍历 `removeRouteFns` 调用，清空 store
- `generateMenus(routes)` —— 从 `UserRoute[]` 派生 `MenuItem[]`，规则：
  - 过滤 `meta.hideInMenu === true`
  - 单级路由（`component` 含 `$`）：作为叶子菜单项
  - 多级路由（`layout.*` + children）：作为分组，递归生成 children
  - **空目录**（`layout.*` + children=null）：`disabled: true`，仅展示标题不响应点击
  - 外链（`meta.href` 非空）：`routePath` 留空，点击时调 `window.electron.shell.openExternal(href)`（需 preload 暴露）
- `generateCacheRoutes(routes)` —— 遍历路由树，收集 `meta.keepAlive === true` 的 `route.name`（**注意：组件 `defineOptions({ name })` 必须与 `route.name` 一致**，KeepAlive include 才生效）

### 4.4 路由守卫（`router/guard.ts`）

```ts
export function setupRouteGuard(router: Router) {
  router.beforeEach(async to => {
    const authStore = useAuthStore()
    const routeStore = useRouteStore()
    const tokens = await getTokens()

    // 1. 无 token
    if (!tokens) {
      if (to.meta.constant) return true // 常量路由放行
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    // 2. 已登录但未初始化动态路由 → 先初始化
    if (!routeStore.isInitAuthRoute) {
      await routeStore.initAuthRoutes()
      // 用 fullPath 重新触发导航，让新注册的路由生效（不能 return {...to}）
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
```

**关键修正**：

- 顺序：先判断「未初始化」再判断「访问 login」，避免 home 还没值时跳转失败
- `return to.fullPath` 而不是 `return { ...to, replace: true }`（vue-router 接受字符串触发新导航）
- `meta.roles` 检查放在 static 模式分支里，dynamic 模式跳过（后端已过滤）

### 4.5 v-permission 指令（`directives/permission.ts`）

⚠️ **三个限制**：

1. 只能用在**真实 DOM 元素**或**直接渲染单个元素的组件**（如 `<n-button>`，不能 `<template>`）
2. **`mounted` 钩子只调一次**，若 `buttons` 是异步加载的，需要在 buttons 就绪后再挂载组件
3. 因此**更推荐用 `v-if="hasPermission(...)"`**，响应式自动跟随 store 变化

```ts
import type { Directive } from 'vue'
import { useAuthStore } from '../store/auth'

/**
 * v-permission="'sys:user:add'"          单权限
 * v-permission="['sys:user:add', ...]"   任一权限即可
 * 超管 buttons=["*"] 视为拥有所有权限
 *
 * ⚠️ 见 §4.5 开头三个限制
 */
export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const authStore = useAuthStore()
    const required = Array.isArray(binding.value) ? binding.value : [binding.value]
    const granted = authStore.buttons
    const isSuper = granted.includes('*')
    const ok = isSuper || required.some(code => granted.includes(code))
    if (!ok) el.parentNode?.removeChild(el)
  }
}

/** 组件内 v-if 形式的辅助函数（**推荐使用**，响应式跟随 store 变化） */
export function hasPermission(code: string | string[]): boolean {
  const authStore = useAuthStore()
  const required = Array.isArray(code) ? code : [code]
  const granted = authStore.buttons
  if (granted.includes('*')) return true
  return required.some(c => granted.includes(c))
}
```

**使用对比**：

```vue
<!-- ✅ 推荐方式：v-if + hasPermission() -->
<n-button v-if="hasPermission('sys:user:add')">新增</n-button>

<!-- ⚠️ 可用但有局限：指令形式 -->
<n-button v-permission="'sys:user:add'">新增</n-button>

<!-- ❌ 不会工作：template 上的指令 -->
<template v-permission="'sys:user:add'">
  <n-button>新增</n-button>
</template>
```

**刷新窗口场景**：用户刷新页面 → buttons 是空数组 → 指令 mounted 时权限判断失败 → 元素被删除；之后 getUserInfo 返回 buttons，指令不会重新触发，元素永久消失。
→ 这就是为什么推荐 `v-if + hasPermission()`。

在 `main.ts` 注册：`app.directive('permission', permission)`，并 export `hasPermission` 供组件 import。

### 4.6 BaseLayout（`layouts/base-layout.vue`）

Phase 1 极简版（仅 vertical 布局，**不含暗黑切换** —— 暗黑切换 + ThemeDrawer 留 Phase 1 第 4 项）：

```
┌──────────────────────────────────────────────────┐
│ Header: 应用名 · 右侧 [用户头像/退出]             │
├──────────┬───────────────────────────────────────┤
│          │                                       │
│  Sider   │           RouterView                  │
│  NMenu   │       (KeepAlive for meta.keepAlive)  │
│          │                                       │
└──────────┴───────────────────────────────────────┘
```

**Header 实现**：

- 左：应用名（`hohu-admin-desktop`，可改）
- 右：用户头像 dropdown（`userName` / `退出登录`）
- 退出登录：调 `authStore.logout()` 后由组件自己 `router.push('/login')`（store 不持 router 引用，见 §5）
- 暗黑切换 / 主题抽屉 → Phase 1 第 4 项

**Sider 实现**：

- NMenu 数据直接来自 `routeStore.menus`
- NMenu 的 `onSelect(key)`：
  - 若对应菜单的 `routePath` 为空（外链）→ `window.electron.shell.openExternal(meta.href)`
  - 若 `disabled` → 不响应
  - 否则 → `router.push(routePath)`
- 不做 collapse、tab、面包屑、主题抽屉

**Content 实现**：

- `<RouterView v-slot="{ Component }"><KeepAlive :include="cacheRoutes"><component :is="Component" /></KeepAlive></RouterView>`
- `cacheRoutes` 来自 `routeStore.cacheRoutes`，存储的是**组件 `name`**（不是路由 name）
- ⚠️ **每个需要 keepAlive 的视图组件必须 `defineOptions({ name: 'xxx' })` 显式声明 name，且与 `route.name` 一致**，否则 KeepAlive 的 `include` 匹配不到，缓存不生效

**BlankLayout**（错误页用）：极简版仅 `<RouterView />`，无 Header/Sider。

**外链 preload 桥**：`window.electron.shell.openExternal` 需在 preload 暴露：

```ts
// preload/index.ts
const shell = {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
} as const
// main/ipc/shell.ts: 注册 handler，过滤协议白名单（http/https）
```

### 4.7 static 模式路由文件（`router/static-routes.ts`）

仅 `RENDERER_VITE_ROUTE_MODE=static` 时使用。结构和后端 `UserRoute[]` 一致，便于复用 transform 逻辑。类型 `Api.Route.UserRoute` 是全局 declare namespace（见 §8），**不需要 import**：

```ts
/**
 * static 模式专用：前端写死的完整路由树。
 * 适用于 fork 出去做独立桌面应用、无后端的离线场景、demo 模板。
 *
 * - meta.roles：声明所需角色；用户角色命中其一即可访问；R_ADMIN 总是通过
 * - 其他字段（hideInMenu / order / icon / keepAlive 等）与 dynamic 模式语义一致
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
      // ...
    ]
  }
]

export const staticHome = 'home'
```

**约定**：static 模式不需要后端 `getUserRoutes` 接口，但仍需 `getUserInfo` 拿到 `roles`（用于过滤）。如果连登录都不要，可以直接绕过守卫把 `meta.constant` 设为 true。

**切换示例**：

```bash
# .env.development
RENDERER_VITE_ROUTE_MODE=static   # 改一个值切换
```

## 5. Pinia store 改造

### `store/auth.ts` 新增动作

⚠️ **store 不直接 import router**（会循环依赖：route store → router → guard → auth store）。`router.push` 由调用方（Login.vue / Header 组件）执行。

```ts
async login(userName, password) {
  // ...（已有逻辑）
  await setTokens(data)
  await this.getUserInfo()
  // 新增：登录成功后初始化路由
  const routeStore = useRouteStore()
  await routeStore.initAuthRoutes()
}

async logout() {
  await clearTokens()
  const routeStore = useRouteStore()
  routeStore.resetRoutes()
  this.$reset()
  // 不调 router.push —— 调用方负责跳转
}
```

**调用方**（如 Header 组件）：

```ts
async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}
```

## 6. 路由定义（`router/routes.ts`）

常量路由采用**扁平结构**（不嵌套 blank-layout）—— 登录页和错误页本身不需要导航布局，直接渲染即可：

```ts
import type { RouteRecordRaw } from 'vue-router'

export const constantRoutes: RouteRecordRaw[] = [
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
  // 兜底：未匹配路径跳 404
  { path: '/:pathMatch(.*)*', redirect: '/404' }
]
```

**关键点**：

- **扁平结构**：避免父子嵌套导致 `router.push({ name: 'login' })` 行为不稳
- 错误页和登录页**不需要** blank-layout 包裹（它们本身就是极简页面）
- 兜底 `pathMatch` → `/404`，避免白屏
- `meta.constant: true` 让守卫 §4.4 步骤 1 放行

> **`blank-layout.vue` 的用途**：留给「需要全屏但无导航」的页面（如打印预览、embed 嵌入），Phase 1 第 3 项不一定用到。

## 7. Electron 桌面端特殊考量

### 7.1 Memory History

```ts
import { createRouter, createMemoryHistory } from 'vue-router'

const router = createRouter({
  history: createMemoryHistory(), // 不是 createWebHistory
  routes: constantRoutes
})
```

原因：Electron 渲染进程从 `file://` 或 `http://localhost:5173` 加载，URL 不应被 vue-router 管理（用户看不到 URL bar），用内存 history 最稳。

### 7.2 Token 检查异步化

守卫里调 `getTokens()` 是异步 IPC（Keychain 读取）。Phase 1 第 1 项已在 token.ts 做了内存缓存，首次访问会触发一次 IPC，后续命中缓存。

为避免守卫首次导航的 IPC 延迟，在 **`main.ts` 的 `app.use(router)` 之前** 预热（**不是 `App.vue` 的 `onMounted`**，那时首次导航已经开始了）：

```ts
// main.ts
const app = createApp(App)
app.use(createPinia())
app.use(naive)

await loadTokens() // ⚠️ 在 app.use(router) 之前 await，确保守卫首次触发时缓存已就绪

app.use(router)
app.mount('#app')
```

> main.ts 的 top-level `await` 在 Vite/Electron 环境是支持的（ESM）。如果担心兼容性，可以包成 `async setupApp()` 函数。

### 7.3 路由失败处理（区分错误类型）

```ts
async function initAuthRoutes() {
  try {
    // ... 拉 + 注册
  } catch (err) {
    if (isAuthError(err)) {
      // 401 / token 过期 → 登出
      await authStore.logout()
      router.push('/login')
    } else {
      // 网络抖动等 → 不登出，提示重试，返回上一页或留在原页
      message.error('拉取菜单失败，请检查网络后重试')
      router.back()
    }
  }
}
```

- 拉路由失败不能无脑登出，否则一次网络抖动就丢登录态
- 只有明确的 401/token 过期才登出
- 用户访问未注册路由 → 进入 `/404`（已有静态路由兜底）
- dynamic 模式下不需要单独 403 处理（后端不返回该路由，无法导航过去）

### 7.4 外链处理

`meta.href` 不为空时，菜单项点击调 `shell.openExternal(href)` 而不是 `router.push`。需要在 `main/index.ts` 的 `setWindowOpenHandler` 允许外链协议（已实现）。

## 8. API 封装（`service/api/route.ts`）

```ts
import { request } from '../request'

export function fetchGetUserRoutes() {
  return request<{ home: string; routes: UserRoute[] }>({
    url: '/auth/getUserRoutes',
    method: 'get'
  })
}
```

类型放在 `typings/api/route.d.ts`：

```ts
declare namespace Api {
  namespace Route {
    interface UserRoute {
      /* §2.1 */
    }
    interface RouteMeta {
      /* §2.1 */
    }
    interface UserRoutesResponse {
      home: string
      routes: UserRoute[]
    }
  }
}
```

## 9. 验证清单

实现完成后逐项验证：

### 基础流程

- [ ] 启动应用（无 token）→ 自动跳 `/login`
- [ ] 登录成功 → 跳 `home` 页面
- [ ] 刷新窗口（`Cmd+R`）→ 自动登录恢复，跳 `home`（**memory history 不持久化，无法停在原页**；若要实现需加 sessionStorage 持久化）
- [ ] 退出登录 → 清路由 → 跳 `/login`

### 菜单与路由（基于真实后端数据）

- [ ] 侧边栏显示 5 个一级路由：home / ai / auth / system / task（admin 账号）
- [ ] `home` 是单级路由（`layout.base$view.home`），点击直接进首页
- [ ] `ai` 展开 children：ai_chat / ai_provider
- [ ] `system` 展开 children（11 个），含 system_dict_data（3 层目录映射正确）
- [ ] `system_job-log`、`system_operation-log` 这种**带连字符**的路由能正常跳转
- [ ] `auth` 是**空目录**（children=null），菜单显示但点击无反应/灰显
- [ ] `task` 的子路由 path 跨前缀（`/system/job`），点击 task→system_job 能正常跳转
- [ ] `hideInMenu` 为 true 的路由不在侧边栏出现
- [ ] `meta.keepAlive` 页面切换时状态保留

### 权限

- [ ] `v-permission="'sys:user:add'"` 在无权限用户下隐藏按钮
- [ ] 超管（`buttons=["*"]`）所有 `v-permission` 都通过
- [ ] 普通用户只看到后端返回的部分菜单（动态路由过滤）

### 错误处理

- [ ] 后端拉路由失败 → 自动登出 + 提示
- [ ] 访问未注册路径 → `/404`
- [ ] 外链（`meta.href`）→ 调 `shell.openExternal` 在系统浏览器打开

### 工程化

- [ ] 类型检查通过（typecheck）
- [ ] lint 通过、fmt 格式化
- [ ] pre-commit hook 全过

## 10. 依赖与文件清单

### 新增依赖

```bash
pnpm add vue-router@5
```

### 新增文件（15 个）

| 文件                                            | 作用                              |
| ----------------------------------------------- | --------------------------------- |
| `src/renderer/src/router/index.ts`              | createRouter + memory history     |
| `src/renderer/src/router/guard.ts`              | beforeEach 守卫                   |
| `src/renderer/src/router/routes.ts`             | 静态常量路由（login/403/404/500） |
| `src/renderer/src/router/static-routes.ts`      | **static 模式专用的完整路由树**   |
| `src/renderer/src/router/components.ts`         | glob 组件映射                     |
| `src/renderer/src/router/transform.ts`          | component 字符串解析              |
| `src/renderer/src/store/route.ts`               | Pinia route store                 |
| `src/renderer/src/directives/permission.ts`     | v-permission + hasPermission      |
| `src/renderer/src/layouts/base-layout.vue`      | 简易布局                          |
| `src/renderer/src/layouts/blank-layout.vue`     | 空白布局（错误页用）              |
| `src/renderer/src/views/_builtin/403/index.vue` | 无权限页                          |
| `src/renderer/src/views/_builtin/404/index.vue` | 未找到页                          |
| `src/renderer/src/views/_builtin/500/index.vue` | 服务器错误页                      |
| `src/renderer/src/service/api/route.ts`         | API 封装                          |
| `src/renderer/src/typings/api/route.d.ts`       | 类型声明                          |
| `src/main/ipc/shell.ts`                         | shell.openExternal IPC handler    |

### 修改文件（7 个）

| 文件                | 改动                                              |
| ------------------- | ------------------------------------------------- |
| `main.ts`           | 注册 router + v-permission 指令 + token 预热      |
| `App.vue`           | 简化为 `<NConfigProvider>...<RouterView /></...>` |
| `store/auth.ts`     | login/logout 联动 routeStore                      |
| `preload/index.ts`  | 暴露 `window.electron.shell.openExternal`         |
| `main/ipc/index.ts` | 注册 shell IPC handler                            |
| `package.json`      | 加 `vue-router` 依赖                              |
| `CLAUDE.md`         | 更新 Phase 1 进度                                 |

### 删除文件（1 个）

| 文件                      | 原因                  |
| ------------------------- | --------------------- |
| `components/AppShell.vue` | 职责交给 router guard |

## 11. 决策记录

| 决策           | 选择                                                   | 理由                          |
| -------------- | ------------------------------------------------------ | ----------------------------- |
| History 类型   | `createMemoryHistory`                                  | Electron 无 URL bar，最稳     |
| 文件路由       | **不用** @elegant-router                               | 引入复杂度大，glob 扫描足够   |
| 常量路由       | 前端写死                                               | 不依赖后端，启动更快          |
| **路由模式**   | **dynamic（默认）+ static 可切换**                     | **fork 出去做独立应用也能用** |
| 路由初始化时机 | 登录后 + 路由守卫双重保险                              | 处理刷新场景                  |
| 按钮权限       | v-if + hasPermission() 优先，v-permission 指令作为补充 | 响应式自动跟随 store 变化     |
| i18n           | 仅保留 i18nKey 字段，不翻译                            | 留给 Phase 1 第 4 项统一接入  |
| 单级路由表示   | `layout.x$view.y`                                      | 与 web 端约定一致             |
| Token 预热     | `main.ts` 中 `app.use(router)` 前 `await loadTokens()` | 避免守卫首次 IPC 延迟         |

## 12. 与 web 端的差异（明确说明）

| 维度         | web             | desktop                   | 差异原因                    |
| ------------ | --------------- | ------------------------- | --------------------------- |
| History      | web history     | memory history            | Electron 无 URL bar         |
| 文件路由     | @elegant-router | glob 扫描                 | 减少依赖，框架更轻          |
| 常量路由     | 后端拉          | 前端写死                  | 启动更快，不依赖后端        |
| Token 存储   | localStorage    | safeStorage               | 已在 Phase 1 第 1 项决策    |
| 路由数据来源 | HTTP（axios）   | HTTP（主进程 IPC 转发）   | 已在 Phase 1 第 1 项决策    |
| 按钮权限     | 未实现          | **框架内置 v-permission** | desktop 率先实现            |
| i18n 集成    | 已有            | 留 Phase 1 第 4 项        | 主题/i18n 一起做            |
| 布局复杂度   | 6 种模式        | 1 种（vertical）          | 简化，Phase 1 第 4 项可扩展 |
