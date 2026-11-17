<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api'
import type { Article, Category } from '@/types'
import { formatDate } from '@/utils/format'
import { exportArticlesZip } from '@/utils/export'
import AppPagination from '@/components/AppPagination.vue'

const router = useRouter()

const loading = ref(false)
const exporting = ref(false)
const list = ref<Article[]>([])
const total = ref(0)

/** 导出全部文章为 zip（可读备份，防止只剩数据库一份副本） */
async function handleExport() {
  if (exporting.value) return
  exporting.value = true
  try {
    const result = await exportArticlesZip()
    const sizeKb = Math.max(1, Math.round(result.size / 1024))
    ElMessage.success(`已导出 ${result.count} 篇文章（${sizeKb} KB）：${result.filename}`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
  }
}
const page = ref(1)
const size = 10

const categories = ref<Category[]>([])

const filters = reactive<{
  status: '' | 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'
  categoryId: number | null
  keyword: string
}>({
  status: 'PUBLISHED',
  categoryId: null,
  keyword: ''
})

// ==================== 状态 Tabs ====================
// 一个 Tab 同时决定「看哪套数据」（active/trash）和「状态筛选」，取代原来的下拉框 + 单选组
type TabKey = 'PUBLISHED' | 'DRAFT' | 'SCHEDULED' | 'TRASH'
const activeTab = ref<TabKey>('PUBLISHED')
const counts = ref({ published: 0, draft: 0, scheduled: 0, trash: 0 })

const statusTabs = computed(() => [
  { key: 'PUBLISHED' as TabKey, label: '已发布', count: counts.value.published },
  { key: 'DRAFT' as TabKey, label: '草稿', count: counts.value.draft },
  { key: 'SCHEDULED' as TabKey, label: '定时', count: counts.value.scheduled },
  { key: 'TRASH' as TabKey, label: '回收站', count: counts.value.trash }
])

async function loadCounts() {
  try {
    const stats = await adminApi.stats()
    counts.value.published = Number(stats.publishedCount) || 0
    counts.value.draft = Number(stats.draftCount) || 0
    counts.value.scheduled = Number(stats.scheduledCount) || 0
    // 回收站数量：单独查一次（统计接口不含已删除）
    const trash = await adminApi.articleTrash({ page: 1, size: 1 })
    counts.value.trash = Number(trash.total) || 0
  } catch {
    // 数量拿不到就不显示，不影响主流程
  }
}

function switchTab(key: TabKey) {
  activeTab.value = key
  page.value = 1
  if (key === 'TRASH') {
    mode.value = 'trash'
    trashPage.value = 1
    loadTrash()
    return
  }
  mode.value = 'active'
  filters.status = key
  load()
}
const statusMap = {
  DRAFT: { label: '草稿', type: 'warning' as const },
  SCHEDULED: { label: '定时', type: 'primary' as const },
  PUBLISHED: { label: '已发布', type: 'success' as const }
}

function statusOf(status?: string) {
  return statusMap[status as 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'] || statusMap.DRAFT
}

/** 定时时间显示为服务器墙钟（后端返回 ISO，这里转一下） */
function scheduleText(value?: string | null) {
  return value ? value.replace('T', ' ').slice(0, 16) : ''
}

/** 取消定时：文章回到草稿 */
async function handleCancelSchedule(row: Article) {
  try {
    await ElMessageBox.confirm(`取消「${row.title}」的定时发布？文章会回到草稿状态。`, '取消定时', {
      type: 'warning',
      confirmButtonText: '取消定时',
      cancelButtonText: '再想想'
    })
  } catch {
    return
  }
  try {
    await adminApi.articleCancelSchedule(row.id)
    ElMessage.success('已取消定时，文章回到草稿')
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

async function load() {
  loading.value = true
  try {
    const result = await adminApi.articleList({
      page: page.value,
      size,
      status: filters.status || null,
      categoryId: filters.categoryId,
      keyword: filters.keyword.trim() || null
    })
    list.value = result.list || []
    total.value = result.total || 0
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    categories.value = await adminApi.categoryList()
  } catch {
    categories.value = []
  }
}

function handleSearch() {
  page.value = 1
  load()
}

function handleReset() {
  filters.status = 'PUBLISHED'
  activeTab.value = 'PUBLISHED'
  mode.value = 'active'
  filters.categoryId = null
  filters.keyword = ''
  page.value = 1
  load()
}

function handlePageChange(value: number) {
  page.value = value
  load()
}

function goEdit(id: number) {
  router.push({ name: 'admin-article-edit', params: { id } })
}

async function handleToggleStatus(row: Article) {
  const next: 'DRAFT' | 'PUBLISHED' = row.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED'
  const label = next === 'PUBLISHED' ? '发布' : '转为草稿'
  try {
    await ElMessageBox.confirm(`确定要把《${row.title}》${label}吗？`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminApi.articleStatus(row.id, next)
    ElMessage.success(`已${label}`)
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

async function handleDelete(row: Article) {
  try {
    await ElMessageBox.confirm(
      `确定要删除《${row.title}》吗？会先移入回收站，可以再还原。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '移入回收站', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  try {
    await adminApi.articleDelete(row.id)
    ElMessage.success('已移入回收站，可在「回收站」里还原')
    loadCounts()
    if (list.value.length === 1 && page.value > 1) page.value -= 1
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

// ==================== 回收站 ====================

const mode = ref<'active' | 'trash'>('active')
const trashLoading = ref(false)
const trashList = ref<Article[]>([])
const trashTotal = ref(0)
const trashPage = ref(1)
const trashSize = 10

async function loadTrash() {
  trashLoading.value = true
  try {
    const result = await adminApi.articleTrash({ page: trashPage.value, size: trashSize })
    trashList.value = result.list || []
    trashTotal.value = result.total || 0
  } catch {
    // 提示由 api 层处理
  } finally {
    trashLoading.value = false
  }
}


async function handleRestore(row: Article) {
  try {
    await adminApi.articleRestore(row.id)
    ElMessage.success('已从回收站还原')
    loadCounts()
    if (trashList.value.length === 1 && trashPage.value > 1) trashPage.value -= 1
    await loadTrash()
  } catch {
    // 提示由 api 层处理
  }
}

async function handlePurge(row: Article) {
  try {
    await ElMessageBox.confirm(
      `彻底删除《${row.title}》？这一步不可恢复，评论也会一起删掉。`,
      '彻底删除',
      { type: 'error', confirmButtonText: '彻底删除', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  try {
    await adminApi.articlePurge(row.id)
    ElMessage.success('已彻底删除')
    loadCounts()
    await loadTrash()
  } catch {
    // 提示由 api 层处理
  }
}

onMounted(() => {
  loadCategories()
  load()
  loadCounts()
})
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never">
      <!-- 状态 Tab：已发布 / 草稿 / 定时 / 回收站（带数量，一眼看到分布） -->
      <nav class="status-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          type="button"
          class="status-tab"
          :class="{ 'is-active': activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          <span>{{ tab.label }}</span>
          <span v-if="tab.count !== null" class="status-tab__count">{{ tab.count }}</span>
        </button>
      </nav>

      <div class="admin-toolbar">
        <el-select v-model="filters.categoryId" placeholder="全部分类" clearable style="width: 160px">
          <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>

        <el-input
          v-model="filters.keyword"
          placeholder="搜索标题或摘要"
          clearable
          style="width: 220px"
          @keyup.enter="handleSearch"
        />

        <el-button type="primary" :icon="'Search'" @click="handleSearch">查询</el-button>
        <el-button :icon="'Refresh'" @click="handleReset">重置</el-button>

        <div class="spacer" />

        <el-button :icon="'Download'" :loading="exporting" @click="handleExport">导出全部文章</el-button>
        <el-button type="primary" :icon="'Plus'" @click="router.push('/yzdcf/articles/new')">写文章</el-button>
      </div>

      <p v-if="mode === 'trash'" class="trash-tip">删除的文章会先进回收站，保留 30 天后自动清理</p>

      <template v-if="mode === 'active'">
      <el-table v-loading="loading" :data="list" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="标题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <el-link type="primary" :underline="false" @click="goEdit(row.id)">{{ row.title }}</el-link>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="120">
          <template #default="{ row }">
            <span v-if="row.category">{{ row.category.name }}</span>
            <span v-else class="muted">未分类</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="150">
          <template #default="{ row }">
            <template v-if="row.tags && row.tags.length">
              <el-tag v-for="tag in row.tags" :key="tag.id" size="small" class="tag-gap">{{ tag.name }}</el-tag>
            </template>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="150">
          <template #default="{ row }">
            <el-tag :type="statusOf(row.status).type" size="small">{{ statusOf(row.status).label }}</el-tag>
            <div v-if="row.status === 'SCHEDULED'" class="schedule-time">{{ scheduleText(row.schedulePublishTime) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="置顶" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.topped" type="danger" size="small">置顶</el-tag>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="viewCount" label="阅读量" width="90" align="center" />
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatDate(row.updatedAt || row.createdAt, true) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="215" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="goEdit(row.id)">编辑</el-button>
            <el-button v-if="row.status === 'SCHEDULED'" text type="warning" size="small" @click="handleCancelSchedule(row)">
              取消定时
            </el-button>
            <el-button v-else text type="warning" size="small" @click="handleToggleStatus(row)">
              {{ row.status === 'PUBLISHED' ? '转草稿' : '发布' }}
            </el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-text">没有找到符合条件的文章</div>
        </template>
      </el-table>

      <AppPagination :total="total" :page="page" :size="size" @change="handlePageChange" />
      </template>

      <!-- 回收站 -->
      <template v-else>
        <el-table v-loading="trashLoading" :data="trashList" stripe style="width: 100%">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column label="标题" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">{{ row.title }}</template>
          </el-table-column>
          <el-table-column label="原状态" width="110">
            <template #default="{ row }">
              <el-tag :type="statusOf(row.status).type" size="small">{{ statusOf(row.status).label }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="删除时间" width="180">
            <template #default="{ row }">{{ formatDate(row.deletedAt || row.updatedAt, true) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right" align="center">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="handleRestore(row)">还原</el-button>
              <el-button text type="danger" size="small" @click="handlePurge(row)">彻底删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-text">回收站是空的</div>
          </template>
        </el-table>

        <AppPagination
          :total="trashTotal"
          :page="trashPage"
          :size="trashSize"
          @change="(next: number) => { trashPage = next; loadTrash() }"
        />
      </template>
    </el-card>
  </div>
</template>

<style scoped>
/* ==================== 状态 Tabs ==================== */
.status-tabs {
  display: flex;
  gap: 4px;
  margin: -4px 0 16px;
  border-bottom: 1px solid var(--admin-line, #ececf0);
}

.status-tab {
  position: relative;
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 9px 14px 12px;
  font-size: 14px;
  color: var(--admin-muted, #6b7280);
  cursor: pointer;
  background: transparent;
  border: 0;
  transition: color 0.16s ease;
}

.status-tab:hover {
  color: var(--admin-fg, #111);
}

.status-tab.is-active {
  font-weight: 650;
  color: var(--admin-fg, #111);
}

.status-tab.is-active::after {
  content: '';
  position: absolute;
  right: 10px;
  bottom: -1px;
  left: 10px;
  height: 2px;
  background: currentColor;
  border-radius: 2px;
}

.status-tab__count {
  padding: 0 6px;
  font-size: 11.5px;
  font-weight: 500;
  line-height: 17px;
  color: var(--admin-muted, #6b7280);
  background: var(--admin-chip-bg, #f3f4f6);
  border-radius: 6px;
}

.trash-tip {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: var(--admin-muted, #6b7280);
}
.spacer {
  flex: 1 1 auto;
}

.tag-gap {
  margin: 0 4px 2px 0;
}

.empty-text {
  padding: 24px 0;
  color: var(--text-3);
}

@media (max-width: 768px) {
  .admin-toolbar :deep(.el-select),
  .admin-toolbar :deep(.el-input) {
    width: 100% !important;
  }

  .spacer {
    display: none;
  }
}
</style>
