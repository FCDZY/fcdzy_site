<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
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

/**
 * 滚动状态：超过 6px 就把导航变成吸顶玻璃条。
 * 用 rAF 节流，避免滚动时每帧都改 class；只改一个布尔值，开销可以忽略。
 */
/**
 * 不再吸顶（用户要求）：导航随页面滚走，所以「滚过 6px 变玻璃」这套状态也用不上了。
 * 保留变量是为了模板里的 :class 不报错，值恒为 false。
 */
const stuck = ref(false)
let ticking = false

function syncStuck() {
  ticking = false
  // 吸顶已取消：不再切换 is-stuck（保留函数以免影响事件解绑逻辑）
  stuck.value = false
}

function onScroll() {
  if (ticking) return
  ticking = true
  window.requestAnimationFrame(syncStuck)
}

onMounted(() => {
  syncStuck()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})

const navs = [
  { label: '首页', to: '/' },
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
  <header class="site-header" :class="[transparent ? 'is-transparent' : 'is-solid', { 'is-stuck': stuck }]">
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
  /* 不吸顶：随页面一起滚走（用户要求去掉吸顶） */
  position: relative;
  background: transparent;
  border-bottom: none;
}

/*
 * 内页独有的顶部压暗遮罩：只覆盖导航栏高度再多 22px，向下淡出到透明，
 * 保证白字在任意背景图上可读；首页用 Hero 自带的遮罩，所以不重复叠加。
 * z-index: -1 让它落在导航内容之下、页面背景之上。
 */
/*
 * 内页顶部不再有背景图（全站改成浅色渐变），那层压暗遮罩随之取消：
 * 留着会在页头形成一条灰带，反而破坏「白纸感」。
 */
.site-header.is-solid::before {
  display: none;
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
 * 透明态（还没吸顶）叠在 Hero 背景图上，必须强制白字：
 * 默认的 --text-2 在浅色主题下是深灰，压在深色图上会看不清。
 * 吸顶后（.is-stuck）交给玻璃态的 --header-fg，不在这里覆盖。
 */
.site-header.is-transparent:not(.is-stuck) .nav a {
  color: rgba(255, 255, 255, 0.92);
}

.site-header.is-transparent:not(.is-stuck) .nav a:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
}

.site-header.is-transparent:not(.is-stuck) .nav a.active {
  color: #fff;
  background: var(--brand);
}

.site-header.is-transparent:not(.is-stuck) .theme-toggle,
.site-header.is-transparent:not(.is-stuck) .hamburger {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
}

.site-header.is-transparent:not(.is-stuck) :deep(.search-pill) {
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.28);
}

/* ==================== 吸顶玻璃态 ==================== */
/*
 * 滚过 6px 之后导航变成磨砂玻璃条：
 * - 浅色主题：白玻璃 + 深色文字
 * - 深色主题：黑玻璃 + 白色文字（--glass-* / --header-* 变量在 main.css 里两套）
 * 顶部时保持原来的全透明（背景图连贯，首页观感不变）。
 */
/*
 * 吸顶时只要一层模糊底色，不再画边线/投影：
 * 之前那条 1px 边 + 28px 投影会形成一个明显的「框」，滚动时很抢眼。
 */
.site-header.is-stuck {
  z-index: 120;
  background: var(--glass-bg);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  box-shadow: none;
  transition: background 0.22s ease;
}

/* 首页导航 absolute 浮在 Hero 上，同样不吸顶：随 Hero 一起滚走 */

/* 吸顶后原来的顶部压暗遮罩淡出，避免和玻璃叠成一层黑 */
.site-header.is-solid.is-stuck::before {
  opacity: 0;
}

.site-header.is-stuck .nav a {
  color: var(--header-fg-dim);
  transition: color 0.2s ease, background-color 0.2s ease;
}

.site-header.is-stuck .nav a:hover {
  color: var(--header-fg);
  background: var(--header-pill-hover);
}

.site-header.is-stuck .nav a.active {
  color: #fff;
  background: var(--brand);
}

.site-header.is-stuck .theme-toggle,
.site-header.is-stuck .hamburger {
  color: var(--header-fg);
  background: var(--header-btn-bg);
  border-color: var(--header-btn-border);
}

.site-header.is-stuck .theme-toggle:hover,
.site-header.is-stuck .hamburger:hover {
  color: var(--header-fg);
  background: var(--header-pill-hover);
}

/* 搜索胶囊在玻璃底上也要跟着换色（原来是白色半透明，压在白玻璃上会看不见） */
.site-header.is-stuck :deep(.search-pill) {
  background: var(--header-btn-bg);
  border-color: var(--header-btn-border);
}

.site-header.is-stuck :deep(.site-search:hover .search-pill),
.site-header.is-stuck :deep(.site-search.is-open .search-pill) {
  background: var(--header-pill-hover);
  border-color: var(--header-btn-border);
}

.site-header.is-stuck :deep(.search-btn),
.site-header.is-stuck :deep(.search-input) {
  color: var(--header-fg);
}

.site-header.is-stuck :deep(.search-input::placeholder) {
  color: var(--header-fg-dim);
}
/* 移动端关掉 backdrop-filter：低端安卓上模糊会明显掉帧，改用接近不透明的底色 */
@media (max-width: 768px) {
  .site-header.is-stuck {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--glass-bg-solid);
  }
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

/* ===== 内页（.is-solid）：不再是白字，回到主题文字色 =====
 *
 * 之前内页也叠在全局背景图上，所以整站强制白字；现在全站改成浅色渐变，
 * 白字在浅底上不可读，白字规则只保留给首页 Hero 的透明态（见上方 is-transparent 规则）。
 */

/* 搜索胶囊：浅底上必须换成主题色，白色半透明在白天几乎看不见 */
.site-header.is-solid :deep(.search-pill) {
  background: var(--hdr-search-bg);
  border-color: var(--hdr-search-line);
}

.site-header.is-solid :deep(.site-search:hover .search-pill),
.site-header.is-solid :deep(.site-search.is-open .search-pill) {
  background: var(--hdr-search-bg-hover);
  border-color: var(--brand);
}

.site-header.is-solid :deep(.search-btn),
.site-header.is-solid :deep(.search-input) {
  color: var(--hdr-search-fg);
}

.site-header.is-solid :deep(.search-input::placeholder) {
  color: var(--hdr-search-hold);
}

.site-header.is-solid :deep(.search-btn:hover) {
  color: var(--brand);
}

.site-header.is-solid .nav a {
  color: var(--text-2);
}

.site-header.is-solid .nav a:hover {
  color: var(--brand-dark);
  background: var(--brand-soft-2);
}

.site-header.is-solid .nav a.active {
  color: #fff;
  background: var(--brand);
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
