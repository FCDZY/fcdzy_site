<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { adminApi, publicApi } from '@/api'
import type { Article, ArticleForm, Category, Tag } from '@/types'
import ImageUploader from '@/components/admin/ImageUploader.vue'
import { validateImageFile } from '@/utils/upload'

const props = defineProps<{ id?: string }>()

const router = useRouter()

interface EditorForm {
  title: string
  slug: string
  summary: string
  content: string
  coverImage: string
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'
  schedulePublishTime: string
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
  schedulePublishTime: '',
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

/* ==================== 定时发布：统一用服务器时间 ==================== */
/** 服务器当前时间（yyyy-MM-dd HH:mm:ss），用于选择器默认值与「服务器时间」提示 */
const serverNow = ref('')
const serverZone = ref('Asia/Shanghai')
const isScheduled = computed(() => form.status === 'SCHEDULED')

function normalizeDateTime(value?: string | null): string {
  if (!value) return ''
  // 后端返回 ISO（2026-10-22T09:00:00），选择器要 yyyy-MM-dd HH:mm:ss
  return value.replace('T', ' ').slice(0, 19)
}

/** 墙钟字符串加减分钟（不做时区换算） */
function shiftMinutes(text: string, minutes: number): string {
  const date = new Date(text.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return text
  date.setMinutes(date.getMinutes() + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

async function loadServerTime() {
  try {
    const info = await publicApi.serverInfo()
    serverNow.value = info.now
    serverZone.value = info.zone
  } catch {
    serverNow.value = ''
  }
}

/* ==================== 导入 Markdown 文件 ==================== */
/** 仅前端读取文件内容填充编辑器，不涉及后端接口与数据表 */
const MAX_MD_SIZE = 4 * 1024 * 1024
const MD_ACCEPT = '.md,.markdown,text/markdown'

const fileInputRef = ref<HTMLInputElement | null>(null)
const editorWrapRef = ref<HTMLElement | null>(null)
const dragging = ref(false)
let dragDepth = 0

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function isMarkdownFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value，保证连续选择同一文件也能触发 change
  input.value = ''
  if (file) {
    await importMarkdownFile(file)
  }
}

async function importMarkdownFile(file: File) {
  if (!isMarkdownFile(file)) {
    ElMessage.error(`「${file.name}」不是 Markdown 文件，仅支持 .md / .markdown`)
    return
  }
  if (file.size > MAX_MD_SIZE) {
    ElMessage.error(`文件大小 ${formatSize(file.size)} 超过 4MB 限制`)
    return
  }
  if (form.content.trim()) {
    try {
      await ElMessageBox.confirm('导入会覆盖当前正文内容，是否继续？', '导入 Markdown', {
        type: 'warning',
        confirmButtonText: '覆盖导入',
        cancelButtonText: '取消'
      })
    } catch {
      return
    }
  }
  try {
    const text = await file.text()
    if (!text.trim()) {
      ElMessage.warning('文件内容为空，未导入')
      return
    }
    form.content = text
    ElMessage.success(`已导入「${file.name}」（${formatSize(file.size)}，${text.length} 字）`)
  } catch {
    ElMessage.error('读取文件失败，请重试')
  }
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

/* 用捕获阶段监听，避免被编辑器自身的拖拽处理吞掉事件 */
function onDragEnter(event: DragEvent) {
  if (!hasFiles(event)) return
  dragDepth += 1
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

async function onDrop(event: DragEvent) {
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) {
    await importMarkdownFile(file)
  }
}

/**
 * 编辑器内粘贴/拖拽图片：先做与上传组件一致的本地校验，再逐张上传。
 * 校验不通过的文件会被跳过并提示原因，不影响其它图片。
 */
async function onUploadImg(files: File[], callback: (urls: string[]) => void) {
  const accepted: File[] = []
  for (const file of files) {
    const error = validateImageFile(file)
    if (error) {
      ElMessage.warning(`${file.name}：${error}`)
    } else {
      accepted.push(file)
    }
  }
  if (!accepted.length) return
  try {
    const results = await Promise.all(accepted.map((file) => adminApi.upload(file)))
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
  form.status = article.status === 'PUBLISHED'
    ? 'PUBLISHED'
    : article.status === 'SCHEDULED' ? 'SCHEDULED' : 'DRAFT'
  form.schedulePublishTime = normalizeDateTime(article.schedulePublishTime)
  form.categoryId = article.category?.id ?? null
  form.tagIds = (article.tags || []).map((tag) => tag.id)
  form.topped = !!article.topped
}

function buildPayload(status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'): ArticleForm {
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
  if (status === 'SCHEDULED') payload.schedulePublishTime = form.schedulePublishTime
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

async function submit(status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED') {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (status === 'SCHEDULED') {
    const when = form.schedulePublishTime.trim()
    if (!when) {
      ElMessage.warning('请选择定时发布时间')
      return
    }
    // 墙钟字符串同为 yyyy-MM-dd HH:mm:ss，可直接字典序比较
    if (serverNow.value && when <= serverNow.value) {
      ElMessage.warning(`定时发布时间必须晚于服务器当前时间（${serverNow.value}）`)
      return
    }
  }
  submitting.value = true
  try {
    const payload = buildPayload(status)
    if (isEdit.value) {
      await adminApi.articleUpdate(Number(props.id), payload)
    } else {
      await adminApi.articleCreate(payload)
    }
    if (status === 'SCHEDULED') {
      ElMessage.success(`已设置为定时发布：${form.schedulePublishTime}（服务器时间）`)
    } else {
      ElMessage.success(status === 'PUBLISHED' ? '文章已发布' : '草稿已保存')
    }
    router.push('/admin/articles')
  } catch {
    // 提示由 api 层处理
  } finally {
    submitting.value = false
  }
}

/** 取消定时发布：回到草稿 */
async function cancelSchedule() {
  if (!isEdit.value) return
  try {
    await ElMessageBox.confirm('取消定时后文章会回到「草稿」状态，确定继续吗？', '取消定时', {
      type: 'warning',
      confirmButtonText: '取消定时',
      cancelButtonText: '再想想'
    })
  } catch {
    return
  }
  submitting.value = true
  try {
    const article = await adminApi.articleCancelSchedule(Number(props.id))
    fillForm(article)
    form.schedulePublishTime = ''
    ElMessage.success('已取消定时，文章回到草稿')
  } catch {
    // 提示由 api 层处理
  } finally {
    submitting.value = false
  }
}

/** 用捕获阶段绑定/解绑拖拽事件，避免被编辑器自身的拖拽处理吞掉 */
function bindEditorDragEvents(bind: boolean) {
  const wrap = editorWrapRef.value
  if (!wrap) return
  const pairs: Array<[string, EventListener]> = [
    ['dragenter', onDragEnter as unknown as EventListener],
    ['dragover', onDragOver as unknown as EventListener],
    ['dragleave', onDragLeave as unknown as EventListener],
    ['drop', onDrop as unknown as EventListener]
  ]
  for (const [type, handler] of pairs) {
    if (bind) {
      wrap.addEventListener(type, handler, true)
    } else {
      wrap.removeEventListener(type, handler, true)
    }
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadOptions(), loadServerTime()])
    await loadArticle()
    if (!form.schedulePublishTime && serverNow.value) {
      // 默认给一个「服务器时间 +30 分钟」的候选值
      form.schedulePublishTime = shiftMinutes(serverNow.value, 30)
    }
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
  bindEditorDragEvents(true)
})

onBeforeUnmount(() => {
  bindEditorDragEvents(false)
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
              <div class="status-line">
                <el-tag v-if="form.status === 'PUBLISHED'" type="success" disable-transitions>已发布</el-tag>
                <el-tag v-else-if="form.status === 'SCHEDULED'" type="primary" disable-transitions>定时发布</el-tag>
                <el-tag v-else type="warning" disable-transitions>草稿</el-tag>
                <span v-if="isScheduled && form.schedulePublishTime" class="status-time">
                  计划于 {{ form.schedulePublishTime }} 发布（服务器时间）
                </span>
                <span v-else class="status-tip">用底部按钮选择：保存草稿 / 定时发布 / 立即发布</span>
              </div>
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item label="置顶">
              <el-switch v-model="form.topped" active-text="置顶显示" inactive-text="不置顶" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="正文（Markdown）">
          <div ref="editorWrapRef" class="editor-wrap" :class="{ 'is-dragging': dragging }">
            <div class="editor-bar">
              <el-button size="small" :icon="'UploadFilled'" @click="openFilePicker">导入 Markdown 文件</el-button>
              <span class="editor-bar-tip">支持 .md / .markdown，单个文件不超过 4MB；也可直接把文件拖到下方编辑器</span>
            </div>

            <div class="editor-area">
              <MdEditor
                v-model="form.content"
                language="zh-CN"
                :style="{ height: '520px' }"
                :on-upload-img="onUploadImg"
              />
              <div v-if="dragging" class="editor-drop-mask">
                <el-icon :size="26"><UploadFilled /></el-icon>
                <span>松开鼠标导入 Markdown 文件</span>
              </div>
            </div>

            <div class="editor-tip">支持 Markdown，图片可直接拖拽或粘贴上传</div>

            <input
              ref="fileInputRef"
              class="file-input"
              type="file"
              :accept="MD_ACCEPT"
              @change="onFileChange"
            />
          </div>
        </el-form-item>
      </el-form>

      <div class="footer-bar">
        <el-button @click="router.push('/admin/articles')">取消</el-button>
        <el-button :loading="submitting" @click="submit('DRAFT')">保存草稿</el-button>

        <!--
          定时发布弹层。
          注意：这里的 el-date-picker 必须设置 :teleported="false"（见下），
          否则日期面板会被传送到 body 外部，Element Plus 会把「点日期」判定为
          「点在弹层外面」→ 弹层立即关闭，鼠标事件落到下方的发布/草稿按钮上（点击穿透）。
          让面板作为弹层内部元素渲染后，点面板属于内部点击，弹层保持打开。
        -->
        <el-popover placement="top-end" :width="330" trigger="click" popper-class="schedule-popper">
          <template #reference>
            <el-button :loading="submitting">{{ isScheduled ? '修改定时' : '设置定时发布' }}</el-button>
          </template>
          <div class="schedule-panel">
            <div class="schedule-hint">
              服务器时间：{{ serverNow || '—' }}
              <span class="schedule-zone">（{{ serverZone }}）</span>
            </div>
            <el-date-picker
              v-model="form.schedulePublishTime"
              type="datetime"
              :teleported="false"
              placement="top-start"
              popper-class="schedule-picker"
              value-format="YYYY-MM-DD HH:mm:ss"
              format="YYYY-MM-DD HH:mm"
              placeholder="选择发布时间（服务器时间）"
              style="width: 100%"
            />
            <div class="schedule-actions">
              <el-button v-if="isScheduled" type="danger" text @click="cancelSchedule">取消定时</el-button>
              <span v-else></span>
              <el-button type="primary" size="small" :loading="submitting" @click="submit('SCHEDULED')">
                {{ isScheduled ? '更新定时' : '确定定时' }}
              </el-button>
            </div>
          </div>
        </el-popover>

        <el-button type="primary" :loading="submitting" @click="submit('PUBLISHED')">
          {{ form.status === 'PUBLISHED' ? '更新并发布' : '立即发布' }}
        </el-button>
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

/* ===== 导入 Markdown 文件 ===== */
.editor-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.editor-bar-tip {
  font-size: 12px;
  color: var(--text-3);
}

.editor-area {
  position: relative;
}

/* 拖拽中隐藏编辑器自身内容，避免其内部浮动元素（代码块工具条等）透过遮罩显示 */
.editor-wrap.is-dragging :deep(.md-editor) {
  visibility: hidden;
}

.editor-drop-mask {
  position: absolute;
  inset: 0;
  /* 高于编辑器内部浮动元素（代码块工具条等），低于 Element Plus 的消息与弹窗 */
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--brand-dark);
  background: var(--brand-soft);
  border: 2px dashed var(--brand);
  border-radius: 10px;
  pointer-events: none;
}

.file-input {
  display: none;
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
  background: var(--card);
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
.status-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.status-time {
  font-size: 13px;
  color: var(--text-1);
  font-weight: 600;
}

.status-tip {
  font-size: 12.5px;
  color: var(--text-3);
}

.schedule-panel {
  /* 作为内联日期面板的定位上下文，避免面板跑到弹层外部 */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.schedule-hint {
  font-size: 12.5px;
  color: var(--text-2);
}

.schedule-zone {
  color: var(--text-3);
}

.schedule-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
</style>

<!--
  弹层本身渲染在 body 下（teleport），scoped 样式选不到，所以这里用非 scoped 的全局块。
  小屏高度兜底：内容超出视口时在弹层内部滚动，不会顶出屏幕，也不会被裁掉。
-->
<style>
/*
  小屏高度兜底（≤640px）：给「日期面板自身」设高度上限并内部滚动。
  不能加在外层弹层上 —— 面板是向上展开、超出弹层盒子的，外层一旦 overflow
  就会把日历裁掉（只剩底部一行）。
*/
@media (max-height: 640px) {
  .schedule-picker {
    max-height: calc(100vh - 24px);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
</style>
