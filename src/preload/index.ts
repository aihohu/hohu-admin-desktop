import { contextBridge, ipcRenderer } from 'electron'
import type { HttpConfig, HttpResponse } from '@shared/types'

/**
 * Secure Store 桥：渲染进程通过 window.api.secureStore 访问主进程的加密存储。
 * 永远不要直接暴露 ipcRenderer，只暴露白名单方法。
 */
const secureStore = {
  get: (key: string): Promise<string | null> => ipcRenderer.invoke('secure-store:get', key),
  set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('secure-store:set', key, value),
  delete: (key: string): Promise<void> => ipcRenderer.invoke('secure-store:delete', key),
  clear: (): Promise<void> => ipcRenderer.invoke('secure-store:clear')
} as const

/**
 * HTTP 桥：渲染进程所有 HTTP 请求通过主进程转发，绕开浏览器 CORS。
 * 请求最终在主进程用 Electron net 模块发起。
 */
const http = {
  request: <T = unknown>(config: HttpConfig): Promise<HttpResponse<T>> => ipcRenderer.invoke('http:request', config)
} as const

/**
 * Shell 桥：在系统默认浏览器打开外链。
 * 主进程做协议白名单过滤（仅 http/https/mailto）。
 */
const shell = {
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url)
} as const

const api = {
  secureStore,
  http,
  shell
}

// contextIsolation 始终启用（见 main/index.ts 的 BrowserWindow 配置）
contextBridge.exposeInMainWorld('api', api)
