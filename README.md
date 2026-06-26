# HoHu Admin Desktop

<p align="center">
  <b>Electron + Vue 3 desktop application framework · hohu ecosystem</b>
</p>

<p align="center">
  <a href="https://github.com/aihohu/hohu-admin">Backend</a> ·
  <a href="https://github.com/aihohu/hohu-admin-web">Web Frontend</a> ·
  <a href="https://github.com/aihohu/hohu-admin-app">Mobile App</a> ·
  <a href="./docs/framework-design.md">Design Doc</a>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
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

## Introduction

**hohu-admin-desktop** is an open-source **Electron + Vue 3 desktop application framework**. It pairs with [hohu-admin-web](https://github.com/aihohu/hohu-admin-web) (browser) and [hohu-admin-app](https://github.com/aihohu/hohu-admin-app) (mobile) to form the hohu ecosystem — all three front-ends consume the same [hohu-admin](https://github.com/aihohu/hohu-admin) FastAPI backend.

> **Positioning:** a developer scaffold, not an end-user product. Clone it to build desktop apps with full hohu-admin backend integration, or use it as a reference architecture for any Electron + Vue 3 + TypeScript project.

Designed for AI-first development: typed IPC, explicit contracts between processes, and conventional structure make it easy to extend with AI-assisted coding tools.

## Features

### Already implemented (Phase 1)

- **Main-process HTTP forwarder** — All network requests route through Electron's `net` module via typed IPC, bypassing browser CORS without disabling security. Standard pattern used by VS Code / Slack / GitHub Desktop.
- **Secure token storage** — JWT tokens encrypted by the OS keychain (macOS Keychain / Windows DPAPI / Linux libsecret) via Electron `safeStorage`, never written to `localStorage`.
- **Typed IPC bridge** — Shared types in `src/shared/types.ts` flow through all three processes (main / preload / renderer) with zero `any`.
- **Auth flow** — JWT login, single-flight token refresh, auto-login on app start.
- **Flat request shape** — `const { data, error } = await fetchLogin(...)` — no try/catch needed.
- **Naive UI integrated** — Providers, composables (`useMessage`, `useDialog`, `useNotification`) ready to use.
- **Code conventions** — ESLint, Prettier, TypeScript strict mode, Conventional Commits, `simple-git-hooks` pre-commit/commit-msg hooks.
- **CI/Release** — GitHub Actions: typecheck + lint + fmt on PR; three-platform builds (Windows/macOS/Linux) on tag.

### Planned (Phase 2 / 3)

- Dynamic routes + RBAC (button-level permissions)
- Layout system + theme drawer + dark mode
- vue-i18n (zh-cn / en-us)
- Tray + global shortcuts + system notifications
- Auto-updater (`electron-updater`)
- AI chat module (aligned with backend AI capabilities)
- Overlay window / selection assistant / screenshot-to-AI demos

See [`docs/framework-design.md`](./docs/framework-design.md) for the full roadmap.

## Tech Stack

| Category           | Technology                                |
| ------------------ | ----------------------------------------- |
| Shell              | Electron 39                               |
| Build Tool         | electron-vite 5 (Vite 7 under the hood)   |
| Framework          | Vue 3 (Composition API, `<script setup>`) |
| Language           | TypeScript 5.9 (strict)                   |
| UI Library         | NaiveUI 2.44                              |
| State              | Pinia 3                                   |
| HTTP Transport     | Electron `net` (via typed IPC, no axios)  |
| Form Serialization | `qs` (main process only)                  |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer (browser-like)                                     │
│   Vue 3 + Pinia + NaiveUI                                   │
│      │                                                       │
│      │ window.api.http.request(config)                       │
│      ▼                                                       │
├─────────────────────────────────────────────────────────────┤
│ Preload (sandboxed bridge)                                  │
│   contextBridge → exposes strict whitelist API              │
│      │                                                       │
│      │ ipcRenderer.invoke('http:request', config)            │
│      ▼                                                       │
├─────────────────────────────────────────────────────────────┤
│ Main (Node.js runtime — no CORS)                            │
│   ipcMain.handle → net.request → backend                    │
│   secureStore → safeStorage → OS keychain                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                hohu-admin FastAPI backend
```

Shared types (`src/shared/types.ts`) are imported by all three processes via the `@shared/*` alias.

## Quick Start

### Prerequisites

- Node.js ≥ 20.19
- pnpm ≥ 10.5
- A running [hohu-admin](https://github.com/aihohu/hohu-admin) backend (default: `http://127.0.0.1:8000`)

### Install

```bash
pnpm install
```

### Develop

```bash
pnpm dev
```

The renderer boots on `http://localhost:5173`; the Electron window opens automatically.

### Build

```bash
# Windows (.exe NSIS installer)
pnpm build:win

# macOS (.dmg)
pnpm build:mac

# Linux (.AppImage / .deb / .snap)
pnpm build:linux

# Debug build without packaging
pnpm build:unpack
```

### Quality Gates

```bash
pnpm typecheck   # tsc (node) + vue-tsc (web)
pnpm lint        # ESLint
pnpm fmt         # Prettier check (CI gate)
pnpm format      # Prettier auto-format
```

## Project Structure

```
src/
├── main/              # Main process (Node.js)
│   ├── index.ts       # App lifecycle, window, IPC registration
│   ├── services/      # http, secure-store
│   └── ipc/           # ipcMain.handle registrations
├── preload/           # Sandboxed bridge
│   ├── index.ts       # contextBridge whitelist
│   └── index.d.ts     # Window.api types
├── renderer/          # Renderer process (Vue 3)
│   └── src/
│       ├── views/         # Pages (login, dashboard)
│       ├── components/
│       ├── store/         # Pinia (auth)
│       ├── service/       # Request factory + API wrappers
│       ├── typings/       # Api.* namespaces
│       └── main.ts
└── shared/            # Cross-process types (HttpConfig, AppApi, ...)
```

Path aliases: `@renderer/*`, `@shared/*`, `@main/*` (configured in `tsconfig.*.json` and `electron.vite.config.ts`).

## Backend Integration

| Item            | Value                                    |
| --------------- | ---------------------------------------- |
| API Base (dev)  | `http://127.0.0.1:8000`                  |
| API Base (prod) | `https://api.hohu.org`                   |
| Auth            | `Authorization: Bearer <token>`          |
| Response shape  | `{ code: number, msg: string, data: T }` |
| Success code    | `200`                                    |

Endpoints used in Phase 1:

- `POST /auth/login` → `{ token, refreshToken }`
- `POST /auth/refreshToken` → `{ token, refreshToken }`
- `GET /auth/getUserInfo` → `{ userId, userName, roles, buttons, ... }`

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — Project conventions, architecture decisions, common pitfalls (read this first when contributing)
- [`docs/framework-design.md`](./docs/framework-design.md) — Full design rationale, three-phase roadmap, what-not-to-do list

## Contributing

1. Fork → feature branch (`feature/*` or `fix/*`)
2. Conventional Commits enforced (`feat:`, `fix:`, `chore:`, `docs:`, ...)
3. Pre-commit hook runs: `typecheck && lint && fmt && git diff --exit-code`
4. Open a PR against `main` — CI runs typecheck + lint + fmt

For skip-WIP commits: `git commit --no-verify` (use sparingly).

## License

[MIT](./LICENSE) © HoHu
