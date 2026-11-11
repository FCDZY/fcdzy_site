/**
 * 阅读时长 / 字数统计。
 *
 * 规则：
 * - 代码块、行内代码、图片不计入（读者不会逐行读代码）
 * - 链接只保留文字
 * - 中文按 400 字/分钟，英文单词按 1.5 个中文折算
 */
export interface ReadingStats {
  /** 字数（中文按字、英文按词） */
  chars: number
  /** 预计阅读分钟数（至少 1，空内容为 0） */
  minutes: number
}

const CJK = /[\u4e00-\u9fa5]/g
const LATIN = /[A-Za-z][A-Za-z0-9'_-]*/g

export function readingStats(markdown?: string | null): ReadingStats {
  if (!markdown) {
    return { chars: 0, minutes: 0 }
  }

  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ') // 围栏代码块
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ') // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ') // 标题井号
    .replace(/^\s{0,3}>\s?/gm, ' ') // 引用
    .replace(/^\s*[-*+]\s+/gm, ' ') // 无序列表
    .replace(/^\s*\d+\.\s+/gm, ' ') // 有序列表
    .replace(/^\s*\|.*\|\s*$/gm, ' ') // 表格行
    .replace(/[-*_~|>#]/g, ' ') // 残留的标记符号

  const cjk = (text.match(CJK) || []).length
  const latin = (text.match(LATIN) || []).length
  const chars = cjk + latin
  if (chars === 0) {
    return { chars: 0, minutes: 0 }
  }
  const minutes = Math.max(1, Math.round((cjk + latin * 1.5) / 400))
  return { chars, minutes }
}

/** 1240 → 1,240 */
export function formatChars(value: number): string {
  return Number(value || 0).toLocaleString('zh-CN')
}
