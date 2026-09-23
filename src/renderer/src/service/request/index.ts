import { createFlatRequest, cleanParams } from './factory'
import type { BackendResponse, RequestError } from './type'
import type { HttpResponse } from '@shared/types'

/** 从 .env 读取业务码（字符串比较，与后端约定一致） */
const SERVICE_SUCCESS_CODE = import.meta.env.RENDERER_VITE_SERVICE_SUCCESS_CODE ?? '200'
const SERVICE_LOGOUT_CODES = (import.meta.env.RENDERER_VITE_SERVICE_LOGOUT_CODES ?? '401').split(',').map(s => s.trim())
/**
 * 登出清理（token 失效、被踢等场景）。
 * 由 auth store 接管后续 UI（跳登录页），这里只清状态。
 */
async function handleLogout(): Promise<void> {
  await window.api.auth.logout()
}

export const request = createFlatRequest({
  async onRequest(config) {
    if (config.params && typeof config.params === 'object') {
      config.params = cleanParams(config.params)
    }
    return config
  },
  isBackendSuccess(response: HttpResponse<BackendResponse>) {
    return String(response.data?.code) === SERVICE_SUCCESS_CODE
  },
  async onBackendFail(response) {
    const body = response.data as BackendResponse
    const code = String(body?.code ?? '')
    const status = response.status

    // token 刷新由主进程单例会话完成；renderer 只处理最终登出态。
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
})

export type { RequestResult } from './type'
