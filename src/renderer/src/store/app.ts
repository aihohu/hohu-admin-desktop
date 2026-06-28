import { defineStore } from 'pinia'

export type Locale = 'zh-cn' | 'en-us'

interface AppState {
  /** 侧边栏是否折叠 */
  siderCollapse: boolean
  /** 当前语言 */
  locale: Locale
}

const STORAGE_KEY_COLLAPSE = 'app.siderCollapse'
const STORAGE_KEY_LOCALE = 'app.locale'

function loadFromStorage(): AppState {
  const collapse = localStorage.getItem(STORAGE_KEY_COLLAPSE) === 'true'
  const locale = (localStorage.getItem(STORAGE_KEY_LOCALE) as Locale) || 'zh-cn'
  return { siderCollapse: collapse, locale }
}

/**
 * 应用 Store：UI 状态 + 语言。和 theme store 一样用 localStorage。
 */
export const useAppStore = defineStore('app', {
  state: (): AppState => loadFromStorage(),
  actions: {
    toggleSiderCollapse(): void {
      this.siderCollapse = !this.siderCollapse
      localStorage.setItem(STORAGE_KEY_COLLAPSE, String(this.siderCollapse))
    },
    setLocale(locale: Locale): void {
      this.locale = locale
      localStorage.setItem(STORAGE_KEY_LOCALE, locale)
    }
  }
})
