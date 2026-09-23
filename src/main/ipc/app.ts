import { app } from 'electron'
import type { Platform } from '@shared/types'
import { requireBoolean } from '../services/security-policy'
import { trustedHandle } from './security'

/**
 * App IPC 通道：暴露 Electron `app` 模块的部分 API 给渲染层。
 * - getVersion: 读 package.json 的 version（设置页 About 段用）
 * - getPlatform: 主进程 process.platform（渲染层 nodeIntegration=false 下拿不到，UI 兼容判断用）
 * - getLoginItem / setLoginItem: 开机自启读写（Linux no-op，UI 应预先 disabled）
 */
export const APP_CHANNELS = {
  GET_VERSION: 'app:getVersion',
  GET_PLATFORM: 'app:getPlatform',
  GET_LOGIN_ITEM: 'app:getLoginItem',
  SET_LOGIN_ITEM: 'app:setLoginItem'
} as const

export function registerAppIpc(): void {
  trustedHandle(APP_CHANNELS.GET_VERSION, (): string => app.getVersion())

  trustedHandle(APP_CHANNELS.GET_PLATFORM, (): Platform => process.platform as Platform)

  trustedHandle(APP_CHANNELS.GET_LOGIN_ITEM, (): boolean => {
    return app.getLoginItemSettings().openAtLogin
  })

  trustedHandle(APP_CHANNELS.SET_LOGIN_ITEM, (_e, enabled: unknown): boolean => {
    const normalized = requireBoolean(enabled, 'login-item setting')
    app.setLoginItemSettings({ openAtLogin: normalized })
    // 返回实际生效状态（Linux 上 setLoginItemSettings 是 no-op，getLoginItemSettings 仍返回 false）
    return app.getLoginItemSettings().openAtLogin
  })
}
