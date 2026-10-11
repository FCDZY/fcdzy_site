<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import SiteHeader from '@/components/SiteHeader.vue'

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

    <el-backtop :right="20" :bottom="30" />
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

.site-footer {
  border-top: 1px solid var(--border);
  background: #fff;
  padding: 22px 0 26px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
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

.site-footer a:hover {
  color: var(--brand-dark);
}

.copyright {
  opacity: 0.75;
}
</style>
