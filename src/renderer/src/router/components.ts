import { markRaw, type Component } from 'vue'
import BaseLayout from '../layouts/base-layout.vue'
import BlankLayout from '../layouts/blank-layout.vue'

// 懒加载所有视图：key 形如 '../views/system/dict/data/index.vue'
const viewModules = import.meta.glob('../views/**/index.vue')

// 同步 layout 必须用 markRaw 包裹，否则被 Pinia/reactive 化后 Vue Router 会报警告：
//   "Vue received a Component that was made a reactive object."
export const layouts: Record<string, Component> = {
  base: markRaw(BaseLayout),
  blank: markRaw(BlankLayout)
}

/**
 * 把路径 '../views/system/job-log/index.vue' → 'system_job-log'
 * 把路径 '../views/system/dict/data/index.vue' → 'system_dict_data'
 *
 * 规则：
 * - 去掉前缀 '../views/' 和后缀 '/index.vue'
 * - 剩下的目录层级用 '/' 分隔 → 全部替换为 '_'
 * - 保留连字符（如 'job-log' 与后端 route_name 一致）
 * - _builtin 目录照常扫描（'../views/_builtin/403/index.vue' → '_builtin_403'）
 */
function pathToViewKey(p: string): string {
  return p
    .replace('../views/', '')
    .replace(/\/index\.vue$/, '')
    .replace(/\//g, '_')
}

export const views: Record<string, () => Promise<Component>> = Object.fromEntries(
  Object.entries(viewModules).map(([p, loader]) => [pathToViewKey(p), loader as () => Promise<Component>])
)
