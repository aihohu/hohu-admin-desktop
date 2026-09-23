import type { RendererNotifyPayload } from '@shared/types'
import { notificationManager } from '../services/notification'
import { normalizeRendererNotification, requireBoolean } from '../services/security-policy'
import { trustedHandle } from './security'

/**
 * Notification IPC：
 * - show：渲染层推系统通知
 * - setEnabled：改全局 mute 开关
 */
export function registerNotificationIpc(): void {
  trustedHandle('notification:show', async (_e, payload: RendererNotifyPayload) => {
    notificationManager.show(normalizeRendererNotification(payload))
  })

  trustedHandle('notification:getEnabled', async () => notificationManager.isEnabled())

  trustedHandle('notification:setEnabled', async (_e, enabled: unknown) => {
    notificationManager.setEnabled(requireBoolean(enabled, 'notification setting'))
  })
}
