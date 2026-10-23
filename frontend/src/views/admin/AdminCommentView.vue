<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { adminApi } from '@/api'
import type { AdminComment } from '@/types'

/**
 * 后台评论管理：按状态/关键词筛选，通过审核或删除（楼中楼连同回复一起删）。
 */
const router = useRouter()

const PAGE_SIZE = 10
const loading = ref(false)
const list = ref<AdminComment[]>([])
const total = ref(0)
const page = ref(1)
const pendingCount = ref(0)

const query = reactive({
  status: 'PENDING' as 'PENDING' | 'APPROVED' | 'ALL',
  keyword: ''
})

const STATUS_OPTIONS = [
  { label: '待审核', value: 'PENDING' },
  { label: '已通过', value: 'APPROVED' },
  { label: '全部', value: 'ALL' }
]

async function loadPendingCount() {
  try {
    pendingCount.value = await adminApi.commentPendingCount()
  } catch {
    pendingCount.value = 0
  }
}

async function load() {
  loading.value = true
  try {
    const result = await adminApi.commentList({
      status: query.status,
      keyword: query.keyword.trim() || undefined,
      pageNum: page.value,
      pageSize: PAGE_SIZE
    })
    list.value = result.records ?? result.list ?? []
    total.value = result.total ?? 0
    if (!list.value.length && page.value > 1 && total.value > 0) {
      page.value -= 1
      await load()
    }
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function reset() {
  query.status = 'PENDING'
  query.keyword = ''
  page.value = 1
  load()
}

function changePage(next: number) {
  page.value = next
  load()
}

async function approve(row: AdminComment) {
  try {
    await adminApi.commentApprove(row.id)
    ElMessage.success('已通过审核，前台可见')
    await Promise.all([load(), loadPendingCount()])
  } catch {
    // 提示由 api 层处理
  }
}

async function remove(row: AdminComment) {
  const replyHint = row.replyCount > 0 ? `\n该评论下还有 ${row.replyCount} 条回复，会一并删除。` : ''
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.nickname}」的这条评论吗？删除后不可恢复。${replyHint}`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' }
    )
  } catch {
    return
  }
  try {
    const removed = await adminApi.commentDelete(row.id)
    ElMessage.success(`已删除 ${removed} 条评论`)
    await Promise.all([load(), loadPendingCount()])
  } catch {
    // 提示由 api 层处理
  }
}

function openArticle(row: AdminComment) {
  if (row.articleSlug) {
    router.push(`/article/${row.articleSlug}`)
  }
}

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

onMounted(async () => {
  await Promise.all([load(), loadPendingCount()])
})
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-select v-model="query.status" class="status-select" @change="search">
          <el-option v-for="item in STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-input
          v-model="query.keyword"
          placeholder="搜索昵称 / 内容 / 邮箱"
          clearable
          class="keyword"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" @click="search">搜索</el-button>
        <el-button @click="reset">重置</el-button>
        <span class="pending-tip">
          待审核 <b>{{ pendingCount }}</b> 条
        </span>
      </div>

      <el-table v-loading="loading" :data="list" border stripe empty-text="没有符合条件的评论">
        <el-table-column label="评论者" width="200">
          <template #default="{ row }">
            <div class="nick">{{ row.nickname }}</div>
            <div v-if="row.email" class="email">{{ row.email }}</div>
            <div v-else class="email muted">匿名（未填邮箱）</div>
          </template>
        </el-table-column>

        <el-table-column label="内容" min-width="320">
          <template #default="{ row }">
            <div class="content">{{ row.content }}</div>
            <div v-if="row.parentId" class="sub">这是一条楼中楼回复</div>
          </template>
        </el-table-column>

        <el-table-column label="所属文章" width="220">
          <template #default="{ row }">
            <el-link v-if="row.articleTitle" type="primary" :underline="false" @click="openArticle(row)">
              {{ row.articleTitle }}
            </el-link>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>

        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'APPROVED' ? 'success' : 'warning'" disable-transitions>
              {{ row.status === 'APPROVED' ? '已通过' : '待审核' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== 'APPROVED'" type="primary" link @click="approve(row)">通过</el-button>
            <el-button type="danger" link @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          layout="total, prev, pager, next"
          :total="total"
          :page-size="PAGE_SIZE"
          :current-page="page"
          @current-change="changePage"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.status-select {
  width: 130px;
}

.keyword {
  width: 240px;
}

.pending-tip {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-3);
}

.pending-tip b {
  color: var(--warn-text);
}

.nick {
  font-weight: 600;
}

.email {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
  word-break: break-all;
}

.muted {
  color: var(--text-3);
}

.content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

.sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--brand-dark);
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
