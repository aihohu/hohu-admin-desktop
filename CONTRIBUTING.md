# Contributing to hohu-admin-desktop

Thanks for considering a contribution! This project is a **developer scaffold**, so most contributions fall into one of:

- 🐛 **Bug fixes** — something behaves differently from what `CLAUDE.md` / specs describe
- ✨ **Framework features** — new IPC channels, new manager singletons, new platform integration
- 📚 **Docs** — typo fixes, clearer pitfalls, new examples
- 🧪 **Tests** — pure-function unit tests under `src/main/services/__tests__/`

> If you're adding a feature that duplicates [hohu-admin-web](https://github.com/aihohu/hohu-admin-web) (dashboards, CRUD tables, etc.), it probably doesn't belong here. Desktop should only do what web cannot (tray, shortcuts, secure storage, system integration).

## Setup

Requirements:

- Node.js ≥ 20.19
- pnpm ≥ 10.5

```bash
git clone https://github.com/aihohu/hohu-admin-desktop.git
cd hohu-admin-desktop
pnpm install
pnpm dev
```

The renderer boots on `http://localhost:5173`; the Electron window opens automatically.

## Workflow

1. **Fork & branch** — `feature/*` for new features, `fix/*` for bugs, `docs/*` for documentation
2. **Make changes** — follow existing patterns (see `CLAUDE.md` for the full convention list)
3. **Run quality gates locally** (these run on pre-commit and CI):

   ```bash
   pnpm typecheck   # tsc + vue-tsc
   pnpm lint        # ESLint
   pnpm test        # node:test + tsx
   pnpm fmt         # Prettier check (must pass — CI gate)
   ```

   If `pnpm fmt` fails, run `pnpm format` to auto-fix.

4. **Commit with Conventional Commits** — `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`
5. **Open a PR against `main`** — CI runs typecheck + lint + fmt + test on PR

### Pre-commit hook

`simple-git-hooks` installs a pre-commit hook that runs:

```
pnpm typecheck && pnpm lint && pnpm fmt && git diff --exit-code
```

And a commit-msg hook that validates Conventional Commits format. To skip for WIP: `git commit --no-verify` (use sparingly).

## Conventions

### Code style

- TypeScript strict mode, no `any` in cross-process contracts
- `<script setup lang="ts">` for all new Vue components
- Use path aliases (`@shared/*`, `@renderer/*`, `@main/*`, `@resources/*`) instead of deep relative imports

### Adding an IPC channel

The fixed workflow is documented in [`CLAUDE.md`](./CLAUDE.md) and the [docs site](https://hohu.org/guide/desktop/quick-start.html). TL;DR:

1. Define the type in `src/shared/types.ts` and extend `AppApi`
2. Register with `ipcMain.handle` in `src/main/ipc/<name>.ts`
3. Register once in `src/main/ipc/index.ts`'s `registerAllIpc()`
4. Add a typed bridge object to `src/preload/index.ts`

Never expose `ipcRenderer` directly — always wrap with a typed function via `contextBridge`.

### Adding an API endpoint

1. Define types in `src/renderer/src/typings/api/<module>.d.ts` using `declare namespace Api.Module`
2. Create wrapper in `src/renderer/src/service/api/<module>.ts`
3. Call from store or component: `const { data, error } = await fetchXxx(...)`

### Tests

Pure-function unit tests live in `src/main/services/__tests__/`. Use `node --test --import tsx`. Run via:

```bash
pnpm test
```

Avoid testing Electron-runtime-dependent code directly — extract pure helpers (see `updater-utils.ts` as a pattern).

## Common pitfalls

`CLAUDE.md` has a 19-item pitfalls list covering CORS, token storage, ESM/CJS interop, native theme sync, and more. **Read it before contributing** — most rejected PRs touch something documented there.

## Reporting issues

Use the GitHub issue templates (bug report EN/CN, feature request EN/CN). Include:

- OS + version
- Node + pnpm version
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (renderer DevTools console + main process terminal)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
