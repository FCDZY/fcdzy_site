import { normalizeAnchor } from './anchor'

/**
 * 从 Markdown 里抽出所有标题及其锚点 id。
 *
 * 规则必须和渲染端（composables/useMarkdown.ts）保持一致，否则后台显示/插入的锚点会跳错位置：
 * - 跳过代码块里的 #（围栏内容不算标题）
 * - 支持尾部显式锚点 `## 标题 {#custom-id}`
 * - 无显式锚点时按 normalizeAnchor 归一化
 * - 同名标题按出现顺序追加 -2 / -3（第一个不加后缀）
 */
export interface HeadingItem {
  level: number
  text: string
  id: string
}

const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/
const EXPLICIT_ID = /\s*\{#([A-Za-z0-9_\-:.\u4e00-\u9fa5]+)\}\s*$/

export function extractHeadings(markdown?: string | null): HeadingItem[] {
  const source = String(markdown || '').replace(FENCE, '')
  const used = new Map<string, number>()
  const items: HeadingItem[] = []

  for (const line of source.split(/\r?\n/)) {
    const matched = HEADING_LINE.exec(line)
    if (!matched) continue

    const level = matched[1].length
    let text = matched[2].trim()
    const explicit = EXPLICIT_ID.exec(text)
    let base: string
    if (explicit) {
      text = text.replace(EXPLICIT_ID, '').trim()
      base = explicit[1]
    } else {
      base = normalizeAnchor(text)
    }

    const seen = used.get(base) || 0
    used.set(base, seen + 1)
    const id = seen === 0 ? base : `${base}-${seen + 1}`
    items.push({ level, text: text || `标题${items.length + 1}`, id })
  }

  return items
}
