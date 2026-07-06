declare namespace App {
  namespace Tab {
    /** tab 唯一 id：routeName + '|' + fullPath */
    type TabId = string

    type TabGroupKey = 'left' | 'right'

    type LayoutMode = 'single' | 'split'

    interface Tab {
      id: TabId
      /** 路由 name（与 components.ts 的 views key 一致） */
      routeName: string
      /** 完整路径，用于 router.push 同步 */
      fullPath: string
      /** 显示标题（fallback，i18nKey 优先） */
      label: string
      /** iconify 图标名 */
      icon?: string
      /** i18n key（如 'route.system_user'），命中则覆盖 label */
      i18nKey?: string
      /** 固定 tab：不可关闭、不可移动 */
      pinned: boolean
      /** 首页 tab：始终 pinned + 始终在左栏 + 不可移动 */
      isHome?: boolean
    }

    interface TabGroup {
      tabs: Tab[]
      activeTabId: string | null
    }

    /** localStorage 持久化结构 */
    interface PersistedState {
      layout: LayoutMode
      splitRatio: number
      groups: { left: Tab[]; right: Tab[] }
      activeIds: { left: string | null; right: string | null }
    }
  }
}
