import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'
import { registerLoggerIpc } from './logger'
import { registerStoreIpc } from './store'
import { registerThemeIpc } from './theme'

/**
 * 注册所有 IPC handlers。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerAllIpc(): void {
  registerSecureStoreIpc()
  registerHttpIpc()
  registerShellIpc()
  registerLoggerIpc()
  registerStoreIpc()
  registerThemeIpc()
}
