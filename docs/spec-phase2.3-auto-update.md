# Phase 2.3 — 自动更新（electron-updater）

> Phase 2 第三项，让框架"能自我升级"。封装 electron-updater，支持 GitHub Releases（默认）/ Generic（任意静态 URL）双 provider，构建时由 `.env` 切换。
>
> 依赖 Phase 2.1 的 `electron-log`（写更新事件日志）和 `electron-store`（`store.updater.skipVersion` / `lastCheck` 字段已预留），以及 Phase 2.2 的 `TrayManager`（托盘菜单加「Check for Updates...」入口）。

## 1. 范围

### 包含

- **UpdaterManager**（单例）：封装 `autoUpdater`，绑事件 → 日志 + IPC 转发 + 系统通知
- **启动时后台检查**：用 `store.updater.lastCheck` 做 24h 限频，未到期不发起网络请求
- **手动检查**：托盘菜单「Check for Updates...」入口，绕过限频
- **skipVersion**：写 `store.updater.skipVersion`，被命中的版本不再弹通知
- **IPC**：4 个 handler（`updater:check` / `updater:install` / `updater:skipVersion` / `updater:getStatus`）+ 1 个 main→renderer 事件流（`updater:event`）
- **Build-time provider 切换**：`UPDATER_PROVIDER=github|generic` 在 `.env`，`scripts/gen-publish-config.mjs` 读 env 注入 publish 段，输出**完整** `build/electron-builder.yml`（gitignored），`--config` 只指一个文件
- **dev 模式**：`!app.isPackaged` 时 `autoUpdater.updateConfigPath = 'dev-app-update.yml'`
- **Unit test**：纯函数 `shouldCheckNow` / `isSkipped` 测试覆盖

### 不包含（YAGNI）

- 不做渲染层「关于/设置页」UI —— IPC 全暴露，UI 留给 Phase 3
- 不做 beta 通道 / 预发布过滤 —— 默认 stable channel，开发者后续可改 `electron-builder.*.yml` 的 `channel`
- 不做 hohu-admin 后端更新接口 —— 后端目前没有桌面二进制分发能力（`marketplace` 模块是低代码应用市场，与本场景无关），Generic provider 只是把 URL 当成不透明静态资源
- 不做代码签名 / 公证配置 —— 文档说明限制（macOS 未公证的 DMG 装不上），实现交给开发者发布运维
- 不做增量更新 —— electron-updater 默认行为，零配置
- 不做更新失败自动重试 —— electron-updater 内部已有简单重试；UI 通知里给"重试"入口（Phase 3）
- 不做下载限速 / 调度 —— electron-updater 没有原生支持，YAGNI

## 2. 设计决策

| #   | 决策                                                                                            | 理由                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | 双 provider：`github`（默认）/ `generic`，构建时由 env 切换                                     | fork 开发者零配置（打 tag 就发布）；企业用户可指向自建静态服务器/CDN/未来 hohu 云服务。Runtime 无法切（provider 烧进 `app-update.yml`）                                                                                              |
| D2  | provider 切换靠 `scripts/gen-publish-config.mjs` 输出完整 yml                                   | electron-builder CLI 的 `--config` 多次传入行为在不同版本不稳定，不保证深度合并。最稳路径：读源 yml → 追加 publish 段 → 写 `build/electron-builder.yml`，`--config` 只指一个文件                                                     |
| D3  | `electron-builder.yml`（源）移除 `publish` 段；`build/electron-builder.yml`（生成物）含 publish | 源配置纯净，不耦合 provider；生成物进 `.gitignore`，每次 build 重新生成                                                                                                                                                              |
| D4  | 启动时后台检查带 24h 限频，用 `store.updater.lastCheck` 持久化                                  | 避免每次启动都打 GitHub API（限流）；用户感知不到检查，只在有更新时弹通知。手动入口（托盘菜单）绕过限频                                                                                                                              |
| D5  | `autoUpdater.autoDownload = true`（默认）                                                       | 发现新版直接后台下载，下载完再通知用户「点 Restart 生效」。一次交互最少；下载失败不影响使用                                                                                                                                          |
| D6  | `autoUpdater.autoInstallOnAppQuit = true`（默认）                                               | 用户不主动 Restart 也会在下次正常退出时安装；语义最自然，不打扰                                                                                                                                                                      |
| D7  | skipVersion 命中时调 `autoUpdater.cancelUpdate()` 并发 `skipped` 事件                           | 已经开始下载的也能取消；store 记录后这个版本号不再提示，直到发布更高版本                                                                                                                                                             |
| D8  | dev 模式显式 `updateConfigPath` 指向项目根的 dev-app-update.yml                                 | electron-updater 在 `!app.isPackaged` 下默认 no-op；必须显式指 yml 才能在 dev 验证事件流。路径用 `import.meta.dirname` 计算（ESM 项目无 `__dirname`），不用 `app.getAppPath()`（在 electron-vite dev 下不返回项目根）                |
| D9  | 6 个 electron-updater 原生事件 → 1 个统一 IPC 事件流 `updater:event`                            | 减少渲染层订阅复杂度（一个 `onEvent(cb)` 而非 6 个）；事件 type 用 discriminated union 区分                                                                                                                                          |
| D10 | 系统通知只在 `update-downloaded` 弹一次                                                         | 频繁打扰用户是反模式（VS Code/Slack 都是只在"准备好"才弹）。checking/available/progress 仅走 IPC + 日志                                                                                                                              |
| D11 | unit test 只覆盖纯函数（`shouldCheckNow` / `isSkipped`）                                        | electron-updater 实例强耦合 Electron runtime，mock 成本高于价值；纯逻辑抽出来即可覆盖关键策略                                                                                                                                        |
| D12 | macOS 不做代码签名 / 公证 —— 文档化限制                                                         | electron-updater 在 macOS 要求 app **代码签名**（Developer ID Application 证书，`mac.identity` 配置），否则 `validateUpdate` 拒绝安装。公证（notarization）是 Apple 对**首次分发**的独立要求，与自动更新流程无关。两者都不在框架范畴 |

## 3. 文件结构

```
src/main/services/
└── updater.ts                  # UpdaterManager 单例（新增）

src/main/services/__tests__/
└── updater.test.ts             # 纯函数 unit test（新增）

src/main/ipc/
└── updater.ts                  # registerUpdaterIpc() — 4 handlers + subscribe（新增）

src/main/ipc/index.ts           # 修改：注册 updater ipc

src/preload/index.ts            # 暴露 window.api.updater.{check, install, skipVersion, getStatus, onEvent}
src/preload/index.d.ts          # 修改：把 UpdaterApi 加进 Window.api 类型声明

src/shared/types.ts             # UpdaterApi / UpdaterEvent / UpdaterStatus 类型

src/main/index.ts               # app.whenReady 后调 updaterManager.init()

src/main/services/tray.ts       # refreshMenu() 在 DevTools 与 separator/Quit 之间插入
                              # { label: 'Check for Updates...', click: () => updaterManager.check(true) }

electron-builder.yml            # 修改：删除 publish 段（作为 dev 源）
                              # build 时由 gen-publish-config.mjs 注入 publish 段后输出 build/electron-builder.yml

scripts/
└── gen-publish-config.mjs      # 新增：读 .env + 读 electron-builder.yml，注入 publish，输出 build/electron-builder.yml

build/
└── electron-builder.yml        # 生成物（完整配置，含 publish 段），gitignored

.gitignore                      # 加 build/electron-builder.yml

.env.example                    # 文档化 UPDATER_PROVIDER / GH_OWNER / GH_REPO / UPDATER_URL

dev-app-update.yml              # 修改：加注释说明用途
```

## 4. UpdaterManager

### 4.1 实现（`src/main/services/updater.ts`）

```ts
import { app, Notification } from 'electron'
import { autoUpdater, type UpdateCheckResult } from 'electron-updater'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { store } from './store'
import log from './logger'

const logger = log.scope('updater')

/** 24 小时 ms —— 启动后台检查的最小间隔 */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** dev-app-update.yml 默认占位 URL，命中时跳过 init，避免每次 dev 都打错误日志 */
const DEV_PLACEHOLDER_URL = 'https://example.com/auto-updates'

/** 纯函数：是否应该发起检查（24h 限频） */
export function shouldCheckNow(lastCheck: number | null, now: number, intervalMs: number = CHECK_INTERVAL_MS): boolean {
  if (lastCheck === null) return true
  return now - lastCheck >= intervalMs
}

/** 纯函数：版本是否被用户跳过 */
export function isSkipped(version: string, skipVersion: string | null): boolean {
  if (!skipVersion) return false
  // 简单字面量比较：electron-updater 版本号是 semver，无需特殊解析
  return version === skipVersion
}

class UpdaterManagerClass {
  private state: UpdaterState = 'idle'
  private pendingVersion: string | null = null
  private pendingProgress: number | null = null
  /** 最近一次 error 的 message，仅供内部 dedup 用，不暴露给 status */
  private lastError: string | null = null
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
      if (existsSync(devYml)) {
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
      } else {
        logger.warn('dev mode: dev-app-update.yml not found, updater will no-op')
        return
      }
    }

    // 默认值显式声明（electron-updater 默认就是 true，但写出来更可读）
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    this.wireEvents()

    // 启动后台检查（限频）。init 已经检查 throttle，这里再检查一次是有意冗余：
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
      this.lastError = message
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
    if (this.pendingVersion === version) {
      // 已开始下载则取消（cancelUpdate 在某些状态下会 reject，吞掉）
      void autoUpdater.cancelUpdate().catch(e => logger.warn('cancelUpdate failed', String(e)))
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
    return () => this.listeners.delete(fn)
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
      // skipVersion 命中：取消下载，标记 skipped
      if (isSkipped(info.version, store.get('updater').skipVersion)) {
        void autoUpdater.cancelUpdate().catch(e => logger.warn('cancelUpdate failed', String(e)))
        this.state = 'skipped'
        this.emit({ type: 'skipped', version: info.version })
        logger.info(`version ${info.version} skipped by user`)
        return
      }
      this.state = 'available'
      this.emit({ type: 'available', version: info.version })
      logger.info(`update available: ${info.version}`)
    })

    autoUpdater.on('update-not-available', () => {
      this.state = 'not-available'
      this.emit({ type: 'not-available' })
      logger.info('up to date')
    })

    autoUpdater.on('error', (err: Error, message?: string) => {
      const text = message ?? err.message
      this.lastError = text
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
      title: app.getName(),
      body: `v${version} ready — restart to apply`,
      silent: false
    })
    n.on('click', () => this.install())
    n.show()
  }
}

export const updaterManager = new UpdaterManagerClass()
```

### 4.2 类型契约（`src/shared/types.ts`，加在 StoreSchema 之后）

```ts
export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'skipped'

export interface UpdaterStatus {
  state: UpdaterState
  version: string | null
  progress: number | null
  lastCheck: number | null
  skipVersion: string | null
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'skipped'; version: string }
  | { type: 'error'; message: string }

export interface UpdaterApi {
  /** 发起检查；forced=true 绕过 24h 限频 */
  check: (forced?: boolean) => Promise<UpdaterStatus>
  /** 退出并安装（仅在 downloaded 状态有效） */
  install: () => Promise<void>
  /** 标记跳过某版本 */
  skipVersion: (version: string) => Promise<void>
  /** 拿当前状态（渲染层首屏初始化用） */
  getStatus: () => Promise<UpdaterStatus>
  /** 订阅事件流；返回取消订阅函数 */
  onEvent: (cb: (e: UpdaterEvent) => void) => Promise<() => void>
}
```

> ⚠️ `UpdaterState` / `UpdaterStatus` / `UpdaterEvent` 既被 main 进程 import（实现用），也被 renderer 进程 import（类型契约用），所以必须放 `src/shared/types.ts` —— 不能放 `src/main/services/updater.ts`，否则会破坏「shared 是唯一跨进程类型源」的约定（CLAUDE.md 架构决策 2）。main 进程的实现文件从 shared re-import 这些类型即可。

## 5. IPC handlers（`src/main/ipc/updater.ts`）

```ts
import { ipcMain, type WebContents } from 'electron'
import { updaterManager } from '../services/updater'
import type { UpdaterEvent } from '@shared/types'

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:check', async (_e, forced?: boolean) => {
    await updaterManager.check(!!forced)
    return updaterManager.getStatus()
  })

  ipcMain.handle('updater:install', async () => {
    updaterManager.install()
  })

  ipcMain.handle('updater:skipVersion', async (_e, version: string) => {
    updaterManager.skipVersion(version)
  })

  ipcMain.handle('updater:getStatus', async () => updaterManager.getStatus())

  // 事件订阅：每个 webContents 独立订阅，销毁时清理（防止内存泄漏）
  ipcMain.handle('updater:subscribe', event => {
    const webContents = event.sender as WebContents
    const unsubscribe = updaterManager.subscribe((e: UpdaterEvent) => {
      // 窗口已销毁则不再发送
      if (!webContents.isDestroyed()) {
        webContents.send('updater:event', e)
      }
    })
    webContents.once('destroyed', unsubscribe)
  })
}
```

**注意**：`onEvent` 在 preload 里映射成 `updater:subscribe`，渲染层订阅后通过 `ipcRenderer.on('updater:event', cb)` 接收。这是**唯一**允许的 main→renderer 推送方向（`ipcRenderer.on` 监听 main 主动 send，不是直接 expose ipcRenderer）。

## 6. Preload 暴露（`src/preload/index.ts`）

```ts
import type { UpdaterApi, UpdaterEvent, UpdaterStatus } from '@shared/types'

const updater = {
  check: (forced?: boolean): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:check', forced),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  skipVersion: (version: string): Promise<void> => ipcRenderer.invoke('updater:skipVersion', version),
  getStatus: (): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:getStatus'),
  onEvent: (cb: (e: UpdaterEvent) => void): Promise<() => void> =>
    new Promise(resolve => {
      const wrapped = (_e: unknown, payload: UpdaterEvent): void => cb(payload)
      ipcRenderer.on('updater:event', wrapped)
      // 订阅动作本身走一次 IPC（触发 main 注册 listener）
      void ipcRenderer.invoke('updater:subscribe').then(() => {
        resolve(() => ipcRenderer.removeListener('updater:event', wrapped))
      })
    })
} as const

const api = {
  secureStore,
  http,
  shell,
  logger,
  store,
  theme,
  shortcuts,
  updater
}
```

## 7. 托盘菜单改动（`src/main/services/tray.ts`）

`refreshMenu()` 模板里 DevTools 与 separator 之间插入一项：

```ts
import { updaterManager } from './updater'

const template: MenuItemConstructorOptions[] = [
  { label: isVisible ? 'Hide' : 'Show', click: () => windowManager.toggle() },
  { type: 'separator' },
  { label: 'Reload', click: () => win?.reload() },
  { label: 'DevTools', click: () => win?.webContents.toggleDevTools() },
  { type: 'separator' },
  {
    label: 'Check for Updates...',
    click: () => void updaterManager.check(true)
  },
  { type: 'separator' },
  { label: 'Quit', click: () => app.quit() }
]
```

## 8. 构建配置

### 8.1 `electron-builder.yml`（修改）

删除 `publish:` 段（行 41-43）。其余不变。这是 **dev 源** —— 不进 CI build 的 `--config`。

### 8.2 `scripts/gen-publish-config.mjs`（新增）

读 `.env`（手动解析，零依赖）+ 读源 `electron-builder.yml`，按 `UPDATER_PROVIDER` 注入 `publish:` 段，输出**完整**的 `build/electron-builder.yml`：

```js
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/** 手动解析 .env（避免新增 dotenv 依赖） */
function readEnvFile(): Record<string, string> {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    // 去掉首尾引号
    val = val.replace(/^['"]|['"]$/g, '')
    out[key] = val
  }
  return out
}

const env = { ...readEnvFile(), ...process.env }
const provider = (env.UPDATER_PROVIDER || 'github').toLowerCase()
const sourceYml = resolve(process.cwd(), 'electron-builder.yml')
const outDir = resolve(process.cwd(), 'build')
const outPath = resolve(outDir, 'electron-builder.yml')

if (!existsSync(sourceYml)) {
  throw new Error(`source electron-builder.yml not found at ${sourceYml}`)
}

let publishBlock: string
if (provider === 'github') {
  if (!env.GH_OWNER || !env.GH_REPO) {
    throw new Error('UPDATER_PROVIDER=github requires GH_OWNER and GH_REPO in .env')
  }
  publishBlock = `publish:\n  provider: github\n  owner: ${env.GH_OWNER}\n  repo: ${env.GH_REPO}\n`
} else if (provider === 'generic') {
  if (!env.UPDATER_URL) {
    throw new Error('UPDATER_PROVIDER=generic requires UPDATER_URL in .env')
  }
  publishBlock = `publish:\n  provider: generic\n  url: ${env.UPDATER_URL}\n`
} else {
  throw new Error(`unknown UPDATER_PROVIDER: ${provider}`)
}

const baseYml = readFileSync(sourceYml, 'utf8')
// 源 yml 末尾保证一行空行再追加 publish 段
const fullYml = baseYml.replace(/\s+$/, '') + '\n\n' + publishBlock

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, fullYml)
console.log(`[gen-publish-config] wrote ${outPath} (provider=${provider})`)
```

### 8.3 `package.json` scripts 修改

```jsonc
{
  "scripts": {
    "gen-publish": "node scripts/gen-publish-config.mjs",
    "build:win": "npm run build && npm run gen-publish && electron-builder --win --config build/electron-builder.yml",
    "build:mac": "npm run build && npm run gen-publish && electron-builder --mac --config build/electron-builder.yml",
    "build:linux": "npm run build && npm run gen-publish && electron-builder --linux --config build/electron-builder.yml",
    "build:unpack": "npm run build && electron-builder --dir"
    // ↑ build:unpack 不走 publish 流程（仅本地解压验证），用源 electron-builder.yml
  }
}
```

### 8.4 `.gitignore` 新增

```
build/electron-builder.yml
```

### 8.5 `.env.example` 新增

```bash
# 自动更新 provider：github（默认）/ generic
UPDATER_PROVIDER=github

# UPDATER_PROVIDER=github 必填：
GH_OWNER=hohu-org
GH_REPO=hohu-admin-desktop

# UPDATER_PROVIDER=generic 必填（任意可访问的静态 URL，需提供 latest.yml + 安装包）：
# UPDATER_URL=https://your-host/app/auto-updates
```

### 8.6 `dev-app-update.yml`（修改）

加注释说明用途：

```yaml
# dev 模式（pnpm dev）下 electron-updater 读这个文件。
# 要在 dev 下测更新流程：把 url 改成你发布过 release 的 GitHub 仓库 raw/latest.yml 路径，
# 或本地 file:// 路径，或任意静态服务器；version 比当前 package.json 高才能触发 update-available。
provider: generic
url: https://example.com/auto-updates
updaterCacheDirName: hohu-admin-desktop-updater
```

## 9. 主进程入口（`src/main/index.ts`）

在 `app.whenReady().then(...)` 里 `trayManager.init()` / `shortcutManager.init()` 之后加：

```ts
import { updaterManager } from './services/updater'

// whenReady 回调里：
trayManager.init()
shortcutManager.init()
updaterManager.init()
```

## 10. Unit tests（`src/main/services/__tests__/updater.test.ts`）

用 Node 内置 `node:test` runner（零依赖，无需引入 vitest）：

```ts
import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { shouldCheckNow, isSkipped } from '../updater'

test('shouldCheckNow', () => {
  assert.equal(shouldCheckNow(null, 0), true, 'lastCheck=null → 首次必须检查')
  assert.equal(shouldCheckNow(0, 23 * 3600_000), false, '不足 24h → 跳过')
  assert.equal(shouldCheckNow(0, 24 * 3600_000), true, '满 24h → 触发')
  assert.equal(shouldCheckNow(0, 25 * 3600_000), true, '超 24h → 触发')
  assert.equal(shouldCheckNow(100, 100, 50), true, '自定义 interval 命中')
  assert.equal(shouldCheckNow(100, 120, 50), false, '自定义 interval 未到')
})

test('isSkipped', () => {
  assert.equal(isSkipped('1.0.0', null), false, 'skipVersion=null 不跳过')
  assert.equal(isSkipped('1.0.0', '1.0.0'), true, '版本号匹配 → 跳过')
  assert.equal(isSkipped('1.0.1', '1.0.0'), false, '版本号不匹配 → 不跳过')
  assert.equal(isSkipped('1.0.0', ''), false, '空字符串视为无 skip')
})
```

在 `package.json` 加 script：

```json
"test": "node --test src/main/services/__tests__/*.test.ts 2>/dev/null || node --test --import tsx src/main/services/__tests__/updater.test.ts"
```

> 若不希望引入 tsx 作为 devDep，可改为：测试文件写成 `.test.mjs`，从编译后的 `out/main` import（要求先 build，不便）。**推荐：加 tsx 到 devDeps，让 test 跑在源码上**，CI 加一行 `pnpm test`。

## 11. 文档回写

### 11.1 `CLAUDE.md` 新增 Common Pitfalls

```
11. **macOS 自动更新需要代码签名** — electron-updater 在 macOS 通过 `validateUpdate`
    校验更新包签名，要求 app 自身已用 Developer ID Application 证书签名（`electron-builder.yml`
    的 `mac.identity` 配置）。当前未配置签名 → 能检测能下载，但安装被拒。公证（notarization）
    是 Apple 对**首次分发**的独立要求（外链 DMG 第一次运行），与自动更新流程无关。
    Windows NSIS / Linux AppImage 不受影响。

12. **dev 模式读 dev-app-update.yml** — `pnpm dev` 下 electron-updater 默认 no-op，
    UpdaterManager.init 显式设置 updateConfigPath。命中占位 URL（example.com）会自动跳过
    init 避免每次 dev 都打 error 日志。要在 dev 验证更新流程：编辑 dev-app-update.yml 的
    url 指向本地静态服务器或 GitHub raw，并保证目标版本号高于 package.json 的 version。
    改完重启 dev，不重启不生效。

13. **provider 是构建时决定的** — electron-builder 把 publish 配置烤进 app-update.yml
    打包到 asar 里。运行时无法切换；要换 provider 必须重新 build。
```

### 11.2 `docs/framework-design.md`

- Phase 2 checklist 标记 2.3 ✅
- 新增 6.4 小节：UpdaterManager 架构 / provider 双模式 / 限频 + skipVersion 策略 / IPC 表面 / 未做的（beta/UI/notarize）

## 12. 平台兼容矩阵

| 平台    | 自动更新支持                                                        | 备注                                                                                                                |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Windows | ✅ NSIS（默认 target）开箱即用                                      | 用户运行 .exe 自动 patch                                                                                            |
| macOS   | ⚠️ 需**代码签名**（`mac.identity` + Developer ID Application 证书） | 当前未配置签名 → electron-updater `validateUpdate` 拒绝安装。公证（notarization）是首次分发的独立要求，与本流程无关 |
| Linux   | ✅ AppImage（deb/snap **不支持** 自动更新）                         | electron-builder.yml linux.target 已含 AppImage，OK                                                                 |

## 13. 验收清单

- [ ] `pnpm typecheck` 通过（含新加的 UpdaterApi 类型）
- [ ] `pnpm lint && pnpm fmt` 通过
- [ ] `pnpm test` 通过（`shouldCheckNow` / `isSkipped` 纯函数）
- [ ] `node scripts/gen-publish-config.mjs` 在 UPDATER_PROVIDER=github 缺 GH_OWNER 时抛错
- [ ] `node scripts/gen-publish-config.mjs` 在 UPDATER_PROVIDER=generic 缺 UPDATER_URL 时抛错
- [ ] `node scripts/gen-publish-config.mjs` 正常生成 `build/electron-builder.yml`，含正确 publish 段
- [ ] `pnpm build:unpack` 成功，产物里 out/main 含 updater 代码
- [ ] `pnpm dev` 启动后日志能看到 `[updater] dev mode: ...`（占位 URL 时是 warn 跳过；改了 url 后是 info using）
- [ ] 托盘右键菜单出现「Check for Updates...」项，点击不抛错
- [ ] `CLAUDE.md` / `framework-design.md` / `.env.example` 同步更新
