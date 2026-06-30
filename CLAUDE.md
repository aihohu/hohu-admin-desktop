# CLAUDE.md

## Project Overview

**hohu-admin-desktop** is an open-source **Electron + Vue 3 desktop application framework** that pairs with [hohu-admin-web](../hohu-admin-web) (browser) and [hohu-admin-app](../hohu-admin-app) (mobile) to form the hohu ecosystem. All three front-ends consume the same FastAPI backend ([hohu-admin](../hohu-admin)).

**Positioning:** a developer scaffold, not an end-user product. Developers clone it to build desktop apps with full hohu-admin backend integration.

**Tech Stack:** Electron 39 / electron-vite 5 / Vue 3.5 / TypeScript 5.9 / NaiveUI 2.44 / Pinia 3 / Vite 7

**Requirements:** pnpm >= 10.5, Node >= 20.19

## Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Start Electron + Vite dev (renderer on http://localhost:5173)
pnpm build                # Typecheck + electron-vite build (production bundle)
pnpm build:win            # Build Windows installer (.exe / NSIS)
pnpm build:mac            # Build macOS (.dmg)
pnpm build:linux          # Build Linux (.AppImage / .deb / .snap)
pnpm build:unpack         # Build without packaging (debug)
pnpm typecheck            # tsc (node) + vue-tsc (web)
pnpm lint                 # ESLint check
pnpm fmt                  # Prettier format check (CI gate)
pnpm format               # Prettier auto-format (write)
```

**Must run `pnpm lint && pnpm fmt` before commits** — pre-commit hook enforces typecheck + lint + format check (`git diff --exit-code`).

## Architecture

Three-process Electron layout with a shared types module:

```
src/
├── main/              # Main process (Node.js runtime)
│   ├── index.ts       # Entry: app lifecycle, window, IPC registration
│   ├── services/      # Stateless services (http, secure-store, ...)
│   └── ipc/           # ipcMain.handle registrations (typed)
├── preload/           # Preload scripts (sandboxed bridge)
│   ├── index.ts       # contextBridge.exposeInMainWorld('api', ...)
│   └── index.d.ts     # Window.api type declarations
├── renderer/          # Renderer process (browser-like)
│   └── src/
│       ├── views/         # Pages
│       ├── components/    # Reusable components
│       ├── store/         # Pinia stores
│       ├── service/       # Request layer + API wrappers
│       │   ├── request/   # createFlatRequest factory
│       │   ├── api/       # Endpoint wrappers (auth, ...)
│       │   └── token.ts   # Token cache + secureStore bridge
│       ├── typings/       # Global TS namespaces (Api.*, Response, etc.)
│       └── main.ts        # createApp entry
└── shared/            # Cross-process type definitions
    └── types.ts       # HttpConfig, HttpResponse, AppApi (imported by all 3 processes)
```

### Key Architectural Decisions

1. **HTTP goes through main process** (not axios in renderer)
   - Renderer calls `window.api.http.request(config)` → IPC → main process `net.request` → backend
   - **Bypasses browser CORS** in dev; behaves identically in prod
   - No axios dependency in renderer; `qs` only used in main process
   - See `src/main/services/http.ts` and `src/renderer/src/service/request/factory.ts`

2. **Typed IPC bridge**
   - Shared types live in `src/shared/types.ts` — imported via `@shared/types` alias
   - Preload exposes a strict whitelist via `contextBridge`; never expose `ipcRenderer` directly
   - Adding a new IPC channel: define type in shared, add handler in `src/main/ipc/`, expose in `src/preload/index.ts`

3. **Token storage uses OS keychain** (not localStorage)
   - `safeStorage` (Electron built-in) encrypts with macOS Keychain / Windows DPAPI / Linux libsecret
   - File-backed at `userData/secure-store.json` (mode 0600)
   - Renderer accesses via `window.api.secureStore.get/set/delete/clear` (async IPC)
   - See `src/main/services/secure-store.ts`

4. **Preload sandbox** — currently `sandbox: false` (scaffold default), `contextIsolation: true`, `nodeIntegration: false`. Tightening to `sandbox: true` is a Phase 2 task (pending `@electron-toolkit/preload` compatibility check).

## Backend Integration

- **API base:** `http://127.0.0.1:8000` in dev (configure via `.env.development`)
- **Response:** `{ code: number, msg: string, data: T }` — success code `200`
- **Auth:** `Authorization: Bearer <token>` header
- **Token endpoints:**
  - `POST /auth/login` body `{ userName, password }` → `{ token, refreshToken }`
  - `POST /auth/refreshToken` body `{ refreshToken }` → `{ token, refreshToken }`
  - `GET /auth/getUserInfo` → `{ userId, userName, userAvatar, roles, buttons }`
- **Snowflake IDs:** always `string` in frontend types
- **No case conversion** needed — backend returns camelCase directly

## Request Layer Pattern

Flat request shape: `const { data, error } = await fetchLogin(...)` — no try/catch needed.

**Adding a new API endpoint:**

1. Define types in `src/renderer/src/typings/api/<module>.d.ts` using `declare namespace Api { namespace Module { ... } }`
2. Create wrapper in `src/renderer/src/service/api/<module>.ts`:

   ```ts
   import { request } from '../request'

   export function fetchList(params?: Api.Module.Query) {
     return request<Api.Module.List>({ url: '/module/list', method: 'get', params })
   }
   ```

3. Call from store or component: `const { data, error } = await fetchList(...)`

**Business code handling** is centralized in `service/request/index.ts`:

- Success: `String(code) === SERVICE_SUCCESS_CODE` (env-driven, code may be `number` or `string`)
- Expired token codes (e.g. `9999,9998,3333`): trigger single-flight refresh, retry once
- Logout codes (e.g. `401`): clear tokens, renderer redirects to login

## Environment Variables

All renderer env vars use `RENDERER_VITE_` prefix (electron-vite convention):

```bash
# .env (shared across modes)
RENDERER_VITE_SERVICE_SUCCESS_CODE=200
RENDERER_VITE_SERVICE_LOGOUT_CODES=401
RENDERER_VITE_SERVICE_EXPIRED_TOKEN_CODES=9999,9998,3333
RENDERER_VITE_STORAGE_PREFIX=hoHu_

# .env.development
RENDERER_VITE_SERVICE_BASE_URL=http://127.0.0.1:8000
# 路由模式：dynamic（后端拉菜单，默认）| static（前端写死，适合 fork 做独立应用）
RENDERER_VITE_ROUTE_MODE=dynamic

# .env.production
RENDERER_VITE_SERVICE_BASE_URL=https://api.hohu.org
RENDERER_VITE_ROUTE_MODE=dynamic
```

Main process env vars use `MAIN_VITE_` prefix; preload uses `PRELOAD_VITE_`.

## Path Aliases

| Alias           | Resolves to                       | Used by                 |
| --------------- | --------------------------------- | ----------------------- |
| `@renderer/*`   | `src/renderer/src/*`              | renderer                |
| `@shared/*`     | `src/shared/*`                    | main, preload, renderer |
| `@main/*`       | `src/main/*`                      | main                    |
| `@resources/*`  | `resources/*`                     | main, renderer          |
| `@iconify-json` | `node_modules/@iconify/json/json` | renderer                |

Configured in `tsconfig.{node,web}.json` (paths) and `electron.vite.config.ts` (vite resolve.alias).

**Avoid deep relative imports** like `../../../resources/icon.png` — use `@resources/icon.png` instead. Note: `?asset` modifier works with aliases (e.g. `import icon from '@resources/icon.png?asset'`).

## Security

- **CSP** is set in `src/renderer/index.html`. To allow new origins (e.g. image CDNs, WebSocket), edit the `connect-src` / `img-src` directives.
- **External links** opened via `shell.openExternal` — currently allows all URLs. Tighten in `src/main/index.ts` if needed (filter by protocol).
- **DevTools**: F12 toggle in dev, disabled in prod (via `@electron-toolkit/utils` optimizer).

## Common Pitfalls

1. **Backend `code` is `number`, env codes are strings** — always compare with `String(code) === SERVICE_SUCCESS_CODE`. The `Response.code` type in `typings/app.d.ts` is `number` to match backend reality.
2. **CSP blocks API calls** — adding a new backend domain requires updating `connect-src` in `index.html`. Reload the dev server (not just Cmd+R) after CSP changes.
3. **electron-vite's `server.proxy` is broken** ([Issue #631](https://github.com/alex8088/electron-vite/issues/631)) — that's why we route HTTP through the main process instead.
4. **Token never persists to localStorage** — only to `safeStorage`. After logout, `secure-store.json` is cleared.
5. **Restart `pnpm dev` after editing** `electron.vite.config.ts`, `tsconfig.*.json`, `.env*`, or any file under `src/main/` or `src/preload/` (HMR only covers renderer).
6. **Preload runs before renderer** — `useMessage()` and similar NaiveUI composables must be called inside `<NMessageProvider>` children, not in the same component that mounts the provider.
7. **`X-Request-Id`** header is auto-injected by `nanoid()` for tracing.
8. **Token refresh uses single-flight** — concurrent requests that hit expired-token code share one refresh Promise (see `state.refreshTokenPromise` in `service/request/index.ts`).
9. **Renderer dark mode does NOT affect native UI** — the macOS title bar background, native scrollbar, and native context menu color are controlled by `nativeTheme` (main-process-only API). The renderer's `darkMode` toggle only affects NaiveUI. Use the `theme:setNativeSource` IPC bridge in `src/main/ipc/theme.ts` to sync — the theme store calls it in `setDark/toggleDark/initNativeTheme`. Forget this and dark mode looks half-applied.
10. **ESM-only npm packages can't be `require()`'d** — electron-vite defaults to bundling main as CJS, which breaks pure-ESM packages (e.g. `electron-store` v11) with `TypeError: X is not a constructor`. Fix: `"type": "module"` in `package.json`, electron-vite auto-outputs ESM. Preload extension changes from `.js` to `.mjs`, so update any `preload: join(__dirname, '../preload/index.js')` references.
11. **macOS 自动更新需要代码签名** — electron-updater 在 macOS 通过 `validateUpdate` 校验更新包签名，要求 app 自身已用 Developer ID Application 证书签名（`electron-builder.yml` 的 `Mac.identity` 配置）。当前未配置签名 → 能检测能下载，但安装被拒。公证（notarization）是 Apple 对**首次分发**的独立要求（外链 DMG 第一次运行），与自动更新流程无关。Windows NSIS / Linux AppImage 不受影响。
12. **dev 模式读 dev-app-update.yml** — `pnpm dev` 下 electron-updater 默认 no-op，`UpdaterManager.init` 显式设置 updateConfigPath。命中占位 URL（example.com）会自动跳过 init 避免每次 dev 都打 error 日志。要在 dev 验证更新流程：编辑 `dev-app-update.yml` 的 url 指向本地静态服务器或 GitHub raw，并保证目标版本号高于 `package.json` 的 version。改完重启 dev，不重启不生效。
13. **provider 是构建时决定的** — `electron-builder` 把 publish 配置烤进 `app-update.yml` 打包到 asar 里。运行时无法切换；要换 provider 必须重新 build。`.env` 的 `UPDATER_PROVIDER` 在 build 前由 `scripts/gen-publish-config.mjs` 读取，注入到生成的 `build/electron-builder.yml`。
14. **CJS 包在 ESM 项目里不能 named import** — 项目是 ESM (`"type": "module"`)，但有些依赖仍是 CJS（如 `electron-updater` v6）。`import { autoUpdater } from 'electron-updater'` typecheck 过（TS 的 `esModuleInterop` 假装可以），运行时炸 `Named export 'autoUpdater' not found`。修：`import electronUpdater from 'electron-updater'; const { autoUpdater } = electronUpdater`。type-only 标记（`import { type X }`）不受影响，因为类型在编译时被擦除。

## Git Workflow

- **Commit style:** Conventional Commits (enforced by commitlint + `@commitlint/config-conventional`)
  - `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`, `refactor: ...`, `test: ...`, `ci: ...`
- **Pre-commit hook** (via `simple-git-hooks`): runs `pnpm typecheck && pnpm lint && pnpm fmt && git diff --exit-code`
- **Commit-msg hook:** validates Conventional Commits format
- **Branches:** `main` (stable), feature branches like `feature/*`, `fix/*`
- **CI** (`.github/workflows/ci.yml`): runs on PR to main — typecheck + lint + fmt
- **Release** (`.github/workflows/release.yml`): triggered by `v*` tags — builds Windows/macOS/Linux in parallel, uploads artifacts to GitHub Release

To skip hooks for WIP commits: `git commit --no-verify` (use sparingly).

## Roadmap Status

Phase 1 (foundation) — **complete**:

- ✅ Project bootstrap (code conventions, CI, hooks, LICENSE)
- ✅ Request layer (main-process HTTP forwarder, flat result shape)
- ✅ Auth (JWT login, token refresh, Keychain storage, auto-login)
- ✅ Dynamic routes + RBAC (memory history, glob component mapping, dual-mode dynamic/static, v-permission)
- ✅ Layout + theme + i18n (dark mode, primary color, zh-cn/en-us, breadcrumb, sider collapse)

See `docs/framework-design.md` for the full roadmap and design rationale.

## What Not to Do

1. **Don't re-introduce axios in renderer** — the architecture intentionally routes through main process for CORS bypass and unified logging hooks.
2. **Don't store tokens in localStorage** — use `window.api.secureStore`.
3. **Don't expose `ipcRenderer` directly in preload** — always wrap with a typed function via `contextBridge`.
4. **Don't edit `src/preload/index.d.ts` to add new IPC types** — add them in `src/shared/types.ts` instead, then import.
5. **Don't use relative paths for shared modules** — use `@shared/*`, `@renderer/*`, `@main/*` aliases.
6. **Don't add features that duplicate hohu-admin-web** — desktop should only do what web cannot (tray, global shortcuts, secure storage, system integration, overlay windows).
