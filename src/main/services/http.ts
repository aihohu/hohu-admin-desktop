import { net } from 'electron'
import qs from 'qs'
import type { HttpConfig, HttpResponse } from '@shared/types'
import { MAX_RESPONSE_BODY_BYTES } from './security-policy'

export type { HttpConfig, HttpResponse }

const DEFAULT_TIMEOUT = 60_000

/**
 * 主进程 HTTP 转发器（基于 Electron net 模块）。
 * 主进程运行在 Node 环境，不受浏览器同源策略限制，可绕开 CORS。
 * 不含业务逻辑；仅由主进程会话服务调用。
 */
export function httpRequest<T = unknown>(config: HttpConfig): Promise<HttpResponse<T>> {
  return new Promise((resolve, reject) => {
    const url = buildUrl(config.url, config.params)
    const method = (config.method || 'get').toUpperCase()

    if (url.length > 8192) {
      reject(new Error('[http] URL exceeds 8192 characters'))
      return
    }
    const request = net.request({ url, method, redirect: 'error' })
    let settled = false

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      request.abort()
      reject(error)
    }

    // headers
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        try {
          request.setHeader(key, value)
        } catch {
          /* 某些 header 在 setHeader 阶段会因受限 header 失败，忽略 */
        }
      }
    }

    // 超时
    const timer = setTimeout(() => {
      fail(new Error(`[http] timeout after ${config.timeout ?? DEFAULT_TIMEOUT}ms: ${method} ${url}`))
    }, config.timeout ?? DEFAULT_TIMEOUT)

    request.on('response', response => {
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(response.headers)) {
        const v = Array.isArray(value) ? value.join(', ') : value
        headers[key.toLowerCase()] = v
      }

      const chunks: Buffer[] = []
      let receivedBytes = 0
      response.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length
        if (receivedBytes > MAX_RESPONSE_BODY_BYTES) {
          fail(new Error(`[http] response exceeds ${MAX_RESPONSE_BODY_BYTES} bytes`))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const buf = Buffer.concat(chunks)
        try {
          const data = parseBody<T>(buf, config.responseType ?? 'json', headers)
          resolve({
            status: response.statusCode,
            statusText: response.statusMessage || '',
            headers,
            data
          })
        } catch (err) {
          reject(err)
        }
      })
      response.on('error', err => {
        fail(err)
      })
    })

    request.on('error', err => {
      fail(err)
    })

    // body
    if (config.data !== undefined && config.data !== null) {
      const bodyStr =
        typeof config.data === 'string' || Buffer.isBuffer(config.data) ? config.data : JSON.stringify(config.data)
      // 若调用方没显式设置 Content-Type，默认 json
      try {
        if (!request.getHeader('Content-Type')) request.setHeader('Content-Type', 'application/json')
      } catch {
        /* ignore */
      }
      request.write(bodyStr)
    }

    request.end()
  })
}

function buildUrl(url: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return url
  const query = qs.stringify(cleanParams(params))
  if (!query) return url
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`
}

function cleanParams<T extends Record<string, unknown>>(params: T): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const key in params) {
    const value = params[key]
    if (value !== null && value !== undefined && value !== '') {
      cleaned[key] = value
    }
  }
  return cleaned
}

function parseBody<T>(buf: Buffer, type: string, headers: Record<string, string>): T {
  const contentType = headers['content-type'] || ''
  if (type === 'arraybuffer') {
    return buf as unknown as T
  }
  if (type === 'blob') {
    return buf as unknown as T
  }
  const text = buf.toString('utf-8')
  if (type === 'text') return text as unknown as T
  // json：内容为空时返回空对象
  if (!text) return {} as T
  if (contentType.includes('application/json') || type === 'json') {
    return JSON.parse(text) as T
  }
  // 兜底：尝试 JSON，失败则返回原始文本
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}
