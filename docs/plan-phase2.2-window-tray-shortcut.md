# Phase 2.2 — Window Manager + Tray + Global Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a window-manager / tray / global-shortcut subsystem to hohu-admin-desktop so the framework "feels like a desktop app" — single-instance lock, persisted window state, tray icon with right-click menu, close-to-tray, and a default `Cmd/Ctrl+Shift+H` global shortcut.

**Architecture:** Three single-class services (`WindowManager`, `TrayManager`, `ShortcutManager`) in `src/main/services/`, integrated by `src/main/index.ts`. Only one IPC bridge (`shortcuts:list` / `shortcuts:update`) exposed to renderer. All window/tray state persists via the existing electron-store from Phase 2.1.

**Tech Stack:** Electron BrowserWindow / Tray / Menu / nativeImage / globalShortcut / app; electron-store; electron-log.

**Spec:** `docs/spec-phase2.2-window-tray-shortcut.md`

**Project conventions (override skill defaults):**

- **No unit test framework.** Each task ends with `pnpm typecheck && pnpm lint && pnpm fmt` as the automated gate, plus targeted manual verification at the end of the task (run `pnpm dev`, observe behavior, stop the dev server before commit).
- **Commit style:** Conventional Commits, lowercase, one line — e.g. `feat: phase 2.2 window manager with single-instance lock`. Pre-commit hook runs typecheck + lint + fmt; do NOT use `--no-verify`.
- **Pre-commit failure on format:** run `pnpm format` then re-stage. Do NOT skip hooks.
- **HMR caveat:** Restart `pnpm dev` after editing `electron.vite.config.ts`, `tsconfig.*.json`, `.env*`, or anything under `src/main/` or `src/preload/`. HMR only covers renderer.

---

## File Structure

| File                            | Status | Responsibility                                                                       |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `src/shared/types.ts`           | Modify | Add `ShortcutsApi`; extend `AppApi`                                                  |
| `src/main/services/window.ts`   | Create | WindowManager singleton: main window + state persistence + multi-window API          |
| `src/main/services/tray.ts`     | Create | TrayManager singleton: tray icon + menu + close-to-tray decision                     |
| `src/main/services/shortcut.ts` | Create | ShortcutManager singleton: register/unregister/update global shortcuts               |
| `src/main/ipc/shortcut.ts`      | Create | `registerShortcutIpc()` — `shortcuts:list` / `shortcuts:update`                      |
| `src/main/ipc/index.ts`         | Modify | Call `registerShortcutIpc()` in `registerAllIpc()`                                   |
| `src/preload/index.ts`          | Modify | Expose `window.api.shortcuts.{list, update}` via contextBridge                       |
| `src/main/index.ts`             | Modify | Use `windowManager.createMainWindow`; add single-instance lock; wire tray + shortcut |

---

## Task 1: Extend Shared Types

**Files:**

- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add ShortcutsApi and extend AppApi**

Open `src/shared/types.ts`. Find the `ThemeApi` interface block (added in Phase 2.1) and append the `ShortcutsApi` interface after it. Also extend `AppApi` to include `shortcuts`.

After the existing `ThemeApi` interface, insert:

```ts
/**
 * Shortcuts 桥：渲染层读取/更新全局快捷键配置（设置页用）。
 * action 名固定在主进程 ACTION_HANDLERS 里，渲染层不能注册任意 action。
 * update 返回 boolean：false 表示快捷键被其他应用占用，注册失败。
 */
export interface ShortcutsApi {
  list: () => Promise<Record<string, string>>
  update: (action: string, accelerator: string) => Promise<boolean>
}
```

Then find `AppApi` and add `shortcuts: ShortcutsApi` to it (alongside `theme: ThemeApi`):

```ts
export interface AppApi {
  secureStore: SecureStoreApi
  http: HttpApi
  shell: ShellApi
  logger: LoggerApi
  store: StoreApi
  theme: ThemeApi
  shortcuts: ShortcutsApi
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS. The new types are pure declarations; nothing references them yet.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: phase 2.2 shared types for shortcuts ipc"
```

---

## Task 2: WindowManager + main/index.ts Refactor + Single Instance Lock

**Files:**

- Create: `src/main/services/window.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the WindowManager service**

Create `src/main/services/window.ts` with this EXACT content:

```ts
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { store } from './store'
import log from './logger'

const logger = log.scope('window')

class WindowManagerClass {
  private mainWindow: BrowserWindow | null = null
  /** 缓存第一次 createMainWindow 传进来的 opts（如 webPreferences.preload），
   *  activate 等无参调用时复用，避免创建无 preload 的破窗口 */
  private mainWindowOpts: BrowserWindowConstructorOptions = {}
  private windows = new Map<string, BrowserWindow>()
  private saveStateTimer: NodeJS.Timeout | null = null

  createMainWindow(opts?: BrowserWindowConstructorOptions): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow
    }

    // 缓存 opts：后续 activate 等无参调用能复用 webPreferences 等配置
    if (opts) this.mainWindowOpts = opts
    const mergedOpts = this.mainWindowOpts

    const saved = store.get('windowState')
    const win = new BrowserWindow({
      width: saved.width,
      height: saved.height,
      x: saved.x ?? undefined,
      y: saved.y ?? undefined,
      minWidth: 1024,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      // 直接传 constructor options 避免"先创建再 maximize"的可见闪烁
      maximized: saved.isMaximized ?? false,
      fullscreen: saved.isFullScreen ?? false,
      ...mergedOpts
    })

    // 状态变化监听（防抖 500ms）
    const scheduleSave = (): void => {
      if (this.saveStateTimer) clearTimeout(this.saveStateTimer)
      this.saveStateTimer = setTimeout(() => this.saveState(win), 500)
    }
    win.on('resize', scheduleSave)
    win.on('move', scheduleSave)
    win.on('maximize', scheduleSave)
    win.on('unmaximize', scheduleSave)

    // 持久化 isFullScreen 立即写（频繁切换，不需要防抖）
    win.on('enter-full-screen', () => this.saveState(win))
    win.on('leave-full-screen', () => this.saveState(win))

    // 真关闭时清理引用（close-to-tray=false 场景才会触发）
    win.on('closed', () => {
      if (this.mainWindow === win) this.mainWindow = null
    })

    this.mainWindow = win
    return win
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow && !this.mainWindow.isDestroyed() ? this.mainWindow : null
  }

  /** Phase 3 用：创建额外窗口（overlay 等） */
  create(name: string, opts: BrowserWindowConstructorOptions): BrowserWindow {
    if (this.windows.has(name)) {
      throw new Error(`Window "${name}" already exists`)
    }
    const win = new BrowserWindow(opts)
    this.windows.set(name, win)
    win.on('closed', () => this.windows.delete(name))
    return win
  }

  get(name: string): BrowserWindow | null {
    const win = this.windows.get(name)
    return win && !win.isDestroyed() ? win : null
  }

  show(): void {
    this.getMainWindow()?.show()
  }

  hide(): void {
    this.getMainWindow()?.hide()
  }

  toggle(): void {
    const win = this.getMainWindow()
    if (!win) return
    if (win.isVisible() && !win.isMinimized()) {
      win.hide()
    } else {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  }

  /** 把窗口当前状态写入 store */
  private saveState(win: BrowserWindow): void {
    if (win.isDestroyed()) return
    try {
      const bounds = win.getBounds()
      store.set('windowState', {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        isMaximized: win.isMaximized(),
        isFullScreen: win.isFullScreen()
      })
    } catch (e) {
      logger.error('Failed to save window state', e)
    }
  }
}

export const windowManager = new WindowManagerClass()
```

- [ ] **Step 2: Refactor main/index.ts to use windowManager + add single instance lock**

Replace the entire contents of `src/main/index.ts` with:

```ts
import { app, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initSecureStore } from './services/secure-store'
import { windowManager } from './services/window'
import { registerAllIpc } from './ipc'

// 单例锁：第二次启动直接 focus 已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = windowManager.getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  // 标记是否真的要退出（close-to-tray 流程用，Phase 2.2 后续 Task 4 加）
  let isQuitting = false
  app.on('before-quit', () => {
    isQuitting = true
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('org.hohu.app')

    initSecureStore()
    registerAllIpc()

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const win = windowManager.createMainWindow({
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false
      }
    })

    win.on('ready-to-show', () => {
      win.show()
    })

    // 外链点击交给系统浏览器，不在 Electron 内打开
    win.webContents.setWindowOpenHandler(details => {
      void shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    app.on('activate', () => {
      // macOS dock 点击：窗口存在就 show，不存在才 create
      const existing = windowManager.getMainWindow()
      if (existing) {
        existing.show()
      } else {
        windowManager.createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    // macOS 约定：关掉最后一个窗口不退出，留在 dock
    // close-to-tray 默认模式下 window-all-closed 不会触发（窗口被 hide 而非 close）
    if (process.platform === 'darwin' && !isQuitting) {
      return
    }
    app.quit()
  })
}
```

Notes:

- `BrowserWindow` import is removed (windowManager owns window creation now).
- `isQuitting` is set up here so Task 4 (TrayManager) can use it without restructuring.
- The original Phase 1 `ready-to-show` event handler is preserved (windowManager uses `show: false`).
- `close-to-tray` logic is NOT added here yet — Task 4 adds it after TrayManager exists.

- [ ] **Step 3: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS. If `pnpm fmt` reports formatting issues, run `pnpm format` then re-run `pnpm fmt` to confirm clean.

- [ ] **Step 4: Manual verification — window state persistence**

Make sure no Electron process is running (`ps aux | grep -i electron`). Then:

```bash
pnpm dev
```

Once the window opens:

1. Drag the window to a different position and resize it slightly.
2. Wait > 1 second (debounce is 500ms).
3. Quit the app via Cmd+Q (mac) / window close → app process exit. Verify it actually quits (close the dev server in terminal if needed).

To check the persisted state:

```bash
cat ~/Library/Application\ Support/hohu-admin-desktop/config.json
```

Expected: `windowState` shows the new `width`/`height`/`x`/`y` (macOS path; Windows: `%APPDATA%\hohu-admin-desktop\config.json`; Linux: `~/.config/hohu-admin-desktop/config.json`).

Restart `pnpm dev` — the window should appear at the same position/size.

- [ ] **Step 5: Manual verification — single instance lock**

Start one `pnpm dev` instance. While it's running, start a second `pnpm dev` in a new terminal.

Expected:

- Second instance prints something like "Second instance detected, exiting..." and quits immediately.
- First instance's main window gets focused (comes to front).

Stop the second process. Keep the first running for Step 6.

- [ ] **Step 6: Manual verification — single instance lock behavior**

Confirm Phase 1 functionality still works in the running app:

- Login flow completes
- Menu renders with icons and translated labels
- Dark mode toggle still works
- Language switch still works

Stop the dev server before committing.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/window.ts src/main/index.ts
git commit -m "feat: phase 2.2 window manager with single-instance lock"
```

---

## Task 3: TrayManager + close-to-tray Integration

**Files:**

- Create: `src/main/services/tray.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the TrayManager service**

Create `src/main/services/tray.ts` with this EXACT content:

```ts
import { app, Tray, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { windowManager } from './window'
import { store } from './store'
import log from './logger'
// 复用现有 app icon 作为 tray icon。
// macOS 推荐 16×16 单色 template image（tray-icon-template@2x.png），
// 开发者后续可以替换 import 路径到自定义资源。
import trayIconUrl from '../../resources/icon.png?asset'

const logger = log.scope('tray')

class TrayManagerClass {
  private tray: Tray | null = null

  init(): void {
    if (this.tray) return

    const image = nativeImage.createFromPath(trayIconUrl)
    if (image.isEmpty()) {
      logger.warn('Tray icon not found, using empty image')
    }
    // macOS 推荐 resize 到 22×22，避免大图被压扁模糊
    const resized = process.platform === 'darwin' ? image.resize({ width: 22, height: 22 }) : image

    this.tray = new Tray(resized.isEmpty() ? nativeImage.createEmpty() : resized)
    this.tray.setToolTip(app.getName())

    // macOS 默认双击托盘会触发两次 'click'，导致 toggle → toggle 看起来"没反应"
    this.tray.setIgnoreDoubleClickEvents(true)

    // 单击 toggle 窗口（mac/win/linux 都是 click）
    this.tray.on('click', () => windowManager.toggle())

    this.refreshMenu()
  }

  /** 根据当前窗口可见性刷新菜单（Show ↔ Hide 切换） */
  refreshMenu(): void {
    if (!this.tray) return
    const win = windowManager.getMainWindow()
    const isVisible = !!win && win.isVisible() && !win.isMinimized()

    const template: MenuItemConstructorOptions[] = [
      { label: isVisible ? 'Hide' : 'Show', click: () => windowManager.toggle() },
      { type: 'separator' },
      { label: 'Reload', click: () => win?.reload() },
      { label: 'DevTools', click: () => win?.webContents.toggleDevTools() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]

    this.tray.setContextMenu(Menu.buildFromTemplate(template))
  }

  /** 由 main/index.ts 调用：判断是否应该 close-to-tray（读 store.tray.closeToTray） */
  shouldCloseToTray(): boolean {
    return store.get('tray').closeToTray
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

export const trayManager = new TrayManagerClass()
```

- [ ] **Step 2: Integrate TrayManager into main/index.ts**

In `src/main/index.ts`, make three changes:

**(a) Add the import** at the top with the other service imports:

```ts
import { trayManager } from './services/tray'
```

**(b) Initialize tray + add close-to-tray + menu refresh**

Inside the `app.whenReady().then(() => { ... })` block, after the existing `win.loadURL(...)` / `win.loadFile(...)` block and before the `app.on('activate', ...)`, add:

```ts
// close-to-tray：根据 store.tray.closeToTray 决定（isQuitting=true 时强制放行）
win.on('close', event => {
  if (!isQuitting && trayManager.shouldCloseToTray()) {
    event.preventDefault()
    windowManager.hide()
  }
})

// 托盘初始化
trayManager.init()

// 窗口可见性变化时刷新托盘菜单（Show ↔ Hide 标签）
win.on('show', () => trayManager.refreshMenu())
win.on('hide', () => trayManager.refreshMenu())
win.on('minimize', () => trayManager.refreshMenu())
win.on('restore', () => trayManager.refreshMenu())
```

- [ ] **Step 3: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS.

- [ ] **Step 4: Manual verification — tray icon visible**

Run `pnpm dev`. Once the window opens:

- macOS: tray icon appears in the top menu bar (right side)
- Windows: tray icon appears in the system tray (bottom-right)
- Linux: tray icon appears in the notification area (depends on desktop environment)

If the icon looks blurry on macOS, that's expected — `resources/icon.png` is the full-color app icon, not a macOS template image. Documented in the spec.

- [ ] **Step 5: Manual verification — tray click + menu**

With `pnpm dev` running:

- Click the tray icon → main window hides (if visible) or shows (if hidden). Test both directions.
- Right-click the tray icon → context menu shows 5 items: Hide (or Show), separator, Reload, DevTools, separator, Quit.
- The first item label updates when window visibility changes (Hide ↔ Show).

- [ ] **Step 6: Manual verification — close-to-tray**

Click the main window's red X / close button.

Expected: window disappears but the app process is still running (tray icon still visible, dev server still listening on port 5173). Click the tray icon → window reappears.

- [ ] **Step 7: Manual verification — real quit**

Right-click tray icon → click "Quit".

Expected: app process exits, dev server in the terminal prints "exited" or similar. Tray icon disappears.

- [ ] **Step 8: Manual verification — persisted maximized state**

Run `pnpm dev`. Click the green maximize button on the main window. Wait 1 second. Click tray Quit.

Restart `pnpm dev`. Expected: window opens already maximized.

- [ ] **Step 9: Commit**

Stop the dev server, then:

```bash
git add src/main/services/tray.ts src/main/index.ts
git commit -m "feat: phase 2.2 tray with close-to-tray and dynamic menu"
```

---

## Task 4: ShortcutManager + Integration

**Files:**

- Create: `src/main/services/shortcut.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the ShortcutManager service**

Create `src/main/services/shortcut.ts` with this EXACT content:

```ts
import { globalShortcut } from 'electron'
import { store } from './store'
import { windowManager } from './window'
import log from './logger'

const logger = log.scope('shortcut')

/** action → 回调映射。Phase 2.2 只有一个，Phase 3 可以扩展 */
const ACTION_HANDLERS: Record<string, () => void> = {
  toggleWindow: () => windowManager.toggle()
}

class ShortcutManagerClass {
  /** 启动时调用：写入默认 shortcuts（如果空）+ 注册全部 */
  init(): void {
    const current = store.get('shortcuts')
    if (Object.keys(current).length === 0) {
      store.set('shortcuts', { toggleWindow: 'CommandOrControl+Shift+H' })
    }
    this.registerAll()
  }

  /** 注册 store.shortcuts 里的所有 action */
  registerAll(): void {
    const shortcuts = store.get('shortcuts')
    for (const [action, accelerator] of Object.entries(shortcuts)) {
      this.registerOne(action, accelerator)
    }
  }

  registerOne(action: string, accelerator: string): boolean {
    const handler = ACTION_HANDLERS[action]
    if (!handler) {
      logger.warn(`Unknown action: ${action}`)
      return false
    }
    // 注意：这里只注销当前 accelerator。如果同一 action 之前注册过不同 accelerator，
    // 调用方必须先用 update() 而不是 registerOne()，否则旧的 accelerator 不会被注销。
    globalShortcut.unregister(accelerator)
    const ok = globalShortcut.register(accelerator, handler)
    if (!ok) {
      logger.warn(`Failed to register shortcut ${accelerator} for ${action} (likely conflict)`)
    }
    return ok
  }

  /** 更新某 action 的 accelerator + 重新注册。
   *  只有注册成功才写 store，避免冲突的 accelerator 留在 store 里反复触发 warn。 */
  update(action: string, accelerator: string): boolean {
    const oldAcc = store.get('shortcuts')[action]
    if (oldAcc) globalShortcut.unregister(oldAcc)
    const ok = this.registerOne(action, accelerator)
    if (ok) {
      // 用 spread 创建新对象再 set，避免直接 mutate store 返回的引用
      store.set('shortcuts', { ...store.get('shortcuts'), [action]: accelerator })
    } else if (oldAcc) {
      // 注册失败：恢复旧 accelerator，保持状态一致
      this.registerOne(action, oldAcc)
    }
    return ok
  }

  /** 取消所有注册（app 退出时调用） */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
  }
}

export const shortcutManager = new ShortcutManagerClass()
```

- [ ] **Step 2: Integrate ShortcutManager into main/index.ts**

In `src/main/index.ts`, make three changes:

**(a) Add the import** at the top:

```ts
import { shortcutManager } from './services/shortcut'
```

**(b) Initialize shortcut manager after trayManager.init()**

Find the line `trayManager.init()` (added in Task 3). Right after it, add:

```ts
shortcutManager.init()
```

**(c) Unregister shortcuts on quit**

Find the `app.on('window-all-closed', ...)` block. Inside it, BEFORE `app.quit()`, add:

```ts
shortcutManager.unregisterAll()
```

The final `window-all-closed` block should look like:

```ts
app.on('window-all-closed', () => {
  if (process.platform === 'darwin' && !isQuitting) {
    return
  }
  shortcutManager.unregisterAll()
  app.quit()
})
```

- [ ] **Step 3: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS.

- [ ] **Step 4: Manual verification — default shortcut is registered**

Run `pnpm dev`. After the window opens, focus a different application (e.g. open a browser window on top).

Press `Cmd+Shift+H` (mac) or `Ctrl+Shift+H` (win/linux).

Expected: the main window toggles visibility (hides if visible, shows if hidden). Try pressing it again — window toggles back.

- [ ] **Step 5: Manual verification — store.shortcuts has the default**

In DevTools Console (`F12` or via tray → DevTools):

```js
await window.api.store.get('shortcuts')
```

Expected: `{ toggleWindow: 'CommandOrControl+Shift+H' }`.

If this returns `{}`, the default wasn't written. Restart the dev server once — the default writes only when store is empty on init.

- [ ] **Step 6: Manual verification — conflict doesn't crash**

In DevTools Console:

```js
// Try to update to a likely-conflicting accelerator
await window.api.shortcuts.update('toggleWindow', 'CommandOrControl+C')
```

Note: this requires Task 5 (IPC) to be implemented. **If Task 5 is not yet committed, skip this step and verify after Task 5.** Expected behavior once IPC exists: returns `false` if the accelerator is taken (system-wide), `true` otherwise. Either way, the app stays running.

Stop the dev server before committing.

- [ ] **Step 7: Commit**

```bash
git add src/main/services/shortcut.ts src/main/index.ts
git commit -m "feat: phase 2.2 global shortcut manager with toggle-window default"
```

---

## Task 5: IPC Bridge + Preload Extension

**Files:**

- Create: `src/main/ipc/shortcut.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create the IPC handler**

Create `src/main/ipc/shortcut.ts` with this EXACT content:

```ts
import { ipcMain } from 'electron'
import { store } from '@main/services/store'
import { shortcutManager } from '@main/services/shortcut'

/**
 * Shortcut IPC 通道。
 * - list：读取 store.shortcuts（设置页展示用）
 * - update：更新某 action 的 accelerator + 重新注册；返回 boolean（false=冲突）
 */
export const SHORTCUT_CHANNELS = {
  LIST: 'shortcuts:list',
  UPDATE: 'shortcuts:update'
} as const

export function registerShortcutIpc(): void {
  ipcMain.handle(SHORTCUT_CHANNELS.LIST, () => store.get('shortcuts'))
  ipcMain.handle(SHORTCUT_CHANNELS.UPDATE, (_e, action: string, accelerator: string) => {
    return shortcutManager.update(action, accelerator)
  })
}
```

- [ ] **Step 2: Register the new IPC in `registerAllIpc()`**

Replace `src/main/ipc/index.ts` with:

```ts
import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'
import { registerStoreIpc } from './store'
import { registerThemeIpc } from './theme'
import { registerShortcutIpc } from './shortcut'

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
  registerThemeIpc()
  registerShortcutIpc()
}
```

- [ ] **Step 3: Expose `shortcuts` on `window.api` via preload**

In `src/preload/index.ts`, add the shortcuts bridge after the `theme` block (before the `const api = {` line):

```ts
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
```

Then update the `api` object to include `shortcuts`:

```ts
const api = {
  secureStore,
  http,
  shell,
  logger,
  store,
  theme,
  shortcuts
}
```

- [ ] **Step 4: Typecheck, lint, format**

Run:

```bash
pnpm typecheck && pnpm lint && pnpm fmt
```

Expected: PASS.

- [ ] **Step 5: Manual verification — IPC shortcuts:list works**

Run `pnpm dev`. In DevTools Console:

```js
await window.api.shortcuts.list()
```

Expected: `{ toggleWindow: 'CommandOrControl+Shift+H' }`.

- [ ] **Step 6: Manual verification — IPC shortcuts:update works**

In DevTools Console, change the shortcut to something memorable:

```js
await window.api.shortcuts.update('toggleWindow', 'Alt+Shift+T')
```

Expected: returns `true`. The old `Cmd/Ctrl+Shift+H` no longer works; pressing `Alt+Shift+T` (with another app focused) toggles the window.

Restore the default:

```js
await window.api.shortcuts.update('toggleWindow', 'CommandOrControl+Shift+H')
```

Expected: returns `true`. Old shortcut works again.

Verify persistence — quit the app, restart `pnpm dev`, then in Console:

```js
await window.api.shortcuts.list()
```

Expected: still `{ toggleWindow: 'CommandOrControl+Shift+H' }`.

- [ ] **Step 7: Manual verification — unknown action is rejected**

In DevTools Console:

```js
await window.api.shortcuts.update('frobnicate', 'CommandOrControl+X')
```

Expected: returns `false` (action not in `ACTION_HANDLERS`). The shortcut does NOT register and does NOT get written to store. Verify:

```js
await window.api.shortcuts.list()
```

Expected: `{ toggleWindow: 'CommandOrControl+Shift+H' }` — no `frobnicate` key added.

Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/shortcut.ts src/main/ipc/index.ts src/preload/index.ts
git commit -m "feat: phase 2.2 shortcuts ipc for list and update"
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
git log --oneline -7
```

Expected: 5 new commits on top of `c9dafa7` (the spec fixes commit), one per task, all Conventional Commits format.

- [ ] **Step 3: Walk the spec's verification checklist**

Re-execute each row of the table in Section 9 of `docs/spec-phase2.2-window-tray-shortcut.md`:

| Spec verification item                        | Confirmed via                   |
| --------------------------------------------- | ------------------------------- |
| `pnpm typecheck` / `lint` / `fmt` pass        | Final Step 1                    |
| Main window starts at saved size/pos          | Task 2 Step 4                   |
| Drag + restart → position saved               | Task 2 Step 4                   |
| Maximized state persists                      | Task 3 Step 8                   |
| Single instance lock                          | Task 2 Step 5                   |
| Tray icon visible                             | Task 3 Step 4                   |
| Tray click toggles window                     | Task 3 Step 5                   |
| Tray menu (Show/Hide, Reload, DevTools, Quit) | Task 3 Step 5                   |
| close-to-tray behavior                        | Task 3 Step 6                   |
| Real quit via tray menu                       | Task 3 Step 7                   |
| Default shortcut in store                     | Task 4 Step 5                   |
| Default shortcut triggers                     | Task 4 Step 4                   |
| Conflict doesn't crash                        | Task 4 Step 6 (after Task 5)    |
| `shortcuts:list` IPC                          | Task 5 Step 5                   |
| `shortcuts:update` IPC                        | Task 5 Step 6                   |
| Phase 1 still works                           | Task 2 Step 6                   |
| Phase 2.1 still works                         | Task 5 Step 5 (store.get works) |

Any failing item → file an issue or fix as a follow-up commit before declaring Phase 2.2 complete.

---

## Notes for the Implementing Agent

- **Tray icon resource:** Phase 2.2 reuses `resources/icon.png` as the tray icon (no new PNG added). On macOS this looks like a full-color icon in the menu bar — not ideal but functional. The spec documents that developers can swap to a 16×16 template image (e.g. `tray-icon-template@2x.png`). Do NOT generate a placeholder PNG; the framework's "works out of the box" is more important than perfect macOS appearance.
- **macOS double-click:** The spec note about `setIgnoreDoubleClickEvents(true)` is important — without it, double-clicking the tray icon fires two `click` events, toggling the window twice and leaving it in the original state.
- **Pre-commit hook** runs `pnpm typecheck && pnpm lint && pnpm fmt && git diff --exit-code`. If `pnpm fmt` fails, run `pnpm format` then re-stage.
- **`windowManager.createMainWindow` caches opts:** The activate handler (Task 2 Step 2) calls `createMainWindow()` without opts. This works because WindowManager caches the first call's opts (including `webPreferences.preload`). Do NOT remove the caching logic.
- **close-to-tray flow needs `isQuitting`:** Task 2 sets up `isQuitting` but doesn't use it. Task 3 wires it into the close handler. Don't try to combine them — the ordering ensures each commit is a working state.
- **Manual verification requires interactive GUI access.** If you're a subagent without GUI access, mark manual verification steps as "pending user-side verification" and proceed to commit.
