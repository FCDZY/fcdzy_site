import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
/* Element Plus 深色变量（配合 html.dark 生效） */
import 'element-plus/theme-chalk/dark/css-vars.css'
/* 浅色代码高亮主题保持不变，深色主题在 code-dark.css 中以 html.dark 作用域覆盖 */
import 'highlight.js/styles/github.css'
import '@/styles/code-dark.css'
import '@/styles/main.css'
import { initTheme } from '@/composables/useTheme'
import App from './App.vue'
import router from './router'

/* 挂载前应用已保存的主题，避免首屏闪白 */
initTheme()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')
