<script setup lang="ts">
defineOptions({ name: 'BlankLayout' })
</script>

<template>
  <div class="blank-layout">
    <RouterView />
  </div>
</template>

<style scoped>
.blank-layout {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
