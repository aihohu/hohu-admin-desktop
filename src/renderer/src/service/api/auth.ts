import { request, type RequestResult } from '../request'

export function fetchLogin(userName: string, password: string): Promise<RequestResult<Api.Auth.LoginToken>> {
  return request<Api.Auth.LoginToken>({
    url: '/auth/login',
    method: 'post',
    data: { userName, password }
  })
}

export function fetchRefreshToken(refreshToken: string): Promise<RequestResult<Api.Auth.LoginToken>> {
  return request<Api.Auth.LoginToken>({
    url: '/auth/refreshToken',
    method: 'post',
    data: { refreshToken },
    isRefreshToken: true
  })
}

export function fetchGetUserInfo(): Promise<RequestResult<Api.Auth.UserInfo>> {
  return request<Api.Auth.UserInfo>({
    url: '/auth/getUserInfo',
    method: 'get'
  })
}
