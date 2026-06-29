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
