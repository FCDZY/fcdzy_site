<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import TimelineList from '@/components/TimelineList.vue'
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
const searchInput = ref<HTMLInputElement | null>(null)

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

/** 当前搜索词（用于显示「搜索：xxx」并可一键清空） */
const activeKeyword = computed(() => (typeof route.query.keyword === 'string' ? route.query.keyword : ''))

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
      keyword: activeKeyword.value || null
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

function clearKeyword() {
  keyword.value = ''
  search()
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
    <div class="list-wrap">
      <!-- 页头：标题 + 篇数（编辑式，无卡片） -->
      <header class="list-head">
        <h1 class="list-title">{{ pageTitle }}</h1>
        <span class="list-count">{{ total }} 篇</span>
      </header>

      <!-- 搜索：极简下划线，不用大白框 -->
      <div class="search-line">
        <input
          ref="searchInput"
          v-model="keyword"
          class="search-input"
          type="search"
          placeholder="搜索标题或内容，回车确认"
          @keyup.enter="search"
        />
        <button class="search-btn" type="button" @click="search">搜索</button>
        <button v-if="activeKeyword" class="search-clear" type="button" @click="clearKeyword">清空</button>
      </div>

      <!-- 分类导航：纯文字 + 底部黑线表示选中 -->
      <nav class="filter-nav" aria-label="分类">
        <button
          type="button"
          class="filter-link"
          :class="{ 'is-active': !props.categorySlug && !props.tagSlug }"
          @click="chipTo('/articles')"
        >
          全部
        </button>
        <span class="filter-sep" aria-hidden="true">|</span>
        <button
          v-for="item in site.categories"
          :key="`c-${item.id}`"
          type="button"
          class="filter-link"
          :class="{ 'is-active': props.categorySlug === item.slug }"
          @click="chipTo(`/category/${item.slug}`)"
        >
          {{ item.name }}
        </button>
      </nav>

      <!-- 标签导航：同样纯文字 -->
      <nav v-if="site.tags.length" class="filter-nav filter-nav--tags" aria-label="标签">
        <button
          v-for="item in site.tags"
          :key="`t-${item.id}`"
          type="button"
          class="filter-link filter-link--tag"
          :class="{ 'is-active': props.tagSlug === item.slug }"
          @click="chipTo(`/tag/${item.slug}`)"
        >
          #{{ item.name }}
        </button>
      </nav>

      <div ref="listRef" class="list-anchor">
        <el-skeleton v-if="loading" :rows="6" animated />

        <template v-else>
          <TimelineList :articles="articles" :thumb-width="104" compact />

          <p v-if="!articles.length" class="list-empty">没有找到符合条件的文章</p>
        </template>
      </div>

      <AppPagination :total="total" :page="currentPage" :size="PAGE_SIZE" @change="changePage" />
    </div>
  </div>
</template>

<style scoped>
.list-page {
  padding: 34px 0 72px;
}

.list-wrap {
  /* 与首页完全同一套几何：内容左边缘 160、卡片 246–1162、竖线 224 */
  max-width: 1034px;
  margin-left: 144px;
  margin-right: auto;
  padding: 0 16px;
}

/* ---- 页头 ---- */
.list-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--row-title);
}

.list-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--row-title);
}

.list-count {
  font-size: 11.5px;
  letter-spacing: 1px;
  color: var(--meta-faint);
  font-variant-numeric: tabular-nums;
}

/* ---- 搜索：只有一条下划线 ---- */
.search-line {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 18px 0 10px;
  border-bottom: 1px solid var(--row-line);
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 4px 2px;
  font-size: 14px;
  color: var(--row-title);
  background: transparent;
  border: 0;
  border-bottom: 1px solid transparent;
  outline: none;
  transition: border-color 0.18s ease;
}

.search-input::placeholder {
  color: var(--meta-faint);
  letter-spacing: 0.5px;
}

.search-input:focus {
  border-bottom-color: var(--row-title);
}

.search-btn,
.search-clear {
  padding: 2px 0;
  font-size: 12.5px;
  letter-spacing: 1px;
  color: var(--meta-faint);
  cursor: pointer;
  background: none;
  border: 0;
  border-bottom: 1px solid transparent;
  transition: color 0.18s ease, border-color 0.18s ease;
}

.search-btn:hover,
.search-clear:hover {
  color: var(--row-title);
  border-bottom-color: var(--row-title);
}

/* ---- 分类 / 标签导航：纯文字 ---- */
.filter-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  align-items: center;
  padding: 14px 0 0;
}

.filter-nav--tags {
  padding-top: 10px;
}

.filter-link {
  position: relative;
  padding: 2px 0;
  font-size: 13px;
  color: var(--meta-faint);
  cursor: pointer;
  background: none;
  border: 0;
  transition: color 0.18s ease;
}

.filter-link:hover {
  color: var(--row-title);
}

/* 选中：文字加深 + 底部一条黑线（不用加粗，避免宽度跳动） */
.filter-link.is-active {
  color: var(--row-title);
}

.filter-link.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 1px;
  background: var(--row-title);
}

.filter-link--tag {
  font-size: 12.5px;
  letter-spacing: 0.4px;
}

.filter-sep {
  color: var(--row-line);
}

/* ---- 列表 ---- */
.list-anchor {
  margin-top: 6px;
}

.list-empty {
  padding: 48px 0;
  font-size: 13.5px;
  color: var(--meta-faint);
  text-align: center;
}

@media (max-width: 960px) {
  .list-wrap {
    /* 窄屏取消首页那套不对称留白 */
    max-width: none;
    margin-left: 0;
    padding: 0 18px;
  }
}

@media (max-width: 720px) {
  .list-page {
    padding: 22px 0 56px;
  }

  .list-wrap {
    padding: 0 16px;
  }

  .list-title {
    font-size: 20px;
  }

  .search-line {
    padding-top: 14px;
  }

  .filter-nav {
    gap: 6px 12px;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 4px;
  }

  .filter-link {
    flex: none;
  }
}
</style>
