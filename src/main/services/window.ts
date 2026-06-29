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
    // 不能在 constructor options 里传 maximized —— Electron TS 类型没暴露这个 key
    // （只有 maximizable "是否允许最大化"，含义不同）。
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
