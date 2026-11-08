<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { codeTextOf, renderMarkdown } from '@/composables/useMarkdown'
import { renderMermaidBlocks } from '@/composables/useMermaid'
import { useTheme } from '@/composables/useTheme'
import ArticleToc from '@/components/ArticleToc.vue'

const props = withDefaults(
  defineProps<{
    content?: string | null
    showToc?: boolean
  }>(),
  { showToc: false }
)

const result = computed(() => renderMarkdown(props.content))
/** 目录项：正文提取出的 h1 / h2 / h3 */
const toc = computed(() => result.value.toc)

const bodyRef = ref<HTMLElement>()
const { theme } = useTheme()

/** 把正文里的 mermaid 代码块渲染成流程图（只有出现 .mermaid-block 时才会去加载 mermaid） */
function paintMermaid(force = false) {
  renderMermaidBlocks(bodyRef.value, theme.value, force)
}

onMounted(() => {
  nextTick(() => paintMermaid())
})

watch(
  () => result.value.html,
  () => nextTick(() => paintMermaid())
)

// 切换深色/浅色时用对应主题重新渲染，否则流程图配色会和页面不搭
watch(theme, () => nextTick(() => paintMermaid(true)))

/** 长代码折叠/展开（事件委托，代码块由 v-html 渲染） */
function toggleFold(button: HTMLElement) {
  const wrap = button.closest('.code-wrap') as HTMLElement | null
  if (!wrap) return
  const collapsed = wrap.classList.toggle('is-collapsed')
  const total = wrap.dataset.lines || ''
  button.textContent = collapsed ? `展开全部 ${total} 行` : '收起'
}

/** 复制代码（事件委托，代码块由 v-html 渲染） */
async function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null

  const foldToggle = target?.closest?.('.code-fold-toggle') as HTMLElement | null
  if (foldToggle) {
    toggleFold(foldToggle)
    return
  }

  const button = target?.closest?.('.code-copy') as HTMLElement | null
  if (!button) return
  const pre = button.closest('pre')
  if (!pre) return
  const text = codeTextOf(pre as HTMLElement)

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      throw new Error('clipboard unavailable')
    }
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  const label = button.querySelector('span') ?? button
  if (button.dataset.copied === '1') return
  const original = label.textContent ?? '复制'
  button.dataset.copied = '1'
  button.classList.add('is-copied')
  label.textContent = '已复制'
  window.setTimeout(() => {
    button.classList.remove('is-copied')
    label.textContent = original
    delete button.dataset.copied
  }, 1600)
}
</script>

<template>
  <div class="markdown-wrap">
    <!-- 悬浮目录（自动提取 h1/h2/h3，滚动高亮、可收起） -->
    <ArticleToc v-if="props.showToc && toc.length" :items="toc" />
    <div ref="bodyRef" class="markdown-body" v-html="result.html" @click="handleClick"></div>
  </div>
</template>

<style scoped>
.markdown-wrap {
  display: block;
}

/* ===== mermaid 流程图 ===== */
.markdown-body :deep(.mermaid-block) {
  margin: 1.1em 0;
  padding: 14px 12px;
  overflow-x: auto;
  text-align: center;
  border: 1px solid var(--code-border);
  border-radius: 10px;
  background: var(--code-bg);
}

.markdown-body :deep(.mermaid-block svg) {
  max-width: 100%;
  height: auto;
}

/* 渲染前/渲染失败时显示的源码：弱化，不抢正文视觉 */
.markdown-body :deep(.mermaid-block .mermaid-src) {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  overflow-x: auto;
  text-align: left;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.markdown-body :deep(.mermaid-block.is-rendered .mermaid-src) {
  display: none;
}

.markdown-body :deep(.mermaid-block .mermaid-error-tip) {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  color: #e6a23c;
}
</style>
