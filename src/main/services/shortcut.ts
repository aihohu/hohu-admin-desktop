import { globalShortcut } from 'electron'
import { store } from './store'
import { windowManager } from './window'
import log from './logger'

const logger = log.scope('shortcut')

/** action → 回调映射。Phase 2.2 只有一个，Phase 3 可以扩展 */
const ACTION_HANDLERS: Record<string, () => void> = {
  toggleWindow: () => windowManager.toggle()
}

class ShortcutManagerClass {
  /** 启动时调用：写入默认 shortcuts（如果空）+ 注册全部 */
  init(): void {
    const current = store.get('shortcuts')
    if (Object.keys(current).length === 0) {
      store.set('shortcuts', { toggleWindow: 'CommandOrControl+Shift+H' })
    }
    this.registerAll()
  }

  /** 注册 store.shortcuts 里的所有 action */
  registerAll(): void {
    const shortcuts = store.get('shortcuts')
    for (const [action, accelerator] of Object.entries(shortcuts)) {
      this.registerOne(action, accelerator)
    }
  }

  registerOne(action: string, accelerator: string): boolean {
    const handler = ACTION_HANDLERS[action]
    if (!handler) {
      logger.warn(`Unknown action: ${action}`)
      return false
    }
    // 注意：这里只注销当前 accelerator。如果同一 action 之前注册过不同 accelerator，
    // 调用方必须先用 update() 而不是 registerOne()，否则旧的 accelerator 不会被注销。
    globalShortcut.unregister(accelerator)
    const ok = globalShortcut.register(accelerator, handler)
    if (!ok) {
      logger.warn(`Failed to register shortcut ${accelerator} for ${action} (likely conflict)`)
    }
    return ok
  }

  /** 更新某 action 的 accelerator + 重新注册。
   *  只有注册成功才写 store，避免冲突的 accelerator 留在 store 里反复触发 warn。 */
  update(action: string, accelerator: string): boolean {
    const oldAcc = store.get('shortcuts')[action]
    if (oldAcc) globalShortcut.unregister(oldAcc)
    const ok = this.registerOne(action, accelerator)
    if (ok) {
      // 用 spread 创建新对象再 set，避免直接 mutate store 返回的引用
      store.set('shortcuts', { ...store.get('shortcuts'), [action]: accelerator })
    } else if (oldAcc) {
      // 注册失败：恢复旧 accelerator，保持状态一致
      this.registerOne(action, oldAcc)
    }
    return ok
  }

  /** 取消所有注册（app 退出时调用） */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
  }
}

export const shortcutManager = new ShortcutManagerClass()
