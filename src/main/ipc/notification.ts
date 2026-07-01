import { ipcMain } from 'electron'
import type { NotifyPayload } from '@shared/types'
import { notificationManager } from '../services/notification'

/**
 * Notification IPC：
 * - show：渲染层推系统通知
 * - setEnabled：改全局 mute 开关
 */
export function registerNotificationIpc(): void {
  ipcMain.handle('notification:show', async (_e, payload: NotifyPayload) => {
    notificationManager.show(payload)
  })

  ipcMain.handle('notification:setEnabled', async (_e, enabled: boolean) => {
    notificationManager.setEnabled(enabled)
  })
}
