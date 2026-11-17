<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import { useTheme } from '@/composables/useTheme'
import { IMAGE_PRESETS, optimizeImage } from '@/utils/image'
import ArticleRow from '@/components/ArticleRow.vue'
import AppPagination from '@/components/AppPagination.vue'
import SiteHeader from '@/components/SiteHeader.vue'

const site = useSiteStore()
const router = useRouter()
const { isDark } = useTheme()

const PAGE_SIZE = 10

/** 个人卡里的搜索框（回车跳到全部文章页） */
const profileKeyword = ref('')

function submitSearch() {
  const value = profileKeyword.value.trim()
  router.push(value ? { path: '/articles', query: { keyword: value } } : '/articles')
}

const listRef = ref<HTMLElement | null>(null)
const articles = ref<Article[]>([])
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
  const el = listRef.value
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
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
    <!-- ===== Hero：整幅背景图 + 底部渐隐到页面底色 ===== -->
    <section class="hero">
      <img v-if="heroImage" class="hero-bg" :src="heroImage" alt="" fetchpriority="high" />
      <div class="hero-overlay" aria-hidden="true" />

      <SiteHeader transparent />

      <div class="container hero-content">
        <p class="hero-brand">FCDZY</p>
        <h1 class="hero-title">{{ bannerTitle }}</h1>
        <p v-if="bannerSubtitle" class="hero-subtitle">{{ bannerSubtitle }}</p>
      </div>

    </section>

    <!-- ===== 主体：左侧个人卡 + 右侧紧凑文章流 ===== -->
    <div class="home-body">
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
          <div class="section-head">
            <h2>最新文章</h2>
            <router-link class="more" to="/articles">全部文章</router-link>
          </div>

          <el-skeleton v-if="loading" :rows="5" animated class="skeleton" />

          <div v-else-if="error" class="card state-box">
            <p class="state-text">{{ error }}</p>
            <el-button type="primary" plain @click="loadArticles">重新加载</el-button>
          </div>

          <div v-else-if="!articles.length" class="card empty">
            <p>还没有发布任何文章</p>
          </div>

          <template v-else>
            <ArticleRow v-for="item in articles" :key="item.id" :article="item" />
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
  min-height: 420px;
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
  /* 底部淡出：图片自己渐隐，露出全局页面背景（不再靠叠一层底色，避免出现硬边） */
  -webkit-mask-image: linear-gradient(180deg, #000 58%, rgba(0, 0, 0, 0.75) 76%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 58%, rgba(0, 0, 0, 0.75) 76%, transparent 100%);
}

.hero-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(180deg, rgba(12, 10, 14, 0.42) 0%, rgba(12, 10, 14, 0.16) 36%, rgba(12, 10, 14, 0.04) 62%);
}

.hero-content {
  position: relative;
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
  margin: 0;
  font-size: clamp(30px, 4.4vw, 46px);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: #fff;
  text-shadow: 0 8px 30px rgba(24, 10, 26, 0.5);
}

.hero-subtitle {
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
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
  /* 不再用负边距让卡片探进 Hero：那会让卡片顶边在图上"突起"一截 */
  margin-top: 26px;
}

/* ---- 左侧个人卡 ---- */
.profile {
  position: sticky;
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
.stream {
  display: flex;
  flex-direction: column;
  gap: 11px;
  min-width: 0;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px 2px;
}

.section-head h2 {
  margin: 0;
  font-size: 18.5px;
  font-weight: 800;
  color: var(--text-1);
}

.section-head .more {
  font-size: 12.5px;
  color: var(--text-3);
  text-decoration: none;
}

.section-head .more:hover {
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
  }

  .profile {
    position: static;
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
</style>
