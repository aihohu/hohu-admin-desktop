import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@resources': resolve('resources')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          // sandbox=true 要求 preload 是 CJS（不能用 ESM import）
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@resources': resolve('resources'),
        '@iconify-json': resolve('node_modules/@iconify/json/json')
      }
    },
    plugins: [vue()]
  }
})
