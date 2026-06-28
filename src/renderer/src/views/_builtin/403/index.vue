<script setup lang="ts">
import { useRouter } from 'vue-router'

defineOptions({ name: 'ForbiddenPage' })

const router = useRouter()
</script>

<template>
  <n-result status="403" title="403" description="抱歉，你没有权限访问此页面">
    <template #footer>
      <n-button type="primary" @click="router.push('/')">返回首页</n-button>
    </template>
  </n-result>
</template>
