<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { adminApi } from '@/api'
import type { Article, Topic, TopicForm } from '@/types'
import { formatDate } from '@/utils/format'
import ImageUploader from '@/components/admin/ImageUploader.vue'

const props = defineProps<{ id: string }>()

const router = useRouter()

const loading = ref(false)
const savingTopic = ref(false)
const savingOrder = ref(false)
const formRef = ref<FormInstance>()

const topic = ref<Topic | null>(null)
const selected = ref<Article[]>([])
const allArticles = ref<Article[]>([])
const keyword = ref('')

const form = reactive<TopicForm>({
  name: '',
  slug: '',
  description: '',
  coverImage: '',
  sortOrder: 0
})

const rules: FormRules<TopicForm> = {
  name: [{ required: true, message: '请输入专题名称', trigger: 'blur' }]
}

const orderedIds = computed<number[]>(() => selected.value.map((item) => item.id))

const selectedIdSet = computed<Set<number>>(() => new Set(orderedIds.value))

const availableArticles = computed<Article[]>(() => {
  const ids = selectedIdSet.value
  const key = keyword.value.trim().toLowerCase()
  return allArticles.value.filter((item) => {
    if (ids.has(item.id)) return false
    if (!key) return true
    return item.title.toLowerCase().includes(key)
  })
})

function statusOf(status?: string) {
  return status === 'PUBLISHED'
    ? { label: '已发布', type: 'success' as const }
    : { label: '草稿', type: 'warning' as const }
}

function categoryName(article: Article) {
  return article.category?.name || '未分类'
}

function fillForm(data: Topic) {
  form.name = data.name || ''
  form.slug = data.slug || ''
  form.description = data.description || ''
  form.coverImage = data.coverImage || ''
  form.sortOrder = data.sortOrder ?? 0
}

async function loadDetail() {
  const detail = await adminApi.topicDetail(Number(props.id))
  topic.value = detail.topic
  selected.value = [...(detail.articles || [])]
  fillForm(detail.topic)
}

async function loadOptions() {
  allArticles.value = await adminApi.articleOptions()
}

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadDetail(), loadOptions()])
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

function buildPayload(): TopicForm {
  const payload: TopicForm = {
    name: form.name.trim(),
    sortOrder: form.sortOrder ?? 0
  }
  const slug = (form.slug || '').trim()
  if (slug) payload.slug = slug
  const description = (form.description || '').trim()
  if (description) payload.description = description
  const cover = (form.coverImage || '').trim()
  if (cover) payload.coverImage = cover
  return payload
}

async function saveTopic() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  savingTopic.value = true
  try {
    await adminApi.topicUpdate(Number(props.id), buildPayload())
    ElMessage.success('专题信息已保存')
    await loadDetail()
  } catch {
    // 提示由 api 层处理
  } finally {
    savingTopic.value = false
  }
}

function addArticle(article: Article) {
  if (selectedIdSet.value.has(article.id)) return
  selected.value = [...selected.value, article]
}

function removeAt(index: number) {
  const next = [...selected.value]
  next.splice(index, 1)
  selected.value = next
}

function moveUp(index: number) {
  if (index <= 0) return
  const next = [...selected.value]
  const [item] = next.splice(index, 1)
  next.splice(index - 1, 0, item)
  selected.value = next
}

function moveDown(index: number) {
  const next = [...selected.value]
  if (index >= next.length - 1) return
  const [item] = next.splice(index, 1)
  next.splice(index + 1, 0, item)
  selected.value = next
}

async function saveOrder() {
  savingOrder.value = true
  try {
    await adminApi.topicArticles(Number(props.id), orderedIds.value)
    ElMessage.success('文章排序已保存')
    await loadDetail()
  } catch {
    // 提示由 api 层处理
  } finally {
    savingOrder.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="admin-page" v-loading="loading">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span class="head-title">专题信息</span>
          <el-button text :icon="'Back'" @click="router.push('/admin/topics')">返回专题列表</el-button>
        </div>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="名称" prop="name">
              <el-input v-model="form.name" placeholder="专题名称" maxlength="50" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="slug" prop="slug">
              <el-input v-model="form.slug" placeholder="留空自动生成" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="排序" prop="sortOrder">
              <el-input-number v-model="form.sortOrder" :min="0" :max="9999" controls-position="right" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            maxlength="300"
            show-word-limit
            placeholder="专题简介，可留空"
          />
        </el-form-item>

        <el-form-item label="封面" prop="coverImage">
          <ImageUploader v-model="form.coverImage" :height="130" tip="专题封面，可留空" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="savingTopic" @click="saveTopic">保存专题信息</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="block">
      <template #header>
        <div class="head">
          <span class="head-title">文章排序<template v-if="topic"> · {{ topic.name }}</template></span>
          <span class="tip">共 {{ selected.length }} 篇，调整顺序后记得点击「保存排序」</span>
        </div>
      </template>

      <el-row :gutter="16">
        <el-col :xs="24" :md="13">
          <div class="panel">
            <div class="panel-head">已选文章（按顺序）</div>
            <div v-if="selected.length" class="sel-list">
              <div v-for="(item, index) in selected" :key="item.id" class="sel-item">
                <span class="order">{{ index + 1 }}</span>
                <div class="sel-body">
                  <div class="sel-title">{{ item.title }}</div>
                  <div class="sel-meta">
                    <el-tag :type="statusOf(item.status).type" size="small">{{ statusOf(item.status).label }}</el-tag>
                    <span class="muted">{{ categoryName(item) }}</span>
                    <span class="muted">{{ formatDate(item.updatedAt || item.createdAt) }}</span>
                  </div>
                </div>
                <div class="sel-actions">
                  <el-button size="small" :disabled="index === 0" @click="moveUp(index)">上移</el-button>
                  <el-button size="small" :disabled="index === selected.length - 1" @click="moveDown(index)">
                    下移
                  </el-button>
                  <el-button size="small" type="danger" plain @click="removeAt(index)">移除</el-button>
                </div>
              </div>
            </div>
            <div v-else class="empty-text">还没有选择文章，从右侧「可选文章」中添加</div>

            <div class="save-bar">
              <el-button type="primary" :loading="savingOrder" :disabled="loading" @click="saveOrder">
                保存排序
              </el-button>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :md="11">
          <div class="panel">
            <div class="panel-head">可选文章</div>
            <el-input v-model="keyword" placeholder="搜索文章标题" clearable class="search" />
            <div class="opt-list">
              <div v-for="item in availableArticles" :key="item.id" class="opt-item">
                <div class="opt-body">
                  <div class="opt-title">{{ item.title }}</div>
                  <div class="opt-meta">
                    <el-tag :type="statusOf(item.status).type" size="small">{{ statusOf(item.status).label }}</el-tag>
                    <span class="muted">{{ categoryName(item) }}</span>
                    <span class="muted">{{ formatDate(item.updatedAt || item.createdAt) }}</span>
                  </div>
                </div>
                <el-button size="small" type="primary" plain @click="addArticle(item)">添加</el-button>
              </div>
              <div v-if="!availableArticles.length" class="empty-text">
                {{ keyword ? '没有匹配的文章' : '全部文章都已加入本专题' }}
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.head-title {
  font-weight: 600;
}

.tip {
  font-size: 13px;
  color: var(--text-3);
}

.block {
  margin-top: 14px;
}

.panel {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  height: 100%;
}

.panel-head {
  font-weight: 600;
  margin-bottom: 10px;
}

.sel-list,
.opt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.opt-list {
  margin-top: 10px;
  max-height: 520px;
  overflow-y: auto;
}

.sel-item,
.opt-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.sel-body,
.opt-body {
  flex: 1 1 auto;
  min-width: 0;
}

.sel-title,
.opt-title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sel-meta,
.opt-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.sel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 0 0 auto;
}

.sel-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.search {
  width: 100%;
}

.empty-text {
  padding: 20px 0;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}

.save-bar {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .sel-item,
  .opt-item {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .sel-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .opt-list {
    max-height: 360px;
  }
}
</style>
