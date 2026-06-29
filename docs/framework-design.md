# hohu-admin-desktop 框架设计

> 定位：hohu-admin-desktop 是一个 **Electron + Vue 3 + TypeScript 桌面应用开发框架**，与 [hohu-admin-web](../hohu-admin-web)（浏览器端）、[hohu-admin-app](../hohu-admin-app)（手机端）共同构成 hohu 生态，统一对接 [hohu-admin](../hohu-admin)（FastAPI 后端）。

## 1. 生态定位

```
hohu-admin (FastAPI 后端)  ←  统一后端
   ↑           ↑           ↑
   │           │           │
web (浏览器)  desktop (桌面)  app (手机)
Vue3+Vite    Electron+Vue3   UniAPP
```

**desktop 的目标**：开发者拿到代码后能 30 分钟内跑通登录、调 API、看到管理页面，**还能用上 Electron 特有能力**（托盘、全局快捷键、系统通知、自动更新等）。

---

## 2. 设计原则

1. **与 web 端约定一致** —— 请求/响应拦截、命名转换（snake_case ↔ camelCase）、Snowflake ID 序列化、权限码、i18n key，让 web 开发者无缝迁移
2. **桌面差异化** —— 只在桌面端做 web 做不到的事（系统集成、本地文件、悬浮窗、自动更新），不重复造管理页面
3. **安全优先** —— sandbox + contextIsolation + Keychain 存 token，符合 Electron 安全最佳实践
4. **类型安全** —— 主进程 ↔ 渲染进程 IPC 全程 typed，零 `any`
5. **可裁剪** —— AI、托盘、自动更新等都是独立模块，开发者按需引入

---

## 3. 核心能力清单

### 3.1 必须对齐 web 端（生态一致）

| 能力           | 说明                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------- |
| **请求层**     | 拦截器、统一错误码、`snake_case ↔ camelCase` 自动转换、Snowflake ID `string` 序列化、Token 自动注入 |
| **多环境**     | dev / test / prod 切换，从 `.env` 读 baseURL                                                        |
| **鉴权**       | JWT 登录（密码/验证码）、token 刷新、RBAC（路由权限 + 按钮级 `v-permission`）                       |
| **Token 存储** | 系统 Keychain（macOS Keychain / Windows Credential Manager / libsecret），不用 localStorage         |
| **动态路由**   | 登录后拉 `/menu`，按 permissions 过滤                                                               |
| **主题**       | 暗黑模式 + Theme Drawer（与 web 预设一致）                                                          |
| **国际化**     | vue-i18n + zh-cn / en-us，与 web 共用语言包                                                         |
| **布局**       | Header / Sider / Tab / Breadcrumb，桌面端可更精简                                                   |

### 3.2 桌面端独有能力（框架级）

| 能力             | 说明                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| **typed IPC**    | 主进程 `ipcMain.handle` ↔ 渲染进程 `window.electron` 全程类型安全            |
| **Preload 沙箱** | `contextBridge` 白名单暴露 API，`sandbox: true` + `contextIsolation: true`   |
| **窗口管理**     | 多窗口、单例锁、窗口状态持久化（位置/大小）                                  |
| **托盘**         | Tray + 右键菜单模板                                                          |
| **全局快捷键**   | 注册/注销封装，覆盖 web 端无法实现的"任意位置唤起"                           |
| **系统通知**     | 原生 Notification + 后端推送的 WebSocket/SSE 分发器                          |
| **开机自启**     | `app.setLoginItemSettings`                                                   |
| **Deep Link**    | `hohu://...` 协议注册                                                        |
| **自动更新**     | electron-updater 接入模板（与 `electron-builder.yml` 的 `publish.url` 联动） |
| **本地存储**     | electron-store 封装，跨进程共享                                              |
| **日志系统**     | electron-log，主进程文件日志 + 渲染进程转发                                  |
| **本地文件**     | 原生对话框、拖拽上传、批量上传、断点续传                                     |
| **安全策略**     | 链接白名单（http/https 才允许 `shell.openExternal`）、CSP 配置示例           |

### 3.3 AI 模块（对齐后端 AI 能力）

后端已有完整的 AI 模块（Provider / Model / Conversation / Message），桌面端内置：

| 能力                 | 说明                                                                |
| -------------------- | ------------------------------------------------------------------- |
| **SSE 流式对话**     | 与 web 端一致的 fetch + ReadableStream 实现                         |
| **多 Provider 切换** | 模型选择按 provider 分组，模型 ID 格式 `{providerCode}:{modelName}` |
| **消息渲染**         | Markdown + 代码高亮                                                 |
| **会话持久化**       | 调后端 Conversation API                                             |
| **AI 桌面场景示例**  | 见第 5 节，作为可裁剪的 demo                                        |

---

## 4. 目录结构

```
src/
├── main/                          # 主进程
│   ├── index.ts                   # 入口
│   ├── services/                  # 主进程服务（每个独立模块）
│   │   ├── window.ts              # 窗口管理（多窗口、单例、状态持久化）
│   │   ├── tray.ts                # 托盘
│   │   ├── shortcut.ts            # 全局快捷键
│   │   ├── updater.ts             # 自动更新
│   │   ├── store.ts               # 本地存储（electron-store）
│   │   ├── security.ts            # 安全策略（链接白名单、CSP）
│   │   └── logger.ts              # 日志（electron-log）
│   └── ipc/                       # IPC handlers（typed）
│       ├── index.ts
│       └── types.ts               # 共享类型
├── preload/
│   ├── index.ts                   # contextBridge 白名单暴露
│   └── index.d.ts                 # 渲染进程可见类型
└── renderer/
    └── src/
        ├── App.vue                # Provider 根
        ├── main.ts                # 入口
        ├── api/                   # 与后端对接（同 web 约定）
        ├── router/                # 动态路由
        ├── store/                 # Pinia (auth / app / theme / ai)
        ├── layouts/               # 布局
        ├── views/                 # 页面
        │   ├── login/
        │   ├── dashboard/
        │   ├── system/            # 与 web 对齐的管理页
        │   └── ai/                # AI 对话 / 模型管理
        ├── components/
        ├── composables/           # useElectron / useTray / useShortcut ...
        ├── locales/
        └── theme/
examples/                          # 可选 demo（开发者可删）
├── ai-overlay/                    # 悬浮窗 AI
├── selection-assistant/           # 划词助手
└── screenshot-ai/                 # 截图问 AI
docs/                              # 框架文档
```

---

## 5. AI 桌面场景示例（demo，非产品）

作为框架的示例代码，展示如何组合上述能力，开发者可删可改：

| 示例                    | 组合的能力                         | 价值                   |
| ----------------------- | ---------------------------------- | ---------------------- |
| **ai-overlay**          | 全局快捷键 + 无框置顶窗口 + AI SSE | 任意应用上唤起 AI 浮窗 |
| **selection-assistant** | 全局快捷键 + 剪贴板 + AI           | 划词翻译/解释/改写     |
| **screenshot-ai**       | desktopCapturer + 多模态模型       | 截图问 AI              |

> 这些是**示例代码**，不是框架必须的产物，放在 `examples/` 不进 main bundle。

---

## 6. 开发路线

### Phase 1 — 让框架"能用"（与 web 对齐的基础设施）—— ✅ 完成

- [x] **请求层 + 鉴权（Keychain 存 token）** —— 详见 6.1
- [x] **typed IPC + Preload 沙箱** —— 详见 6.2
- [x] **动态路由 + RBAC** —— memory history / glob 组件映射 / dual-mode / v-permission / @iconify/json 懒加载
- [x] **布局 + 主题 + i18n** —— 暗黑模式 + 主色切换 + vue-i18n 中英文 + 面包屑 + Sider 折叠

---

### 6.1 请求层（已实现）

#### 架构决策：HTTP 走主进程

不做 axios in renderer + vite proxy（web 的模式），改为：

```
渲染进程 ──IPC──▶ 主进程 (Electron net) ──HTTP──▶ 后端
                 ↑ Node 环境，无 CORS
```

**为什么不沿用 web 的模式**：

| 方案                              | 问题                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| axios + 后端 CORS                 | 桌面框架不应强迫后端开 CORS（fork 不友好）                                                                 |
| axios + vite proxy                | electron-vite 有 [Issue #631](https://github.com/alex8088/electron-vite/issues/631)，`server.proxy` 不生效 |
| axios 直连 + `webSecurity: false` | 关掉浏览器安全策略，生产不可用                                                                             |

主进程转发是 VS Code / Slack / GitHub Desktop 的标准做法，也是这个框架的核心架构决策之一。

#### 文件结构

```
src/shared/types.ts                       # HttpConfig / HttpResponse / AppApi（共享类型）
src/main/services/http.ts                 # 主进程 HTTP 转发器（Electron net）
src/main/ipc/http.ts                      # ipcMain.handle('http:request')
src/preload/index.ts                      # contextBridge 暴露 window.api.http.request
src/renderer/src/service/request/
├── type.ts                               # RequestConfig / RequestResult / RequestOption
├── factory.ts                            # createFlatRequest 工厂
└── index.ts                              # 默认 request 实例（业务码 + 刷新逻辑）
src/renderer/src/service/token.ts         # token 内存缓存 + secureStore 桥
src/renderer/src/service/api/auth.ts      # /auth/login, /auth/refreshToken, /auth/getUserInfo
src/renderer/src/store/auth.ts            # Pinia auth store
```

#### 调用形态：flat result

业务侧永远拿到 `{ data, error, response }`，无需 try/catch：

```ts
const { data, error } = await fetchLogin(userName, password)
if (error) {
  // error.response?.data?.msg 拿后端消息
  return
}
// data 是 Api.Auth.LoginToken
```

#### 主进程 HTTP 服务（`src/main/services/http.ts`）

- 基于 Electron `net.request`（Node 环境，绕开 CORS）
- 责任单一：只做 HTTP 转发，不做业务逻辑（token、刷新等都在渲染层）
- 支持 `json` / `text` / `blob` / `arraybuffer` 响应类型
- 默认 60s 超时，可通过 config 覆盖
- `params` 用 `qs` 序列化，自动过滤 `null` / `undefined` / `''`

#### IPC 桥（typed）

```
渲染层                         Preload                        主进程
─────────────────────────────────────────────────────────────────────
window.api.http.request  ──▶  ipcRenderer.invoke       ──▶  ipcMain.handle('http:request')
   (HttpConfig)               ('http:request', config)       ↓
                              ◀── HttpResponse ──           httpRequest(config)
                                                            ↓
                                                            net.request
```

类型来自 `@shared/types`，三进程共用同一份声明，零 `any`。

#### 渲染层 factory（`service/request/factory.ts`）

`createFlatRequest(config, options)` 工厂，options 提供 4 个钩子：

| 钩子                                             | 职责                                       |
| ------------------------------------------------ | ------------------------------------------ |
| `onRequest(config)`                              | 注入 token、清理 params、加 `X-Request-Id` |
| `isBackendSuccess(response)`                     | 判断业务码是否成功                         |
| `onBackendFail(response, retry, originalConfig)` | 业务失败处理：token 过期刷新 + 重试        |
| `onError(error)`                                 | 网络/HTTP 错误回调（接全局 message 弹窗）  |
| `transform(response)`                            | 从 `{code, msg, data}` 提取 `data`         |

**重试机制**：`onBackendFail` 拿到 `retry(config)` 函数可重发请求，factory 内部用 `depth` 限制最多重试 2 次，防止死循环。

#### 业务码处理（`service/request/index.ts`）

业务码从 `.env` 读取，**全部用 `String()` 转字符串比较**（后端 `ResponseModel.code: int = 200` 返回数字）：

| 码                   | 含义       | 行为                            |
| -------------------- | ---------- | ------------------------------- |
| `200`                | 成功       | 提取 data 返回                  |
| `401`                | 登出       | 清 token，渲染层跳登录          |
| `9999 / 9998 / 3333` | token 过期 | 单飞刷新 → 重试一次；失败则登出 |

**单飞刷新**：`state.refreshTokenPromise` 是单例 Promise，并发请求同时遇到过期码时只触发一次 `/auth/refreshToken` 调用，其他请求 await 同一个 Promise。1s 后清空，允许下次再刷新。

#### Token 存储分层

| 层     | 位置                                                | 说明                                                              |
| ------ | --------------------------------------------------- | ----------------------------------------------------------------- |
| 持久层 | 主进程 `safeStorage` → `userData/secure-store.json` | OS 密钥链加密（macOS Keychain / Windows DPAPI / Linux libsecret） |
| 访问层 | `window.api.secureStore.get/set/delete/clear`       | 异步 IPC，渲染层无文件访问权                                      |
| 缓存层 | 渲染进程内存（`service/token.ts` 的 `cached`）      | 启动时一次性加载，后续请求零 IPC 开销                             |

对比 web 用 localStorage：

- ✅ XSS 拿不到明文 token（只能通过 IPC 调 `secureStore.get`，可观察/限速）
- ✅ 加密落盘，文件被偷也解不开
- ❌ 比 localStorage 慢（IPC 开销）→ 用内存缓存抵消

---

### 6.2 Typed IPC + Preload 沙箱（已实现）

#### 三层架构

```
src/main/ipc/*           ← ipcMain.handle 注册（每个领域一个文件）
src/preload/index.ts     ← contextBridge.exposeInMainWorld('api', {...})
src/shared/types.ts      ← 共享类型，三进程 import
```

#### 已实现的 IPC

| Channel                             | 方向            | 用途         |
| ----------------------------------- | --------------- | ------------ |
| `secure-store:get/set/delete/clear` | renderer → main | 安全存储读写 |
| `http:request`                      | renderer → main | HTTP 转发    |

#### 添加新 IPC 的步骤

1. 在 `src/shared/types.ts` 加类型
2. 在 `src/main/services/<name>.ts` 写业务逻辑
3. 在 `src/main/ipc/<name>.ts` 注册 `ipcMain.handle`
4. 在 `src/main/ipc/index.ts` 调用 `register<Name>Ipc()`
5. 在 `src/preload/index.ts` 通过 `contextBridge` 暴露白名单方法

**永远不要直接暴露 `ipcRenderer` 给渲染进程**。

#### 沙箱配置

```ts
// src/main/index.ts
new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: false, // 当前为 false；后续 Phase 2 计划切到 true（需验证 @electron-toolkit/preload 兼容性）
    contextIsolation: true, // 渲染进程与 preload 隔离（contextBridge 强制）
    nodeIntegration: false // 渲染进程无 require
  }
})
```

> `contextIsolation: true` + `nodeIntegration: false` 已是 Electron 安全默认值，不可关闭。`sandbox: true` 是更严格的安全模式，但会让 preload 脚本无法使用 Node API，需要在 Phase 2 验证依赖兼容性后再开启。

### 6.3 布局 + 主题 + i18n（已实现）

#### 布局：原生 `<aside>` 而非 NLayoutSider

桌面端 sider 用原生 `<aside>` + CSS width 过渡，**不**用 NaiveUI 的 `NLayoutSider`。原因：`NLayoutSider` 的 collapse 与 `NMenu` 的 `:collapsed` 同时存在时，折叠态下菜单空白（双重 collapse 冲突）。原生 sider 只控制宽度，NMenu 单独管 collapse 状态，互不干扰。

主题变量桥：原生 HTML 元素不享受 NaiveUI 的 provide/inject。通过 `useThemeVars()` 把 NaiveUI 主题变量映射到 CSS 变量：

```ts
const cssVars = computed(() => ({
  '--layout-sider-bg': themeVars.value.cardColor,
  '--layout-content-bg': themeVars.value.bodyColor,
  '--layout-text': themeVars.value.textColor1
}))
```

#### 主题分层：渲染层 + 原生层

| 层     | 控制什么                                     | API                                     |
| ------ | -------------------------------------------- | --------------------------------------- |
| 渲染层 | NaiveUI dark mode + 主色（4 预设）           | `useThemeVars()` + `themeStore`         |
| 原生层 | 标题栏背景、原生 scrollbar、原生右键菜单颜色 | `nativeTheme.themeSource`（主进程 API） |

⚠️ **必须双层同步**：只动渲染层会让原生标题栏停留在浅色，看起来主题只切了一半。Phase 2.1 加了 `theme:setNativeSource` IPC 桥（`src/main/ipc/theme.ts`），`themeStore` 的 `setDark/toggleDark` 调它同步到 `nativeTheme.themeSource`，启动时 `initNativeTheme()` 根据 localStorage 的 darkMode 初始化一次。

存储分层（D5 决策）：UI 偏好（darkMode / primaryColor / siderCollapse / locale）留 localStorage 与 web 端共享，桌面专属配置（windowState / shortcuts / tray）才进 electron-store。

#### i18n：菜单 label 用 `meta.i18nKey` 反查

后端路由返回的菜单 `name`（如 `system_operation-log`，带连字符）作为 i18n key 反查语言包。语言包里必须用引号 key：`'system_operation-log': 'Operation Log'`，不能用 `system_operation_log`（下划线）。

切换语言时菜单 label 不响应（`translate()` 是非响应式）—— `App.vue` 监听 `appStore.locale` 变化后调 `routeStore.regenerateMenus()` 重新翻译。

---

### Phase 2 — 让框架"有桌面感"（差异化）

- [x] **窗口管理 + 托盘 + 全局快捷键** —— 详见 `docs/spec-phase2.2-window-tray-shortcut.md`
- [ ] 自动更新接入
- [x] **日志 + 本地存储** —— 详见 `docs/spec-phase2.1-logging-store.md`
- [ ] 系统通知分发器

### Phase 3 — 让框架"有亮点"（吸引社区）

- [ ] AI 对话模块（对齐后端 AI 能力）
- [ ] AI 桌面场景示例（悬浮窗 / 划词 / 截图）
- [ ] 完整文档站

---

## 7. 不建议做的（与 web 重叠，无桌面优势）

| 功能                      | 原因                               |
| ------------------------- | ---------------------------------- |
| 完整复制 web 后台所有页面 | web 已经做得更好，桌面端做就是浪费 |
| 数据可视化大屏（ECharts） | 浏览器更适合大屏展示               |
| 用户/角色 CRUD 表格       | web 端足够，桌面端不增值           |

> 原则：**桌面端只在 web 做不到或体验差的地方发力**。

---

## 8. 工程化（已部分完成）

- [x] ESLint + Prettier（已对齐 web 的 oxfmt 配置）
- [x] TypeScript 严格模式 + 分包 tsconfig（node/web/shared）
- [x] Conventional Commits + commitlint + simple-git-hooks
- [x] GitHub Actions CI（typecheck / lint / fmt，仅在 PR 触发）
- [x] Release workflow（三平台构建，tag 触发）
- [x] LICENSE / Issue 模板 / PR 模板
- [x] pnpm-workspace.yaml 配置 onlyBuiltDependencies
- [x] 路径别名（`@renderer` / `@shared` / `@main`）
- [x] Phase 1：请求层（主进程 HTTP 转发）+ 鉴权（Keychain）
- [x] Phase 1：typed IPC + Preload 沙箱
- [x] CLAUDE.md 框架文档
- [x] README 改写为"开发框架"定位（生态导航 / 架构图 / 已实现特性 / 路线图）
- [x] Phase 1：动态路由 + RBAC（memory history / glob / dual-mode / v-permission / icon 懒加载）
- [x] Phase 1：布局 + 主题 + i18n（暗黑 / 主色 / 中英文 / 面包屑 / Sider 折叠）
- [x] Phase 1：nativeTheme 桥（渲染层暗黑同步到原生标题栏 / scrollbar）
- [x] Phase 2.1：日志（electron-log）+ 本地存储（electron-store）+ ESM 切换
- [x] Phase 2.2：WindowManager + TrayManager + ShortcutManager + shortcuts IPC
- [ ] 文档站接入 hohu-admin-docs

---

## 9. 开源后吸引的受众

- 想要 AI 划词助手的开发者
- 想要桌面通知告警的运维
- 想要全局快捷键唤起管理端的开发者
- Electron + Vue 3 学习者（作为生产级模板）
- 已用 hohu-admin-web 的团队，需要桌面端的扩展场景
