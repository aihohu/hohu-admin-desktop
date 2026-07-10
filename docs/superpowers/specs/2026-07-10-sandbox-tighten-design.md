# Sandbox 收紧（Phase 2.7）设计

> 日期：2026-07-10
> 范围：把 Electron preload `sandbox: false` 切到 `true`，让框架符合 Electron 安全最佳实践。
> 前置：Phase 1–2.6 全部完成，preload 已审计确认直接 import 100% sandbox-clean。

## 1. 背景

CLAUDE.md pitfall #4 + framework-design.md 都标注「sandbox 收紧是 Phase 2 待办」。当前 `sandbox: false` 是 Phase 1 scaffold 默认值。

## 2. 审计结论

`src/preload/index.ts`（唯一 preload 文件）：

- **25+ 个 IPC 调用** 全部用 `ipcRenderer` from `electron`，sandbox-safe
- **0 Node API 直接使用**（无 `require` / `Buffer` / `process` / `fs` 等）
- `@electron-toolkit/preload` 包**未使用**（这是 sandbox 不兼容的最大坑）
- 唯一直接 import 是 `electron` + type-only `@shared/types`

→ 直接 audit 干净。间接依赖（electron-vite 打包时的 transitive imports）需要 dev + prod 实测验证。

## 3. 改动

### 3.1 代码改动（2 处）

**`src/main/index.ts:45-46`** —— flip sandbox + 更新 preload 路径（CJS 输出）：

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),  // .mjs → .js（CJS）
  sandbox: true   // ← 从 false flip 过来
}
```

**`electron.vite.config.ts`** —— preload build 输出 CJS（sandbox 不支持 ESM import）：

```ts
preload: {
  build: {
    rollupOptions: {
      output: {
        format: 'cjs',
        entryFileNames: '[name].js'
      }
    }
  },
  resolve: { ... }  // 已有 alias 保留
}
```

### 3.2 文档改动（1 处）

`CLAUDE.md` pitfall #24 替换为以下完整内容：

```markdown
24. **macOS 开机自启 + sandbox 关系**（Phase 2.6 设置抽屉 + Phase 2.7 sandbox 收紧）——
    - **Electron `sandbox: true`**：跨平台，限制 preload 不能用 Node API（`require` / `fs` / `process` 等）。当前 preload 100% sandbox-clean，flip 无影响。
    - **macOS App Sandbox**：Apple hardened runtime + entitlements，**只在签名 + 公证的 app 上强制**。Electron 的 `sandbox: true` **不**触发 macOS App Sandbox。
    - 当前未签名 → `app.setLoginItemSettings({ openAtLogin: true })` 仍正常工作；`safeStorage` 加密 token 也正常。
    - 将来签名 + 公证时，需要在 entitlements 文件补：
      - `com.apple.security.keychain`（safeStorage 加密 token）
      - `com.apple.security.login-item`（开机自启）
      - `com.apple.security.network.client`（自动更新，默认包含但显式更安全）
    - Windows / Linux：sandbox 是 Electron 层强制，跨平台一致，无平台特定影响。
```

## 4. 两个 "sandbox" 概念澄清

| 概念                         | 触发方式                        | 影响范围                                  | 平台     |
| ---------------------------- | ------------------------------- | ----------------------------------------- | -------- |
| **Electron `sandbox: true`** | `webPreferences.sandbox` 配置   | 限制 preload 脚本不能用 Node API          | 跨平台   |
| **macOS App Sandbox**        | 签名 + 公证 + entitlements 文件 | 限制整个 app 的文件系统 / 网络 / 设备访问 | 仅 macOS |

**关键事实**：`sandbox: true` **不触发** macOS App Sandbox。两者独立。

当前 app 未签名 → 不存在 macOS App Sandbox 限制 → `sandbox: true` 的唯一影响就是约束 preload（已经 100% 干净）。

## 5. 验收（DoD）

- ✅ `sandbox: true` 已 flip（`src/main/index.ts:46`）
- ✅ `pnpm dev` 跑通：
  - 登录（HTTP 走主进程转发 + secureStorage 读 token）
  - 主页加载、菜单切换
  - 设置抽屉：开机自启 / 关闭行为 / 通知 / 快捷键录制 / 检查更新（dev 占位 URL 进 error 是预期）
- ✅ `pnpm build:unpack` 成功：
  - exit code 0
  - 产物在 `dist/mac-arm64/`（macOS arm64）/ `dist/mac/`（x64）/ `dist/{win,linux}-unpacked/` 生成
  - **手动打开 unpacked app**（macOS：`open dist/mac-arm64/hohu-admin-desktop.app`）→ 验证登录走通
- ✅ `pnpm typecheck && pnpm lint && pnpm fmt && pnpm test` 全绿
- ✅ CLAUDE.md pitfall #24 替换为第 3.2 节内容

**不在 DoD**：tabs 系统（sandbox 不影响纯渲染层）、AI 模块（未做）、自动更新真链路测试（dev 模式 no-op）。

## 6. 不做（YAGNI）

- 不加 entitlements 文件（未签名不强制，参见第 4 节）
- 不动 `electron-builder.yml`
- 不补代码签名（独立 Phase 3+ 任务）
- 不更新 framework-design.md（其 sandbox 描述留 Phase 3 重写框架设计时一并更新；pitfall #24 是开发时即时参考，足够）

## 7. 风险与回滚

**风险**：低-中。

- 直接 audit 干净（第 2 节）
- 间接风险：electron-vite 打包时若有 transitive 依赖在 preload 里隐式用了 Node API，sandbox=true 启动会崩
- 缓解：DoD 第 3 项要求 unpacked build 手动打开验证；崩了立即回滚

**回滚**：`git revert` 单 commit（代码 + 文档一起改的）。
