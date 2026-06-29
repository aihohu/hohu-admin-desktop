import { ipcMain } from 'electron'
import { store } from '@main/services/store'
import { shortcutManager } from '@main/services/shortcut'

/**
 * Shortcut IPC 通道。
 * - list：读取 store.shortcuts（设置页展示用）
 * - update：更新某 action 的 accelerator + 重新注册；返回 boolean（false=冲突）
 */
export const SHORTCUT_CHANNELS = {
  LIST: 'shortcuts:list',
  UPDATE: 'shortcuts:update'
} as const

export function registerShortcutIpc(): void {
  ipcMain.handle(SHORTCUT_CHANNELS.LIST, () => store.get('shortcuts'))
  ipcMain.handle(SHORTCUT_CHANNELS.UPDATE, (_e, action: string, accelerator: string) => {
    return shortcutManager.update(action, accelerator)
  })
}
