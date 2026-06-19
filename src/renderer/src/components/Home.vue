<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'

const message = useMessage()

const versions = window.electron.process.versions
const text = ref('')

const ipcHandle = (): void => {
  window.electron.ipcRenderer.send('ping')
  message.success('ping 已发送，主进程会打印 pong')
}

const greeting = computed(() => (text.value ? `你好，${text.value}！` : '请在下方输入你的名字'))
</script>

<template>
  <n-card class="home-card" title="hohu-admin-desktop" :bordered="false" size="large">
    <n-space vertical :size="20">
      <n-space align="center" :size="12">
        <n-tag type="primary" :bordered="false">Electron</n-tag>
        <n-tag type="success" :bordered="false">Vue 3</n-tag>
        <n-tag type="info" :bordered="false">TypeScript</n-tag>
        <n-tag type="warning" :bordered="false">Naive UI</n-tag>
      </n-space>

      <n-text strong>{{ greeting }}</n-text>

      <n-input v-model:value="text" placeholder="输入名字试试" clearable />

      <n-space>
        <n-button type="primary" @click="ipcHandle">发送 IPC ping</n-button>
        <n-button @click="message.info('naive-ui 工作正常')">点我</n-button>
        <n-button type="error" ghost @click="message.warning('这是一个 warning')">警告样式</n-button>
      </n-space>

      <n-divider />

      <n-descriptions label-placement="left" :column="3" bordered>
        <n-descriptions-item label="Electron">v{{ versions.electron }}</n-descriptions-item>
        <n-descriptions-item label="Chromium">v{{ versions.chrome }}</n-descriptions-item>
        <n-descriptions-item label="Node">v{{ versions.node }}</n-descriptions-item>
      </n-descriptions>
    </n-space>
  </n-card>
</template>

<style scoped>
.home-card {
  width: min(680px, 92vw);
  margin: 0 auto;
}
</style>
