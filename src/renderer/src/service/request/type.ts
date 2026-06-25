import type { HttpConfig, HttpResponse } from '@shared/types'

/** 业务后端响应（与 hohu-admin 后端约定） */
type BackendResponse<T = unknown> = Response<T>

/** 业务请求配置（渲染层语义；最终通过 IPC 送到主进程） */
export interface RequestConfig {
  url: string
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'
  data?: unknown
  params?: Record<string, unknown>
  headers?: Record<string, string>
  responseType?: HttpConfig['responseType']
  timeout?: number
  /** 标记为"刷新 token"请求，避免在 onBackendFail 中被再次拦截造成死循环 */
  isRefreshToken?: boolean
}

/** 实际发送给主进程的配置（剥离 isRefreshToken 等业务字段） */
export type SendableConfig = Omit<RequestConfig, 'isRefreshToken'>

/** 请求成功结果（flat 模式） */
export interface RequestResultSuccess<T> {
  data: T
  error: null
  response: HttpResponse<BackendResponse<T>>
}

/** 请求失败结果（flat 模式） */
export interface RequestResultError<T> {
  data: null
  error: RequestError
  response: HttpResponse<BackendResponse<T>> | null
}

export type RequestResult<T = unknown> = RequestResultSuccess<T> | RequestResultError<T>

export interface RequestError extends Error {
  /** 后端业务响应（若拿到） */
  response?: HttpResponse<BackendResponse>
  /** HTTP 状态码（若拿到） */
  status?: number
}

export type RequestInstance = <T = unknown>(config: RequestConfig) => Promise<RequestResult<T>>

export interface RequestInstanceState {
  /** 正在进行的刷新 token Promise（单例，防并发） */
  refreshTokenPromise: Promise<boolean> | null
}

export interface RequestOption {
  /** onRequest 钩子：注入 token、清理 params */
  onRequest: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  /** 判断后端业务码是否成功 */
  isBackendSuccess: (response: HttpResponse<BackendResponse>) => boolean
  /** 业务失败回调：处理 token 过期、登出等。retry(config) 重试，返回新响应或 null 放弃 */
  onBackendFail: (
    response: HttpResponse<BackendResponse>,
    retry: (config: RequestConfig) => Promise<HttpResponse<BackendResponse>>,
    originalConfig: RequestConfig
  ) => Promise<OnBackendFailResult> | OnBackendFailResult
  /** 网络/HTTP 错误回调 */
  onError: (error: RequestError) => void
  /** 从响应里提取业务数据 */
  transform: (response: HttpResponse<BackendResponse>) => unknown
}

/** onBackendFail 返回值：要么返回新的响应（重试成功），要么返回 null（放弃） */
export type OnBackendFailResult = HttpResponse<BackendResponse> | null

export type { BackendResponse }
