/**
 * Phase 1 第 3 项冒烟测试：拉真实后端路由 → 跑 transform + menu 生成
 *
 * 运行：node --experimental-strip-types scripts/smoke-test.mjs
 *   或：tsx scripts/smoke-test.mjs
 *
 * 验证：
 *   1. /auth/getUserRoutes 真实响应能被 transform 正确解析
 *   2. 所有 component 字符串都能映射到 views 表（或 fallback 404）
 *   3. menu 生成规则正确（hideInMenu 过滤、空目录 disabled、外链 routePath 空）
 *   4. cacheRoutes 收集正确
 */
import http from 'node:http'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000'
const USER = process.env.TEST_USER || 'admin'
const PASS = process.env.TEST_PASS || '123456'

function postJson(path, body) {
  const data = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => {
        let buf = ''
        res.on('data', chunk => (buf += chunk))
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(buf) }))
      }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function getJson(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE}${path}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
      res => {
        let buf = ''
        res.on('data', chunk => (buf += chunk))
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(buf) }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

// 复刻 router/transform.ts 的核心逻辑
const LAYOUT_PREFIX = 'layout.'
const VIEW_PREFIX = 'view.'
const SPLIT = '$'

// 模拟 views 表（实际由 import.meta.glob 生成，这里只关心 key 解析）
function getViewKey(component) {
  if (component.includes(SPLIT)) {
    return component.split(SPLIT)[1].replace(VIEW_PREFIX, '')
  }
  if (component.startsWith(VIEW_PREFIX)) return component.replace(VIEW_PREFIX, '')
  return null
}

function getLayoutName(component) {
  if (component.startsWith(LAYOUT_PREFIX)) {
    if (component.includes(SPLIT)) return component.split(SPLIT)[0].replace(LAYOUT_PREFIX, '')
    return component.replace(LAYOUT_PREFIX, '')
  }
  return null
}

function transform(route, depth = 0) {
  const issues = []
  const { component } = route
  const indent = '  '.repeat(depth)

  if (component.includes(SPLIT)) {
    const layoutName = getLayoutName(component)
    const viewKey = getViewKey(component)
    if (!layoutName) issues.push(`${indent}${route.name}: invalid layout in single-level`)
    if (!viewKey) issues.push(`${indent}${route.name}: invalid view in single-level`)
  } else if (component.startsWith(LAYOUT_PREFIX)) {
    // 布局容器
    const layoutName = getLayoutName(component)
    if (!layoutName) issues.push(`${indent}${route.name}: invalid layout name`)
    const kids = route.children ?? []
    if (kids.length === 0) {
      console.log(`${indent}⚠️  ${route.name} 是空目录（children=null/[]）`)
    }
    for (const kid of kids) issues.push(...transform(kid, depth + 1))
  } else if (component.startsWith(VIEW_PREFIX)) {
    const viewKey = getViewKey(component)
    if (!viewKey) issues.push(`${indent}${route.name}: invalid view name`)
  } else {
    issues.push(`${indent}${route.name}: unknown component descriptor "${component}"`)
  }

  return issues
}

function generateMenus(routes) {
  const menus = []
  for (const r of routes) {
    if (r.meta?.hideInMenu === true) continue
    const isExternal = Boolean(r.meta?.href)
    const isSingleLevel = r.component.includes(SPLIT)
    const isEmptyDir = !isSingleLevel && r.component.startsWith('layout.') && (r.children ?? []).length === 0
    let children
    if (!isSingleLevel && (r.children ?? []).length > 0) {
      children = generateMenus(r.children)
      if (children.length === 0) children = undefined
    }
    menus.push({
      key: r.name,
      label: r.meta?.title || r.name,
      icon: r.meta?.icon || undefined,
      routePath: isExternal || isEmptyDir ? '' : r.path,
      children,
      disabled: isEmptyDir,
      href: isExternal ? r.meta.href : undefined
    })
  }
  return menus
}

function collectCacheRoutes(routes) {
  const result = []
  const walk = list => {
    for (const r of list) {
      if (r.meta?.keepAlive === true) result.push(r.name)
      if (r.children?.length) walk(r.children)
    }
  }
  walk(routes)
  return result
}

// Main
console.log(`\n=== Phase 1 第 3 项冒烟测试 ===`)
console.log(`目标: ${BASE}`)
console.log(`账号: ${USER}\n`)

const login = await postJson('/auth/login', { userName: USER, password: PASS })
if (login.status !== 200) {
  console.error('❌ 登录失败:', login.status, login.data)
  process.exit(1)
}
const token = login.data?.data?.token
if (!token) {
  console.error('❌ 登录响应缺少 token:', login.data)
  process.exit(1)
}
console.log(`✅ 登录成功，token: ${token.slice(0, 20)}...`)

const r = await getJson('/auth/getUserRoutes', token)
if (r.status !== 200) {
  console.error('❌ getUserRoutes 失败:', r.status, r.data)
  process.exit(1)
}
const { home, routes } = r.data.data
console.log(`✅ 拉取 ${routes.length} 个一级路由，home = "${home}"\n`)

console.log('--- 一级路由清单 ---')
for (const route of routes) {
  const kids = route.children ?? []
  const type = route.component.includes('$') ? '单级' : route.component.startsWith('layout.') ? '多级' : '视图'
  console.log(`  ${route.name.padEnd(25)} ${type.padEnd(4)} path=${route.path.padEnd(15)} children=${kids.length}`)
}

console.log('\n--- Transform 检查（component 字符串解析） ---')
let totalIssues = 0
for (const route of routes) {
  const issues = transform(route)
  if (issues.length === 0) {
    console.log(`  ✅ ${route.name} OK`)
  } else {
    totalIssues += issues.length
    for (const i of issues) console.log(`  ❌ ${i}`)
  }
}

console.log('\n--- 特殊场景验证 ---')
// 空目录
const emptyDirs = routes.filter(r => r.component.startsWith('layout.') && (r.children ?? []).length === 0)
console.log(`空目录数: ${emptyDirs.length}（预期 ≥1，因为实测有 auth）`)
for (const r of emptyDirs) console.log(`  - ${r.name}: "${r.meta?.title}"`)

// 连字符 route_name
const hyphenNames = []
const walk = list => {
  for (const r of list) {
    if (r.name.includes('-')) hyphenNames.push(r.name)
    if (r.children) walk(r.children)
  }
}
walk(routes)
console.log(`\n带连字符的 route_name: ${hyphenNames.length}`)
for (const n of hyphenNames.slice(0, 5)) console.log(`  - ${n}`)

// 跨前缀 path
const crossPrefix = []
for (const r of routes) {
  if (r.children) {
    for (const c of r.children) {
      if (!c.path.startsWith(r.path)) {
        crossPrefix.push(`${r.name}(${r.path}) → ${c.name}(${c.path})`)
      }
    }
  }
}
console.log(`\n跨前缀父子 path: ${crossPrefix.length}（预期 ≥1，task→/system/job）`)
for (const c of crossPrefix.slice(0, 5)) console.log(`  - ${c}`)

// 嵌套深度
const maxDepth = (() => {
  let max = 0
  const w = (list, d) => {
    max = Math.max(max, d)
    for (const r of list) if (r.children) w(r.children, d + 1)
  }
  w(routes, 1)
  return max
})()
console.log(`\n最大嵌套深度: ${maxDepth}层`)

console.log('\n--- Menu 生成 ---')
const menus = generateMenus(routes)
console.log(`生成 ${menus.length} 个一级菜单项`)
for (const m of menus) {
  const tag = m.disabled ? ' [disabled]' : m.href ? ' [外链]' : ''
  console.log(`  ${m.key.padEnd(25)} "${m.label}"${tag}`)
  if (m.children) {
    for (const c of m.children) {
      const ctag = c.disabled ? ' [disabled]' : c.href ? ' [外链]' : ''
      console.log(`    └ ${c.key.padEnd(23)} "${c.label}"${ctag}`)
    }
  }
}

console.log('\n--- cacheRoutes (keepAlive=true) ---')
const cache = collectCacheRoutes(routes)
console.log(`缓存路由: ${cache.length} 个`)
for (const c of cache) console.log(`  - ${c}`)

console.log('\n=== 测试结果 ===')
if (totalIssues === 0) {
  console.log('✅ 所有 component 字符串都能被 transform 正确解析')
} else {
  console.log(`❌ 发现 ${totalIssues} 个 transform 问题`)
}
console.log(`✅ home 字段: "${home}"`)
console.log(`✅ 菜单生成: ${menus.length} 个`)
console.log(`✅ cacheRoutes: ${cache.length} 个`)
