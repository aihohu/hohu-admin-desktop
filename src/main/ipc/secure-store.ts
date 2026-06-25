import { ipcMain } from 'electron'
import { secureGet, secureSet, secureDelete, secureClear } from '../services/secure-store'

/**
 * Secure Store IPC 通道。
 * 通道名是字符串常量，渲染进程通过 preload contextBridge 访问。
 *
 * 设计原则：
 * - 只暴露最小 API（get/set/delete/clear）
 * - 不暴露文件路径
 * - 渲染进程拿到的永远是明文（加解密在主进程内完成）
 */

export const SECURE_STORE_CHANNELS = {
  GET: 'secure-store:get',
  SET: 'secure-store:set',
  DELETE: 'secure-store:delete',
  CLEAR: 'secure-store:clear'
} as const

export function registerSecureStoreIpc(): void {
  ipcMain.handle(SECURE_STORE_CHANNELS.GET, (_e, key: string) => secureGet(key))
  ipcMain.handle(SECURE_STORE_CHANNELS.SET, (_e, key: string, value: string) => secureSet(key, value))
  ipcMain.handle(SECURE_STORE_CHANNELS.DELETE, (_e, key: string) => secureDelete(key))
  ipcMain.handle(SECURE_STORE_CHANNELS.CLEAR, () => secureClear())
}
