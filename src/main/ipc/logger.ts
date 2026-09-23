import log from '@main/services/logger'
import { normalizeRendererLogEntry } from '../services/security-policy'
import { trustedHandle } from './security'

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
  trustedHandle(LOGGER_CHANNELS.WRITE, (_e, level: unknown, payload: unknown) => {
    const entry = normalizeRendererLogEntry(level, payload)
    if (entry.level === 'error') {
      rendererLogger.error(entry.msg, entry.meta ?? '')
    } else {
      rendererLogger.warn(entry.msg, entry.meta ?? '')
    }
  })
}
