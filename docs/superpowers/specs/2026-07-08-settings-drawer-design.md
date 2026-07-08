# 设置抽屉（SettingsDrawer）设计

> 日期：2026-07-08
> 范围：Phase 2.6 — 把已暴露但无 UI 的 IPC 能力（updater / notification / shortcuts）整合进一个抽屉式设置面板，同时补齐缺失的开机自启 IPC 和 updater.autoDownload 字段。
> 前置：Phase 2.1–2.5（store / shortcuts / updater / notification / tabs）已完成并 push。

## 1. 目标与非目标

### 目标

- 一个统一的抽屉式「设置」入口，4 段共 12 项设置
- 把所有已暴露但无 UI 的 IPC 能力接通到 UI
- 合并现有 `ThemeDrawer`（消除两个入口的视觉重复）
- 每项改动持久化、即时生效（除语言需 reload menus 外）

### 非目标（YAGNI）

- 后端通知拉取（Phase 3）
- 通知按 source / category 静音（只有全局 mute）
- Beta 通道 / 预发布过滤
- 快捷键 action 的动态注册（仍由主进程 `ACTION_HANDLERS` 固定）
- 「恢复默认设置」一键重置按钮
- 设置项搜索（VS Code 那种）

## 2. 内容清单

### A. 通用（3 项）

| 项           | UI                                | 持久层                            | 平台差异                  |
| ------------ | --------------------------------- | --------------------------------- | ------------------------- |
| 开机自启     | NSwitch                           | `app.setLoginItemSettings`        | Linux no-op → UI disabled |
| 关闭按钮行为 | NRadio（退出应用 / 最小化到托盘） | electron-store `tray.closeToTray` | —                         |
| 语言         | NSelect（zh-cn / en-us）          | localStorage（appStore.locale）   | —                         |

**注**：siderCollapse 已持久化（appStore 写 localStorage），不需要单独的「默认收起」项。header 折叠按钮直接持久化。

### B. 外观（2 项，吸收 ThemeDrawer）

| 项       | UI                                       | 持久层                                  |
| -------- | ---------------------------------------- | --------------------------------------- |
| 暗黑模式 | NSwitch                                  | localStorage（themeStore.darkMode）     |
| 主色     | 4 chip（default / green / orange / red） | localStorage（themeStore.primaryColor） |

### C. 快捷键（1 项）

| 项                         | UI           | 持久层                     |
| -------------------------- | ------------ | -------------------------- |
| `toggleWindow` accelerator | 一行录制 row | electron-store `shortcuts` |

点击 row 进入「录制态」：input 聚焦 + placeholder「按下组合键…」。

- 所有 modifier（Control/Meta/Alt/Shift）单独按下不触发，等用户继续按
- `Esc` 取消、`Enter` 确认
- 调 `shortcuts.update('toggleWindow', acc)`：
  - 返回 `true` → 本地 shortcuts 镜像更新、退出录制态
  - 返回 `false`（其他应用占用）→ input 保留用户刚按的 acc + 加红色边框视觉标记 + 副文字「冲突，请重按」+ `message.warning('快捷键冲突，请换一个')`，保持录制态

### D. 关于 / 更新（6 项）

所有项由单一 `updaterStatus: UpdaterStatus` 驱动（订阅 `updater.onEvent`）。

| 项                  | 显示条件                                                 |
| ------------------- | -------------------------------------------------------- |
| 版本号（静态）      | 始终                                                     |
| 检查更新按钮        | **始终显示**（文字 + disabled 随状态变）                 |
| 自动下载更新 switch | 始终（downloading / downloaded 后开关无意义但仍显示）    |
| 进度条              | `state === 'downloading'`（绑定 `status.progress ?? 0`） |
| 下载并重启按钮      | `state === 'downloaded'`                                 |
| 跳过此版本按钮      | `state === 'available' && version !== skipVersion`       |

**检查更新按钮的文字 / disabled 矩阵**：

| state         | 文字      | disabled | 说明                                                              |
| ------------- | --------- | -------- | ----------------------------------------------------------------- |
| idle          | 检查更新  | 否       | 初始 / 错误恢复后                                                 |
| checking      | 正在检查… | 是       | loading spinner                                                   |
| not-available | 检查更新  | 否       | 副标题「已是最新版本」                                            |
| available     | 检查更新  | 是       | 显示「跳过此版本」；autoDownload=off 时还显示「下载」（占位按钮） |
| downloading   | 下载中…   | 是       | 隐藏让位给进度条                                                  |
| downloaded    | （隐藏）  | —        | 让位给「下载并重启」                                              |
| error         | 检查更新  | 否       | 副标题显示错误消息                                                |
| skipped       | 检查更新  | 否       | 副标题「已跳过 vX.Y.Z」                                           |

**downloading 时不显示跳过按钮**：electron-updater v6 中断下载流程复杂，留给 Phase 3。

## 3. 架构

### 文件落点

```
新增：
  src/renderer/src/layouts/modules/settings/
  ├── SettingsDrawer.vue          # 抽屉容器（NDrawer width=400）+ 4 section 渲染
  ├── SectionGeneral.vue
  ├── SectionAppearance.vue
  ├── SectionShortcuts.vue
  └── SectionAbout.vue
  src/renderer/src/store/settings.ts          # useSettingsStore
  src/renderer/src/utils/accelerator.ts       # eventToAccelerator / formatAccelerator
  src/main/ipc/app.ts                         # registerAppIpc
  src/main/services/__tests__/accelerator.test.ts  # 沿用 tab-helpers 集中测试目录模式

修改：
  src/shared/types.ts             # StoreSchema.updater.autoDownload; AppApi.app
  src/main/services/store.ts      # defaults + schema 加 autoDownload
  src/main/services/updater.ts    # update-available 事件里读 autoDownload
  src/main/ipc/index.ts           # 注册 registerAppIpc
  src/preload/index.ts            # 暴露 app namespace
  src/renderer/src/layouts/base-layout.vue   # 齿轮按钮改开 SettingsDrawer
  src/renderer/src/locales/langs/zh-cn.ts    # settings.* keys
  src/renderer/src/locales/langs/en-us.ts    # settings.* keys
  CLAUDE.md                       # 加 1 条 pitfall（macOS 开机自启 + sandbox）

删除：
  src/renderer/src/layouts/modules/theme-drawer.vue
```

### 状态管理：`useSettingsStore`

路径 A（推荐）—— Pinia store 做本地缓存，懒加载。

```ts
interface SettingsState {
  loaded: boolean // loadAll 是否完成
  loadError: boolean // loadAll 是否失败（用于空状态 + 重试按钮）
  closeToTray: boolean
  launchAtLogin: boolean
  shortcuts: Record<string, string>
  updaterAutoDownload: boolean
  updaterSkipVersion: string | null
  notificationsEnabled: boolean
  appVersion: string
  platform: NodeJS.Platform // 'darwin' | 'win32' | 'linux'，UI 兼容判断用
  updaterStatus: UpdaterStatus
}
```

**懒加载策略**：抽屉未打开 → 0 IPC。第一次 `SettingsDrawer` 挂载 → `loadAll()` 并发 6 个 IPC。后续开抽屉只读缓存。

**updater 事件订阅**：放 `SectionAbout.vue` 组件里（不放 store），因为只有这个组件需要。组件 onMounted 调 `getStatus()` + `onEvent(cb)`，onUnmounted 调 unsubscribe。store 暴露 `setUpdaterStatus(s)` / `applyUpdaterEvent(e)` 让组件把状态推给 store。

## 4. API 契约

### `useSettingsStore` actions

| Action                        | 行为                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadAll()`                   | Promise.all 拉 7 个字段（含 `app.getPlatform()`）→ 写本地 cache；失败置 `loadError=true`                                                                                           |
| `setCloseToTray(v)`           | 乐观更新本地 + IPC `store.set('tray', { closeToTray: v })`；失败 rollback + throw。主进程 close handler 每次从 store 读，**无需重启即生效**                                        |
| `setLaunchAtLogin(v)`         | 乐观更新本地 + IPC `app.setLoginItem(v)`；失败 rollback + throw                                                                                                                    |
| `setNotificationsEnabled(v)`  | 乐观更新本地 + IPC `notification.setEnabled(v)`；失败 rollback + throw                                                                                                             |
| `setUpdaterAutoDownload(v)`   | 乐观更新本地 + IPC `store.set('updater', {...prev, autoDownload: v})`；失败 rollback                                                                                               |
| `updateShortcut(action, acc)` | IPC `shortcuts.update(action, acc)`；成功才更新本地 shortcuts；返回 boolean                                                                                                        |
| `checkForUpdates()`           | IPC `updater.check(true)`（forced，绕过 24h 限频）                                                                                                                                 |
| `skipCurrentVersion()`        | IPC `updater.skipVersion(status.version)`                                                                                                                                          |
| `installUpdate()`             | IPC `updater.install()`                                                                                                                                                            |
| `setUpdaterStatus(s)`         | 直接写 updaterStatus（用 getStatus() 拉到的完整状态）                                                                                                                              |
| `applyUpdaterEvent(e)`        | reduce UpdaterEvent → **只更新 `state/version/progress`**；`lastCheck/skipVersion` 不动（避免覆盖 getStatus 拉到的初始值）                                                         |
| `setLocale(locale)`           | 透传 `appStore.setLocale(v)`。CLAUDE.md 记录：`App.vue` 有 watcher 监听 locale → 调 `routeStore.regenerateMenus()`；实施时需确认面包屑、当前 tab label 是否也在该 watcher 覆盖范围 |

**乐观更新 + rollback 模式**：toggle 类操作先写本地（UI 即时反映），IPC 失败时回滚本地 + throw，组件 catch 后 `message.error('保存失败')`。`updateShortcut` 是例外（false 不算 throw，是预期分支）。

### accelerator 工具

```ts
/** KeyboardEvent → accelerator 字符串。纯 modifier 返回 null（录制中等更多按键） */
export function eventToAccelerator(e: KeyboardEvent): string | null

/** accelerator → 用户可读。mac: ⌘⇧H, win/linux: Ctrl+Shift+H */
export function formatAccelerator(acc: string, platform: NodeJS.Platform): string
```

**映射规则**：

- `ctrlKey | metaKey` → `CommandOrControl`（跨平台）
- `altKey` → `Alt`
- `shiftKey` → `Shift`
- `code` 解析：`Digit1 → 1`、`KeyA → A`、`F1-F12`、`ArrowUp → Up`、`Space → Space`、`Enter → Return`、`Tab → Tab`、`Backspace → Backspace`、`Escape → Escape`
- 仅 modifier（无主键）返回 `null`，录制态保持

### 新 IPC：`src/main/ipc/app.ts`

```ts
ipcMain.handle('app:getVersion', () => app.getVersion())

ipcMain.handle('app:getPlatform', () => process.platform) // 'darwin' | 'win32' | 'linux'

ipcMain.handle('app:getLoginItem', () => app.getLoginItemSettings().openAtLogin)

ipcMain.handle('app:setLoginItem', (_, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled })
  return app.getLoginItemSettings().openAtLogin // Linux 返回 false，渲染层判断真实生效
})
```

加入 `registerAllIpc()`。

**平台检测**：renderer 在 `nodeIntegration: false` 下 `process.platform` 不可靠。统一通过 `app:getPlatform` IPC 拿（`loadAll()` 里并发拉一次，缓存进 settingsStore）。Linux UI disabled 判断基于这个字段，不依赖 `navigator.userAgent`。

### Preload 暴露

```ts
const app = {
  getVersion: (): Promise<string> => invoke('app:getVersion'),
  getPlatform: (): Promise<NodeJS.Platform> => invoke('app:getPlatform'),
  getLoginItem: (): Promise<boolean> => invoke('app:getLoginItem'),
  setLoginItem: (enabled: boolean): Promise<boolean> => invoke('app:setLoginItem', enabled)
} as const
```

加到 `AppApi`。

### StoreSchema 改动

```ts
// src/shared/types.ts
updater: {
  skipVersion: string | null
  lastCheck: number | null
  autoDownload: boolean // 新增
}
```

`src/main/services/store.ts` 的 `defaults` + `schema` 同步加 `autoDownload: false`。

### UpdaterManager 改动

`update-available` 事件 handler 末尾加：

```ts
if (store.get('updater').autoDownload) {
  void this.downloadUpdate()
}
```

**顺序**：先 skipVersion 检查（命中则 cancel + emit skipped），再 autoDownload 检查。两步互斥。

`downloadUpdate()` 在 updater.ts 必须是 public（实施前先 grep 确认；不存在则新增 public 方法包装 `autoUpdater.downloadUpdate(token)`）。

## 5. 数据流

### 冷启动 → 开抽屉

```
drawer closed → 0 IPC
user 点 header 齿轮 → SettingsDrawer.onMounted
  → settingsStore.loadAll()
    → Promise.all([
        store.get('tray'),
        store.get('shortcuts'),
        store.get('updater'),
        store.get('notifications'),
        app.getLoginItem(),
        app.getVersion(),
        app.getPlatform()
      ])
    → 写本地 cache，loaded=true
  SectionAbout.onMounted
    → updater.getStatus() + updater.onEvent(cb)
```

### 改某项（乐观 + rollback）

```
toggle closeToTray
  → settingsStore.setCloseToTray(false)
    → 本地先置 false
    → IPC: store.set('tray', { closeToTray: false })
    → 失败 → rollback 本地 true + throw
  → 组件 catch → message.error('保存失败')
```

### updater 状态机

```
updater.check(true)
  → state: checking → 按钮 loading
  → event 'available' {version}
    → state: available
    → 若 autoDownload=true → main 进程自动 downloadUpdate
      → event 'progress' {percent} → state: downloading + 进度条
      → event 'downloaded' → state: downloaded
  → event 'not-available' → state: not-available
  → event 'error' {message} → state: error
  → event 'skipped' {version} → state: skipped（由 skipCurrentVersion() 触发）
```

## 6. 错误处理矩阵

| 场景                                                               | 处理                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `loadAll()` IPC 失败                                               | 整段抽屉显示空状态 + 「重试」按钮（`loaded=false` + `loadError=true`）            |
| 单项写入失败（store.set / setLoginItem / notification.setEnabled） | 乐观更新 rollback + `message.error('保存失败')`                                   |
| `shortcuts.update` 返回 false（冲突）                              | 不更新本地 + `message.warning('快捷键冲突，请换一个')` + 录制 input 保持开启      |
| `updater.check` 抛错（offline / example.com 占位 URL）             | status.state='error'，按钮文字「检查更新」+ 副标题显示错误消息                    |
| Linux 调 `setLoginItem`                                            | UI 一开始就 disabled（基于 `process.platform === 'linux'`），不会触发             |
| `updater.install` 在非 downloaded 状态                             | 主进程已有 guard（返回 reject），UI 也保证按钮只在 downloaded 显示                |
| 用户关抽屉时下载未完成                                             | 下载继续在主进程跑，再开抽屉 `getStatus()` 拿到 `downloading` 状态                |
| 重复开抽屉 → 重复订阅 updater 事件                                 | `SectionAbout.onUnmounted` 必须调 unsubscribe；store `loaded=true` 后不重 loadAll |

## 7. 测试范围

| 测试对象                    | 类型                                               | 内容                                                                                   |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `accelerator.ts`            | **纯函数单测**（node:test，沿用 tab-helpers 模式） | `eventToAccelerator` 各种 KeyboardEvent 输入；`formatAccelerator` mac/win/linux 三平台 |
| `useSettingsStore`          | 不测                                               | Pinia store，纯 IPC 透传，测了等于测 mock                                              |
| `SettingsDrawer` + sections | 不测                                               | 纯 UI 组件，手动验证                                                                   |
| `registerAppIpc`            | 不测                                               | IPC handler 是 Electron app API 透传                                                   |

只有 accelerator 工具有真正逻辑分支值得单测。其他都是 wiring，靠手测验证。

## 8. 风险清单

| 风险                                         | 缓解                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `autoDownload=true` 时 skipVersion 顺序错    | spec 已明确：先 skipVersion 检查，再 autoDownload                                                             |
| Linux `setLoginItem` 是 no-op 但不报错       | UI 仍 disabled（基于 `settingsStore.platform === 'linux'`，来自 `app.getPlatform()` IPC），不依赖 IPC 返回值  |
| macOS 开机自启需要 sandbox 关闭或特殊权限    | 当前 sandbox=false，开箱可用；将来 sandbox=true 时可能失效（写到 CLAUDE.md pitfalls）                         |
| accelerator 录制冲突系统级快捷键（如 Cmd+Q） | Electron `globalShortcut.register` 失败返回 false，UI 弹冲突 message + 回滚，不会卡死                         |
| ThemeDrawer 删除后老用户 localStorage 残留   | 无影响（key 是 `theme.darkMode` 等，新 store 继续用）                                                         |
| updater `downloadUpdate` 方法不存在          | 实施前先 grep `services/updater.ts` 确认；不存在则新增 public method 包装 `autoUpdater.downloadUpdate(token)` |
| 重复开抽屉 → 重复订阅 updater 事件           | `SectionAbout.onUnmounted` 必须 unsubscribe；store `loaded=true` 后不重 loadAll                               |

## 9. 实现顺序（10 步，TDD 加在第 4 步）

1. StoreSchema + UpdaterManager 改动（shared/types.ts、services/store.ts、services/updater.ts）
2. app IPC（main/ipc/app.ts、ipc/index.ts 注册）
3. preload 暴露 app（preload/index.ts、AppApi 类型加 app）
4. **accelerator 工具 + 单测**（utils/accelerator.ts、`src/main/services/__tests__/accelerator.test.ts`，沿用 tab-helpers 的集中测试目录模式）← TDD
5. useSettingsStore（store/settings.ts）
6. i18n keys（locales/langs/zh-cn.ts + en-us.ts 加 `settings.*`）
7. SectionAbout.vue（状态最多，先做）
8. SectionShortcuts.vue（accelerator 录制）
9. SectionGeneral.vue + SectionAppearance.vue（最简单）
10. SettingsDrawer.vue 容器 + base-layout 接入 + 删 ThemeDrawer

## 10. DoD（退出标准）

- 抽屉打开 4 段全显示
- 12 项都能改且持久化（重启 dev 后值保留）
- Linux 下开机自启 disabled
- accelerator 录制：正常键 + 冲突场景 + Esc 取消
- updater 状态机 5 个分支（idle / available / downloading / downloaded / error）UI 都对
- 自动下载开关：on 时 check 后立即下载；off 时仅停在 available
- typecheck + lint + fmt + 单测全绿
