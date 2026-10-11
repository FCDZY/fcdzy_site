<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi } from '@/api'
import type { Article, Category } from '@/types'
import { formatDate } from '@/utils/format'
import AppPagination from '@/components/AppPagination.vue'

const router = useRouter()

const loading = ref(false)
const list = ref<Article[]>([])
const total = ref(0)
const page = ref(1)
const size = 10

const categories = ref<Category[]>([])

const filters = reactive<{
  status: '' | 'DRAFT' | 'PUBLISHED'
  categoryId: number | null
  keyword: string
}>({
  status: '',
  categoryId: null,
  keyword: ''
})

const statusMap = {
  DRAFT: { label: '草稿', type: 'warning' as const },
  PUBLISHED: { label: '已发布', type: 'success' as const }
}

function statusOf(status?: string) {
  return statusMap[status as 'DRAFT' | 'PUBLISHED'] || statusMap.DRAFT
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
  filters.status = ''
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
    await ElMessageBox.confirm(`确定要删除《${row.title}》吗？删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger'
    })
  } catch {
    return
  }
  try {
    await adminApi.articleDelete(row.id)
    ElMessage.success('删除成功')
    if (list.value.length === 1 && page.value > 1) page.value -= 1
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

onMounted(() => {
  loadCategories()
  load()
})
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never">
      <div class="admin-toolbar">
        <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 140px">
          <el-option label="全部状态" value="" />
          <el-option label="草稿" value="DRAFT" />
          <el-option label="已发布" value="PUBLISHED" />
        </el-select>

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

        <el-button type="primary" :icon="'Plus'" @click="router.push('/admin/articles/new')">写文章</el-button>
      </div>

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
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusOf(row.status).type" size="small">{{ statusOf(row.status).label }}</el-tag>
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
        <el-table-column label="操作" width="170" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="goEdit(row.id)">编辑</el-button>
            <el-button text type="warning" size="small" @click="handleToggleStatus(row)">
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
    </el-card>
  </div>
</template>

<style scoped>
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
