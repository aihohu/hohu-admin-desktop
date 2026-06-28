import type { RouteRecordRaw } from 'vue-router'
import { layouts, views } from './components'

const LAYOUT_PREFIX = 'layout.'
const VIEW_PREFIX = 'view.'
const SPLIT = '$'

/**
 * 把后端的 UserRoute 转换为 vue-router 的 RouteRecordRaw。
 * 处理 3 种 component 描述符（见 spec §2.4）：
 *   - layout.x$view.y：单级路由（layout + view 合并）
 *   - layout.x：布局容器（可能有 children，children=null 是空目录）
 *   - view.x：视图组件
 *
 * 兜底：如果后端返回的 view 在 views 表里找不到（开发者还没创建对应 .vue 文件），
 * 自动 fallback 到 404 页，避免点击菜单无反应。
 *
 * meta 用 cast 因为 vue-router 的 RouteMeta 要求 Record<string, unknown> 索引签名，
 * 而我们的 Api.Route.RouteMeta 是精确字段类型。运行时一致，类型层用 unknown 过渡。
 */
function asMeta(meta: Api.Route.RouteMeta): unknown {
  return meta
}

function getView(key: string): () => Promise<unknown> {
  if (views[key]) return views[key]
  console.warn(`[router] view not found for "${key}", falling back to 404`)
  return () => import('../views/_builtin/404/index.vue')
}

export function transformRouteToVueRoute(route: Api.Route.UserRoute): RouteRecordRaw {
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
          component: getView(viewKey),
          meta: asMeta(route.meta) as never
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
      meta: asMeta(route.meta) as never,
      children: kids.map(transformRouteToVueRoute)
    }
  }

  // 视图：view.system_user
  if (component.startsWith(VIEW_PREFIX)) {
    const viewKey = component.replace(VIEW_PREFIX, '')
    return {
      path: route.path,
      name: route.name,
      component: getView(viewKey),
      meta: asMeta(route.meta) as never
    }
  }

  throw new Error(`[router] unknown component descriptor: ${component}`)
}

/** 批量转换 */
export function transformRoutes(routes: Api.Route.UserRoute[]): RouteRecordRaw[] {
  return routes.map(transformRouteToVueRoute)
}
