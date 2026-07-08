# Settings Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified settings drawer (4 sections, 13 items) that surfaces IPC capabilities (updater / notification / shortcuts / launch-at-login) currently lacking UI, and merge the existing ThemeDrawer into it.

**Architecture:** Pinia `useSettingsStore` lazily loads electron-store state via typed IPC on first drawer open, applies optimistic updates with rollback. New `app` IPC namespace (`getVersion` / `getPlatform` / `getLoginItem` / `setLoginItem`). Pure `accelerator` util extracted to `src/shared/` so it can be unit-tested under `tsconfig.node.json`.

**Tech Stack:** Electron 39 / Vue 3.5 / Pinia 3 / NaiveUI 2.44 / TypeScript 5.9 / node:test

**Spec deviations from `2026-07-08-settings-drawer-design.md`:**

1. `accelerator.ts` lives in `src/shared/` (not `src/renderer/src/utils/`) — `tsconfig.node.json` only includes `src/{main,preload,shared}/**`, so tests can't import from renderer.
2. Notifications toggle added as 4th item in 通用 section — spec state/actions include `notificationsEnabled` / `setNotificationsEnabled` but the section 2 content list omitted it. 13 items total.

---

## Task 1: StoreSchema + UpdaterManager autoDownload gate

**Files:**

- Modify: `src/shared/types.ts` — add `autoDownload: boolean` to `StoreSchema.updater`
- Modify: `src/main/services/store.ts` — add to `defaults` + `schema`
- Modify: `src/main/services/updater.ts:160-180` — gate `downloadUpdate` call on `autoDownload` flag

- [ ] **Step 1: Extend `StoreSchema.updater`**

`src/shared/types.ts`, find the `updater` field inside `StoreSchema` interface (around line 59-64) and add `autoDownload`:

```ts
/** 自动更新（Phase 2.3 用） */
updater: {
  skipVersion: string | null
  lastCheck: number | null
  /** Phase 2.6：update-available 事件里是否自动触发下载。false 时停在 available 状态等用户手动下载。 */
  autoDownload: boolean
}
```

- [ ] **Step 2: Add `autoDownload: true` default + schema**

`src/main/services/store.ts` — change `defaults.updater` (around line 9) from:

```ts
  updater: { skipVersion: null, lastCheck: null },
```

to:

```ts
  updater: { skipVersion: null, lastCheck: null, autoDownload: true },
```

And in `schema.updater.properties` (around line 70-76) add the field:

```ts
  updater: {
    type: 'object',
    additionalProperties: false,
    properties: {
      skipVersion: { type: ['string', 'null'] },
      lastCheck: { type: ['number', 'null'] },
      autoDownload: { type: 'boolean' }
    },
    required: ['skipVersion', 'lastCheck', 'autoDownload']
  }
```

**Default is `true`** to preserve current behavior (existing `updater.ts:172-179` always downloads).

- [ ] **Step 3: Gate `downloadUpdate` on `autoDownload`**

`src/main/services/updater.ts` — find `autoUpdater.on('update-available', ...)` handler (around line 160-180). The current code unconditionally calls `autoUpdater.downloadUpdate(this.downloadToken)`. Wrap it in the flag check. After the change the handler body from the `this.state = 'available'` line onward looks like:

```ts
this.state = 'available'
this.emit({ type: 'available', version: info.version })
logger.info(`update available: ${info.version}`)
// Phase 2.6：autoDownload flag 控制。true（默认）→ 立即下载；false → 停在 available 等用户操作
if (store.get('updater').autoDownload) {
  this.downloadToken = new CancellationToken()
  void autoUpdater.downloadUpdate(this.downloadToken).catch((e: unknown) => {
    if (this.state !== 'skipped') {
      logger.warn('downloadUpdate rejected', String(e))
    }
  })
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors. (autoDownload added consistently across types/defaults/schema/updater.ts usage.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/services/store.ts src/main/services/updater.ts
git commit -m "feat(updater): add autoDownload flag to store schema"
```

---

## Task 2: app IPC namespace (getVersion / getPlatform / getLoginItem / setLoginItem)

**Files:**

- Create: `src/main/ipc/app.ts`
- Modify: `src/main/ipc/index.ts` — register `registerAppIpc`

- [ ] **Step 1: Create `src/main/ipc/app.ts`**

```ts
import { app, ipcMain } from 'electron'

/**
 * App IPC 通道：暴露 Electron `app` 模块的部分 API 给渲染层。
 * - getVersion: 读 package.json 的 version（设置页 About 段用）
 * - getPlatform: 主进程 process.platform（渲染层 nodeIntegration=false 下拿不到，UI 兼容判断用）
 * - getLoginItem / setLoginItem: 开机自启读写（Linux no-op，UI 应预先 disabled）
 */
export const APP_CHANNELS = {
  GET_VERSION: 'app:getVersion',
  GET_PLATFORM: 'app:getPlatform',
  GET_LOGIN_ITEM: 'app:getLoginItem',
  SET_LOGIN_ITEM: 'app:setLoginItem'
} as const

export function registerAppIpc(): void {
  ipcMain.handle(APP_CHANNELS.GET_VERSION, (): string => app.getVersion())

  ipcMain.handle(APP_CHANNELS.GET_PLATFORM, (): NodeJS.Platform => process.platform)

  ipcMain.handle(APP_CHANNELS.GET_LOGIN_ITEM, (): boolean => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle(APP_CHANNELS.SET_LOGIN_ITEM, (_e, enabled: boolean): boolean => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    // 返回实际生效状态（Linux 上 setLoginItemSettings 是 no-op，getLoginItemSettings 仍返回 false）
    return app.getLoginItemSettings().openAtLogin
  })
}
```

- [ ] **Step 2: Register in `src/main/ipc/index.ts`**

Add the import alongside the existing ones (after `registerNotificationIpc`):

```ts
import { registerAppIpc } from './app'
```

And in `registerAllIpc()` body, after `registerNotificationIpc()`:

```ts
registerAppIpc()
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/app.ts src/main/ipc/index.ts
git commit -m "feat(ipc): add app namespace (version/platform/loginItem)"
```

---

## Task 3: Preload bridge + ElectronAppApi type

**Files:**

- Modify: `src/shared/types.ts` — add `ElectronAppApi` interface; add `app` field to `AppApi`
- Modify: `src/preload/index.ts` — expose `app` namespace via `contextBridge`

- [ ] **Step 1: Add `ElectronAppApi` interface**

`src/shared/types.ts` — add near the other `*Api` interfaces (after `NotificationApi`, before `AppApi`):

```ts
/**
 * App namespace：暴露 Electron `app` 模块的部分 API。
 * 命名 ElectronAppApi 避免与已有的 AppApi（window.api 总类型）冲突。
 */
export interface ElectronAppApi {
  getVersion: () => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  getLoginItem: () => Promise<boolean>
  setLoginItem: (enabled: boolean) => Promise<boolean>
}
```

And add `app: ElectronAppApi` to `AppApi` interface (the one with `secureStore`, `http`, etc.):

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
  app: ElectronAppApi
}
```

- [ ] **Step 2: Expose `app` in preload**

`src/preload/index.ts` — add after the `notification` const block (before `const api = {...}`):

```ts
/**
 * App namespace 桥：暴露 Electron app 模块的部分 API。
 * - getVersion: package.json version
 * - getPlatform: 主进程 process.platform（渲染层 nodeIntegration=false 拿不到）
 * - getLoginItem / setLoginItem: 开机自启
 */
const app = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getPlatform: (): Promise<NodeJS.Platform> => ipcRenderer.invoke('app:getPlatform'),
  getLoginItem: (): Promise<boolean> => ipcRenderer.invoke('app:getLoginItem'),
  setLoginItem: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('app:setLoginItem', enabled)
} as const
```

Add `app,` to the `api` object literal:

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
  notification,
  app
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts
git commit -m "feat(preload): expose app namespace via contextBridge"
```

---

## Task 4: Accelerator util + TDD unit tests

**Files:**

- Create: `src/shared/accelerator.ts`
- Test: `src/main/services/__tests__/accelerator.test.ts`

**Why `src/shared/`**: `tsconfig.node.json` only includes `src/{main,preload,shared}/**`. Tests run with `TSX_TSCONFIG_PATH=tsconfig.node.json`; importing from `src/renderer/` would fail to resolve.

- [ ] **Step 1: Write failing tests**

Create `src/main/services/__tests__/accelerator.test.ts`:

```ts
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { eventToAccelerator, formatAccelerator, type AcceleratorInput } from '@shared/accelerator'

const ev = (overrides: Partial<AcceleratorInput> = {}): AcceleratorInput => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  code: '',
  key: '',
  ...overrides
})

test('eventToAccelerator: 仅 modifier → null', () => {
  assert.equal(eventToAccelerator(ev({ ctrlKey: true, key: 'Control', code: 'ControlLeft' })), null)
  assert.equal(eventToAccelerator(ev({ metaKey: true, key: 'Meta', code: 'MetaLeft' })), null)
  assert.equal(eventToAccelerator(ev({ altKey: true, key: 'Alt', code: 'AltLeft' })), null)
  assert.equal(eventToAccelerator(ev({ shiftKey: true, key: 'Shift', code: 'ShiftLeft' })), null)
})

test('eventToAccelerator: Ctrl+H → CommandOrControl+H', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'KeyH', key: 'h' }))
  assert.equal(result, 'CommandOrControl+H')
})

test('eventToAccelerator: Meta+L → CommandOrControl+L（跨平台映射）', () => {
  const result = eventToAccelerator(ev({ metaKey: true, code: 'KeyL', key: 'l' }))
  assert.equal(result, 'CommandOrControl+L')
})

test('eventToAccelerator: Ctrl+Shift+H → CommandOrControl+Shift+H', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, shiftKey: true, code: 'KeyH', key: 'H' }))
  assert.equal(result, 'CommandOrControl+Shift+H')
})

test('eventToAccelerator: Alt+P → Alt+P', () => {
  const result = eventToAccelerator(ev({ altKey: true, code: 'KeyP', key: 'p' }))
  assert.equal(result, 'Alt+P')
})

test('eventToAccelerator: Digit1 → 1', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'Digit1', key: '1' }))
  assert.equal(result, 'CommandOrControl+1')
})

test('eventToAccelerator: F1-F12 直接保留', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'F5', key: 'F5' }))
  assert.equal(result, 'CommandOrControl+F5')
})

test('eventToAccelerator: 方向键 ArrowUp → Up', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'ArrowUp', key: 'ArrowUp' }))
  assert.equal(result, 'CommandOrControl+Up')
})

test('eventToAccelerator: Space → Space', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'Space', key: ' ' }))
  assert.equal(result, 'CommandOrControl+Space')
})

test('eventToAccelerator: 无 modifier + 主键 → 主键本身', () => {
  const result = eventToAccelerator(ev({ code: 'KeyH', key: 'h' }))
  assert.equal(result, 'H')
})

test('eventToAccelerator: 无法识别的 code → null', () => {
  const result = eventToAccelerator(ev({ code: 'SomeWeirdKey', key: 'Weird' }))
  assert.equal(result, null)
})

test('formatAccelerator: mac 显示符号', () => {
  assert.equal(formatAccelerator('CommandOrControl+Shift+H', 'darwin'), '⌘⇧H')
  assert.equal(formatAccelerator('CommandOrControl+H', 'darwin'), '⌘H')
  assert.equal(formatAccelerator('Alt+P', 'darwin'), '⌥P')
})

test('formatAccelerator: win/linux 显示文字', () => {
  assert.equal(formatAccelerator('CommandOrControl+Shift+H', 'win32'), 'Ctrl+Shift+H')
  assert.equal(formatAccelerator('CommandOrControl+Shift+H', 'linux'), 'Ctrl+Shift+H')
  assert.equal(formatAccelerator('Alt+P', 'win32'), 'Alt+P')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '@shared/accelerator'`

- [ ] **Step 3: Implement `src/shared/accelerator.ts`**

```ts
/**
 * KeyboardEvent → Electron accelerator 字符串的工具。
 * 用于设置页快捷键录制：用户按下组合键后转换为 Electron globalShortcut 识别的格式。
 *
 * 放在 src/shared 而非 renderer/src/utils：tsconfig.node.json 只 include src/{main,preload,shared}/**，
 * 测试在 node 环境跑必须能 import 到。KeyboardEvent 通过 AcceleratorInput 接口部分兼容。
 */

/** eventToAccelerator 的最小输入契约。KeyboardEvent 满足此结构。 */
export interface AcceleratorInput {
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
  key: string
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift'])

/** code → accelerator 主键名映射。返回 null 表示无法识别。 */
function codeToMainKey(code: string): string | null {
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Key')) return code.slice(3)
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  const specialMap: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Enter: 'Return',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Insert: 'Insert',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown'
  }
  return specialMap[code] ?? null
}

/**
 * 把 KeyboardEvent 转成 Electron accelerator 字符串。
 * 仅 modifier 按下（无主键）返回 null，表示「等用户继续按」。
 *
 * @example
 *   eventToAccelerator({ ctrlKey: true, code: 'KeyH', ... }) → 'CommandOrControl+H'
 *   eventToAccelerator({ ctrlKey: true, key: 'Control', code: 'ControlLeft', ... }) → null
 */
export function eventToAccelerator(e: AcceleratorInput): string | null {
  // 纯 modifier（无主键）：返回 null 让录制态保持
  if (MODIFIER_KEYS.has(e.key)) return null

  const main = codeToMainKey(e.code)
  if (!main) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(main)
  return parts.join('+')
}

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Control: '⌃'
}

/**
 * accelerator → 用户可读字符串。
 * mac 显示符号（⌘⇧H），win/linux 显示文字（Ctrl+Shift+H）。
 */
export function formatAccelerator(acc: string, platform: NodeJS.Platform): string {
  const parts = acc.split('+')
  if (platform === 'darwin') {
    return parts.map(p => MAC_SYMBOLS[p] ?? p).join('')
  }
  // win32 / linux：CommandOrControl → Ctrl（与 web 端展示一致）
  return parts.map(p => (p === 'CommandOrControl' ? 'Ctrl' : p)).join('+')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all 13 accelerator tests + existing 18 tab-helpers tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/accelerator.ts src/main/services/__tests__/accelerator.test.ts
git commit -m "feat(accelerator): add event-to-accelerator util with tests"
```

---

## Task 5: useSettingsStore

**Files:**

- Create: `src/renderer/src/store/settings.ts`

- [ ] **Step 1: Create `src/renderer/src/store/settings.ts`**

```ts
import { defineStore } from 'pinia'
import type { UpdaterEvent, UpdaterStatus } from '@shared/types'

interface SettingsState {
  /** loadAll 是否完成（首次开抽屉后置 true） */
  loaded: boolean
  /** loadAll 是否失败（用于空状态 + 重试按钮） */
  loadError: boolean
  /** 主进程 process.platform，UI 兼容判断用 */
  platform: NodeJS.Platform

  // electron-store mirror
  closeToTray: boolean
  launchAtLogin: boolean
  shortcuts: Record<string, string>
  updaterAutoDownload: boolean
  updaterSkipVersion: string | null
  notificationsEnabled: boolean

  // app
  appVersion: string

  // updater runtime
  updaterStatus: UpdaterStatus
}

const IDLE_STATUS: UpdaterStatus = {
  state: 'idle',
  version: null,
  progress: null,
  lastCheck: null,
  skipVersion: null
}

/**
 * Settings Store：electron-store 字段的本地缓存 + IPC 透传。
 *
 * 懒加载：抽屉未打开 → 0 IPC。第一次 SettingsDrawer 挂载时调 loadAll()。
 * 后续开抽屉只读缓存（loaded=true），不重复拉。
 *
 * 写入策略：toggle 类操作乐观更新本地，IPC 失败时 rollback + throw；
 * 组件 catch 后弹 message.error。updateShortcut 是例外（false 不算 throw）。
 */
export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    loaded: false,
    loadError: false,
    platform: 'darwin', // 占位，loadAll 后覆盖
    closeToTray: true,
    launchAtLogin: false,
    shortcuts: {},
    updaterAutoDownload: true,
    updaterSkipVersion: null,
    notificationsEnabled: true,
    appVersion: '',
    updaterStatus: { ...IDLE_STATUS }
  }),
  actions: {
    /** 首次开抽屉时并发拉所有字段 */
    async loadAll(): Promise<void> {
      this.loadError = false
      try {
        const [tray, shortcuts, updater, notifications, launchAtLogin, appVersion, platform] = await Promise.all([
          window.api.store.get('tray'),
          window.api.store.get('shortcuts'),
          window.api.store.get('updater'),
          window.api.store.get('notifications'),
          window.api.app.getLoginItem(),
          window.api.app.getVersion(),
          window.api.app.getPlatform()
        ])
        this.closeToTray = tray.closeToTray
        this.shortcuts = shortcuts
        this.updaterAutoDownload = updater.autoDownload
        this.updaterSkipVersion = updater.skipVersion
        this.notificationsEnabled = notifications.enabled
        this.launchAtLogin = launchAtLogin
        this.appVersion = appVersion
        this.platform = platform
        this.loaded = true
      } catch (e) {
        console.warn('[settings] loadAll failed', e)
        this.loadError = true
      }
    },

    async setCloseToTray(v: boolean): Promise<void> {
      const prev = this.closeToTray
      this.closeToTray = v
      try {
        await window.api.store.set('tray', { closeToTray: v })
      } catch (e) {
        this.closeToTray = prev
        throw e
      }
    },

    async setLaunchAtLogin(v: boolean): Promise<void> {
      const prev = this.launchAtLogin
      this.launchAtLogin = v
      try {
        // 主进程返回实际生效状态（Linux 返回 false）；用返回值同步本地
        const actual = await window.api.app.setLoginItem(v)
        this.launchAtLogin = actual
      } catch (e) {
        this.launchAtLogin = prev
        throw e
      }
    },

    async setNotificationsEnabled(v: boolean): Promise<void> {
      const prev = this.notificationsEnabled
      this.notificationsEnabled = v
      try {
        await window.api.notification.setEnabled(v)
      } catch (e) {
        this.notificationsEnabled = prev
        throw e
      }
    },

    async setUpdaterAutoDownload(v: boolean): Promise<void> {
      const prev = this.updaterAutoDownload
      this.updaterAutoDownload = v
      try {
        const cur = await window.api.store.get('updater')
        await window.api.store.set('updater', { ...cur, autoDownload: v })
      } catch (e) {
        this.updaterAutoDownload = prev
        throw e
      }
    },

    /** 返回 true=成功；false=冲突（组件据此决定 UI） */
    async updateShortcut(action: string, acc: string): Promise<boolean> {
      const ok = await window.api.shortcuts.update(action, acc)
      if (ok) {
        this.shortcuts = { ...this.shortcuts, [action]: acc }
      }
      return ok
    },

    async checkForUpdates(): Promise<void> {
      // updater.check(true) 返回 UpdaterStatus；同时 store 也会通过 onEvent 推送
      this.updaterStatus = await window.api.updater.check(true)
    },

    async skipCurrentVersion(): Promise<void> {
      if (!this.updaterStatus.version) return
      await window.api.updater.skipVersion(this.updaterStatus.version)
    },

    async installUpdate(): Promise<void> {
      await window.api.updater.install()
    },

    /** SectionAbout 拿到完整 status 后调（getStatus IPC 返回） */
    setUpdaterStatus(s: UpdaterStatus): void {
      this.updaterStatus = s
    },

    /**
     * 应用 UpdaterEvent：只更新 state/version/progress 三个字段。
     * lastCheck/skipVersion 不动（避免覆盖 getStatus() 拉到的初始值）。
     */
    applyUpdaterEvent(e: UpdaterEvent): void {
      const s = this.updaterStatus
      switch (e.type) {
        case 'checking':
          this.updaterStatus = { ...s, state: 'checking' }
          break
        case 'available':
          this.updaterStatus = { ...s, state: 'available', version: e.version, progress: null }
          break
        case 'not-available':
          this.updaterStatus = { ...s, state: 'not-available' }
          break
        case 'progress':
          this.updaterStatus = { ...s, state: 'downloading', progress: e.percent }
          break
        case 'downloaded':
          this.updaterStatus = { ...s, state: 'downloaded', version: e.version, progress: 100 }
          break
        case 'skipped':
          this.updaterStatus = { ...s, state: 'skipped' }
          break
        case 'error':
          this.updaterStatus = { ...s, state: 'error' }
          break
      }
    }
  }
})
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/settings.ts
git commit -m "feat(store): add useSettingsStore with lazy load + optimistic writes"
```

---

## Task 6: i18n keys (settings.\*)

**Files:**

- Modify: `src/renderer/src/locales/langs/zh-cn.ts` — add `settings` block
- Modify: `src/renderer/src/locales/langs/en-us.ts` — add `settings` block

- [ ] **Step 1: Add zh-cn keys**

`src/renderer/src/locales/langs/zh-cn.ts` — add after `theme` block (before `route`):

```ts
  settings: {
    title: '设置',
    general: {
      title: '通用',
      launchAtLogin: '开机自启',
      launchAtLoginUnsupported: '当前平台不支持',
      closeBehavior: '关闭按钮行为',
      closeToExit: '退出应用',
      closeToTray: '最小化到托盘',
      notificationsEnabled: '启用系统通知',
      language: '语言'
    },
    appearance: {
      title: '外观',
      darkMode: '暗黑模式',
      primaryColor: '主色'
    },
    shortcuts: {
      title: '快捷键',
      toggleWindow: '唤起窗口',
      recording: '按下组合键…',
      conflict: '冲突，请重按',
      saveFailed: '保存失败',
      conflictMessage: '快捷键冲突，请换一个'
    },
    about: {
      title: '关于',
      version: '版本',
      checkUpdate: '检查更新',
      checking: '正在检查…',
      downloading: '下载中…',
      notAvailable: '已是最新版本',
      skipVersion: '跳过此版本',
      skipped: '已跳过 v{version}',
      downloadAndRestart: '下载并重启',
      autoDownload: '自动下载更新',
      errorMessage: '错误：{message}'
    }
  },
```

- [ ] **Step 2: Add en-us keys**

`src/renderer/src/locales/langs/en-us.ts` — same structure after `theme`:

```ts
  settings: {
    title: 'Settings',
    general: {
      title: 'General',
      launchAtLogin: 'Launch at login',
      launchAtLoginUnsupported: 'Not supported on this platform',
      closeBehavior: 'Close button behavior',
      closeToExit: 'Quit application',
      closeToTray: 'Minimize to tray',
      notificationsEnabled: 'Enable system notifications',
      language: 'Language'
    },
    appearance: {
      title: 'Appearance',
      darkMode: 'Dark mode',
      primaryColor: 'Primary color'
    },
    shortcuts: {
      title: 'Shortcuts',
      toggleWindow: 'Toggle window',
      recording: 'Press combination…',
      conflict: 'Conflict, try again',
      saveFailed: 'Save failed',
      conflictMessage: 'Shortcut conflict, try another'
    },
    about: {
      title: 'About',
      version: 'Version',
      checkUpdate: 'Check for updates',
      checking: 'Checking…',
      downloading: 'Downloading…',
      notAvailable: 'You are on the latest version',
      skipVersion: 'Skip this version',
      skipped: 'Skipped v{version}',
      downloadAndRestart: 'Download and restart',
      autoDownload: 'Auto-download updates',
      errorMessage: 'Error: {message}'
    }
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/locales/langs/zh-cn.ts src/renderer/src/locales/langs/en-us.ts
git commit -m "feat(i18n): add settings.* keys"
```

---

## Task 7: SectionAbout.vue

**Files:**

- Create: `src/renderer/src/layouts/modules/settings/SectionAbout.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingsStore } from '../../../store/settings'
import { useI18nHelpers } from '../../../composables/use-i18n'

defineOptions({ name: 'SectionAbout' })

const settingsStore = useSettingsStore()
const message = useMessage()
const { t } = useI18nHelpers()

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  try {
    const status = await window.api.updater.getStatus()
    settingsStore.setUpdaterStatus(status)
    unsubscribe = await window.api.updater.onEvent(e => {
      settingsStore.applyUpdaterEvent(e)
    })
  } catch (e) {
    console.warn('[settings/about] init failed', e)
  }
})
onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})

const status = computed(() => settingsStore.updaterStatus)
const showProgress = computed(() => status.value.state === 'downloading')
const showInstall = computed(() => status.value.state === 'downloaded')
const showSkip = computed(
  () =>
    status.value.state === 'available' &&
    !!status.value.version &&
    status.value.version !== settingsStore.updaterSkipVersion
)
const checkDisabled = computed(() => ['checking', 'available', 'downloading'].includes(status.value.state))
const checkText = computed(() => {
  switch (status.value.state) {
    case 'checking':
      return t('settings.about.checking')
    case 'downloading':
      return t('settings.about.downloading')
    default:
      return t('settings.about.checkUpdate')
  }
})

const subtitle = computed(() => {
  if (status.value.state === 'not-available') return t('settings.about.notAvailable')
  if (status.value.state === 'skipped' && status.value.version) {
    return t('settings.about.skipped', { version: status.value.version })
  }
  if (status.value.state === 'error') return t('settings.about.errorMessage', { message: '' })
  return ''
})

async function handleCheck(): Promise<void> {
  try {
    await settingsStore.checkForUpdates()
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleSkip(): Promise<void> {
  try {
    await settingsStore.skipCurrentVersion()
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleInstall(): Promise<void> {
  try {
    await settingsStore.installUpdate()
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleAutoDownload(v: boolean): Promise<void> {
  try {
    await settingsStore.setUpdaterAutoDownload(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
</script>

<template>
  <section class="settings-section">
    <h4 class="section-title">{{ t('settings.about.title') }}</h4>

    <div class="row">
      <span>{{ t('settings.about.version') }}</span>
      <code>v{{ settingsStore.appVersion }}</code>
    </div>

    <div class="row">
      <span>{{ t('settings.about.autoDownload') }}</span>
      <NSwitch :value="settingsStore.updaterAutoDownload" @update:value="handleAutoDownload" />
    </div>

    <div class="updater-actions">
      <NButton
        v-if="!showInstall"
        type="primary"
        size="small"
        :loading="status.state === 'checking'"
        :disabled="checkDisabled"
        @click="handleCheck"
      >
        {{ checkText }}
      </NButton>
      <NButton v-if="showInstall" type="primary" size="small" @click="handleInstall">
        {{ t('settings.about.downloadAndRestart') }}
      </NButton>
      <NButton v-if="showSkip" size="small" @click="handleSkip">
        {{ t('settings.about.skipVersion') }}
      </NButton>
    </div>

    <NProgress v-if="showProgress" :percentage="status.progress ?? 0" :height="6" :show-indicator="false" />

    <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.updater-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.subtitle {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/layouts/modules/settings/SectionAbout.vue
git commit -m "feat(settings): add SectionAbout with updater state machine"
```

---

## Task 8: SectionShortcuts.vue

**Files:**

- Create: `src/renderer/src/layouts/modules/settings/SectionShortcuts.vue`

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingsStore } from '../../../store/settings'
import { useI18nHelpers } from '../../../composables/use-i18n'
import { eventToAccelerator, formatAccelerator } from '@shared/accelerator'

defineOptions({ name: 'SectionShortcuts' })

const settingsStore = useSettingsStore()
const message = useMessage()
const { t } = useI18nHelpers()

/** 当前正在录制的 action；null = 非录制态 */
const recordingAction = ref<string | null>(null)
/** 录制态临时显示的 acc（用户按下但未确认） */
const pendingAcc = ref<string>('')
/** 录制态冲突标记 */
const conflict = ref(false)

function startRecording(action: string): void {
  recordingAction.value = action
  pendingAcc.value = ''
  conflict.value = false
}

function cancelRecording(): void {
  recordingAction.value = null
  pendingAcc.value = ''
  conflict.value = false
}

async function commitRecording(): Promise<void> {
  if (!recordingAction.value || !pendingAcc.value) {
    cancelRecording()
    return
  }
  const action = recordingAction.value
  const acc = pendingAcc.value
  const ok = await settingsStore.updateShortcut(action, acc)
  if (ok) {
    recordingAction.value = null
    pendingAcc.value = ''
    conflict.value = false
  } else {
    conflict.value = true
    message.warning(t('settings.shortcuts.conflictMessage'))
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (!recordingAction.value) return
  // Esc 取消、Enter 确认
  if (e.code === 'Escape') {
    e.preventDefault()
    cancelRecording()
    return
  }
  if (e.code === 'Enter') {
    e.preventDefault()
    void commitRecording()
    return
  }
  e.preventDefault()
  const acc = eventToAccelerator(e)
  if (acc) {
    pendingAcc.value = acc
    conflict.value = false
  }
  // acc 为 null（仅 modifier）时保持现状，等用户继续按
}

function displayAcc(action: string): string {
  const acc = settingsStore.shortcuts[action]
  if (!acc) return ''
  return formatAccelerator(acc, settingsStore.platform)
}
</script>

<template>
  <section class="settings-section">
    <h4 class="section-title">{{ t('settings.shortcuts.title') }}</h4>

    <div class="shortcut-row">
      <span class="label">{{ t('settings.shortcuts.toggleWindow') }}</span>
      <input
        v-if="recordingAction === 'toggleWindow'"
        ref="recordingInput"
        class="acc-input"
        :class="{ conflict }"
        :value="pendingAcc ? formatAccelerator(pendingAcc, settingsStore.platform) : ''"
        :placeholder="conflict ? t('settings.shortcuts.conflict') : t('settings.shortcuts.recording')"
        readonly
        @keydown="onKeydown"
        @blur="cancelRecording"
      />
      <button v-else type="button" class="acc-display" @click="startRecording('toggleWindow')">
        {{ displayAcc('toggleWindow') || '—' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.section-title {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.label {
  flex-shrink: 0;
}
.acc-input,
.acc-display {
  min-width: 120px;
  padding: 4px 10px;
  border: 1px solid var(--n-border-color, #ddd);
  border-radius: 4px;
  background: var(--n-color, transparent);
  color: inherit;
  font-family: monospace;
  font-size: 13px;
  text-align: center;
  cursor: pointer;
}
.acc-input:focus {
  outline: none;
  border-color: var(--n-primary-color, #18a058);
}
.acc-input.conflict {
  border-color: #f53f3f;
  color: #f53f3f;
}
.acc-display:hover {
  background: var(--n-color-hover, rgba(0, 0, 0, 0.04));
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/layouts/modules/settings/SectionShortcuts.vue
git commit -m "feat(settings): add SectionShortcuts with accelerator recording"
```

---

## Task 9: SectionGeneral.vue + SectionAppearance.vue

**Files:**

- Create: `src/renderer/src/layouts/modules/settings/SectionGeneral.vue`
- Create: `src/renderer/src/layouts/modules/settings/SectionAppearance.vue`

- [ ] **Step 1: Create SectionGeneral.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useSettingsStore } from '../../../store/settings'
import { useAppStore, type Locale } from '../../../store/app'
import { useThemeStore } from '../../../store/theme'
import { useI18nHelpers } from '../../../composables/use-i18n'

defineOptions({ name: 'SectionGeneral' })

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const themeStore = useThemeStore()
const message = useMessage()
const { t, changeLocale } = useI18nHelpers()

const isLinux = computed(() => settingsStore.platform === 'linux')

async function handleCloseToTray(v: boolean): Promise<void> {
  try {
    await settingsStore.setCloseToTray(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleLaunchAtLogin(v: boolean): Promise<void> {
  try {
    await settingsStore.setLaunchAtLogin(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
async function handleNotificationsEnabled(v: boolean): Promise<void> {
  try {
    await settingsStore.setNotificationsEnabled(v)
  } catch {
    message.error(t('settings.shortcuts.saveFailed'))
  }
}
function handleLocale(v: Locale): void {
  changeLocale(v)
}

// closeToTray NRadio 用 string 值，组件内转换
const closeBehavior = computed<'exit' | 'tray'>({
  get: () => (settingsStore.closeToTray ? 'tray' : 'exit'),
  set: v => handleCloseToTray(v === 'tray')
})

const localeOptions = [
  { label: '简体中文', value: 'zh-cn' },
  { label: 'English', value: 'en-us' }
]
</script>

<template>
  <section class="settings-section">
    <h4 class="section-title">{{ t('settings.general.title') }}</h4>

    <div class="row">
      <span>{{ t('settings.general.launchAtLogin') }}</span>
      <NSwitch :value="settingsStore.launchAtLogin" :disabled="isLinux" @update:value="handleLaunchAtLogin" />
    </div>
    <div v-if="isLinux" class="hint">{{ t('settings.general.launchAtLoginUnsupported') }}</div>

    <div class="row">
      <span>{{ t('settings.general.notificationsEnabled') }}</span>
      <NSwitch :value="settingsStore.notificationsEnabled" @update:value="handleNotificationsEnabled" />
    </div>

    <div class="row vertical">
      <span>{{ t('settings.general.closeBehavior') }}</span>
      <NRadioGroup :value="closeBehavior" @update:value="(v: 'exit' | 'tray') => (closeBehavior = v)">
        <NRadio value="exit">{{ t('settings.general.closeToExit') }}</NRadio>
        <NRadio value="tray">{{ t('settings.general.closeToTray') }}</NRadio>
      </NRadioGroup>
    </div>

    <div class="row vertical">
      <span>{{ t('settings.general.language') }}</span>
      <NSelect
        :value="appStore.locale"
        :options="localeOptions"
        size="small"
        style="max-width: 200px"
        @update:value="(v: Locale) => handleLocale(v)"
      />
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.section-title {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.row.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.hint {
  font-size: 12px;
  color: var(--n-text-color-3, #999);
  margin-top: -8px;
}
</style>
```

- [ ] **Step 2: Create SectionAppearance.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore, PRESET_COLORS, type PresetColor } from '../../../store/theme'
import { useI18nHelpers } from '../../../composables/use-i18n'

defineOptions({ name: 'SectionAppearance' })

const themeStore = useThemeStore()
const { t } = useI18nHelpers()

const colorOptions = computed(() =>
  (Object.keys(PRESET_COLORS) as PresetColor[]).map(key => ({
    key,
    label: t(`theme.preset.${key}`),
    color: PRESET_COLORS[key]
  }))
)

function selectColor(key: PresetColor): void {
  themeStore.setPrimaryColor(key)
}
</script>

<template>
  <section class="settings-section">
    <h4 class="section-title">{{ t('settings.appearance.title') }}</h4>

    <div class="row">
      <span>{{ t('settings.appearance.darkMode') }}</span>
      <NSwitch :value="themeStore.darkMode" @update:value="themeStore.setDark" />
    </div>

    <div class="row vertical">
      <span>{{ t('settings.appearance.primaryColor') }}</span>
      <div class="chips">
        <div
          v-for="opt in colorOptions"
          :key="opt.key"
          class="chip"
          :class="{ active: themeStore.primaryColor === opt.key }"
          :style="{ backgroundColor: opt.color }"
          :title="opt.label"
          @click="selectColor(opt.key)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.section-title {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.row.vertical {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.chips {
  display: flex;
  gap: 8px;
}
.chip {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}
.chip.active {
  border-color: var(--n-text-color-1, #333);
}
</style>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/layouts/modules/settings/SectionGeneral.vue src/renderer/src/layouts/modules/settings/SectionAppearance.vue
git commit -m "feat(settings): add SectionGeneral and SectionAppearance"
```

---

## Task 10: SettingsDrawer.vue container

**Files:**

- Create: `src/renderer/src/layouts/modules/settings/SettingsDrawer.vue`

- [ ] **Step 1: Create the container**

```vue
<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useSettingsStore } from '../../../store/settings'
import { useI18nHelpers } from '../../../composables/use-i18n'
import SectionGeneral from './SectionGeneral.vue'
import SectionAppearance from './SectionAppearance.vue'
import SectionShortcuts from './SectionShortcuts.vue'
import SectionAbout from './SectionAbout.vue'

defineOptions({ name: 'SettingsDrawer' })

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const settingsStore = useSettingsStore()
const { t } = useI18nHelpers()

const showModel = computed({
  get: () => props.show,
  set: v => emit('update:show', v)
})

/** 抽屉首次打开时触发 loadAll */
watch(
  () => props.show,
  open => {
    if (open && !settingsStore.loaded && !settingsStore.loadError) {
      void settingsStore.loadAll()
    }
  }
)

const reloadKey = ref(0)
async function retryLoad(): Promise<void> {
  reloadKey.value++
  await settingsStore.loadAll()
}
</script>

<template>
  <NDrawer v-model:show="showModel" :width="400" placement="right">
    <NDrawerContent :title="t('settings.title')" closable>
      <NSpin :show="!settingsStore.loaded && !settingsStore.loadError">
        <div v-if="settingsStore.loadError" class="error-state">
          <p>{{ t('settings.shortcuts.saveFailed') }}</p>
          <NButton size="small" @click="retryLoad">Retry</NButton>
        </div>
        <NSpace v-else vertical :size="20">
          <SectionGeneral :key="`g-${reloadKey}`" />
          <SectionAppearance :key="`a-${reloadKey}`" />
          <SectionShortcuts :key="`s-${reloadKey}`" />
          <SectionAbout :key="`b-${reloadKey}`" />
        </NSpace>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/layouts/modules/settings/SettingsDrawer.vue
git commit -m "feat(settings): add SettingsDrawer container"
```

---

## Task 11: base-layout integration + delete ThemeDrawer

**Files:**

- Modify: `src/renderer/src/layouts/base-layout.vue` — replace ThemeDrawer with SettingsDrawer
- Delete: `src/renderer/src/layouts/modules/theme-drawer.vue`

- [ ] **Step 1: Update base-layout.vue**

`src/renderer/src/layouts/base-layout.vue` — three edits:

**Edit A**: Change the import (around line 14):

```ts
import ThemeDrawer from './modules/theme-drawer.vue'
```

becomes:

```ts
import SettingsDrawer from './modules/settings/SettingsDrawer.vue'
```

**Edit B**: Change the state ref (around line 31):

```ts
const showThemeDrawer = ref(false)
```

becomes:

```ts
const showSettingsDrawer = ref(false)
```

**Edit C**: Change the header button (around line 174-178):

```html
<NButton quaternary size="small" @click="showThemeDrawer = true">
  <template #icon>
    <IconifyIcon icon="carbon:settings-adjust" />
  </template>
</NButton>
```

becomes:

```html
<NButton quaternary size="small" @click="showSettingsDrawer = true">
  <template #icon>
    <IconifyIcon icon="carbon:settings-adjust" />
  </template>
</NButton>
```

**Edit D**: Change the drawer mount (around line 219):

```html
<ThemeDrawer v-model:show="showThemeDrawer" />
```

becomes:

```html
<SettingsDrawer v-model:show="showSettingsDrawer" />
```

- [ ] **Step 2: Delete theme-drawer.vue**

```bash
rm src/renderer/src/layouts/modules/theme-drawer.vue
```

- [ ] **Step 3: Typecheck + lint + fmt**

Run: `pnpm typecheck && pnpm lint && pnpm fmt`
Expected: PASS. (No references to ThemeDrawer remain anywhere in the codebase.)

- [ ] **Step 4: Commit**

```bash
git add -A src/renderer/src/layouts/
git commit -m "refactor(layout): replace ThemeDrawer with SettingsDrawer"
```

---

## Task 12: CLAUDE.md pitfall + final verification

**Files:**

- Modify: `CLAUDE.md` — append pitfall #24

- [ ] **Step 1: Append pitfall to CLAUDE.md**

Find the "Common Pitfalls" section (ends at pitfall #23). Add #24 after it:

```markdown
24. **macOS 开机自启依赖 sandbox=false**（Phase 2.6 设置抽屉）—— `app.setLoginItemSettings({ openAtLogin: true })` 在 sandbox 启用时会被 macOS 拒绝（需要 entitlements）。当前 `sandbox: false` 开箱可用；将来 Phase 2.7+ 收紧 sandbox 时此项可能失效，需要补充 `com.apple.security.login-item` entitlement 并测试。
```

- [ ] **Step 2: Run full quality gate**

Run: `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test`
Expected: PASS — all checks green, including 31 tests (18 tab-helpers + 13 accelerator).

- [ ] **Step 3: Manual smoke test**

Start: `pnpm dev`
Verify each item in the drawer:

- 通用：开机自启 toggle 持久化（重启 dev 仍勾选）、关闭行为 radio 切换后关窗口走对应路径、通知开关、语言切换响应
- 外观：暗黑、主色 4 chip
- 快捷键：点 row 进入录制态、按 Ctrl+Shift+L 显示、Enter 确认生效、Esc 取消、按已占用组合键弹冲突
- 关于：版本号、检查更新按钮、自动下载 switch、（如有更新）进度条 + 跳过 + 下载并重启
- Linux：开机自启 disabled（mac/win 上正常）

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add macOS login-item sandbox pitfall"
```

---

## Spec coverage check (self-review)

Cross-checking spec `2026-07-08-settings-drawer-design.md` sections against tasks:

| Spec section                                          | Task(s)                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1. Goal/non-goal                                      | (scope, no task)                                                                |
| 2.A 通用 (3 + notifications added = 4 items)          | Task 9 (SectionGeneral)                                                         |
| 2.B 外观 (2 items)                                    | Task 9 (SectionAppearance)                                                      |
| 2.C 快捷键 (1 item, recording + conflict + Esc/Enter) | Task 8 (SectionShortcuts)                                                       |
| 2.D 关于/更新 (6 items, state machine)                | Task 7 (SectionAbout)                                                           |
| 3. 文件落点                                           | All tasks                                                                       |
| 3. useSettingsStore state                             | Task 5                                                                          |
| 4. settingsStore actions                              | Task 5                                                                          |
| 4. accelerator util                                   | Task 4                                                                          |
| 4. app IPC                                            | Task 2                                                                          |
| 4. Preload 暴露                                       | Task 3                                                                          |
| 4. StoreSchema 改动                                   | Task 1                                                                          |
| 4. UpdaterManager autoDownload                        | Task 1                                                                          |
| 5. 数据流（冷启动 / 乐观更新 / 状态机）               | Task 5 (loadAll + actions), Task 7 (state machine)                              |
| 6. 错误处理矩阵                                       | Task 5 (rollback), Task 7 (error state), Task 8 (conflict)                      |
| 7. 测试范围                                           | Task 4 (accelerator tests)                                                      |
| 8. 风险清单                                           | Task 1 (autoDownload order), Task 9 (Linux disabled), Task 12 (sandbox pitfall) |
| 9. 实现顺序                                           | Tasks 1-12 in order                                                             |
| 10. DoD                                               | Task 12 Step 2-3                                                                |

All spec sections covered. Notifications toggle added as deviation #2 (spec section 2 omitted it but state/actions include it).

## Type consistency check

- `ElectronAppApi` (Task 3) → used by preload (Task 3) and settingsStore `window.api.app.*` (Task 5) ✓
- `AcceleratorInput` (Task 4) → structurally satisfied by KeyboardEvent in SectionShortcuts (Task 8) ✓
- `UpdaterStatus` / `UpdaterEvent` (existing in `@shared/types`) → used in settingsStore state + actions (Task 5) ✓
- `setCloseToTray` / `setLaunchAtLogin` / `setNotificationsEnabled` / `setUpdaterAutoDownload` / `updateShortcut` / `checkForUpdates` / `skipCurrentVersion` / `installUpdate` / `setUpdaterStatus` / `applyUpdaterEvent` — all defined in Task 5, all consumed by Tasks 7-9 ✓

Plan complete.
