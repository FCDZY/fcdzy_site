<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { adminApi } from '@/api'
import type { Tag, TagForm } from '@/types'

const loading = ref(false)
const saving = ref(false)
const list = ref<Tag[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref<FormInstance>()

const form = reactive<TagForm>({
  name: '',
  slug: ''
})

const rules: FormRules<TagForm> = {
  name: [
    { required: true, message: '请输入标签名称', trigger: 'blur' },
    { max: 30, message: '名称最多 30 个字符', trigger: 'blur' }
  ]
}

async function load() {
  loading.value = true
  try {
    list.value = await adminApi.tagList()
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
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(row: Tag) {
  editingId.value = row.id
  form.name = row.name
  form.slug = row.slug || ''
  dialogVisible.value = true
  formRef.value?.clearValidate()
}

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload: TagForm = { name: form.name.trim() }
    const slug = (form.slug || '').trim()
    if (slug) payload.slug = slug

    if (editingId.value === null) {
      await adminApi.tagCreate(payload)
      ElMessage.success('新增成功')
    } else {
      await adminApi.tagUpdate(editingId.value, payload)
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

async function handleDelete(row: Tag) {
  try {
    await ElMessageBox.confirm(`确定要删除标签「${row.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger'
    })
  } catch {
    return
  }
  try {
    await adminApi.tagDelete(row.id)
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
        <span class="tip">标签用于给文章打标，便于按标签筛选</span>
        <div class="spacer" />
        <el-button type="primary" :icon="'Plus'" @click="openCreate">新增标签</el-button>
      </div>

      <el-table v-loading="loading" :data="list" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="slug" label="slug" min-width="140" show-overflow-tooltip />
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
          <div class="empty-text">暂无标签，点击右上角「新增标签」创建</div>
        </template>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId === null ? '新增标签' : '编辑标签'"
      width="520px"
      style="max-width: 92vw"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：Vue3" maxlength="30" clearable />
        </el-form-item>
        <el-form-item label="slug" prop="slug">
          <el-input v-model="form.slug" placeholder="留空自动生成，如 vue3" clearable />
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
