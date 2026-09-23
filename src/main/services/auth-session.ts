import { is } from '@electron-toolkit/utils'
import type { AuthLoginInput, AuthLoginResult, AuthSessionState, HttpConfig, HttpResponse } from '@shared/types'
import { httpRequest } from './http'
import { secureDelete, secureGet, secureSet } from './secure-store'
import { normalizeBackendOrigin, normalizeBackendRequest } from './security-policy'

const ACCESS_TOKEN_KEY = 'auth.token'
const REFRESH_TOKEN_KEY = 'auth.refreshToken'
const PRODUCTION_BACKEND_ORIGIN = 'https://api.hohu.org'
const DEVELOPMENT_BACKEND_ORIGIN = 'http://127.0.0.1:8000'
const SUCCESS_CODE = '200'
const LOGOUT_CODES = new Set(['401'])
const EXPIRED_TOKEN_CODES = new Set(['9999', '9998', '3333'])

interface BackendEnvelope<T = unknown> {
  code?: string | number
  msg?: string
  data?: T
}

interface TokenPair {
  token: string
  refreshToken: string
}

class AuthSession {
  private readonly origin: string
  private refreshPromise: Promise<boolean> | null = null
  private refreshRevision: number | null = null
  private sessionRevision = 0

  constructor() {
    const configured =
      import.meta.env.MAIN_VITE_BACKEND_ORIGIN || (is.dev ? DEVELOPMENT_BACKEND_ORIGIN : PRODUCTION_BACKEND_ORIGIN)
    this.origin = normalizeBackendOrigin(configured, is.dev)
  }

  async login(input: AuthLoginInput): Promise<AuthLoginResult> {
    validateLoginInput(input)
    const revision = ++this.sessionRevision
    const response = await this.internalRequest<BackendEnvelope<TokenPair>>({
      url: '/auth/login',
      method: 'POST',
      data: {
        userName: input.userName,
        password: input.password,
        ...(input.tenantCode?.trim() ? { tenantCode: input.tenantCode.trim().toLowerCase() } : {})
      }
    })
    const envelope = response.data
    if (revision !== this.sessionRevision) {
      return { success: false, message: '登录请求已被替代' }
    }
    if (String(envelope?.code ?? '') !== SUCCESS_CODE || !isTokenPair(envelope.data)) {
      this.invalidateSession(revision)
      return { success: false, message: envelope?.msg || '登录失败' }
    }
    this.storeTokenPair(envelope.data)
    return { success: true, message: envelope.msg || 'OK' }
  }

  async logout(): Promise<void> {
    const accessToken = secureGet(ACCESS_TOKEN_KEY)
    const refreshToken = secureGet(REFRESH_TOKEN_KEY)
    this.invalidateSession()
    if (!accessToken) return
    try {
      await this.internalRequest({
        url: '/auth/logout',
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        data: refreshToken ? { refreshToken } : undefined,
        timeout: 5000
      })
    } catch {
      // Local credentials are already gone; remote revocation is best effort.
    }
  }

  getSessionState(): AuthSessionState {
    return { authenticated: Boolean(secureGet(ACCESS_TOKEN_KEY) && secureGet(REFRESH_TOKEN_KEY)) }
  }

  async request<T = unknown>(input: HttpConfig): Promise<HttpResponse<T>> {
    const revision = this.sessionRevision
    const config = normalizeBackendRequest(this.origin, input)
    const response = await this.authenticatedRequest<T>(config)
    if (isExpiredResponse(response)) {
      const refreshed = await this.refresh(revision)
      if (refreshed && revision === this.sessionRevision) {
        return sanitizeResponse(await this.authenticatedRequest<T>(config))
      }
      this.invalidateSession(revision)
    } else if (isLogoutResponse(response) && revision === this.sessionRevision) {
      this.invalidateSession(revision)
    }
    return sanitizeResponse(response)
  }

  private async authenticatedRequest<T>(config: HttpConfig): Promise<HttpResponse<T>> {
    const token = secureGet(ACCESS_TOKEN_KEY)
    const headers = { ...(config.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    return httpRequest<T>({ ...config, headers })
  }

  private async refresh(revision: number): Promise<boolean> {
    if (revision !== this.sessionRevision) return false
    if (!this.refreshPromise || this.refreshRevision !== revision) {
      const pending = this.performRefresh(revision).finally(() => {
        if (this.refreshPromise === pending) {
          this.refreshPromise = null
          this.refreshRevision = null
        }
      })
      this.refreshPromise = pending
      this.refreshRevision = revision
    }
    return this.refreshPromise
  }

  private async performRefresh(revision: number): Promise<boolean> {
    const refreshToken = secureGet(REFRESH_TOKEN_KEY)
    if (!refreshToken) return false
    try {
      const response = await this.internalRequest<BackendEnvelope<TokenPair>>({
        url: '/auth/refreshToken',
        method: 'POST',
        data: { refreshToken }
      })
      const envelope = response.data
      if (String(envelope?.code ?? '') !== SUCCESS_CODE || !isTokenPair(envelope.data)) return false
      if (revision !== this.sessionRevision || secureGet(REFRESH_TOKEN_KEY) !== refreshToken) return false
      this.storeTokenPair(envelope.data)
      return true
    } catch {
      return false
    }
  }

  private internalRequest<T>(config: HttpConfig): Promise<HttpResponse<T>> {
    return httpRequest<T>({ ...config, url: new URL(config.url, `${this.origin}/`).toString() })
  }

  private invalidateSession(expectedRevision?: number): void {
    if (expectedRevision !== undefined && expectedRevision !== this.sessionRevision) return
    this.sessionRevision += 1
    this.refreshPromise = null
    this.refreshRevision = null
    secureDelete(ACCESS_TOKEN_KEY)
    secureDelete(REFRESH_TOKEN_KEY)
  }

  private storeTokenPair(pair: TokenPair): void {
    try {
      secureSet(ACCESS_TOKEN_KEY, pair.token)
      secureSet(REFRESH_TOKEN_KEY, pair.refreshToken)
    } catch (error) {
      secureDelete(ACCESS_TOKEN_KEY)
      secureDelete(REFRESH_TOKEN_KEY)
      throw error
    }
  }
}

function validateLoginInput(input: AuthLoginInput): void {
  if (!input || typeof input !== 'object') throw new Error('[auth] invalid login input')
  if (typeof input.userName !== 'string' || input.userName.length < 1 || input.userName.length > 128) {
    throw new Error('[auth] invalid user name')
  }
  if (typeof input.password !== 'string' || input.password.length < 1 || input.password.length > 1024) {
    throw new Error('[auth] invalid password')
  }
  if (input.tenantCode !== undefined && (typeof input.tenantCode !== 'string' || input.tenantCode.length > 128)) {
    throw new Error('[auth] invalid tenant code')
  }
}

function isTokenPair(value: unknown): value is TokenPair {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<TokenPair>
  return (
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    candidate.token.length <= 16_384 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    candidate.refreshToken.length <= 16_384
  )
}

function isExpiredResponse(response: HttpResponse<unknown>): boolean {
  const code = String((response.data as BackendEnvelope | undefined)?.code ?? '')
  return response.status === 401 || EXPIRED_TOKEN_CODES.has(code)
}

function isLogoutResponse(response: HttpResponse<unknown>): boolean {
  const code = String((response.data as BackendEnvelope | undefined)?.code ?? '')
  return LOGOUT_CODES.has(code)
}

function sanitizeResponse<T>(response: HttpResponse<T>): HttpResponse<T> {
  const headers: Record<string, string> = {}
  for (const name of ['content-type', 'content-length', 'x-request-id']) {
    const value = response.headers[name]
    if (value) headers[name] = value
  }
  return { ...response, headers }
}

export const authSession = new AuthSession()
