import { trayManager } from '../services/tray'
import { requireBoolean } from '../services/security-policy'
import { trustedHandle } from './security'

export function registerTrayIpc(): void {
  trustedHandle('tray:getCloseToTray', () => trayManager.shouldCloseToTray())
  trustedHandle('tray:setCloseToTray', (_event, enabled: unknown) => {
    trayManager.setCloseToTray(requireBoolean(enabled, 'close-to-tray setting'))
  })
}
