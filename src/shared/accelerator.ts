/**
 * KeyboardEvent → Electron accelerator 字符串的工具。
 * 用于设置页快捷键录制：用户按下组合键后转换为 Electron globalShortcut 识别的格式。
 *
 * 放在 src/shared 而非 renderer/src/utils：tsconfig.node.json 只 include src/{main,preload,shared}/**，
 * 测试在 node 环境跑必须能 import 到。KeyboardEvent 通过 AcceleratorInput 接口部分兼容。
 */
import type { Platform } from '@shared/types'

/** eventToAccelerator 的最小输入契约。KeyboardEvent 满足此结构。 */
export interface AcceleratorInput {
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
  key: string
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift'])

/** code → accelerator 主键名映射。返回 null 表示无法识别。 */
function codeToMainKey(code: string): string | null {
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Key')) return code.slice(3)
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  const specialMap: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Space: 'Space',
    Enter: 'Return',
    Escape: 'Escape',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Insert: 'Insert',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown'
  }
  return specialMap[code] ?? null
}

/**
 * 把 KeyboardEvent 转成 Electron accelerator 字符串。
 * 仅 modifier 按下（无主键）返回 null，表示「等用户继续按」。
 *
 * @example
 *   eventToAccelerator({ ctrlKey: true, code: 'KeyH', ... }) → 'CommandOrControl+H'
 *   eventToAccelerator({ ctrlKey: true, key: 'Control', code: 'ControlLeft', ... }) → null
 */
export function eventToAccelerator(e: AcceleratorInput): string | null {
  // 纯 modifier（无主键）：返回 null 让录制态保持
  if (MODIFIER_KEYS.has(e.key)) return null

  const main = codeToMainKey(e.code)
  if (!main) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(main)
  return parts.join('+')
}

const MAC_SYMBOLS: Record<string, string> = {
  CommandOrControl: '⌘',
  Alt: '⌥',
  Shift: '⇧'
}

/**
 * accelerator → 用户可读字符串。
 * mac 显示符号（⌘⇧H），win/linux 显示文字（Ctrl+Shift+H）。
 */
export function formatAccelerator(acc: string, platform: Platform): string {
  const parts = acc.split('+')
  if (platform === 'darwin') {
    return parts.map(p => MAC_SYMBOLS[p] ?? p).join('')
  }
  // win32 / linux：CommandOrControl → Ctrl（与 web 端展示一致）
  return parts.map(p => (p === 'CommandOrControl' ? 'Ctrl' : p)).join('+')
}
