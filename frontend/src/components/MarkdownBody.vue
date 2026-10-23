<script setup lang="ts">
import { computed } from 'vue'
import { codeTextOf, renderMarkdown } from '@/composables/useMarkdown'
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

/** 复制代码（事件委托，代码块由 v-html 渲染） */
async function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
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
    <div class="markdown-body" v-html="result.html" @click="handleClick"></div>
  </div>
</template>

<style scoped>
.markdown-wrap {
  display: block;
}
</style>
