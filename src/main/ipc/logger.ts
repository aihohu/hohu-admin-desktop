import { ipcMain } from 'electron'
import log from '@main/services/logger'

const rendererLogger = log.scope('renderer')

/**
 * Logger IPC 通道。
 * 渲染层只能写 error/warn —— 不暴露 info/debug，避免被滥用为 console。
 * scope 固定为 'renderer'，让日志里一眼区分来源。
 */
export const LOGGER_CHANNELS = {
  WRITE: 'logger:write'
} as const

export function registerLoggerIpc(): void {
  ipcMain.handle(LOGGER_CHANNELS.WRITE, (_e, level: 'error' | 'warn', payload: { msg: string; meta?: unknown }) => {
    const { msg, meta } = payload
    if (level === 'error') {
      rendererLogger.error(msg, meta ?? '')
    } else {
      rendererLogger.warn(msg, meta ?? '')
    }
  })
}
