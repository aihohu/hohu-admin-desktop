import { ipcMain, type WebContents } from 'electron'
import type { UpdaterEvent } from '@shared/types'
import { updaterManager } from '../services/updater'

const subscriptions = new Map<WebContents, (e: UpdaterEvent) => void>()

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
    // 已有订阅先清掉，避免同一 webContents 重复订阅
    const existing = subscriptions.get(webContents)
    if (existing) {
      updaterManager.unsubscribe(existing)
    }

    const listener = (e: UpdaterEvent): void => {
      if (!webContents.isDestroyed()) {
        webContents.send('updater:event', e)
      }
    }
    subscriptions.set(webContents, listener)
    updaterManager.subscribe(listener)

    const cleanup = (): void => {
      const cur = subscriptions.get(webContents)
      if (cur === listener) {
        updaterManager.unsubscribe(cur)
        subscriptions.delete(webContents)
      }
      webContents.removeListener('destroyed', cleanup)
    }
    webContents.once('destroyed', cleanup)
  })

  ipcMain.handle('updater:unsubscribe', event => {
    const webContents = event.sender as WebContents
    const listener = subscriptions.get(webContents)
    if (listener) {
      updaterManager.unsubscribe(listener)
      subscriptions.delete(webContents)
    }
  })
}
