import { ipcMain } from 'electron'
import { store } from '@main/services/store'
import type { StoreSchema } from '@shared/types'

/**
 * Store IPC 通道。
 * 类型安全在 preload 层保证（真泛型，调用方传字面量时 TS 推断 K）；
 * 主进程 handler 不写泛型，因为 ipcMain.handle 的签名在编译期丢泛型。
 * 与 Phase 1 secure-store 同模式。
 */
export const STORE_CHANNELS = {
  GET: 'store:get',
  SET: 'store:set',
  DELETE: 'store:delete'
} as const

export function registerStoreIpc(): void {
  ipcMain.handle(STORE_CHANNELS.GET, (_e, key: keyof StoreSchema) => store.get(key))
  ipcMain.handle(STORE_CHANNELS.SET, (_e, key: keyof StoreSchema, value: unknown) => {
    store.set(key, value as StoreSchema[typeof key])
  })
  ipcMain.handle(STORE_CHANNELS.DELETE, (_e, key: keyof StoreSchema) => {
    store.delete(key) // delete 后回到 defaults（electron-store 行为）
  })
}
