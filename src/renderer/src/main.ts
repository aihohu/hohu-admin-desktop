import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { router } from './router'
import { permission } from './directives/permission'
import { loadTokens } from './service/token'
import { i18n } from './locales'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())
  app.use(naive)
  app.use(i18n)

  // ⚠️ 在 app.use(router) 之前预热 token，避免守卫首次导航的 IPC 延迟
  await loadTokens()

  app.use(router)
  app.directive('permission', permission)

  // 渲染层未捕获错误 → IPC → 主进程日志文件。
  // 常规 console.* 不进文件；只有这三种来源会触发：
  //   - window 'error'：脚本运行时错误
  //   - window 'unhandledrejection'：未 await 的 Promise 异常
  //   - Vue errorHandler：组件内抛错
  // bootstrap 只在 app.mount() 之前执行一次，HMR 不重跑本文件，因此不会重复注册。
  window.addEventListener('error', event => {
    window.api.logger.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    })
  })

  window.addEventListener('unhandledrejection', event => {
    window.api.logger.error('Unhandled rejection', {
      reason: String(event.reason),
      stack: event.reason instanceof Error ? event.reason.stack : undefined
    })
  })

  app.config.errorHandler = (err, _instance, info) => {
    window.api.logger.error('Vue error', {
      info,
      stack: err instanceof Error ? err.stack : String(err)
    })
  }

  await router.isReady()
  app.mount('#app')
}

void bootstrap()
