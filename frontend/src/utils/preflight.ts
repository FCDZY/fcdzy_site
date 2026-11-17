import { looseAnchor, normalizeAnchor } from './anchor'
import { extractHeadings } from './headings'

/**
 * 发布前自检。
 *
 * 只做「能在本地算出来」的检查（纯字符串/正则，10 毫秒级），
 * 图片可达性单独用 checkImages（走浏览器 Image 对象，不依赖后端）。
 */
export interface PreflightIssue {
  level: 'error' | 'warn'
  text: string
}

const FENCE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/gm
const ANCHOR_LINK = /\]\(\s*#([^)\s]+)\s*\)/g
const EMPTY_LINK = /\[[^\]]*\]\(\s*\)/g
/** 只匹配「围栏后没有语言标记」的行 */

/** 锚点能否对上某个标题（和前台渲染同一套归一化 + 宽松匹配） */
function anchorMatches(anchor: string, headingIds: string[]): boolean {
  const normalized = normalizeAnchor(anchor)
  const loose = looseAnchor(anchor)
  for (const id of headingIds) {
    if (
      normalizeAnchor(id) === normalized ||
      normalizeAnchor(id) === normalized.replace(/-\d+$/, '') ||
      looseAnchor(id) === loose
    ) {
      return true
    }
  }
  return false
}

export function checkArticle(content?: string | null): PreflightIssue[] {
  const source = String(content || '')
  const issues: PreflightIssue[] = []
  if (!source.trim()) {
    return [{ level: 'error', text: '正文是空的' }]
  }

  const headings = extractHeadings(source)

  // ① 失效锚点
  const brokenAnchors: string[] = []
  for (const matched of source.matchAll(ANCHOR_LINK)) {
    const anchor = matched[1]
    if (!anchorMatches(anchor, headings.map((h) => h.id))) {
      brokenAnchors.push(anchor)
    }
  }
  for (const anchor of Array.from(new Set(brokenAnchors))) {
    issues.push({ level: 'warn', text: `锚点 #${anchor} 找不到对应标题（点进去会提示「该章节不存在」）` })
  }

  // ② 标题层级跳级（h1 → h3）
  const levels = Array.from(source.replace(FENCE, '').matchAll(HEADING_LINE)).map((m) => m[1].length)
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] - levels[i - 1] > 1) {
      issues.push({ level: 'warn', text: `标题层级跳级：从 h${levels[i - 1]} 直接到 h${levels[i]}` })
      break
    }
  }

  // ③ 代码块没写语言（不高亮）——只数「开始围栏」，结束围栏不算
  let insideFence = false
  let noLangFences = 0
  for (const line of source.split(/\r?\n/)) {
    const matched = /^\s*(`{3,}|~{3,})\s*(.*)$/.exec(line)
    if (!matched) continue
    if (!insideFence) {
      insideFence = true
      if (!matched[2].trim()) noLangFences += 1
    } else {
      insideFence = false
    }
  }
  if (noLangFences > 0) {
    issues.push({ level: 'warn', text: `有 ${noLangFences} 个代码块没写语言标记（不会语法高亮，例如 \`\`\`java）` })
  }

  // ④ 空链接
  const emptyLinks = source.match(EMPTY_LINK) || []
  if (emptyLinks.length > 0) {
    issues.push({ level: 'warn', text: `有 ${emptyLinks.length} 个链接地址是空的` })
  }

  // ⑤ 图片没有 alt（对 SEO / 无障碍不友好）
  const images = Array.from(source.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g))
  const noAlt = images.filter((m) => !m[1].trim()).length
  if (noAlt > 0) {
    issues.push({ level: 'warn', text: `有 ${noAlt} 张图片没有写替代文字（alt）` })
  }

  if (issues.length === 0) {
    return []
  }
  return issues
}

/** 提取正文里的图片地址（去重，最多前 12 张用于检查） */
export function imageUrlsOf(content?: string | null): string[] {
  const source = String(content || '')
  const urls = new Set<string>()
  for (const matched of source.matchAll(/!\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    const url = matched[1]
    if (/^https?:\/\//i.test(url) || url.startsWith('/')) {
      urls.add(url)
    }
  }
  return Array.from(urls).slice(0, 12)
}

/**
 * 检查图片能否加载。
 * 用浏览器 Image 对象探测：不依赖 CORS，也不需要后端转发（不会引入 SSRF 风险）。
 */
export async function checkImages(urls: string[], timeoutMs = 6000): Promise<string[]> {
  const failed: string[] = []
  await Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const image = new Image()
          let settled = false
          const done = (ok: boolean) => {
            if (settled) return
            settled = true
            if (!ok) failed.push(url)
            resolve()
          }
          const timer = window.setTimeout(() => done(true), timeoutMs) // 超时不算失败，避免误报
          image.onload = () => {
            window.clearTimeout(timer)
            done(true)
          }
          image.onerror = () => {
            window.clearTimeout(timer)
            done(false)
          }
          image.src = url
        })
    )
  )
  return failed
}
