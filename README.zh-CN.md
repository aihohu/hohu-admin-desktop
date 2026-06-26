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
  <a href="./README.md">English</a>
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

---

## 简介

**hohu-admin-desktop** 是一个开源的 **Electron + Vue 3 桌面应用开发框架**。与 [hohu-admin-web](https://github.com/aihohu/hohu-admin-web)（浏览器端）、[hohu-admin-app](https://github.com/aihohu/hohu-admin-app)（移动端）共同构成 hohu 生态——三端都对接同一个 [hohu-admin](https://github.com/aihohu/hohu-admin) FastAPI 后端。

> **定位**：开发脚手架，不是终端用户产品。开发者可以基于它快速搭建与 hohu-admin 后端深度集成的桌面应用，也可作为任何 Electron + Vue 3 + TypeScript 项目的参考架构。

面向 AI 优先开发：类型安全的 IPC、进程间显式契约、约定优于配置的结构，让 AI 辅助编码事半功倍。

## 特性

### Phase 1 已实现

- **主进程 HTTP 转发** —— 所有网络请求通过 Electron `net` 模块经 typed IPC 转发，绕开浏览器 CORS 且不关闭安全策略。VS Code / Slack / GitHub Desktop 的标准做法。
- **安全 Token 存储** —— JWT 凭证由 OS 密钥链加密（macOS Keychain / Windows DPAPI / Linux libsecret），通过 Electron `safeStorage` 落盘，绝不写入 `localStorage`。
- **Typed IPC 桥** —— `src/shared/types.ts` 中的共享类型贯穿三个进程（main / preload / renderer），零 `any`。
- **鉴权流程** —— JWT 登录、单飞 token 刷新、应用启动自动登录。
- **Flat 请求形态** —— `const { data, error } = await fetchLogin(...)`，无需 try/catch。
- **Naive UI 集成** —— Provider 已配齐，`useMessage` / `useDialog` / `useNotification` 开箱即用。
- **代码规范** —— ESLint + Prettier + TypeScript 严格模式 + Conventional Commits + `simple-git-hooks` pre-commit/commit-msg 钩子。
- **CI / Release** —— GitHub Actions：PR 跑 typecheck + lint + fmt；tag 触发三平台并行构建（Win/Mac/Linux）。

### Phase 2 / 3 计划中

- 动态路由 + RBAC（按钮级权限）
- 布局系统 + 主题抽屉 + 暗黑模式
- vue-i18n（zh-cn / en-us）
- 托盘 + 全局快捷键 + 系统通知
- 自动更新（`electron-updater`）
- AI 对话模块（对齐后端 AI 能力）
- 悬浮窗 / 划词助手 / 截图问 AI 等 demo

完整规划见 [`docs/framework-design.md`](./docs/framework-design.md)。

## 技术栈

| 分类       | 技术                                       |
| ---------- | ------------------------------------------ |
| 外壳       | Electron 39                                |
| 构建工具   | electron-vite 5（底层 Vite 7）             |
| 框架       | Vue 3（Composition API, `<script setup>`） |
| 语言       | TypeScript 5.9（strict）                   |
| UI 库      | NaiveUI 2.44                               |
| 状态管理   | Pinia 3                                    |
| HTTP 传输  | Electron `net`（经 typed IPC，无 axios）   |
| 表单序列化 | `qs`（仅主进程使用）                       |

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│ 渲染进程（类浏览器环境）                                     │
│   Vue 3 + Pinia + NaiveUI                                   │
│      │                                                       │
│      │ window.api.http.request(config)                       │
│      ▼                                                       │
├─────────────────────────────────────────────────────────────┤
│ Preload（沙箱桥）                                            │
│   contextBridge → 暴露严格白名单 API                         │
│      │                                                       │
│      │ ipcRenderer.invoke('http:request', config)            │
│      ▼                                                       │
├─────────────────────────────────────────────────────────────┤
│ 主进程（Node.js 环境，无 CORS）                              │
│   ipcMain.handle → net.request → 后端                        │
│   secureStore → safeStorage → OS 密钥链                      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                hohu-admin FastAPI 后端
```

共享类型位于 `src/shared/types.ts`，三个进程都通过 `@shared/*` 别名导入。

## 快速开始

### 前置要求

- Node.js ≥ 20.19
- pnpm ≥ 10.5
- 已运行的 [hohu-admin](https://github.com/aihohu/hohu-admin) 后端（默认地址：`http://127.0.0.1:8000`）

### 安装

```bash
pnpm install
```

### 开发

```bash
pnpm dev
```

渲染进程启动在 `http://localhost:5173`，Electron 窗口会自动打开。

### 构建

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

### 质量检查

```bash
pnpm typecheck   # tsc（node）+ vue-tsc（web）
pnpm lint        # ESLint
pnpm fmt         # Prettier 检查（CI 强制）
pnpm format      # Prettier 自动格式化
```

## 项目结构

```
src/
├── main/              # 主进程（Node.js）
│   ├── index.ts       # 应用生命周期、窗口、IPC 注册
│   ├── services/      # http、secure-store
│   └── ipc/           # ipcMain.handle 注册
├── preload/           # 沙箱桥
│   ├── index.ts       # contextBridge 白名单
│   └── index.d.ts     # Window.api 类型声明
├── renderer/          # 渲染进程（Vue 3）
│   └── src/
│       ├── views/         # 页面（login、dashboard）
│       ├── components/
│       ├── store/         # Pinia（auth）
│       ├── service/       # 请求工厂 + API 封装
│       ├── typings/       # Api.* 命名空间
│       └── main.ts
└── shared/            # 跨进程类型（HttpConfig、AppApi 等）
```

路径别名：`@renderer/*`、`@shared/*`、`@main/*`（在 `tsconfig.*.json` 和 `electron.vite.config.ts` 中配置）。

## 后端集成

| 项目          | 值                                       |
| ------------- | ---------------------------------------- |
| 开发 API 地址 | `http://127.0.0.1:8000`                  |
| 生产 API 地址 | `https://api.hohu.org`                   |
| 认证方式      | `Authorization: Bearer <token>`          |
| 响应结构      | `{ code: number, msg: string, data: T }` |
| 成功码        | `200`                                    |

Phase 1 用到的端点：

- `POST /auth/login` → `{ token, refreshToken }`
- `POST /auth/refreshToken` → `{ token, refreshToken }`
- `GET /auth/getUserInfo` → `{ userId, userName, roles, buttons, ... }`

## 文档

- [`CLAUDE.md`](./CLAUDE.md) —— 项目约定、架构决策、易踩坑（贡献代码前必读）
- [`docs/framework-design.md`](./docs/framework-design.md) —— 完整设计思路、三阶段路线图、不该做什么

## 参与贡献

1. Fork → feature 分支（`feature/*` 或 `fix/*`）
2. 强制使用 Conventional Commits（`feat:`、`fix:`、`chore:`、`docs:` 等）
3. pre-commit 钩子会跑：`typecheck && lint && fmt && git diff --exit-code`
4. 向 `main` 提 PR —— CI 会跑 typecheck + lint + fmt

WIP 提交可临时用 `git commit --no-verify` 跳过钩子（不建议常用）。

## 许可证

[MIT](./LICENSE) © HoHu
