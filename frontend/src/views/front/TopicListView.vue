<script setup lang="ts">
import { watch } from 'vue'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'

const site = useSiteStore()

watch(
  () => [site.siteName, site.topics.length],
  () => {
    useSeo({
      title: '专题',
      description: site.config.siteDescription,
      keywords: site.config.siteKeywords
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="page topics-page">
    <div class="container">
      <h1 class="page-title">专题</h1>
      <p class="page-subtitle">共 {{ site.topics.length }} 个专题</p>

      <div v-if="site.topics.length" class="topic-grid">
        <router-link
          v-for="item in site.topics"
          :key="item.id"
          class="card topic-card"
          :to="`/topic/${item.slug}`"
        >
          <img v-if="item.coverImage" :src="item.coverImage" :alt="item.name" class="cover" loading="lazy" />
          <div v-else class="cover placeholder">{{ item.name.slice(0, 1) }}</div>
          <div class="body">
            <span class="name">{{ item.name }}</span>
            <span class="desc">{{ item.description || '暂无描述' }}</span>
            <span class="count">共 {{ item.articleCount || 0 }} 篇</span>
          </div>
        </router-link>
      </div>
      <div v-else class="card empty">
        <p>暂无专题</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topics-page {
  padding-top: 22px;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.topic-card {
  display: flex;
  gap: 14px;
  padding: 14px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.topic-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.cover {
  width: 110px;
  height: 82px;
  flex: 0 0 110px;
  object-fit: cover;
  border-radius: 9px;
  background: var(--media-bg);
}

.cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #dbeafe, #eef2ff);
  color: var(--brand-dark);
  font-size: 26px;
  font-weight: 700;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.name {
  font-size: 16px;
  font-weight: 700;
}

.desc {
  font-size: 13.5px;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.count {
  font-size: 12.5px;
  color: var(--brand-dark);
  background: var(--brand-soft);
  border-radius: 999px;
  padding: 1px 10px;
  align-self: flex-start;
  margin-top: auto;
}

@media (max-width: 768px) {
  .topics-page {
    padding-top: 16px;
  }

  .topic-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .cover {
    width: 88px;
    height: 68px;
    flex: 0 0 88px;
  }

  .name {
    font-size: 15px;
  }

  .desc {
    font-size: 13px;
  }
}
</style>
