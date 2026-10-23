<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { useSiteStore } from '@/stores/site'
import { useTheme } from '@/composables/useTheme'
import SiteSearch from '@/components/SiteSearch.vue'

/**
 * 站点导航栏。
 * 首页与内页视觉已统一：都是「绝对定位 + 完全透明 + 白字」，直接叠在 body 的全局固定背景图上，
 * 不吸顶、不画底色、不画边框，因此切页时不会再出现白色横框。
 * - 首页把组件放在 Hero 内部（transparent），内页由 FrontLayout 渲染；
 *   两者的定位、配色完全一致，内页额外用 .is-solid::before 补一层极短的顶部压暗遮罩保证白字可读。
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
      <nav class="nav desktop">
        <router-link v-for="item in navs" :key="item.to" :to="item.to" :class="{ active: isActive(item.to) }">
          {{ item.label }}
        </router-link>
      </nav>

      <div class="header-actions">
        <SiteSearch />

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

/*
 * 内页：与首页一致 —— 完全透明、无底色无边框、不吸顶（随页面滚走）。
 * 定位使用 relative 而不是 absolute：导航自己占住 62px 文档流高度，
 * 内容天然从它下方开始，「内容压到导航文字上」在结构上不可能发生，
 * 也不需要任何 padding 补偿（少一处跨文件耦合）。
 */
.site-header.is-solid {
  position: relative;
  background: transparent;
  border-bottom: none;
}

/*
 * 内页独有的顶部压暗遮罩：只覆盖导航栏高度再多 22px，向下淡出到透明，
 * 保证白字在任意背景图上可读；首页用 Hero 自带的遮罩，所以不重复叠加。
 * z-index: -1 让它落在导航内容之下、页面背景之上。
 */
.site-header.is-solid::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: calc(var(--header-height) + 22px);
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, var(--hero-overlay)) 0%,
    rgba(0, 0, 0, var(--hero-overlay)) 74%,
    rgba(0, 0, 0, 0) 100%
  );
  pointer-events: none;
  z-index: -1;
  transition: background 0.3s ease;
}

/* 首页：叠在 Hero 顶部，透明、白字。不加分隔线，保证背景图在导航处也连贯 */
.site-header.is-transparent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: transparent;
  border-bottom: none;
}

/*
 * 三段式栅格：左右各占 1fr、中间 auto，导航（第二列）因此在容器里真正水平居中，
 * 不靠左也不靠右，右侧按钮组固定在第三列右端。
 */
.header-inner {
  height: 100%;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 16px;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  grid-column: 2;
  justify-self: center;
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
  /* 第三列右端；移动端导航隐藏时依然靠右 */
  grid-column: 3;
  justify-self: end;
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

/* ===== 白色文字：首页与内页统一（都叠在全局背景图上） ===== */

.site-header .nav a {
  color: rgba(255, 255, 255, 0.88);
}

.site-header .nav a:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.16);
}

.site-header .nav a.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.24);
}

.site-header .hamburger,
.site-header .theme-toggle {
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.site-header .theme-toggle:hover,
.site-header .hamburger:hover {
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
}
</style>
