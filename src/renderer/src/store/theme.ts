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
    },
    setDark(value: boolean): void {
      this.darkMode = value
      localStorage.setItem(STORAGE_KEY_DARK, String(value))
    },
    setPrimaryColor(color: PresetColor): void {
      this.primaryColor = color
      localStorage.setItem(STORAGE_KEY_COLOR, color)
    }
  }
})
