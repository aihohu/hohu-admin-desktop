<script setup lang="ts">
import { useRouter } from 'vue-router'

defineOptions({ name: 'ServerErrorPage' })

const router = useRouter()
</script>

<template>
  <n-result status="500" title="500" description="抱歉，服务器出现错误">
    <template #footer>
      <n-button type="primary" @click="router.push('/')">返回首页</n-button>
    </template>
  </n-result>
</template>
