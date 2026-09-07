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
 * - initGuest: AUTH_REQUIRED=false 时跳过登录，注入游客身份
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
    /**
     * 游客模式：AUTH_REQUIRED=false 时跳过登录。
     * 注入 R_ADMIN 角色 + 通配 buttons，让 v-permission / 路由 guard 都正常放行。
     * 不存 token —— 真实后端 API 调用会 401，但本地功能（tabs/设置/主题）不受影响。
     */
    initGuest(): void {
      this.userId = 'guest'
      this.userName = 'Guest'
      this.userAvatar = ''
      this.roles = ['R_ADMIN']
      this.buttons = ['*']
      this.isLogin = true
    },

    async login(userName: string, password: string, tenantCode?: string) {
      const { data, error } = await fetchLogin(userName, password, tenantCode)
      if (error || !data) {
        throw new Error(error?.response?.data?.msg || '登录失败')
      }
      await setTokens(data)
      await this.getUserInfo()

      // 登录成功后初始化动态路由
      const { useRouteStore } = await import('./route')
      const routeStore = useRouteStore()
      await routeStore.initAuthRoutes()

      // 初始化首页 tab
      const { useTabStore } = await import('./tab')
      useTabStore().initHome()
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
     * AUTH_REQUIRED=false 时直接走游客模式，不读 token。
     */
    async initAuth(): Promise<boolean> {
      if (import.meta.env.RENDERER_VITE_AUTH_REQUIRED === 'false') {
        this.initGuest()
        return true
      }
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

      // 清空 tab
      const { useTabStore } = await import('./tab')
      useTabStore().reset()

      this.$reset()
    }
  }
})
