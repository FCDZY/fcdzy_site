<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/api'
import type { Article, Stats } from '@/types'
import { formatDate } from '@/utils/format'

interface StatCard {
  key: keyof Stats
  label: string
  icon: string
  color: string
}

const router = useRouter()

const loading = ref(false)
const stats = ref<Stats | null>(null)
const recent = ref<Article[]>([])

const cards: StatCard[] = [
  { key: 'articleCount', label: '文章总数', icon: 'Document', color: '#3b82f6' },
  { key: 'publishedCount', label: '已发布', icon: 'Select', color: '#10b981' },
  { key: 'draftCount', label: '草稿', icon: 'EditPen', color: '#f59e0b' },
  { key: 'categoryCount', label: '分类数', icon: 'FolderOpened', color: '#6366f1' },
  { key: 'tagCount', label: '标签数', icon: 'PriceTag', color: '#ec4899' },
  { key: 'topicCount', label: '专题数', icon: 'Collection', color: '#14b8a6' },
  { key: 'totalViews', label: '总阅读量', icon: 'View', color: '#ef4444' }
]

const shortcuts = [
  { label: '写文章', path: '/admin/articles/new', icon: 'EditPen', type: 'primary' as const },
  { label: '分类管理', path: '/admin/categories', icon: 'FolderOpened', type: 'default' as const },
  { label: '标签管理', path: '/admin/tags', icon: 'PriceTag', type: 'default' as const },
  { label: '专题管理', path: '/admin/topics', icon: 'Collection', type: 'default' as const },
  { label: '站点配置', path: '/admin/settings', icon: 'Setting', type: 'default' as const }
]

const statusMap = {
  DRAFT: { label: '草稿', type: 'warning' as const },
  PUBLISHED: { label: '已发布', type: 'success' as const }
}

function statValue(key: keyof Stats): number {
  return stats.value ? stats.value[key] : 0
}

function statusOf(status?: string) {
  return statusMap[status as 'DRAFT' | 'PUBLISHED'] || statusMap.DRAFT
}

async function load() {
  loading.value = true
  try {
    const [statData, articlePage] = await Promise.all([
      adminApi.stats(),
      adminApi.articleList({ page: 1, size: 5 })
    ])
    stats.value = statData
    recent.value = articlePage.list || []
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page" v-loading="loading">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span class="head-title">数据概览</span>
          <el-button text :icon="'Refresh'" @click="load">刷新</el-button>
        </div>
      </template>

      <el-row :gutter="12">
        <el-col v-for="card in cards" :key="card.key" :xs="12" :sm="8" :md="6" class="stat-col">
          <div class="stat">
            <div class="stat-icon" :style="{ background: card.color }">
              <el-icon :size="18"><component :is="card.icon" /></el-icon>
            </div>
            <div class="stat-body">
              <div class="stat-value">{{ statValue(card.key) }}</div>
              <div class="stat-label">{{ card.label }}</div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="head">
          <span class="head-title">最近更新</span>
          <el-button text type="primary" @click="router.push('/admin/articles')">查看全部</el-button>
        </div>
      </template>

      <el-table :data="recent" stripe style="width: 100%">
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusOf(row.status).type" size="small">{{ statusOf(row.status).label }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt || row.createdAt, true) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button
              text
              type="primary"
              size="small"
              @click="router.push({ name: 'admin-article-edit', params: { id: row.id } })"
            >
              编辑
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-text">暂无文章，先去写一篇吧</div>
        </template>
      </el-table>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <span class="head-title">快捷操作</span>
      </template>
      <div class="shortcuts">
        <el-button
          v-for="item in shortcuts"
          :key="item.path"
          :type="item.type"
          :icon="item.icon"
          @click="router.push(item.path)"
        >
          {{ item.label }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head-title {
  font-weight: 600;
}

.stat-col {
  margin-bottom: 12px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-subtle);
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 10px;
  color: #fff;
}

.stat-body {
  min-width: 0;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-3);
}

.block {
  margin-top: 14px;
}

.shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.shortcuts :deep(.el-button + .el-button) {
  margin-left: 0;
}

.empty-text {
  padding: 24px 0;
  color: var(--text-3);
}
</style>
