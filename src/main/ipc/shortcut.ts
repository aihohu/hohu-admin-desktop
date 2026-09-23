import { store } from '@main/services/store'
import { shortcutManager } from '@main/services/shortcut'
import { normalizeShortcutUpdate } from '../services/security-policy'
import { trustedHandle } from './security'

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
  trustedHandle(SHORTCUT_CHANNELS.LIST, () => store.get('shortcuts'))
  trustedHandle(SHORTCUT_CHANNELS.UPDATE, (_e, action: unknown, accelerator: unknown) => {
    const normalized = normalizeShortcutUpdate(action, accelerator)
    return shortcutManager.update(normalized.action, normalized.accelerator)
  })
}
