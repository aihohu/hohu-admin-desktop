import type { AuthLoginInput, AuthLoginResult, AuthSessionState, HttpConfig, HttpResponse } from '@shared/types'
import { authSession } from '../services/auth-session'
import { trustedHandle } from './security'

export function registerAuthIpc(): void {
  trustedHandle('auth:login', (_event, input: AuthLoginInput): Promise<AuthLoginResult> => authSession.login(input))
  trustedHandle('auth:logout', (): Promise<void> => authSession.logout())
  trustedHandle('auth:getSessionState', (): AuthSessionState => authSession.getSessionState())
  trustedHandle('auth:request', (_event, config: HttpConfig): Promise<HttpResponse> => authSession.request(config))
}
