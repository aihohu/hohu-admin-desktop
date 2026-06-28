import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { router } from './router'
import { permission } from './directives/permission'
import { loadTokens } from './service/token'

async function bootstrap(): Promise<void> {
  const app = createApp(App)
  app.use(createPinia())
  app.use(naive)

  // ⚠️ 在 app.use(router) 之前预热 token，避免守卫首次导航的 IPC 延迟
  await loadTokens()

  app.use(router)
  app.directive('permission', permission)
  await router.isReady()
  app.mount('#app')
}

void bootstrap()
