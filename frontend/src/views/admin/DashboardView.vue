<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi } from '@/api'
import type { Article, Stats, ViewTrend } from '@/types'
import { formatDate } from '@/utils/format'
import ReadingTrendChart from '@/components/ReadingTrendChart.vue'

/**
 * 后台仪表盘：数据概览（7 张主题色统计卡）+ 近 7 天阅读趋势 + 最近更新 + 快捷操作。
 * 只做 UI 层重构，菜单结构与页面功能保持不变。
 */
interface StatCard {
  key: keyof Stats
  label: string
  icon: string
  /** 主色：顶部色条 / 图标 / 数字 */
  color: string
  /** 卡片底色微渐变（同主色的极低透明度） */
  tint: string
}

const router = useRouter()

const loading = ref(false)
const stats = ref<Stats | null>(null)
const recent = ref<Article[]>([])
const trend = ref<ViewTrend | null>(null)

const cards: StatCard[] = [
  { key: 'articleCount', label: '文章总数', icon: 'Document', color: '#3b82f6', tint: 'rgba(59,130,246,.10)' },
  { key: 'publishedCount', label: '已发布', icon: 'Select', color: '#10b981', tint: 'rgba(16,185,129,.10)' },
  { key: 'draftCount', label: '草稿', icon: 'EditPen', color: '#f59e0b', tint: 'rgba(245,158,11,.12)' },
  { key: 'scheduledCount', label: '定时发布', icon: 'Clock', color: '#0ea5e9', tint: 'rgba(14,165,233,.10)' },
  { key: 'categoryCount', label: '分类数', icon: 'FolderOpened', color: '#6366f1', tint: 'rgba(99,102,241,.10)' },
  { key: 'tagCount', label: '标签数', icon: 'PriceTag', color: '#ec4899', tint: 'rgba(236,72,153,.10)' },
  { key: 'topicCount', label: '专题数', icon: 'Collection', color: '#14b8a6', tint: 'rgba(20,184,166,.10)' },
  { key: 'totalViews', label: '总阅读量', icon: 'View', color: '#ef4444', tint: 'rgba(239,68,68,.10)' }
]

const shortcuts = [
  { label: '写文章', path: '/admin/articles/new', icon: 'EditPen', primary: true },
  { label: '分类管理', path: '/admin/categories', icon: 'FolderOpened', primary: false },
  { label: '标签管理', path: '/admin/tags', icon: 'PriceTag', primary: false },
  { label: '专题管理', path: '/admin/topics', icon: 'Collection', primary: false },
  { label: '站点配置', path: '/admin/settings', icon: 'Setting', primary: false }
]

const statusMap = {
  DRAFT: { label: '草稿', className: 'status--draft' },
  PUBLISHED: { label: '已发布', className: 'status--published' }
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
    const [statData, articlePage, trendData] = await Promise.all([
      adminApi.stats(),
      adminApi.articleList({ page: 1, size: 5 }),
      adminApi.viewTrend(7)
    ])
    stats.value = statData
    recent.value = articlePage.list || []
    trend.value = trendData
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="admin-page dashboard">
    <!-- 数据概览：7 张主题色统计卡 -->
    <section class="panel">
      <header class="panel-head">
        <h2 class="panel-title">数据概览</h2>
        <el-button text :icon="'Refresh'" @click="load">刷新</el-button>
      </header>

      <div class="stat-grid">
        <article
          v-for="card in cards"
          :key="card.key"
          class="stat"
          :style="{ '--accent': card.color, '--tint': card.tint }"
        >
          <span class="stat-accent" aria-hidden="true" />
          <span class="stat-icon">
            <el-icon :size="16"><component :is="card.icon" /></el-icon>
          </span>
          <div class="stat-value">{{ statValue(card.key) }}</div>
          <div class="stat-label">{{ card.label }}</div>
        </article>
      </div>
    </section>

    <!-- 近 7 天阅读趋势 -->
    <section class="panel">
      <ReadingTrendChart :trend="trend" :loading="loading" />
    </section>

    <!-- 最近更新 -->
    <section class="panel">
      <header class="panel-head">
        <h2 class="panel-title">最近更新</h2>
        <el-button text type="primary" @click="router.push('/admin/articles')">查看全部</el-button>
      </header>

      <el-table :data="recent" stripe class="recent-table" style="width: 100%">
        <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <span class="status" :class="statusOf(row.status).className">{{ statusOf(row.status).label }}</span>
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
    </section>

    <!-- 快捷操作 -->
    <section class="panel">
      <header class="panel-head">
        <h2 class="panel-title">快捷操作</h2>
      </header>
      <div class="shortcuts">
        <el-button
          v-for="item in shortcuts"
          :key="item.path"
          :type="item.primary ? 'primary' : 'default'"
          :plain="!item.primary"
          :icon="item.icon"
          :class="{ 'is-primary': item.primary }"
          @click="router.push(item.path)"
        >
          {{ item.label }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 面板 ===== */
.panel {
  padding: 16px 18px 18px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
}

/* ===== 统计卡 ===== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  gap: 12px;
}

.stat {
  position: relative;
  padding: 15px 14px 13px;
  border-radius: 8px;
  overflow: hidden;
  /* 极淡主题色渐变打底，避免「纯白死板」 */
  background: linear-gradient(180deg, var(--tint) 0%, var(--card) 72%);
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 4px 12px rgba(16, 24, 40, 0.04);
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.stat:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  box-shadow: 0 2px 4px rgba(16, 24, 40, 0.08), 0 10px 22px rgba(16, 24, 40, 0.08);
}

/* 顶部主题色细条 */
.stat-accent {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent);
  opacity: 0.85;
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--accent);
  background: var(--tint);
}

.stat-value {
  margin-top: 10px;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.5px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--text-3);
}

/* ===== 最近更新表格：弱化表头、极淡斑马纹 ===== */
.recent-table :deep(.el-table__header-wrapper th.el-table__cell) {
  background: transparent;
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
  font-weight: 600;
}

.recent-table :deep(.el-table__cell) {
  border-bottom-color: transparent;
}

.recent-table :deep(.el-table__row--striped td.el-table__cell) {
  background: rgba(16, 24, 40, 0.022);
}

.recent-table :deep(.el-table__body tr:hover > td.el-table__cell) {
  background: rgba(59, 130, 246, 0.06);
}

html.dark .recent-table :deep(.el-table__row--striped td.el-table__cell) {
  background: rgba(255, 255, 255, 0.028);
}

html.dark .recent-table :deep(.el-table__body tr:hover > td.el-table__cell) {
  background: rgba(96, 165, 250, 0.1);
}

/* 状态小标签：圆角胶囊 + 已发布绿 / 草稿橙 */
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.7;
}

.status::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.status--published {
  color: #047857;
  background: rgba(16, 185, 129, 0.14);
}

.status--draft {
  color: #b45309;
  background: rgba(245, 158, 11, 0.16);
}

html.dark .status--published {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.2);
}

html.dark .status--draft {
  color: #fcd34d;
  background: rgba(245, 158, 11, 0.2);
}

/* ===== 快捷操作 ===== */
.shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.shortcuts :deep(.el-button + .el-button) {
  margin-left: 0;
}

.shortcuts :deep(.el-button.is-primary) {
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.28);
}

.empty-text {
  padding: 24px 0;
  color: var(--text-3);
}

@media (max-width: 768px) {
  .panel {
    padding: 14px;
  }

  .stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stat-value {
    font-size: 24px;
  }
}
</style>
