import { createI18n } from 'vue-i18n'
import zhCn from './langs/zh-cn'
import enUs from './langs/en-us'

export type Messages = typeof zhCn

/**
 * vue-i18n 实例。
 * - legacy: false → 使用 Composition API 形式（useI18n / $t）
 * - 同步加载语言包（小，不需要懒加载）
 * - locale 从 app store 读取，由调用方在挂载前同步
 */
export const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('app.locale') || 'zh-cn',
  fallbackLocale: 'en-us',
  messages: {
    'zh-cn': zhCn,
    'en-us': enUs
  }
})
