/**
 * 本地图标集懒加载：基于 @iconify/json 的 235 个图标集，但**不全量加载**到内存
 * （总 411MB，不可能）。改为「按需动态 import」：当某个图标 prefix 第一次被使用时，
 * 才加载对应的 JSON 文件（每个 100KB - 1MB）。
 *
 * 工作流程：
 *   1. setupIcons() 注册 loadIcon 回调到 @iconify/vue
 *   2. Icon 组件渲染时，如果图标不在内存，调用 loadIcon
 *   3. loadIcon 动态 import 对应 prefix 的 JSON 文件
 *   4. addCollection 注册到 @iconify/vue 存储
 *   5. Icon 组件立即重新渲染
 *
 * 这样：
 *   - 0 个图标集预装（启动快）
 *   - 只装实际用到的（运行时按需）
 *   - 0 次网络请求（CSP 不触发）
 */
import { addCollection, addAPIProvider, type IconifyJSON } from '@iconify/vue'

// 禁用 @iconify/vue 的默认 API，所有图标必须本地解析
addAPIProvider('', {
  resources: []
})

// 用 Vite 的 import.meta.glob 把所有 @iconify/json/json/*.json 收集起来
// eager: false → 不立即加载，只生成动态 import 函数
// 用 @iconify-json 别名（在 electron.vite.config.ts 和 tsconfig.web.json 配置）
const collectionLoaders = import.meta.glob<IconifyJSON>('@iconify-json/*.json', {
  eager: false,
  import: 'default',
  query: '?json'
})

if (import.meta.env.DEV) {
  console.log(`[icons] collectionLoaders: ${Object.keys(collectionLoaders).length} 个集合`)
}

const loadedPrefixes = new Set<string>()

function loaderKey(prefix: string): string | undefined {
  const key = Object.keys(collectionLoaders).find(k => k.endsWith(`/${prefix}.json`))
  return key
}

/**
 * 按需加载图标集。Icon 组件遇到没注册的图标时调这个。
 * 加载成功返回 true，找不到返回 false。
 */
export async function loadIconCollection(prefix: string): Promise<boolean> {
  if (loadedPrefixes.has(prefix)) return true
  const key = loaderKey(prefix)
  if (!key) {
    console.warn(`[icons] collection "${prefix}" not found in @iconify/json`)
    return false
  }
  try {
    const collection = await collectionLoaders[key]()
    addCollection(collection)
    loadedPrefixes.add(prefix)
    return true
  } catch (err) {
    console.error(`[icons] failed to load collection "${prefix}":`, err)
    return false
  }
}

/**
 * 批量预加载：传入图标名列表（如 ['carbon:home', 'ic:round-manage-accounts']），
 * 自动按 prefix 去重加载。
 */
export async function preloadIcons(icons: Array<string | undefined | null>): Promise<void> {
  const prefixes = new Set<string>()
  for (const icon of icons) {
    if (!icon || !icon.includes(':')) continue
    prefixes.add(icon.split(':')[0])
  }
  await Promise.all(Array.from(prefixes).map(loadIconCollection))
}

/** App 启动时调一次 */
export function setupIcons(): void {
  // 暂无需全局初始化，loadIconCollection 按需调用即可
}
