import type { TocItem } from '@/composables/useMarkdown'

/** 目录树节点：标题 + 它的下一级标题 */
export interface TocNode {
  item: TocItem
  children: TocNode[]
}

/** 把扁平的标题列表按 level 折成树（level 跳跃也能接上最近的祖先） */
export function buildTocTree(items: TocItem[]): TocNode[] {
  const roots: TocNode[] = []
  const stack: TocNode[] = []

  for (const item of items) {
    const node: TocNode = { item, children: [] }
    while (stack.length && stack[stack.length - 1].item.level >= item.level) {
      stack.pop()
    }
    if (stack.length) {
      stack[stack.length - 1].children.push(node)
    } else {
      roots.push(node)
    }
    stack.push(node)
  }

  return roots
}

/** 找出某个标题到根的整条祖先链（含自己之外的所有祖先） */
export function findAncestorIds(nodes: TocNode[], targetId: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.item.id === targetId) return trail
    const found = findAncestorIds(node.children, targetId, [...trail, node.item.id])
    if (found) return found
  }
  return null
}
