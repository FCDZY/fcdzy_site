<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { TopicDetail } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import { formatDate, formatNumber } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const site = useSiteStore()

const EMPTY: TopicDetail = { topic: { id: 0, name: '', slug: '' }, articles: [], articleIds: [] }

const loaded = ref<TopicDetail | null>(null)
const loading = ref(false)
const failed = ref(false)

const detail = computed<TopicDetail>(() => loaded.value || EMPTY)

function openArticle(slug: string) {
  router.push({ name: 'article', params: { slug } })
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
    const data = await publicApi.topic(slug)
    loaded.value = data
    useSeo({
      title: data.topic.name,
      description: data.topic.description || site.config.siteDescription,
      keywords: site.config.siteKeywords,
      image: data.topic.coverImage || undefined
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
  <div class="page topic-detail">
    <div class="container">
      <el-skeleton v-if="loading" :rows="8" animated class="skeleton card" />

      <el-result
        v-else-if="failed"
        icon="warning"
        title="专题不存在或已被删除"
        sub-title="回专题列表看看其他内容吧"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/topics')">查看全部专题</el-button>
          <el-button @click="router.push('/')">返回首页</el-button>
        </template>
      </el-result>

      <template v-else-if="loaded">
        <header class="card topic-head">
          <img
            v-if="detail.topic.coverImage"
            :src="detail.topic.coverImage"
            :alt="detail.topic.name"
            class="cover"
          />
          <div class="head-body">
            <h1 class="name">{{ detail.topic.name }}</h1>
            <p v-if="detail.topic.description" class="desc">{{ detail.topic.description }}</p>
            <p class="meta">
              共 {{ detail.articles.length || detail.topic.articleCount || 0 }} 篇文章
              <span v-if="detail.topic.createdAt"> · 创建于 {{ formatDate(detail.topic.createdAt) }}</span>
            </p>
          </div>
        </header>

        <div v-if="detail.articles.length" class="article-list card">
          <div
            v-for="(item, index) in detail.articles"
            :key="item.id"
            class="row"
            @click="openArticle(item.slug)"
          >
            <span class="index">{{ index + 1 }}</span>
            <div class="row-body">
              <span class="row-title">{{ item.title }}</span>
              <span class="row-meta">
                <span>{{ formatDate(item.publishedAt || item.createdAt) }}</span>
                <span>{{ formatNumber(item.viewCount) }} 次阅读</span>
                <span v-if="item.category" class="row-category">{{ item.category.name }}</span>
              </span>
            </div>
            <el-icon class="arrow"><ArrowRight /></el-icon>
          </div>
        </div>

        <div v-else class="card empty">
          <p>该专题下还没有文章</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.topic-detail {
  padding-top: 22px;
}

.skeleton {
  padding: 22px;
}

.topic-head {
  display: flex;
  gap: 20px;
  padding: 22px;
  margin-bottom: 18px;
}

.cover {
  width: 180px;
  height: 120px;
  flex: 0 0 180px;
  object-fit: cover;
  border-radius: 10px;
  background: #eef1f5;
}

.head-body {
  min-width: 0;
}

.name {
  margin: 0 0 8px;
  font-size: 24px;
  font-weight: 800;
}

.desc {
  margin: 0 0 10px;
  color: var(--text-2);
  font-size: 14.5px;
}

.meta {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
}

.article-list {
  padding: 6px 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.16s ease;
}

.row + .row {
  border-top: 1px solid #f1f3f5;
}

.row:hover {
  background: #f7f9fc;
}

.row:hover .row-title {
  color: var(--brand-dark);
}

.index {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: #eff6ff;
  color: var(--brand-dark);
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.16s ease;
}

.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12.5px;
  color: var(--text-3);
}

.row-category {
  color: var(--brand-dark);
}

.arrow {
  color: var(--text-3);
  flex: 0 0 auto;
}

@media (max-width: 768px) {
  .topic-detail {
    padding-top: 16px;
  }

  .topic-head {
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }

  .cover {
    width: 100%;
    height: 150px;
    flex: none;
  }

  .name {
    font-size: 19px;
  }

  .desc {
    font-size: 13.5px;
  }

  .row {
    gap: 10px;
    padding: 11px 10px;
  }

  .row-title {
    font-size: 14px;
  }

  .row-meta {
    gap: 8px;
    font-size: 12px;
  }
}
</style>
