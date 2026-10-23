<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { publicApi } from '@/api'
import type { Comment } from '@/types'
import { formatNumber } from '@/utils/format'
import { tagColorIndex } from '@/utils/tagColor'
import AppPagination from '@/components/AppPagination.vue'

/**
 * 文章评论区（访客无需登录）：
 * - 提交昵称 + 选填邮箱 + 内容，新评论默认待审核，提示「审核通过后展示」
 * - 列表只展示已通过评论；楼中楼采用「一级评论 + 其下平铺回复」，回复用「回复 @xx」标记
 * - 与全站统一的深色毛玻璃卡片（card--dark）
 */
const props = defineProps<{ slug: string }>()

const PAGE_SIZE = 10
const MAX_CONTENT = 2000
const MAX_NICKNAME = 40

const comments = ref<Comment[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const failed = ref('')
const countAll = ref(0)

const formRef = ref<HTMLFormElement | null>(null)
const form = reactive({ nickname: '', email: '', content: '' })
const submitting = ref(false)
const submitted = ref(false)
const replyTarget = ref<Comment | null>(null)
const replyInputRef = ref<HTMLTextAreaElement | null>(null)

const remaining = computed(() => MAX_CONTENT - form.content.length)
const replyPlaceholder = computed(() =>
  replyTarget.value ? `回复 @${replyTarget.value.nickname}…` : '说点什么吧…（支持纯文本）'
)

/** 头像：昵称首字 + 与标签同一套调色板（按昵称稳定取色） */
function avatarColor(name: string) {
  return `var(--tag-c-${tagColorIndex(name || 'guest')})`
}
function avatarText(name: string) {
  return (name || '?').trim().slice(0, 1).toUpperCase()
}

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function loadCount() {
  try {
    countAll.value = await publicApi.commentCount(props.slug)
  } catch {
    countAll.value = 0
  }
}

async function loadComments() {
  loading.value = true
  failed.value = ''
  try {
    const result = await publicApi.comments(props.slug, page.value, PAGE_SIZE)
    comments.value = result.records ?? result.list ?? []
    total.value = result.total ?? 0
    // 删到当前页为空时回退一页
    if (!comments.value.length && page.value > 1 && total.value > 0) {
      page.value -= 1
      await loadComments()
    }
  } catch {
    failed.value = '评论加载失败，请稍后重试'
    comments.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await Promise.all([loadComments(), loadCount()])
}

function changePage(next: number) {
  page.value = next
  loadComments()
}

function startReply(comment: Comment) {
  replyTarget.value = comment
  submitted.value = false
  nextTick(() => {
    formRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    replyInputRef.value?.focus()
  })
}

function cancelReply() {
  replyTarget.value = null
}

function validate() {
  const nickname = form.nickname.trim()
  const email = form.email.trim()
  const content = form.content.trim()
  if (!nickname) {
    ElMessage.warning('请填写昵称')
    return false
  }
  if (nickname.length > MAX_NICKNAME) {
    ElMessage.warning(`昵称最多 ${MAX_NICKNAME} 个字`)
    return false
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    ElMessage.warning('邮箱格式不正确（也可以留空）')
    return false
  }
  if (!content) {
    ElMessage.warning('请填写评论内容')
    return false
  }
  if (content.length > MAX_CONTENT) {
    ElMessage.warning(`评论内容最多 ${MAX_CONTENT} 字`)
    return false
  }
  return true
}

async function submit() {
  if (submitting.value || !validate()) return
  submitting.value = true
  try {
    await publicApi.createComment(props.slug, {
      nickname: form.nickname.trim(),
      email: form.email.trim() || undefined,
      content: form.content.trim(),
      parentId: replyTarget.value ? replyTarget.value.id : undefined
    })
    submitted.value = true
    replyTarget.value = null
    form.content = ''
    ElMessage.success('评论已提交，审核通过后会展示在这里')
    // 待审核不进列表，只刷新总数
    await loadCount()
  } catch {
    // 频率限制 / 校验失败等：http 拦截器已弹出后端返回的提示
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.slug,
  () => {
    page.value = 1
    replyTarget.value = null
    submitted.value = false
    refresh()
  },
  { immediate: true }
)
</script>

<template>
  <section id="comments" class="card card--dark comments" aria-label="评论区">
    <header class="comments-head">
      <h2 class="comments-title">
        评论
        <span class="comments-count">({{ formatNumber(countAll) }})</span>
      </h2>
      <p class="comments-tip">无需注册即可评论，内容会先经过站长审核</p>
    </header>

    <!-- 发表评论 -->
    <form ref="formRef" class="comment-form" @submit.prevent="submit">
      <div v-if="replyTarget" class="reply-banner">
        <span>正在回复 <b>@{{ replyTarget.nickname }}</b></span>
        <button type="button" class="reply-cancel" @click="cancelReply">取消</button>
      </div>
      <div class="form-row">
        <el-input v-model="form.nickname" :maxlength="MAX_NICKNAME" placeholder="昵称（必填）" class="field" />
        <el-input v-model="form.email" maxlength="120" placeholder="邮箱（选填，不会公开）" class="field" />
      </div>
      <el-input
        ref="replyInputRef"
        v-model="form.content"
        type="textarea"
        :rows="4"
        :maxlength="MAX_CONTENT"
        :placeholder="replyPlaceholder"
        resize="none"
      />
      <div class="form-foot">
        <span class="form-hint">
          <template v-if="submitted">已提交，等待站长审核通过后展示</template>
          <template v-else-if="remaining <= 200">还可以输入 {{ remaining }} 字</template>
        </span>
        <el-button type="primary" native-type="submit" :loading="submitting">
          {{ replyTarget ? '发表回复' : '发表评论' }}
        </el-button>
      </div>
    </form>

    <!-- 列表 -->
    <el-skeleton v-if="loading" :rows="4" animated class="comments-skeleton" />

    <p v-else-if="failed" class="comments-empty">{{ failed }}</p>

    <p v-else-if="!comments.length" class="comments-empty">还没有评论，来说两句吧</p>

    <ol v-else class="comment-list">
      <li v-for="item in comments" :key="item.id" class="comment-item">
        <span class="avatar" :style="{ background: avatarColor(item.nickname) }">{{ avatarText(item.nickname) }}</span>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-nickname">{{ item.nickname }}</span>
            <time class="comment-time">{{ formatTime(item.createdAt) }}</time>
          </div>
          <p class="comment-text">{{ item.content }}</p>
          <button type="button" class="reply-btn" @click="startReply(item)">回复</button>

          <ul v-if="item.replies && item.replies.length" class="reply-list">
            <li v-for="reply in item.replies" :key="reply.id" class="reply-item">
              <span class="avatar small" :style="{ background: avatarColor(reply.nickname) }">
                {{ avatarText(reply.nickname) }}
              </span>
              <div class="comment-body">
                <div class="comment-meta">
                  <span class="comment-nickname">{{ reply.nickname }}</span>
                  <span v-if="reply.replyToNickname" class="reply-to">回复 @{{ reply.replyToNickname }}</span>
                  <time class="comment-time">{{ formatTime(reply.createdAt) }}</time>
                </div>
                <p class="comment-text">{{ reply.content }}</p>
                <button type="button" class="reply-btn" @click="startReply(reply)">回复</button>
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ol>

    <AppPagination
      v-if="total > PAGE_SIZE"
      :total="total"
      :page="page"
      :size="PAGE_SIZE"
      @change="changePage"
    />
  </section>
</template>

<style scoped>
.comments {
  margin-top: 18px;
  padding: 22px 24px 24px;
  /* 「直达评论」滚动定位后留一点上边距，不贴屏幕顶 */
  scroll-margin-top: 16px;
}

.comments-head {
  margin-bottom: 16px;
}

.comments-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow);
}

.comments-count {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-on-dark-3);
}

.comments-tip {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--text-on-dark-3);
  text-shadow: var(--text-on-dark-shadow);
}

/* ===== 表单 ===== */
.comment-form {
  padding: 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
}

.reply-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  padding: 7px 12px;
  border-radius: 8px;
  background: rgba(96, 165, 250, 0.16);
  border: 1px solid rgba(147, 197, 253, 0.35);
  font-size: 13px;
  color: var(--text-on-dark-2);
}

.reply-banner b {
  color: #bfe0ff;
}

.reply-cancel {
  border: none;
  background: none;
  padding: 0;
  font-size: 12.5px;
  color: var(--text-on-dark-3);
  cursor: pointer;
  text-decoration: underline;
}

.reply-cancel:hover {
  color: #fff;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}

.form-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.form-hint {
  font-size: 12.5px;
  color: var(--text-on-dark-3);
}

/* 输入框：与导航搜索框一致的半透明玻璃（深色卡上不出现白底） */
.comments :deep(.el-input__wrapper),
.comments :deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--text-on-dark-1);
  transition: border-color 0.16s ease, background-color 0.16s ease;
}

.comments :deep(.el-input__wrapper.is-focus),
.comments :deep(.el-textarea__inner:focus) {
  border-color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.14);
  box-shadow: none;
}

.comments :deep(.el-input__inner),
.comments :deep(.el-textarea__inner) {
  color: var(--text-on-dark-1);
  font-family: inherit;
}

.comments :deep(.el-input__inner::placeholder),
.comments :deep(.el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.55);
}

.comments :deep(.el-input__count),
.comments :deep(.el-textarea .el-input__count) {
  background: transparent;
  color: var(--text-on-dark-3);
  font-size: 11.5px;
}

/* ===== 列表 ===== */
.comments-skeleton {
  margin-top: 16px;
}

.comments-empty {
  margin: 18px 0 4px;
  text-align: center;
  font-size: 13.5px;
  color: var(--text-on-dark-3);
  text-shadow: var(--text-on-dark-shadow);
}

.comment-list {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
}

.comment-item,
.reply-item {
  display: flex;
  gap: 12px;
}

.comment-item + .comment-item {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 50%;
  font-size: 16px;
  font-weight: 700;
  color: #10202f;
  text-shadow: none;
  user-select: none;
}

.avatar.small {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  font-size: 13px;
}

.comment-body {
  flex: 1;
  min-width: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
}

.comment-nickname {
  font-weight: 700;
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow);
}

.comment-time {
  font-size: 12px;
  color: var(--text-on-dark-3);
  font-variant-numeric: tabular-nums;
}

.reply-to {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(147, 197, 253, 0.18);
  color: #bfe0ff;
}

.comment-text {
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-on-dark-2);
  white-space: pre-wrap;
  word-break: break-word;
}

.reply-btn {
  margin-top: 4px;
  padding: 0;
  border: none;
  background: none;
  font-size: 12.5px;
  color: rgba(147, 197, 253, 0.9);
  cursor: pointer;
  transition: color 0.16s ease;
}

.reply-btn:hover {
  color: #fff;
  text-decoration: underline;
}

/* 楼中楼：一级评论下平铺回复，靠「回复 @xx」体现层级 */
.reply-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 12px 0 0 0;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
}

.reply-item + .reply-item {
  margin-top: 12px;
}

@media (max-width: 768px) {
  .comments {
    padding: 18px 16px 20px;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .avatar {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    font-size: 14px;
  }
}
</style>
