declare namespace Api {
  namespace Auth {
    /** 登录返回的 token 对 */
    interface LoginToken {
      token: string
      refreshToken: string
    }

    /** 登录请求 */
    interface LoginParams {
      userName: string
      password: string
    }

    /** 刷新 token 请求 */
    interface RefreshTokenParams {
      refreshToken: string
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
