/** 主进程 HTTP 转发请求配置（渲染层 → IPC → 主进程 net） */
export interface HttpConfig {
  url: string
  method: string
  data?: unknown
  params?: Record<string, unknown>
  headers?: Record<string, string>
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer'
  timeout?: number
}

/** 主进程 HTTP 响应（与 axios 响应结构相似，但 data 是已解析的 body） */
export interface HttpResponse<T = unknown> {
  status: number
  statusText: string
  headers: Record<string, string>
  data: T
}

export interface SecureStoreApi {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
  clear: () => Promise<void>
}

export interface HttpApi {
  request: <T = unknown>(config: HttpConfig) => Promise<HttpResponse<T>>
}

export interface ShellApi {
  openExternal: (url: string) => Promise<boolean>
}

export interface AppApi {
  secureStore: SecureStoreApi
  http: HttpApi
  shell: ShellApi
}
