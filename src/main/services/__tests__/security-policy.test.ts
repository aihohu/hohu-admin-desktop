import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeBackendOrigin,
  normalizeBackendRequest,
  normalizeExternalUrl,
  normalizeRendererLogEntry,
  normalizeRendererNotification,
  normalizeShortcutUpdate,
  normalizeUpdaterVersion,
  requireBoolean,
  requireEnum
} from '../security-policy'

describe('desktop privilege boundary policy', () => {
  it('accepts one HTTPS production origin and rejects alternate or path-bearing origins', () => {
    assert.equal(normalizeBackendOrigin('https://api.hohu.org', false), 'https://api.hohu.org')
    assert.throws(() => normalizeBackendOrigin('http://api.hohu.org', false))
    assert.throws(() => normalizeBackendOrigin('https://api.hohu.org/v1', false))
    assert.throws(() => normalizeBackendOrigin('https://user:pass@api.hohu.org', false))
  })

  it('allows explicit loopback HTTP only in development', () => {
    assert.equal(normalizeBackendOrigin('http://127.0.0.1:8000', true), 'http://127.0.0.1:8000')
    assert.equal(normalizeBackendOrigin('http://localhost:8000', true), 'http://localhost:8000')
    assert.throws(() => normalizeBackendOrigin('http://192.168.1.10:8000', true))
    assert.throws(() => normalizeBackendOrigin('http://127.0.0.1:8000', false))
  })

  it('turns renderer paths into same-origin requests and blocks credential-bearing surfaces', () => {
    const config = normalizeBackendRequest('https://api.hohu.org', {
      url: '/users?page=1',
      method: 'get',
      headers: { Accept: 'application/json', 'X-Request-Id': 'request-1' },
      timeout: 10_000
    })

    assert.equal(config.url, 'https://api.hohu.org/users?page=1')
    assert.equal(config.method, 'GET')
    assert.deepEqual(config.headers, { Accept: 'application/json', 'X-Request-Id': 'request-1' })
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', { url: 'https://evil.example/x', method: 'get' })
    )
    assert.throws(() => normalizeBackendRequest('https://api.hohu.org', { url: '//evil.example/x', method: 'get' }))
    assert.throws(() => normalizeBackendRequest('https://api.hohu.org', { url: '/x', method: 'TRACE' }))
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/x',
        method: 'get',
        headers: { Authorization: 'Bearer renderer-controlled' }
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/auth/refreshToken',
        method: 'post'
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/auth/token',
        method: 'post'
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/platform/auth/login',
        method: 'post'
      })
    )
    assert.equal(
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/auth/getUserInfo',
        method: 'get'
      }).url,
      'https://api.hohu.org/auth/getUserInfo'
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/auth/%6cogin',
        method: 'post'
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/auth/%2572efreshToken',
        method: 'post'
      })
    )
  })

  it('bounds request payloads and timeouts', () => {
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/x',
        method: 'post',
        data: 'x'.repeat(1_048_577)
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/x',
        method: 'get',
        timeout: 60_001
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/x',
        method: 'get',
        responseType: 'document' as never
      })
    )
    assert.throws(() =>
      normalizeBackendRequest('https://api.hohu.org', {
        url: '/x',
        method: 'get',
        params: 'not-an-object' as never
      })
    )
  })

  it('opens only credential-free HTTPS external URLs', () => {
    assert.equal(normalizeExternalUrl('https://example.com/docs'), 'https://example.com/docs')
    assert.throws(() => normalizeExternalUrl('http://example.com'))
    assert.throws(() => normalizeExternalUrl('mailto:admin@example.com'))
    assert.throws(() => normalizeExternalUrl('https://user:pass@example.com'))
  })

  it('validates primitive privileged IPC arguments without coercion', () => {
    assert.equal(requireBoolean(true, 'enabled'), true)
    assert.throws(() => requireBoolean(1, 'enabled'))
    assert.equal(requireEnum('dark', ['system', 'dark', 'light'] as const, 'theme'), 'dark')
    assert.throws(() => requireEnum('sepia', ['system', 'dark', 'light'] as const, 'theme'))
  })

  it('bounds renderer-controlled logs, notifications, shortcuts, and updater versions', () => {
    assert.deepEqual(normalizeRendererLogEntry('warn', { msg: 'hello', meta: { source: 'ui' } }), {
      level: 'warn',
      msg: 'hello',
      meta: { source: 'ui' }
    })
    assert.throws(() => normalizeRendererLogEntry('info', { msg: 'hello' }))
    assert.throws(() => normalizeRendererLogEntry('warn', { msg: 'x'.repeat(4097) }))

    assert.deepEqual(normalizeRendererNotification({ title: 'Done', body: 'Export completed', category: 'general' }), {
      source: 'renderer',
      title: 'Done',
      body: 'Export completed',
      category: 'general'
    })
    assert.throws(() =>
      normalizeRendererNotification({ title: 'Fake update', body: 'Click', source: 'system' } as never)
    )
    assert.throws(() =>
      normalizeRendererNotification({ title: 'Action', body: 'Click', actionId: 'updater:install' } as never)
    )

    assert.deepEqual(normalizeShortcutUpdate('toggleWindow', 'CommandOrControl+Shift+H'), {
      action: 'toggleWindow',
      accelerator: 'CommandOrControl+Shift+H'
    })
    assert.throws(() => normalizeShortcutUpdate('openShell', 'CommandOrControl+X'))
    assert.throws(() => normalizeShortcutUpdate('toggleWindow', 'CommandOrControl+X\n'))

    assert.equal(normalizeUpdaterVersion('1.2.3-beta.1'), '1.2.3-beta.1')
    assert.throws(() => normalizeUpdaterVersion('../../release'))
  })
})
