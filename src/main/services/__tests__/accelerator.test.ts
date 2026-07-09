import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { eventToAccelerator, formatAccelerator, type AcceleratorInput } from '@shared/accelerator'

const ev = (overrides: Partial<AcceleratorInput> = {}): AcceleratorInput => ({
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  code: '',
  key: '',
  ...overrides
})

test('eventToAccelerator: 仅 modifier → null', () => {
  assert.equal(eventToAccelerator(ev({ ctrlKey: true, key: 'Control', code: 'ControlLeft' })), null)
  assert.equal(eventToAccelerator(ev({ metaKey: true, key: 'Meta', code: 'MetaLeft' })), null)
  assert.equal(eventToAccelerator(ev({ altKey: true, key: 'Alt', code: 'AltLeft' })), null)
  assert.equal(eventToAccelerator(ev({ shiftKey: true, key: 'Shift', code: 'ShiftLeft' })), null)
})

test('eventToAccelerator: Ctrl+H → CommandOrControl+H', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'KeyH', key: 'h' }))
  assert.equal(result, 'CommandOrControl+H')
})

test('eventToAccelerator: Meta+L → CommandOrControl+L（跨平台映射）', () => {
  const result = eventToAccelerator(ev({ metaKey: true, code: 'KeyL', key: 'l' }))
  assert.equal(result, 'CommandOrControl+L')
})

test('eventToAccelerator: Ctrl+Shift+H → CommandOrControl+Shift+H', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, shiftKey: true, code: 'KeyH', key: 'H' }))
  assert.equal(result, 'CommandOrControl+Shift+H')
})

test('eventToAccelerator: Alt+P → Alt+P', () => {
  const result = eventToAccelerator(ev({ altKey: true, code: 'KeyP', key: 'p' }))
  assert.equal(result, 'Alt+P')
})

test('eventToAccelerator: Digit1 → 1', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'Digit1', key: '1' }))
  assert.equal(result, 'CommandOrControl+1')
})

test('eventToAccelerator: F1-F12 直接保留', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'F5', key: 'F5' }))
  assert.equal(result, 'CommandOrControl+F5')
})

test('eventToAccelerator: 方向键 ArrowUp → Up', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'ArrowUp', key: 'ArrowUp' }))
  assert.equal(result, 'CommandOrControl+Up')
})

test('eventToAccelerator: Space → Space', () => {
  const result = eventToAccelerator(ev({ ctrlKey: true, code: 'Space', key: ' ' }))
  assert.equal(result, 'CommandOrControl+Space')
})

test('eventToAccelerator: 无 modifier + 主键 → 主键本身', () => {
  const result = eventToAccelerator(ev({ code: 'KeyH', key: 'h' }))
  assert.equal(result, 'H')
})

test('eventToAccelerator: 无法识别的 code → null', () => {
  const result = eventToAccelerator(ev({ code: 'SomeWeirdKey', key: 'Weird' }))
  assert.equal(result, null)
})

test('formatAccelerator: mac 显示符号', () => {
  assert.equal(formatAccelerator('CommandOrControl+Shift+H', 'darwin'), '⌘⇧H')
  assert.equal(formatAccelerator('CommandOrControl+H', 'darwin'), '⌘H')
  assert.equal(formatAccelerator('Alt+P', 'darwin'), '⌥P')
})

test('formatAccelerator: win/linux 显示文字', () => {
  assert.equal(formatAccelerator('CommandOrControl+Shift+H', 'win32'), 'Ctrl+Shift+H')
  assert.equal(formatAccelerator('CommandOrControl+Shift+H', 'linux'), 'Ctrl+Shift+H')
  assert.equal(formatAccelerator('Alt+P', 'win32'), 'Alt+P')
})
