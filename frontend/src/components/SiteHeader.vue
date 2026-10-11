<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import { useTheme } from '@/composables/useTheme'

/**
 * 站点导航栏。
 * - solid：吸顶白底（文章详情、分类、专题等内页使用）
 * - transparent：透明叠在 Hero 图片上方，白色文字（首页使用）
 */
withDefaults(defineProps<{ transparent?: boolean }>(), { transparent: false })

const site = useSiteStore()
const route = useRoute()
const { isDark, toggleTheme } = useTheme()
const drawer = ref(false)

const navs = [
  { label: '首页', to: '/' },
  { label: '文章', to: '/articles' },
  { label: '分类', to: '/categories' },
  { label: '专题', to: '/topics' },
  { label: '关于', to: '/about' }
]

const isActive = (to: string) => {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`) || (to === '/articles' && route.name === 'article')
}
</script>

<template>
  <header class="site-header" :class="transparent ? 'is-transparent' : 'is-solid'">
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

      <div class="header-actions">
        <button
          class="theme-toggle"
          type="button"
          :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
          :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
          @click="toggleTheme"
        >
          <el-icon :size="18"><Sunny v-if="isDark" /><Moon v-else /></el-icon>
        </button>

        <button class="hamburger" type="button" aria-label="菜单" @click="drawer = true">
          <el-icon :size="20"><Menu /></el-icon>
        </button>
      </div>
    </div>
  </header>

  <el-drawer v-model="drawer" direction="rtl" size="72%" :with-header="false">
    <div class="drawer-body">
      <div class="drawer-brand">{{ site.siteName }}</div>
      <router-link
        v-for="item in navs"
        :key="item.to"
        :to="item.to"
        class="drawer-link"
        :class="{ active: isActive(item.to) }"
        @click="drawer = false"
      >
        {{ item.label }}
      </router-link>
    </div>
  </el-drawer>
</template>

<style scoped>
.site-header {
  z-index: 20;
  height: var(--header-height);
  width: 100%;
}

/* 内页：吸顶白底 */
.site-header.is-solid {
  position: sticky;
  top: 0;
  background: var(--header-bg);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--border);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

/* 首页：叠在 Hero 顶部，透明、白字 */
.site-header.is-transparent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: transparent;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
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
  background: var(--brand-soft-2);
}

.nav a.active {
  color: #fff;
  background: var(--brand);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-toggle,
.hamburger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: 10px;
  color: var(--text-1);
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.theme-toggle:hover,
.hamburger:hover {
  color: var(--brand-dark);
  border-color: var(--chip-border-hover);
}

.hamburger {
  display: none;
}

/* ===== 透明变体：白色文字 ===== */
.is-transparent .brand-text strong {
  color: #fff;
}

.is-transparent .brand-text small {
  color: rgba(255, 255, 255, 0.78);
}

.is-transparent .nav a {
  color: rgba(255, 255, 255, 0.88);
}

.is-transparent .nav a:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}

.is-transparent .nav a.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
}

.is-transparent .hamburger,
.is-transparent .theme-toggle {
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.is-transparent .theme-toggle:hover,
.is-transparent .hamburger:hover {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
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
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-weight: 600;
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
