<script setup lang="ts">
import type { TocNode } from './toc-tree'

/**
 * 目录树的一层（自引用递归渲染）：
 * - 有子项的行带箭头，点击展开 / 收起，各层独立
 * - 缩进由外层 <ul> 的 padding-left 逐级累加
 * - 当前阅读条目高亮；它的祖先行保留一条浅色左边线
 */
defineOptions({ name: 'TocTree' })

const props = defineProps<{
  nodes: TocNode[]
  activeId: string
  openIds: string[]
  depth?: number
}>()

const emit = defineEmits<{ toggle: [id: string]; navigate: [id: string] }>()

function isOpen(id: string) {
  return props.openIds.includes(id)
}

/** 这一行下面是否包含当前阅读条目 */
function containsActive(node: TocNode): boolean {
  if (node.item.id === props.activeId) return true
  return node.children.some(containsActive)
}
</script>

<template>
  <ul class="toc-branch" :class="depth ? 'is-nested' : 'is-root'">
    <li v-for="node in nodes" :key="node.item.id" class="toc-item">
      <div
        class="toc-line"
        :class="{
          'is-active': node.item.id === activeId,
          'is-ancestor': node.item.id !== activeId && containsActive(node)
        }"
      >
        <button
          v-if="node.children.length"
          class="toc-caret-btn"
          type="button"
          :aria-expanded="isOpen(node.item.id)"
          :aria-label="isOpen(node.item.id) ? '收起本节' : '展开本节'"
          @click="emit('toggle', node.item.id)"
        >
          <el-icon :size="10" class="toc-caret" :class="{ open: isOpen(node.item.id) }">
            <ArrowRight />
          </el-icon>
        </button>
        <span v-else class="toc-caret-btn is-ghost" aria-hidden="true" />

        <a
          :href="`#${node.item.id}`"
          class="toc-link"
          :class="`depth-${Math.min(depth || 0, 4)}`"
          @click.prevent="emit('navigate', node.item.id)"
        >
          {{ node.item.text }}
        </a>
      </div>

      <TocTree
        v-if="node.children.length && isOpen(node.item.id)"
        :nodes="node.children"
        :active-id="activeId"
        :open-ids="openIds"
        :depth="(depth || 0) + 1"
        @toggle="emit('toggle', $event)"
        @navigate="emit('navigate', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.toc-branch {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每深一层缩进 11px，靠嵌套 ul 的 padding 累加 */
.toc-branch.is-nested {
  padding-left: 11px;
}

.toc-line {
  display: flex;
  align-items: flex-start;
  border-left: 2px solid transparent;
  border-radius: 6px;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.toc-line:hover {
  background: var(--brand-soft-2);
}

.toc-line.is-active {
  border-left-color: var(--brand);
  background: var(--brand-soft-2);
}

/* 当前条目被折叠在里面时，让这条祖先也带上品牌色，否则会「找不到自己在哪」 */
.toc-line.is-ancestor {
  border-left-color: var(--brand);
}

.toc-line.is-ancestor .toc-link {
  color: var(--brand-dark);
}

.toc-caret-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.toc-caret-btn:hover {
  color: var(--brand-dark);
}

.toc-caret-btn.is-ghost {
  cursor: default;
}

.toc-caret {
  transition: transform 0.16s ease;
}

.toc-caret.open {
  transform: rotate(90deg);
}

.toc-link {
  flex: 1;
  min-width: 0;
  padding: 5px 8px 5px 1px;
  border-radius: 5px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
  transition: color 0.16s ease;
}

/* 层级越深字越小、颜色越淡 */
.toc-link.depth-0 {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-1);
  padding-top: 6px;
  padding-bottom: 6px;
}

.toc-link.depth-1 {
  font-size: 13px;
  font-weight: 500;
}

.toc-link.depth-2 {
  font-size: 12.5px;
  color: var(--text-3);
}

.toc-link.depth-3,
.toc-link.depth-4 {
  font-size: 12px;
  color: var(--text-3);
}

.toc-line:hover .toc-link {
  color: var(--brand-dark);
}

.toc-line.is-active .toc-link {
  color: var(--brand-dark);
  font-weight: 600;
}
</style>
