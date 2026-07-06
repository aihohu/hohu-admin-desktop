/**
 * tab store 纯函数。零 Vue / 零 store 依赖，便于 node:test 单测。
 * 所有函数都是 immutable（返回新数组，不改入参）。
 */

/** 由 routeName + fullPath 生成稳定 tab.id */
export function makeTabId(routeName: string, fullPath: string): string {
  return `${routeName}|${fullPath}`
}

/** 关闭单个 tab（pinned / isHome 不动） */
export function closeTab(tabs: App.Tab.Tab[], tabId: string): App.Tab.Tab[] {
  const target = tabs.find(t => t.id === tabId)
  if (!target) return tabs
  if (target.pinned || target.isHome) return tabs
  return tabs.filter(t => t.id !== tabId)
}

/** 关闭其他：保留目标 + 所有 pinned + home */
export function closeOthers(tabs: App.Tab.Tab[], keepId: string): App.Tab.Tab[] {
  return tabs.filter(t => t.id === keepId || t.pinned || t.isHome)
}

/** 关闭左侧：删目标索引左侧的非 pinned、非 home tab */
export function closeLeft(tabs: App.Tab.Tab[], fromId: string): App.Tab.Tab[] {
  const idx = tabs.findIndex(t => t.id === fromId)
  if (idx === -1) return tabs
  return tabs.filter((t, i) => i >= idx || t.pinned || t.isHome)
}

/** 关闭右侧：删目标索引右侧的非 pinned、非 home tab */
export function closeRight(tabs: App.Tab.Tab[], fromId: string): App.Tab.Tab[] {
  const idx = tabs.findIndex(t => t.id === fromId)
  if (idx === -1) return tabs
  return tabs.filter((t, i) => i <= idx || t.pinned || t.isHome)
}

/** 关闭全部：仅留 pinned + home */
export function closeAll(tabs: App.Tab.Tab[]): App.Tab.Tab[] {
  return tabs.filter(t => t.pinned || t.isHome)
}

/**
 * 移动 tab 到另一栏。
 * mode='move'：源移除、目标追加（id 不变）
 * mode='copy'：源不变、目标追加新 id（routeName|fullPath 加随机后缀避免冲突）
 * home tab 抛错（不允许移动）
 */
export function moveToOtherGroup(
  src: App.Tab.Tab[],
  dst: App.Tab.Tab[],
  tabId: string,
  mode: 'move' | 'copy'
): { newSrc: App.Tab.Tab[]; newDst: App.Tab.Tab[]; moved: App.Tab.Tab } {
  const target = src.find(t => t.id === tabId)
  if (!target) throw new Error(`tab not found: ${tabId}`)
  if (target.isHome) throw new Error('home tab cannot be moved')

  if (mode === 'move') {
    return {
      newSrc: src.filter(t => t.id !== tabId),
      newDst: [...dst, target],
      moved: target
    }
  }
  // copy
  const copied: App.Tab.Tab = {
    ...target,
    id: `${target.id}#${Math.random().toString(36).slice(2, 8)}`,
    pinned: false,
    isHome: false
  }
  return {
    newSrc: src,
    newDst: [...dst, copied],
    moved: copied
  }
}

/** 把 splitRatio clamp 到 [min%, (100-min)%] */
export function clampSplitRatio(ratio: number, totalWidth: number, minPaneWidth: number): number {
  const minRatio = (minPaneWidth / totalWidth) * 100
  const maxRatio = 100 - minRatio
  return Math.max(minRatio, Math.min(maxRatio, ratio))
}

/** 持久化数据校验：失败抛错，由 store 调用方 try/catch */
export function validatePersistedState(raw: unknown): App.Tab.PersistedState {
  if (!raw || typeof raw !== 'object') {
    throw new Error('invalid persisted state: not an object')
  }
  const r = raw as Record<string, unknown>
  if (r.layout !== 'single' && r.layout !== 'split') {
    throw new Error('invalid persisted state: layout')
  }
  if (typeof r.splitRatio !== 'number') {
    throw new Error('invalid persisted state: splitRatio')
  }
  if (typeof r.groups !== 'object' || r.groups === null) {
    throw new Error('invalid persisted state: groups')
  }
  const groups = r.groups as Record<string, unknown>
  if (!Array.isArray(groups.left) || !Array.isArray(groups.right)) {
    throw new Error('invalid persisted state: groups.left/right')
  }
  if (typeof r.activeIds !== 'object' || r.activeIds === null) {
    throw new Error('invalid persisted state: activeIds')
  }
  return raw as App.Tab.PersistedState
}
