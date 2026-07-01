# Phase 2.4 — 系统通知分发器（Notification Dispatcher）

> **状态**：设计稿（待 review）｜ **关联**：[plan-phase2.4-notification-dispatcher.md](./plan-phase2.4-notification-dispatcher.md)（待写）

## 1. 范围

### 1.1 包含

- **`NotificationManager` 单例**：主进程发系统通知的唯一入口，封装 Electron `Notification` API
- **统一 IPC 表面**：渲染层通过 `window.api.notification.show(payload)` 推送系统通知（web 做不到的桌面差异化）
- **全局静音开关**：复用 `store.notifications.enabled`，一处关闭所有 source 的系统通知
- **`UpdaterManager.notify()` 重构**：把现有 `new Notification()` ad-hoc 调用收敛到 dispatcher
- **action 钩子**：payload 支持 `actionId`，主进程维护 handler map，默认行为是聚焦主窗口

### 1.2 不包含（YAGNI / 后续 phase）

- **通知历史 / 通知中心 / 持久化** —— 系统通知中心本身就有历史（macOS Notification Center / Windows Action Center），框架不必重复造
- **自定义 action buttons**（Reply / Snooze 等）—— Electron 跨平台支持不一致（macOS 需 extras，Linux 不支持），先不做
- **分类静音**（per-category mute）—— `category` 字段今天只作日志标签；将来需要再加 `mutedCategories: Set`
- **后端推送通知** —— hohu-admin 后端目前没有通知模块，等后端落地后单独立项做 `BackendNotificationConsumer`（Phase 2.5 或更后）
- **声音 / 自定义 icon / urgency 等级** —— 用系统默认
- **dedup / 限频** —— 业务层自己判断；今天没有高频场景
- **设置页 UI** —— IPC 全暴露，UI 留 Phase 3 统一做

### 1.3 与 Phase 2.3 的关系

Phase 2.3 的 `UpdaterManager.notify()` 直接 `new Notification()`。Phase 2.4 落地后，这行代码改成 `notificationManager.show({ source: 'system', category: 'updater', ... })`，由 dispatcher 统一处理 mute / 日志 / 点击聚焦。

## 2. 关键决策

| ID  | 决策                                                                                        | 理由                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **唯一入口模式**：所有 `new Notification()` 调用必须经 `NotificationManager.show()`         | 一处检查 `enabled`、一处打日志、一处改行为。未来加分类静音 / dedup 也只改一个文件                                                                                                                  |
| D2  | **预定义 `source` 枚举**：`'system' \| 'renderer' \| 'backend'`                             | 今天只用 system（updater 等 main-进程自发）和 renderer（渲染层 IPC 推）。backend 写进类型里但今天没人用 —— 零成本的前瞻性，让未来 Phase 2.5 加 backend 拉取消费者时是「新增 source」而非「改架构」 |
| D3  | **预定义 `category` 枚举**：`'updater' \| 'ai' \| 'download' \| 'alert' \| 'general'`       | 今天只作日志标签和未来分类静音的 key。渲染层传任意值不报错（type 约束，运行时不强制）                                                                                                              |
| D4  | **点击默认聚焦主窗口**，`actionId` 可选覆盖                                                 | 用户点通知的预期就是「打开 app」。具体 action（如「打开设置页」）由业务模块在启动时 `registerAction(id, fn)` 注册，零成本预留                                                                      |
| D5  | **复用 `store.notifications.enabled`**（已存在）                                            | 不加新字段；`setEnabled` IPC 直接改这个值，渲染层将来在设置页用                                                                                                                                    |
| D6  | **manager 不需要 `init()`**                                                                 | 与 updater/window/tray 不同，dispatcher 是纯被动的（show on demand），没有事件流要 wire、没有后台任务。模块加载时构造即可                                                                          |
| D7  | **`Notification.isSupported() === false` 时 manager 静默 no-op**                            | Linux 无 libnotify 等环境，构造时打一次 warn，之后 show 调用直接 return。不抛错，让上层代码无需判断                                                                                                |
| D8  | **macOS 首次权限弹窗由系统触发**，不主动调 deprecated 的 `Notification.requestPermission()` | Electron 5+ 后 `requestPermission` 已废弃且无操作；系统会在第一次 `new Notification()` 时自己弹权限请求。用户拒绝 → 后续 `show` 静默失败（系统层处理）                                             |
| D9  | **不持久化通知历史**                                                                        | 系统通知中心（macOS Notification Center / Windows Action Center / Linux 桌面环境）已经有历史。框架再存一份是重复且容易过期不一致                                                                   |
| D10 | **`actionId` 未注册 handler 时回退到聚焦窗口 + 打 warn**                                    | 比 throw 更稳：通知点击是用户可见行为，永远不应该让 app 崩                                                                                                                                         |
| D11 | **`activeNotifications: Set<Notification>` 持强引用**，`close` / `failed` 事件触发时移除    | Notification 是 native 对象的 JS wrapper；V8 GC 在用户点击前回收 wrapper 会让 click handler 不触发甚至崩溃。Phase 2.3 单调用点平台 luck-through，但 dispatcher 是中心路径，流量更大必须显式持引用  |
| D12 | **`Notification.isSupported()` 在模块加载时调（早于 `app.whenReady`）是安全的**             | 这是 Electron 的 static 平台检查（不依赖 app runtime），docs 明示。`new Notification()` 只在 `show()` 内调，而 `show()` 总在 ready 之后（IPC 或 updater.init 触发）                                |

## 3. 文件结构

```
src/main/services/
├── notification.ts            # NotificationManager 单例（新增）
└── updater.ts                 # 修改：notify() 改调 notificationManager.show({...})

src/main/ipc/
├── notification.ts            # registerNotificationIpc() — 2 handler（新增）
└── index.ts                   # 修改：registerAllIpc() 加 registerNotificationIpc()

src/preload/index.ts           # 暴露 window.api.notification.{show, setEnabled}

src/preload/index.d.ts         # 不动（generic via AppApi，新加的 notification 字段自动 propagate）

src/shared/types.ts            # NotifyPayload / NotificationSource / NotificationCategory / NotificationApi；
                              # AppApi 加 notification: NotificationApi

src/main/index.ts              # 不动（manager 在模块加载时构造，无 init 调用 —— 详见 D6/D12）
```

**不动文件说明**：

- `src/main/services/store.ts` —— `notifications: { enabled }` 已存在，schema 已 OK，不改
- `src/main/services/window.ts` —— 复用现有 `windowManager`，不改

## 4. NotificationManager 实现（`src/main/services/notification.ts`）

```ts
import { Notification } from 'electron'
import type { NotifyPayload, NotificationCategory, NotificationSource } from '@shared/types'
import { windowManager } from './window'
import { store } from './store'
import log from './logger'

const logger = log.scope('notification')

type ActionHandler = () => void
/** 业务模块（Phase 3+）启动时注册：notificationManager.registerAction('open:settings', () => ...) */
const actionHandlers = new Map<string, ActionHandler>()

class NotificationManagerClass {
  private supported: boolean
  /**
   * 持有所有「在飞」的 Notification 强引用，防止 V8 GC 在通知被点击 / 关闭前回收
   * JS wrapper（某些平台会导致 click handler 不触发或崩溃）。
   * close / failed 事件触发时从 set 移除。
   */
  private activeNotifications = new Set<Notification>()

  constructor() {
    this.supported = Notification.isSupported()
    if (!this.supported) {
      logger.warn('system notifications not supported on this platform, will no-op')
    }
  }

  /** 主入口：发系统通知。受 notifications.enabled mute。 */
  show(payload: NotifyPayload): void {
    if (!this.supported) return
    if (!store.get('notifications').enabled) {
      logger.debug(
        `muted (notifications.enabled=false): [${payload.source}/${payload.category ?? 'general'}] ${payload.title}`
      )
      return
    }

    const n = new Notification({
      title: payload.title,
      body: payload.body
      // 不设 urgency / silent / icon —— 走系统默认；silent 默认 false（与 Phase 2.3 updater 行为一致），其余跨平台支持差异大
    })

    // 持引用直到通知关闭，防止 GC 吞掉 click handler
    this.activeNotifications.add(n)
    const release = (): void => {
      this.activeNotifications.delete(n)
    }
    n.on('click', () => this.handleClick(payload.actionId))
    n.once('close', release)
    n.once('failed', release)
    n.show()

    logger.info(`[${payload.source}/${payload.category ?? 'general'}] ${payload.title}: ${payload.body}`)
  }

  /** 设置页调（Phase 3 UI 阶段）；今天 IPC 暴露但 UI 未做 */
  setEnabled(enabled: boolean): void {
    store.set('notifications', { ...store.get('notifications'), enabled })
    logger.info(`notifications ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * 注册点击 action handler（业务模块启动时调一次）。
   * 返回反注册函数。
   * 今天框架自己不注册任何 action；留给 Phase 3 业务层。
   */
  registerAction(id: string, handler: ActionHandler): () => void {
    if (actionHandlers.has(id)) {
      logger.warn(`actionId "${id}" already registered, overwriting`)
    }
    actionHandlers.set(id, handler)
    return () => {
      actionHandlers.delete(id)
    }
  }

  private handleClick(actionId?: string): void {
    if (!actionId) {
      this.focusMainWindow()
      return
    }
    const handler = actionHandlers.get(actionId)
    if (!handler) {
      logger.warn(`no handler for actionId="${actionId}", falling back to focus window`)
      this.focusMainWindow()
      return
    }
    try {
      handler()
    } catch (err) {
      logger.error(`action handler "${actionId}" threw`, String(err))
      // 即使 handler 抛错也回退聚焦，保证用户感知一致
      this.focusMainWindow()
    }
  }

  private focusMainWindow(): void {
    const win = windowManager.getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

export const notificationManager = new NotificationManagerClass()
```

> **说明**：`windowManager.getMainWindow()` 已在 Phase 2.2 实现，返回 `BrowserWindow | null`（destroyed 时返回 null），与上面的 null 检查匹配。

## 5. 类型定义（`src/shared/types.ts` 追加）

```ts
/** 通知来源：预留 backend，今天只用 system + renderer */
export type NotificationSource = 'system' | 'renderer' | 'backend'

/** 通知分类：今天只作日志标签和未来分类静音的 key；运行时不强制枚举 */
export type NotificationCategory = 'updater' | 'ai' | 'download' | 'alert' | 'general'

export interface NotifyPayload {
  source: NotificationSource
  /** 不传 = 'general' */
  category?: NotificationCategory
  title: string
  body: string
  /**
   * 点击通知的回调 ID（可选）。
   * 不传 = 默认聚焦主窗口；
   * 传了但未注册 handler = warn + 回退聚焦主窗口；
   * 业务模块用 notificationManager.registerAction(id, fn) 注册具体回调。
   */
  actionId?: string
}

export interface NotificationApi {
  /** 推系统通知（受 notifications.enabled 全局 mute） */
  show: (payload: NotifyPayload) => Promise<void>
  /** 改 store.notifications.enabled（设置页用，今天无 UI） */
  setEnabled: (enabled: boolean) => Promise<void>
}
```

`AppApi` 加 `notification: NotificationApi`。

## 6. IPC（`src/main/ipc/notification.ts`）

```ts
import { ipcMain } from 'electron'
import type { NotifyPayload } from '@shared/types'
import { notificationManager } from '../services/notification'

/**
 * Notification IPC：
 * - show：渲染层推系统通知
 * - setEnabled：改全局 mute 开关
 */
export function registerNotificationIpc(): void {
  ipcMain.handle('notification:show', async (_e, payload: NotifyPayload) => {
    notificationManager.show(payload)
  })

  ipcMain.handle('notification:setEnabled', async (_e, enabled: boolean) => {
    notificationManager.setEnabled(enabled)
  })
}
```

`src/main/ipc/index.ts` 的 `registerAllIpc()` 加 `registerNotificationIpc()`。

## 7. Preload 桥（`src/preload/index.ts` 追加）

```ts
import type { NotifyPayload } from '@shared/types'

/**
 * Notification 桥：渲染层推系统通知（web 做不到的桌面差异化）。
 * 受主进程 store.notifications.enabled 全局 mute。
 */
const notification = {
  show: (payload: NotifyPayload): Promise<void> => ipcRenderer.invoke('notification:show', payload),
  setEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('notification:setEnabled', enabled)
} as const
```

`api` 对象加 `notification`。

## 8. UpdaterManager 改造（`src/main/services/updater.ts`）

替换 `updater.ts:213-222` 的 `notify()` 方法体（这是 Phase 2.3 写入的实际代码，不是简化版）：

**改前**（当前 `updater.ts:213-222`）：

```ts
private notify(version: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: app.name,
    body: `v${version} ready — restart to apply`,
    silent: false
  })
  n.on('click', () => this.install())
  n.show()
}
```

**改后**：

```ts
private notify(version: string): void {
  // actionId 暂不传 —— 默认行为是聚焦主窗口。
  // Phase 3 加 Restart UI 后，下面 registerAction 一行取消注释即可恢复「点通知立刻装」：
  //   notificationManager.registerAction('updater:install', () => this.install())
  //   然后 payload 加 actionId: 'updater:install'
  notificationManager.show({
    source: 'system',
    category: 'updater',
    title: app.name,
    body: `v${version} ready — restart to apply`
  })
}
```

**注意**：Phase 2.3 的 `n.on('click', () => this.install())` 直接调 install；改造后点击只是聚焦窗口（默认 action）。理由：

1. 用户可能在看别的东西，强制退出安装太粗暴
2. Phase 3 加「Restart Now」按钮 UI 后，`registerAction('updater:install', () => this.install())` 一行即可恢复原行为（`updaterManager.install` 是 public 方法）
3. 系统通知点击的预期是「打开 app」，不是「立刻退出」

> 这是 Phase 2.3 行为的轻微回退（从「点通知立刻装」变成「点通知聚焦窗口」）。记录在 Common Pitfalls 里。

**import 改**（updater.ts 第 1 行）：

```ts
// 改前
import { app, Notification } from 'electron'
// 改后（去掉 Notification，保留 app）
import { app } from 'electron'
```

并在 updater.ts 的 import 块里加：

```ts
import { notificationManager } from './notification'
```

## 9. main/index.ts

**不动**。`notificationManager` 在 `services/notification.ts` 模块加载时构造（`export const notificationManager = new ...`），不需要在 `app.whenReady()` 里调 `init()`。

`registerAllIpc()`（在 `app.whenReady` 里调）会触发 `registerNotificationIpc()`，那是 IPC 注册时机，跟 manager 构造无关。

## 10. 验收清单

- [ ] `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test` 通过
  - Phase 2.4 不新增 unit test（manager 全是副作用，无法脱离 Electron runtime 测试；现有 2.3 的 `shouldCheckNow` / `isSkipped` 测试应继续通过）
- [ ] `pnpm dev` 启动后无 notification 相关错误
- [ ] 渲染层调 `window.api.notification.show({ source: 'renderer', title: 'Test', body: 'Hello' })` 弹出系统通知（**manual** —— CI 无桌面环境）
- [ ] 关 `window.api.notification.setEnabled(false)` 后再 show，通知不弹（日志可见 `muted` debug）
- [ ] 托盘「Check for Updates...」流程（如果有可用更新）走的是 dispatcher（日志 `[notification] [system/updater]`）
- [ ] 点击通知 → 主窗口聚焦（如果最小化则 restore + show）（**manual**）
- [ ] `UpdaterManager.notify()` 不再直接 `new Notification()`（grep 验证）
- [ ] `CLAUDE.md` / `framework-design.md` 同步更新

## 11. Common Pitfalls（写进 CLAUDE.md）

15. **通知点击从「立刻装」改成「聚焦窗口」** —— Phase 2.3 的 updater 通知点 click 直接 `quitAndInstall()`；Phase 2.4 收敛到 dispatcher 后默认行为是聚焦主窗口。Phase 3 加 Restart UI 后通过 `registerAction('updater:install', ...)` 恢复「一键装」体验。在那之前，用户点 updater 通知只会看到主窗口（按 Phase 2.3 设计应当有一个可见的 Restart 按钮触发 install，但 Phase 3 UI 还没做，目前只触发 IPC 事件）。

16. **macOS 首次启动会弹权限请求** —— 第一次 `new Notification()` 时系统弹「允许 hohu-admin-desktop 发送通知」。用户拒绝后所有 `show` 静默失败（系统层处理，框架不感知）。开发者测试时如果通知不弹，先检查「系统设置 → 通知 → hohu-admin-desktop」是否被关。

17. **`Notification.isSupported()` 在某些 Linux 容器/无桌面环境返回 false** —— 框架启动时打一次 warn，之后 show 调用静默 return。Linux CI / Docker 测试环境遇到这条 warn 是预期，不是 bug。

18. **`notificationManager` 不需要 `init()`** —— 与 window/tray/shortcut/updater 不同，dispatcher 是纯被动模块。构造在模块加载时完成（`export const ... = new ...`），不需要在 `app.whenReady` 里调任何方法。这是有意设计（D6），不是漏写。

19. **`Notification` 必须由 manager 持强引用** —— dispatcher 流量比单调用点大，V8 GC 在用户点击前回收 Notification wrapper 会让 click handler 不触发。manager 内部用 `activeNotifications: Set<Notification>` 持引用，`close` / `failed` 事件触发时移除。直接 `new Notification()` 不入 set 是错的（D11）。
