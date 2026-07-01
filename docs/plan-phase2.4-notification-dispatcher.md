# Phase 2.4 — 系统通知分发器（Notification Dispatcher）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a centralized `NotificationManager` singleton that wraps Electron's `Notification` API as the single entry point for system notifications, with IPC exposure so the renderer can push desktop notifications (something the web app cannot do), and refactor Phase 2.3's ad-hoc `new Notification()` call in updater.ts to route through the dispatcher.

**Architecture:** One new main-process service (`NotificationManager`) + one IPC module (2 handlers: `notification:show` / `notification:setEnabled`) + preload bridge. The manager is constructed at module-load time (no `init()` needed — unlike window/tray/updater it's purely reactive). All sources (`'system'` / `'renderer'` / `'backend'`) flow through one `show()` method that gates on `store.notifications.enabled`, retains Notification references to dodge GC, and routes click events through an action-handler map (default behavior: focus main window).

**Tech Stack:** Electron `Notification` / electron-log / electron-store.

**Spec:** `docs/spec-phase2.4-notification-dispatcher.md`

**Project conventions (override skill defaults):**

- **Test runner:** `node --test --import tsx` (set up in Phase 2.3). **Phase 2.4 adds NO new unit tests** — the manager is all side-effects (Electron `Notification` can't be instantiated outside Electron runtime). Existing Phase 2.3 tests for `shouldCheckNow` / `isSkipped` must continue to pass.
- **Commit style:** Conventional Commits, lowercase, one line — e.g. `feat: phase 2.4 notification manager with mute and gc retention`. Pre-commit hook runs typecheck + lint + fmt; do NOT use `--no-verify`.
- **Pre-commit failure on format:** run `pnpm format` then re-stage. Do NOT skip hooks.
- **HMR caveat:** Restart `pnpm dev` after editing `electron.vite.config.ts`, `tsconfig.*.json`, `.env*`, or anything under `src/main/` or `src/preload/`. HMR only covers renderer.
- **`preload/index.d.ts` is generic** — it imports `AppApi` from `@shared/types`. Adding `notification: NotificationApi` to `AppApi` auto-propagates; no edit to the d.ts file itself needed.
- **`main/index.ts` does NOT change** — `notificationManager` is constructed at module load (`export const notificationManager = new ...`), and `registerAllIpc()` (already called from main/index.ts) picks up the new IPC module via `ipc/index.ts`. See spec D6/D12.
- **CJS/ESM interop:** `electron` is fine for named imports in this project. `Notification` is from `electron` (first-party). No CJS interop concern for this phase.

---

## File Structure

| File                                | Status | Responsibility                                                                                           |
| ----------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`               | Modify | Add `NotificationSource` / `NotificationCategory` / `NotifyPayload` / `NotificationApi`; extend `AppApi` |
| `src/main/services/notification.ts` | Create | `NotificationManager` singleton with GC-retention Set + action handler map                               |
| `src/main/ipc/notification.ts`      | Create | `registerNotificationIpc()` — 2 handlers (`notification:show` / `notification:setEnabled`)               |
| `src/main/ipc/index.ts`             | Modify | Call `registerNotificationIpc()` in `registerAllIpc()`                                                   |
| `src/preload/index.ts`              | Modify | Expose `window.api.notification.{show, setEnabled}`                                                      |
| `src/main/services/updater.ts`      | Modify | Refactor `notify()` to call `notificationManager.show({...})`; drop `Notification` import                |
| `CLAUDE.md`                         | Modify | Append Common Pitfalls #15–#19                                                                           |
| `docs/framework-design.md`          | Modify | Flip Phase 2.4 checklist item to ✅; add §6.5 notification dispatcher architecture                       |

**Files NOT touched (per spec):**

- `src/main/index.ts` — no `init()` call needed (D6)
- `src/main/services/store.ts` — `notifications: { enabled }` schema already exists from Phase 2.1
- `src/main/services/window.ts` — reuses existing `windowManager.getMainWindow()`
- `src/preload/index.d.ts` — generic via `AppApi` auto-propagation
- No new test files (manager is side-effects only)

---

## Task 1: Extend Shared Types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add Notification types and extend AppApi**

Open `src/shared/types.ts`. The current end of file (around lines 137–159) looks like:

```ts
export interface UpdaterApi {
  // ... existing fields ...
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
```

INSERT the four new notification types BETWEEN `UpdaterApi` and `AppApi`:

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

THEN extend `AppApi` to add `notification: NotificationApi`:

```ts
export interface AppApi {
  secureStore: SecureStoreApi
  http: HttpApi
  shell: ShellApi
  logger: LoggerApi
  store: StoreApi
  theme: ThemeApi
  shortcuts: ShortcutsApi
  updater: UpdaterApi
  notification: NotificationApi
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS. The new types are pure declarations; `AppApi` consumers (preload `api` literal) will typecheck because the new `notification` field isn't yet provided at runtime — but `as const` defers this check. Verify clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: phase 2.4 shared types for notification ipc"
```

---

## Task 2: NotificationManager Service

**Files:**

- Create: `src/main/services/notification.ts`

- [ ] **Step 1: Create the NotificationManager service**

Create `src/main/services/notification.ts` with this EXACT content:

```ts
import { Notification } from 'electron'
import type { NotifyPayload } from '@shared/types'
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

**Notes on the design (read before implementing if anything looks unclear):**

- `Notification.isSupported()` at module-load (before `app.whenReady`) is safe — Electron docs say it's a static platform check. See spec D12.
- `activeNotifications: Set<Notification>` is the GC-retention fix (spec D11). Without this, V8 may GC the wrapper before the user clicks, swallowing the handler.
- `actionHandlers` is a module-level Map (not a class field) intentionally — it makes `registerAction` return a stable identity for the unsubscribe closure. The class still owns access via methods.
- `n.once('close', release)` and `n.once('failed', release)` use `once` (not `on`) — these events fire at most once per notification.

- [ ] **Step 2: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

If `pnpm fmt` fails (formatter wants changes), run `pnpm format` then re-stage with `git add`. Do NOT use `--no-verify`.

**Expected typecheck pass notes:**

- `Notification` from `electron` is fine for named imports (first-party, ESM-compatible in this project)
- `windowManager.getMainWindow()` returns `BrowserWindow | null` (verified in Phase 2.2). The null check matches.

- [ ] **Step 3: Commit**

```bash
git add src/main/services/notification.ts
git commit -m "feat: phase 2.4 notification manager with mute and gc retention"
```

---

## Task 3: IPC Handlers

**Files:**

- Create: `src/main/ipc/notification.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Create the IPC handler module**

Create `src/main/ipc/notification.ts`:

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

- [ ] **Step 2: Register in `src/main/ipc/index.ts`**

Open `src/main/ipc/index.ts`. Current state:

```ts
import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'
import { registerStoreIpc } from './store'
import { registerThemeIpc } from './theme'
import { registerShortcutIpc } from './shortcut'
import { registerUpdaterIpc } from './updater'

export function registerAllIpc(): void {
  registerSecureStoreIpc()
  registerHttpIpc()
  registerShellIpc()
  registerLoggerIpc()
  registerStoreIpc()
  registerThemeIpc()
  registerShortcutIpc()
  registerUpdaterIpc()
}
```

Add the import (after `registerUpdaterIpc`):

```ts
import { registerUpdaterIpc } from './updater'
import { registerNotificationIpc } from './notification'
```

And add the call inside `registerAllIpc()` (after `registerUpdaterIpc()`):

```ts
  registerUpdaterIpc()
  registerNotificationIpc()
}
```

- [ ] **Step 3: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

If `pnpm fmt` fails, run `pnpm format` then re-stage.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/notification.ts src/main/ipc/index.ts
git commit -m "feat: phase 2.4 notification ipc handlers"
```

---

## Task 4: Preload Bridge

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add notification to preload api**

Open `src/preload/index.ts`. The current type import (line 2) is:

```ts
import type { HttpConfig, HttpResponse, StoreSchema, UpdaterEvent, UpdaterStatus } from '@shared/types'
```

EXTEND it to include `NotifyPayload`:

```ts
import type { HttpConfig, HttpResponse, StoreSchema, UpdaterEvent, UpdaterStatus, NotifyPayload } from '@shared/types'
```

Then add the `notification` bridge object AFTER the existing `updater` const block (before `const api = {`):

```ts
/**
 * Notification 桥：渲染层推系统通知（web 做不到的桌面差异化）。
 * 受主进程 store.notifications.enabled 全局 mute。
 */
const notification = {
  show: (payload: NotifyPayload): Promise<void> => ipcRenderer.invoke('notification:show', payload),
  setEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('notification:setEnabled', enabled)
} as const
```

Then extend the `api` object literal to include `notification`:

```ts
const api = {
  secureStore,
  http,
  shell,
  logger,
  store,
  theme,
  shortcuts,
  updater,
  notification
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS. The `as const` on `notification` structurally satisfies `NotificationApi`. `window.api.notification` is now typed via `AppApi`.

Note: As in Phase 2.3 Task 4, do NOT import `NotificationApi` itself — the `as const` + structural match against `AppApi['notification']` enforces the contract without the explicit import (matches the style of the other 8 bridges).

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: phase 2.4 notification bridge in preload"
```

---

## Task 5: Updater Refactor (Route notify() through Dispatcher)

**Files:**

- Modify: `src/main/services/updater.ts`

This task changes the existing `notify()` method (Phase 2.3 implementation) to delegate to the new NotificationManager. The click behavior changes from "immediate install" to "focus window" — documented in spec Section 8 and Pitfall #15.

- [ ] **Step 1: Update imports in `updater.ts`**

Open `src/main/services/updater.ts`. Current line 1:

```ts
import { app, Notification } from 'electron'
```

CHANGE to (remove `Notification`, keep `app`):

```ts
import { app } from 'electron'
```

Then in the import block, find the `logger` import (line 9):

```ts
import log from './logger'
```

ADD a new import after it:

```ts
import log from './logger'
import { notificationManager } from './notification'
```

- [ ] **Step 2: Replace the `notify()` method body**

Find the `notify()` method (currently at lines 213–222):

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

REPLACE the entire method with:

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

- [ ] **Step 3: Verify no stray `Notification` references**

```bash
grep -n "Notification" src/main/services/updater.ts
```

Expected: NO matches. The `Notification` import is gone, and the method no longer references it. If you see any remaining `Notification` token, remove it (likely a missed reference).

- [ ] **Step 4: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

If `pnpm fmt` fails, run `pnpm format` then re-stage.

**Expected typecheck pass notes:**

- `app` is still used in `notify()` (for `app.name`), so the import isn't unused
- `notificationManager` is now used in `notify()`, so its import isn't unused
- All other `updater.ts` logic (CancellationToken, etc.) is untouched

- [ ] **Step 5: Commit**

```bash
git add src/main/services/updater.ts
git commit -m "refactor: phase 2.4 updater notify via notification dispatcher"
```

---

## Task 6: Documentation Backfill

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/framework-design.md`

- [ ] **Step 1: Append Common Pitfalls #15–#19 to `CLAUDE.md`**

Open `CLAUDE.md`. Find the "Common Pitfalls" section. After Phase 2.3's pitfall #14 (the CJS interop one), append:

```markdown
15. **通知点击从「立刻装」改成「聚焦窗口」** — Phase 2.3 的 updater 通知点 click 直接 `quitAndInstall()`；Phase 2.4 收敛到 dispatcher 后默认行为是聚焦主窗口。Phase 3 加 Restart UI 后通过 `notificationManager.registerAction('updater:install', () => updaterManager.install())` 一行即可恢复「一键装」体验（`updaterManager.install` 是 public）。

16. **macOS 首次启动会弹通知权限请求** — 第一次 `new Notification()` 时系统弹「允许 hohu-admin-desktop 发送通知」。用户拒绝后所有 `show` 静默失败（系统层处理，框架不感知）。开发者测试时如果通知不弹，先检查「系统设置 → 通知 → hohu-admin-desktop」是否被关。

17. **`Notification.isSupported()` 在某些 Linux 容器 / 无桌面环境返回 false** — 框架启动时打一次 warn，之后 show 调用静默 return。Linux CI / Docker 测试环境遇到这条 warn 是预期，不是 bug。

18. **`notificationManager` 不需要 `init()`** — 与 window/tray/shortcut/updater 不同，dispatcher 是纯被动模块。构造在模块加载时完成（`export const ... = new ...`），不需要在 `app.whenReady` 里调任何方法。这是有意设计（D6），不是漏写。

19. **`Notification` 必须由 manager 持强引用** — dispatcher 流量比单调用点大，V8 GC 在用户点击前回收 Notification wrapper 会让 click handler 不触发。manager 内部用 `activeNotifications: Set<Notification>` 持引用，`close` / `failed` 事件触发时移除。直接 `new Notification()` 不入 set 是错的（D11）。
```

- [ ] **Step 2: Update Phase 2 checklist item in `docs/framework-design.md`**

Open `docs/framework-design.md`. Find the Phase 2 checklist (around line 388). Change:

```
- [ ] 系统通知分发器
```

to:

```
- [x] **系统通知分发器** —— 详见 `docs/spec-phase2.4-notification-dispatcher.md`
```

- [ ] **Step 3: Add §6.5 section to `docs/framework-design.md`**

Find the end of §6.4 (the auto-update section, ends around line 382 with `---`). The structure is:

```
### 6.4 自动更新（已实现）
... (existing content) ...

---

### Phase 2 — 让框架"有桌面感"（差异化）
```

INSERT a new §6.5 section BETWEEN the `---` that closes §6.4 and the `### Phase 2` header:

```markdown
### 6.5 系统通知分发器（已实现）

#### 架构：NotificationManager 单例
```

src/main/services/notification.ts # NotificationManager（Notification 封装 + GC 持引用 + action handler map）
src/main/ipc/notification.ts # 2 invoke handler: show / setEnabled
src/preload/index.ts # window.api.notification.{show, setEnabled}

```

#### 核心策略

- **唯一入口**：所有 `new Notification()` 调用必须经 `notificationManager.show(payload)` —— 一处检查 `enabled`、一处打日志、一处改行为
- **全局 mute**：复用 `store.notifications.enabled`；false 时所有 source 都被丢弃（含 updater 的「下载完成」）
- **GC 持引用**：`activeNotifications: Set<Notification>` 持强引用，`close` / `failed` 事件触发时移除 —— 防止 V8 GC 在用户点击前回收 wrapper 吞掉 handler
- **action 钩子**：`payload.actionId` 可选；不传 = 默认聚焦主窗口，传了未注册 = warn + 回退聚焦。业务模块（Phase 3+）启动时 `notificationManager.registerAction(id, fn)` 注册
- **跨平台兜底**：`Notification.isSupported() === false`（Linux 无 libnotify 等）时 manager 静默 no-op

#### Source 模型（前瞻性预留）

| Source   | 今天 | 未来                                                                 |
| -------- | ---- | -------------------------------------------------------------------- |
| system   | ✅   | updater 等主进程自发                                                 |
| renderer | ✅   | 渲染层 IPC 推（web 做不到的桌面差异化）                              |
| backend  | ❌   | 预留：hohu-admin 后端通知模块落地后，加 `BackendNotificationConsumer` |

backend 写进类型但今天无消费者；Phase 2.5（如果发生）加 backend 拉取（SSE / 轮询）时是「新增 source」而非「改架构」。

#### Phase 2.3 行为回退

Phase 2.3 updater 通知点击 = 立刻 `quitAndInstall()`；Phase 2.4 改为聚焦主窗口（更符合用户对「点通知」的预期）。Phase 3 加 Restart UI 后通过 `registerAction('updater:install', () => updaterManager.install())` 一行恢复原行为。

#### 未做（YAGNI）

- 通知历史 / 通知中心 —— 系统通知中心已有
- 自定义 action buttons（Reply / Snooze）—— Electron 跨平台支持不一致
- 分类静音、dedup、限频、声音、icon —— 用系统默认
- 设置页 UI —— IPC 已暴露，UI 留 Phase 3

---
```

- [ ] **Step 4: Lint + format (docs only, no typecheck needed)**

```bash
pnpm lint && pnpm fmt
```

If `pnpm fmt` fails on markdown, run `pnpm format` then re-stage.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/framework-design.md
git commit -m "docs: phase 2.4 pitfalls and framework-design notification section"
```

---

## Final Verification (after all 6 tasks)

- [ ] `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test` all pass
- [ ] `git log --oneline -8` shows 6+ clean Conventional Commit messages, one per task
- [ ] `pnpm dev` starts without notification-related errors
- [ ] **Manual test 1:** In renderer devtools console, run:
  ```js
  await window.api.notification.show({ source: 'renderer', title: 'Test', body: 'Hello from renderer' })
  ```
  Expected: a system notification appears. (On first run macOS prompts for permission.)
- [ ] **Manual test 2:** Mute then try again:
  ```js
  await window.api.notification.setEnabled(false)
  await window.api.notification.show({ source: 'renderer', title: 'Muted', body: 'Should not appear' })
  ```
  Expected: no notification appears; main process log shows `[notification] muted (notifications.enabled=false): ...`.
- [ ] **Manual test 3:** Click a notification while main window is minimized → window restores and focuses.
- [ ] `grep -n "new Notification" src/main/` returns ONLY matches in `src/main/services/notification.ts` (no stray ad-hoc calls).
- [ ] `window.api.notification` is typed in renderer (hover `window.api.notification.show` in any renderer `.ts` file — should show full signature).
- [ ] Phase 2.4 checklist item in `framework-design.md` is `- [x]`.
- [ ] CLAUDE.md pitfalls section ends at #19.
