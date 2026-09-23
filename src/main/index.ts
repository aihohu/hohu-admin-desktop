import { app, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '@resources/icon.png?asset'
import { initSecureStore } from './services/secure-store'
import { windowManager } from './services/window'
import { trayManager } from './services/tray'
import { shortcutManager } from './services/shortcut'
import { updaterManager } from './services/updater'
import { registerAllIpc } from './ipc'
import { isTrustedRendererUrl, setTrustedRendererUrl } from './ipc/security'
import { normalizeExternalUrl } from './services/security-policy'

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

    const createMainWindow = (): void => {
      const win = windowManager.createMainWindow({
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false
        }
      })

      const rendererTarget =
        is.dev && process.env['ELECTRON_RENDERER_URL']
          ? process.env['ELECTRON_RENDERER_URL']
          : pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
      setTrustedRendererUrl(rendererTarget, is.dev)

      win.on('ready-to-show', () => {
        win.show()
      })

      win.webContents.setWindowOpenHandler(details => {
        try {
          void shell.openExternal(normalizeExternalUrl(details.url)).catch(() => undefined)
        } catch {
          // 非 HTTPS 或格式非法的目标保持阻断。
        }
        return { action: 'deny' }
      })
      win.webContents.on('will-navigate', (event, navigationUrl) => {
        if (isTrustedRendererUrl(navigationUrl)) return
        event.preventDefault()
        try {
          void shell.openExternal(normalizeExternalUrl(navigationUrl)).catch(() => undefined)
        } catch {
          // 非 HTTPS 或格式非法的目标保持阻断。
        }
      })
      win.webContents.on('will-attach-webview', event => event.preventDefault())

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        void win.loadURL(rendererTarget)
      } else {
        void win.loadFile(join(__dirname, '../renderer/index.html'))
      }

      // close-to-tray：根据 store.tray.closeToTray 决定（isQuitting=true 时强制放行）
      win.on('close', event => {
        if (!isQuitting && trayManager.shouldCloseToTray()) {
          event.preventDefault()
          windowManager.hide()
        }
      })

      win.on('show', () => trayManager.refreshMenu())
      win.on('hide', () => trayManager.refreshMenu())
      win.on('minimize', () => trayManager.refreshMenu())
      win.on('restore', () => trayManager.refreshMenu())
    }

    createMainWindow()

    // 托盘初始化
    trayManager.init()
    shortcutManager.init()
    updaterManager.init()

    app.on('activate', () => {
      // macOS dock 点击：窗口存在就 show，不存在才 create
      const existing = windowManager.getMainWindow()
      if (existing) {
        existing.show()
      } else {
        createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    // macOS 约定：关掉最后一个窗口不退出，留在 dock。
    // 但用户在设置里明确选「退出应用」(closeToTray=false) 时应直接退出。
    // close-to-tray=true（默认）模式下窗口被 hide 而非 close，window-all-closed 不会触发。
    if (process.platform === 'darwin' && !isQuitting && trayManager.shouldCloseToTray()) {
      return
    }
    shortcutManager.unregisterAll()
    app.quit()
  })
}
