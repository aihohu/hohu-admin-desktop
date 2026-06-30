import { app, Notification } from 'electron'
// electron-updater 是 CommonJS 包，不能 named import；default import 后解构
import electronUpdater, { type UpdateCheckResult } from 'electron-updater'
import { CancellationToken } from 'builder-util-runtime'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdaterEvent, UpdaterState, UpdaterStatus } from '@shared/types'
import { store } from './store'
import log from './logger'
import { shouldCheckNow, isSkipped } from './updater-utils'

// Re-export 纯函数，让外部从 updater 入口也能拿到
export { shouldCheckNow, isSkipped } from './updater-utils'

const { autoUpdater } = electronUpdater
const logger = log.scope('updater')

/** dev-app-update.yml 默认占位 URL，命中时跳过 init，避免每次 dev 都打错误日志 */
const DEV_PLACEHOLDER_URL = 'https://example.com/auto-updates'

class UpdaterManagerClass {
  private state: UpdaterState = 'idle'
  private pendingVersion: string | null = null
  private pendingProgress: number | null = null
  /**
   * 当前下载所用的取消令牌。autoDownload=false 时由本类自行调
   * autoUpdater.downloadUpdate(token)，skipVersion 命中时 token.cancel()。
   * 没有正在下载的版本时为 null。
   */
  private downloadToken: CancellationToken | null = null
  private listeners = new Set<(e: UpdaterEvent) => void>()
  private inited = false

  init(): void {
    if (this.inited) return
    this.inited = true

    // dev 模式显式指 dev-app-update.yml（否则 autoUpdater 在 !app.isPackaged 下 no-op）
    if (!app.isPackaged) {
      // ESM 项目无 __dirname，用 import.meta.dirname。
      // out/main/index.mjs → 项目根是 ../../
      const devYml = join(import.meta.dirname, '../../dev-app-update.yml')
      if (!existsSync(devYml)) {
        logger.warn('dev mode: dev-app-update.yml not found, updater will no-op')
        return
      }
      // 读 url：如果还是 example.com 占位，直接 no-op，避免每次 dev 都打 error 日志
      const text = readFileSync(devYml, 'utf8')
      if (text.includes(DEV_PLACEHOLDER_URL)) {
        logger.warn(
          `dev mode: dev-app-update.yml still points at placeholder (${DEV_PLACEHOLDER_URL}), updater no-op. Edit it to test update flow.`
        )
        return
      }
      autoUpdater.updateConfigPath = devYml
      logger.info(`dev mode: using ${devYml}`)
    }

    // 关闭 autoDownload：由本类显式 downloadUpdate(token) 触发下载，
    // 这样 skipVersion 命中时可以通过 token.cancel() 真正中断下载。
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    this.wireEvents()

    // 启动后台检查（限频）。init 已经检查 throttle，check(false) 内部再检查一次是有意冗余：
    // 防止外部调用方不通过 init 直接触发 check 时绕过 throttle。
    const { lastCheck } = store.get('updater')
    if (shouldCheckNow(lastCheck, Date.now())) {
      // 不 await —— 后台执行，不阻塞 app 启动
      void this.check(false)
    }
  }

  /** 手动/自动检查。forced=true 绕过 24h 限频（手动入口用） */
  async check(forced: boolean): Promise<UpdateCheckResult | null> {
    if (!forced) {
      const { lastCheck } = store.get('updater')
      if (!shouldCheckNow(lastCheck, Date.now())) {
        logger.debug('check skipped (throttled)')
        return null
      }
    }

    this.state = 'checking'
    try {
      const result = await autoUpdater.checkForUpdates()
      // 无论结果如何都更新 lastCheck（避免检查失败后下次启动立刻重试）
      store.set('updater', { ...store.get('updater'), lastCheck: Date.now() })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.state = 'error'
      logger.error('check failed', message)
      return null
    }
  }

  /** 退出并安装（用户点通知 Restart 时调） */
  install(): void {
    if (this.state !== 'downloaded') {
      logger.warn(`install called in state=${this.state}, ignored`)
      return
    }
    autoUpdater.quitAndInstall()
  }

  /** 标记跳过此版本：写 store + 取消正在进行的下载 */
  skipVersion(version: string): void {
    store.set('updater', { ...store.get('updater'), skipVersion: version })
    if (this.pendingVersion === version && this.downloadToken) {
      // 已开始下载则通过 token 取消；cancel 本身不会 throw，但下载 Promise 会 reject，
      // wireEvents 里 error handler 已经吞下 CancellationError。
      try {
        this.downloadToken.cancel()
      } catch (e: unknown) {
        logger.warn('cancel download failed', String(e))
      }
    }
    this.state = 'skipped'
    logger.info(`skipped version ${version}`)
  }

  getStatus(): UpdaterStatus {
    return {
      state: this.state,
      version: this.pendingVersion,
      progress: this.pendingProgress,
      lastCheck: store.get('updater').lastCheck,
      skipVersion: store.get('updater').skipVersion
    }
  }

  /** 订阅事件流（IPC 层用，转发给渲染进程） */
  subscribe(fn: (e: UpdaterEvent) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit(event: UpdaterEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event)
      } catch (err) {
        logger.error('listener threw', String(err))
      }
    }
  }

  private wireEvents(): void {
    autoUpdater.on('checking-for-update', () => {
      this.state = 'checking'
      this.emit({ type: 'checking' })
      logger.info('checking for update')
    })

    autoUpdater.on('update-available', info => {
      this.pendingVersion = info.version
      // skipVersion 命中：标记 skipped，不发起点播下载
      if (isSkipped(info.version, store.get('updater').skipVersion)) {
        this.state = 'skipped'
        this.emit({ type: 'skipped', version: info.version })
        logger.info(`version ${info.version} skipped by user`)
        return
      }
      this.state = 'available'
      this.emit({ type: 'available', version: info.version })
      logger.info(`update available: ${info.version}`)
      // autoDownload=false → 此处显式触发下载，携带 token 供后续 skip 用
      this.downloadToken = new CancellationToken()
      void autoUpdater.downloadUpdate(this.downloadToken).catch((e: unknown) => {
        // skipVersion 触发的取消会进入这里，吞掉；其它错误走 error 事件
        if (this.state !== 'skipped') {
          logger.warn('downloadUpdate rejected', String(e))
        }
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.state = 'not-available'
      this.emit({ type: 'not-available' })
      logger.info('up to date')
    })

    autoUpdater.on('error', (err: Error, message?: string) => {
      const text = message ?? err.message
      this.state = 'error'
      this.emit({ type: 'error', message: text })
      logger.error('updater error', text)
    })

    autoUpdater.on('download-progress', progress => {
      this.pendingProgress = Math.round(progress.percent)
      this.state = 'downloading'
      this.emit({ type: 'progress', percent: this.pendingProgress })
      logger.debug(`download progress ${this.pendingProgress}%`)
    })

    autoUpdater.on('update-downloaded', info => {
      this.pendingVersion = info.version
      this.pendingProgress = 100
      this.downloadToken = null
      this.state = 'downloaded'
      this.emit({ type: 'downloaded', version: info.version })
      logger.info(`update downloaded: ${info.version}`)
      // 唯一弹系统通知的节点
      this.notify(info.version)
    })
  }

  private notify(version: string): void {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: app.name,
      body: `v${version} ready — restart to apply`,
      silent: false
    })
    n.on('click', () => this.install())
    n.show()
  }
}

export const updaterManager = new UpdaterManagerClass()
