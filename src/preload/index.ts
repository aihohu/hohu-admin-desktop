import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

const api = {
  secureStore,
  http
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
