import { test } from 'node:test'
import { strict as assert } from 'node:assert'
// 从 utils 文件导入，避免触发 updater.ts 里的 'electron' 顶层 import
import { shouldCheckNow, isSkipped } from '../updater-utils'

test('shouldCheckNow: lastCheck=null 首次必须检查', () => {
  assert.equal(shouldCheckNow(null, 0), true)
})

test('shouldCheckNow: 不足 24h 跳过', () => {
  assert.equal(shouldCheckNow(0, 23 * 3600_000), false)
})

test('shouldCheckNow: 满 24h 触发', () => {
  assert.equal(shouldCheckNow(0, 24 * 3600_000), true)
})

test('shouldCheckNow: 超 24h 触发', () => {
  assert.equal(shouldCheckNow(0, 25 * 3600_000), true)
})

test('shouldCheckNow: 自定义 interval 命中', () => {
  assert.equal(shouldCheckNow(100, 150, 50), true)
})

test('shouldCheckNow: 自定义 interval 未到', () => {
  assert.equal(shouldCheckNow(100, 120, 50), false)
})

test('isSkipped: skipVersion=null 不跳过', () => {
  assert.equal(isSkipped('1.0.0', null), false)
})

test('isSkipped: 版本号匹配 → 跳过', () => {
  assert.equal(isSkipped('1.0.0', '1.0.0'), true)
})

test('isSkipped: 版本号不匹配 → 不跳过', () => {
  assert.equal(isSkipped('1.0.1', '1.0.0'), false)
})

test('isSkipped: 空字符串视为无 skip', () => {
  assert.equal(isSkipped('1.0.0', ''), false)
})
