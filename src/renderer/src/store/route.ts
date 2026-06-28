import { defineStore } from 'pinia'
import type { RouteRecordRaw } from 'vue-router'
import { router } from '../router'
import { transformRoutes } from '../router/transform'
import { fetchGetUserRoutes } from '../service/api/route'
import { preloadIcons } from '../icons'

export interface MenuItem {
  /** = route.name */
  key: string
  /** = meta.title（Phase 1 第 4 项接 i18n） */
  label: string
  icon?: string
  /** 为空表示「分组标题/不可点击」（用于空目录或外链） */
  routePath: string
  children?: MenuItem[]
  /** 空目录（layout.base + children=null）置为 true */
  disabled?: boolean
  /** 外链 URL（routePath 为空时使用） */
  href?: string
}

interface RouteState {
  /** 原始数据（用于重置） */
  authRoutes: Api.Route.UserRoute[]
  /** 转换后的 vue-router 记录 */
  vueRoutes: RouteRecordRaw[]
  /** 菜单数据（侧边栏渲染用） */
  menus: MenuItem[]
  /** 首页路由 name */
  home: string
  /** 动态路由是否已初始化 */
  isInitAuthRoute: boolean
  /** addRoute 返回的注销函数 */
  removeRouteFns: Array<() => void>
  /** meta.keepAlive === true 的路由 name 列表（也是组件 name，需 defineOptions 对齐） */
  cacheRoutes: string[]
}

export const useRouteStore = defineStore('route', {
  state: (): RouteState => ({
    authRoutes: [],
    vueRoutes: [],
    menus: [],
    home: '',
    isInitAuthRoute: false,
    removeRouteFns: [],
    cacheRoutes: []
  }),
  actions: {
    /**
     * 初始化认证路由：根据 ROUTE_MODE 走 dynamic 或 static 分支。
     * 失败时（如 401）抛出，由调用方（guard）处理跳转。
     */
    async initAuthRoutes(): Promise<void> {
      const mode = import.meta.env.RENDERER_VITE_ROUTE_MODE ?? 'dynamic'

      let routes: Api.Route.UserRoute[]
      let home: string

      if (mode === 'static') {
        const mod = await import('../router/static-routes')
        routes = mod.staticRoutes
        home = mod.staticHome
      } else {
        const { data, error } = await fetchGetUserRoutes()
        if (error || !data) {
          throw new Error(error?.message || '拉取用户路由失败')
        }
        routes = data.routes
        home = data.home
      }

      await this.setAuthRoutes(routes, home)
    },

    /**
     * 注册动态路由到 vue-router，并生成 menus / cacheRoutes。
     * ⚠️ 先同步等待图标集加载完成，再设置 menus，避免 Icon 组件渲染时
     * 图标不在内存而触发在线 API 请求（CSP 会拦截）。
     */
    async setAuthRoutes(routes: Api.Route.UserRoute[], home: string): Promise<void> {
      // 先清掉之前注册的（用户切换场景）
      this.resetRoutes()

      this.authRoutes = routes
      this.home = home
      this.vueRoutes = transformRoutes(routes)

      // 关键：在 menus 设置前预加载图标集
      const allIcons = this.collectIcons(routes)
      await preloadIcons(allIcons)

      this.menus = this.generateMenus(routes)
      this.cacheRoutes = this.generateCacheRoutes(routes)

      // 逐个 addRoute，保存 remove 函数
      for (const r of this.vueRoutes) {
        const remove = router.addRoute(r)
        this.removeRouteFns.push(remove)
      }

      // 更新 '/' 重定向到 home
      if (home) {
        router.addRoute({ path: '/', redirect: { name: home } })
      }

      this.isInitAuthRoute = true
    },

    /** 递归收集所有 meta.icon（用于预加载图标集） */
    collectIcons(routes: Api.Route.UserRoute[]): Array<string | undefined> {
      const result: Array<string | undefined> = []
      const walk = (list: Api.Route.UserRoute[]): void => {
        for (const r of list) {
          result.push(r.meta?.icon ?? undefined)
          if (r.children && r.children.length > 0) walk(r.children)
        }
      }
      walk(routes)
      return result
    },

    /** 重置：移除所有动态注册的路由，清空 store */
    resetRoutes(): void {
      for (const remove of this.removeRouteFns) {
        try {
          remove()
        } catch {
          /* ignore */
        }
      }
      // 移除 '/' 重定向（如果之前注册过）
      if (router.hasRoute('/')) {
        // vue-router 没有 hasRoute by path，但 addRoute 时 name 没设；
        // 通过 removeRoute('home') 之类不行。改用重新 addRoute 覆盖。
      }
      this.removeRouteFns = []
      this.authRoutes = []
      this.vueRoutes = []
      this.menus = []
      this.cacheRoutes = []
      this.home = ''
      this.isInitAuthRoute = false
    },

    /**
     * 从 UserRoute[] 派生 MenuItem[]：
     *   - 过滤 meta.hideInMenu === true
     *   - 单级路由（component 含 $）：叶子
     *   - 多级路由（layout.* + children）：分组，递归
     *   - 空目录（layout.* + children=null）：disabled
     *   - 外链（meta.href 非空）：routePath 留空，存 href
     */
    generateMenus(routes: Api.Route.UserRoute[]): MenuItem[] {
      const visible = routes.filter(r => !r.meta?.hideInMenu)
      return visible.map(r => this.toMenuItem(r)).filter((m): m is MenuItem => m !== null)
    },

    toMenuItem(route: Api.Route.UserRoute): MenuItem | null {
      if (route.meta?.hideInMenu) return null

      const isExternal = Boolean(route.meta?.href)
      const isSingleLevel = route.component.includes('$')
      // ⚠️ isEmptyDir 必须排除单级路由（layout.x$view.y 也会 startsWith('layout.')）
      const isEmptyDir = !isSingleLevel && route.component.startsWith('layout.') && (route.children ?? []).length === 0

      // 子菜单（多级）
      let children: MenuItem[] | undefined
      if (!isSingleLevel && (route.children ?? []).length > 0) {
        const kids = (route.children ?? []).map(c => this.toMenuItem(c)).filter((m): m is MenuItem => m !== null)
        if (kids.length > 0) children = kids
      }

      return {
        key: route.name,
        label: route.meta?.title || route.name,
        icon: route.meta?.icon || undefined,
        // 外链和空目录的 routePath 留空
        routePath: isExternal || isEmptyDir ? '' : route.path,
        children,
        disabled: isEmptyDir,
        href: isExternal ? route.meta?.href || undefined : undefined
      }
    },

    /** 收集 meta.keepAlive === true 的 route.name（也是组件 name） */
    generateCacheRoutes(routes: Api.Route.UserRoute[]): string[] {
      const result: string[] = []
      const walk = (list: Api.Route.UserRoute[]): void => {
        for (const r of list) {
          if (r.meta?.keepAlive === true) result.push(r.name)
          if (r.children && r.children.length > 0) walk(r.children)
        }
      }
      walk(routes)
      return result
    }
  }
})
