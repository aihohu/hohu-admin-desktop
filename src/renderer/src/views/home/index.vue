<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useThemeVars } from 'naive-ui'
import { useCountUp } from '../../composables/use-count-up'

defineOptions({ name: 'Home' })

const themeVars = useThemeVars()

/** 框架指标（静态展示值，count-up 用） */
const bundleSize = computed(() => 9.8) // MB, main.js gzipped
const coldStart = computed(() => 1.2) // 秒，to interactive
const buildTime = computed(() => 16) // 秒，pnpm build

const animatedBundle = useCountUp(bundleSize, 1200, 1)
const animatedCold = useCountUp(coldStart, 1200, 1)
const animatedBuild = useCountUp(buildTime, 1200)

/**
 * Backend latency 模拟：纯前端随机游走，每 3s 更新一次，保留最近 30 个点。
 * 不调后端——home 是登录后页面，避免在截图时刚好后端 down 显示 Offline。
 */
const SPARK_POINTS = 30
const latencyHistory = ref<number[]>(Array.from({ length: SPARK_POINTS }, () => 8 + Math.random() * 4))
const currentLatency = computed(() => latencyHistory.value[latencyHistory.value.length - 1])
const backendStatus = ref<'online' | 'offline'>('online')

let latencyTimer = 0
function tickLatency(): void {
  const last = latencyHistory.value[latencyHistory.value.length - 1]
  // 在 5–20ms 范围内随机游走
  const next = Math.max(5, Math.min(20, last + (Math.random() - 0.5) * 4))
  latencyHistory.value = [...latencyHistory.value.slice(1), next]
}

/** 把 latency 数组转成 SVG path d 属性 */
const sparklinePath = computed(() => {
  const points = latencyHistory.value
  const w = 200
  const h = 50
  const max = 25 // 上限固定，避免曲线跳变
  const min = 0
  return points
    .map((v, i) => {
      const x = (i / (SPARK_POINTS - 1)) * w
      const y = h - ((v - min) / (max - min)) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const sparklineAreaPath = computed(() => `${sparklinePath.value} L200,50 L0,50 Z`)

/** 按顶层菜单分组，统计每个模块的路由数（已弃用，保留 countLeaves 给 total 用） */
interface DayStat {
  /** 第几天（-29 ~ 0，0 = 今天） */
  offset: number
  /** 日期标签（'6/14'） */
  label: string
  count: number
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

/** 最近 30 天的活动（事件数），种子随当天日期变化 */
const dailyStats = computed<DayStat[]>(() => {
  const rng = seededRandom(Math.floor(Date.now() / 86400000))
  const today = new Date()
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (29 - i))
    // 模拟趋势：周末略低 + 随机噪声
    const weekend = date.getDay() === 0 || date.getDay() === 6 ? 0.6 : 1
    const trend = 30 + i * 1.5 // 最近更活跃
    const noise = Math.floor(rng() * 40)
    return {
      offset: i - 29,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: Math.floor((trend + noise) * weekend)
    }
  })
})

const maxDailyCount = computed(() => Math.max(1, ...dailyStats.value.map(d => d.count)))
const totalDailyCount = computed(() => dailyStats.value.reduce((s, d) => s + d.count, 0))

/** 把 themeVars 桥到 CSS 变量 */
const cssVars = computed(() => ({
  '--tile-bg': themeVars.value.cardColor,
  '--tile-border': themeVars.value.dividerColor,
  '--text-1': themeVars.value.textColor1,
  '--text-2': themeVars.value.textColor3,
  '--text-3': themeVars.value.textColorDisabled,
  '--primary': themeVars.value.primaryColor
}))

const now = ref(new Date())
let clockTimer = 0
onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
  latencyTimer = window.setInterval(tickLatency, 3000)
})
onUnmounted(() => {
  window.clearInterval(clockTimer)
  window.clearInterval(latencyTimer)
})
</script>

<template>
  <div class="home-root" :style="cssVars">
    <!-- 顶部小标 -->
    <div class="top-bar">
      <span class="label-mono">DASHBOARD · OVERVIEW</span>
      <span class="label-mono">{{ now.toLocaleTimeString() }} · UTC{{ getTzOffset() }}</span>
    </div>

    <!-- Bento Grid -->
    <div class="bento">
      <!-- HERO -->
      <div class="tile tile-hero">
        <div class="hero-glow" />
        <div class="hero-content">
          <div class="hero-eyebrow">DESKTOP FRAMEWORK</div>
          <h1 class="hero-title">
            HoHu Admin
            <br />
            Desktop
          </h1>
          <div class="hero-sub">Vue 3 · Electron · TypeScript</div>
        </div>
        <div class="hero-footer">
          <div>
            <div class="hero-version-label">VERSION</div>
            <div class="hero-version-num">v0.0.1</div>
          </div>
          <div class="hero-bolt">⚡</div>
        </div>
      </div>

      <!-- Bundle size -->
      <div class="tile">
        <div class="tile-head">
          <span class="tile-label">BUNDLE</span>
        </div>
        <div class="tile-body">
          <div class="big-num with-unit">
            {{ animatedBundle.toFixed(1) }}
            <span class="unit">MB</span>
          </div>
        </div>
        <div class="tile-foot">main.js · gzipped</div>
      </div>

      <!-- Backend (sparkline) -->
      <div class="tile">
        <div class="tile-head">
          <span class="tile-label">BACKEND LATENCY</span>
          <span
            class="status-dot"
            :class="{ online: backendStatus === 'online', offline: backendStatus === 'offline' }"
          />
        </div>
        <div class="tile-body spark-body">
          <div class="spark-current">
            <span class="big-num small">{{ currentLatency.toFixed(1) }}</span>
            <span class="spark-unit">ms</span>
          </div>
          <svg class="sparkline" viewBox="0 0 200 50" preserveAspectRatio="none">
            <defs>
              <linearGradient :id="'spark-grad'" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.4" />
                <stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path :d="sparklineAreaPath" :fill="'url(#spark-grad)'" />
            <path :d="sparklinePath" stroke="var(--primary)" stroke-width="1.5" fill="none" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="tile-foot mono-sub">last 90s · 30 samples</div>
      </div>

      <!-- Cold start -->
      <div class="tile">
        <div class="tile-head">
          <span class="tile-label">COLD START</span>
        </div>
        <div class="tile-body">
          <div class="big-num with-unit">
            {{ animatedCold.toFixed(1) }}
            <span class="unit">s</span>
          </div>
        </div>
        <div class="tile-foot">to interactive</div>
      </div>

      <!-- Build time -->
      <div class="tile">
        <div class="tile-head">
          <span class="tile-label">BUILD TIME</span>
        </div>
        <div class="tile-body">
          <div class="big-num with-unit">
            {{ animatedBuild }}
            <span class="unit">s</span>
          </div>
        </div>
        <div class="tile-foot">pnpm build</div>
      </div>
    </div>

    <!-- Activity · Last 30 days（柱状图 + 热力图） -->
    <div class="card-section activity-card">
      <div class="section-head">
        <span class="tile-label">ACTIVITY · LAST 30 DAYS</span>
        <span class="mono-sub">{{ totalDailyCount }} events · peak {{ maxDailyCount }}/day</span>
      </div>
      <div class="bar-chart xl">
        <div v-for="d in dailyStats" :key="d.offset" class="bar-col" :title="`${d.label}: ${d.count} events`">
          <div class="bar-track">
            <div class="bar-fill" :style="{ height: `${(d.count / maxDailyCount) * 100}%` }"></div>
          </div>
        </div>
      </div>
      <div class="bar-axis">
        <span class="mono-sub">{{ dailyStats[0]?.label }}</span>
        <span class="mono-sub">{{ dailyStats[Math.floor(dailyStats.length / 2)]?.label }}</span>
        <span class="mono-sub">{{ dailyStats[dailyStats.length - 1]?.label }}</span>
      </div>

      <div class="divider"></div>

      <div class="heatmap-row">
        <span class="tile-label heat-label">INTENSITY</span>
        <div class="day-chart">
          <div
            v-for="d in dailyStats"
            :key="d.offset"
            class="day-cell"
            :class="dayClass(d.count)"
            :title="`${d.label}: ${d.count} events`"
          ></div>
        </div>
        <div class="day-legend">
          <span class="mono-sub">Less</span>
          <div class="day-cell level-0"></div>
          <div class="day-cell level-1"></div>
          <div class="day-cell level-2"></div>
          <div class="day-cell level-3"></div>
          <div class="day-cell level-4"></div>
          <span class="mono-sub">More</span>
        </div>
      </div>
    </div>

    <!-- 底部 footer -->
    <div class="foot-bar">
      <span class="label-mono">main · optimized for production</span>
      <span class="label-mono">{{ now.toLocaleDateString() }}</span>
    </div>
  </div>
</template>

<script lang="ts">
function getTzOffset(): string {
  const offset = -new Date().getTimezoneOffset() / 60
  return offset >= 0 ? `+${offset}` : `${offset}`
}

/** 按 daily count 分 5 个等级（GitHub contribution 风格） */
function dayClass(n: number): string {
  if (n === 0) return 'level-0'
  if (n < 10) return 'level-1'
  if (n < 25) return 'level-2'
  if (n < 40) return 'level-3'
  return 'level-4'
}
</script>

<style scoped>
.home-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
  height: 100%;
  color: var(--text-1);
  font-family: -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif;
}

.activity-card {
  display: flex;
  flex-direction: column;
}

.top-bar,
.foot-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-mono {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.15em;
}

/* ---- Bento Grid ---- */
.bento {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  grid-template-rows: auto auto;
  gap: 12px;
}

.tile {
  background-color: var(--tile-bg);
  border: 1px solid var(--tile-border);
  border-radius: 14px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 130px;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
}

.tile:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
}

.tile-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tile-label {
  font-size: 9px;
  letter-spacing: 0.2em;
  color: var(--text-2);
  text-transform: uppercase;
  font-family: 'SF Mono', ui-monospace, monospace;
}

.tile-foot {
  font-size: 10px;
  color: var(--text-3);
  font-family: 'SF Mono', ui-monospace, monospace;
}

.tile-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0;
}

.mono-sub {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: var(--text-2);
}

.big-num {
  font-size: 32px;
  font-weight: 700;
  font-family: 'SF Mono', ui-monospace, monospace;
  color: var(--primary);
  line-height: 1;
}

.big-num.small {
  font-size: 22px;
}

.big-num.with-unit {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.unit {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  font-family: 'SF Mono', ui-monospace, monospace;
}

/* ---- HERO tile ---- */
.tile-hero {
  grid-row: span 2;
  background: linear-gradient(135deg, #18a058 0%, #0a6e3f 100%);
  border: none;
  color: #fff;
  position: relative;
  overflow: hidden;
  min-height: 240px;
  padding: 22px;
}

.tile-hero:hover {
  transform: translateY(-2px);
  border-color: transparent;
  box-shadow: 0 12px 32px rgba(24, 160, 88, 0.3);
}

.hero-glow {
  position: absolute;
  top: -50px;
  right: -50px;
  width: 240px;
  height: 240px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 70%);
  pointer-events: none;
}

.hero-content {
  position: relative;
  z-index: 1;
}

.hero-eyebrow {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 10px;
  letter-spacing: 0.3em;
  opacity: 0.75;
  margin-bottom: 12px;
}

.hero-title {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
  margin: 0;
}

.hero-sub {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 12px;
  opacity: 0.85;
  margin-top: 10px;
}

.hero-footer {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.hero-version-label {
  font-size: 9px;
  letter-spacing: 0.2em;
  opacity: 0.7;
  text-transform: uppercase;
}

.hero-version-num {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 20px;
  font-weight: 700;
  margin-top: 2px;
}

.hero-bolt {
  font-size: 28px;
  opacity: 0.5;
}

/* ---- Status dot ---- */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--text-3);
}

.status-dot.online {
  background-color: var(--primary);
  box-shadow: 0 0 8px var(--primary);
  animation: pulse 2s ease-in-out infinite;
}

.status-dot.offline {
  background-color: #d03050;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.85);
  }
}

/* ---- Sparkline ---- */
.spark-body {
  flex-direction: column;
  gap: 6px;
}

.spark-current {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.spark-unit {
  font-size: 12px;
  color: var(--text-2);
  font-family: 'SF Mono', ui-monospace, monospace;
}

.sparkline {
  width: 100%;
  height: 36px;
  display: block;
}

/* ---- Activity 柱状图 ---- */
.card-section {
  background-color: var(--tile-bg);
  border: 1px solid var(--tile-border);
  border-radius: 14px;
  padding: 18px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.bar-chart {
  display: flex;
  gap: 8px;
  height: 100px;
}

.bar-chart.tall {
  height: 200px;
}

.bar-chart.xl {
  /* 必须用 definite height，否则子元素 height:X% 解析不出来（CSS 百分比高度需要 definite parent） */
  height: 220px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.bar-track {
  width: 100%;
  flex: 1;
  display: flex;
  align-items: flex-end;
}

.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, var(--primary) 0%, color-mix(in srgb, var(--primary) 50%, transparent) 100%);
  border-radius: 3px 3px 0 0;
  min-height: 6px;
  position: relative;
  transition:
    height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.15s ease;
}

.bar-fill:hover {
  filter: brightness(1.2);
}

.bar-axis {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}

.divider {
  height: 1px;
  background-color: var(--tile-border);
  margin: 14px 0;
}

.heatmap-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.heat-label {
  margin-bottom: 2px;
}

/* ---- 30 天活动热力图（GitHub contribution 风格） ---- */
.day-chart {
  display: grid;
  grid-template-columns: repeat(30, 1fr);
  gap: 4px;
  height: 32px;
}

.day-cell {
  width: 100%;
  height: 100%;
  border-radius: 3px;
  transition: transform 0.15s ease;
}

.day-cell:hover {
  transform: scale(1.4);
}

.day-cell.level-0 {
  background-color: color-mix(in srgb, var(--text-3) 15%, transparent);
}

.day-cell.level-1 {
  background-color: color-mix(in srgb, var(--primary) 25%, transparent);
}

.day-cell.level-2 {
  background-color: color-mix(in srgb, var(--primary) 50%, transparent);
}

.day-cell.level-3 {
  background-color: color-mix(in srgb, var(--primary) 75%, transparent);
}

.day-cell.level-4 {
  background-color: var(--primary);
}

.day-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  justify-content: flex-end;
}

.day-legend .day-cell {
  width: 12px;
  height: 12px;
}

/* ---- 响应式：< 1024px 退化为 2 列 ---- */
@media (max-width: 1024px) {
  .bento {
    grid-template-columns: 1fr 1fr;
  }

  .tile-hero {
    grid-row: span 1;
    grid-column: span 2;
    min-height: 180px;
  }

  .bar-chart {
    height: 80px;
  }

  .bar-chart.tall {
    height: 160px;
  }

  .day-chart {
    grid-template-columns: repeat(15, 1fr);
    grid-template-rows: repeat(2, 1fr);
    height: auto;
    aspect-ratio: 15 / 2;
  }
}
</style>
