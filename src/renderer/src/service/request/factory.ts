import { nanoid } from 'nanoid'
import type { HttpConfig, HttpResponse } from '@shared/types'
import type {
  BackendResponse,
  OnBackendFailResult,
  RequestConfig,
  RequestError,
  RequestInstance,
  RequestOption,
  RequestResultError,
  RequestResultSuccess
} from './type'

export interface CreateRequestConfig {
  baseURL?: string
}

/**
 * Flat request factory：调用方总是拿到 { data, error, response }，无需 try/catch。
 *
 * 实现方式：渲染进程不再用 axios，而是通过 IPC 把请求转发到主进程（Electron net 模块）。
 * 主进程在 Node 环境，绕开浏览器 CORS。
 *
 * 业务侧接口（auth store、API 调用）零改动。
 */
export function createFlatRequest(config: CreateRequestConfig, options: RequestOption): RequestInstance {
  const baseURL = config.baseURL || ''

  const doRequest = async <T>(
    reqConfig: RequestConfig,
    depth: number
  ): Promise<RequestResultSuccess<T> | RequestResultError<T>> => {
    if (depth > 2) {
      const overflow: RequestError = new Error('[request] max retry depth exceeded')
      options.onError(overflow)
      return { data: null, error: overflow, response: null }
    }

    try {
      const processed = await options.onRequest(reqConfig)
      const sendable = toSendable(processed, baseURL)

      const response = await window.api.http.request<BackendResponse<T>>(sendable)

      if (options.isBackendSuccess(response as HttpResponse<BackendResponse>)) {
        const data = options.transform(response as HttpResponse<BackendResponse>) as T
        const success: RequestResultSuccess<T> = {
          data,
          error: null,
          response: response as HttpResponse<BackendResponse<T>>
        }
        return success
      }

      // 业务失败：交给业务方（可能触发刷新 token 并重试）
      const retry = async (retryConfig: RequestConfig): Promise<HttpResponse<BackendResponse>> => {
        const result = await doRequest<unknown>(retryConfig, depth + 1)
        if (result.response) return result.response as HttpResponse<BackendResponse>
        throw result.error
      }
      const retryResponse = await options.onBackendFail(response as HttpResponse<BackendResponse>, retry, reqConfig)
      const override = retryResponse as OnBackendFailResult
      if (override) {
        const data = options.transform(override) as T
        const success: RequestResultSuccess<T> = {
          data,
          error: null,
          response: override as HttpResponse<BackendResponse<T>>
        }
        return success
      }

      // 放弃：构造业务错误
      const businessError: RequestError = new Error((response.data as BackendResponse)?.msg || 'Backend Error')
      businessError.response = response as HttpResponse<BackendResponse>
      businessError.status = response.status
      options.onError(businessError)
      return { data: null, error: businessError, response: null }
    } catch (e) {
      const err: RequestError = e instanceof Error ? e : new Error(String(e))
      options.onError(err)
      return { data: null, error: err, response: null }
    }
  }

  const request: RequestInstance = async <T = unknown>(reqConfig: RequestConfig) => {
    return doRequest<T>(reqConfig, 0)
  }

  return request
}

function toSendable(config: RequestConfig, baseURL: string): HttpConfig {
  const headers: Record<string, string> = { ...(config.headers || {}) }
  if (!headers['X-Request-Id']) headers['X-Request-Id'] = nanoid()

  return {
    url: baseURL + (config.url || ''),
    method: (config.method || 'get').toLowerCase(),
    data: config.data,
    params: config.params,
    headers,
    responseType: config.responseType,
    timeout: config.timeout
  }
}

/** 过滤掉 params 中 null/undefined/'' 的字段（主进程也会做一次，渲染层先做减少 IPC 体积） */
export function cleanParams<T extends Record<string, unknown>>(params: T): T {
  const cleaned: Record<string, unknown> = {}
  for (const key in params) {
    const v = params[key]
    if (v !== null && v !== undefined && v !== '') {
      cleaned[key] = v
    }
  }
  return cleaned as T
}
