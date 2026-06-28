/**
 * 本地图标集懒加载：基于 @iconify/json 的 235 个图标集。
 * 不全量加载到内存（总 411MB），改为按 prefix 动态 import。
 *
 * 工作流：
 *   preloadIcons(['carbon:home', 'ic:round-manage-accounts'])
 *     → 按 prefix 去重 ['carbon', 'ic']
 *     → 动态 import 对应 JSON 文件
 *     → addCollection 注册到 @iconify/vue 内存存储
 *     → Icon 组件渲染时直接从内存读取，不发网络请求
 */
import { addCollection, addAPIProvider, type IconifyJSON } from '@iconify/vue'

// 禁用 @iconify/vue 的在线 API，所有图标必须本地解析（避免 CSP 拦截）
addAPIProvider('', { resources: [] })

// Vite glob：收集所有图标集的动态 import 函数（不立即加载）
const collectionLoaders = import.meta.glob<IconifyJSON>('@iconify-json/*.json', {
  eager: false,
  import: 'default',
  query: '?json'
})

const loadedPrefixes = new Set<string>()

function loaderKey(prefix: string): string | undefined {
  return Object.keys(collectionLoaders).find(k => k.endsWith(`/${prefix}.json`))
}

/** 按需加载单个图标集 */
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

/** 批量预加载：传入图标名列表，自动按 prefix 去重加载 */
export async function preloadIcons(icons: Array<string | undefined | null>): Promise<void> {
  const prefixes = new Set<string>()
  for (const icon of icons) {
    if (!icon || !icon.includes(':')) continue
    prefixes.add(icon.split(':')[0])
  }
  await Promise.all(Array.from(prefixes).map(loadIconCollection))
}
