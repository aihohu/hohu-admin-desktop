# Phase 2.2 — 窗口管理 + 托盘 + 全局快捷键

> Phase 2 的第二项，让框架"有桌面感"。三个互相依赖的主进程 service：WindowManager / TrayManager / ShortcutManager。
>
> 依赖 Phase 2.1 的 `electron-store`（持久化 `windowState` / `shortcuts` / `tray.closeToTray`）。

## 1. 范围

### 包含

- **WindowManager**（单例）：主窗口创建 + 状态持久化（位置/大小/最大化）+ 多窗口接口（Phase 3 用）
- **单例锁**：`app.requestSingleInstanceLock()` + `second-instance` 事件 focus 主窗口
- **TrayManager**：托盘图标 + 右键菜单（Show/Hide / Reload / DevTools / Quit）+ click 切换窗口 + close-to-tray
- **ShortcutManager**：全局快捷键注册/注销 + 默认 `toggleWindow: CommandOrControl+Shift+H`
- **IPC**：`shortcuts:list` / `shortcuts:update`（只暴露这两个）

### 不包含（YAGNI）

- 不做"开机自启"（framework-design 提到但不在 2.2）
- 不做托盘图标颜色随主题变化（macOS template image 由 OS 处理）
- 不做窗口状态 schema 扩展（Phase 2.1 已预留 `windowState` 字段）
- 不暴露 `window:create` 给渲染层（防止乱开窗口，安全考虑）
- 不做"多 display 支持"（窗口状态只存一份，多屏切换 Electron 自己处理边界）
- 不做 tray/window 的 IPC 暴露（主进程自治）
- 不实际创建 Phase 3 的第二窗口（只留接口）

## 2. 设计决策

| #   | 决策                                                                   | 理由                                                                                                            |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | 第二实例启动 → focus 主窗口                                            | VS Code/Slack/Chrome 标准；`requestSingleInstanceLock` + `second-instance`                                      |
| D2  | 托盘始终显示 + close 最小化到托盘（`store.tray.closeToTray === true`） | Phase 2 的目标是"有桌面感"，托盘是桌面应用招牌特征。开发者可通过 `store.set('tray', { closeToTray: false })` 改 |
| D3  | 默认快捷键 `toggleWindow: CommandOrControl+Shift+H`                    | mac 是 Cmd+Shift+H，win 是 Ctrl+Shift+H。一个默认值让开发者立刻看到"快捷键能用"，更多让开发者自己加（避免冲突） |
| D4  | 只管主窗口，预留多窗口接口                                             | Phase 3 才用第二窗口（AI 悬浮窗）。Phase 2.2 只做主窗口 + `create(name, opts)` 接口预留                         |
| D5  | 窗口状态持久化用防抖 500ms 写盘                                        | 避免拖拽窗口时每次 pixel 都触发 `store.set`，IPC 开销 + 文件写入                                                |
| D6  | 托盘菜单点击 = toggle 窗口                                             | 用户习惯：单击托盘显示/隐藏。右键才出菜单                                                                       |
| D7  | ShortcutManager 注册失败不阻塞启动                                     | 快捷键冲突（其他应用占用）时 log warn 继续；不让一个快捷键失败导致整个 app 崩                                   |
| D8  | 默认快捷键只注册一次（启动时如果 store.shortcuts 为空，写入默认值）    | 防止用户清空 shortcuts 后重启又被强制塞回默认值                                                                 |
| D9  | IPC 只暴露 shortcuts:list / shortcuts:update                           | 窗口/托盘主进程自治；渲染层只在"设置页改快捷键"这一个场景需要触达 shortcut manager                              |

## 3. 文件结构

```
src/main/services/
├── window.ts                # WindowManager 单例
├── tray.ts                  # TrayManager 单例
└── shortcut.ts              # ShortcutManager 单例

src/main/ipc/
└── shortcut.ts              # registerShortcutIpc() — shortcuts:list / shortcuts:update

src/main/ipc/index.ts        # 修改：注册新 IPC

src/preload/index.ts         # 暴露 window.api.shortcuts.{list, update}

src/shared/types.ts          # ShortcutsApi 类型

src/main/index.ts            # 重构 createWindow → windowManager.createMainWindow
                            # 加单例锁 + second-instance 处理
                            # app.whenReady 后创建 tray + shortcut

resources/
└── tray-icon.png            # 新增 22×22 / 32×32 通用 icon（如缺则降级到 icon.png）
```

## 4. WindowManager

### 4.1 实现（`src/main/services/window.ts`）

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
      ...mergedOpts
    })

    // 最大化/全屏恢复：show: false 保证了用户看不到 pre-maximize 状态，所以无闪烁。
    // ⚠️ 不能在 constructor options 里传 maximized —— Electron TS 类型没暴露这个 key
    // （只有 maximizable "是否允许最大化"，含义不同）。Post-creation 调用 maximize()
    // 在 show: false 模式下不会闪烁，因为 ready-to-show 事件触发 win.show() 之前 maximize
    // 已经同步完成。
    if (saved.isMaximized) win.maximize()
    if (saved.isFullScreen) win.setFullScreen(true)

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

### 4.2 关键点

- **防抖**：`resize`/`move`/`maximize` 用 500ms 防抖，`enter-full-screen`/`leave-full-screen` 立即写（用户主动切换，期望立即响应）
- **恢复顺序**：⚠️ 实现时学到的——Electron 的 `BrowserWindowConstructorOptions` TS 类型**没有** `maximized` 字段（只有 `maximizable` "是否允许最大化"，含义不同），运行时虽然支持但 typecheck 会失败。实际实现用 post-creation `win.maximize()` / `win.setFullScreen(true)`，配合 `show: false` 保证 ready-to-show 触发前 maximize 已完成，无可见闪烁
- **`getMainWindow` 防御**：返回前检查 `!isDestroyed()`，避免拿到已销毁的引用
- **`closed` 事件清理 mainWindow**：close-to-tray=false 场景窗口真销毁时，mainWindow 设为 null，避免死引用
- **opts 缓存**：第一次 createMainWindow 传的 opts（webPreferences 等）缓存下来，activate 等无参调用时复用——否则会创建无 preload 的破窗口
- **多窗口**：`create(name, opts)` 给 Phase 3 用，本阶段不实际调用。命名约束：名字唯一，重复抛错
- **`store.get('windowState')` 由 schema defaults 永远返回有效值**（width/height 一定有，不需要 `|| 1280` 之类的 fallback）

## 5. TrayManager

### 5.1 实现（`src/main/services/tray.ts`）

```ts
import { app, Tray, Menu, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { windowManager } from './window'
import { store } from './store'
import log from './logger'
// Vite ?asset 导入：让 Vite 编译期处理路径，dev/prod 都能找到
import trayIconUrl from '../../resources/tray-icon.png?asset'

const logger = log.scope('tray')

class TrayManagerClass {
  private tray: Tray | null = null

  init(): void {
    if (this.tray) return

    const image = nativeImage.createFromPath(trayIconUrl)
    if (image.isEmpty()) {
      logger.warn('Tray icon not found, using empty image')
    }

    this.tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
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
    const isVisible = win?.isVisible() && !win?.isMinimized()

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

> **tray-icon.png 资源**：项目目前只有 `resources/icon.png`，Phase 2.2 实施时需要新增 `resources/tray-icon.png`（推荐 22×22 PNG，macOS 推荐 template image 黑白图标）。如果不想新增，可以临时改成 `import trayIconUrl from '../../resources/icon.png?asset'` 复用 app icon。文档说明：macOS 用户可以把 tray-icon.png 替换成 `tray-icon-template@2x.png` 形式的 template image 获得原生外观。

### 5.2 关键点

- **菜单动态刷新**：每次窗口可见性变化（show/hide/minimize/restore）触发 `refreshMenu()`，菜单的 Show/Hide 标签跟着变
- **close-to-tray 完整逻辑见 Section 8 的 `win.on('close')`**：同时检查 `isQuitting`（局部变量，由 `before-quit` 事件设置）和 `trayManager.shouldCloseToTray()`，两者都满足才 preventDefault + hide
- **托盘图标**：尝试加载 `resources/tray-icon.png`，找不到就用空 image（不阻塞启动）。文档说明 mac 推荐用 template image
- **tooltip 用 `app.getName()`**：让框架二开后 tooltip 自动跟随应用名
- **真正的退出路径**：用户点托盘"Quit" → `app.quit()` → `before-quit` 事件 → main/index.ts 局部 `isQuitting = true` → win close 事件触发，`!isQuitting` 为 false，不 preventDefault，正常关闭 → `window-all-closed` 触发 → 走 quit 逻辑

### 5.3 quit vs hide 流程

```
用户点窗口关闭按钮 (close-to-tray=true)
  ↓
win 'close' event
  ↓ isQuitting=false && trayManager.shouldCloseToTray()=true
  ↓ event.preventDefault()
  ↓ windowManager.hide()
  ↓ 隐藏到托盘

用户点托盘"Quit"
  ↓ app.quit()
  ↓ before-quit 事件 → main/index.ts 局部变量 isQuitting = true
  ↓ win 'close' event
  ↓ 检查 !isQuitting: false → 不 preventDefault, 正常关闭
```

> ⚠️ `isQuitting` 是 main/index.ts 里手动的局部变量（`let isQuitting = false`，在 `before-quit` 置 true）。Electron **没有** `app.isQuitting` 内置 API。

## 6. ShortcutManager

### 6.1 实现（`src/main/services/shortcut.ts`）

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
      // 用 spread 创建新对象再 set，避免直接 mutate store 返回的引用（conf v15 的 get 返回内部引用）
      store.set('shortcuts', { ...store.get('shortcuts'), [action]: accelerator })
    } else if (oldAcc) {
      // 注册失败：恢复旧 accelerator，保持状态一致
      this.registerOne(action, oldAcc)
    }
    return ok
  }

  /** 取消所有注册（app.before-quit 调用） */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
  }
}

export const shortcutManager = new ShortcutManagerClass()
```

### 6.2 关键点

- **D7**：注册失败仅 warn，不抛错
- **D8**：`init()` 时如果 `store.shortcuts` 为空才写默认值——用户清空过会被尊重
- **action handler 集中管理**：`ACTION_HANDLERS` 映射，避免渲染层通过 IPC 注册任意回调（安全）
- **update 流程**：先 unregister 旧的、写 store、register 新的。三步原子化由调用方串行调用

## 7. IPC（极简）

### 7.0 `src/main/ipc/index.ts` 修改

新增一行 import 和一行调用（参照 Phase 2.1 logger/store 的模式）：

```ts
import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'
import { registerStoreIpc } from './store'
import { registerThemeIpc } from './theme'
import { registerShortcutIpc } from './shortcut'

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

### 7.1 实现（`src/main/ipc/shortcut.ts`）

```ts
import { ipcMain } from 'electron'
import { store } from '@main/services/store'
import { shortcutManager } from '@main/services/shortcut'

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

### 7.2 Shared 类型（`src/shared/types.ts` 扩展）

```ts
export interface ShortcutsApi {
  list: () => Promise<Record<string, string>>
  update: (action: string, accelerator: string) => Promise<boolean>
}

export interface AppApi {
  // ...existing
  shortcuts: ShortcutsApi
}
```

### 7.3 Preload 暴露

```ts
const shortcuts = {
  list: (): Promise<Record<string, string>> => ipcRenderer.invoke('shortcuts:list'),
  update: (action: string, accelerator: string): Promise<boolean> =>
    ipcRenderer.invoke('shortcuts:update', action, accelerator)
} as const
```

返回 boolean 表示是否注册成功（冲突时 false，渲染层可以提示用户）。

## 8. main/index.ts 重构

```ts
import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from '@main/services/logger'
import icon from '../../resources/icon.png?asset'
import { windowManager } from '@main/services/window'
import { trayManager } from '@main/services/tray'
import { shortcutManager } from '@main/services/shortcut'
import { registerAllIpc } from '@main/ipc'
import { initSecureStore } from '@main/services/secure-store'

const logger = log.scope('main')

// 单例锁
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

  // 标记是否真的要退出（close-to-tray 流程用）
  let isQuitting = false
  app.on('before-quit', () => {
    isQuitting = true
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('org.hohu.app')

    initSecureStore()
    registerAllIpc()

    // 创建主窗口
    const win = windowManager.createMainWindow({
      // linux 平台窗口图标（mac/win 用打包后的图标）
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false
      }
    })

    // close-to-tray：根据 store.tray.closeToTray 决定
    win.on('close', event => {
      if (!isQuitting && trayManager.shouldCloseToTray()) {
        event.preventDefault()
        windowManager.hide()
      }
    })

    // 外链交系统浏览器
    win.webContents.setWindowOpenHandler(details => {
      void shell.openExternal(details.url)
      return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // 托盘 + 快捷键
    trayManager.init()
    shortcutManager.init()

    // 窗口可见性变化时刷新托盘菜单
    win.on('show', () => trayManager.refreshMenu())
    win.on('hide', () => trayManager.refreshMenu())
    win.on('minimize', () => trayManager.refreshMenu())
    win.on('restore', () => trayManager.refreshMenu())

    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

    app.on('activate', () => {
      // macOS dock 点击：窗口存在就 show（close-to-tray 模式下窗口只是隐藏，不在 getAllWindows 判断里）
      const win = windowManager.getMainWindow()
      if (win) {
        win.show()
      } else {
        windowManager.createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    // macOS 约定：关掉最后一个窗口不退出，留在 dock
    // close-to-tray 模式下 window-all-closed 不会触发（窗口被 hide 而非 close），
    // 这里只在用户真的关窗口（store.tray.closeToTray=false）+ mac 平台时才 return
    if (process.platform === 'darwin' && !isQuitting) {
      return
    }
    shortcutManager.unregisterAll()
    app.quit()
  })
}
```

> 注意：`window-all-closed` 在 close-to-tray 默认模式下不会触发（窗口被 hide 而非 close）。只有用户改了 `store.tray.closeToTray=false` 后真关窗口，或者点托盘 Quit（isQuitting=true）时才会走到。

## 9. 验证清单

| 项                                             | 通过条件                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm typecheck && pnpm lint && pnpm fmt` 通过 | pre-commit 不阻塞                                                                      |
| 主窗口启动                                     | 正常显示，size/位置符合 `store.windowState`                                            |
| 拖动 + 关闭重启                                | 窗口位置/大小被记住                                                                    |
| 最大化持久化                                   | 最大化 → 关闭到托盘 → 退出 → 重启 → 还是最大化                                         |
| 单例锁                                         | 第二次启动应用，主窗口被 focus（不开新实例）                                           |
| 托盘显示                                       | macOS 顶栏 / Win 右下角 / Linux 通知区看到图标                                         |
| 托盘点击                                       | 单击 toggle 主窗口                                                                     |
| 托盘菜单                                       | 右键看到 Show/Hide + Reload + DevTools + Quit                                          |
| close-to-tray                                  | 点窗口关闭按钮 → 隐藏到托盘（不退出）                                                  |
| 真正退出                                       | 托盘菜单点 Quit → app 完全退出                                                         |
| 默认快捷键                                     | 启动后 `store.shortcuts` 有 `toggleWindow: CommandOrControl+Shift+H`                   |
| 快捷键触发                                     | 任意应用激活时按 Cmd/Ctrl+Shift+H → 主窗口 toggle                                      |
| 快捷键冲突                                     | 改成已被占用的组合 → log warn，应用不崩                                                |
| IPC shortcuts:list                             | DevTools 调 `window.api.shortcuts.list()` 返回当前 shortcuts                           |
| IPC shortcuts:update                           | 调 `window.api.shortcuts.update('toggleWindow', 'Alt+Space')` → 旧快捷键失效，新的生效 |
| Phase 1 功能不受影响                           | 登录、菜单、主题、i18n 正常                                                            |
| Phase 2.1 功能不受影响                         | logger 写文件、store 读写正常                                                          |

## 10. 实现顺序建议

1. **WindowManager**（`src/main/services/window.ts`）—— 这是 tray/shortcut 的依赖
2. **重构 main/index.ts** 用 windowManager + 单例锁（先不加 tray/shortcut）
3. **验证**：窗口状态持久化、单例锁生效
4. **TrayManager** + main/index.ts 集成（含 close-to-tray 流程）
5. **验证**：托盘显示、菜单、close-to-tray
6. **ShortcutManager** + main/index.ts 集成
7. **IPC 注册 + preload 暴露 shortcuts**
8. **验证**：默认快捷键、IPC list/update
9. **`pnpm typecheck && pnpm lint && pnpm fmt`**
10. **手动跑验证清单**

每步验证后单独 commit（按 Phase 2.1 节奏）。

## 11. 后续依赖（不属于本 spec）

| 后续模块           | 用到本 spec 的什么                                                   |
| ------------------ | -------------------------------------------------------------------- |
| Phase 2.3 自动更新 | 托盘菜单加"Check for updates"项；windowManager.createMainWindow 复用 |
| Phase 3 AI 悬浮窗  | `windowManager.create('overlay', {...})`                             |
| Phase 3 划词助手   | 全局快捷键 + `windowManager.create('selection', {...})`              |
| 设置页（待定）     | IPC `shortcuts:list` / `shortcuts:update`（让用户改快捷键）          |
