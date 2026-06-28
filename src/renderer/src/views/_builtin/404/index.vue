<script setup lang="ts">
import { useRouter } from 'vue-router'

defineOptions({ name: 'NotFoundPage' })

const router = useRouter()
</script>

<template>
  <n-result status="404" title="404" description="抱歉，你访问的页面不存在">
    <template #footer>
      <n-button type="primary" @click="router.push('/')">返回首页</n-button>
    </template>
  </n-result>
</template>
