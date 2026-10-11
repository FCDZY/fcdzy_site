<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import { formatDate } from '@/utils/format'
import ArticleCard from '@/components/ArticleCard.vue'
import AppPagination from '@/components/AppPagination.vue'
import SiteHeader from '@/components/SiteHeader.vue'

const site = useSiteStore()
const router = useRouter()

const PAGE_SIZE = 8

const listRef = ref<HTMLElement | null>(null)
const articles = ref<Article[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

const bannerTitle = computed(() => site.config.homeBannerTitle || site.siteName)
const bannerSubtitle = computed(() => site.config.homeBannerSubtitle || site.siteSubtitle)
/** Banner 标题与站点名不同时，额外展示一行站点名 */
const showSiteName = computed(() => bannerTitle.value.trim() !== site.siteName.trim())

/** 后台可配置 Hero 背景图，未配置时使用默认深蓝渐变 */
const heroImage = computed(() => (site.config.homeHeroImage || '').trim())
const heroAnimation = computed(() => (site.config.homeHeroAnimation ?? 'true') !== 'false')
const heroBackground = computed(() =>
  heroImage.value
    ? { backgroundImage: `url("${heroImage.value}")` }
    : { backgroundImage: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 45%, #6366f1 100%)' }
)

async function loadArticles() {
  loading.value = true
  error.value = ''
  try {
    const result = await publicApi.articles({ page: page.value, size: PAGE_SIZE })
    articles.value = result.list
    total.value = result.total
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

onMounted(loadArticles)
</script>

<template>
  <div class="home">
    <!-- ===== Hero：导航栏在 Hero 内部最上方，高度 45vh ===== -->
    <section class="hero">
      <div class="hero-bg" :class="{ animated: heroAnimation }" :style="heroBackground"></div>
      <div class="hero-overlay"></div>

      <SiteHeader transparent />

      <div class="container hero-content">
        <p v-if="showSiteName" class="hero-eyebrow">{{ site.siteName }}</p>
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

      <!-- 底部 120px 渐变：透明 → #f8f9fa -->
      <div class="hero-fade" aria-hidden="true"></div>
    </section>

    <!-- ===== Hero 下方：干净浅白底色，不叠加背景图 ===== -->
    <div class="home-body">
      <div class="container">
        <div class="layout">
          <main class="main-col">
            <div ref="listRef" class="list-anchor">
              <div class="section-head">
                <h2>最新文章</h2>
                <router-link class="more" to="/articles">全部文章</router-link>
              </div>
            </div>

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
          </main>

          <aside class="side-col">
            <section class="card side-card">
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

            <section class="card side-card">
              <h3 class="side-title">标签</h3>
              <div v-if="site.tags.length" class="tag-cloud">
                <router-link v-for="item in site.tags" :key="item.id" :to="`/tag/${item.slug}`" class="tag">
                  {{ item.name }}
                </router-link>
              </div>
              <p v-else class="side-empty">暂无标签</p>
            </section>

            <section class="card side-card">
              <h3 class="side-title">专题</h3>
              <ul v-if="site.topics.length" class="topic-list">
                <li
                  v-for="item in site.topics"
                  :key="item.id"
                  class="topic-item"
                  @click="router.push(`/topic/${item.slug}`)"
                >
                  <img v-if="item.coverImage" :src="item.coverImage" :alt="item.name" class="topic-cover" loading="lazy" />
                  <div class="topic-info">
                    <span class="topic-name">{{ item.name }}</span>
                    <span class="topic-desc">{{ item.description || '暂无简介' }}</span>
                    <span class="topic-meta">共 {{ item.articleCount || 0 }} 篇 · {{ formatDate(item.createdAt) }}</span>
                  </div>
                </li>
              </ul>
              <p v-else class="side-empty">暂无专题</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home {
  /* 与 Hero 底部渐变终点色一致，保证过渡无接缝（深色模式自动跟随） */
  background: var(--page-solid);
  padding-bottom: 48px;
  transition: background-color 0.3s ease;
}

/* ============ Hero ============ */
.hero {
  position: relative;
  height: 45vh;
  min-height: 380px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: #0f172a;
  margin-bottom: 0;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transform-origin: center center;
  will-change: transform;
}

/* 缓慢呼吸缩放：25s 一个周期，最大 1.04 倍 */
.hero-bg.animated {
  animation: hero-breath 25s ease-in-out infinite;
}

@keyframes hero-breath {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.04);
  }
  100% {
    transform: scale(1);
  }
}

/* 黑色半透明遮罩：浅色 0.45，深色 0.5（保证文字可读性） */
.hero-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, var(--hero-overlay));
  pointer-events: none;
  transition: background-color 0.3s ease;
}

.hero-content {
  position: relative;
  z-index: 3;
  padding-top: var(--header-height);
  color: #fff;
}

.hero-eyebrow {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.8);
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

/* 底部渐变：透明 → 页面底色（浅色 #f8f9fa / 深色 #0f1115） */
.hero-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120px;
  background: linear-gradient(to bottom, var(--hero-fade-from) 0%, var(--page-solid) 100%);
  pointer-events: none;
  z-index: 2;
  transition: background 0.3s ease;
}

/* ============ Hero 下方内容区 ============ */
.home-body {
  position: relative;
  z-index: 4;
  background: var(--page-solid);
  padding-top: 28px;
  transition: background-color 0.3s ease;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 26px;
  align-items: start;
}

.list-anchor {
  scroll-margin-top: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
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
  color: var(--text-2);
  transition: all 0.16s ease;
}

.side-link:hover {
  background: var(--brand-soft-2);
  color: var(--brand-dark);
}

.side-link .count {
  font-size: 12px;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 0 8px;
  border-radius: 999px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  padding: 3px 11px;
  border-radius: 999px;
  background: var(--brand-soft-3);
  color: var(--brand-dark);
  font-size: 13px;
  transition: all 0.16s ease;
}

.tag:hover {
  background: var(--brand);
  color: #fff;
}

.topic-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.topic-item {
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.16s ease;
}

.topic-item:hover {
  background: var(--surface-hover);
}

.topic-cover {
  width: 62px;
  height: 46px;
  flex: 0 0 62px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--media-bg);
}

.topic-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topic-name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-desc {
  font-size: 12.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topic-meta {
  font-size: 12px;
  color: var(--text-3);
}

.side-empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
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
    height: 90px;
  }

  .section-head h2 {
    font-size: 17px;
  }
}
</style>
