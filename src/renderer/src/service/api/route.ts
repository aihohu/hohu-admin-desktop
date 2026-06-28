import { request } from '../request'
import type { RequestResult } from '../request'

/** 拉取当前用户有权访问的路由树 + 首页 key */
export function fetchGetUserRoutes(): Promise<RequestResult<Api.Route.UserRoutesResponse>> {
  return request<Api.Route.UserRoutesResponse>({
    url: '/auth/getUserRoutes',
    method: 'get'
  })
}
