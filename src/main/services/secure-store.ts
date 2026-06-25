import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

/**
 * 基于 Electron safeStorage 的安全字符串存储。
 * - 加密由操作系统密钥链提供（macOS Keychain / Windows DPAPI / Linux libsecret）
 * - 加密后的密文落盘到 userData/secure-store.json
 *
 * 用于存储 JWT token、refreshToken 等敏感凭证，替代浏览器 localStorage。
 */

const STORE_FILE = join(app.getPath('userData'), 'secure-store.json')

type StoreMap = Record<string, string> // base64 密文 → 解密后是明文

let cache: StoreMap = {}

function loadFromDisk(): StoreMap {
  try {
    if (!existsSync(STORE_FILE)) return {}
    const raw = readFileSync(STORE_FILE, 'utf-8')
    return JSON.parse(raw) as StoreMap
  } catch {
    return {}
  }
}

function flushToDisk(): void {
  try {
    const dir = join(STORE_FILE, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(STORE_FILE, JSON.stringify(cache, null, 2), { mode: 0o600 })
  } catch (err) {
    console.error('[secure-store] flush failed:', err)
  }
}

/** 初始化：必须在 app.whenReady() 之后调用 */
export function initSecureStore(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[secure-store] encryption not available on this platform')
  }
  cache = loadFromDisk()
}

function encrypt(plain: string): string {
  return safeStorage.encryptString(plain).toString('base64')
}

function decrypt(b64: string): string {
  return safeStorage.decryptString(Buffer.from(b64, 'base64'))
}

export function secureGet(key: string): string | null {
  const b64 = cache[key]
  if (!b64) return null
  try {
    return decrypt(b64)
  } catch {
    return null
  }
}

export function secureSet(key: string, value: string): void {
  cache[key] = encrypt(value)
  flushToDisk()
}

export function secureDelete(key: string): void {
  if (key in cache) {
    delete cache[key]
    flushToDisk()
  }
}

export function secureClear(): void {
  cache = {}
  flushToDisk()
}
