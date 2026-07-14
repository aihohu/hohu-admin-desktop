/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly RENDERER_VITE_SERVICE_BASE_URL: string
  readonly RENDERER_VITE_SERVICE_SUCCESS_CODE: string
  readonly RENDERER_VITE_SERVICE_LOGOUT_CODES: string
  readonly RENDERER_VITE_SERVICE_EXPIRED_TOKEN_CODES: string
  readonly RENDERER_VITE_STORAGE_PREFIX: string
  /** 路由模式：dynamic（默认）| static */
  readonly RENDERER_VITE_ROUTE_MODE?: 'dynamic' | 'static'
  /** 是否需要登录：默认 true；false = 游客模式（跳过登录直接进 home） */
  readonly RENDERER_VITE_AUTH_REQUIRED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
