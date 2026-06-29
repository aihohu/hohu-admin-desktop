import { app, shell } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '@resources/icon.png?asset'
import { initSecureStore } from './services/secure-store'
import { windowManager } from './services/window'
import { trayManager } from './services/tray'
import { shortcutManager } from './services/shortcut'
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

  // 标记是否真的要退出（close-to-tray 流程用，Phase 2.2 后续 Task 加）
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

    // close-to-tray：根据 store.tray.closeToTray 决定（isQuitting=true 时强制放行）
    win.on('close', event => {
      if (!isQuitting && trayManager.shouldCloseToTray()) {
        event.preventDefault()
        windowManager.hide()
      }
    })

    // 托盘初始化
    trayManager.init()
    shortcutManager.init()

    // 窗口可见性变化时刷新托盘菜单（Show ↔ Hide 标签）
    win.on('show', () => trayManager.refreshMenu())
    win.on('hide', () => trayManager.refreshMenu())
    win.on('minimize', () => trayManager.refreshMenu())
    win.on('restore', () => trayManager.refreshMenu())

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
    shortcutManager.unregisterAll()
    app.quit()
  })
}
