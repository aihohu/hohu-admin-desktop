import { defineStore } from 'pinia'

/** 预设主色 */
export type PresetColor = 'default' | 'green' | 'orange' | 'red'

export const PRESET_COLORS: Record<PresetColor, string> = {
  default: '#18a058', // NaiveUI 默认绿
  green: '#00b42a',
  orange: '#ff7d00',
  red: '#f53f3f'
}

interface ThemeState {
  /** 暗黑模式 */
  darkMode: boolean
  /** 主色（预设 key） */
  primaryColor: PresetColor
}

const STORAGE_KEY_DARK = 'theme.darkMode'
const STORAGE_KEY_COLOR = 'theme.primaryColor'

function loadFromStorage(): ThemeState {
  return {
    darkMode: localStorage.getItem(STORAGE_KEY_DARK) === 'true',
    primaryColor: (localStorage.getItem(STORAGE_KEY_COLOR) as PresetColor) || 'default'
  }
}

/**
 * 同步渲染层 darkMode 到主进程 nativeTheme。
 * fire-and-forget：失败不影响渲染层主题切换本身，只是原生标题栏/scrollbar 不跟随。
 */
function syncNativeTheme(dark: boolean): void {
  void window.api.theme.setNativeSource(dark ? 'dark' : 'light')
}

/**
 * 主题 Store：暗黑模式 + 主色。用户偏好属于非敏感数据，用 localStorage 即可
 * （区别于 token / refreshToken 用 secureStorage）。
 */
export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => loadFromStorage(),
  getters: {
    /** 当前主色 hex 值 */
    primaryColorHex: state => PRESET_COLORS[state.primaryColor]
  },
  actions: {
    toggleDark(): void {
      this.darkMode = !this.darkMode
      localStorage.setItem(STORAGE_KEY_DARK, String(this.darkMode))
      syncNativeTheme(this.darkMode)
    },
    setDark(value: boolean): void {
      this.darkMode = value
      localStorage.setItem(STORAGE_KEY_DARK, String(value))
      syncNativeTheme(value)
    },
    setPrimaryColor(color: PresetColor): void {
      this.primaryColor = color
      localStorage.setItem(STORAGE_KEY_COLOR, color)
    },
    /** 启动时调一次：把 localStorage 的 darkMode 同步到 nativeTheme。 */
    initNativeTheme(): void {
      syncNativeTheme(this.darkMode)
    }
  }
})
