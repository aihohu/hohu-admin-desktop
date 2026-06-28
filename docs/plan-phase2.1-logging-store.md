# Phase 2.1 — Logging + Local Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add electron-log (file logger with dev/prod leveling) and electron-store (typed, schema-validated config) main-process services, expose both via typed IPC, and wire renderer-side error capture to forward to the log file.

**Architecture:** Two new main-process services (`logger.ts`, `store.ts`) mirror the existing `secure-store.ts` / `http.ts` pattern — one service module + one IPC module + preload whitelist exposure + shared types. The renderer only sees `window.api.logger.error/warn` (no info/debug to prevent console-style abuse) and `window.api.store.get/set/delete` with compile-time key typing via preload-layer generics.

**Tech Stack:** electron-log (file + console transport, size-based rotation), electron-store v9+ (ESM, JSON Schema validation, defaults merge).

**Spec:** `docs/spec-phase2.1-logging-store.md`

**Project conventions (override skill defaults):**

- **No unit test framework** — Phase 1 used manual verification + a data-layer smoke script. Each task ends with `pnpm typecheck && pnpm lint && pnpm fmt` as the automated gate, plus targeted manual verification at the end.
- **Commit style:** Conventional Commits, lowercase, one line — e.g. `feat: phase 2.1 logger service and ipc`. The pre-commit hook runs typecheck + lint + fmt automatically; do NOT use `--no-verify`.
- **Format on save:** the project's prettier config reformats trailing comments to line comments and aligns tables — write code in the project's existing style to minimize churn.

---

## File Structure

| File                          | Status | Responsibility                                                            |
| ----------------------------- | ------ | ------------------------------------------------------------------------- |
| `package.json`                | Modify | Add `electron-log`, `electron-store` dependencies                         |
| `src/shared/types.ts`         | Modify | Add `StoreSchema`, `LoggerApi`, `StoreApi`; extend `AppApi`               |
| `src/main/services/logger.ts` | Create | electron-log config; default-export configured `log` instance             |
| `src/main/services/store.ts`  | Create | electron-store instance with schema + defaults; export `store`            |
| `src/main/ipc/logger.ts`      | Create | `registerLoggerIpc()` — handles `logger:write`                            |
| `src/main/ipc/store.ts`       | Create | `registerStoreIpc()` — handles `store:get/set/delete`                     |
| `src/main/ipc/index.ts`       | Modify | Call `registerLoggerIpc()` and `registerStoreIpc()` in `registerAllIpc()` |
| `src/preload/index.ts`        | Modify | Expose `logger` and `store` on `window.api` via contextBridge             |
| `src/renderer/src/main.ts`    | Modify | Register 3 renderer-side error listeners before `app.mount()`             |

---

## Task 1: Install Dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto-updated by pnpm)

- [ ] **Step 1: Add the two packages**

Run:

```bash
pnpm add electron-log electron-store
```

Expected: both packages added to `dependencies` in `package.json`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Confirm versions resolve and the project still typechecks**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS (no source changes yet, nothing to break).

- [ ] **Step 3: Verify electron-store imports cleanly in ESM mode**

This project ships main as ESM (`tsconfig.node.json` has `module: ESNext`, electron-vite handles bundling). Do a smoke check by inspecting the resolved version:

Run:

```bash
node -e "import('electron-store').then(m => console.log('electron-store default export type:', typeof m.default)).catch(e => { console.error(e); process.exit(1) })"
```

Expected: prints `electron-store default export type: function` (the `Store` class is the default export). If this fails with an ESM/CJS error, stop and confirm `electron-vite` is configured to output ESM for the main process (check `electron.vite.config.ts` main build output format) before continuing.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add electron-log and electron-store for phase 2.1"
```

---

## Task 2: Extend Shared Types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add StoreSchema, LoggerApi, StoreApi; extend AppApi**

Replace the entire contents of `src/shared/types.ts` with:

```ts
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

export interface AppApi {
  secureStore: SecureStoreApi
  http: HttpApi
  shell: ShellApi
  logger: LoggerApi
  store: StoreApi
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. The new types are pure declarations and nothing references them yet, so there's nothing to break.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: phase 2.1 shared types for logger and store"
```

---

## Task 3: Logger Service + IPC + Preload Bridge

**Files:**

- Create: `src/main/services/logger.ts`
- Create: `src/main/ipc/logger.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create the logger service**

Create `src/main/services/logger.ts` with this exact content:

```ts
import log from 'electron-log'

// 文件位置（electron-log 默认）：
//   macOS: ~/Library/Logs/{appName}/main.log
//   Windows: %USERPROFILE%\AppData\Roaming\{appName}\logs\main.log
//   Linux: ~/.config/{appName}/logs/main.log
log.transports.file.level = import.meta.env.DEV ? 'debug' : 'info'
log.transports.file.maxSize = 1048576 // 1 MB → 自动轮转 main.log → main.old.log
log.transports.console.level = import.meta.env.DEV ? 'debug' : false
log.transports.console.format = '{h:i:s} [{level}] {text}'

export default log
```

- [ ] **Step 2: Create the logger IPC handler**

Create `src/main/ipc/logger.ts` with this exact content:

```ts
import { ipcMain } from 'electron'
import log from '@main/services/logger'

const rendererLogger = log.scope('renderer')

/**
 * Logger IPC 通道。
 * 渲染层只能写 error/warn —— 不暴露 info/debug，避免被滥用为 console。
 * scope 固定为 'renderer'，让日志里一眼区分来源。
 */
export const LOGGER_CHANNELS = {
  WRITE: 'logger:write'
} as const

export function registerLoggerIpc(): void {
  ipcMain.handle(LOGGER_CHANNELS.WRITE, (_e, level: 'error' | 'warn', payload: { msg: string; meta?: unknown }) => {
    const { msg, meta } = payload
    if (level === 'error') {
      rendererLogger.error(msg, meta ?? '')
    } else {
      rendererLogger.warn(msg, meta ?? '')
    }
  })
}
```

- [ ] **Step 3: Register the logger IPC in `registerAllIpc()`**

Replace `src/main/ipc/index.ts` with:

```ts
import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'

/**
 * 注册所有 IPC handlers。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerAllIpc(): void {
  registerSecureStoreIpc()
  registerHttpIpc()
  registerShellIpc()
  registerLoggerIpc()
}
```

- [ ] **Step 4: Expose `logger` on `window.api` via preload**

Replace `src/preload/index.ts` with:

```ts
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

/**
 * Logger 桥：渲染层只能写 error/warn。
 * 常规 console.* 不进文件；只有未捕获错误才走这条 IPC。
 */
const logger = {
  error: (msg: string, meta?: unknown): Promise<void> => ipcRenderer.invoke('logger:write', 'error', { msg, meta }),
  warn: (msg: string, meta?: unknown): Promise<void> => ipcRenderer.invoke('logger:write', 'warn', { msg, meta })
} as const

const api = {
  secureStore,
  http,
  shell,
  logger
}

// contextIsolation 始终启用（见 main/index.ts 的 BrowserWindow 配置）
contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 5: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS. If `pnpm fmt` reports formatting changes, run `pnpm format` and re-run `pnpm fmt` to confirm clean.

- [ ] **Step 6: Manual verification — log file is created on dev start**

Run:

```bash
pnpm dev
```

Wait for the Electron window to open. In the terminal where `pnpm dev` is running, you should see electron-log's console transport output with timestamps like `12:34:56 [INFO] ...`. Close the window after ~5 seconds.

Then locate the log file:

- macOS: `~/Library/Logs/hohu-admin-desktop/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\hohu-admin-desktop\logs\main.log`
- Linux: `~/.config/hohu-admin-desktop/logs/main.log`

(If the directory name differs from `hohu-admin-desktop`, match the `name` field in `electron-builder.yml` / `package.json`.)

Open the file. Confirm it contains lines with the `[INFO]` or `[DEBUG]` level prefix.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/logger.ts src/main/ipc/logger.ts src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat: phase 2.1 main-process logger with renderer error/warn ipc"
```

---

## Task 4: Store Service + IPC + Preload Bridge

**Files:**

- Create: `src/main/services/store.ts`
- Create: `src/main/ipc/store.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create the store service**

Create `src/main/services/store.ts` with this exact content:

```ts
import Store from 'electron-store'
import type { StoreSchema } from '@shared/types'

const defaults: StoreSchema = {
  windowState: { width: 1280, height: 800, x: null, y: null },
  shortcuts: {}, // 2.2 填默认快捷键
  tray: { closeToTray: true },
  updater: { skipVersion: null, lastCheck: null },
  notifications: { enabled: true }
}

const schema = {
  type: 'object',
  additionalProperties: false, // 根级禁止额外字段（D3 严格性）
  properties: {
    windowState: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: { type: 'number', minimum: 400 },
        height: { type: 'number', minimum: 300 },
        x: { type: ['number', 'null'] },
        y: { type: ['number', 'null'] },
        isMaximized: { type: 'boolean' },
        isFullScreen: { type: 'boolean' }
      },
      required: ['width', 'height']
    },
    shortcuts: { type: 'object', additionalProperties: { type: 'string' } },
    tray: {
      type: 'object',
      additionalProperties: false,
      properties: { closeToTray: { type: 'boolean' } },
      required: ['closeToTray']
    },
    updater: {
      type: 'object',
      additionalProperties: false,
      properties: {
        skipVersion: { type: ['string', 'null'] },
        lastCheck: { type: ['number', 'null'] }
      },
      required: ['skipVersion', 'lastCheck']
    },
    notifications: {
      type: 'object',
      additionalProperties: false,
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled']
    }
  },
  required: ['windowState', 'shortcuts', 'tray', 'updater', 'notifications']
}

export const store = new Store<StoreSchema>({
  name: 'config', // userData/config.json
  defaults,
  schema,
  clearInvalidConfig: true // 破坏时回退 defaults，不抛错
})
```

- [ ] **Step 2: Create the store IPC handler**

Create `src/main/ipc/store.ts` with this exact content:

```ts
import { ipcMain } from 'electron'
import { store } from '@main/services/store'
import type { StoreSchema } from '@shared/types'

/**
 * Store IPC 通道。
 * 类型安全在 preload 层保证（真泛型，调用方传字面量时 TS 推断 K）；
 * 主进程 handler 不写泛型，因为 ipcMain.handle 的签名在编译期丢泛型。
 * 与 Phase 1 secure-store 同模式。
 */
export const STORE_CHANNELS = {
  GET: 'store:get',
  SET: 'store:set',
  DELETE: 'store:delete'
} as const

export function registerStoreIpc(): void {
  ipcMain.handle(STORE_CHANNELS.GET, (_e, key: keyof StoreSchema) => store.get(key))
  ipcMain.handle(STORE_CHANNELS.SET, (_e, key: keyof StoreSchema, value: unknown) => {
    store.set(key, value as StoreSchema[typeof key])
  })
  ipcMain.handle(STORE_CHANNELS.DELETE, (_e, key: keyof StoreSchema) => {
    store.delete(key) // delete 后回到 defaults（electron-store 行为）
  })
}
```

- [ ] **Step 3: Register the store IPC in `registerAllIpc()`**

Replace `src/main/ipc/index.ts` with:

```ts
import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'
import { registerStoreIpc } from './store'

/**
 * 注册所有 IPC handlers。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerAllIpc(): void {
  registerSecureStoreIpc()
  registerHttpIpc()
  registerShellIpc()
  registerLoggerIpc()
  registerStoreIpc()
}
```

- [ ] **Step 4: Expose `store` on `window.api` via preload**

Replace `src/preload/index.ts` with:

```ts
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

const api = {
  secureStore,
  http,
  shell,
  logger,
  store
}

// contextIsolation 始终启用（见 main/index.ts 的 BrowserWindow 配置）
contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 5: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS. Run `pnpm format` then `pnpm fmt` again if the formatter reports diffs.

- [ ] **Step 6: Manual verification — defaults applied and persisted**

Find the userData directory for this app:

- macOS: `~/Library/Application Support/hohu-admin-desktop`
- Windows: `%APPDATA%\hohu-admin-desktop`
- Linux: `~/.config/hohu-admin-desktop`

Delete `config.json` if it exists there.

Run:

```bash
pnpm dev
```

Once the window opens, open DevTools (F12) and run in the Console:

```js
await window.api.store.get('windowState')
```

Expected output (defaults applied, `config.json` created on first read):

```
{width: 1280, height: 800, x: null, y: null}
```

Confirm `config.json` now exists in the userData directory with all 5 top-level keys.

In the same Console, verify write + persistence:

```js
await window.api.store.set('windowState', { width: 1440, height: 900, x: 100, y: 100 })
```

Quit the app (Cmd+Q / window close), then `pnpm dev` again, and in Console:

```js
await window.api.store.get('windowState')
```

Expected: `{width: 1440, height: 900, x: 100, y: 100}` — confirms persistence.

- [ ] **Step 7: Manual verification — schema rejects invalid writes**

In the running app's DevTools Console:

```js
await window.api.store
  .set('windowState', { width: 100, height: 800, x: null, y: null })
  .catch(e => console.error('rejected:', e))
```

Expected behavior: the Promise rejects (electron-store v9 throws a `SchemaValidationError` when ajv validation fails; ipcMain.handle propagates thrown errors as rejected Promises on the renderer side). The renderer's `.catch` should fire and print the rejection. After the call, read back:

```js
await window.api.store.get('windowState')
```

Expected: still `{width: 1440, height: 900, x: 100, y: 100}` (or whatever the last valid value was). The invalid write was rejected, never persisted.

- [ ] **Step 8: Manual verification — clearInvalidConfig recovers from corruption**

Quit the app. Open `config.json` in the userData directory and corrupt it — replace its contents with:

```json
{ "garbage": true, "windowState": { "width": "not a number" } }
```

Save. Run `pnpm dev`. Expected: app starts without throwing; reading `windowState` returns the defaults (electron-store detects schema violation and rewrites with defaults because `clearInvalidConfig: true`).

- [ ] **Step 9: Commit**

```bash
git add src/main/services/store.ts src/main/ipc/store.ts src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat: phase 2.1 typed store with schema validation and defaults"
```

---

## Task 5: Renderer Error Capture

**Files:**

- Modify: `src/renderer/src/main.ts`

- [ ] **Step 1: Add three error listeners to the bootstrap function**

Replace `src/renderer/src/main.ts` with:

```ts
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { router } from './router'
import { permission } from './directives/permission'
import { loadTokens } from './service/token'
import { i18n } from './locales'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())
  app.use(naive)
  app.use(i18n)

  // ⚠️ 在 app.use(router) 之前预热 token，避免守卫首次导航的 IPC 延迟
  await loadTokens()

  app.use(router)
  app.directive('permission', permission)

  // 渲染层未捕获错误 → IPC → 主进程日志文件。
  // 常规 console.* 不进文件；只有这三种来源会触发：
  //   - window 'error'：脚本运行时错误
  //   - window 'unhandledrejection'：未 await 的 Promise 异常
  //   - Vue errorHandler：组件内抛错
  // bootstrap 只在 app.mount() 之前执行一次，HMR 不重跑本文件，因此不会重复注册。
  window.addEventListener('error', event => {
    window.api.logger.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    })
  })

  window.addEventListener('unhandledrejection', event => {
    window.api.logger.error('Unhandled rejection', {
      reason: String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined
    })
  })

  app.config.errorHandler = (err, _instance, info) => {
    window.api.logger.error('Vue error', {
      info,
      stack: err instanceof Error ? err.stack : String(err)
    })
  }

  await router.isReady()
  app.mount('#app')
}

void bootstrap()
```

- [ ] **Step 2: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS.

- [ ] **Step 3: Manual verification — window.onerror reaches the log file**

Run:

```bash
pnpm dev
```

In the running app, open DevTools (F12) and run in the Console:

```js
setTimeout(() => {
  throw new Error('phase 2.1 verification: window onerror')
}, 0)
```

Wait 1 second, then inspect the log file (`~/Library/Logs/hohu-admin-desktop/main.log` on macOS, equivalent elsewhere). Expected: a new line ending in `[ERROR] [renderer] Uncaught error` followed by a JSON object containing `message: "Uncaught Error: phase 2.1 verification: window onerror"` and a stack trace.

- [ ] **Step 4: Manual verification — Vue errorHandler reaches the log file**

To trigger Vue's `app.config.errorHandler` from outside the app source, expose the app instance temporarily. Skip this if you'd rather not modify source — the IPC pipeline is already proven by Step 3, and errorHandler uses the same `window.api.logger.error(...)` call with TS verifying the registration signature in Step 1.

If you want full verification: temporarily edit `src/renderer/src/views/home/index.vue` (or any view that mounts on login), add to its `<script setup>`:

```ts
import { onMounted } from 'vue'
onMounted(() => {
  throw new Error('phase 2.1 verification: vue errorHandler')
})
```

Reload the app (Cmd+R). Inspect the log file. Expected: a `[ERROR] [renderer] Vue error` line with `info: "mounted hook"` and a stack trace. **Revert the edit before commit.**

- [ ] **Step 5: Manual verification — unhandledrejection reaches the log file**

In DevTools Console:

```js
Promise.reject(new Error('phase 2.1 verification: unhandled rejection'))
```

Inspect the log file. Expected: a new `[ERROR] [renderer] Unhandled rejection` line within ~1 second.

- [ ] **Step 6: Manual verification — Phase 1 still works**

Without changing anything, log out and back in (or just navigate the menu if already logged in). Confirm:

- Login flow completes
- Menu items render with icons and translated labels
- Dark mode toggle still works
- Language switch still works

If anything is broken, do NOT commit — re-check Task 5's edits.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/main.ts
git commit -m "feat: phase 2.1 forward renderer errors to main-process log"
```

---

## Final Verification

After all 5 tasks are committed:

- [ ] **Step 1: Full typecheck + lint + format gate**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS with no diff after `pnpm format`.

- [ ] **Step 2: Review the commit log**

Run:

```bash
git log --oneline -6
```

Expected: 5 new commits on top of `66fde7e` (the spec commit), one per task, all Conventional Commits format.

- [ ] **Step 3: Walk the spec's verification checklist**

Re-execute each row of the table in Section 8 of `docs/spec-phase2.1-logging-store.md`:

| Spec verification item                        | Confirmed via |
| --------------------------------------------- | ------------- |
| `pnpm typecheck` / `lint` / `fmt` pass        | Task 5 Step 1 |
| Main process logger writes file               | Task 3 Step 6 |
| Renderer uncaught error reaches file          | Task 5 Step 3 |
| Vue errorHandler triggers                     | Task 5 Step 4 |
| Store defaults applied on first run           | Task 4 Step 6 |
| Store write persists across restarts          | Task 4 Step 6 |
| Schema rejects invalid writes                 | Task 4 Step 7 |
| `clearInvalidConfig` recovers from corruption | Task 4 Step 8 |
| Phase 1 (login, menu, theme, i18n) unaffected | Task 5 Step 5 |

Any failing item → file an issue or fix as a follow-up commit before announcing Phase 2.1 complete.

---

## Notes for the Implementing Agent

- **The pre-commit hook will block `--no-verify` attempts implicitly** — the project's CLAUDE.md forbids it for non-WIP commits anyway. Always let typecheck + lint + fmt run.
- **`pnpm fmt` is a check, `pnpm format` is auto-fix.** The commit hook calls `pnpm fmt` and fails on diff. If `pnpm fmt` reports issues, run `pnpm format`, then re-stage.
- **If the formatter mangles tables in code comments,** that's expected — prettier aligns markdown pipes. Do not hand-fix; trust `pnpm format`.
- **Log file location varies by platform.** When in doubt about userData paths, the log directory is printed in `pnpm dev` startup output (electron-log announces its file path on first write at debug level).
- **Do not skip manual verification steps.** This project has no automated test suite for main-process services; manual verification is the only signal.
