import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { windowManager } from '../services/window'

type TrustedHandler = (event: IpcMainInvokeEvent, ...args: never[]) => unknown

let trustedRendererUrl: URL | null = null

export function setTrustedRendererUrl(raw: string, isDevelopment: boolean): void {
  const parsed = new URL(raw)
  const isDevelopmentLoopback =
    isDevelopment && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)
  if ((!isDevelopment && parsed.protocol !== 'file:') || (isDevelopment && !isDevelopmentLoopback)) {
    throw new Error('[security] renderer must be a packaged file or an explicit development loopback URL')
  }
  trustedRendererUrl = parsed
}

export function isTrustedRendererUrl(raw: string): boolean {
  if (!trustedRendererUrl) return false
  try {
    const candidate = new URL(raw)
    if (trustedRendererUrl.protocol === 'file:') {
      return (
        candidate.protocol === 'file:' &&
        candidate.host === trustedRendererUrl.host &&
        candidate.pathname === trustedRendererUrl.pathname &&
        !candidate.search
      )
    }
    return (
      candidate.origin === trustedRendererUrl.origin &&
      candidate.pathname === trustedRendererUrl.pathname &&
      candidate.search === trustedRendererUrl.search
    )
  } catch {
    return false
  }
}

export function assertTrustedIpcEvent(event: IpcMainInvokeEvent): void {
  const mainWindow = windowManager.getMainWindow()
  const topFrame = event.sender.mainFrame
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    !event.senderFrame ||
    event.senderFrame !== topFrame ||
    !isTrustedRendererUrl(event.senderFrame.url)
  ) {
    throw new Error('[security] rejected IPC from an untrusted renderer')
  }
}

export function trustedHandle(channel: string, handler: TrustedHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcEvent(event)
    return handler(event, ...(args as never[]))
  })
}
