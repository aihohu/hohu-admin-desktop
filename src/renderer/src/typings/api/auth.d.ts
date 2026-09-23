declare namespace Api {
  namespace Auth {
    /** 登录请求 */
    interface LoginParams {
      userName: string
      password: string
      tenantCode?: string
    }

    /** 当前登录用户信息 */
    interface UserInfo {
      userId: string
      userName: string
      userAvatar: string
      roles: string[]
      buttons: string[]
    }
  }
}
