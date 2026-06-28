import Store from 'electron-store'
import type { StoreSchema } from '@shared/types'

const defaults: StoreSchema = {
  windowState: { width: 1280, height: 800, x: null, y: null },
  shortcuts: {}, // 2.2 填默认快捷键
  tray: { closeToTray: true },
  updater: { skipVersion: null, lastCheck: null },
  notifications: { enabled: true }
}

/**
 * conf v11（electron-store 底层）会自动把 schema 包成
 *   { type: 'object', properties: <schema>, additionalProperties: false }
 * 所以这里只写「属性 → 子 schema」映射，根级 additionalProperties 由 conf 强制。
 * 字段级严格性（minimum / additionalProperties:false / required）全部保留。
 */
const schema = {
  windowState: {
    type: 'object',
    additionalProperties: false,
    properties: {
      width: { type: 'number', minimum: 400 },
      height: { type: 'number', minimum: 300 },
      x: { type: ['number', 'null'] },
      y: { type: ['number', 'null'] },
      isMaximized: { type: 'boolean' },
      isFullScreen: { type: 'boolean' }
    },
    required: ['width', 'height']
  },
  shortcuts: { type: 'object', additionalProperties: { type: 'string' } },
  tray: {
    type: 'object',
    additionalProperties: false,
    properties: { closeToTray: { type: 'boolean' } },
    required: ['closeToTray']
  },
  updater: {
    type: 'object',
    additionalProperties: false,
    properties: {
      skipVersion: { type: ['string', 'null'] },
      lastCheck: { type: ['number', 'null'] }
    },
    required: ['skipVersion', 'lastCheck']
  },
  notifications: {
    type: 'object',
    additionalProperties: false,
    properties: { enabled: { type: 'boolean' } },
    required: ['enabled']
  }
}

export const store = new Store<StoreSchema>({
  name: 'config', // userData/config.json
  defaults,
  schema,
  clearInvalidConfig: true // 破坏时回退 defaults，不抛错
})
