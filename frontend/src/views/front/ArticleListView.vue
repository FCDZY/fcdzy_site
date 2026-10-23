<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import ArticleCard from '@/components/ArticleCard.vue'
import AppPagination from '@/components/AppPagination.vue'

const props = defineProps<{
  categorySlug?: string
  tagSlug?: string
}>()

const site = useSiteStore()
const route = useRoute()
const router = useRouter()

const PAGE_SIZE = 10

const listRef = ref<HTMLElement | null>(null)
const articles = ref<Article[]>([])
const total = ref(0)
const loading = ref(false)
const keyword = ref('')

const currentPage = computed(() => {
  const raw = Number(route.query.page)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1
})

const activeCategory = computed(() => site.categoryBySlug(props.categorySlug))
const activeTag = computed(() => site.tagBySlug(props.tagSlug))

const pageTitle = computed(() => {
  if (props.categorySlug) return `分类：${activeCategory.value?.name || props.categorySlug}`
  if (props.tagSlug) return `标签：${activeTag.value?.name || props.tagSlug}`
  return '全部文章'
})

function scrollToList() {
  const el = listRef.value
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

async function load() {
  loading.value = true
  try {
    const result = await publicApi.articles({
      page: currentPage.value,
      size: PAGE_SIZE,
      categoryId: activeCategory.value?.id ?? null,
      tagId: activeTag.value?.id ?? null,
      keyword: typeof route.query.keyword === 'string' && route.query.keyword ? route.query.keyword : null
    })
    articles.value = result.list
    total.value = result.total
  } catch {
    articles.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function changePage(next: number) {
  router.push({ query: { ...route.query, page: String(next) } })
  scrollToList()
}

function search() {
  const value = keyword.value.trim()
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (value) {
    query.keyword = value
  } else {
    delete query.keyword
  }
  delete query.page
  router.push({ query })
}

function chipTo(to: string) {
  router.push(to)
}

watch(
  () => [route.query.page, route.query.keyword, props.categorySlug, props.tagSlug],
  () => {
    keyword.value = typeof route.query.keyword === 'string' ? route.query.keyword : ''
    load()
  },
  { immediate: true }
)

watch(
  () => [site.categories.length, site.tags.length],
  () => {
    if ((props.categorySlug || props.tagSlug) && !articles.value.length && !loading.value) {
      load()
    }
  }
)

watch(
  () => pageTitle.value,
  (title) => {
    useSeo({ title, description: site.config.siteDescription, keywords: site.config.siteKeywords })
  },
  { immediate: true }
)
</script>

<template>
  <div class="page list-page">
    <div class="container">
      <header class="head">
        <h1 class="page-title">{{ pageTitle }}</h1>
        <p class="page-subtitle">共 {{ total }} 篇文章</p>
      </header>

      <div class="card search-bar">
        <el-input
          v-model="keyword"
          placeholder="搜索文章标题或内容"
          clearable
          @keyup.enter="search"
          @clear="search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" @click="search">搜索</el-button>
      </div>

      <div class="chips">
        <button type="button" class="chip" :class="{ active: !props.categorySlug && !props.tagSlug }" @click="chipTo('/articles')">
          全部
        </button>
        <button
          v-for="item in site.categories"
          :key="`c-${item.id}`"
          type="button"
          class="chip"
          :class="{ active: props.categorySlug === item.slug }"
          @click="chipTo(`/category/${item.slug}`)"
        >
          {{ item.name }}
        </button>
      </div>

      <div class="chips">
        <button
          v-for="item in site.tags"
          :key="`t-${item.id}`"
          type="button"
          class="chip tag-chip"
          :class="{ active: props.tagSlug === item.slug }"
          @click="chipTo(`/tag/${item.slug}`)"
        >
          # {{ item.name }}
        </button>
        <span v-if="!site.tags.length" class="chips-empty">暂无标签</span>
      </div>

      <div ref="listRef" class="list-anchor">
        <el-skeleton v-if="loading" :rows="6" animated class="skeleton card" />

        <template v-else>
          <ArticleCard v-for="item in articles" :key="item.id" :article="item" />

          <div v-if="!articles.length" class="card empty">
            <p>没有找到符合条件的文章</p>
          </div>
        </template>
      </div>

      <AppPagination :total="total" :page="currentPage" :size="PAGE_SIZE" @change="changePage" />
    </div>
  </div>
</template>

<style scoped>
.list-page {
  padding-top: 22px;
}

.head {
  margin-bottom: 16px;
}

.search-bar {
  display: flex;
  gap: 10px;
  padding: 14px;
  margin-bottom: 14px;
}

.search-bar :deep(.el-input) {
  flex: 1;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.chip {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--text-2);
  font-size: 13.5px;
  cursor: pointer;
  transition: all 0.16s ease;
}

.chip:hover {
  color: var(--brand-dark);
  border-color: var(--chip-border-hover);
  background: var(--brand-soft-2);
}

.chip.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.tag-chip {
  font-size: 13px;
}

.chips-empty {
  font-size: 13px;
  color: var(--text-3);
}

.list-anchor {
  margin-top: 14px;
  scroll-margin-top: calc(var(--header-height) + 16px);
}

.skeleton {
  padding: 20px;
}

@media (max-width: 768px) {
  .list-page {
    padding-top: 16px;
  }

  .search-bar {
    padding: 12px;
    flex-wrap: wrap;
  }

  .search-bar :deep(.el-button) {
    width: 100%;
  }

  .chip {
    padding: 4px 11px;
    font-size: 12.5px;
  }
}
</style>
