import { createFlatRequest, cleanParams } from './factory'
import type { BackendResponse, RequestError, RequestInstanceState } from './type'
import type { HttpResponse } from '@shared/types'
import { getAuthorization, getTokens, setTokens, clearTokens } from '../token'

/** 从 .env 读取业务码（字符串比较，与后端约定一致） */
const SERVICE_SUCCESS_CODE = import.meta.env.RENDERER_VITE_SERVICE_SUCCESS_CODE ?? '200'
const SERVICE_LOGOUT_CODES = (import.meta.env.RENDERER_VITE_SERVICE_LOGOUT_CODES ?? '401').split(',').map(s => s.trim())
const SERVICE_EXPIRED_TOKEN_CODES = (import.meta.env.RENDERER_VITE_SERVICE_EXPIRED_TOKEN_CODES ?? '')
  .split(',')
  .map(s => s.trim())

const state: RequestInstanceState = {
  refreshTokenPromise: null
}

/**
 * 处理 token 过期：单例 Promise 防止并发请求同时触发多次刷新。
 */
async function handleExpiredRequest(): Promise<boolean> {
  if (!state.refreshTokenPromise) {
    state.refreshTokenPromise = (async () => {
      const tokens = await getTokens()
      if (!tokens?.refreshToken) return false
      const { fetchRefreshToken } = await import('../api/auth')
      const { data, error } = await fetchRefreshToken(tokens.refreshToken)
      if (error || !data) return false
      await setTokens(data)
      return true
    })()
  }
  const ok = await state.refreshTokenPromise
  setTimeout(() => {
    state.refreshTokenPromise = null
  }, 1000)
  return ok
}

/**
 * 登出清理（token 失效、被踢等场景）。
 * 由 auth store 接管后续 UI（跳登录页），这里只清状态。
 */
async function handleLogout(): Promise<void> {
  await clearTokens()
}

export const request = createFlatRequest(
  { baseURL: import.meta.env.RENDERER_VITE_SERVICE_BASE_URL },
  {
    async onRequest(config) {
      const Authorization = await getAuthorization()
      config.headers = config.headers || {}
      if (Authorization) config.headers.Authorization = Authorization
      if (config.params && typeof config.params === 'object') {
        config.params = cleanParams(config.params)
      }
      return config
    },
    isBackendSuccess(response: HttpResponse<BackendResponse>) {
      return String(response.data?.code) === SERVICE_SUCCESS_CODE
    },
    async onBackendFail(response, retry, originalConfig) {
      const body = response.data as BackendResponse
      const code = String(body?.code ?? '')
      const status = response.status

      // token 过期 → 刷新并重试
      if (SERVICE_EXPIRED_TOKEN_CODES.includes(code)) {
        // 刷新接口本身失败 → 直接登出
        if (originalConfig.url?.includes('/auth/refreshToken')) {
          await handleLogout()
          return null
        }
        const success = await handleExpiredRequest()
        if (success) {
          // retry 会重新走 onRequest，自动注入新 token
          return retry(originalConfig)
        }
        await handleLogout()
        return null
      }

      // 登出码 → 清理
      if (SERVICE_LOGOUT_CODES.includes(code) || status === 401) {
        await handleLogout()
      }
      return null
    },
    onError(error: RequestError) {
      // 这里可以接入全局 message 弹窗
      console.error('[request error]', error.message)
    },
    transform(response) {
      return (response.data as BackendResponse).data
    }
  }
)

export type { RequestResult } from './type'
