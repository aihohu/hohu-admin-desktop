/**
 * Token 管理：通过主进程 secureStore（OS Keychain）持久化，渲染进程内存缓存。
 * 替代 web 端的 localStorage 方案，更安全（XSS 拿不到明文 token）。
 */

const KEY_TOKEN = 'auth:token'
const KEY_REFRESH = 'auth:refreshToken'

interface TokenPair {
  token: string
  refreshToken: string
}

let cache: TokenPair | null = null

export async function loadTokens(): Promise<TokenPair | null> {
  const [token, refreshToken] = await Promise.all([
    window.api.secureStore.get(KEY_TOKEN),
    window.api.secureStore.get(KEY_REFRESH)
  ])
  cache = token && refreshToken ? { token, refreshToken } : null
  return cache
}

export async function getTokens(): Promise<TokenPair | null> {
  if (cache) return cache
  return loadTokens()
}

export async function setTokens(pair: TokenPair): Promise<void> {
  await Promise.all([
    window.api.secureStore.set(KEY_TOKEN, pair.token),
    window.api.secureStore.set(KEY_REFRESH, pair.refreshToken)
  ])
  cache = pair
}

export async function clearTokens(): Promise<void> {
  await Promise.all([window.api.secureStore.delete(KEY_TOKEN), window.api.secureStore.delete(KEY_REFRESH)])
  cache = null
}

export async function getAuthorization(): Promise<string | null> {
  const tokens = await getTokens()
  return tokens?.token ? `Bearer ${tokens.token}` : null
}
