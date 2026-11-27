<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { adminApi } from '@/api'
import type { Article, Stats, ViewTrend } from '@/types'
import { formatDate } from '@/utils/format'
import ReadingTrendChart from '@/components/ReadingTrendChart.vue'

/**
 * 后台仪表盘
 *
 *   上排：一张卡片里「阅读趋势（折线 + 均值线）」+「关键指标（三行等分，细线分隔）」
 *   下排：最近更新（表格）+ 内容构成（4 个数字 + 前端异常状态块），两卡等高
 *
 * 只做 UI 层，接口与数据结构不变。
 */
const router = useRouter()

const loading = ref(false)
const stats = ref<Stats | null>(null)
const recent = ref<Article[]>([])
const trend = ref<ViewTrend | null>(null)
/** 趋势天数：接口支持 ?days=N，默认 14 天（7 天太短，两个 0 会让折线很空） */
const days = ref(14)

const clientErrors = ref<Array<{ id: number; message: string; url?: string | null; createdAt: string }>>([])
const clientErrorCount = ref(0)

const statusMap = {
  DRAFT: { label: '草稿', className: 'status--draft' },
  PUBLISHED: { label: '已发布', className: 'status--published' },
  SCHEDULED: { label: '定时', className: 'status--scheduled' }
}

function statusOf(status?: string) {
  return statusMap[status as 'DRAFT' | 'PUBLISHED' | 'SCHEDULED'] || statusMap.DRAFT
}

function statValue(key: keyof Stats): number {
  return stats.value ? Number(stats.value[key]) || 0 : 0
}

/** 11-02 至 11-15 · 合计 880 次 */
const trendRange = computed(() => {
  const points = trend.value?.points || []
  if (!points.length) return ''
  return points[0].label + ' 至 ' + points[points.length - 1].label
})

const trendTotal = computed(() =>
  (trend.value?.points || []).reduce((sum, point) => sum + (Number(point.views) || 0), 0)
)

/**
 * 环比：把区间对半分，比较后一半与前一半的阅读量。
 * 用绝对值而不是百分比——数据量小时百分比会失真（前一周某天是 0 会算出 480%）。
 */
const trendDelta = computed(() => {
  const values = (trend.value?.points || []).map((point) => Number(point.views) || 0)
  if (values.length < 4) return null
  const half = Math.floor(values.length / 2)
  const prev = values.slice(0, half).reduce((a, b) => a + b, 0)
  const current = values.slice(half).reduce((a, b) => a + b, 0)
  if (prev === 0 && current === 0) return null
  return current - prev
})

/** 上排右侧：3 个关键指标（只有总阅读量带环比小字） */
const metrics = computed(() => {
  const delta = trendDelta.value
  const halfDays = Math.floor(days.value / 2)
  return [
    {
      label: '总阅读量',
      value: statValue('totalViews'),
      color: '#0ea5e9',
      sub: delta === null ? '' : (delta >= 0 ? '+' : '−') + Math.abs(delta) + ' 次较前 ' + halfDays + ' 天',
      positive: delta === null ? null : delta >= 0
    },
    { label: '总文章数', value: statValue('articleCount'), color: '#6366f1', sub: '', positive: null },
    { label: '已发布', value: statValue('publishedCount'), color: '#10b981', sub: '', positive: null }
  ]
})

/** 下排右侧：4 个数字（标签数已移除，把空间让给前端异常块） */
const miniCards = computed(() => [
  { label: '草稿', value: statValue('draftCount') },
  { label: '定时发布', value: statValue('scheduledCount') },
  { label: '分类', value: statValue('categoryCount') },
  { label: '专题', value: statValue('topicCount') }
])

async function loadTrend() {
  try {
    trend.value = await adminApi.viewTrend(days.value)
  } catch {
    trend.value = null
  }
}

async function changeDays(next: number) {
  if (days.value === next) return
  days.value = next
  await loadTrend()
}

async function load() {
  loading.value = true
  try {
    const [statData, articlePage, trendData, errorCount, errorList] = await Promise.all([
      adminApi.stats(),
      adminApi.articleList({ page: 1, size: 5 }),
      adminApi.viewTrend(days.value),
      adminApi.clientErrorCount().catch(() => 0),
      adminApi.clientErrors(5).catch(() => [])
    ])
    stats.value = statData
    recent.value = articlePage.list || []
    trend.value = trendData
    clientErrorCount.value = Number(errorCount) || 0
    clientErrors.value = errorList || []
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

/** 清空全部前端错误记录（危险动作，先确认） */
async function clearClientErrors() {
  try {
    await ElMessageBox.confirm(
      '会删除所有前端错误记录（包括还没看的），删掉就找不回来了。',
      '清空全部错误？',
      { type: 'warning', confirmButtonText: '清空', cancelButtonText: '算了' }
    )
  } catch {
    return
  }
  try {
    await adminApi.clearClientErrors()
    clientErrors.value = []
    clientErrorCount.value = 0
    ElMessage.success('已清空前端错误记录')
  } catch {
    // 提示由 api 层处理
  }
}

/** 只清理「发版后旧页面去要已删除分包」这类噪音 */
async function clearNoise() {
  try {
    const removed = await adminApi.clearClientErrorNoise()
    ElMessage.success(removed > 0 ? `已清理 ${removed} 条过期分包噪音` : '没有可清理的过期分包记录')
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="admin-page dashboard">
    <!-- 上排：趋势 + 指标合成一张卡 -->
    <section class="panel overview">
      <div class="overview-main">
        <header class="panel-head">
          <h2 class="panel-title">阅读趋势</h2>
          <div class="head-right">
            <span v-if="trendRange" class="head-meta">{{ trendRange }} · 合计 {{ trendTotal }} 次</span>
            <div class="days-switch">
              <button
                v-for="option in [7, 14, 30]"
                :key="option"
                type="button"
                class="days-btn"
                :class="{ 'is-on': days === option }"
                @click="changeDays(option)"
              >
                {{ option }} 天
              </button>
            </div>
          </div>
        </header>
        <ReadingTrendChart :trend="trend" :loading="loading" />
      </div>

      <aside class="overview-metrics">
        <header class="panel-head">
          <h2 class="panel-title">关键指标</h2>
          <el-button text :icon="'Refresh'" @click="load">刷新</el-button>
        </header>
        <div class="metrics">
          <div v-for="item in metrics" :key="item.label" class="metric-row">
            <div class="metric-left">
              <span class="metric-dot" :style="{ background: item.color }" />
              <span class="metric-label">{{ item.label }}</span>
            </div>
            <div class="metric-right">
              <span class="metric-value">{{ item.value }}</span>
              <span
                v-if="item.sub"
                class="metric-sub"
                :class="{ 'is-up': item.positive === true, 'is-down': item.positive === false }"
                >{{ item.sub }}</span
              >
            </div>
          </div>
        </div>
      </aside>
    </section>

    <!-- 下排：最近更新 + 内容构成（等高） -->
    <div class="bottom-row">
      <section class="panel recent-panel">
        <header class="panel-head">
          <h2 class="panel-title">最近更新</h2>
          <el-button text type="primary" @click="router.push('/yzdcf/articles')">查看全部</el-button>
        </header>

        <el-table :data="recent" class="recent-table" style="width: 100%">
          <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <span class="status" :class="statusOf(row.status).className">{{ statusOf(row.status).label }}</span>
            </template>
          </el-table-column>
          <el-table-column label="更新时间" width="150">
            <template #default="{ row }">{{ formatDate(row.updatedAt || row.createdAt, true) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="router.push(`/yzdcf/articles/${row.id}/edit`)">
                编辑
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section class="panel side-panel">
        <header class="panel-head">
          <h2 class="panel-title">内容构成</h2>
        </header>

        <div class="mini-grid">
          <div v-for="item in miniCards" :key="item.label" class="mini-card">
            <span class="mini-label">{{ item.label }}</span>
            <span class="mini-value">{{ item.value }}</span>
          </div>
        </div>

        <!-- 前端异常：正常只显示状态，有错误时展开明细 -->
        <div class="error-block">
          <div class="error-head">
            <span class="error-dot" :class="{ 'is-bad': clientErrorCount > 0 }" />
            <span class="error-title">前端异常</span>
            <span class="error-count">
              {{ clientErrorCount > 0 ? `近 24 小时 ${clientErrorCount} 条` : '近 24 小时 0 条' }}
            </span>
            <!-- 有历史记录但都超过 24 小时时，按钮也要出来，否则清不掉 -->
            <div v-if="clientErrorCount > 0 || clientErrors.length" class="error-actions">
              <el-button text size="small" @click="clearNoise">清理噪音</el-button>
              <el-button text type="danger" size="small" @click="clearClientErrors">清空</el-button>
            </div>
          </div>
          <p v-if="!clientErrors.length" class="error-hint">
            最近没有前端报错。用户端出错时，这里会记录错误信息与出错页面。
          </p>
          <details v-else class="error-details">
            <summary>查看明细</summary>
            <ul class="error-list">
              <li v-for="item in clientErrors" :key="item.id" class="error-item">
                <div class="error-msg">{{ item.message }}</div>
                <div class="error-meta">
                  <span v-if="item.url">{{ item.url }}</span>
                  <span>{{ formatDate(item.createdAt, true) }}</span>
                </div>
              </li>
            </ul>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 上排：趋势 + 指标 ==================== */
.overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 262px;
  column-gap: 26px;
  padding: 22px 26px 20px;
}

.overview-main {
  min-width: 0;
}

/* 右侧指标：与图表等高，用虚线分隔 */
.overview-metrics {
  display: flex;
  flex-direction: column;
  padding-left: 24px;
  border-left: 1px dashed var(--admin-line-soft);
}

.head-right {
  display: flex;
  gap: 14px;
  align-items: center;
}

.head-meta {
  font-size: 12px;
  color: var(--admin-faint);
  white-space: nowrap;
}

/* 天数切换 */
.days-switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--admin-chip-bg);
  border-radius: 8px;
}

.days-btn {
  padding: 3px 10px;
  font-size: 12px;
  color: var(--admin-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.days-btn.is-on {
  font-weight: 600;
  color: var(--admin-fg);
  background: var(--admin-card-bg);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
}

/* 三行等分 + 极浅细分隔线 */
.metrics {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.metric-row {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--admin-line-soft);
}

.metric-row:last-child {
  border-bottom: 0;
}

.metric-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.metric-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
}

.metric-label {
  font-size: 12.5px;
  color: var(--admin-muted);
  white-space: nowrap;
}

.metric-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.metric-value {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: var(--admin-fg);
}

.metric-sub {
  margin-top: 2px;
  font-size: 11px;
  color: var(--admin-faint);
  white-space: nowrap;
}

.metric-sub.is-up {
  font-weight: 600;
  color: #10b981;
}

.metric-sub.is-down {
  font-weight: 600;
  color: #ef4444;
}

/* ==================== 下排：两卡等高 ==================== */
.bottom-row {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 18px;
  margin-top: 18px;
  align-items: stretch;
}

.panel-head {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
  /* 标题行左右内缩，和表格首列 / 卡片内文字对齐（原来贴着边框） */
  padding: 0 12px 12px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--admin-muted);
}

/* 图表面板头部：右边要放区间文案和切换，别让它缩 */
.overview .panel-head {
  padding: 0 0 10px;
}

.recent-panel,
.side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.recent-table {
  --el-table-border-color: transparent;
}

/* 内容构成：4 个数字 2×2 */
.mini-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 0 12px;
}

/* 一行一个：标签在左、数字在右，卡片变矮，把高度让给下面的前端异常块 */
.mini-card {
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 13px 16px;
  background: var(--admin-main-bg);
  border: 1px solid var(--admin-line);
  border-radius: 12px;
}

.mini-label {
  font-size: 12.5px;
  color: var(--admin-muted);
}

.mini-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: var(--admin-fg);
}

/* 前端异常：吃掉下排剩余高度（数字卡变矮后这里更宽敞） */
.error-block {
  flex: 1;
  margin: 12px 12px 0;
  padding: 14px 16px;
  background: var(--admin-main-bg);
  border: 1px solid var(--admin-line);
  border-radius: 12px;
}

.error-head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.error-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: #10b981;
}

.error-dot.is-bad {
  background: #ef4444;
}

.error-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--admin-fg);
}

.error-count {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--admin-faint);
}

.error-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.error-hint {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--admin-faint);
}

.error-details {
  margin-top: 8px;
}

.error-details summary {
  font-size: 12px;
  color: var(--admin-muted);
  cursor: pointer;
}

.error-list {
  max-height: 180px;
  margin: 8px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.error-item {
  padding: 7px 0;
  border-bottom: 1px dashed var(--admin-line);
}

.error-item:last-child {
  border-bottom: none;
}

.error-msg {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--admin-fg);
  word-break: break-word;
}

.error-meta {
  display: flex;
  gap: 10px;
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--admin-faint);
}

/* 状态标签 */
.status {
  display: inline-block;
  padding: 1px 9px;
  font-size: 11.5px;
  border-radius: 999px;
}

.status--published {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.status--draft {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.status--scheduled {
  color: #0ea5e9;
  background: rgba(14, 165, 233, 0.1);
}

/* ==================== 响应式 ==================== */
/* 窄屏：指标从右侧移到图表下方（仍是同一张卡，横排三列） */
@media (max-width: 1280px) {
  .overview {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 18px;
  }

  .overview-metrics {
    padding: 18px 0 0;
    border-top: 1px dashed var(--admin-line-soft);
    border-left: 0;
  }

  .metrics {
    flex-direction: row;
  }

  .metric-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 0 18px;
    border-right: 1px solid var(--admin-line-soft);
    border-bottom: 0;
  }

  .metric-row:first-child {
    padding-left: 0;
  }

  .metric-row:last-child {
    border-right: 0;
  }

  .metric-right {
    align-items: flex-start;
  }
}

@media (max-width: 1024px) {
  .bottom-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
