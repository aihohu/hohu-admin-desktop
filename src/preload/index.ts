import { contextBridge, ipcRenderer } from 'electron'
import type {
  AuthLoginInput,
  AuthLoginResult,
  AuthSessionState,
  HttpConfig,
  HttpResponse,
  Platform,
  RendererNotifyPayload,
  UpdaterEvent,
  UpdaterStatus
} from '@shared/types'

/**
 * 主进程会话桥：token 只存在于主进程，renderer 只能登录、登出、查询会话状态，
 * 或向固定 backend origin 发出受约束的业务请求。
 */
const auth = {
  login: (input: AuthLoginInput): Promise<AuthLoginResult> => ipcRenderer.invoke('auth:login', input),
  logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  getSessionState: (): Promise<AuthSessionState> => ipcRenderer.invoke('auth:getSessionState'),
  request: <T = unknown>(config: HttpConfig): Promise<HttpResponse<T>> => ipcRenderer.invoke('auth:request', config)
} as const

/**
 * Shell 桥：在系统默认浏览器打开外链。
 * 主进程做协议白名单过滤（仅无凭据 HTTPS）。
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

/** Tray 桥：只暴露设置页实际需要的关闭行为。 */
const tray = {
  getCloseToTray: (): Promise<boolean> => ipcRenderer.invoke('tray:getCloseToTray'),
  setCloseToTray: (enabled: boolean): Promise<void> => ipcRenderer.invoke('tray:setCloseToTray', enabled)
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

/**
 * Updater 桥：手动检查 / 安装 / 跳过版本 / 订阅事件流。
 * onEvent 走 invoke('updater:subscribe') 触发主进程注册 listener，
 * 之后通过 ipcRenderer.on('updater:event') 接收推送。
 */
const updater = {
  check: (forced?: boolean): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:check', forced),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  skipVersion: (version: string): Promise<void> => ipcRenderer.invoke('updater:skipVersion', version),
  setAutoDownload: (enabled: boolean): Promise<void> => ipcRenderer.invoke('updater:setAutoDownload', enabled),
  getStatus: (): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:getStatus'),
  onEvent: (cb: (e: UpdaterEvent) => void): Promise<() => void> =>
    new Promise(resolve => {
      const wrapped = (_e: unknown, payload: UpdaterEvent): void => cb(payload)
      ipcRenderer.on('updater:event', wrapped)
      // 订阅动作本身走一次 IPC（触发 main 注册 listener）
      void ipcRenderer.invoke('updater:subscribe').then(() => {
        resolve(() => {
          ipcRenderer.removeListener('updater:event', wrapped)
          void ipcRenderer.invoke('updater:unsubscribe')
        })
      })
    })
} as const

/**
 * Notification 桥：渲染层推系统通知（web 做不到的桌面差异化）。
 * 受主进程 store.notifications.enabled 全局 mute。
 */
const notification = {
  show: (payload: RendererNotifyPayload): Promise<void> => ipcRenderer.invoke('notification:show', payload),
  getEnabled: (): Promise<boolean> => ipcRenderer.invoke('notification:getEnabled'),
  setEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('notification:setEnabled', enabled)
} as const

/**
 * App namespace 桥：暴露 Electron app 模块的部分 API。
 * - getVersion: package.json version
 * - getPlatform: 主进程 process.platform（渲染层 nodeIntegration=false 拿不到）
 * - getLoginItem / setLoginItem: 开机自启
 */
const app = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPlatform: (): Promise<Platform> => ipcRenderer.invoke('app:getPlatform'),
  getLoginItem: (): Promise<boolean> => ipcRenderer.invoke('app:getLoginItem'),
  setLoginItem: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('app:setLoginItem', enabled)
} as const

const api = {
  auth,
  shell,
  logger,
  tray,
  theme,
  shortcuts,
  updater,
  notification,
  app
}

// contextIsolation 始终启用（见 main/index.ts 的 BrowserWindow 配置）
contextBridge.exposeInMainWorld('api', api)
