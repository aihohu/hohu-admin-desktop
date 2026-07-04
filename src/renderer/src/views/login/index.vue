<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../../store/auth'
import { useRouteStore } from '../../store/route'
import { useThemeStore } from '../../store/theme'
import logoUrl from '@resources/icon.png'

defineOptions({ name: 'LoginPage' })

const router = useRouter()
const message = useMessage()
const { t } = useI18n()
const authStore = useAuthStore()
const routeStore = useRouteStore()
const themeStore = useThemeStore()

const form = ref({
  userName: '',
  password: ''
})
const loading = ref(false)

// 品牌区背景：主色 + 白/黑混合
// - 亮色模式：主色 + 30% 白 → 柔化但不失品牌感
// - 暗黑模式：主色 + 40% 黑 → 加深保证白字可读
const brandBg = computed(() => {
  const mix = themeStore.darkMode ? 'black 40%' : 'white 30%'
  return `color-mix(in srgb, ${themeStore.primaryColorHex}, ${mix})`
})

function fillDemo(): void {
  form.value.userName = 'admin'
  form.value.password = '123456'
}

async function handleSubmit(): Promise<void> {
  if (!form.value.userName || !form.value.password) {
    message.warning(t('page.login.invalidCredentials'))
    return
  }
  loading.value = true
  try {
    await authStore.login(form.value.userName, form.value.password)
    message.success(`${t('common.welcome')}，${authStore.userName}`)
    router.push({ name: routeStore.home || 'home' })
  } catch (err) {
    message.error(err instanceof Error ? err.message : t('page.login.loginFailed'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-shell" :class="{ 'is-dark': themeStore.darkMode }">
    <aside class="brand-panel" :style="{ background: brandBg }">
      <div class="brand-inner">
        <img :src="logoUrl" alt="logo" class="brand-logo" />
        <h1 class="brand-name">{{ t('page.login.brandName') }}</h1>
        <p class="brand-slogan">{{ t('page.login.slogan') }}</p>
      </div>
      <!-- TODO: release 前同步 package.json version -->
      <div class="brand-version">v0.1.0</div>
    </aside>

    <main class="form-panel">
      <div class="form-wrap">
        <h2 class="form-title">{{ t('page.login.title') }}</h2>

        <n-form @keyup.enter="handleSubmit">
          <n-form-item :label="t('page.login.userName')">
            <n-input v-model:value="form.userName" :placeholder="t('page.login.userNamePlaceholder')" clearable />
          </n-form-item>
          <n-form-item :label="t('page.login.password')">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              :placeholder="t('page.login.passwordPlaceholder')"
              clearable
            />
          </n-form-item>
          <n-button type="primary" block size="large" :loading="loading" @click="handleSubmit">
            {{ t('common.login') }}
          </n-button>
        </n-form>

        <div class="form-actions">
          <n-tooltip placement="top">
            <template #trigger>
              <n-button text size="small" @click="fillDemo">
                {{ t('page.login.fillDemo') }}
              </n-button>
            </template>
            {{ t('page.login.demoTooltip') }}
          </n-tooltip>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login-shell {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  min-height: 100vh;
  width: 100%;
}

/* === Brand panel === */
.brand-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 48px 32px;
  color: #fff;
  overflow: hidden;
  transition: background 0.3s ease;
}

.brand-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

/* 彩色 logo 转单色白，与品牌色背景一致 */
.brand-logo {
  width: 64px;
  height: 64px;
  filter: brightness(0) invert(1);
  opacity: 0.95;
}

.brand-name {
  margin: 0;
  font-size: 2rem;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.brand-slogan {
  margin: 0;
  font-size: 1rem;
  opacity: 0.78;
  letter-spacing: 0.05em;
}

.brand-version {
  position: absolute;
  right: 16px;
  bottom: 12px;
  font-size: 0.75rem;
  opacity: 0.5;
  letter-spacing: 0.05em;
}

/* === Form panel ===
 * main.css 里 body 用 var(--n-color, #fff)，但 --n-color 是 NaiveUI 组件级 CSS 变量，
 * body 拿不到全局值 → dark 模式下 body 仍是白底。这里显式给 form-panel 主题感知背景，
 * 避免「NaiveUI dark 输入框 + 白底 form panel」的视觉悬空。
 */
.form-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 32px;
  background-color: #fff;
  color: #333;
}

.is-dark .form-panel {
  background-color: #18181c;
  color: rgba(255, 255, 255, 0.9);
}

.form-wrap {
  width: min(420px, 92%);
}

.form-title {
  margin: 0 0 32px 0;
  font-size: 1.5rem;
  font-weight: 500;
  text-align: center;
}

.form-actions {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

/* === 窗口窄时上下堆叠（Electron 用户极少缩到这么小，但兜底） === */
@media (max-width: 880px) {
  .login-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .brand-panel {
    padding: 24px 16px;
  }
  .brand-logo {
    width: 40px;
    height: 40px;
  }
  .brand-name {
    font-size: 1.4rem;
  }
  .brand-slogan {
    font-size: 0.9rem;
  }
  .brand-version {
    display: none;
  }
}
</style>
