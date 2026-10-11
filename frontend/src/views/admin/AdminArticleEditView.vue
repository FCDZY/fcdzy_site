<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { adminApi } from '@/api'
import type { Article, ArticleForm, Category, Tag } from '@/types'
import ImageUploader from '@/components/admin/ImageUploader.vue'

const props = defineProps<{ id?: string }>()

const router = useRouter()

interface EditorForm {
  title: string
  slug: string
  summary: string
  content: string
  coverImage: string
  status: 'DRAFT' | 'PUBLISHED'
  categoryId: number | null
  tagIds: number[]
  topped: boolean
}

const formRef = ref<FormInstance>()
const loading = ref(false)
const submitting = ref(false)
const categories = ref<Category[]>([])
const tags = ref<Tag[]>([])

const form = reactive<EditorForm>({
  title: '',
  slug: '',
  summary: '',
  content: '',
  coverImage: '',
  status: 'DRAFT',
  categoryId: null,
  tagIds: [],
  topped: false
})

const rules: FormRules<EditorForm> = {
  title: [
    { required: true, message: '请输入文章标题', trigger: 'blur' },
    { min: 2, max: 120, message: '标题长度在 2 到 120 个字符', trigger: 'blur' }
  ],
  status: [{ required: true, message: '请选择文章状态', trigger: 'change' }]
}

const isEdit = computed(() => !!props.id)

/** md-editor-v3 图片上传回调：(files, callback) => void */
async function onUploadImg(files: File[], callback: (urls: string[]) => void) {
  try {
    const results = await Promise.all(files.map((file) => adminApi.upload(file)))
    callback(results.map((item) => item.url))
  } catch {
    // 提示由 api 层处理
  }
}

function fillForm(article: Article) {
  form.title = article.title || ''
  form.slug = article.slug || ''
  form.summary = article.summary || ''
  form.content = article.content || ''
  form.coverImage = article.coverImage || ''
  form.status = article.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
  form.categoryId = article.category?.id ?? null
  form.tagIds = (article.tags || []).map((tag) => tag.id)
  form.topped = !!article.topped
}

function buildPayload(status: 'DRAFT' | 'PUBLISHED'): ArticleForm {
  const payload: ArticleForm = {
    title: form.title.trim(),
    content: form.content,
    status,
    categoryId: form.categoryId,
    tagIds: [...form.tagIds],
    topped: form.topped
  }
  const slug = form.slug.trim()
  if (slug) payload.slug = slug
  const summary = form.summary.trim()
  if (summary) payload.summary = summary
  const cover = form.coverImage.trim()
  if (cover) payload.coverImage = cover
  return payload
}

async function loadOptions() {
  const [categoryList, tagList] = await Promise.all([
    adminApi.categoryList().catch(() => [] as Category[]),
    adminApi.tagList().catch(() => [] as Tag[])
  ])
  categories.value = categoryList
  tags.value = tagList
}

async function loadArticle() {
  if (!props.id) return
  const article = await adminApi.articleDetail(Number(props.id))
  fillForm(article)
}

async function submit(status: 'DRAFT' | 'PUBLISHED') {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = buildPayload(status)
    if (isEdit.value) {
      await adminApi.articleUpdate(Number(props.id), payload)
    } else {
      await adminApi.articleCreate(payload)
    }
    ElMessage.success(status === 'PUBLISHED' ? '文章已发布' : '草稿已保存')
    router.push('/admin/articles')
  } catch {
    // 提示由 api 层处理
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await loadOptions()
    await loadArticle()
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="admin-page" v-loading="loading">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <span class="head-title">{{ isEdit ? '编辑文章' : '写文章' }}</span>
          <el-button text :icon="'Back'" @click="router.push('/admin/articles')">返回列表</el-button>
        </div>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" label-position="top">
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入文章标题" maxlength="120" show-word-limit clearable />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="URL 别名（slug）">
              <el-input v-model="form.slug" placeholder="留空则自动生成" clearable />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="分类">
              <el-select v-model="form.categoryId" placeholder="请选择分类（可清空）" clearable style="width: 100%">
                <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-form-item label="标签">
              <el-select
                v-model="form.tagIds"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                placeholder="请选择标签"
                style="width: 100%"
              >
                <el-option v-for="item in tags" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="摘要">
          <el-input
            v-model="form.summary"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="留空则由后端自动截取正文前 200 字"
          />
        </el-form-item>

        <el-form-item label="封面图">
          <ImageUploader v-model="form.coverImage" :height="150" tip="建议尺寸 1200×630，jpg / png / webp" />
        </el-form-item>

        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item label="状态">
              <el-radio-group v-model="form.status">
                <el-radio value="DRAFT">草稿</el-radio>
                <el-radio value="PUBLISHED">直接发布</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="置顶">
              <el-switch v-model="form.topped" active-text="置顶显示" inactive-text="不置顶" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="正文（Markdown）">
          <div class="editor-wrap">
            <MdEditor
              v-model="form.content"
              language="zh-CN"
              :style="{ height: '520px' }"
              :on-upload-img="onUploadImg"
            />
            <div class="editor-tip">支持 Markdown，图片可直接拖拽或粘贴上传</div>
          </div>
        </el-form-item>
      </el-form>

      <div class="footer-bar">
        <el-button @click="router.push('/admin/articles')">取消</el-button>
        <el-button :loading="submitting" @click="submit('DRAFT')">保存草稿</el-button>
        <el-button type="primary" :loading="submitting" @click="submit('PUBLISHED')">发布文章</el-button>
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

.editor-wrap {
  width: 100%;
}

.editor-wrap :deep(.md-editor) {
  width: 100%;
}

.editor-tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-3);
}

.footer-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding: 12px 4px;
  background: #fff;
  border-top: 1px solid var(--border);
}

.footer-bar :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 768px) {
  .footer-bar {
    justify-content: stretch;
  }

  .footer-bar :deep(.el-button) {
    flex: 1 1 auto;
  }
}
</style>
