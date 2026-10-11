<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Article } from '@/types'
import { formatDate, formatNumber } from '@/utils/format'
import { plainText } from '@/utils/text'

const props = defineProps<{
  article: Article
  showCover?: boolean
}>()

const router = useRouter()

const summary = computed(() => props.article.summary || plainText(props.article.content, 110))

function open() {
  router.push({ name: 'article', params: { slug: props.article.slug } })
}
</script>

<template>
  <article class="article-card card" @click="open">
    <div v-if="showCover !== false && article.coverImage" class="cover">
      <img :src="article.coverImage" :alt="article.title" loading="lazy" />
    </div>
    <div class="body">
      <div class="meta">
        <span v-if="article.category" class="category">{{ article.category.name }}</span>
        <span v-if="article.topped" class="topped">置顶</span>
        <span class="date">{{ formatDate(article.publishedAt || article.createdAt) }}</span>
      </div>
      <h3 class="title">{{ article.title }}</h3>
      <p class="summary">{{ summary }}</p>
      <div class="footer">
        <div class="tags">
          <span v-for="tag in (article.tags || []).slice(0, 3)" :key="tag.id" class="tag"># {{ tag.name }}</span>
        </div>
        <span class="views">{{ formatNumber(article.viewCount) }} 次阅读</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.article-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  margin-bottom: 14px;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.article-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.cover {
  flex: 0 0 180px;
  height: 116px;
  overflow: hidden;
  border-radius: 8px;
  background: #eef1f5;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.article-card:hover .cover img {
  transform: scale(1.04);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-3);
}

.category {
  color: var(--brand-dark);
  background: #eff6ff;
  padding: 1px 8px;
  border-radius: 999px;
}

.topped {
  color: #b45309;
  background: #fef3c7;
  padding: 1px 8px;
  border-radius: 999px;
}

.title {
  margin: 8px 0 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.summary {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.footer {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-3);
}

.tags {
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.tag {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .article-card {
    gap: 12px;
    padding: 12px;
  }

  .cover {
    flex: 0 0 104px;
    height: 78px;
  }

  .title {
    font-size: 15.5px;
    -webkit-line-clamp: 2;
  }

  .summary {
    -webkit-line-clamp: 2;
    font-size: 13px;
  }

  .views {
    display: none;
  }
}
</style>
