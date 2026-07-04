# Security Policy

## Supported Versions

This is a **developer scaffold**, not a distributed end-user product. We "support" the latest `main` only — fork developers are responsible for keeping their downstream apps patched.

| Version                | Supported        |
| ---------------------- | ---------------- |
| `main`                 | ✅               |
| tagged releases (`v*`) | ✅ (latest only) |
| anything else          | ❌               |

## Reporting a Vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, choose one of:

1. **GitHub Security Advisories** (preferred) — navigate to [Security → Advisories → New](https://github.com/aihohu/hohu-admin-desktop/security/advisories/new) and file a private report. This lets us coordinate a fix before public disclosure.
2. **Email** — send details to `security@hohu.org` with the subject `hohu-admin-desktop: ...`.

Please include:

- Affected version (commit hash or tag)
- Reproduction steps (minimal if possible)
- Impact assessment (what an attacker could do)
- Suggested fix if you have one

### Response timeline

- **Acknowledgment:** within 72 hours
- **Initial assessment:** within 7 days
- **Fix or mitigation:** target 30 days for high-severity issues, 90 days for low-severity

Once a fix is shipped, we'll credit you in the release notes and CHANGELOG unless you prefer to remain anonymous.

## Security model

See the [Architecture — Security Model](https://hohu.org/guide/desktop/architecture.html) page for the framework's threat model:

- `contextIsolation: true` (default)
- `nodeIntegration: false` (default)
- `sandbox: false` (current — preload can use Node API; planned `true` post-v1)
- All HTTP routed through main process (bypasses browser CORS, centralizes auth header injection)
- Tokens encrypted via `safeStorage` (macOS Keychain / Windows DPAPI / Linux libsecret), never in `localStorage`
- Preload exposes a strict IPC whitelist via `contextBridge`; `ipcRenderer` is never directly exposed

## What's intentionally NOT in scope

- **Per-fork app security** — fork developers add their own CSP, signing certs, etc.
- **Code signing certificates** — not bundled; macOS auto-update requires a Developer ID Application cert that developers must obtain themselves.
- **Backwards-compatible security patches for unsupported versions** — upgrade to the latest.
