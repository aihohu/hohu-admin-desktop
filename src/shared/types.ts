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

/**
 * electron-store 持久化的桌面端配置。
 * schema 严格校验（additionalProperties: false），老用户升级时新字段由 defaults 自动补齐。
 *
 * 注意：UI 偏好（darkMode / primaryColor / siderCollapse / locale）不在这里，
 * 它们留 localStorage 与 web 端共享。
 */
export interface StoreSchema {
  /** 窗口位置/大小（Phase 2.2 用） */
  windowState: {
    width: number
    height: number
    /** 最大化/未定位时为 null */
    x: number | null
    y: number | null
    isMaximized?: boolean
    isFullScreen?: boolean
  }
  /** 全局快捷键映射（Phase 2.2 用）：action → accelerator */
  shortcuts: Record<string, string>
  /** 托盘行为（Phase 2.2 用） */
  tray: {
    closeToTray: boolean
  }
  /** 自动更新（Phase 2.3 用） */
  updater: {
    skipVersion: string | null
    lastCheck: number | null
  }
  /** 系统通知（Phase 2.4 用） */
  notifications: {
    enabled: boolean
  }
}

/**
 * 渲染层 logger 桥。只暴露 error/warn —— 不提供 info/debug，
 * 避免 renderer 把它当 console 用。常规日志直接走 console.*。
 */
export interface LoggerApi {
  error: (msg: string, meta?: unknown) => Promise<void>
  warn: (msg: string, meta?: unknown) => Promise<void>
}

export interface StoreApi {
  get: <K extends keyof StoreSchema>(key: K) => Promise<StoreSchema[K]>
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => Promise<void>
  delete: (key: keyof StoreSchema) => Promise<void>
}

/**
 * Theme 桥：同步渲染层主题到主进程的 nativeTheme。
 * 影响 OS 层 UI（标题栏、原生 scrollbar、原生右键菜单）。
 */
export interface ThemeApi {
  setNativeSource: (source: 'system' | 'dark' | 'light') => Promise<void>
}

/**
 * Shortcuts 桥：渲染层读取/更新全局快捷键配置（设置页用）。
 * action 名固定在主进程 ACTION_HANDLERS 里，渲染层不能注册任意 action。
 * update 返回 boolean：false 表示快捷键被其他应用占用，注册失败。
 */
export interface ShortcutsApi {
  list: () => Promise<Record<string, string>>
  update: (action: string, accelerator: string) => Promise<boolean>
}

/**
 * Updater 桥：electron-updater 的 typed IPC 表面。
 * state 流：idle → checking → available → downloading → downloaded → (install)
 *                                                  ↘ not-available / error / skipped
 */
export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'skipped'

export interface UpdaterStatus {
  state: UpdaterState
  /** 检测到的新版本号（无则 null） */
  version: string | null
  /** 下载进度 0-100（非 downloading 状态为 null） */
  progress: number | null
  lastCheck: number | null
  skipVersion: string | null
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'skipped'; version: string }
  | { type: 'error'; message: string }

export interface UpdaterApi {
  /** 发起检查；forced=true 绕过 24h 限频 */
  check: (forced?: boolean) => Promise<UpdaterStatus>
  /** 退出并安装（仅在 downloaded 状态有效） */
  install: () => Promise<void>
  /** 标记跳过某版本 */
  skipVersion: (version: string) => Promise<void>
  /** 拿当前状态（渲染层首屏初始化用） */
  getStatus: () => Promise<UpdaterStatus>
  /** 订阅事件流；返回取消订阅函数 */
  onEvent: (cb: (e: UpdaterEvent) => void) => Promise<() => void>
}

export interface AppApi {
  secureStore: SecureStoreApi
  http: HttpApi
  shell: ShellApi
  logger: LoggerApi
  store: StoreApi
  theme: ThemeApi
  shortcuts: ShortcutsApi
  updater: UpdaterApi
}
