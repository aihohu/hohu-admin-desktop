import { defineStore } from 'pinia'
import { fetchLogin, fetchGetUserInfo } from '../service/api/auth'
import { setTokens, clearTokens, loadTokens } from '../service/token'

interface AuthState {
  userId: string
  userName: string
  userAvatar: string
  roles: string[]
  buttons: string[]
  isLogin: boolean
}

/**
 * 鉴权 Store：
 * - login: 账密登录 + 拉取用户信息 + 初始化路由
 * - initAuth: 启动时从安全存储恢复会话
 * - logout: 清理本地凭证（不调 router.push，由调用方负责跳转）
 *
 * ⚠️ store 不直接 import router，避免循环依赖：route store → router → guard → auth store。
 */
export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    userId: '',
    userName: '',
    userAvatar: '',
    roles: [],
    buttons: [],
    isLogin: false
  }),
  getters: {
    /** 是否有某个按钮权限 */
    hasButton: state => (code: string) => state.buttons.includes(code),
    /** 是否有某个角色 */
    hasRole: state => (code: string) => state.roles.includes(code)
  },
  actions: {
    async login(userName: string, password: string) {
      const { data, error } = await fetchLogin(userName, password)
      if (error || !data) {
        throw new Error(error?.response?.data?.msg || '登录失败')
      }
      await setTokens(data)
      await this.getUserInfo()

      // 登录成功后初始化动态路由
      const { useRouteStore } = await import('./route')
      const routeStore = useRouteStore()
      await routeStore.initAuthRoutes()
    },

    async getUserInfo() {
      const { data, error } = await fetchGetUserInfo()
      if (error || !data) {
        await this.logout()
        throw new Error(error?.response?.data?.msg || '获取用户信息失败')
      }
      this.userId = data.userId
      this.userName = data.userName
      this.userAvatar = data.userAvatar
      this.roles = data.roles
      this.buttons = data.buttons
      this.isLogin = true
    },

    /**
     * 启动时调用：尝试从安全存储恢复 token + 拉取用户信息。
     * 返回 true 表示恢复成功，false 表示需要重新登录。
     */
    async initAuth(): Promise<boolean> {
      const tokens = await loadTokens()
      if (!tokens) return false
      try {
        await this.getUserInfo()
        return true
      } catch {
        await this.logout()
        return false
      }
    },

    async logout() {
      await clearTokens()

      // 清理动态路由（延迟 import 避免循环依赖）
      const { useRouteStore } = await import('./route')
      const routeStore = useRouteStore()
      routeStore.resetRoutes()

      this.$reset()
    }
  }
})
