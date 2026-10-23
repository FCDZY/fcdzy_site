<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import SiteHeader from '@/components/SiteHeader.vue'
import BackToTop from '@/components/BackToTop.vue'

const site = useSiteStore()
const route = useRoute()

const year = new Date().getFullYear()

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
          <span v-if="site.config.icp">{{ site.config.icp }}</span>
        </p>
        <p class="copyright">© {{ site.config.startYear || year }} - {{ year }} {{ site.siteName }}</p>
      </div>
    </footer>

    <BackToTop />
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

.copyright {
  opacity: 0.75;
}
</style>
