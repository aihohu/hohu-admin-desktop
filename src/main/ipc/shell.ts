import { ipcMain, shell } from 'electron'

/** 允许的外链协议白名单 */
const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:']

/**
 * 注册 shell.openExternal IPC handler。
 * 渲染进程通过 window.electron.shell.openExternal(url) 调用。
 * 仅允许 http/https/mailto 协议，防止 file:// 等危险协议。
 */
export function registerShellIpc(): void {
  ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<boolean> => {
    try {
      const parsed = new URL(url)
      if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        console.warn(`[shell] blocked protocol: ${parsed.protocol}`)
        return false
      }
      await shell.openExternal(url)
      return true
    } catch (err) {
      console.error('[shell] openExternal failed:', err)
      return false
    }
  })
}
