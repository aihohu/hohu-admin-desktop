import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import {
  makeTabId,
  closeTab,
  closeOthers,
  closeLeft,
  closeRight,
  closeAll,
  moveToOtherGroup,
  clampSplitRatio,
  validatePersistedState
} from '@shared/tab-helpers'

const tab = (id: string, opts: Partial<App.Tab.Tab> = {}): App.Tab.Tab => ({
  id,
  routeName: id,
  fullPath: '/' + id,
  label: id,
  pinned: false,
  ...opts
})

test('makeTabId: routeName + fullPath', () => {
  assert.equal(makeTabId('home', '/home'), 'home|/home')
})

test('closeTab: 找到非 pinned → 移除', () => {
  const tabs = [tab('a'), tab('b'), tab('c')]
  const result = closeTab(tabs, 'b')
  assert.deepEqual(result, [tab('a'), tab('c')])
})

test('closeTab: pinned 不移除', () => {
  const tabs = [tab('a', { pinned: true })]
  const result = closeTab(tabs, 'a')
  assert.deepEqual(result, [tab('a', { pinned: true })])
})

test('closeTab: isHome 不移除', () => {
  const tabs = [tab('home', { isHome: true })]
  const result = closeTab(tabs, 'home')
  assert.deepEqual(result, [tab('home', { isHome: true })])
})

test('closeTab: 找不到 → 不变', () => {
  const tabs = [tab('a')]
  const result = closeTab(tabs, 'zzz')
  assert.deepEqual(result, [tab('a')])
})

test('closeOthers: 保留目标 + pinned + home', () => {
  const tabs = [tab('home', { isHome: true }), tab('a'), tab('b', { pinned: true }), tab('c'), tab('d')]
  const result = closeOthers(tabs, 'c')
  assert.deepEqual(
    result.map(t => t.id),
    ['home', 'b', 'c']
  )
})

test('closeLeft: 删目标左侧非 pinned', () => {
  const tabs = [tab('home', { isHome: true }), tab('a'), tab('b', { pinned: true }), tab('c'), tab('d')]
  const result = closeLeft(tabs, 'd')
  assert.deepEqual(
    result.map(t => t.id),
    ['home', 'b', 'd']
  )
})

test('closeRight: 删目标右侧非 pinned', () => {
  const tabs = [tab('a'), tab('b', { pinned: true }), tab('c'), tab('d')]
  const result = closeRight(tabs, 'b')
  assert.deepEqual(
    result.map(t => t.id),
    ['a', 'b']
  )
})

test('closeAll: 仅留 pinned + home', () => {
  const tabs = [tab('home', { isHome: true }), tab('a'), tab('b', { pinned: true }), tab('c')]
  const result = closeAll(tabs)
  assert.deepEqual(
    result.map(t => t.id),
    ['home', 'b']
  )
})

test('moveToOtherGroup: move 模式从源移除、目标追加', () => {
  const src = [tab('a'), tab('b')]
  const dst = [tab('c')]
  const { newSrc, newDst, moved } = moveToOtherGroup(src, dst, 'b', 'move')
  assert.deepEqual(
    newSrc.map(t => t.id),
    ['a']
  )
  assert.deepEqual(
    newDst.map(t => t.id),
    ['c', 'b']
  )
  assert.equal(moved.id, 'b')
})

test('moveToOtherGroup: copy 模式源不变、目标追加新 id', () => {
  const src = [tab('a'), tab('b')]
  const dst = [tab('c')]
  const { newSrc, newDst, moved } = moveToOtherGroup(src, dst, 'b', 'copy')
  assert.equal(newSrc.length, 2)
  assert.equal(newDst.length, 2)
  assert.notEqual(moved.id, 'b')
})

test('moveToOtherGroup: home 不可移动', () => {
  const src = [tab('home', { isHome: true })]
  const dst: App.Tab.Tab[] = []
  assert.throws(() => moveToOtherGroup(src, dst, 'home', 'move'))
})

test('clampSplitRatio: < min ratio 提到 min', () => {
  // totalWidth 1000, min 240 → min ratio = 24
  assert.equal(clampSplitRatio(10, 1000, 240), 24)
})

test('clampSplitRatio: > max ratio 压到 max', () => {
  // totalWidth 1000, max ratio = 76
  assert.equal(clampSplitRatio(95, 1000, 240), 76)
})

test('clampSplitRatio: 在范围内不变', () => {
  assert.equal(clampSplitRatio(50, 1000, 240), 50)
})

test('validatePersistedState: null/undefined → 抛', () => {
  assert.throws(() => validatePersistedState(null))
  assert.throws(() => validatePersistedState(undefined))
})

test('validatePersistedState: 缺字段 → 抛', () => {
  assert.throws(() => validatePersistedState({ layout: 'single' } as App.Tab.PersistedState))
})

test('validatePersistedState: 有效 → 原值返回', () => {
  const valid: App.Tab.PersistedState = {
    layout: 'single',
    splitRatio: 50,
    groups: { left: [], right: [] },
    activeIds: { left: null, right: null }
  }
  assert.equal(validatePersistedState(valid), valid)
})
