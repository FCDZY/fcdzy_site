<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { adminApi } from '@/api'
import type { Category, CategoryForm } from '@/types'

const loading = ref(false)
const saving = ref(false)
const list = ref<Category[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()

const form = reactive<CategoryForm>({
  name: '',
  slug: '',
  description: '',
  sortOrder: 0
})

const rules: FormRules<CategoryForm> = {
  name: [
    { required: true, message: '请输入分类名称', trigger: 'blur' },
    { max: 50, message: '名称最多 50 个字符', trigger: 'blur' }
  ]
}

async function load() {
  loading.value = true
  try {
    list.value = await adminApi.categoryList()
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
  form.sortOrder = 0
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(row: Category) {
  editingId.value = row.id
  form.name = row.name
  form.slug = row.slug || ''
  form.description = row.description || ''
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
    const payload: CategoryForm = {
      name: form.name.trim(),
      sortOrder: form.sortOrder ?? 0
    }
    const slug = (form.slug || '').trim()
    if (slug) payload.slug = slug
    const description = (form.description || '').trim()
    if (description) payload.description = description

    if (editingId.value === null) {
      await adminApi.categoryCreate(payload)
      ElMessage.success('新增成功')
    } else {
      await adminApi.categoryUpdate(editingId.value, payload)
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

async function handleDelete(row: Category) {
  try {
    await ElMessageBox.confirm(`确定要删除分类「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger'
    })
  } catch {
    return
  }
  try {
    await adminApi.categoryDelete(row.id)
    ElMessage.success('删除成功')
    await load()
  } catch {
    // 提示由 api 层处理
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never">
      <div class="admin-toolbar">
        <span class="tip">分类用于前台文章归档与导航，slug 留空则由后端自动生成</span>
        <div class="spacer" />
        <el-button type="primary" :icon="'Plus'" @click="openCreate">新增分类</el-button>
      </div>

      <el-table v-loading="loading" :data="list" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="slug" label="slug" min-width="140" show-overflow-tooltip />
        <el-table-column label="描述" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.description">{{ row.description }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="排序" width="80" align="center">
          <template #default="{ row }">{{ row.sortOrder ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="文章数" width="90" align="center">
          <template #default="{ row }">{{ row.articleCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right" align="center">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-text">暂无分类，点击右上角「新增分类」创建</div>
        </template>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId === null ? '新增分类' : '编辑分类'"
      width="520px"
      style="max-width: 92vw"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：技术笔记" maxlength="50" clearable />
        </el-form-item>
        <el-form-item label="slug" prop="slug">
          <el-input v-model="form.slug" placeholder="留空自动生成，如 tech-notes" clearable />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="分类描述，可留空" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" controls-position="right" />
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

.empty-text {
  padding: 24px 0;
  color: var(--text-3);
}
</style>
