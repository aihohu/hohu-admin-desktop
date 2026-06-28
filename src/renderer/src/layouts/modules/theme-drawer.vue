<script setup lang="ts">
import { computed } from 'vue'
import { type GlobalThemeOverrides } from 'naive-ui'
import { useThemeStore, PRESET_COLORS, type PresetColor } from '../../store/theme'
import { useI18nHelpers } from '../../composables/use-i18n'

defineOptions({ name: 'ThemeDrawer' })

defineProps<{ show: boolean }>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const themeStore = useThemeStore()
const { t } = useI18nHelpers()

const colorOptions = computed(() =>
  (Object.keys(PRESET_COLORS) as PresetColor[]).map(key => ({
    key,
    label: t(`theme.preset.${key}`),
    color: PRESET_COLORS[key]
  }))
)

function selectColor(key: PresetColor): void {
  themeStore.setPrimaryColor(key)
}

// 防止类型未使用警告
void (undefined as unknown as GlobalThemeOverrides)
</script>

<template>
  <NDrawer :show="show" :width="320" placement="right" @update:show="emit('update:show', $event)">
    <NDrawerContent :title="t('theme.title')" closable>
      <NSpace vertical :size="24">
        <!-- 暗黑模式 -->
        <div class="row">
          <span>{{ t('theme.darkMode') }}</span>
          <NSwitch :value="themeStore.darkMode" @update:value="themeStore.toggleDark()" />
        </div>

        <!-- 主色 -->
        <div>
          <div class="row-label">{{ t('theme.primaryColor') }}</div>
          <NSpace>
            <div
              v-for="opt in colorOptions"
              :key="opt.key"
              class="color-chip"
              :class="{ active: themeStore.primaryColor === opt.key }"
              :style="{ backgroundColor: opt.color }"
              :title="opt.label"
              @click="selectColor(opt.key)"
            />
          </NSpace>
        </div>
      </NSpace>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row-label {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--n-text-color-3, #999);
}

.color-chip {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.color-chip:hover {
  border-color: var(--n-border-color, #ddd);
}

.color-chip.active {
  border-color: var(--n-text-color, #333);
}
</style>
