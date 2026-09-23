import type { HttpConfig, NotifyPayload } from '@shared/types'

export const MAX_REQUEST_BODY_BYTES = 1024 * 1024
export const MAX_RESPONSE_BODY_BYTES = 10 * 1024 * 1024
export const MAX_REQUEST_TIMEOUT_MS = 60_000

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const ALLOWED_RESPONSE_TYPES = new Set(['json', 'text', 'blob', 'arraybuffer'])
const ALLOWED_HEADERS = new Map([
  ['accept', 'Accept'],
  ['content-type', 'Content-Type'],
  ['last-event-id', 'Last-Event-ID'],
  ['x-request-id', 'X-Request-Id']
])
const RENDERER_AUTH_PATHS = new Set(['/auth/getuserinfo', '/auth/getuserroutes'])
const RENDERER_LOG_LEVELS = ['error', 'warn'] as const
const NOTIFICATION_CATEGORIES = ['updater', 'ai', 'download', 'alert', 'general'] as const
const SHORTCUT_ACTIONS = ['toggleWindow'] as const
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function normalizeBackendOrigin(raw: string, isDevelopment: boolean): string {
  const parsed = new URL(raw)
  const isLoopbackHttp =
    isDevelopment && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)

  if (parsed.protocol !== 'https:' && !isLoopbackHttp) {
    throw new Error('[security] backend origin must use HTTPS (loopback HTTP is development-only)')
  }
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('[security] backend origin must not include credentials, a path, query, or fragment')
  }
  return parsed.origin
}

export function normalizeBackendRequest(origin: string, input: HttpConfig): HttpConfig {
  if (!isRecord(input)) throw new Error('[security] invalid backend request')
  if (
    typeof input.url !== 'string' ||
    input.url.length > 8192 ||
    !input.url.startsWith('/') ||
    input.url.startsWith('//')
  ) {
    throw new Error('[security] backend requests must use an absolute path')
  }
  if (input.url.includes('\\') || /%2f|%5c/i.test(input.url)) {
    throw new Error('[security] encoded or backslash path separators are not allowed')
  }

  const parsed = new URL(input.url, `${origin}/`)
  if (parsed.origin !== origin || parsed.username || parsed.password || parsed.hash) {
    throw new Error('[security] backend request escaped the configured origin')
  }
  if (/%[0-9a-f]{2}/i.test(parsed.pathname)) {
    throw new Error('[security] percent-encoded backend paths are not allowed')
  }
  const normalizedPath = parsed.pathname.toLowerCase()
  if (
    ((normalizedPath === '/auth' || normalizedPath.startsWith('/auth/')) && !RENDERER_AUTH_PATHS.has(normalizedPath)) ||
    normalizedPath === '/platform/auth' ||
    normalizedPath.startsWith('/platform/auth/')
  ) {
    throw new Error('[security] authentication endpoints are main-process only')
  }

  if (input.method !== undefined && typeof input.method !== 'string') {
    throw new Error('[security] invalid HTTP method')
  }
  const method = (input.method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) throw new Error(`[security] HTTP method is not allowed: ${method}`)

  if (input.headers !== undefined && !isRecord(input.headers)) {
    throw new Error('[security] request headers must be an object')
  }
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(input.headers || {})) {
    const normalizedName = ALLOWED_HEADERS.get(name.toLowerCase())
    if (!normalizedName || typeof value !== 'string' || value.length > 4096) {
      throw new Error(`[security] renderer-controlled header is not allowed: ${name}`)
    }
    headers[normalizedName] = value
  }

  const timeout = input.timeout ?? MAX_REQUEST_TIMEOUT_MS
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_REQUEST_TIMEOUT_MS) {
    throw new Error('[security] request timeout is outside the allowed range')
  }
  if (input.responseType !== undefined && !ALLOWED_RESPONSE_TYPES.has(input.responseType)) {
    throw new Error('[security] response type is not allowed')
  }
  if (input.params !== undefined && !isRecord(input.params)) {
    throw new Error('[security] request parameters must be an object')
  }

  assertSerializedSize(input.data, MAX_REQUEST_BODY_BYTES, 'request body')
  assertSerializedSize(input.params, MAX_REQUEST_BODY_BYTES, 'request parameters')

  return {
    url: parsed.toString(),
    method,
    data: input.data,
    params: input.params,
    headers,
    responseType: input.responseType,
    timeout
  }
}

export function normalizeExternalUrl(raw: string): string {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('[security] invalid external URL')
  const parsed = new URL(raw)
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('[security] only credential-free HTTPS external URLs are allowed')
  }
  return parsed.toString()
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`[security] ${label} must be a boolean`)
  return value
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`[security] ${label} is not allowed`)
  }
  return value as T
}

export function normalizeRendererLogEntry(
  level: unknown,
  payload: unknown
): { level: (typeof RENDERER_LOG_LEVELS)[number]; msg: string; meta?: unknown } {
  const normalizedLevel = requireEnum(level, RENDERER_LOG_LEVELS, 'log level')
  const record = requireRecord(payload, 'log payload')
  assertOnlyKeys(record, ['msg', 'meta'], 'log payload')
  const msg = requireBoundedString(record['msg'], 'log message', 4096)
  assertSerializedSize(record['meta'], 64 * 1024, 'log metadata')
  return { level: normalizedLevel, msg, ...(record['meta'] === undefined ? {} : { meta: record['meta'] }) }
}

export function normalizeRendererNotification(payload: unknown): NotifyPayload {
  const record = requireRecord(payload, 'notification payload')
  assertOnlyKeys(record, ['title', 'body', 'category'], 'notification payload')
  const title = requireBoundedString(record['title'], 'notification title', 256)
  const body = requireBoundedString(record['body'], 'notification body', 4096, true)
  const category =
    record['category'] === undefined
      ? undefined
      : requireEnum(record['category'], NOTIFICATION_CATEGORIES, 'notification category')
  return {
    source: 'renderer',
    title,
    body,
    ...(category === undefined ? {} : { category })
  }
}

export function normalizeShortcutUpdate(
  action: unknown,
  accelerator: unknown
): { action: string; accelerator: string } {
  const normalizedAction = requireEnum(action, SHORTCUT_ACTIONS, 'shortcut action')
  const normalizedAccelerator = requireBoundedString(accelerator, 'shortcut accelerator', 128)
  if ([...normalizedAccelerator].some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)) {
    throw new Error('[security] shortcut accelerator contains control characters')
  }
  return { action: normalizedAction, accelerator: normalizedAccelerator }
}

export function normalizeUpdaterVersion(value: unknown): string {
  const version = requireBoundedString(value, 'updater version', 128)
  if (!SEMVER_PATTERN.test(version)) throw new Error('[security] updater version must be valid semver')
  return version
}

function requireBoundedString(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > maxLength) {
    throw new Error(`[security] ${label} is invalid`)
  }
  return value
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`[security] ${label} must be an object`)
  return value
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed)
  if (Object.keys(record).some(key => !allowedKeys.has(key))) {
    throw new Error(`[security] ${label} contains unsupported fields`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertSerializedSize(value: unknown, limit: number, label: string): void {
  if (value === undefined || value === null) return
  let serialized: string
  try {
    serialized = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    throw new Error(`[security] ${label} must be JSON-serializable`)
  }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > limit) {
    throw new Error(`[security] ${label} exceeds ${limit} bytes`)
  }
}
