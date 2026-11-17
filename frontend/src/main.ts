import { createApp, ref } from 'vue'
import { createPinia } from 'pinia'
/*
 * Element Plus 组件按需引入（vite.config.ts 里配了 ElementPlusResolver）：
 * 组件和样式都由 unplugin-vue-components 自动引入，这里只保留
 * 1) 全局语言包（日期选择器等需要中文）
 * 2) 深色变量
 * 3) ElMessage / ElMessageBox 的样式（这两个是函数式调用，不会走模板解析）
 *
 * 图标则**全量注册**：按需注册省下约 25KB(gzip)，但代价是每加一个图标
 * 都要记得改注册表，漏了就渲染成空白（主题切换按钮就踩过一次）。
 * 这点体积不值得，所以保持全量注册。
 */
import { ElMessage, ElMessageBox } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import { configProviderContextKey } from 'element-plus'
/* 浅色代码高亮主题保持不变，深色主题在 code-dark.css 中以 html.dark 作用域覆盖 */
import 'highlight.js/styles/github.css'
import '@/styles/code-dark.css'
import '@/styles/main.css'
import { initTheme } from '@/composables/useTheme'
import { initReadingPrefs } from '@/composables/useReadingPrefs'
import { installErrorReporter } from '@/utils/errorReporter'
import App from './App.vue'
import router from './router'

/* 挂载前应用已保存的主题，避免首屏闪白 */
initTheme()
/* 阅读偏好（字号/行宽）也提前应用，避免正文先按默认字号闪一下再变 */
initReadingPrefs()
/* 前端运行时错误上报：出错时后端能看到，正常访问零开销 */
installErrorReporter()

const app = createApp(App)

app.use(createPinia())
app.use(router)

/* 语言包：用 provide 注入，等价于 app.use(ElementPlus, { locale }) */
app.provide(configProviderContextKey, ref({ locale: zhCn }))

/* 全量注册图标：任何写法（v-if / :is / 动态字符串）都不会漏 */
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

/* 保证函数式调用可用（同时让打包器保留这两个模块） */
void ElMessage
void ElMessageBox

app.mount('#app')
