<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import { useTheme } from '@/composables/useTheme'
import { IMAGE_PRESETS, optimizeImage } from '@/utils/image'
import TimelineList from '@/components/TimelineList.vue'
import HeroParallax from '@/components/HeroParallax.vue'
import AppPagination from '@/components/AppPagination.vue'
import SiteHeader from '@/components/SiteHeader.vue'

const site = useSiteStore()
const router = useRouter()
const { isDark } = useTheme()

const PAGE_SIZE = 8

/** 个人卡里的搜索框（回车跳到全部文章页） */
const profileKeyword = ref('')

function submitSearch() {
  const value = profileKeyword.value.trim()
  router.push(value ? { path: '/articles', query: { keyword: value } } : '/articles')
}

const listRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)

/**
 * Hero 鼠标视差 + 光斑（A + D 方案）
 *  - 图片 scale(1.06) + 位移 ±12px；文字反向位移 30%
 *  - 光斑 240px 白色柔光跟随指针
 *  - 只用 CSS 变量驱动 transform，不触发 Vue 重渲染
 */
const PARALLAX_PX = 12

function onHeroPointer(event: PointerEvent) {
  const hero = heroRef.value
  if (!hero) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const rect = hero.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  const nx = (event.clientX - rect.left) / rect.width - 0.5
  const ny = (event.clientY - rect.top) / rect.height - 0.5
  hero.style.setProperty('--px', `${(nx * 2 * PARALLAX_PX).toFixed(2)}px`)
  hero.style.setProperty('--py', `${(ny * 2 * PARALLAX_PX).toFixed(2)}px`)
  hero.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  hero.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
  hero.style.setProperty('--spot-o', '1')
}

function onHeroLeave() {
  const hero = heroRef.value
  if (!hero) return
  hero.style.setProperty('--px', '0px')
  hero.style.setProperty('--py', '0px')
  hero.style.setProperty('--spot-o', '0')
}
const articles = ref<Article[]>([])

/** 首页每段最多展示几条置顶，超出折叠 */
const PINNED_LIMIT = 2
const pinnedArticles = computed(() => articles.value.filter((a) => a.topped))
const shownPinned = computed(() => pinnedArticles.value.slice(0, PINNED_LIMIT))
const hiddenPinnedCount = computed(() => Math.max(0, pinnedArticles.value.length - PINNED_LIMIT))
const normalArticles = computed(() => articles.value.filter((a) => !a.topped))
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

const bannerTitle = computed(() => site.config.homeBannerTitle || site.siteName)
const bannerSubtitle = computed(() => site.config.homeBannerSubtitle || '')
const authorName = computed(() => site.config.authorName || site.siteName)
const authorBio = computed(() => site.config.authorBio || '记录与思考。')

/** Hero 背景图：跟随深浅色取不同素材，图片经过 OSS 尺寸/质量处理 */
const heroImage = computed(() => {
  const raw = isDark.value
    ? site.config.homeHeroImageDark || site.config.homeHeroImage
    : site.config.homeHeroImage || site.config.homeHeroImageDark
  return raw ? optimizeImage(raw, IMAGE_PRESETS.hero) : ''
})

const avatarUrl = computed(() =>
  site.config.authorAvatar ? optimizeImage(site.config.authorAvatar, IMAGE_PRESETS.avatar) : ''
)


async function loadArticles() {
  loading.value = true
  error.value = ''
  try {
    // 分页参数使用 pageNum / pageSize，后端返回 records（=list）与 total
    const result = await publicApi.articles({ pageNum: page.value, pageSize: PAGE_SIZE })
    articles.value = result.records ?? result.list ?? []
    total.value = result.total ?? 0
  } catch {
    articles.value = []
    total.value = 0
    error.value = '文章加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function scrollToList() {
  /* 正好滚到 Hero 底边：背景图只留在首屏，内容区顶部是 76px 的留白 */
  const hero = document.querySelector('.hero') as HTMLElement | null
  if (!hero) return
  window.scrollTo({ top: hero.offsetHeight, behavior: 'smooth' })
}


function changePage(next: number) {
  page.value = next
  loadArticles()
  scrollToList()
}

watch(
  () => site.siteName,
  () => {
    useSeo({
      title: '',
      description: site.config.siteDescription,
      keywords: site.config.siteKeywords
    })
  },
  { immediate: true }
)


onMounted(() => {
  loadArticles()
})
</script>

<template>
  <div class="home">
    <!-- ===== Hero：整幅背景图（鼠标视差 + 光斑） ===== -->
    <section ref="heroRef" class="hero" @pointermove="onHeroPointer" @pointerleave="onHeroLeave">
      <!-- 背景：2.5D 三层视差（移动端回落到后台配置的图片） -->
      <HeroParallax :fallback-src="heroImage" />
      <div class="hero-overlay" aria-hidden="true" />
      <div class="hero-spot" aria-hidden="true" />


      <div class="container hero-content">
        <p class="hero-brand">FCDZY</p>
        <h1 class="hero-title">{{ bannerTitle }}</h1>
        <p v-if="bannerSubtitle" class="hero-subtitle">{{ bannerSubtitle }}</p>
      </div>

      <!-- 下滑箭头：全屏 Hero 里唯一的「往下还有内容」提示 -->
      <button class="hero-scroll" type="button" aria-label="下滑查看文章" @click="scrollToList">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 6 6 6 6-6" />
          <path d="m6 13 6 6 6-6" />
        </svg>
      </button>

    </section>

    <!-- ===== 主体：左侧个人卡 + 右侧紧凑文章流 ===== -->
    <div class="home-body">
      <!-- 导航移到内容区顶部（首屏留给整幅图） -->
      <SiteHeader />
      <div class="container home-grid">
        <aside class="profile card">
          <div class="profile-avatar">
            <img v-if="avatarUrl" :src="avatarUrl" :alt="authorName" />
            <span v-else class="avatar-fallback">{{ authorName.slice(0, 1) }}</span>
          </div>
          <h2 class="profile-name">{{ authorName }}</h2>
          <p class="profile-bio">{{ authorBio }}</p>

          <div class="profile-social">
            <a
              v-if="site.config.githubUrl"
              class="social-link"
              :href="site.config.githubUrl"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path
                  d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
                />
              </svg>
            </a>
            <a v-if="site.config.email" class="social-link" :href="`mailto:${site.config.email}`" aria-label="Email">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                <path d="m4 7.5 8 5.5 8-5.5" />
              </svg>
            </a>
          </div>


          <div class="profile-divider profile-divider--align-top" aria-hidden="true"></div>

          <div class="profile-stats">
            <div class="stat">
              <b>{{ total }}</b>
              <span>文章</span>
            </div>
            <div class="stat">
              <b>{{ site.categories.length }}</b>
              <span>分类</span>
            </div>
            <div class="stat">
              <b>{{ site.tags.length }}</b>
              <span>标签</span>
            </div>
          </div>

        <div class="profile-divider" aria-hidden="true"></div>

          <nav class="profile-nav">
            <router-link class="nav-item is-on" to="/">首页</router-link>
            <router-link class="nav-item" to="/articles">文章</router-link>
            <router-link class="nav-item" to="/categories">分类 / 专题</router-link>
            <router-link class="nav-item" to="/about">关于</router-link>
          </nav>

          <!-- 个人卡里的搜索：回车跳「全部文章」并带上关键词 -->
          <form class="profile-search" @submit.prevent="submitSearch">
            <input
              v-model="profileKeyword"
              class="profile-search-input"
              type="search"
              placeholder="搜索文章…"
              aria-label="搜索文章"
            />
            <button class="profile-search-btn" type="submit" aria-label="搜索">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </form>
        </aside>

        <div ref="listRef" class="stream">
          <el-skeleton v-if="loading" :rows="5" animated class="skeleton" />

          <div v-else-if="error" class="card state-box">
            <p class="state-text">{{ error }}</p>
            <el-button type="primary" plain @click="loadArticles">重新加载</el-button>
          </div>

          <div v-else-if="!articles.length" class="card empty">
            <p>还没有发布任何文章</p>
          </div>

          <template v-else>
            <!-- 置顶段：最多 ${PINNED_LIMIT} 条，超出折叠 -->
            <section v-if="shownPinned.length" class="feed-block">
              <div class="block-head">
                <h2>置顶</h2>
                <span class="block-count">{{ pinnedArticles.length }} 篇</span>
              </div>
              <TimelineList :articles="shownPinned" :thumb-width="104" compact />
              <router-link v-if="hiddenPinnedCount" class="more-pinned" to="/articles">
                还有 {{ hiddenPinnedCount }} 篇置顶 →
              </router-link>
            </section>

            <!-- 最新段：按发布时间倒序 -->
            <section v-if="normalArticles.length" class="feed-block">
              <div class="block-head">
                <h2>最新</h2>
                <router-link class="more" to="/articles">全部文章</router-link>
              </div>
              <TimelineList :articles="normalArticles" :thumb-width="104" compact />
            </section>
          </template>

          <AppPagination :total="total" :page="page" :size="PAGE_SIZE" @change="changePage" />
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>

/* ===================== Hero ===================== */
.hero {
  position: relative;
  display: flex;
  align-items: center;
  /* 全屏 Hero：svh 让移动端地址栏收放时不跳动，老浏览器退回 vh */
  min-height: 100vh;
  min-height: 100svh;
  overflow: hidden;
  isolation: isolate;
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
  /* 不再做底部渐隐：图片直接铺到 Hero 底边（用户要求去掉那层朦胧感） */
  /* 鼠标视差：放大 6% 留位移余量，只动 transform（GPU 合成） */
  transform: scale(1.06) translate3d(var(--px, 0px), var(--py, 0px), 0);
  transition: transform 0.25s ease-out;
  will-change: transform;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  /* 只在最顶部压一点点暗，保证导航白字可读；图片本身的颜色不做任何处理 */
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.34) 0%, rgba(10, 14, 20, 0.1) 14%, transparent 30%);
}

.hero-content {
  position: relative;
  /* 文字与图片反向移动 30%，产生层次差 */
  transform: translate3d(calc(var(--px, 0px) * -0.3), calc(var(--py, 0px) * -0.3), 0);
  transition: transform 0.25s ease-out;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding-top: calc(var(--header-height, 62px) + 24px);
  padding-bottom: 40px;
  text-align: center;
}

.hero-brand {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: var(--text-on-dark-shadow);
}

.hero-title {
  /* 压暗层去掉后，靠文字自身的投影保证在亮背景上可读 */
  text-shadow: 0 2px 18px rgba(4, 10, 18, 0.55), 0 1px 3px rgba(4, 10, 18, 0.45);
  margin: 0;
  font-size: clamp(30px, 4.4vw, 46px);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: #fff;
  text-shadow: 0 8px 30px rgba(24, 10, 26, 0.5);
}

.hero-subtitle {
  text-shadow: 0 1px 10px rgba(4, 10, 18, 0.6);
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 2px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: var(--text-on-dark-shadow);
}

.hero-subtitle::before,
.hero-subtitle::after {
  content: '';
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.55);
}


/* ===================== 主体布局 ===================== */
.home-body {
  position: relative;
  padding-bottom: 72px;
  /* 不铺底色：让全局背景图贯穿（卡片自己用 82% 毛玻璃保证可读） */
}



.home-grid {
  display: grid;
  /* 文章在左、个人卡在右（用户要求把卡片挪到右手边） */
  /* 个人卡列 260px：腾出 20px 给卡片，使卡片正好 +160px */
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 22px;
  align-items: start;
  /* 导航自占 62px，这里再留 44px：标题与导航之间约 44px，不挤也不空 */
  margin-top: 44px;
  /* 比全站 1080px 更宽：让时间轴与文章整体左移，日期贴近左侧留白 */
  /* 不对称留白：左边 60px（时间轴左移 40px），右边自动收回，卡片因此加宽 */
  /* 左边距 144px：让时间轴竖线正好落在 224px（用户标注的位置），右边留 15px */
  max-width: none;
  width: calc(100% - 159px);
  margin-left: 144px;
}

.stream {
  grid-column: 1;
  grid-row: 1;
}

/* ---- 左侧个人卡 ---- */
.profile {
  position: sticky;
  /* 右侧列，并与左侧第一张文章卡片顶部对齐（标题区高 33px + 间距） */
  grid-column: 2;
  grid-row: 1;
  margin-top: 62px;
  top: calc(var(--header-height, 62px) + 16px);
  padding: 18px 16px 14px;
  text-align: center;
  /* 白卡要和浅灰底分开：1px 淡边 + 极轻阴影，否则白天会「融」进背景 */
  background: #ffffff;
  border: 1px solid rgba(16, 24, 40, 0.08);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(16, 24, 40, 0.06);
}


.profile-avatar {
  width: 76px;
  height: 76px;
  margin: 0 auto 9px;
  overflow: hidden;
  background: var(--surface-muted, rgba(15, 23, 42, 0.06));
  border: 3px solid var(--surface-card);
  border-radius: 50%;
  box-shadow: 0 6px 18px rgba(160, 120, 170, 0.26);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-3);
}

.profile-name {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-1);
}

.profile-bio {
  margin: 5px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-3);
}

.profile-social {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 10px;
  color: var(--text-3);
}

.social-link {
  display: inline-flex;
  color: inherit;
  opacity: 0.8;
  transition: opacity 0.18s ease;
}

.social-link:hover {
  opacity: 1;
}

.profile-divider {
  height: 1px;
  margin: 12px 0 10px;
  background: var(--border-soft, rgba(15, 23, 42, 0.08));
}

/*
 * 第一条分割线下移，让它的 y 与右侧第一篇文章行的分隔线对齐，
 * 形成横贯左右两栏的「同一根基线」（数值按当前卡片内容量出来的 18px）。
 */
.profile-divider--align-top {
  margin-top: 30px;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat b {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

.stat span {
  font-size: 10.5px;
  color: var(--text-3);
}

.stat + .stat {
  border-left: 1px solid var(--border-soft, rgba(15, 23, 42, 0.08));
}

.profile-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
  text-decoration: none;
  background: var(--surface-muted, rgba(15, 23, 42, 0.04));
  border-radius: 10px;
  transition: background-color 0.18s ease;
}

.nav-item:hover {
  background: var(--surface-muted-strong, rgba(15, 23, 42, 0.08));
}

.nav-item.is-on {
  background: var(--surface-muted-strong, rgba(15, 23, 42, 0.1));
}

/* ---- 右侧文章流 ---- */
/* 卡片右侧截断在 1148px（用户标注位置），与个人卡之间留出更大空隙 */
.stream {
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
  /* 卡片在 1148px 处截断：补 205px 右侧留白，个人卡位置不动 */
  padding-right: 205px;
}
/* 每段的小标题：置顶 / 最新 */
.feed-block + .feed-block {
  margin-top: 34px;
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--row-line, rgba(16, 24, 40, 0.14));
}

.block-head h2 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-1);
}

.block-head .block-count,
.block-head .more {
  font-size: 11.5px;
  letter-spacing: 0.06em;
  color: var(--text-3);
  text-decoration: none;
}

.block-head .more:hover {
  color: var(--brand-strong, #4f46e5);
}

.more-pinned {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-3);
  text-decoration: none;
}

.more-pinned:hover {
  color: var(--brand-strong, #4f46e5);
}

.state-box,
.empty {
  padding: 28px;
  text-align: center;
  color: var(--text-3);
}

/* ===================== 响应式 ===================== */
@media (max-width: 960px) {
  .hero {
    min-height: 300px;
  }

  .hero-content {
    padding-top: calc(var(--header-height, 62px) + 36px);
    padding-bottom: 52px;
  }

  .home-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 20px;
    /* 移动端取消桌面端的不对称留白 */
    width: 100%;
    margin-left: auto;
  }

  .profile {
    position: static;
    grid-column: 1;
    grid-row: 2;
    margin-top: 0;
  }

  /* 手机端取消卡片右侧的 205px 截断 */
  .stream {
    padding-right: 0;
  }
}

/* 宽屏：个人卡左移贴住文章卡片（用户选 B），空隙 227px → 22px */
@media (min-width: 961px) {
  .profile {
    /* 与 .stream 的 205px 右侧留白等量反向补偿 */
    margin-left: -205px;
    /* 负 margin 会把格子撑宽，这里锁死宽度 */
    width: 260px;
    justify-self: start;
  }
}

/* 1560 以下的窗口没有富余宽度，别截断卡片：让卡片吃满，个人卡自然跟上 */
@media (max-width: 1559px) {
  .stream {
    padding-right: 0;
  }

  .profile {
    margin-left: 0;
    width: auto;
    justify-self: stretch;
  }
}


/* ---- 个人卡内搜索：与列表页同一套「下划线」语言 ---- */
.profile-search {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--row-line);
}

.profile-search-input {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  font-size: 12.5px;
  color: var(--row-title);
  background: transparent;
  border: 0;
  outline: none;
}

.profile-search-input::placeholder {
  color: var(--meta-faint);
  letter-spacing: 0.5px;
}

.profile-search-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--meta-faint);
  cursor: pointer;
  background: transparent;
  border: 0;
  transition: color 0.18s ease;
}

.profile-search-btn:hover {
  color: var(--row-title);
}

/* ---- Hero 底部下滑箭头 ---- */
.hero-scroll {
  position: absolute;
  bottom: 22px;
  left: 50%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  /* 箭头压在整幅照片上，明暗不定：白箭头 + 半透明深底 + 轻模糊，亮暗处都看得见 */
  color: #fff;
  cursor: pointer;
  background: transparent;
  border: 0;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
  transform: translateX(-50%);
  transition: background 0.2s ease, border-color 0.2s ease;
  animation: hero-bob 2.4s ease-in-out infinite;
}

.hero-scroll:hover {
  filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.75));
}

@keyframes hero-bob {
  0%,
  100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(7px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-scroll {
    animation: none;
  }
}

/* 光斑：跟随指针的柔光，模拟玻璃/油墨反光 */
.hero-spot {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(
    240px circle at var(--spot-x, 50%) var(--spot-y, 50%),
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.04) 40%,
    transparent 70%
  );
  opacity: var(--spot-o, 0);
  transition: opacity 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .hero-bg,
  .hero-content {
    transform: none;
    transition: none;
  }

  .hero-spot {
    display: none;
  }
}
</style>
