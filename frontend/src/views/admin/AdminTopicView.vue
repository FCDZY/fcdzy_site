<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { adminApi } from '@/api'
import type { Topic, TopicForm } from '@/types'
import { formatDate } from '@/utils/format'
import ImageUploader from '@/components/admin/ImageUploader.vue'

const router = useRouter()

const loading = ref(false)
const saving = ref(false)
const list = ref<Topic[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()

const form = reactive<TopicForm>({
  name: '',
  slug: '',
  description: '',
  coverImage: '',
  sortOrder: 0
})

const rules: FormRules<TopicForm> = {
  name: [
    { required: true, message: '请输入专题名称', trigger: 'blur' },
    { max: 50, message: '名称最多 50 个字符', trigger: 'blur' }
  ]
}

async function load() {
  loading.value = true
  try {
    list.value = await adminApi.topicList()
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  form.name = ''
  form.slug = ''
  form.description = ''
  form.coverImage = ''
  form.sortOrder = 0
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(row: Topic) {
  editingId.value = row.id
  form.name = row.name
  form.slug = row.slug || ''
  form.description = row.description || ''
  form.coverImage = row.coverImage || ''
  form.sortOrder = row.sortOrder ?? 0
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
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

    if (editingId.value === null) {
      await adminApi.topicCreate(payload)
      ElMessage.success('新增成功')
    } else {
      await adminApi.topicUpdate(editingId.value, payload)
      ElMessage.success('保存成功')
    }
    dialogVisible.value = false
    await load()
  } catch {
    // 提示由 api 层处理
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Topic) {
  try {
    await ElMessageBox.confirm(`确定要删除专题「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger'
    })
  } catch {
    return
  }
  try {
    await adminApi.topicDelete(row.id)
    ElMessage.success('删除成功')
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

function goSort(row: Topic) {
  router.push('/admin/topics/' + row.id)
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never">
      <div class="admin-toolbar">
        <span class="tip">专题是一组文章的合集，创建后可在「管理文章排序」中挑选文章并排序</span>
        <div class="spacer" />
        <el-button type="primary" :icon="'Plus'" @click="openCreate">新增专题</el-button>
      </div>

      <el-table v-loading="loading" :data="list" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="名称" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="topic-cell">
              <img v-if="row.coverImage" :src="row.coverImage" alt="封面" class="cover" />
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="slug" label="slug" min-width="130" show-overflow-tooltip />
        <el-table-column label="描述" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.description">{{ row.description }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="文章数" width="90" align="center">
          <template #default="{ row }">{{ row.articleCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="排序" width="80" align="center">
          <template #default="{ row }">{{ row.sortOrder ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="120">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="success" size="small" @click="goSort(row)">管理文章排序</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-text">暂无专题，点击右上角「新增专题」创建</div>
        </template>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId === null ? '新增专题' : '编辑专题'"
      width="620px"
      style="max-width: 92vw"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：Vue3 从入门到实战" maxlength="50" clearable />
        </el-form-item>
        <el-form-item label="slug" prop="slug">
          <el-input v-model="form.slug" placeholder="留空自动生成" clearable />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="300"
            show-word-limit
            placeholder="专题简介，可留空"
          />
        </el-form-item>
        <el-form-item label="封面" prop="coverImage">
          <ImageUploader v-model="form.coverImage" :height="140" tip="专题封面，建议 16:9，可留空" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" controls-position="right" />
          <span class="tip sort-tip">数值越小越靠前</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.spacer {
  flex: 1 1 auto;
}

.tip {
  font-size: 13px;
  color: var(--text-3);
}

.sort-tip {
  margin-left: 10px;
}

.topic-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cover {
  width: 42px;
  height: 28px;
  object-fit: cover;
  border-radius: 4px;
  flex: 0 0 42px;
}

.empty-text {
  padding: 24px 0;
  color: var(--text-3);
}
</style>
