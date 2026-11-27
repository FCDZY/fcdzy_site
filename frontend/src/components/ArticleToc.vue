<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TocTree from '@/components/TocTree.vue'
import { buildTocTree, findAncestorIds } from '@/components/toc-tree'
import type { TocItem } from '@/composables/useMarkdown'

/**
 * 文章详情页悬浮目录（可折叠树）：
 * - 用正文提取出的 h1 ~ h6 标题折成真正的嵌套树，每一级都能独立折叠
 * - 默认只展开「当前阅读条目」的祖先链，其余折叠
 * - 滚动时自动展开当前条目的祖先，但**绝不自动收起**你手动展开的
 * - 可整体收起 / 展开，偏好记在 localStorage
 * - 宽屏（≥1500px）默认展开在正文左侧留白处，窄屏默认收起为胶囊按钮，避免遮挡正文
 */
const props = defineProps<{ items: TocItem[] }>()

const READING_LINE = 110
const STORAGE_KEY = 'fcdzy_toc_collapsed'
const WIDE_SCREEN = 1500

const collapsed = ref(false)
const activeId = ref('')
const listRef = ref<HTMLElement | null>(null)
/** 已展开的节点 id */
const openIds = ref<string[]>([])
/** 你手动收起过的节点 id：自动展开不再碰它们（C 策略的核心） */
const closedIds = ref<string[]>([])
let ticking = false

/** 正文首个 h1 通常是文章标题（页面上已经有大标题），不进目录 */
const visibleItems = computed(() => {
  const items = props.items
  if (items.length > 1 && items[0].level === 1 && items.some((item) => item.level > 1)) {
    return items.slice(1)
  }
  return items
})

const tree = computed(() => buildTocTree(visibleItems.value))

/** 当前高亮项 + 它的祖先（用于展开 / 高亮路径） */
const activePath = computed(() => {
  if (!activeId.value) return [] as string[]
  const ancestors = findAncestorIds(tree.value, activeId.value) || []
  return [...ancestors, activeId.value]
})

function isOpen(id: string) {
  return openIds.value.includes(id)
}

function openNode(id: string) {
  if (isOpen(id)) return
  openIds.value = [...openIds.value, id]
}

function toggleNode(id: string) {
  if (isOpen(id)) {
    openIds.value = openIds.value.filter((x) => x !== id)
    // 记下「手动收起」，之后的滚动不再把它顶开
    if (!closedIds.value.includes(id)) closedIds.value = [...closedIds.value, id]
    return
  }
  openIds.value = [...openIds.value, id]
  closedIds.value = closedIds.value.filter((x) => x !== id)
}

/** 展开当前条目的祖先链（不收起任何东西） */
function revealActive() {
  const path = activePath.value
  if (!path.length) return
  const wanted = path.slice(0, -1)
  // 当前就在某一个一级标题上时，把这一级展开，否则刚进文章只看得到几个一级标题
  if (path.length === 1) wanted.push(path[0])
  const merged = [...openIds.value]
  for (const id of wanted) {
    if (merged.includes(id) || closedIds.value.includes(id)) continue
    merged.push(id)
  }
  if (merged.length !== openIds.value.length) openIds.value = merged
}

function initCollapsed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === '0' || stored === '1') {
      collapsed.value = stored === '1'
      return
    }
  } catch {
    /* 忽略隐私模式 */
  }
  collapsed.value = window.innerWidth < WIDE_SCREEN
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed.value ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/** 当前阅读章节：取最后一个越过阅读基准线（吸顶导航下方一点）的标题 */
function updateActive() {
  const headings = visibleItems.value
    .map((item) => document.getElementById(item.id))
    .filter((el): el is HTMLElement => !!el)
  if (!headings.length) return

  let current = headings[0].id
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top <= READING_LINE) {
      current = heading.id
    } else {
      break
    }
  }

  // 滚到页面底部时，激活最后一个章节
  const doc = document.documentElement
  if (window.innerHeight + window.scrollY >= doc.scrollHeight - 4) {
    current = headings[headings.length - 1].id
  }

  activeId.value = current
  revealActive()
  keepActiveVisible()
}

/** 目录很长时，让高亮项保持在可视区域内 */
function keepActiveVisible() {
  const list = listRef.value
  if (!list || collapsed.value) return
  const active = list.querySelector<HTMLElement>('.toc-line.is-active')
  if (!active) return
  const listRect = list.getBoundingClientRect()
  const itemRect = active.getBoundingClientRect()
  const outOfView = itemRect.top < listRect.top + 8 || itemRect.bottom > listRect.bottom - 8
  if (!outOfView) return
  const target = list.scrollTop + (itemRect.top - listRect.top) - (listRect.height - itemRect.height) / 2
  list.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}

function onScroll() {
  if (ticking) return
  ticking = true
  window.requestAnimationFrame(() => {
    updateActive()
    ticking = false
  })
}

function goTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  activeId.value = id
  revealActive()
  // 标题自带 scroll-margin-top，会避开吸顶导航
  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  })
  history.replaceState(null, '', `#${id}`)
}

function toggle() {
  collapsed.value = !collapsed.value
  persist()
  if (!collapsed.value) {
    nextTick(updateActive)
  }
}

watch(
  () => props.items,
  () => {
    openIds.value = []
    closedIds.value = []
    nextTick(updateActive)
  }
)

onMounted(() => {
  initCollapsed()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  nextTick(updateActive)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <Teleport to="body">
    <div class="article-toc">
      <button
        v-if="collapsed"
        class="toc-pill"
        type="button"
        aria-label="展开目录"
        title="展开目录"
        @click="toggle"
      >
        <el-icon :size="15"><Expand /></el-icon>
        <span>目录</span>
      </button>

      <nav v-else class="toc-panel" aria-label="文章目录">
        <div class="toc-head">
          <span class="toc-title">目录</span>
          <button class="toc-collapse" type="button" aria-label="收起目录" title="收起目录" @click="toggle">
            <el-icon :size="15"><Fold /></el-icon>
          </button>
        </div>

        <div ref="listRef" class="toc-list">
          <TocTree :nodes="tree" :active-id="activeId" :open-ids="openIds" @toggle="toggleNode" @navigate="goTo" />
        </div>
      </nav>
    </div>
  </Teleport>
</template>

<style scoped>
.article-toc {
  position: fixed;
  top: 92px;
  /* 优先落在正文左侧留白处，空间不足时贴左边距（此时默认收起，不会遮挡正文） */
  left: max(12px, calc((100vw - 1080px) / 2 - 264px));
  z-index: 90;
  width: 276px;
}

/* ===== 展开态 ===== */
.toc-panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 150px);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.toc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 8px 9px 14px;
  border-bottom: 1px solid var(--border);
}

.toc-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.toc-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.toc-collapse:hover {
  color: var(--brand-dark);
  background: var(--brand-soft-2);
}

.toc-list {
  position: relative;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

/* ===== 收起态 ===== */
.toc-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 13px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  box-shadow: var(--shadow-md);
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background-color 0.3s ease,
    transform 0.18s ease;
}

.toc-pill:hover {
  color: var(--brand-dark);
  border-color: var(--chip-border-hover);
  transform: translateY(-2px);
}

@media (max-width: 900px) {
  .article-toc {
    top: auto;
    bottom: 84px;
    left: 12px;
    width: auto;
    max-width: 60vw;
  }

  .toc-panel {
    width: min(260px, 70vw);
    max-height: 46vh;
  }
}
</style>
