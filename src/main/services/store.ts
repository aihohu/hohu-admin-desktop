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
 * conf v15（electron-store 底层）期望 schema 只是「属性 → 子 schema」映射；
 * 它会在 #setupValidator 里自动包成 `{ ...rootSchema, type: 'object', properties: schema }`。
 *
 * ⚠️ conf 默认 NOT 设置 additionalProperties: false，所以根级严格性必须通过
 *    `rootSchema: { additionalProperties: false }` 显式开启（D3 决策）。
 *    字段级严格性（minimum / additionalProperties:false / required）写在子 schema 里。
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
  rootSchema: { additionalProperties: false }, // 根级禁止额外字段（D3）
  clearInvalidConfig: true // 破坏时回退 defaults，不抛错
})
