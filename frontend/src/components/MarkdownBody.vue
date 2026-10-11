<script setup lang="ts">
import { computed } from 'vue'
import { codeTextOf, renderMarkdown } from '@/composables/useMarkdown'

const props = withDefaults(
  defineProps<{
    content?: string | null
    showToc?: boolean
  }>(),
  { showToc: false }
)

const result = computed(() => renderMarkdown(props.content))
const toc = computed(() => result.value.toc.filter((item) => item.level >= 2))

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
  <div class="markdown-wrap" :class="{ 'with-toc': props.showToc && toc.length > 2 }">
    <aside v-if="props.showToc && toc.length > 2" class="toc card">
      <div class="toc-title">目录</div>
      <ul>
        <li v-for="item in toc" :key="item.id" :class="`level-${item.level}`">
          <a :href="`#${item.id}`">{{ item.text }}</a>
        </li>
      </ul>
    </aside>
    <div class="markdown-body" v-html="result.html" @click="handleClick"></div>
  </div>
</template>

<style scoped>
.markdown-wrap {
  display: block;
}

.markdown-wrap.with-toc {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.toc {
  position: sticky;
  top: calc(var(--header-height) + 16px);
  padding: 14px;
  max-height: calc(100vh - var(--header-height) - 40px);
  overflow: auto;
  font-size: 13.5px;
}

.toc-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-2);
}

.toc ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.toc li {
  margin: 5px 0;
  line-height: 1.5;
}

.toc li.level-3 {
  padding-left: 12px;
}

.toc a {
  color: var(--text-2);
}

.toc a:hover {
  color: var(--brand-dark);
}

@media (max-width: 900px) {
  .markdown-wrap.with-toc {
    display: block;
  }

  .toc {
    display: none;
  }
}
</style>
