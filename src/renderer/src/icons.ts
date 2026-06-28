/**
 * 本地图标集注册：把用到的 @iconify-json/* 集合预加载到 @iconify/vue 的存储里，
 * 避免 Icon 组件在渲染时去 api.unisvg.com / api.iconify.design 在线拉取
 * （CSP 不允许，桌面应用也应离线可用）。
 *
 * 新增图标集：
 *   1. pnpm add -D @iconify-json/<prefix>
 *   2. 在下方 import + addCollection
 */
import { addCollection } from '@iconify/vue'
// @iconify-json/* 包入口导出整个集合的 JSON（prefix + icons 字典）
import carbon from '@iconify-json/carbon/icons.json'
import ic from '@iconify-json/ic/icons.json'

export function setupIcons(): void {
  addCollection(carbon)
  addCollection(ic)
}
