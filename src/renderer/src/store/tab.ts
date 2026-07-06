/**
 * Tab store —— 双栏 tab 系统的真相源（spec D1）。
 *
 * 数据模型：
 *   - 两组（left/right），各有自己的 tabs[] 和 activeTabId
 *   - layout: 'single' 时右栏不渲染；'split' 时双栏 + sash
 *   - tab.id 用 `routeName|fullPath` 保证同路径重开延续 KeepAlive 缓存（spec D4）
 *
 * 关键不变量（由 actions 共同维护）：
 *   1. home tab 永远在左栏、pinned=true、isHome=true，不可关闭、不可移动、不可取消固定
 *   2. layout='single' 时右栏 tabs 必须为空（合并时已并入左栏）
 *   3. layout='split' 时右栏 tabs 至少有 1 个（关掉最后一个 → 自动 single）
 *   4. 同一栏内不能有重复 routeName（dedup by routeName，非 id）
 *
 * 持久化：localStorage，key = `${STORAGE_PREFIX}tabs`。state 任意变化 → debounce 300ms → 写入。
 * 失败（JSON 解析错/缺字段/校验不过）→ 调用方 fallback 到 initHome()。
 *
 * 路由联动（spec D1.1）：
 *   - 左栏活动 tab 变化 → setActive 触发 router.push（带 suppressRouterSync guard）
 *   - router.afterEach → addTabFromNavigation（同样 guard 防死循环）
 *   - 右栏 tab 永远不影响 router（用户感知的「当前位置」= 左栏）
 */
import { defineStore } from 'pinia'
import { watch } from 'vue'
import { router } from '../router'
import { views } from '../router/components'
import { useRouteStore } from './route'
import {
  makeTabId,
  closeTab as closeTabFn,
  closeOthers as closeOthersFn,
  closeLeft as closeLeftFn,
  closeRight as closeRightFn,
  closeAll as closeAllFn,
  moveToOtherGroup as moveToOtherGroupFn,
  clampSplitRatio,
  validatePersistedState
} from '@shared/tab-helpers'

const STORAGE_KEY = `${import.meta.env.RENDERER_VITE_STORAGE_PREFIX}tabs`
const PERSIST_DEBOUNCE_MS = 300
const MIN_PANE_WIDTH = 240

interface TabState {
  layout: App.Tab.LayoutMode
  splitRatio: number
  groups: { left: App.Tab.TabGroup; right: App.Tab.TabGroup }
}

/**
 * 防 router ↔ store 死循环（spec D1.1）。
 * setActive() 触发 router.push 之前置 true；router.afterEach 看到为 true 就跳过。
 * 模块级（非 state）—— 不希望被持久化或被外部 mutate。
 */
let suppressRouterSync = false

export const useTabStore = defineStore('tab', {
  state: (): TabState => ({
    layout: 'single',
    splitRatio: 50,
    groups: {
      left: { tabs: [], activeTabId: null },
      right: { tabs: [], activeTabId: null }
    }
  }),
  getters: {
    activeLeftTab: state => {
      const g = state.groups.left
      return g.tabs.find(t => t.id === g.activeTabId) ?? null
    },
    activeRightTab: state => {
      const g = state.groups.right
      return g.tabs.find(t => t.id === g.activeTabId) ?? null
    }
  },
  actions: {
    /**
     * 登录成功后调：在左栏放 home tab，清空其他状态。
     * home tab 由 routeStore.home 提供（dynamic 后端返回 / static `staticHome`）。
     */
    initHome(): void {
      const routeStore = useRouteStore()
      const homeName = routeStore.home
      if (!homeName) {
        console.warn('[tab] cannot init home: routeStore.home is empty')
        return
      }
      const homeTab = this.buildTabFromRouteName(homeName, `/${homeName}`)
      homeTab.isHome = true
      homeTab.pinned = true
      this.groups.left.tabs = [homeTab]
      this.groups.left.activeTabId = homeTab.id
      this.groups.right.tabs = []
      this.groups.right.activeTabId = null
      this.layout = 'single'
    },

    /** logout / 路由模式切换时调：清空所有状态 + 删 localStorage。 */
    reset(): void {
      this.layout = 'single'
      this.splitRatio = 50
      this.groups.left.tabs = []
      this.groups.left.activeTabId = null
      this.groups.right.tabs = []
      this.groups.right.activeTabId = null
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* localStorage 可能被禁用（隐私模式等） */
      }
    },

    /**
     * router.afterEach 触发：把目标路由加到左栏（已存在同 routeName → 只激活）。
     * 内部带循环 guard：suppressRouterSync=true 时是 store 自己 push 的，跳过。
     */
    addTabFromNavigation(to: { name?: string | symbol | null; fullPath: string }): void {
      if (suppressRouterSync) return
      const routeName = String(to.name ?? '')
      if (!routeName || routeName === 'login') return

      const existing = this.groups.left.tabs.find(t => t.routeName === routeName)
      if (existing) {
        this.setActive('left', existing.id)
      } else {
        const tab = this.buildTabFromRouteName(routeName, to.fullPath)
        this.groups.left.tabs.push(tab)
        this.groups.left.activeTabId = tab.id
      }
    },

    /** 从 routeName 构造 Tab 对象。label/icon/i18nKey 从 routeStore.authRoutes 的 meta 取。 */
    buildTabFromRouteName(routeName: string, fullPath: string): App.Tab.Tab {
      const routeStore = useRouteStore()
      const userRoute = this.findUserRoute(routeStore.authRoutes, routeName)
      const meta = userRoute?.meta
      return {
        id: makeTabId(routeName, fullPath),
        routeName,
        fullPath,
        label: meta?.title ?? routeName,
        icon: meta?.icon ?? undefined,
        i18nKey: meta?.i18nKey ?? undefined,
        pinned: false
      }
    },

    /** 递归在 UserRoute 树里找 name 匹配的节点。 */
    findUserRoute(routes: Api.Route.UserRoute[], name: string): Api.Route.UserRoute | undefined {
      for (const r of routes) {
        if (r.name === name) return r
        if (r.children) {
          const found = this.findUserRoute(r.children, name)
          if (found) return found
        }
      }
      return undefined
    },

    /**
     * 激活某 tab。group='left' 时同步 URL（带循环 guard）。
     * 其他 group 切换不影响 router。
     */
    setActive(group: App.Tab.TabGroupKey, tabId: string): void {
      const g = this.groups[group]
      if (g.activeTabId === tabId) return
      g.activeTabId = tabId

      if (group === 'left' && !suppressRouterSync) {
        const tab = g.tabs.find(t => t.id === tabId)
        if (tab && router.currentRoute.value.fullPath !== tab.fullPath) {
          suppressRouterSync = true
          router.push(tab.fullPath).finally(() => {
            suppressRouterSync = false
          })
        }
      }
    },

    /**
     * 关闭单个 tab。如果关的是当前活动 tab，激活最后一个；如果右栏空了，自动合并回单栏。
     * 走 setActive 切换活动（不是直接赋值）→ 确保 router URL 同步。
     */
    closeTab(group: App.Tab.TabGroupKey, tabId: string): void {
      const g = this.groups[group]
      const wasActive = g.activeTabId === tabId
      g.tabs = closeTabFn(g.tabs, tabId)
      if (wasActive) {
        const nextId = g.tabs[g.tabs.length - 1]?.id ?? null
        if (nextId) {
          this.setActive(group, nextId)
        } else {
          g.activeTabId = null
        }
      }
      if (group === 'right' && g.tabs.length === 0) {
        this.layout = 'single'
      }
    },

    /**
     * 关闭其他 tab。如果当前活动 tab 不在保留范围（被关掉了），切到 tabId。
     */
    closeOthers(group: App.Tab.TabGroupKey, tabId: string): void {
      const g = this.groups[group]
      g.tabs = closeOthersFn(g.tabs, tabId)
      this.setActive(group, tabId)
    },

    /**
     * 关闭目标左侧的 tab。如果当前活动 tab 被关掉（在目标左侧且非 pinned/home），
     * 切到目标 tab。
     */
    closeLeft(group: App.Tab.TabGroupKey, tabId: string): void {
      const g = this.groups[group]
      const wasActiveClosed =
        g.activeTabId !== null &&
        g.activeTabId !== tabId &&
        g.tabs.find(t => t.id === g.activeTabId)?.pinned === false &&
        g.tabs.find(t => t.id === g.activeTabId)?.isHome !== true &&
        g.tabs.findIndex(t => t.id === g.activeTabId) < g.tabs.findIndex(t => t.id === tabId)
      g.tabs = closeLeftFn(g.tabs, tabId)
      if (wasActiveClosed) this.setActive(group, tabId)
    },

    /**
     * 关闭目标右侧的 tab。如果当前活动 tab 被关掉（在目标右侧且非 pinned/home），
     * 切到目标 tab。
     */
    closeRight(group: App.Tab.TabGroupKey, tabId: string): void {
      const g = this.groups[group]
      const wasActiveClosed =
        g.activeTabId !== null &&
        g.activeTabId !== tabId &&
        g.tabs.find(t => t.id === g.activeTabId)?.pinned === false &&
        g.tabs.find(t => t.id === g.activeTabId)?.isHome !== true &&
        g.tabs.findIndex(t => t.id === g.activeTabId) > g.tabs.findIndex(t => t.id === tabId)
      g.tabs = closeRightFn(g.tabs, tabId)
      if (wasActiveClosed) this.setActive(group, tabId)
    },

    /**
     * 关闭全部非 pinned/home 的 tab。活动 tab 切到剩余的第一个。
     */
    closeAll(group: App.Tab.TabGroupKey): void {
      const g = this.groups[group]
      g.tabs = closeAllFn(g.tabs)
      const firstId = g.tabs[0]?.id ?? null
      if (firstId) this.setActive(group, firstId)
      else g.activeTabId = null
      if (group === 'right' && g.tabs.length === 0) {
        this.layout = 'single'
      }
    },

    pinTab(group: App.Tab.TabGroupKey, tabId: string): void {
      const t = this.groups[group].tabs.find(x => x.id === tabId)
      if (t && !t.isHome) t.pinned = true
    },

    unpinTab(group: App.Tab.TabGroupKey, tabId: string): void {
      const t = this.groups[group].tabs.find(x => x.id === tabId)
      if (t && !t.isHome) t.pinned = false
    },

    /**
     * 把 tab 移到另一栏。
     * - mode='move'：从源移除、加到目标（保留原 id）
     * - mode='copy'：源不变、目标追加新副本（新 id）
     *
     * 去重（关键 invariant #4）：目标栏已有同 routeName → 不创建副本，
     *   - copy: 源不变，目标激活已有
     *   - move: 源移除（合并到目标已有的），目标激活已有
     * 这避免用户反复点「在另一栏打开」产生 N 个相同 routeName 的 tab。
     */
    moveToOtherGroup(group: App.Tab.TabGroupKey, tabId: string, mode: 'move' | 'copy'): void {
      const other: App.Tab.TabGroupKey = group === 'left' ? 'right' : 'left'
      const src = this.groups[group]
      const dst = this.groups[other]
      const target = src.tabs.find(t => t.id === tabId)
      if (!target) return
      if (target.isHome) return // home 不可移

      const existing = dst.tabs.find(t => t.routeName === target.routeName)
      if (existing) {
        // 去重分支
        if (mode === 'move') {
          src.tabs = src.tabs.filter(t => t.id !== tabId)
          if (src.activeTabId === tabId) {
            const nextId = src.tabs[src.tabs.length - 1]?.id ?? null
            if (nextId) this.setActive(group, nextId)
            else src.activeTabId = null
          }
        }
        this.ensureSplitLayoutForGroup(other)
        dst.activeTabId = existing.id
        this.cleanupEmptyRight()
        return
      }

      // 新建/移动 分支
      const { newSrc, newDst, moved } = moveToOtherGroupFn(src.tabs, dst.tabs, tabId, mode)
      src.tabs = newSrc
      dst.tabs = newDst
      dst.activeTabId = moved.id
      // copy 不移除源 tab，源仍是活动的，不能重置 activeTabId
      // （否则用户右键当前活动 tab 选「在另一栏打开」会让左栏切到最后一个 tab）
      // 只有 move 才需要重置（活动 tab 被移走了）
      if (mode === 'move' && src.activeTabId === tabId) {
        const nextId = src.tabs[src.tabs.length - 1]?.id ?? null
        if (nextId) this.setActive(group, nextId)
        else src.activeTabId = null
      }
      this.ensureSplitLayoutForGroup(other)
      this.cleanupEmptyRight()
    },

    /**
     * 切换分栏布局。
     * - single → split：把左栏活动 tab（非 home/pinned）移到右栏；都是 home/pinned 就找第一个非 home 的复制过去
     * - split → single：把右栏 tabs 按去重并入左栏（左栏已有的优先保状态）
     */
    setSplitLayout(enabled: boolean): void {
      if (enabled && this.layout === 'single') {
        const lg = this.groups.left
        // 候选 1：当前活动 tab（非 home、非 pinned）—— move 模式
        const activeCandidate = lg.tabs.find(t => t.id === lg.activeTabId && !t.isHome && !t.pinned)
        if (activeCandidate) {
          this.moveToOtherGroup('left', activeCandidate.id, 'move')
          return
        }
        // 候选 2：第一个非 home 的 tab（可能 pinned）—— copy 模式（不动 pinned 的原位置）
        const anyNonHome = lg.tabs.find(t => !t.isHome)
        if (anyNonHome) {
          this.moveToOtherGroup('left', anyNonHome.id, 'copy')
          return
        }
        // 左栏只有 home，没法分栏
        console.warn('[tab] cannot split: only home tab exists')
      } else if (!enabled && this.layout === 'split') {
        const leftRouteNames = new Set(this.groups.left.tabs.map(t => t.routeName))
        const merged = [...this.groups.left.tabs]
        for (const t of this.groups.right.tabs) {
          if (!leftRouteNames.has(t.routeName)) {
            merged.push(t)
            leftRouteNames.add(t.routeName)
          }
        }
        this.groups.left.tabs = merged
        this.groups.right.tabs = []
        this.groups.right.activeTabId = null
        this.layout = 'single'
      }
    },

    /** 设置分栏比例（0-100）。totalWidth 用于 clamp 到最小栏宽。 */
    setSplitRatio(ratio: number, totalWidth: number = 1): void {
      this.splitRatio = clampSplitRatio(ratio, totalWidth, MIN_PANE_WIDTH)
    },

    /** 序列化（仅 plain data，不含组件）。 */
    serialize(): App.Tab.PersistedState {
      return {
        layout: this.layout,
        splitRatio: this.splitRatio,
        groups: {
          left: this.groups.left.tabs,
          right: this.groups.right.tabs
        },
        activeIds: {
          left: this.groups.left.activeTabId,
          right: this.groups.right.activeTabId
        }
      }
    },

    /** Debounced 持久化到 localStorage。state 任意变化都会触发。 */
    persist(): void {
      clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()))
        } catch (e) {
          console.warn('[tab] persist failed', e)
        }
      }, PERSIST_DEBOUNCE_MS)
    },

    /**
     * 启动时从 localStorage 恢复。
     * - 过滤掉 views map 里不存在的 routeName（持久化后菜单变了）
     * - 数据校验失败 → 返回 false，调用方应 fallback 到 initHome()
     * - 返回 false 前先清空 state，避免「半恢复」不一致状态
     */
    restore(): boolean {
      let raw: unknown
      try {
        raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
      } catch {
        return false
      }
      if (!raw) return false
      try {
        const parsed = validatePersistedState(raw)
        const filterValid = (tabs: App.Tab.Tab[]): App.Tab.Tab[] => tabs.filter(t => Boolean(views[t.routeName]))
        const leftTabs = filterValid(parsed.groups.left)
        const rightTabs = filterValid(parsed.groups.right)

        // 左栏空 = 数据不对；先把 state 清干净再返回 false，调用方 initHome 会重新填左栏
        if (leftTabs.length === 0) {
          this.reset()
          return false
        }

        this.groups.left.tabs = leftTabs
        this.groups.right.tabs = rightTabs
        this.groups.left.activeTabId = parsed.activeIds.left
        this.groups.right.activeTabId = parsed.activeIds.right
        // 右栏空 → 强制 single（即使持久化时是 split）
        this.layout = rightTabs.length === 0 ? 'single' : parsed.layout
        this.splitRatio = parsed.splitRatio
        return true
      } catch (e) {
        console.warn('[tab] restore failed, will initHome', e)
        this.reset()
        return false
      }
    },

    /** 内部 helper：tab 进入 other 组时确保 layout='split'（仅 other=right 时需要）。 */
    ensureSplitLayoutForGroup(other: App.Tab.TabGroupKey): void {
      if (other === 'right' && this.layout === 'single') {
        this.layout = 'split'
      }
    },

    /** 内部 helper：右栏空了 → 自动回到 single。 */
    cleanupEmptyRight(): void {
      if (this.groups.right.tabs.length === 0) {
        this.layout = 'single'
      }
    }
  }
})

let persistTimer: ReturnType<typeof setTimeout>

/**
 * 注册 state watcher 触发持久化。在 main.ts 里 Pinia 就绪后调用一次。
 * 不放 store 定义里：避免 HMR/SSR/测试时副作用重复注册。
 */
export function setupTabPersist(): void {
  const store = useTabStore()
  watch(
    () => store.$state,
    () => store.persist(),
    { deep: true }
  )
}
