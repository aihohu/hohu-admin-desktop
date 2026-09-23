import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const projectRoot = join(import.meta.dirname, '../../../..')

describe('desktop privileged bridge', () => {
  it('does not expose generic secure storage or unrestricted HTTP to renderer', () => {
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    assert.doesNotMatch(preload, /secureStore|secure-store:/)
    assert.doesNotMatch(preload, /window\.api\.http|http:request/)
    assert.doesNotMatch(preload, /store:get|store:set|store:delete/)
    assert.match(preload, /auth:getSessionState/)
    assert.match(preload, /auth:request/)
  })

  it('keeps logout and refresh concurrency inside the main-process session', () => {
    const session = readFileSync(join(projectRoot, 'src/main/services/auth-session.ts'), 'utf8')
    assert.match(session, /url:\s*'\/auth\/logout'/)
    assert.match(session, /sessionRevision/)
    assert.match(session, /refreshRevision/)
  })

  it('routes every registered invoke handler through sender and top-frame validation', () => {
    const ipcDir = join(projectRoot, 'src/main/ipc')
    for (const name of readdirSync(ipcDir)) {
      if (!name.endsWith('.ts') || name === 'security.ts') continue
      const source = readFileSync(join(ipcDir, name), 'utf8')
      assert.doesNotMatch(source, /^\s*ipcMain\.handle/m, `${name} bypasses trustedHandle`)
    }
    const guard = readFileSync(join(ipcDir, 'security.ts'), 'utf8')
    assert.match(guard, /event\.senderFrame !== topFrame/)
    assert.match(guard, /isTrustedRendererUrl\(event\.senderFrame\.url\)/)
  })

  it('blocks navigation and new windows in the BrowserWindow boundary', () => {
    const main = readFileSync(join(projectRoot, 'src/main/index.ts'), 'utf8')
    assert.match(main, /setWindowOpenHandler/)
    assert.match(main, /will-navigate/)
    assert.match(main, /will-attach-webview/)
  })

  it('keeps reload and DevTools out of the production tray menu', () => {
    const tray = readFileSync(join(projectRoot, 'src/main/services/tray.ts'), 'utf8')
    assert.match(tray, /is\.dev\s*\?/)
    assert.match(tray, /label:\s*'DevTools'/)
    assert.match(tray, /label:\s*'Reload'/)
  })
})
