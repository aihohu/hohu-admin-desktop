import { useI18n } from 'vue-i18n'
import { useAppStore, type Locale } from '../store/app'
import { i18n } from '../locales'

/**
 * i18n 辅助封装：
 * - 在 setup 内用 useI18n() 拿到 t / locale
 * - 切换 locale 时同步到 app store（持久化）+ 全局 i18n 实例
 *
 * @example
 * const { t, locale, changeLocale } = useI18nHelpers()
 * t('common.login')
 * changeLocale('en-us')
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- 返回类型由 useI18n 推导，显式标注会与 vue-i18n 的 WritableComputedRef<具体字符串> 类型冲突
export function useI18nHelpers() {
  const { t, locale } = useI18n()
  const appStore = useAppStore()

  const changeLocale = (value: Locale): void => {
    appStore.setLocale(value)
    i18n.global.locale.value = value
  }

  return {
    t,
    locale,
    changeLocale
  }
}

/**
 * 在 setup 外（如 Pinia store action、router guard）翻译。
 * 不响应式，但用于一次性计算（如 generateMenus 时翻译菜单 label）。
 */
export function translate(key: string, fallback?: string): string {
  // i18n.global.t 在 legacy: false 时返回 string（不存在会返回 key 本身）
  const result = i18n.global.t(key)
  // vue-i18n 找不到 key 时返回 key 本身，此时用 fallback
  return result === key && fallback ? fallback : result
}
