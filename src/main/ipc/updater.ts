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
