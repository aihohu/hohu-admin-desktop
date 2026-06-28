import { onUnmounted, ref, watch, type Ref } from 'vue'

/**
 * 数字 count-up 动画：target 变化时从 0 滚到目标值。
 * easeOutCubic 曲线，800ms 默认时长。用 requestAnimationFrame，不会卡 UI。
 *
 * decimals 控制保留几位小数（默认 0）。例如 9.8 用 decimals=1，1.2 也用 decimals=1。
 */
export function useCountUp(target: Ref<number>, duration = 800, decimals = 0): Ref<number> {
  const display = ref(0)
  let raf = 0
  let startTime = 0
  const factor = Math.pow(10, decimals)

  function animate(t: number): void {
    if (!startTime) startTime = t
    const progress = Math.min(1, (t - startTime) / duration)
    const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
    const raw = target.value * eased
    display.value = decimals > 0 ? Math.round(raw * factor) / factor : Math.round(raw)
    if (progress < 1) raf = requestAnimationFrame(animate)
  }

  watch(
    target,
    val => {
      if (val === 0) return
      cancelAnimationFrame(raf)
      startTime = 0
      raf = requestAnimationFrame(animate)
    },
    { immediate: true }
  )

  onUnmounted(() => cancelAnimationFrame(raf))

  return display
}
