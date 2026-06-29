import { contextBridge, ipcRenderer } from 'electron'
import type { HttpConfig, HttpResponse, StoreSchema } from '@shared/types'

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

/**
 * Logger 桥：渲染层只能写 error/warn。
 * 常规 console.* 不进文件；只有未捕获错误才走这条 IPC。
 */
const logger = {
  error: (msg: string, meta?: unknown): Promise<void> => ipcRenderer.invoke('logger:write', 'error', { msg, meta }),
  warn: (msg: string, meta?: unknown): Promise<void> => ipcRenderer.invoke('logger:write', 'warn', { msg, meta })
} as const

/**
 * Store 桥：桌面端非敏感配置（窗口状态、快捷键、托盘行为等）。
 * UI 偏好（darkMode/locale 等）不存这里，留 localStorage 与 web 端共享。
 * 类型契约在这里保证：调用方传字面量 key 时 TS 推断 value 类型。
 */
const store = {
  get: <K extends keyof StoreSchema>(key: K): Promise<StoreSchema[K]> =>
    ipcRenderer.invoke('store:get', key) as Promise<StoreSchema[K]>,
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): Promise<void> =>
    ipcRenderer.invoke('store:set', key, value) as Promise<void>,
  delete: (key: keyof StoreSchema): Promise<void> => ipcRenderer.invoke('store:delete', key) as Promise<void>
} as const

/**
 * Theme 桥：同步渲染层暗黑模式到主进程 nativeTheme。
 * 影响 OS 层 UI（标题栏、原生 scrollbar、原生右键菜单）。
 */
const theme = {
  setNativeSource: (source: 'system' | 'dark' | 'light'): Promise<void> =>
    ipcRenderer.invoke('theme:setNativeSource', source) as Promise<void>
} as const

/**
 * Shortcuts 桥：读取/更新全局快捷键配置（设置页用）。
 * action 名固定在主进程 ACTION_HANDLERS 里，渲染层不能注册任意 action。
 * update 返回 boolean：false 表示快捷键被其他应用占用，注册失败。
 */
const shortcuts = {
  list: (): Promise<Record<string, string>> => ipcRenderer.invoke('shortcuts:list') as Promise<Record<string, string>>,
  update: (action: string, accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke('shortcuts:update', action, accelerator) as Promise<boolean>
} as const

const api = {
  secureStore,
  http,
  shell,
  logger,
  store,
  theme,
  shortcuts
}

// contextIsolation 始终启用（见 main/index.ts 的 BrowserWindow 配置）
contextBridge.exposeInMainWorld('api', api)
