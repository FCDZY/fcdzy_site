<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import { formatNumber } from '@/utils/format'
import { buildTagColorVars } from '@/utils/tagColor'
import ArticleCard from '@/components/ArticleCard.vue'
import AppPagination from '@/components/AppPagination.vue'
import SiteHeader from '@/components/SiteHeader.vue'

const site = useSiteStore()
const router = useRouter()

const PAGE_SIZE = 10
const HOT_SIZE = 5

const listRef = ref<HTMLElement | null>(null)
const articles = ref<Article[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

/** 侧边栏热门文章（后端按阅读量降序，最多 5 篇） */
const hotArticles = ref<Article[]>([])
const hotLoading = ref(false)

const bannerTitle = computed(() => site.config.homeBannerTitle || site.siteName)
const bannerSubtitle = computed(() => site.config.homeBannerSubtitle || site.siteSubtitle)

/** 侧栏标签的彩色（与文章卡片小标签共用 utils/tagColor 的调色板与取色规则） */
const tagColorVars = computed(() => buildTagColorVars(site.tags.map((tag) => tag.name)))

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

async function loadHot() {
  hotLoading.value = true
  try {
    hotArticles.value = await publicApi.hotArticles(HOT_SIZE)
  } catch {
    hotArticles.value = []
  } finally {
    hotLoading.value = false
  }
}

function changePage(next: number) {
  page.value = next
  loadArticles()
  scrollToList()
}

function openArticle(slug: string) {
  router.push({ name: 'article', params: { slug } })
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
  loadHot()
})
</script>

<template>
  <div class="home">
    <!-- ===== Hero：不再自带背景，标题文字直接浮在 body 的全局固定背景上 ===== -->
    <section class="hero">
      <!-- 仅一层顶部压暗遮罩，向下淡出，保证白色标题可读且不与下方背景形成硬边 -->
      <div class="hero-overlay" aria-hidden="true"></div>

      <SiteHeader transparent />

      <div class="container hero-content">
        <h1 class="hero-title">{{ bannerTitle }}</h1>
        <p class="hero-subtitle">{{ bannerSubtitle }}</p>
        <p v-if="site.config.siteDescription" class="hero-desc">{{ site.config.siteDescription }}</p>
        <div class="hero-actions">
          <router-link class="hero-btn primary" to="/articles">
            <el-icon><Reading /></el-icon>
            <span>浏览文章</span>
          </router-link>
          <router-link class="hero-btn ghost" to="/about">
            <el-icon><User /></el-icon>
            <span>关于我</span>
          </router-link>
        </div>
      </div>

      <!-- Hero 底部 80px 短渐变：半透明收尾，仅与下方文章区柔和衔接，不遮盖背景 -->
      <div class="hero-fade" aria-hidden="true"></div>
    </section>

    <!-- ===== Hero 下方：干净浅白底色，不叠加背景图 ===== -->
    <div class="home-body">
      <div class="container">
        <div class="layout">
          <!-- 标题独占第一行左列，让右侧侧栏从「第一张文章卡片」的顶部开始对齐 -->
          <div class="section-head">
            <h2>最新文章</h2>
            <router-link class="more" to="/articles">全部文章</router-link>
          </div>

          <div ref="listRef" class="main-col">
            <el-skeleton v-if="loading" :rows="5" animated class="skeleton card" />

            <div v-else-if="error" class="card state-box">
              <p class="state-text">{{ error }}</p>
              <el-button type="primary" plain @click="loadArticles">重新加载</el-button>
            </div>

            <div v-else-if="!articles.length" class="card empty">
              <p>还没有发布任何文章</p>
            </div>

            <template v-else>
              <ArticleCard v-for="item in articles" :key="item.id" :article="item" />
            </template>

            <AppPagination :total="total" :page="page" :size="PAGE_SIZE" @change="changePage" />
          </div>

          <aside class="side-col">
            <!-- 热门文章放在侧栏第一位 -->
            <section class="card card--dark side-card hot-card">
              <h3 class="side-title">热门文章</h3>
              <el-skeleton v-if="hotLoading" :rows="3" animated />
              <ol v-else-if="hotArticles.length" class="hot-list">
                <li v-for="(item, index) in hotArticles" :key="item.id" class="hot-item">
                  <router-link class="hot-link" :to="`/article/${item.slug}`">
                    <span class="hot-rank" :class="{ 'is-top': index < 3 }">{{ index + 1 }}</span>
                    <span class="hot-title">{{ item.title }}</span>
                    <span class="hot-views">{{ formatNumber(item.viewCount) }}</span>
                  </router-link>
                </li>
              </ol>
              <p v-else class="side-empty">暂无热门文章</p>
            </section>

            <section class="card card--dark side-card">
              <h3 class="side-title">分类</h3>
              <ul v-if="site.categories.length" class="side-list">
                <li v-for="item in site.categories" :key="item.id">
                  <router-link :to="`/category/${item.slug}`" class="side-link">
                    <span class="name">{{ item.name }}</span>
                    <span class="count">{{ item.articleCount || 0 }}</span>
                  </router-link>
                </li>
              </ul>
              <p v-else class="side-empty">暂无分类</p>
            </section>

            <section class="card card--dark side-card">
              <h3 class="side-title has-icon">
                <el-icon :size="15"><PriceTag /></el-icon>
                <span>标签</span>
              </h3>
              <div v-if="site.tags.length" class="tag-cloud">
                <router-link
                  v-for="(item, index) in site.tags"
                  :key="item.id"
                  :to="`/tag/${item.slug}`"
                  class="tag"
                  :style="{ '--tag-color': tagColorVars[index] }"
                >
                  {{ item.name }}
                </router-link>
              </div>
              <p v-else class="side-empty">暂无标签</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  /* 透明：让 body 的全局固定背景透出来 */
  background: transparent;
  padding-bottom: 48px;
}

/* ============ Hero（无自带背景，文字浮在全局背景上） ============ */
.hero {
  position: relative;
  height: 45vh;
  min-height: 380px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: transparent;
  margin-bottom: 0;
}

/* 顶部压暗遮罩：上浓下淡，向下自然融入全局背景，不再有硬边 */
.hero-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, var(--hero-overlay)) 0%,
    rgba(0, 0, 0, var(--hero-overlay)) 72%,
    rgba(0, 0, 0, 0) 100%
  );
  pointer-events: none;
  transition: background 0.3s ease;
}

.hero-content {
  position: relative;
  z-index: 3;
  padding-top: var(--header-height);
  color: #fff;
}

.hero-title {
  margin: 0 0 12px;
  font-size: 40px;
  line-height: 1.22;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.28);
}

.hero-subtitle {
  margin: 0 0 10px;
  max-width: 720px;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.94);
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.24);
}

.hero-desc {
  margin: 0 0 24px;
  max-width: 640px;
  font-size: 14.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.82);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.hero-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px 24px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  transition: transform 0.22s ease, box-shadow 0.22s ease, background 0.22s ease, border-color 0.22s ease;
  will-change: transform;
}

.hero-btn.primary {
  background: var(--brand);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.36);
}

.hero-btn.primary:hover {
  background: var(--brand-dark);
  transform: translateY(-3px);
  box-shadow: 0 14px 28px rgba(37, 99, 235, 0.46);
}

.hero-btn.ghost {
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(4px);
}

.hero-btn.ghost:hover {
  background: rgba(255, 255, 255, 0.26);
  border-color: #fff;
  transform: translateY(-3px);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.3);
}

/* Hero 底部渐变层：token 的 alpha 目前全为 0，因此这一层不画任何东西，
   边界上下都是纯背景，衔接完全无痕。保留结构是为了以后想加极轻微柔化时只改 token */
.hero-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--hero-fade-height);
  background: linear-gradient(
    to bottom,
    var(--hero-fade-from) 0%,
    var(--hero-fade-to) 50%,
    var(--hero-fade-from) 100%
  );
  pointer-events: none;
  z-index: 2;
  transition: background 0.3s ease;
}

/* ============ Hero 下方内容区（完全透明，背景图贯穿全程） ============ */
.home-body {
  position: relative;
  z-index: 4;
  background: transparent;
  padding-top: 28px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  column-gap: 26px;
  align-items: start;
}

/* 标题只占左列第 1 行：第 2 行左边是文章列表、右边是侧栏，
   因此侧栏顶部与「第一张文章卡片」的顶部精确对齐 */
.section-head {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.main-col {
  grid-column: 1;
  grid-row: 2;
  scroll-margin-top: 16px;
}

/* 第一张卡片与 Hero 视觉连续：不吃 margin-top，也不画顶边线 */
.main-col > .article-card:first-of-type {
  margin-top: 0;
  border-top-color: transparent;
}

.section-head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.more {
  font-size: 13.5px;
  color: var(--brand-dark);
}

.skeleton {
  padding: 20px;
  margin-bottom: 14px;
}

.state-box {
  padding: 34px 16px;
  text-align: center;
  margin-bottom: 14px;
}

.state-text {
  margin: 0 0 14px;
  color: var(--text-3);
}

.side-col {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: calc(var(--header-height) + 16px);
}

.side-card {
  padding: 16px;
}

.side-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  /* 深色玻璃上：标题用白色 + 阴影 */
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow);
}

/* 带图标的模块标题（标签栏） */
.side-title.has-icon {
  display: flex;
  align-items: center;
  gap: 6px;
}

.side-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.side-list li + li {
  margin-top: 4px;
}

.side-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-on-dark-2);
  text-shadow: var(--text-on-dark-shadow);
  transition: all 0.16s ease;
}

.side-link:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.side-link .count {
  font-size: 12px;
  color: var(--text-on-dark-3);
  background: rgba(255, 255, 255, 0.16);
  padding: 0 8px;
  border-radius: 999px;
}

/* 标签云：只有彩色文字，无背景块、无边框，自动换行排布（调色板在 main.css 的 --tag-c-*） */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px 16px;
}

.tag {
  display: inline-block;
  padding: 0;
  border: none;
  background: none;
  border-radius: 0;
  color: var(--tag-color, var(--brand-dark));
  text-shadow: var(--text-on-dark-shadow);
  font-size: 13.5px;
  line-height: 1.6;
  transform-origin: left center;
  will-change: transform;
  transition: transform 0.18s ease, filter 0.18s ease, text-shadow 0.18s ease;
}

/* hover：轻微放大 + 提亮变色 */
.tag:hover {
  background: none;
  transform: scale(1.1);
  filter: brightness(1.15) saturate(1.25);
  text-shadow: 0 0 10px currentColor;
}

.side-empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-on-dark-3);
  text-shadow: var(--text-on-dark-shadow);
}

/* ===== 热门文章（侧边栏，样式跟随全局主题） ===== */
.hot-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.hot-item + .hot-item {
  margin-top: 2px;
}

.hot-link {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  transition: background-color 0.16s ease;
}

.hot-link:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* 序号：高度与标题首行行框（14px × 1.5 = 21px）对齐，数字等宽 */
.hot-rank {
  flex: 0 0 21px;
  width: 21px;
  height: 21px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  color: var(--text-on-dark-3);
  font-size: 12px;
  font-weight: 600;
  line-height: 21px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.hot-rank.is-top {
  background: var(--brand);
  color: #fff;
}

.hot-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-on-dark-2);
  text-shadow: var(--text-on-dark-shadow);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.16s ease;
}

.hot-link:hover .hot-title {
  color: var(--text-on-dark-1);
}

/* 阅读数：与序号同一行框基线，右对齐 + 等宽数字，位数变化不挤压标题 */
.hot-views {
  flex: 0 0 auto;
  min-width: 26px;
  text-align: right;
  font-size: 12px;
  line-height: 21px;
  color: var(--text-on-dark-3);
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .hero-bg.animated {
    animation: none;
  }
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 单列时取消显式行列定位，避免生成隐藏的第二列 */
  .section-head,
  .main-col,
  .side-col {
    grid-column: 1;
    grid-row: auto;
  }

  .side-col {
    position: static;
  }
}

@media (max-width: 768px) {
  .hero {
    height: 45vh;
    min-height: 420px;
  }

  .hero-content {
    padding-top: calc(var(--header-height) + 8px);
  }

  .hero-title {
    font-size: 25px;
  }

  .hero-subtitle {
    font-size: 15.5px;
  }

  .hero-desc {
    display: none;
  }

  .hero-btn {
    padding: 10px 20px;
    font-size: 14.5px;
  }

  .hero-fade {
    height: 64px;
  }

  .home-body {
    padding-top: 20px;
  }

  .section-head h2 {
    font-size: 17px;
  }
}
</style>
