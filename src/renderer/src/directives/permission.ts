import type { Directive } from 'vue'
import { useAuthStore } from '../store/auth'

/**
 * v-permission="'sys:user:add'"          单权限
 * v-permission="['sys:user:add', ...]"   任一权限即可
 * 超管 buttons=["*"] 视为拥有所有权限
 *
 * ⚠️ 三个限制（见 spec §4.5）：
 *   1. 只能用在真实 DOM 元素或单根组件（如 n-button），不能挂 <template>
 *   2. mounted 钩子只调一次，buttons 异步加载时可能误判
 *   3. **推荐用 v-if="hasPermission(...)"**，响应式自动跟随 store
 */
export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const authStore = useAuthStore()
    const required = Array.isArray(binding.value) ? binding.value : [binding.value]
    const granted = authStore.buttons
    const isSuper = granted.includes('*')
    const ok = isSuper || required.some(code => granted.includes(code))
    if (!ok) el.parentNode?.removeChild(el)
  }
}

/**
 * 组件内 v-if 形式的辅助函数（**推荐使用**，响应式跟随 store 变化）。
 *
 * @example
 * <n-button v-if="hasPermission('sys:user:add')">新增</n-button>
 * <n-button v-if="hasPermission(['sys:user:add', 'sys:user:edit'])">操作</n-button>
 */
export function hasPermission(code: string | string[]): boolean {
  const authStore = useAuthStore()
  const required = Array.isArray(code) ? code : [code]
  const granted = authStore.buttons
  if (granted.includes('*')) return true
  return required.some(c => granted.includes(c))
}
