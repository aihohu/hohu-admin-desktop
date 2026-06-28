import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'
import { registerShellIpc } from './shell'

/**
 * 注册所有 IPC handlers。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerAllIpc(): void {
  registerSecureStoreIpc()
  registerHttpIpc()
  registerShellIpc()
}
