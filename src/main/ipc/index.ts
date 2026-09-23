import { registerAuthIpc } from './auth'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'
import { registerTrayIpc } from './tray'
import { registerThemeIpc } from './theme'
import { registerShortcutIpc } from './shortcut'
import { registerUpdaterIpc } from './updater'
import { registerNotificationIpc } from './notification'
import { registerAppIpc } from './app'

/**
 * 注册所有 IPC handlers。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerAllIpc(): void {
  registerAuthIpc()
  registerShellIpc()
  registerLoggerIpc()
  registerTrayIpc()
  registerThemeIpc()
  registerShortcutIpc()
  registerUpdaterIpc()
  registerNotificationIpc()
  registerAppIpc()
}
