# Phase 2.1 — 日志 + 本地存储

> Phase 2 的第一项，为后续 2.2（窗口/托盘/快捷键）、2.3（自动更新）、2.4（系统通知）铺底。
>
> 两个 main 进程服务：electron-log（日志）+ electron-store（本地存储），各自配一份 IPC 桥和 shared 类型。

## 1. 范围

### 包含

- **主进程 logger 服务**（electron-log 配置 + 文件轮转；dev console 双写，prod 仅文件）
- **主进程 store 服务**（electron-store + JSON Schema + defaults）
- **`logger:write` IPC**（仅 `error`/`warn`，渲染层专用）
- **`store:get/set/delete` IPC**（typed，仿 `secure-store` 模式）
- **渲染层错误捕获**（`window.onerror` / `unhandledrejection` / Vue `errorHandler` → IPC 转发）
- **shared 类型**（`LoggerApi`、`StoreApi`）

### 不包含（YAGNI）

- 不做日志分级配置 UI（开发者自己改 `logger.ts`）
- 不做日志定期清理（electron-log 自带按 size 轮转已足够）
- 不做 store 迁移系统（schema + defaults 覆盖字段新增；重命名/删除视为 breaking change）
- 不动现有 theme/app 的 localStorage（按方案 B，UI 偏好留 localStorage）
- 不暴露 `store.getAll/clear`（用不到，IPC 表面越小越好）
- 不暴露 `logger.info/debug` 给渲染层（避免被滥用为 console）
- **重装行为**：`secure-store.json` 受 OS keychain 加密，卸载重装后旧文件无法解密（key 不同），token 失效，需重新登录；`config.json` 是明文，重装后窗口位置/快捷键等会复用。这是预期，不做特殊处理

## 2. 设计决策

| #   | 决策                                                                                   | 理由                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 渲染层常规日志走 `console`，未捕获错误走 IPC 转发到主进程文件                          | 渲染层大多数日志在 prod 是噪音；只有未捕获错误值得进文件。避免每个 log 都走 IPC，也避免开发者纠结"用 console 还是 logger"                                                                                                     |
| D2  | `logger` IPC 只暴露 `error`/`warn`                                                     | API 表面本身传达"别拿这个当 console 用"                                                                                                                                                                                       |
| D3  | `electron-store` 用严格 JSON Schema + defaults                                         | 类型 + 运行时双保险；老用户升级新版本时新字段自动补 default；防 IPC 被滥用写奇怪字段                                                                                                                                          |
| D4  | Store schema **预留** 2.2/2.3/2.4 全部字段（带 defaults）                              | 后续模块直接 `store.get('windowState')` 即可；新版本加字段对老用户透明                                                                                                                                                        |
| D5  | 现有 theme/app localStorage 不迁                                                       | UI 偏好（darkMode / primaryColor / siderCollapse / locale）web 端也用 localStorage，保持一致便于复用；避免高频读取拖慢 UI 响应                                                                                                |
| D6  | 主进程 logger 只 export 配置好的 `log` 实例（无 scope），调用方各自 `log.scope('xxx')` | 避免双重出口（具名 `logger` + default `log`）造成调用方困惑；scope 命名由各模块自治                                                                                                                                           |
| D7  | `clearInvalidConfig: true`                                                             | config 文件被外部破坏时不抛错，回退 defaults（框架对开发者友好）                                                                                                                                                              |
| D8  | IPC handler 不做泛型约束（`key: keyof StoreSchema, value: unknown`）                   | `ipcMain.handle` 的回调签名 `(event, ...args: any[]) => any` 在编译期丢泛型，运行时拿反序列化值。类型安全只在 **preload 层**保证（调用方传字面量时 TS 推断 K），主进程信任 preload 过来的东西。与 Phase 1 secure-store 同模式 |

## 3. 文件结构

```
src/main/services/
├── logger.ts                # electron-log 配置，default export 配置好的 log 实例
└── store.ts                 # electron-store 实例 + StoreSchema 类型

src/main/ipc/
├── logger.ts                # registerLoggerIpc() — ipcMain.handle('logger:write')
├── store.ts                 # registerStoreIpc() — ipcMain.handle('store:get/set/delete')
└── index.ts                 # ★ 修改：注册新两个 registerXxxIpc()

src/preload/index.ts         # contextBridge 暴露 window.api.logger / window.api.store

src/shared/types.ts          # 新增 LoggerApi、StoreApi、StoreSchema（三进程共用）

src/renderer/src/main.ts     # bootstrap 内新增 3 个错误监听
```

## 4. Logger 服务

### 4.1 主进程（`src/main/services/logger.ts`）

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

**单一 default export**：调用方拿到配置好的 `log` 实例，各自 `log.scope('xxx')`，例如：

```ts
// src/main/services/updater.ts (Phase 2.3)
import log from '@main/services/logger'
const logger = log.scope('updater')

// src/main/index.ts（主入口）
import log from '@main/services/logger'
const logger = log.scope('main')
```

**prod console 关闭方式**：`@electron-toolkit/optimizer` 在 prod 会自动移除 console transport；显式写 `level: false` 让意图明确，不依赖隐式优化。

**轮转：** electron-log 内置按 size 轮转，保留 `main.log` + `main.old.log`。不做定期清理——这是应用层职责，框架不替开发者决定。

### 4.2 IPC（`src/main/ipc/logger.ts`）

```ts
import { ipcMain } from 'electron'
import log from '@main/services/logger'

const rendererLogger = log.scope('renderer')

export function registerLoggerIpc(): void {
  ipcMain.handle('logger:write', (_event, level: 'error' | 'warn', payload: { msg: string; meta?: unknown }) => {
    if (level === 'error') {
      rendererLogger.error(payload.msg, payload.meta ?? '')
    } else {
      rendererLogger.warn(payload.msg, payload.meta ?? '')
    }
  })
}
```

**scope 用 `'renderer'`** 让渲染层错误在日志里一眼可辨。

### 4.3 渲染层错误捕获（`src/renderer/src/main.ts`）

在 bootstrap 末尾、`app.mount()` 之前插入：

```ts
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
```

> Vue 3 的 `errorHandler` 覆盖组件内抛错；`window.onerror` 覆盖其他脚本错误；`unhandledrejection` 覆盖未处理的 Promise。三者互补。
>
> **Listener 注册时机**：bootstrap 只在 `app.mount()` 之前执行一次，`window.addEventListener` 注册的 listener 全局唯一；electron-vite 的 HMR 只覆盖 renderer 视图，不重跑 `main.ts`，因此不会重复注册。Vue 的 `app.config.errorHandler` 同样只在 createApp 后赋值一次。

## 5. Store 服务

### 5.1 Schema 设计

```ts
// src/shared/types.ts 新增
export interface StoreSchema {
  /** 窗口位置/大小（Phase 2.2 用） */
  windowState: {
    width: number
    height: number
    /** 最大化时 x/y 可能为 null */
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
```

> `windowState.x/y` 用 `number | null` 与 JSON Schema 对齐；最大化/最小化时 Electron 可能返回 null，允许此情形。`isMaximized/isFullScreen` 保留 optional，因为 schema 不在 required 里，缺省视为 false。

### 5.2 主进程（`src/main/services/store.ts`）

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

**文件位置：** `userData/config.json`（与 `secure-store.json` 同目录，但明文，仅存非敏感配置）。

### 5.3 IPC（`src/main/ipc/store.ts`）

```ts
import { ipcMain } from 'electron'
import { store } from '@main/services/store'
import type { StoreSchema } from '@shared/types'

export function registerStoreIpc(): void {
  ipcMain.handle('store:get', (_event, key: keyof StoreSchema) => store.get(key))
  ipcMain.handle('store:set', (_event, key: keyof StoreSchema, value: unknown) => {
    // 类型安全在 preload 层保证（真泛型）；主进程信任 preload 过来的东西。
    // 与 Phase 1 secure-store 同模式。
    store.set(key, value as StoreSchema[typeof key])
  })
  ipcMain.handle('store:delete', (_event, key: keyof StoreSchema) => {
    store.delete(key) // delete 后会回到 defaults（electron-store 行为）
  })
}
```

> 注意：`store:delete` 在 electron-store 里等同于"重置为 default"，因为 `defaults` 始终合并。这个语义清晰。
>
> **为什么不在这里写泛型**：`ipcMain.handle` 的回调签名是 `(event, ...args: any[]) => any`，编译期无法保留 `<K>`；运行时更拿不到。让泛型"看起来还在"反而误导阅读者。把类型契约集中到 preload 层（5.4）和 shared 类型里。

### 5.4 渲染层调用形态

```ts
// 读
const windowState = await window.api.store.get('windowState')
// windowState: StoreSchema['windowState']  ← 类型推断

// 写
await window.api.store.set('windowState', { ...windowState, isMaximized: true })

// 重置为 default
await window.api.store.delete('updater')
```

## 6. Preload 暴露

```ts
// src/preload/index.ts
const api = {
  // ...existing: secureStore, http, shell

  logger: {
    error: (msg: string, meta?: unknown) => ipcRenderer.invoke('logger:write', 'error', { msg, meta }),
    warn: (msg: string, meta?: unknown) => ipcRenderer.invoke('logger:write', 'warn', { msg, meta })
  },

  store: {
    get: <K extends keyof StoreSchema>(key: K) => ipcRenderer.invoke('store:get', key) as Promise<StoreSchema[K]>,
    set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) =>
      ipcRenderer.invoke('store:set', key, value) as Promise<void>,
    delete: (key: keyof StoreSchema) => ipcRenderer.invoke('store:delete', key) as Promise<void>
  }
}
```

## 7. Shared 类型扩展

```ts
// src/shared/types.ts

export interface LoggerApi {
  error: (msg: string, meta?: unknown) => Promise<void>
  warn: (msg: string, meta?: unknown) => Promise<void>
}

export interface StoreApi {
  get: <K extends keyof StoreSchema>(key: K) => Promise<StoreSchema[K]>
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => Promise<void>
  delete: (key: keyof StoreSchema) => Promise<void>
}

// AppApi 新增两个字段
export interface AppApi {
  // ...existing
  logger: LoggerApi
  store: StoreApi
}
```

## 8. 验证清单

| 项                           | 通过条件                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` 通过        | node + web 两个 tsconfig 都过                                                                                               |
| `pnpm lint && pnpm fmt` 通过 | pre-commit 不阻塞                                                                                                           |
| 主进程 logger 写文件         | `userData/logs/main.log` 出现 `[INFO] [main] ...` 开头的行                                                                  |
| 渲染层未捕获错误进文件       | console 故意抛 `throw new Error('test')` → 日志文件出现 `[ERROR] [renderer] Uncaught error`                                 |
| Vue errorHandler 触发        | 在组件里 `throw new Error('vue-test')` → 日志文件出现 `[ERROR] [renderer] Vue error`                                        |
| store 默认值生效             | 删 `userData/config.json` 重启 → `await window.api.store.get('windowState')` 返回 `{width:1280,...}`                        |
| store 写入持久化             | `set('windowState', { width: 1440, height: 900, x: null, y: null })` 重启后仍能读到 1440                                    |
| schema 拒绝非法写入          | 在 `app.whenReady()` 后临时打一行 `store.set('windowState', { width: 10 } as never)` 触发 SchemaValidationError，验证后删除 |
| `clearInvalidConfig` 生效    | 手动把 config.json 改坏 → 启动不崩，回退 defaults                                                                           |
| 不影响 Phase 1 功能          | 登录、菜单、主题、i18n 全部正常                                                                                             |

## 9. 实现顺序建议

1. `pnpm add electron-log electron-store` + 类型依赖
   - **electron-store v9+ 是纯 ESM**，项目 tsconfig.node.json 已是 `module: ESNext` + electron-vite 处理，预期可直接 import；若 typecheck 报 import 问题，先确认 `electron-vite` 把 main 进程打到 ESM 而非 CJS（看 `build.rollupOptions.output.format`）
2. `src/shared/types.ts` 加 `StoreSchema` / `LoggerApi` / `StoreApi`，扩 `AppApi`
3. `src/main/services/logger.ts` + `src/main/services/store.ts`
4. `src/main/ipc/logger.ts` + `src/main/ipc/store.ts`，**修改 `src/main/ipc/index.ts`** 在 `registerAllIpc()` 里加 `registerLoggerIpc()` + `registerStoreIpc()`
5. `src/preload/index.ts` 暴露 `logger` / `store`
6. `src/renderer/src/main.ts` 加错误监听
7. `pnpm typecheck && pnpm lint && pnpm fmt`
8. 手动跑验证清单

## 10. 后续依赖（不属于本 spec）

| 后续模块         | 用到本 spec 的什么                                          |
| ---------------- | ----------------------------------------------------------- |
| Phase 2.2 窗口   | `store.get('windowState')` 持久化位置/大小                  |
| Phase 2.2 快捷键 | `store.get('shortcuts')` 读用户自定义快捷键                 |
| Phase 2.2 托盘   | `store.get('tray').closeToTray` 决定关闭行为                |
| Phase 2.3 更新   | `store.get('updater').skipVersion`、`logger` 记录更新事件   |
| Phase 2.4 通知   | `store.get('notifications').enabled`、`logger` 记录通知失败 |
