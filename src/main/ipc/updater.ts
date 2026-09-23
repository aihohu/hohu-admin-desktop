import type { WebContents } from 'electron'
import type { UpdaterEvent } from '@shared/types'
import { updaterManager } from '../services/updater'
import { normalizeUpdaterVersion, requireBoolean } from '../services/security-policy'
import { trustedHandle } from './security'

const subscriptions = new Map<WebContents, (e: UpdaterEvent) => void>()

export function registerUpdaterIpc(): void {
  trustedHandle('updater:check', async (_e, forced?: unknown) => {
    const normalized = forced === undefined ? false : requireBoolean(forced, 'forced update check')
    await updaterManager.check(normalized)
    return updaterManager.getStatus()
  })

  trustedHandle('updater:install', async () => {
    updaterManager.install()
  })

  trustedHandle('updater:skipVersion', async (_e, version: unknown) => {
    updaterManager.skipVersion(normalizeUpdaterVersion(version))
  })

  trustedHandle('updater:setAutoDownload', async (_e, enabled: unknown) => {
    updaterManager.setAutoDownload(requireBoolean(enabled, 'auto-download setting'))
  })

  trustedHandle('updater:getStatus', async () => updaterManager.getStatus())

  trustedHandle('updater:subscribe', event => {
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

  trustedHandle('updater:unsubscribe', event => {
    const webContents = event.sender as WebContents
    const listener = subscriptions.get(webContents)
    if (listener) {
      updaterManager.unsubscribe(listener)
      subscriptions.delete(webContents)
    }
  })
}
