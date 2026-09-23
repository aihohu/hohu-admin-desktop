import { shell } from 'electron'
import { normalizeExternalUrl } from '../services/security-policy'
import { trustedHandle } from './security'

/**
 * 注册 shell.openExternal IPC handler。
 * 渲染进程通过 window.electron.shell.openExternal(url) 调用。
 * 仅允许无凭据 HTTPS URL。
 */
export function registerShellIpc(): void {
  trustedHandle('shell:openExternal', async (_event, url: string): Promise<boolean> => {
    try {
      await shell.openExternal(normalizeExternalUrl(url))
      return true
    } catch (err) {
      console.error('[shell] openExternal failed:', err)
      return false
    }
  })
}
