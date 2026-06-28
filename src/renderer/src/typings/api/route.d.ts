declare namespace Api {
  namespace Route {
    /** 后端返回的单个路由节点 */
    interface UserRoute {
      /** 路由 name（唯一），如 "system_user" */
      name: string
      /** 路由 path，如 "/system/user" */
      path: string
      /** 组件描述符（见 spec §2.4）：layout.x / view.x / layout.x$view.y */
      component: string
      meta: RouteMeta
      /** 后端可能返回 null（不是空数组） */
      children?: UserRoute[] | null
    }

    interface RouteMeta {
      title: string
      /** Phase 1 第 4 项接入 i18n，本阶段先用 title */
      i18nKey?: string | null
      keepAlive?: boolean | null
      /** 标记为常量路由（不需要登录） */
      constant?: boolean | null
      icon?: string | null
      order?: number
      /** 外链 URL */
      href?: string | null
      hideInMenu?: boolean | null
      activeMenu?: string | null
      multiTab?: boolean | null
      /** 仅 static 模式用：dynamic 模式后端不返回此字段（已按角色过滤） */
      roles?: string[]
    }

    /** GET /auth/getUserRoutes 响应 data */
    interface UserRoutesResponse {
      home: string
      routes: UserRoute[]
    }
  }
}
