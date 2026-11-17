<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import SiteHeader from '@/components/SiteHeader.vue'
import BackToTop from '@/components/BackToTop.vue'

const site = useSiteStore()
const route = useRoute()

const year = new Date().getFullYear()
/** 页脚年份：起始年等于今年时只显示一个年份（避免 "© 2026 - 2026"） */
const copyrightRange = computed(() => {
  const from = Number(site.config.startYear) || year
  return from >= year ? String(year) : `${from} - ${year}`
})

/** 首页的导航栏放在 Hero 内部，其他页面使用吸顶白底导航 */
const showHeader = computed(() => route.name !== 'home')
</script>

<template>
  <div class="front-layout">
    <SiteHeader v-if="showHeader" />

    <main class="site-main">
      <router-view />
    </main>

    <footer class="site-footer">
      <div class="container">
        <p>{{ site.config.footerText }}</p>
        <p class="links">
          <a v-if="site.config.githubUrl" :href="site.config.githubUrl" target="_blank" rel="noopener">GitHub</a>
          <a v-if="site.config.email" :href="`mailto:${site.config.email}`">邮箱</a>
          <a
            v-if="site.config.icp"
            class="icp-link"
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            title="工业和信息化部政务服务平台 · 备案查询"
            >{{ site.config.icp }}</a
          >
        </p>
        <p class="copyright">© {{ copyrightRange }} {{ site.siteName }}</p>
      </div>
    </footer>

    <BackToTop />

    <!-- 胶片颗粒层：纯装饰，不拦截任何点击（z-index 低于弹层，灯箱/对话框里保持干净） -->
    <div class="grain-layer" aria-hidden="true" />
  </div>
</template>

<style scoped>
.front-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.site-main {
  flex: 1;
}

/* 页脚：完全透明 —— 无底色、无边框、无阴影、无毛玻璃，背景图直接穿透；
   文字颜色沿用主题 token 自动适配，并加一层与主题相反的描边保证可读 */
.site-footer {
  background: transparent;
  border-top: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  padding: 22px 0 26px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  text-shadow: 0 1px 3px var(--page-heading-shadow);
  transition: color 0.3s ease;
}

.site-footer p {
  margin: 4px 0;
}

.site-footer .links {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 14px;
}

.site-footer a {
  color: var(--text-2);
}

.site-footer a:hover {
  color: var(--brand-dark);
}

/* 备案号：外表保持页脚同款文字，hover 时给下划线提示可点击 */
.icp-link {
  color: inherit;
  text-decoration: none;
}

.icp-link:hover {
  text-decoration: underline;
}

.copyright {
  opacity: 0.75;
}
</style>
