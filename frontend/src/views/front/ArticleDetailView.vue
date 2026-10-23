<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSeo } from '@/composables/useSeo'
import { formatDate, formatNumber } from '@/utils/format'
import MarkdownBody from '@/components/MarkdownBody.vue'
import ArticleComments from '@/components/ArticleComments.vue'
import ReadingProgress from '@/components/ReadingProgress.vue'

const route = useRoute()
const router = useRouter()

/** 占位对象，仅用于模板类型收窄，不会在成功前渲染 */
const PLACEHOLDER: Article = { id: 0, title: '', slug: '' }

const loaded = ref<Article | null>(null)
const loading = ref(false)
const failed = ref(false)

const article = computed<Article>(() => loaded.value || PLACEHOLDER)
const publishDate = computed(() => formatDate(article.value.publishedAt || article.value.createdAt))

function openArticle(slug: string) {
  router.push({ name: 'article', params: { slug } })
}

/** 封面加载失败（防盗链 403 / 外链失效）时直接隐藏，不留破图 */
const coverFailed = ref(false)

function openTopic(slug: string) {
  router.push({ name: 'topic', params: { slug } })
}

/** 直达评论区：平滑滚动（系统开启「减少动态效果」时直接跳转） */
function scrollToComments() {
  const el = document.getElementById('comments')
  if (!el) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
}

async function load(slug: string) {
  if (!slug) {
    failed.value = true
    return
  }
  loading.value = true
  failed.value = false
  loaded.value = null
  try {
    const data = await publicApi.article(slug)
    coverFailed.value = false
    loaded.value = data
    useSeo({
      title: data.title,
      description: data.summary || undefined,
      keywords: (data.tags || []).map((tag) => tag.name).join(','),
      image: data.coverImage || undefined,
      type: 'article'
    })
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

watch(
  () => route.params.slug,
  (slug) => {
    load(typeof slug === 'string' ? slug : '')
  },
  { immediate: true }
)
</script>

<template>
  <div class="page detail-page">
    <!-- 顶部阅读进度条：只在文章详情页挂载，随路由切换自动卸载 -->
    <ReadingProgress v-if="loaded" />
    <div class="container">
      <el-skeleton v-if="loading" :rows="10" animated class="skeleton card" />

      <el-result
        v-else-if="failed"
        icon="warning"
        title="文章不存在或已被删除"
        sub-title="换个关键词，或者回首页看看其他内容吧"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/')">返回首页</el-button>
          <el-button @click="router.push('/articles')">浏览文章</el-button>
        </template>
      </el-result>

      <template v-else-if="loaded">
        <article class="card article">
          <header class="head">
            <h1 class="title">{{ article.title }}</h1>
            <div class="meta">
              <span v-if="article.topped" class="badge topped">置顶</span>
              <span class="meta-item">
                <el-icon><Calendar /></el-icon>
                {{ publishDate }}
              </span>
              <span class="meta-item">
                <el-icon><View /></el-icon>
                {{ formatNumber(article.viewCount) }} 次阅读
              </span>
              <router-link v-if="article.category" class="badge category" :to="`/category/${article.category.slug}`">
                {{ article.category.name }}
              </router-link>
              <button type="button" class="jump-comments" @click="scrollToComments">
                <el-icon :size="14"><ChatDotRound /></el-icon>
                <span>直达评论</span>
              </button>
            </div>
            <div v-if="article.tags && article.tags.length" class="tags">
              <router-link v-for="tag in article.tags" :key="tag.id" class="tag" :to="`/tag/${tag.slug}`">
                # {{ tag.name }}
              </router-link>
            </div>
            <img
              v-if="article.coverImage && !coverFailed"
              :src="article.coverImage"
              :alt="article.title"
              class="cover"
              @error="coverFailed = true"
            />
            <p v-if="article.summary" class="summary">{{ article.summary }}</p>
          </header>

          <MarkdownBody :content="article.content" show-toc />
        </article>

        <!-- 评论区：访客免登录，新评论需站长审核后展示 -->
        <ArticleComments :slug="article.slug" />

        <nav v-if="article.prev || article.next" class="nav-grid">
          <div v-if="article.prev" class="card nav-card" @click="openArticle(article.prev.slug)">
            <span class="nav-label">上一篇</span>
            <span class="nav-title">{{ article.prev.title }}</span>
          </div>
          <div v-else class="nav-placeholder"></div>
          <div v-if="article.next" class="card nav-card next" @click="openArticle(article.next.slug)">
            <span class="nav-label">下一篇</span>
            <span class="nav-title">{{ article.next.title }}</span>
          </div>
        </nav>

        <section v-if="article.topics && article.topics.length" class="topics">
          <h2 class="block-title">所属专题</h2>
          <div class="topic-grid">
            <div
              v-for="topic in article.topics"
              :key="topic.id"
              class="card topic-card"
              @click="openTopic(topic.slug)"
            >
              <img v-if="topic.coverImage" :src="topic.coverImage" :alt="topic.name" class="topic-cover" loading="lazy" />
              <div class="topic-body">
                <span class="topic-name">{{ topic.name }}</span>
                <span class="topic-desc">{{ topic.description || '暂无简介' }}</span>
                <span class="topic-count">共 {{ topic.articleCount || 0 }} 篇</span>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  padding-top: 22px;
}

.skeleton {
  padding: 22px;
}

/* 长文阅读容器：用更实的底（列表/侧栏仍是 0.18 的毛玻璃），保证正文长时间阅读清晰 */
.article {
  padding: 26px 28px 30px;
  background: var(--surface-reading);
}

.head {
  margin-bottom: 22px;
}

.title {
  margin: 0 0 12px;
  font-size: 26px;
  line-height: 1.4;
  font-weight: 800;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-3);
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.badge {
  padding: 1px 10px;
  border-radius: 999px;
  font-size: 12.5px;
}

.badge.topped {
  color: var(--warn-text);
  background: var(--warn-soft);
}

.badge.category {
  color: var(--brand-dark);
  background: var(--brand-soft);
}

/* 标题下方「直达评论」按钮：轻量胶囊，和阅读卡的浅色底相配 */
.jump-comments {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 11px;
  border-radius: 999px;
  border: 1px solid var(--chip-border-hover);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.8;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease,
    transform 0.16s ease;
}

.jump-comments:hover {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
  transform: translateY(-1px);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.tag {
  padding: 2px 11px;
  border-radius: 999px;
  background: var(--brand-soft-3);
  color: var(--brand-dark);
  font-size: 13px;
}

.tag:hover {
  background: var(--brand);
  color: #fff;
}

.cover {
  display: block;
  width: 100%;
  max-height: 380px;
  object-fit: cover;
  border-radius: 10px;
  margin: 18px 0 4px;
  background: var(--media-bg);
}

.summary {
  margin: 16px 0 0;
  padding: 12px 16px;
  border-left: 3px solid var(--brand);
  background: var(--surface-hover);
  border-radius: 0 8px 8px 0;
  color: var(--text-2);
  font-size: 14.5px;
}

.nav-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.nav-card {
  padding: 14px 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.nav-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.nav-card.next {
  text-align: right;
}

.nav-label {
  font-size: 12.5px;
  color: var(--text-3);
}

.nav-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-1);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topics {
  margin-top: 26px;
}

.block-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 14px;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.topic-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.topic-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.topic-cover {
  width: 84px;
  height: 62px;
  flex: 0 0 84px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--media-bg);
}

.topic-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.topic-name {
  font-size: 14.5px;
  font-weight: 600;
}

.topic-desc {
  font-size: 12.5px;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topic-count {
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 768px) {
  .detail-page {
    padding-top: 16px;
  }

  .article {
    padding: 18px 15px 22px;
  }

  .title {
    font-size: 20px;
  }

  .cover {
    max-height: none;
    margin-top: 14px;
  }

  .nav-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .nav-card.next {
    text-align: left;
  }

  .nav-placeholder {
    display: none;
  }

  .block-title {
    font-size: 16.5px;
  }
}
</style>
