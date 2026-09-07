export type TenantMode = 'single' | 'hosted'
export type TenantLocator = 'code' | 'host'

export interface TenantLoginPayload {
  userName: string
  password: string
  tenantCode?: string
}

export function shouldShowTenantCodeInput(mode?: TenantMode, locator?: TenantLocator): boolean {
  return mode === 'hosted' && locator !== 'host'
}

export function buildLoginPayload(userName: string, password: string, tenantCode?: string): TenantLoginPayload {
  const normalizedTenantCode = tenantCode?.trim().toLowerCase()

  return {
    userName,
    password,
    ...(normalizedTenantCode ? { tenantCode: normalizedTenantCode } : {})
  }
}
