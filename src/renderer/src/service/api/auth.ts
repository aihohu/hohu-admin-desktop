import { request, type RequestResult } from '../request'

export function fetchGetUserInfo(): Promise<RequestResult<Api.Auth.UserInfo>> {
  return request<Api.Auth.UserInfo>({
    url: '/auth/getUserInfo',
    method: 'get'
  })
}
