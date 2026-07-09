import { defineStore } from 'pinia'
import type { Platform, UpdaterEvent, UpdaterStatus } from '@shared/types'

interface SettingsState {
  /** loadAll 是否完成（首次开抽屉后置 true） */
  loaded: boolean
  /** loadAll 是否失败（用于空状态 + 重试按钮） */
  loadError: boolean
  /** 主进程 process.platform，UI 兼容判断用 */
  platform: Platform
  /** electron-store mirror */
  closeToTray: boolean
  launchAtLogin: boolean
  shortcuts: Record<string, string>
  updaterAutoDownload: boolean
  updaterSkipVersion: string | null
  notificationsEnabled: boolean
  /** app */
  appVersion: string
  /** updater runtime */
  updaterStatus: UpdaterStatus
}

const IDLE_STATUS: UpdaterStatus = {
  state: 'idle',
  version: null,
  progress: null,
  lastCheck: null,
  skipVersion: null,
  message: null
}

/**
 * Settings Store：electron-store 字段的本地缓存 + IPC 透传。
 *
 * 懒加载：抽屉未打开 → 0 IPC。第一次 SettingsDrawer 挂载时调 loadAll()。
 * 后续开抽屉只读缓存（loaded=true），不重复拉。
 *
 * 写入策略：toggle 类操作乐观更新本地，IPC 失败时 rollback + throw；
 * 组件 catch 后弹 message.error。updateShortcut 是例外（false 不算 throw）。
 */
export const useSettingsStore = defineStore('settings', {
  state: (): SettingsState => ({
    loaded: false,
    loadError: false,
    platform: 'darwin', // 占位，loadAll 后覆盖
    closeToTray: true,
    launchAtLogin: false,
    shortcuts: {},
    updaterAutoDownload: true,
    updaterSkipVersion: null,
    notificationsEnabled: true,
    appVersion: '',
    updaterStatus: { ...IDLE_STATUS }
  }),
  actions: {
    /** 首次开抽屉时并发拉所有字段 */
    async loadAll(): Promise<void> {
      this.loadError = false
      try {
        const [tray, shortcuts, updater, notifications, launchAtLogin, appVersion, platform] = await Promise.all([
          window.api.store.get('tray'),
          window.api.store.get('shortcuts'),
          window.api.store.get('updater'),
          window.api.store.get('notifications'),
          window.api.app.getLoginItem(),
          window.api.app.getVersion(),
          window.api.app.getPlatform()
        ])
        this.closeToTray = tray.closeToTray
        this.shortcuts = shortcuts
        this.updaterAutoDownload = updater.autoDownload
        this.updaterSkipVersion = updater.skipVersion
        this.notificationsEnabled = notifications.enabled
        this.launchAtLogin = launchAtLogin
        this.appVersion = appVersion
        this.platform = platform
        this.loaded = true
      } catch (e) {
        console.warn('[settings] loadAll failed', e)
        this.loadError = true
      }
    },

    async setCloseToTray(v: boolean): Promise<void> {
      const prev = this.closeToTray
      this.closeToTray = v
      try {
        await window.api.store.set('tray', { closeToTray: v })
      } catch (e) {
        this.closeToTray = prev
        throw e
      }
    },

    async setLaunchAtLogin(v: boolean): Promise<void> {
      const prev = this.launchAtLogin
      this.launchAtLogin = v
      try {
        // 主进程返回实际生效状态（Linux 返回 false）；用返回值同步本地
        const actual = await window.api.app.setLoginItem(v)
        this.launchAtLogin = actual
      } catch (e) {
        this.launchAtLogin = prev
        throw e
      }
    },

    async setNotificationsEnabled(v: boolean): Promise<void> {
      const prev = this.notificationsEnabled
      this.notificationsEnabled = v
      try {
        await window.api.notification.setEnabled(v)
      } catch (e) {
        this.notificationsEnabled = prev
        throw e
      }
    },

    async setUpdaterAutoDownload(v: boolean): Promise<void> {
      const prev = this.updaterAutoDownload
      this.updaterAutoDownload = v
      try {
        const cur = await window.api.store.get('updater')
        await window.api.store.set('updater', { ...cur, autoDownload: v })
      } catch (e) {
        this.updaterAutoDownload = prev
        throw e
      }
    },

    /** 返回 true=成功；false=冲突（组件据此决定 UI） */
    async updateShortcut(action: string, acc: string): Promise<boolean> {
      const ok = await window.api.shortcuts.update(action, acc)
      if (ok) {
        this.shortcuts = { ...this.shortcuts, [action]: acc }
      }
      return ok
    },

    async checkForUpdates(): Promise<void> {
      this.updaterStatus = await window.api.updater.check(true)
    },

    async skipCurrentVersion(): Promise<void> {
      if (!this.updaterStatus.version) return
      const version = this.updaterStatus.version
      await window.api.updater.skipVersion(version)
      this.updaterSkipVersion = version
      this.updaterStatus = { ...this.updaterStatus, state: 'skipped' }
    },

    async installUpdate(): Promise<void> {
      await window.api.updater.install()
    },

    /** SectionAbout 拿到完整 status 后调（getStatus IPC 返回） */
    setUpdaterStatus(s: UpdaterStatus): void {
      this.updaterStatus = s
    },

    /**
     * 应用 UpdaterEvent：只更新 state/version/progress/message 四个字段。
     * lastCheck/skipVersion 不动（避免覆盖 getStatus() 拉到的初始值）。
     */
    applyUpdaterEvent(e: UpdaterEvent): void {
      const s = this.updaterStatus
      switch (e.type) {
        case 'checking':
          this.updaterStatus = { ...s, state: 'checking', message: null }
          break
        case 'available':
          this.updaterStatus = { ...s, state: 'available', version: e.version, progress: null, message: null }
          break
        case 'not-available':
          this.updaterStatus = { ...s, state: 'not-available', message: null }
          break
        case 'progress':
          this.updaterStatus = { ...s, state: 'downloading', progress: e.percent, message: null }
          break
        case 'downloaded':
          this.updaterStatus = { ...s, state: 'downloaded', version: e.version, progress: 100, message: null }
          break
        case 'skipped':
          this.updaterStatus = { ...s, state: 'skipped', version: e.version, progress: null, message: null }
          break
        case 'error':
          this.updaterStatus = { ...s, state: 'error', message: e.message }
          break
      }
    }
  }
})
