<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore, PRESET_COLORS, type PresetColor } from '../../../store/theme'
import { useI18nHelpers } from '../../../composables/use-i18n'

defineOptions({ name: 'SectionAppearance' })

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
</script>

<template>
  <div>
    <NDivider>{{ t('settings.appearance.title') }}</NDivider>
    <div class="rows">
      <div class="row">
        <span>{{ t('settings.appearance.darkMode') }}</span>
        <NSwitch :value="themeStore.darkMode" @update:value="themeStore.setDark" />
      </div>

      <div class="row">
        <span>{{ t('settings.appearance.primaryColor') }}</span>
        <div class="chips">
          <div
            v-for="opt in colorOptions"
            :key="opt.key"
            class="chip"
            :class="{ active: themeStore.primaryColor === opt.key }"
            :style="{ backgroundColor: opt.color }"
            :title="opt.label"
            @click="selectColor(opt.key)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.chips {
  display: flex;
  gap: 8px;
}
.chip {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}
.chip.active {
  border-color: var(--n-text-color-1, #333);
}
</style>
