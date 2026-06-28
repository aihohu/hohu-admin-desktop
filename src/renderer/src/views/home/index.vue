<script setup lang="ts">
import { useAuthStore } from '../../store/auth'

defineOptions({ name: 'Home' })

const authStore = useAuthStore()
</script>

<template>
  <n-card class="home-card" :bordered="false" size="large">
    <n-space vertical :size="16">
      <n-space align="center" :size="12">
        <n-avatar v-if="authStore.userAvatar" :src="authStore.userAvatar" round />
        <n-avatar v-else round>{{ authStore.userName.slice(0, 1).toUpperCase() }}</n-avatar>
        <n-space vertical :size="0">
          <n-text strong>{{ authStore.userName }}</n-text>
          <n-text depth="3" style="font-size: 12px">userId: {{ authStore.userId }}</n-text>
        </n-space>
      </n-space>

      <n-divider />

      <n-descriptions label-placement="left" :column="2" bordered>
        <n-descriptions-item label="用户名">{{ authStore.userName }}</n-descriptions-item>
        <n-descriptions-item label="ID">{{ authStore.userId }}</n-descriptions-item>
        <n-descriptions-item label="角色">
          <n-space :size="4">
            <n-tag v-for="r in authStore.roles" :key="r" size="small" type="primary" :bordered="false">
              {{ r }}
            </n-tag>
            <n-text v-if="authStore.roles.length === 0" depth="3">无</n-text>
          </n-space>
        </n-descriptions-item>
        <n-descriptions-item label="按钮权限">
          <n-text depth="3" style="font-size: 12px">{{ authStore.buttons.length }} 个</n-text>
        </n-descriptions-item>
      </n-descriptions>
    </n-space>
  </n-card>
</template>

<style scoped>
.home-card {
  width: min(560px, 92vw);
  margin: 0 auto;
}
</style>
