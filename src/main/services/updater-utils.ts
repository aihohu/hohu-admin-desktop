/** 24 小时 ms —— 启动后台检查的最小间隔 */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * 纯函数：是否应该发起检查（24h 限频）。
 * 抽出独立文件便于 unit test —— 不 import 任何 Electron runtime 模块。
 */
export function shouldCheckNow(lastCheck: number | null, now: number, intervalMs: number = CHECK_INTERVAL_MS): boolean {
  if (lastCheck === null) return true
  return now - lastCheck >= intervalMs
}

/** 纯函数：版本是否被用户跳过 */
export function isSkipped(version: string, skipVersion: string | null): boolean {
  if (!skipVersion) return false
  // 简单字面量比较：electron-updater 版本号是 semver，无需特殊解析
  return version === skipVersion
}
