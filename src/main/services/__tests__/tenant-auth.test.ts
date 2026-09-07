import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildLoginPayload, shouldShowTenantCodeInput } from '../../../shared/tenant-auth'

test('single mode preserves the existing login payload and form', () => {
  assert.equal(shouldShowTenantCodeInput(undefined, undefined), false)
  assert.deepEqual(buildLoginPayload('alice', 'secret'), {
    userName: 'alice',
    password: 'secret'
  })
})

test('hosted code locator is explicit while host locator remains hidden', () => {
  assert.equal(shouldShowTenantCodeInput('hosted', 'code'), true)
  assert.equal(shouldShowTenantCodeInput('hosted', 'host'), false)
  assert.deepEqual(buildLoginPayload('alice', 'secret', ' tenant-b '), {
    userName: 'alice',
    password: 'secret',
    tenantCode: 'tenant-b'
  })
})
