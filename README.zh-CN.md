# HoHu Admin Desktop

<p align="center">
  <b>Electron + Vue 3 桌面应用开发框架 · hohu 生态</b>
</p>

<p align="center">
  <a href="https://github.com/aihohu/hohu-admin">后端仓库</a> ·
  <a href="https://github.com/aihohu/hohu-admin-web">Web 前端</a> ·
  <a href="https://github.com/aihohu/hohu-admin-app">移动端</a> ·
  <a href="./docs/framework-design.md">设计文档</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="license" />
  <img src="https://img.shields.io/badge/Electron-39-47848F.svg" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue-3.5-42b883.svg" alt="Vue" />
  <img src="https://img.shields.io/badge/Vite-7-646cff.svg" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6.svg" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NaiveUI-2.44-36ad6a.svg" alt="NaiveUI" />
  <img src="https://img.shields.io/badge/Node.js->=20-339933.svg" alt="Node.js" />
  <img src="https://img.shields.io/badge/pnpm->=10.5-F69220.svg" alt="pnpm" />
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

---

## 截图

<p align="center">
  <img src="./docs/screenshots/login.png" alt="登录页" width="600" />
  <img src="./docs/screenshots/main.png" alt="主界面" width="600" />
  <img src="./docs/screenshots/dark.png" alt="暗黑模式" width="600" />
</p>

## 介绍

**hohu-admin-desktop** 是一个开源的 **Electron + Vue 3 桌面应用开发框架**。与 [hohu-admin-web](https://github.com/aihohu/hohu-admin-web)（浏览器端）、[hohu-admin-app](https://github.com/aihohu/hohu-admin-app)（移动端）共同构成 hohu 生态——三端都对接同一个 [hohu-admin](https://github.com/aihohu/hohu-admin) FastAPI 后端。

> **定位**：开发脚手架，不是终端用户产品。开发者可以基于它快速搭建与 hohu-admin 后端深度集成的桌面应用，也可作为任何 Electron + Vue 3 + TypeScript 项目的参考架构。

为 AI 优先开发而设计：类型化 IPC、进程间显式契约、约定式结构，让 AI 辅助编码工具容易扩展。

## 功能

### 框架地基（Phase 1）

- **主进程 HTTP 转发** —— 所有渲染层网络请求通过 Electron `net` 模块经类型化 IPC 发出，**绕过浏览器 CORS** 而不关闭安全。VS Code / Slack / GitHub Desktop 都是这个套路。
- **安全 token 存储** —— JWT token 由 OS 钥匙串加密（macOS Keychain / Windows DPAPI / Linux libsecret），通过 Electron `safeStorage` 写入，绝不进 `localStorage`。
- **类型化 IPC 桥** —— 共享类型在 `src/shared/types.ts`，三进程（main / preload / renderer）共享，零 `any`。
- **登录态流程** —— JWT 登录、单飞 token 刷新、应用启动自动登录。
- **扁平请求形状** —— `const { data, error } = await fetchLogin(...)`，不用 try/catch。
- **动态路由 + RBAC** —— 后端驱动菜单、glob 组件映射、内存 history、双模式（dynamic / static）、`v-permission` 指令 + `hasAuth()` + `TableHeaderOperation`。
- **布局 + 主题 + i18n** —— 暗黑模式（同步到 `nativeTheme`）、主色预设、zh-cn / en-us、面包屑、侧栏折叠。
- **NaiveUI 集成** —— Providers、composables（`useMessage`、`useDialog`、`useNotification`）开箱即用。

### 桌面差异化（Phase 2）

- **统一日志**（`electron-log`）—— main / preload / renderer 三端统一写到 `~/Library/Logs/{appName}/`（macOS）或平台等价路径。
- **持久化配置**（`electron-store`）—— 窗口状态、快捷键、托盘行为、通知开关等写入 `userData/config.json`。
- **窗口管理器** —— 主窗口单例，窗口状态（位置、尺寸、最大化、全屏）跨重启持久化。
- **系统托盘** —— 托盘图标 + 右键菜单（显示/隐藏 / 重载 / DevTools / 检查更新 / 退出）；关闭按钮最小化到托盘。
- **全局快捷键** —— 默认 `Cmd/Ctrl+Shift+H` 唤起窗口，可通过 IPC 配置。
- **自动更新**（`electron-updater` v6）—— 双 provider（GitHub Releases / Generic 静态 URL）、24 小时后台检查节流、skip-version、dev 模式读 `dev-app-update.yml`。
- **通知调度器** —— 每个 `new Notification()` 都走唯一管理器；渲染层通过 `window.api.notification.show()` 推送；GC 安全引用持有、全局静音、动作回调钩子。

> 完整路线图和分阶段 spec 见 [`docs/framework-design.md`](./docs/framework-design.md)。

## 技术栈

| 类别       | 技术                                             |
| ---------- | ------------------------------------------------ |
| 壳         | Electron 39                                      |
| 构建工具   | electron-vite 5（底层 Vite 7）                   |
| 框架       | Vue 3（Composition API，`<script setup>`）       |
| 语言       | TypeScript 5.9（strict）                         |
| UI 库      | NaiveUI 2.44                                     |
| 状态       | Pinia 3                                          |
| HTTP       | Electron `net`（类型化 IPC，不用 axios）         |
| 主进程库   | electron-log / electron-store / electron-updater |
| 表单序列化 | `qs`（仅主进程）                                 |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer（类浏览器）                                         │
│   Vue 3 + Pinia + NaiveUI                                   │
│      │                                                       │
│      │ window.api.http.request(config)                       │
│      ▼                                                       │
├─────────────────────────────────────────────────────────────┤
│ Preload（沙盒桥）                                            │
│   contextBridge → 暴露严格白名单 API                         │
│      │                                                       │
│      │ ipcRenderer.invoke('http:request', config)            │
│      ▼                                                       │
├─────────────────────────────────────────────────────────────┤
│ Main（Node.js 运行时 —— 无 CORS）                            │
│   ipcMain.handle → net.request → 后端                        │
│   secureStore → safeStorage → OS 钥匙串                      │
│   WindowManager / TrayManager / ShortcutManager /             │
│   UpdaterManager / NotificationManager                       │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                hohu-admin FastAPI 后端
```

共享类型（`src/shared/types.ts`）通过 `@shared/*` 别名被三端导入。

## 快速开始

### 前置要求

- Node.js ≥ 20.19
- pnpm ≥ 10.5
- 一个运行中的 [hohu-admin](https://github.com/aihohu/hohu-admin) 后端（默认：`http://127.0.0.1:8000`）

### 安装

```bash
pnpm install
```

### 开发

```bash
pnpm dev
```

渲染层启动在 `http://localhost:5173`；Electron 窗口会自动打开。**主进程改动需要重启 dev**（HMR 只覆盖渲染层）。

### 打包

```bash
# Windows（.exe NSIS 安装包）
pnpm build:win

# macOS（.dmg）
pnpm build:mac

# Linux（.AppImage / .deb / .snap）
pnpm build:linux

# 不打包的调试构建
pnpm build:unpack
```

产物落在 `release/`。

### 质量门

```bash
pnpm typecheck   # tsc（node）+ vue-tsc（web）
pnpm lint        # ESLint
pnpm test        # node:test + tsx（纯函数单测）
pnpm fmt         # Prettier 检查（CI 门）
pnpm format      # Prettier 自动格式化
```

## 路由模式

框架内置**两种可切换路由模式**——切换一个环境变量，无需改代码：

| 模式              | 行为                                                                   | 适用场景                                 |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `dynamic`（默认） | 登录后从后端 `/menu` 拉菜单，按用户角色/按钮权限过滤                   | 与 **hohu-admin** 后端深度集成           |
| `static`          | 菜单在 `src/renderer/src/router/static-routes.ts` 写死，不请求后端菜单 | fork 做独立桌面应用、离线场景、demo 模板 |

### 切换

```bash
# .env / .env.development / .env.production
RENDERER_VITE_ROUTE_MODE=static   # 或 'dynamic'
```

### Static 模式 30 秒上手

编辑 `src/renderer/src/router/static-routes.ts`：

```ts
export const staticRoutes: Api.Route.UserRoute[] = [
  {
    name: 'home',
    path: '/home',
    component: 'layout.base$view.home', // layout + view 合并
    meta: { title: '首页', icon: 'carbon:home', order: 0 }
  },
  {
    name: 'myapp',
    path: '/myapp',
    component: 'layout.base', // 布局容器（父级菜单）
    meta: { title: '我的应用', icon: 'carbon:app' },
    children: [
      {
        name: 'myapp_dashboard',
        path: '/myapp/dashboard',
        component: 'view.myapp_dashboard', // 纯视图，复用父级 layout
        meta: { title: '仪表盘', icon: 'carbon:dashboard' }
      }
    ]
  }
]
```

**component 字符串约定**（3 种，见 `router/transform.ts`）：

| 模式                    | 含义                                          |
| ----------------------- | --------------------------------------------- |
| `layout.base$view.home` | 单级路由：layout + view 合并成一个菜单项      |
| `layout.base`           | 布局容器（父级菜单）；必须有 `children`       |
| `view.myapp_dashboard`  | 纯视图，仅作为 children 出现；复用父级 layout |

**view key 推导规则**（见 `router/components.ts`）：`views/foo/bar/index.vue` → `foo_bar`。文件必须命名为 `index.vue` 才会被 glob 扫到。

**Static 模式下的 RBAC**：

- 菜单可见性仍然按 `meta.roles` 对 `userInfo.roles` 过滤（userInfo.roles 仍来自后端 `/auth/getUserInfo`）。
- 按钮级权限（`v-permission` / `hasAuth()` / `TableHeaderOperation`）仍工作，依赖 `userInfo.buttons`。
- 后端菜单接口（`/menu`）**绝不**会被调用——断网/无后端菜单模块也能跑。

完整字段参考和「如何加新页面」示例见 [`src/renderer/src/router/static-routes.ts`](./src/renderer/src/router/static-routes.ts) 顶部注释。

## 项目结构

```
src/
├── main/              # 主进程（Node.js）
│   ├── index.ts       # App 生命周期、窗口、IPC 注册
│   ├── services/      # WindowManager / TrayManager / ShortcutManager /
│   │                  # UpdaterManager / NotificationManager / http / secure-store
│   └── ipc/           # ipcMain.handle 注册（类型化）
├── preload/           # 沙盒桥
│   ├── index.ts       # contextBridge 白名单
│   └── index.d.ts     # Window.api 类型
├── renderer/          # 渲染层（Vue 3）
│   └── src/
│       ├── views/         # 页面（login、home、_builtin）
│       ├── components/
│       ├── store/         # Pinia（auth、theme、app、route）
│       ├── service/       # 请求工厂 + API 封装
│       ├── locales/       # zh-cn / en-us
│       ├── typings/       # Api.* 命名空间
│       └── main.ts
└── shared/            # 跨进程类型（HttpConfig、AppApi、...）
```

路径别名：`@renderer/*`、`@shared/*`、`@main/*`、`@resources/*`（在 `tsconfig.*.json` 和 `electron.vite.config.ts` 里配置）。

## 后端集成

| 项               | 值                                       |
| ---------------- | ---------------------------------------- |
| API Base（dev）  | `http://127.0.0.1:8000`                  |
| API Base（prod） | `https://api.hohu.org`                   |
| 鉴权             | `Authorization: Bearer <token>`          |
| 响应形状         | `{ code: number, msg: string, data: T }` |
| 成功码           | `200`                                    |

鉴权接口：

- `POST /auth/login` → `{ token, refreshToken }`
- `POST /auth/refreshToken` → `{ token, refreshToken }`
- `GET /auth/getUserInfo` → `{ userId, userName, roles, buttons, ... }`

## 文档

- [`CLAUDE.md`](./CLAUDE.md) —— 项目约定、架构决策、常见坑（贡献前必读）
- [`docs/framework-design.md`](./docs/framework-design.md) —— 完整设计思路、三阶段路线图、What-NOT-to-Do 列表
- 各阶段 spec：`docs/spec-phase1-routes-rbac.md`、`docs/spec-phase2.{1,2,3,4}-*.md`

## 平台支持

| 平台    | 自动更新                                                                         | 系统通知                               |
| ------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| Windows | ✅ NSIS，开箱即用                                                                | ✅                                     |
| macOS   | ⚠️ 需要代码签名（Developer ID Application 证书）。未签名能检测能下载但安装被拒。 | ✅                                     |
| Linux   | ✅ AppImage（deb / snap 不支持自动更新）                                         | ⚠️ 需要 libnotify；容器/无桌面环境无效 |

公证（notarization）是 Apple 对**首次分发**的独立要求（如下载的 DMG 第一次运行），与自动更新流程无关。签名和公证默认都不配置——开发者在发布自有应用时自行设置。

## 贡献

见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。欢迎对 `main` 分支提 PR。强制 Conventional Commits；pre-commit hook 跑 `typecheck && lint && fmt && git diff --exit-code`。

## 安全

发现漏洞？见 [`SECURITY.md`](./SECURITY.md)。

## 更新日志

见 [`CHANGELOG.md`](./CHANGELOG.md)。

## 协议

[MIT](./LICENSE) © HoHu
