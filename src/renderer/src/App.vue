<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider } from 'naive-ui'
import AppShell from './components/AppShell.vue'
</script>

<template>
  <NConfigProvider>
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <AppShell />
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
