import { ipcMain } from 'electron'
import { httpRequest } from '../services/http'
import type { HttpConfig, HttpResponse } from '@shared/types'

/**
 * 注册 HTTP 转发 IPC：
 *   渲染进程 → window.api.http.request(config) → IPC → 主进程 net.request → 后端
 * 主进程在 Node 环境，绕开浏览器 CORS；业务逻辑（token、刷新）仍在渲染层。
 */
export function registerHttpIpc(): void {
  ipcMain.handle('http:request', async (_event, config: HttpConfig): Promise<HttpResponse> => {
    return httpRequest(config)
  })
}
