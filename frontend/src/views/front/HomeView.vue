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
    <section class="banner">
      <div class="container banner-inner">
        <p class="banner-eyebrow">{{ site.siteName }}</p>
        <h1 class="banner-title">{{ bannerTitle }}</h1>
        <p class="banner-subtitle">{{ bannerSubtitle }}</p>
        <p v-if="site.config.siteDescription" class="banner-desc">{{ site.config.siteDescription }}</p>
        <div class="banner-actions">
          <router-link class="btn primary" to="/articles">
            <el-icon><Reading /></el-icon>
            <span>浏览文章</span>
          </router-link>
          <router-link class="btn ghost" to="/about">
            <el-icon><User /></el-icon>
            <span>关于我</span>
          </router-link>
        </div>
      </div>
    </section>

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
</template>

<style scoped>
.home {
  padding-bottom: 48px;
}

.banner {
  background: linear-gradient(135deg, #eef4ff 0%, #f7f9fc 55%, #ffffff 100%);
  border-bottom: 1px solid var(--border);
  margin-bottom: 26px;
}

.banner-inner {
  padding-top: 48px;
  padding-bottom: 48px;
}

.banner-eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--brand-dark);
  font-weight: 600;
}

.banner-title {
  margin: 0 0 10px;
  font-size: 32px;
  line-height: 1.3;
  font-weight: 800;
}

.banner-subtitle {
  margin: 0 0 10px;
  font-size: 17px;
  color: var(--text-2);
}

.banner-desc {
  margin: 0 0 20px;
  max-width: 620px;
  color: var(--text-3);
  font-size: 14.5px;
}

.banner-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 20px;
  border-radius: 999px;
  font-size: 14.5px;
  font-weight: 600;
  transition: all 0.18s ease;
}

.btn.primary {
  background: var(--brand);
  color: #fff;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.28);
}

.btn.primary:hover {
  background: var(--brand-dark);
  transform: translateY(-1px);
}

.btn.ghost {
  background: #fff;
  color: var(--text-1);
  border: 1px solid var(--border);
}

.btn.ghost:hover {
  color: var(--brand-dark);
  border-color: #bfdbfe;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  gap: 26px;
  align-items: start;
}

.list-anchor {
  scroll-margin-top: calc(var(--header-height) + 16px);
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
  background: #f2f6ff;
  color: var(--brand-dark);
}

.side-link .count {
  font-size: 12px;
  color: var(--text-3);
  background: #f3f4f6;
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
  background: #f3f6ff;
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
  background: #f7f9fc;
}

.topic-cover {
  width: 62px;
  height: 46px;
  flex: 0 0 62px;
  object-fit: cover;
  border-radius: 8px;
  background: #eef1f5;
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

@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .side-col {
    position: static;
  }
}

@media (max-width: 768px) {
  .banner-inner {
    padding-top: 30px;
    padding-bottom: 30px;
  }

  .banner-title {
    font-size: 23px;
  }

  .banner-subtitle {
    font-size: 15px;
  }

  .section-head h2 {
    font-size: 17px;
  }
}
</style>
