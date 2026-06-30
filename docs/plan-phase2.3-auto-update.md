# Phase 2.3 — Auto-Update (electron-updater) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auto-update subsystem to hohu-admin-desktop so the framework can self-upgrade. Wraps `electron-updater` with a `UpdaterManager` singleton, supports GitHub Releases (default) and Generic (any static URL) providers switchable at build time, throttles background checks to once per 24h, and surfaces a tray menu entry for manual checks.

**Architecture:** One new main-process service (`UpdaterManager`) + one IPC module (4 handlers + 1 subscribe/event-flow channel) + preload bridge + tray menu integration + build-time publish config generator. Provider selection happens at build time via `scripts/gen-publish-config.mjs` reading `.env` and emitting a complete `build/electron-builder.yml`. Runtime reads baked `app-update.yml` (no provider switching post-build).

**Tech Stack:** electron-updater v6 / Electron Notification / electron-log / electron-store / `node:test` (zero-dep test runner) + tsx.

**Spec:** `docs/spec-phase2.3-auto-update.md`

**Project conventions (override skill defaults):**

- **Test runner:** This phase introduces `node:test` (Node built-in) + `tsx` (new devDep) for running TS unit tests on source. CI gate is `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test`. No vitest/jest.
- **Commit style:** Conventional Commits, lowercase, one line — e.g. `feat: phase 2.3 updater manager with throttle and skipVersion`. Pre-commit hook runs typecheck + lint + fmt; do NOT use `--no-verify`.
- **Pre-commit failure on format:** run `pnpm format` then re-stage. Do NOT skip hooks.
- **HMR caveat:** Restart `pnpm dev` after editing `electron.vite.config.ts`, `tsconfig.*.json`, `.env*`, or anything under `src/main/` or `src/preload/`. HMR only covers renderer.
- **No `.env.example` in this repo** — project commits `.env` / `.env.development` / `.env.production` directly (see `.gitignore` comment). Add new vars to `.env` (shared).
- **`preload/index.d.ts` is generic** — it imports `AppApi` from `@shared/types`. Adding `updater: UpdaterApi` to `AppApi` auto-propagates; no edit to the d.ts file itself needed.

---

## File Structure

| File                                          | Status | Responsibility                                                                                                    |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts`                         | Modify | Add `UpdaterState` / `UpdaterStatus` / `UpdaterEvent` / `UpdaterApi`; extend `AppApi`                             |
| `src/main/services/updater-utils.ts`          | Create | Pure helpers `shouldCheckNow` / `isSkipped` + `CHECK_INTERVAL_MS` constant (testable without Electron)            |
| `src/main/services/updater.ts`                | Create | `UpdaterManager` singleton (imports utils + side-effectful Electron modules)                                      |
| `src/main/services/__tests__/updater.test.ts` | Create | Unit tests for `shouldCheckNow` / `isSkipped` (node:test)                                                         |
| `src/main/ipc/updater.ts`                     | Create | `registerUpdaterIpc()` — 4 handlers + `updater:subscribe` for event flow                                          |
| `src/main/ipc/index.ts`                       | Modify | Call `registerUpdaterIpc()` in `registerAllIpc()`                                                                 |
| `src/preload/index.ts`                        | Modify | Expose `window.api.updater.{check, install, skipVersion, getStatus, onEvent}`                                     |
| `src/main/services/tray.ts`                   | Modify | Insert "Check for Updates..." menu item in `refreshMenu()`                                                        |
| `src/main/index.ts`                           | Modify | Call `updaterManager.init()` after tray/shortcut init                                                             |
| `electron-builder.yml`                        | Modify | Remove `publish:` block (becomes dev source)                                                                      |
| `scripts/gen-publish-config.mjs`              | Create | Read `.env` + `electron-builder.yml`, inject publish, output `build/electron-builder.yml`                         |
| `build/electron-builder.yml`                  | Create | Generated (gitignored) — what CI/build actually uses                                                              |
| `package.json`                                | Modify | Add `gen-publish` / `test` scripts; `build:*` uses single `--config build/electron-builder.yml`; add `tsx` devDep |
| `.gitignore`                                  | Modify | Add `build/electron-builder.yml`                                                                                  |
| `.env`                                        | Modify | Add `UPDATER_PROVIDER` / `GH_OWNER` / `GH_REPO` defaults                                                          |
| `dev-app-update.yml`                          | Modify | Add usage comment                                                                                                 |
| `CLAUDE.md`                                   | Modify | Add Common Pitfalls #11–#13 (macOS signing, dev yml, build-time provider)                                         |
| `docs/framework-design.md`                    | Modify | Mark Phase 2.3 ✅; add §6.4 updater architecture                                                                  |

---

## Task 1: Extend Shared Types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add Updater types and extend AppApi**

Open `src/shared/types.ts`. After the existing `ShortcutsApi` interface (around line 101), insert the four updater types:

```ts
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
```

Then extend `AppApi` (the interface at the bottom of the file) to include `updater`:

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
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. The new types are pure declarations; `AppApi` consumers (preload) will typecheck fine because they construct the bridge inline — but `window.api.updater` won't exist yet at runtime. Type-level only.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: phase 2.3 shared types for updater ipc"
```

---

## Task 2: UpdaterManager Service

**Files:**

- Create: `src/main/services/updater-utils.ts`
- Create: `src/main/services/updater.ts`

> **Why split:** Pure helpers (`shouldCheckNow` / `isSkipped`) live in `updater-utils.ts` so unit tests can import them via `tsx` without triggering `import 'electron'` (which fails outside Electron runtime). `updater.ts` imports the utils + side-effectful Electron modules.

- [ ] **Step 1: Create the pure-utils file**

Create `src/main/services/updater-utils.ts`:

```ts
/** 24 小时 ms —— 启动后台检查的最小间隔 */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * 纯函数：是否应该发起检查（24h 限频）。
 * 抽出独立文件便于 unit test —— 不 import 任何 Electron runtime 模块。
 */
export function shouldCheckNow(lastCheck: number | null, now: number, intervalMs: number = CHECK_INTERVAL_MS): boolean {
  if (lastCheck === null) return true
  return now - lastCheck >= intervalMs
}

/** 纯函数：版本是否被用户跳过 */
export function isSkipped(version: string, skipVersion: string | null): boolean {
  if (!skipVersion) return false
  // 简单字面量比较：electron-updater 版本号是 semver，无需特殊解析
  return version === skipVersion
}
```

- [ ] **Step 2: Create the UpdaterManager service**

Create `src/main/services/updater.ts` with this EXACT content:

```ts
import { app, Notification } from 'electron'
import { autoUpdater, type UpdateCheckResult } from 'electron-updater'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdaterEvent, UpdaterState, UpdaterStatus } from '@shared/types'
import { store } from './store'
import log from './logger'
import { shouldCheckNow, isSkipped } from './updater-utils'

// Re-export 纯函数，让外部从 updater 入口也能拿到（IPC/preload 不需要，但便于将来扩展）
export { shouldCheckNow, isSkipped } from './updater-utils'

const logger = log.scope('updater')

/** dev-app-update.yml 默认占位 URL，命中时跳过 init，避免每次 dev 都打错误日志 */
const DEV_PLACEHOLDER_URL = 'https://example.com/auto-updates'

class UpdaterManagerClass {
  private state: UpdaterState = 'idle'
  private pendingVersion: string | null = null
  private pendingProgress: number | null = null
  /** 最近一次 error 的 message，仅供内部 dedup 用，不暴露给 status */
  private lastError: string | null = null
  private listeners = new Set<(e: UpdaterEvent) => void>()
  private inited = false

  init(): void {
    if (this.inited) return
    this.inited = true

    // dev 模式显式指 dev-app-update.yml（否则 autoUpdater 在 !app.isPackaged 下 no-op）
    if (!app.isPackaged) {
      // ESM 项目无 __dirname，用 import.meta.dirname。
      // out/main/index.mjs → 项目根是 ../../
      const devYml = join(import.meta.dirname, '../../dev-app-update.yml')
      if (!existsSync(devYml)) {
        logger.warn('dev mode: dev-app-update.yml not found, updater will no-op')
        return
      }
      // 读 url：如果还是 example.com 占位，直接 no-op，避免每次 dev 都打 error 日志
      const text = readFileSync(devYml, 'utf8')
      if (text.includes(DEV_PLACEHOLDER_URL)) {
        logger.warn(
          `dev mode: dev-app-update.yml still points at placeholder (${DEV_PLACEHOLDER_URL}), updater no-op. Edit it to test update flow.`
        )
        return
      }
      autoUpdater.updateConfigPath = devYml
      logger.info(`dev mode: using ${devYml}`)
    }

    // 默认值显式声明（electron-updater 默认就是 true，但写出来更可读）
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    this.wireEvents()

    // 启动后台检查（限频）。init 已经检查 throttle，check(false) 内部再检查一次是有意冗余：
    // 防止外部调用方不通过 init 直接触发 check 时绕过 throttle。
    const { lastCheck } = store.get('updater')
    if (shouldCheckNow(lastCheck, Date.now())) {
      // 不 await —— 后台执行，不阻塞 app 启动
      void this.check(false)
    }
  }

  /** 手动/自动检查。forced=true 绕过 24h 限频（手动入口用） */
  async check(forced: boolean): Promise<UpdateCheckResult | null> {
    if (!forced) {
      const { lastCheck } = store.get('updater')
      if (!shouldCheckNow(lastCheck, Date.now())) {
        logger.debug('check skipped (throttled)')
        return null
      }
    }

    this.state = 'checking'
    try {
      const result = await autoUpdater.checkForUpdates()
      // 无论结果如何都更新 lastCheck（避免检查失败后下次启动立刻重试）
      store.set('updater', { ...store.get('updater'), lastCheck: Date.now() })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      this.state = 'error'
      logger.error('check failed', message)
      return null
    }
  }

  /** 退出并安装（用户点通知 Restart 时调） */
  install(): void {
    if (this.state !== 'downloaded') {
      logger.warn(`install called in state=${this.state}, ignored`)
      return
    }
    autoUpdater.quitAndInstall()
  }

  /** 标记跳过此版本：写 store + 取消正在进行的下载 */
  skipVersion(version: string): void {
    store.set('updater', { ...store.get('updater'), skipVersion: version })
    if (this.pendingVersion === version) {
      // 已开始下载则取消（cancelUpdate 在某些状态下会 reject，吞掉）
      void autoUpdater.cancelUpdate().catch((e: unknown) => logger.warn('cancelUpdate failed', String(e)))
    }
    this.state = 'skipped'
    logger.info(`skipped version ${version}`)
  }

  getStatus(): UpdaterStatus {
    return {
      state: this.state,
      version: this.pendingVersion,
      progress: this.pendingProgress,
      lastCheck: store.get('updater').lastCheck,
      skipVersion: store.get('updater').skipVersion
    }
  }

  /** 订阅事件流（IPC 层用，转发给渲染进程） */
  subscribe(fn: (e: UpdaterEvent) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit(event: UpdaterEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event)
      } catch (err) {
        logger.error('listener threw', String(err))
      }
    }
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.state = 'checking'
      this.emit({ type: 'checking' })
      logger.info('checking for update')
    })

    autoUpdater.on('update-available', info => {
      this.pendingVersion = info.version
      // skipVersion 命中：取消下载，标记 skipped
      if (isSkipped(info.version, store.get('updater').skipVersion)) {
        void autoUpdater.cancelUpdate().catch((e: unknown) => logger.warn('cancelUpdate failed', String(e)))
        this.state = 'skipped'
        this.emit({ type: 'skipped', version: info.version })
        logger.info(`version ${info.version} skipped by user`)
        return
      }
      this.state = 'available'
      this.emit({ type: 'available', version: info.version })
      logger.info(`update available: ${info.version}`)
    })

    autoUpdater.on('update-not-available', () => {
      this.state = 'not-available'
      this.emit({ type: 'not-available' })
      logger.info('up to date')
    })

    autoUpdater.on('error', (err: Error, message?: string) => {
      const text = message ?? err.message
      this.lastError = text
      this.state = 'error'
      this.emit({ type: 'error', message: text })
      logger.error('updater error', text)
    })

    autoUpdater.on('download-progress', progress => {
      this.pendingProgress = Math.round(progress.percent)
      this.state = 'downloading'
      this.emit({ type: 'progress', percent: this.pendingProgress })
      logger.debug(`download progress ${this.pendingProgress}%`)
    })

    autoUpdater.on('update-downloaded', info => {
      this.pendingVersion = info.version
      this.pendingProgress = 100
      this.state = 'downloaded'
      this.emit({ type: 'downloaded', version: info.version })
      logger.info(`update downloaded: ${info.version}`)
      // 唯一弹系统通知的节点
      this.notify(info.version)
    })
  }

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
}

export const updaterManager = new UpdaterManagerClass()
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS. Nothing imports the service yet. `electron-updater` v6 is already in `package.json` deps (`^6.3.9`).

- [ ] **Step 3: Commit**

```bash
git add src/main/services/updater-utils.ts src/main/services/updater.ts
git commit -m "feat: phase 2.3 updater manager with throttle and skipversion"
```

---

## Task 3: IPC Handlers

**Files:**

- Create: `src/main/ipc/updater.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Create the IPC handler module**

Create `src/main/ipc/updater.ts`:

```ts
import { ipcMain, type WebContents } from 'electron'
import type { UpdaterEvent } from '@shared/types'
import { updaterManager } from '../services/updater'

/**
 * Updater IPC：
 * - 4 个 invoke handler（check / install / skipVersion / getStatus）
 * - 1 个 subscribe handler，订阅 UpdaterManager 事件流，转发为 webContents.send('updater:event')
 *   每个 webContents 独立订阅，destroyed 时清理（防内存泄漏）
 */
export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:check', async (_e, forced?: boolean) => {
    await updaterManager.check(!!forced)
    return updaterManager.getStatus()
  })

  ipcMain.handle('updater:install', async () => {
    updaterManager.install()
  })

  ipcMain.handle('updater:skipVersion', async (_e, version: string) => {
    updaterManager.skipVersion(version)
  })

  ipcMain.handle('updater:getStatus', async () => updaterManager.getStatus())

  ipcMain.handle('updater:subscribe', event => {
    const webContents = event.sender as WebContents
    const unsubscribe = updaterManager.subscribe((e: UpdaterEvent) => {
      // 窗口已销毁则不再发送
      if (!webContents.isDestroyed()) {
        webContents.send('updater:event', e)
      }
    })
    webContents.once('destroyed', unsubscribe)
  })
}
```

- [ ] **Step 2: Register in `src/main/ipc/index.ts`**

Open `src/main/ipc/index.ts`. Add the import (alphabetical with existing imports, after `theme`):

```ts
import { registerShortcutIpc } from './shortcut'
import { registerThemeIpc } from './theme'
import { registerUpdaterIpc } from './updater'
```

And add the call inside `registerAllIpc()` (after `registerShortcutIpc()`):

```ts
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

- [ ] **Step 3: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

If `pnpm fmt` fails (formatter wants changes), run `pnpm format` then re-stage with `git add`. Do NOT use `--no-verify`.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/updater.ts src/main/ipc/index.ts
git commit -m "feat: phase 2.3 updater ipc handlers and event flow"
```

---

## Task 4: Preload Bridge

**Files:**

- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add updater to preload api**

Open `src/preload/index.ts`. Add the type import alongside the existing `HttpConfig` / `HttpResponse` / `StoreSchema` import at the top:

```ts
import type { HttpConfig, HttpResponse, StoreSchema, UpdaterApi, UpdaterEvent, UpdaterStatus } from '@shared/types'
```

Then add the `updater` bridge object after the existing `shortcuts` const (before the `const api = {` line):

```ts
/**
 * Updater 桥：手动检查 / 安装 / 跳过版本 / 订阅事件流。
 * onEvent 走 invoke('updater:subscribe') 触发主进程注册 listener，
 * 之后通过 ipcRenderer.on('updater:event') 接收推送。
 */
const updater = {
  check: (forced?: boolean): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:check', forced),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  skipVersion: (version: string): Promise<void> => ipcRenderer.invoke('updater:skipVersion', version),
  getStatus: (): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:getStatus'),
  onEvent: (cb: (e: UpdaterEvent) => void): Promise<() => void> =>
    new Promise(resolve => {
      const wrapped = (_e: unknown, payload: UpdaterEvent): void => cb(payload)
      ipcRenderer.on('updater:event', wrapped)
      // 订阅动作本身走一次 IPC（触发 main 注册 listener）
      void ipcRenderer.invoke('updater:subscribe').then(() => {
        resolve(() => ipcRenderer.removeListener('updater:event', wrapped))
      })
    })
} as const
```

Then extend the `api` object literal to include `updater`:

```ts
const api = {
  secureStore,
  http,
  shell,
  logger,
  store,
  theme,
  shortcuts,
  updater
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS. The `UpdaterApi` interface (from Task 1) is structurally compatible with this `updater` object. `window.api.updater` is now typed via `AppApi`.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: phase 2.3 updater bridge in preload"
```

---

## Task 5: Tray Menu Integration

**Files:**

- Modify: `src/main/services/tray.ts`

- [ ] **Step 1: Add import for updaterManager**

Open `src/main/services/tray.ts`. The existing service imports are `windowManager` / `store` / `logger` (no shortcut import here). Add `updaterManager` after the `logger` import:

```ts
import log from './logger'
import { updaterManager } from './updater'
```

- [ ] **Step 2: Insert menu item in `refreshMenu()`**

Find the `template` array inside `refreshMenu()`. Insert a separator + "Check for Updates..." between DevTools and the final separator+Quit:

```ts
const template: MenuItemConstructorOptions[] = [
  { label: isVisible ? 'Hide' : 'Show', click: () => windowManager.toggle() },
  { type: 'separator' },
  { label: 'Reload', click: () => win?.reload() },
  { label: 'DevTools', click: () => win?.webContents.toggleDevTools() },
  { type: 'separator' },
  {
    label: 'Check for Updates...',
    click: () => void updaterManager.check(true)
  },
  { type: 'separator' },
  { label: 'Quit', click: () => app.quit() }
]
```

- [ ] **Step 3: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

If `pnpm fmt` fails, run `pnpm format` then re-stage.

- [ ] **Step 4: Commit**

```bash
git add src/main/services/tray.ts
git commit -m "feat: phase 2.3 tray check for updates entry"
```

---

## Task 6: Main Entry Wiring

**Files:**

- Modify: `src/main/index.ts`

- [ ] **Step 1: Add import and init call**

Open `src/main/index.ts`. Add the import alongside the existing service imports (around lines 6–8):

```ts
import { windowManager } from './services/window'
import { trayManager } from './services/tray'
import { shortcutManager } from './services/shortcut'
import { updaterManager } from './services/updater'
```

Then inside the `app.whenReady().then(() => { ... })` callback, add `updaterManager.init()` after `shortcutManager.init()` (around line 75):

```ts
// 托盘初始化
trayManager.init()
shortcutManager.init()
updaterManager.init()
```

- [ ] **Step 2: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

- [ ] **Step 3: Manual smoke test (run dev, verify, then stop)**

Run `pnpm dev`. In the terminal output (electron-log console transport), confirm you see one of:

- `[updater] dev mode: dev-app-update.yml still points at placeholder (...)` — expected default (file unchanged)
- `[updater] dev mode: using .../dev-app-update.yml` — if you edited dev-app-update.yml

Right-click the tray icon → confirm "Check for Updates..." appears between DevTools and Quit. Click it once — should not throw (will log an error from example.com placeholder, that's expected).

**Stop the dev server** (Ctrl+C in the terminal) before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: phase 2.3 wire updater manager init in main entry"
```

---

## Task 7: Build Config — Provider Switch

**Files:**

- Modify: `electron-builder.yml`
- Create: `scripts/gen-publish-config.mjs`
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env`

- [ ] **Step 1: Remove `publish` block from `electron-builder.yml`**

Open `electron-builder.yml`. Delete lines 41–43 (the `publish:` block):

```yaml
publish:
  provider: generic
  url: https://hohu.org/app/auto-updates
```

Keep `electronDownload:` and everything else. The file ends with:

```yaml
electronDownload:
  mirror: https://npmmirror.com/mirrors/electron/
```

- [ ] **Step 2: Create `scripts/gen-publish-config.mjs`**

```js
// 读 .env + 源 electron-builder.yml，注入 publish 段，输出 build/electron-builder.yml
// 用法：pnpm gen-publish（被 build:win/mac/linux 自动前置）
// 失败时（缺 GH_OWNER 或 UPDATER_URL 等）抛错并退出，避免静默生成坏配置
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/** 手动解析 .env（避免新增 dotenv 依赖） */
function readEnvFile(): Record<string, string> {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    // 去掉首尾引号
    val = val.replace(/^['"]|['"]$/g, '')
    out[key] = val
  }
  return out
}

const env = { ...readEnvFile(), ...process.env }
const provider = (env.UPDATER_PROVIDER || 'github').toLowerCase()
const sourceYml = resolve(process.cwd(), 'electron-builder.yml')
const outDir = resolve(process.cwd(), 'build')
const outPath = resolve(outDir, 'electron-builder.yml')

if (!existsSync(sourceYml)) {
  throw new Error(`source electron-builder.yml not found at ${sourceYml}`)
}

let publishBlock: string
if (provider === 'github') {
  if (!env.GH_OWNER || !env.GH_REPO) {
    throw new Error('UPDATER_PROVIDER=github requires GH_OWNER and GH_REPO in .env')
  }
  publishBlock = `publish:\n  provider: github\n  owner: ${env.GH_OWNER}\n  repo: ${env.GH_REPO}\n`
} else if (provider === 'generic') {
  if (!env.UPDATER_URL) {
    throw new Error('UPDATER_PROVIDER=generic requires UPDATER_URL in .env')
  }
  publishBlock = `publish:\n  provider: generic\n  url: ${env.UPDATER_URL}\n`
} else {
  throw new Error(`unknown UPDATER_PROVIDER: ${provider}`)
}

const baseYml = readFileSync(sourceYml, 'utf8')
// 源 yml 末尾保证一行空行再追加 publish 段
const fullYml = baseYml.replace(/\s+$/, '') + '\n\n' + publishBlock

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, fullYml)
console.log(`[gen-publish-config] wrote ${outPath} (provider=${provider})`)
```

- [ ] **Step 3: Update `package.json` scripts**

Open `package.json`. Replace the existing `build:win` / `build:mac` / `build:linux` / `build:unpack` lines with:

```jsonc
    "build:unpack": "npm run build && electron-builder --dir",
    "build:win": "npm run build && npm run gen-publish && electron-builder --win --config build/electron-builder.yml",
    "build:mac": "npm run build && npm run gen-publish && electron-builder --mac --config build/electron-builder.yml",
    "build:linux": "npm run build && npm run gen-publish && electron-builder --linux --config build/electron-builder.yml",
    "gen-publish": "node scripts/gen-publish-config.mjs",
```

Leave `build` / `dev` / `start` / etc. untouched. Note: `build:unpack` does NOT call `gen-publish` — it uses no `--config` (defaults to source `electron-builder.yml` which has no publish block; that's fine for unpack-only local verification).

- [ ] **Step 4: Add `.gitignore` entry**

Open `.gitignore`. In the "Build output" section (after `release`), add:

```
build/electron-builder.yml
```

- [ ] **Step 5: Add updater env vars to `.env`**

Open `.env`. Append at the end:

```bash

# 自动更新 provider：github（默认）/ generic
# 构建时由 scripts/gen-publish-config.mjs 读取，注入 electron-builder publish 段
UPDATER_PROVIDER=github
GH_OWNER=hohu-org
GH_REPO=hohu-admin-desktop
# UPDATER_PROVIDER=generic 时必填（任意可访问的静态 URL，需提供 latest.yml + 安装包）：
# UPDATER_URL=https://your-host/app/auto-updates
```

- [ ] **Step 6: Verify gen script works**

```bash
pnpm gen-publish
```

Expected output: `[gen-publish-config] wrote /Volumes/data/code/hohux/hohu/hohu-admin-desktop/build/electron-builder.yml (provider=github)`.

Read the generated file:

```bash
cat build/electron-builder.yml
```

Confirm: it contains the full base config (appId, productName, win/mac/linux blocks, electronDownload) AND at the bottom a `publish:` block with `provider: github`, `owner: hohu-org`, `repo: hohu-admin-desktop`.

- [ ] **Step 7: Verify failure paths**

```bash
# Missing GH_OWNER
GH_OWNER= pnpm gen-publish 2>&1 | tail -3
```

Expected: throws `Error: UPDATER_PROVIDER=github requires GH_OWNER and GH_REPO in .env`. (process exits non-zero)

```bash
# Generic provider missing URL
UPDATER_PROVIDER=generic pnpm gen-publish 2>&1 | tail -3
```

Expected: throws `Error: UPDATER_PROVIDER=generic requires UPDATER_URL in .env`.

- [ ] **Step 8: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Note: `scripts/gen-publish-config.mjs` is not typechecked by `tsconfig.node.json` (only `src/main` / `src/preload` / `src/shared` are). Lint may or may not cover it depending on eslint config. If lint errors on the script, add a `// eslint-disable` line or extend `eslint.config.mjs` ignores — but prefer to keep the script clean.

- [ ] **Step 9: Commit**

```bash
git add electron-builder.yml scripts/gen-publish-config.mjs package.json .gitignore .env
git commit -m "feat: phase 2.3 build-time provider switch for auto-update"
```

---

## Task 8: Unit Tests

**Files:**

- Modify: `package.json` (add `tsx` devDep, `test` script)
- Create: `src/main/services/__tests__/updater.test.ts`

- [ ] **Step 1: Install tsx devDep**

```bash
pnpm add -D tsx
```

This adds `tsx` (a TypeScript executor) to devDependencies. Needed because unit test source is `.ts` and `node --test` doesn't natively strip types.

- [ ] **Step 2: Add `test` script to `package.json`**

Open `package.json`. Add this script alongside the existing `typecheck` / `lint` / `fmt`:

```jsonc
    "test": "node --test --import tsx src/main/services/__tests__/*.test.ts",
```

- [ ] **Step 3: Create the test file**

Create `src/main/services/__tests__/updater.test.ts`:

```ts
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
// 从 utils 文件导入，避免触发 updater.ts 里的 'electron' 顶层 import
import { shouldCheckNow, isSkipped } from '../updater-utils'

test('shouldCheckNow: lastCheck=null 首次必须检查', () => {
  assert.equal(shouldCheckNow(null, 0), true)
})

test('shouldCheckNow: 不足 24h 跳过', () => {
  assert.equal(shouldCheckNow(0, 23 * 3600_000), false)
})

test('shouldCheckNow: 满 24h 触发', () => {
  assert.equal(shouldCheckNow(0, 24 * 3600_000), true)
})

test('shouldCheckNow: 超 24h 触发', () => {
  assert.equal(shouldCheckNow(0, 25 * 3600_000), true)
})

test('shouldCheckNow: 自定义 interval 命中', () => {
  assert.equal(shouldCheckNow(100, 150, 50), true)
})

test('shouldCheckNow: 自定义 interval 未到', () => {
  assert.equal(shouldCheckNow(100, 120, 50), false)
})

test('isSkipped: skipVersion=null 不跳过', () => {
  assert.equal(isSkipped('1.0.0', null), false)
})

test('isSkipped: 版本号匹配 → 跳过', () => {
  assert.equal(isSkipped('1.0.0', '1.0.0'), true)
})

test('isSkipped: 版本号不匹配 → 不跳过', () => {
  assert.equal(isSkipped('1.0.1', '1.0.0'), false)
})

test('isSkipped: 空字符串视为无 skip', () => {
  assert.equal(isSkipped('1.0.0', ''), false)
})
```

> **Why import from `../updater-utils` not `../updater`:** `updater.ts` has top-level `import { app, Notification } from 'electron'` which fails to resolve under `node --test` (Electron only loads inside its own runtime). The pure-utils file has zero Electron deps, so it loads cleanly via tsx.

- [ ] **Step 4: Run tests**

```bash
pnpm test
```

Expected: ✅ 10 tests pass, exit code 0. If you see `Cannot find module 'electron'`, double-check the test imports from `../updater-utils`, not `../updater`.

- [ ] **Step 5: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/main/services/__tests__/updater.test.ts
git commit -m "test: phase 2.3 updater pure function unit tests"
```

---

## Task 9: dev-app-update.yml Comments + Documentation Backfill

**Files:**

- Modify: `dev-app-update.yml`
- Modify: `CLAUDE.md`
- Modify: `docs/framework-design.md`

- [ ] **Step 1: Add usage comment to `dev-app-update.yml`**

Open `dev-app-update.yml`. Prepend the comment block above the existing `provider: generic` line:

```yaml
# dev 模式（pnpm dev）下 electron-updater 读这个文件。
# 默认 url 是 example.com 占位 —— UpdaterManager.init() 检测到会跳过 init，不打错误日志。
# 要在 dev 下测更新流程：把 url 改成你发布过 release 的 GitHub 仓库 latest.yml 路径，
# 或本地 file:// 路径，或任意静态服务器；version 比当前 package.json 高才能触发 update-available。
# 改完重启 pnpm dev（HMR 不覆盖主进程）。
provider: generic
url: https://example.com/auto-updates
updaterCacheDirName: hohu-admin-desktop-updater
```

- [ ] **Step 2: Add Common Pitfalls #11–#13 to `CLAUDE.md`**

Open `CLAUDE.md`. Find the "Common Pitfalls" section (ends around item #10). Append three new items:

```markdown
11. **macOS 自动更新需要代码签名** — electron-updater 在 macOS 通过 `validateUpdate` 校验更新包签名，要求 app 自身已用 Developer ID Application 证书签名（`electron-builder.yml` 的 `mac.identity` 配置）。当前未配置签名 → 能检测能下载，但安装被拒。公证（notarization）是 Apple 对**首次分发**的独立要求（外链 DMG 第一次运行），与自动更新流程无关。Windows NSIS / Linux AppImage 不受影响。

12. **dev 模式读 dev-app-update.yml** — `pnpm dev` 下 electron-updater 默认 no-op，`UpdaterManager.init` 显式设置 updateConfigPath。命中占位 URL（example.com）会自动跳过 init 避免每次 dev 都打 error 日志。要在 dev 验证更新流程：编辑 `dev-app-update.yml` 的 url 指向本地静态服务器或 GitHub raw，并保证目标版本号高于 `package.json` 的 version。改完重启 dev，不重启不生效。

13. **provider 是构建时决定的** — `electron-builder` 把 publish 配置烤进 `app-update.yml` 打包到 asar 里。运行时无法切换；要换 provider 必须重新 build。`.env` 的 `UPDATER_PROVIDER` 在 build 前由 `scripts/gen-publish-config.mjs` 读取，注入到生成的 `build/electron-builder.yml`。
```

- [ ] **Step 3: Update `docs/framework-design.md`**

Open `docs/framework-design.md`. Make two edits:

**(a) Phase 2 checklist** (around line 339–344). Change the auto-update line from:

```
- [ ] 自动更新接入
```

to:

```
- [x] **自动更新接入** —— 详见 `docs/spec-phase2.3-auto-update.md`
```

**(b) Add §6.4 section.** Find the end of §6.3 (the i18n section, ends around line 336 with "---"). Insert a new §6.4 between §6.3 and the "Phase 2" header:

```markdown
### 6.4 自动更新（已实现）

#### 架构：UpdaterManager 单例
```

src/main/services/updater.ts # UpdaterManager（autoUpdater 封装 + 事件流）
src/main/ipc/updater.ts # 4 invoke handler + 1 subscribe handler
src/preload/index.ts # window.api.updater.{check, install, skipVersion, getStatus, onEvent}
scripts/gen-publish-config.mjs # build 时注入 publish 段

```

#### Provider 双模式（build-time switch）

| Provider | 适用                        | 配置                                                    |
| -------- | --------------------------- | ------------------------------------------------------- |
| github   | fork 开发者，打 tag 就发布  | `.env` 设 `UPDATER_PROVIDER=github` + `GH_OWNER` / `GH_REPO` |
| generic  | 自建静态服务器 / CDN / 云服务 | `.env` 设 `UPDATER_PROVIDER=generic` + `UPDATER_URL`    |

`scripts/gen-publish-config.mjs` 读 `.env`，注入 publish 段到 `build/electron-builder.yml`（gitignored）。运行时 provider 烧在 `app-update.yml` 里，无法热切。

#### 关键策略

- **24h 限频**：`store.updater.lastCheck` 持久化，启动时检查；手动入口（托盘「Check for Updates...」）绕过限频
- **skipVersion**：写 `store.updater.skipVersion`；`update-available` 事件命中即 `cancelUpdate()` + 标记 skipped
- **autoDownload=true / autoInstallOnAppQuit=true**：发现新版直接后台下载，下次退出时安装；用户点通知 click → `quitAndInstall()`
- **系统通知只在 update-downloaded 弹一次**：checking/available/progress 仅走 IPC + 日志，不打扰用户
- **dev 模式**：`!app.isPackaged` 时显式设 `autoUpdater.updateConfigPath` 指项目根 `dev-app-update.yml`；命中 example.com 占位 URL 自动跳过

#### 平台限制

- Windows NSIS：开箱即用
- macOS：需代码签名（`mac.identity` + Developer ID Application），当前未配置 → 能检测能下载但安装被拒
- Linux：仅 AppImage 支持（deb/snap 不支持自动更新）

#### 未做（YAGNI）

- 渲染层「关于/设置页」UI —— IPC 全暴露，UI 留 Phase 3
- Beta 通道 / 预发布过滤
- 代码签名 / 公证配置 —— 文档化限制
- hohu-admin 后端更新接口 —— 后端范畴

---
```

- [ ] **Step 4: Lint + format (docs only, no typecheck needed)**

```bash
pnpm lint && pnpm fmt
```

If `pnpm fmt` fails on markdown, run `pnpm format` then re-stage.

- [ ] **Step 5: Commit**

```bash
git add dev-app-update.yml CLAUDE.md docs/framework-design.md
git commit -m "docs: phase 2.3 pitfalls and framework-design updater section"
```

---

## Final Verification (after all 9 tasks)

- [ ] `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test` all pass
- [ ] `git log --oneline -10` shows 9 clean Conventional Commit messages, one per task
- [ ] `pnpm dev` → tray right-click → "Check for Updates..." visible and clickable
- [ ] `pnpm dev` terminal log shows `[updater] dev mode: ...` (placeholder skip warning by default)
- [ ] `pnpm gen-publish` produces `build/electron-builder.yml` with correct publish block
- [ ] `build/electron-builder.yml` is in `.gitignore` (not tracked)
- [ ] `window.api.updater` is typed in renderer (verify by opening any `.ts` in `src/renderer` and hovering `window.api.updater.check` — should show full signature)
