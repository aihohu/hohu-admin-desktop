<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../../store/auth'
import { useRouteStore } from '../../store/route'

defineOptions({ name: 'LoginPage' })

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()
const routeStore = useRouteStore()

const form = ref({
  userName: 'admin',
  password: '123456'
})
const loading = ref(false)

async function handleSubmit(): Promise<void> {
  if (!form.value.userName || !form.value.password) {
    message.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await authStore.login(form.value.userName, form.value.password)
    message.success(`欢迎回来，${authStore.userName}`)
    // login 内部已初始化路由，跳到首页
    router.push({ name: routeStore.home || 'home' })
  } catch (err) {
    message.error(err instanceof Error ? err.message : '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <n-card class="login-card" title="登录 hohu-admin-desktop" :bordered="false" size="large">
    <n-form @keyup.enter="handleSubmit">
      <n-form-item label="用户名">
        <n-input v-model:value="form.userName" placeholder="请输入用户名" clearable />
      </n-form-item>
      <n-form-item label="密码">
        <n-input
          v-model:value="form.password"
          type="password"
          show-password-on="click"
          placeholder="请输入密码"
          clearable
        />
      </n-form-item>
      <n-button type="primary" block :loading="loading" @click="handleSubmit">登录</n-button>
    </n-form>

    <n-divider>演示账号</n-divider>
    <n-text depth="3" style="font-size: 12px">admin / 123456（需要 hohu-admin 后端运行在 baseURL）</n-text>
  </n-card>
</template>

<style scoped>
.login-card {
  width: min(420px, 92vw);
  margin: 0 auto;
}
</style>
