import { registerSecureStoreIpc } from './secure-store'
import { registerHttpIpc } from './http'

/**
 * 注册所有 IPC handlers。
 * 必须在 app.whenReady() 之后调用。
 */
export function registerAllIpc(): void {
  registerSecureStoreIpc()
  registerHttpIpc()
}
