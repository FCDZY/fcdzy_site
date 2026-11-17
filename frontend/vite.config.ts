import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    /*
     * Element Plus 按需引入：只打包实际用到的组件（含 v-loading 这类指令），
     * 主包从 ~405KB(gzip) 降到 ~250KB。组件用到的样式会一起自动引入。
     */
    Components({
      resolvers: [ElementPlusResolver({ importStyle: 'css' })],
      directives: true,
      dts: false
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/sitemap.xml': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/robots.txt': { target: 'http://127.0.0.1:8080', changeOrigin: true }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500
  }
})
