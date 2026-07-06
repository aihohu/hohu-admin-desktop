# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release as an open-source Electron + Vue 3 desktop framework.
- **Dual-pane tabs**: VSCode-style split editor groups with drag-resize sash, right-click context menu (close/close-others/close-left/right/all, pin/unpin, move-to-other-group), persisted to localStorage.

### Foundation (Phase 1)

- Main-process HTTP forwarder via Electron `net` module — bypasses browser CORS without disabling security.
- Typed IPC bridge: shared types in `src/shared/types.ts`, strict `contextBridge` whitelist, never exposing `ipcRenderer` directly.
- Auth flow: JWT login, single-flight token refresh, auto-login on app start.
- Token storage via `safeStorage`: macOS Keychain / Windows DPAPI / Linux libsecret, never `localStorage`.
- Flat request shape: `const { data, error } = await fetchXxx(...)` — no try/catch needed.
- Dynamic routes + RBAC: backend-driven menu, glob component mapping, memory history, dual-mode (dynamic/static), `v-permission` directive + `hasAuth()` + `TableHeaderOperation`.
- Layout system: dark mode (synced to `nativeTheme`), primary color presets, zh-cn / en-us, breadcrumb, sider collapse.
- `X-Request-Id` auto-injected via `nanoid()` for tracing.

### Desktop differentiation (Phase 2)

- **Phase 2.1 — Logging + Local Storage**: `electron-log` unified logging across all three processes; `electron-store` for non-sensitive config (window state, shortcuts, notification toggle); ESM transition (`"type": "module"`, main outputs ESM).
- **Phase 2.2 — Window / Tray / Shortcuts**: `WindowManager` singleton with window-state persistence; `TrayManager` (right-click menu, close-to-tray); `ShortcutManager` (default `Cmd/Ctrl+Shift+H`, configurable); `shortcuts` IPC for renderer.
- **Phase 2.3 — Auto-Update**: `UpdaterManager` singleton wrapping `electron-updater` v6; dual provider (GitHub Releases / Generic); 24h background throttle; `skipVersion`; dev mode reads `dev-app-update.yml`; build-time provider switching via `scripts/gen-publish-config.mjs`.
- **Phase 2.4 — Notification Dispatcher**: `NotificationManager` singleton; every `new Notification()` goes through one place; renderer pushes via `window.api.notification.show()`; GC-safe `activeNotifications: Set<Notification>` retention; global mute; action callback hooks; forward-compatible `source: 'system' | 'renderer' | 'backend'`.

### Engineering

- ESLint + Prettier aligned with web's config; TypeScript strict mode; split `tsconfig` (node / web / shared).
- Conventional Commits + commitlint + `simple-git-hooks` (pre-commit + commit-msg).
- GitHub Actions CI: typecheck + lint + fmt + test on PR; three-platform build on `v*` tag.
- Path aliases: `@renderer/*` / `@shared/*` / `@main/*` / `@resources/*` / `@iconify-json/*`.
- `node:test` + tsx for pure-function unit tests (`src/main/services/__tests__/`).
- Bilingual docs in `hohu-admin-docs` repo (`docs/guide/desktop/*` × `docs/zh/guide/desktop/*`).

[Unreleased]: https://github.com/aihohu/hohu-admin-desktop/compare/HEAD
