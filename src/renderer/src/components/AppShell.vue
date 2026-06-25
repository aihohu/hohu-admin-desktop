<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../store/auth'
import Login from '../views/Login.vue'
import Dashboard from '../views/Dashboard.vue'

const authStore = useAuthStore()
const message = useMessage()

const bootstrapped = ref(false)

onMounted(async () => {
  // 启动时尝试从安全存储恢复 token
  const ok = await authStore.initAuth()
  if (ok) {
    message.success(`欢迎回来，${authStore.userName}`)
  }
  bootstrapped.value = true
})

function handleLoginSuccess(): void {
  // 登录成功后 store.isLogin 已为 true，模板自动切换
}

function handleLogout(): void {
  message.info('已退出登录')
}
</script>

<template>
  <n-spin v-if="!bootstrapped" size="large" class="boot-spinner" />
  <Login v-else-if="!authStore.isLogin" @success="handleLoginSuccess" />
  <Dashboard v-else @logout="handleLogout" />
</template>

<style scoped>
.boot-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
</style>
