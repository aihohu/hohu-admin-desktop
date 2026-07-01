import { Notification } from 'electron'
import type { NotifyPayload } from '@shared/types'
import { windowManager } from './window'
import { store } from './store'
import log from './logger'

const logger = log.scope('notification')

type ActionHandler = () => void
/** 业务模块（Phase 3+）启动时注册：notificationManager.registerAction('open:settings', () => ...) */
const actionHandlers = new Map<string, ActionHandler>()

class NotificationManagerClass {
  private supported: boolean
  /**
   * 持有所有「在飞」的 Notification 强引用，防止 V8 GC 在通知被点击 / 关闭前回收
   * JS wrapper（某些平台会导致 click handler 不触发或崩溃）。
   * close / failed 事件触发时从 set 移除。
   */
  private activeNotifications = new Set<Notification>()

  constructor() {
    this.supported = Notification.isSupported()
    if (!this.supported) {
      logger.warn('system notifications not supported on this platform, will no-op')
    }
  }

  /** 主入口：发系统通知。受 notifications.enabled mute。 */
  show(payload: NotifyPayload): void {
    if (!this.supported) return
    if (!store.get('notifications').enabled) {
      logger.debug(
        `muted (notifications.enabled=false): [${payload.source}/${payload.category ?? 'general'}] ${payload.title}`
      )
      return
    }

    const n = new Notification({
      title: payload.title,
      body: payload.body
      // 不设 urgency / silent / icon —— 走系统默认；silent 默认 false（与 Phase 2.3 updater 行为一致），其余跨平台支持差异大
    })

    // 持引用直到通知关闭，防止 GC 吞掉 click handler
    this.activeNotifications.add(n)
    const release = (): void => {
      this.activeNotifications.delete(n)
    }
    n.on('click', () => this.handleClick(payload.actionId))
    n.once('close', release)
    n.once('failed', release)
    n.show()

    logger.info(`[${payload.source}/${payload.category ?? 'general'}] ${payload.title}: ${payload.body}`)
  }

  /** 设置页调（Phase 3 UI 阶段）；今天 IPC 暴露但 UI 未做 */
  setEnabled(enabled: boolean): void {
    store.set('notifications', { ...store.get('notifications'), enabled })
    logger.info(`notifications ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * 注册点击 action handler（业务模块启动时调一次）。
   * 返回反注册函数。
   * 今天框架自己不注册任何 action；留给 Phase 3 业务层。
   */
  registerAction(id: string, handler: ActionHandler): () => void {
    if (actionHandlers.has(id)) {
      logger.warn(`actionId "${id}" already registered, overwriting`)
    }
    actionHandlers.set(id, handler)
    return () => {
      actionHandlers.delete(id)
    }
  }

  private handleClick(actionId?: string): void {
    if (!actionId) {
      this.focusMainWindow()
      return
    }
    const handler = actionHandlers.get(actionId)
    if (!handler) {
      logger.warn(`no handler for actionId="${actionId}", falling back to focus window`)
      this.focusMainWindow()
      return
    }
    try {
      handler()
    } catch (err) {
      logger.error(`action handler "${actionId}" threw`, String(err))
      // 即使 handler 抛错也回退聚焦，保证用户感知一致
      this.focusMainWindow()
    }
  }

  private focusMainWindow(): void {
    const win = windowManager.getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

export const notificationManager = new NotificationManagerClass()
