<script setup lang="ts">
import { watch } from 'vue'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'

const site = useSiteStore()

watch(
  () => [site.siteName, site.categories.length],
  () => {
    useSeo({
      title: '分类',
      description: site.config.siteDescription,
      keywords: site.config.siteKeywords
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="page categories-page">
    <div class="container">
      <h1 class="page-title">分类</h1>
      <p class="page-subtitle">共 {{ site.categories.length }} 个分类</p>

      <div v-if="site.categories.length" class="category-grid">
        <router-link
          v-for="item in site.categories"
          :key="item.id"
          class="card category-card"
          :to="`/category/${item.slug}`"
        >
          <span class="name">{{ item.name }}</span>
          <span class="desc">{{ item.description || '暂无描述' }}</span>
          <span class="count">{{ item.articleCount || 0 }} 篇文章</span>
        </router-link>
      </div>
      <div v-else class="card empty">
        <p>暂无分类</p>
      </div>

      <section class="tags-section">
        <h2 class="block-title">标签云</h2>
        <div v-if="site.tags.length" class="card tag-cloud">
          <router-link v-for="item in site.tags" :key="item.id" class="tag" :to="`/tag/${item.slug}`">
            # {{ item.name }}
            <em>{{ item.articleCount || 0 }}</em>
          </router-link>
        </div>
        <div v-else class="card empty">
          <p>暂无标签</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.categories-page {
  padding-top: 22px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.category-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 18px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.category-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md);
}

.category-card .name {
  font-size: 16px;
  font-weight: 700;
}

.category-card .desc {
  font-size: 13.5px;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 40px;
}

.category-card .count {
  font-size: 12.5px;
  color: var(--brand-dark);
  background: var(--brand-soft);
  border-radius: 999px;
  padding: 1px 10px;
  align-self: flex-start;
}

.tags-section {
  margin-top: 30px;
}

.block-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 14px;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 18px;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 13px;
  border-radius: 999px;
  background: var(--brand-soft-3);
  color: var(--brand-dark);
  font-size: 13.5px;
  transition: all 0.16s ease;
}

.tag:hover {
  background: var(--brand);
  color: #fff;
}

.tag em {
  font-style: normal;
  font-size: 11.5px;
  opacity: 0.75;
}

@media (max-width: 768px) {
  .categories-page {
    padding-top: 16px;
  }

  .category-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .category-card {
    padding: 15px;
  }

  .block-title {
    font-size: 16.5px;
  }
}
</style>
