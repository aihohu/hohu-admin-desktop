// 读 .env + 源 electron-builder.yml，注入 publish 段，输出 build/electron-builder.yml
// 用法：pnpm gen-publish（被 build:win/mac/linux 自动前置）
// 失败时（缺 GH_OWNER 或 UPDATER_URL 等）抛错并退出，避免静默生成坏配置
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/** 手动解析 .env（避免新增 dotenv 依赖） */
function readEnvFile() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return {}
  const out = {}
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    // 去掉首尾引号
    val = val.replace(/^['"]|['"]$/g, '')
    out[key] = val
  }
  return out
}

const env = { ...readEnvFile(), ...process.env }
const provider = (env.UPDATER_PROVIDER || 'github').toLowerCase()
const sourceYml = resolve(process.cwd(), 'electron-builder.yml')
const outDir = resolve(process.cwd(), 'build')
const outPath = resolve(outDir, 'electron-builder.yml')

if (!existsSync(sourceYml)) {
  throw new Error(`source electron-builder.yml not found at ${sourceYml}`)
}

let publishBlock
if (provider === 'github') {
  if (!env.GH_OWNER || !env.GH_REPO) {
    throw new Error('UPDATER_PROVIDER=github requires GH_OWNER and GH_REPO in .env')
  }
  publishBlock = `publish:\n  provider: github\n  owner: ${env.GH_OWNER}\n  repo: ${env.GH_REPO}\n`
} else if (provider === 'generic') {
  if (!env.UPDATER_URL) {
    throw new Error('UPDATER_PROVIDER=generic requires UPDATER_URL in .env')
  }
  publishBlock = `publish:\n  provider: generic\n  url: ${env.UPDATER_URL}\n`
} else {
  throw new Error(`unknown UPDATER_PROVIDER: ${provider}`)
}

const baseYml = readFileSync(sourceYml, 'utf8')
// 源 yml 末尾保证一行空行再追加 publish 段
const fullYml = baseYml.replace(/\s+$/, '') + '\n\n' + publishBlock

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, fullYml)
console.log(`[gen-publish-config] wrote ${outPath} (provider=${provider})`)
