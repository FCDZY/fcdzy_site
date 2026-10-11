<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()
const route = useRoute()
const drawer = ref(false)

const navs = [
  { label: '首页', to: '/' },
  { label: '文章', to: '/articles' },
  { label: '分类', to: '/categories' },
  { label: '专题', to: '/topics' },
  { label: '关于', to: '/about' }
]

const year = new Date().getFullYear()

const isActive = (to: string) => {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`) || (to === '/articles' && route.name === 'article')
}

const bannerTitle = computed(() => site.config.homeBannerTitle || site.siteName)
</script>

<template>
  <div class="front-layout">
    <header class="site-header">
      <div class="container header-inner">
        <router-link to="/" class="brand">
          <img v-if="site.config.siteLogo" :src="site.config.siteLogo" alt="logo" class="logo" />
          <span v-else class="logo-letter">{{ site.siteName.slice(0, 1) }}</span>
          <span class="brand-text">
            <strong>{{ site.siteName }}</strong>
            <small>{{ site.siteSubtitle }}</small>
          </span>
        </router-link>

        <nav class="nav desktop">
          <router-link v-for="item in navs" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }">
            {{ item.label }}
          </router-link>
        </nav>

        <button class="hamburger" type="button" aria-label="菜单" @click="drawer = true">
          <el-icon :size="20"><Menu /></el-icon>
        </button>
      </div>
    </header>

    <el-drawer v-model="drawer" direction="rtl" size="72%" :with-header="false">
      <div class="drawer-body">
        <div class="drawer-brand">{{ site.siteName }}</div>
        <router-link v-for="item in navs" :key="item.to" :to="item.to" class="drawer-link"
          :class="{ active: isActive(item.to) }" @click="drawer = false">
          {{ item.label }}
        </router-link>
      </div>
    </el-drawer>

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

.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  height: var(--header-height);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);
}

.header-inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.logo,
.logo-letter {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex: 0 0 34px;
}

.logo {
  object-fit: cover;
}

.logo-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-weight: 700;
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-text strong {
  font-size: 16px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brand-text small {
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav a {
  padding: 6px 14px;
  border-radius: 999px;
  color: var(--text-2);
  font-size: 14.5px;
  transition: all 0.16s ease;
}

.nav a:hover {
  color: var(--brand-dark);
  background: #f2f6ff;
}

.nav a.active {
  color: #fff;
  background: var(--brand);
}

.hamburger {
  display: none;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  color: var(--text-1);
}

.site-main {
  flex: 1;
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 4px;
}

.drawer-brand {
  font-weight: 700;
  font-size: 17px;
  margin-bottom: 12px;
}

.drawer-link {
  padding: 12px 14px;
  border-radius: 10px;
  color: var(--text-2);
}

.drawer-link.active {
  background: #eff6ff;
  color: var(--brand-dark);
  font-weight: 600;
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

@media (max-width: 768px) {
  .nav.desktop {
    display: none;
  }

  .hamburger {
    display: flex;
  }

  .brand-text small {
    display: none;
  }
}
</style>
