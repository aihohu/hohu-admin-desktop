import { ipcMain, nativeTheme } from 'electron'

/**
 * Theme IPC 通道。
 *
 * nativeTheme 控制主进程的 OS 层主题（标题栏颜色、原生 scrollbar、原生右键菜单等）。
 * 渲染层切暗黑模式时同步通知主进程，让原生 UI 跟随。
 *
 * 注意：'system' 表示跟随 OS；'dark'/'light' 表示强制覆盖。
 */
export const THEME_CHANNELS = {
  SET_NATIVE_SOURCE: 'theme:setNativeSource'
} as const

export type NativeThemeSource = 'system' | 'dark' | 'light'

export function registerThemeIpc(): void {
  ipcMain.handle(THEME_CHANNELS.SET_NATIVE_SOURCE, (_e, source: NativeThemeSource) => {
    nativeTheme.themeSource = source
  })
}
