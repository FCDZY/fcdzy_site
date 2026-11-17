import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import { normalizeAnchor } from '@/utils/anchor'
import { IMAGE_PRESETS, optimizeImage } from '@/utils/image'
import { plainText } from '@/utils/text'

export { plainText }

/**
 * 把 highlight.js 的高亮结果按行拆分。
 * 跨行的 span（如多行注释）会在换行处闭合、下一行重新打开，保证每行 HTML 结构完整。
 */
function splitHighlightedLines(html: string): string[] {
  const lines: string[] = []
  const stack: string[] = []
  let current = ''
  let index = 0

  while (index < html.length) {
    const char = html[index]

    if (char === '<') {
      const end = html.indexOf('>', index)
      if (end === -1) {
        current += char
        index += 1
        continue
      }
      const tag = html.slice(index, end + 1)
      if (tag.startsWith('</')) {
        stack.pop()
      } else if (!tag.endsWith('/>')) {
        stack.push(tag)
      }
      current += tag
      index = end + 1
      continue
    }

    if (char === '\n') {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        current += '</span>'
      }
      lines.push(current)
      current = stack.join('')
      index += 1
      continue
    }

    current += char
    index += 1
  }

  lines.push(current)
  return lines
}

/** 超过这个行数的代码块默认折叠 */
const CODE_FOLD_LINES = 30

/**
 * 从围栏信息里解析要高亮的行号，支持 `{2,5-7,10}` 写法。
 * 只接受纯数字/逗号/短横线，避免把 TS 泛型之类的 `{}` 误当成行号。
 */
function parseHighlightLines(info: string): Set<number> {
  const lines = new Set<number>()
  const matched = /\{\s*([\d,\s-]+)\s*\}/.exec(info || '')
  if (!matched) return lines
  for (const part of matched[1].split(',')) {
    const piece = part.trim()
    if (!piece) continue
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(piece)
    if (range) {
      const from = Math.min(Number(range[1]), Number(range[2]))
      const to = Math.max(Number(range[1]), Number(range[2]))
      for (let n = from; n <= to; n += 1) lines.add(n)
    } else if (/^\d+$/.test(piece)) {
      lines.add(Number(piece))
    }
  }
  return lines
}

/**
 * 渲染 fenced 代码块：语言标签 + 行号 + 一键复制按钮。
 * - 支持 `{2,5-7}` 行内高亮（加 is-hl）
 * - 行数超过 CODE_FOLD_LINES 时包一层 .code-wrap，默认折叠（只从尾部隐藏，行号保持连续）
 */
function renderCodeBlock(code: string, lang: string, info = ''): string {
  // 围栏内容总以换行结尾，去掉它，否则每块代码末尾都会多一个空行号，
  // 也会让 `{n}` 行号与真实行差一。
  const source = code.endsWith('\n') ? code.slice(0, -1) : code
  const language = lang && hljs.getLanguage(lang) ? lang : ''
  let highlighted: string
  if (language) {
    try {
      highlighted = hljs.highlight(source, { language, ignoreIllegals: true }).value
    } catch {
      highlighted = md.utils.escapeHtml(source)
    }
  } else {
    highlighted = md.utils.escapeHtml(source)
  }

  const highlightLines = parseHighlightLines(info)
  const lines = splitHighlightedLines(highlighted)
  const body = lines
    .map((line, index) => {
      const marked = highlightLines.has(index + 1) ? ' is-hl' : ''
      return `<span class="code-line${marked}">${line}</span>`
    })
    .join('')
  const langAttr = language ? ` data-lang="${language}"` : ''
  const langClass = language ? ` class="language-${language}"` : ''

  const pre =
    `<pre class="hljs code-block"${langAttr}>` +
    `<button class="code-copy" type="button" aria-label="复制代码"><span>复制</span></button>` +
    `<code${langClass}>${body}</code></pre>`

  if (lines.length <= CODE_FOLD_LINES) {
    return pre
  }
  // 长代码：默认折叠，把完整代码留在 DOM 里（复制仍拿到全文）
  return (
    `<div class="code-wrap is-collapsed" data-lines="${lines.length}">` +
    pre +
    `<button class="code-fold-toggle" type="button">展开全部 ${lines.length} 行</button>` +
    `</div>`
  )
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  highlight: renderCodeBlock
})

/** mermaid 代码块的「占位壳」：先把源码留在 DOM 里，前台再异步渲染成 SVG（失败也能看到源码） */
function renderMermaidPlaceholder(code: string): string {
  return `<div class="mermaid-block"><pre class="mermaid-src">${md.utils.escapeHtml(code)}</pre></div>`
}

/**
 * 接管 fenced 代码块：
 * - ```mermaid → 输出流程图占位块，由 useMermaid 异步渲染（懒加载 mermaid）
 * - 其它语言 → 原来的高亮 + 行号 + 复制按钮
 */
md.renderer.rules.fence = (tokens, idx): string => {
  const token = tokens[idx]
  const info = (token.info || '').trim()
  const lang = info.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (lang === 'mermaid') {
    return renderMermaidPlaceholder(token.content)
  }
  return renderCodeBlock(token.content, lang, info)
}

export interface TocItem {
  id: string
  text: string
  level: number
}

export interface RenderResult {
  html: string
  toc: TocItem[]
}

function slugifyHeading(text: string): string {
  return normalizeAnchor(text)
}

/** 标题尾部的显式锚点：## 标题 {#custom-id} */
const EXPLICIT_ID = /\s*\{#([A-Za-z0-9_\-:.\u4e00-\u9fa5]+)\}\s*$/

/** 把 {#custom-id} 从标题里剥掉，但不破坏标题内部的加粗/行内代码等格式 */
function stripExplicitId(heading: Element, fallbackText: string) {
  const children = Array.from(heading.childNodes)
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const node = children[i]
    if (node.nodeType === 3) {
      const value = node.nodeValue || ''
      if (EXPLICIT_ID.test(value)) {
        node.nodeValue = value.replace(EXPLICIT_ID, '')
        return
      }
    }
  }
  // 极端情况（{#id} 被包在 <code>/<em> 里）：整体回退成纯文本
  heading.textContent = fallbackText
}

/** 渲染 Markdown，并顺带抽取目录（同时给标题写入锚点 id） */
export function renderMarkdown(content?: string | null): RenderResult {
  if (!content) {
    return { html: '', toc: [] }
  }
  const raw = md.render(content)
  const clean = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'id', 'class', 'type', 'data-lang', 'aria-label'],
    ADD_TAGS: ['iframe', 'button']
  })

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { html: clean, toc: [] }
  }

  const doc = new DOMParser().parseFromString(`<div id="__root">${clean}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  const toc: TocItem[] = []
  if (root) {
    const headings = Array.from(root.querySelectorAll('h1, h2, h3'))
    /** 同名标题按出现顺序追加 -2 / -3，保证 id 唯一且第一个不带后缀（可预测、可手写） */
    const used = new Map<string, number>()
    headings.forEach((heading, index) => {
      // 目录文字要在插入 # 锚点之前取，否则会把符号也带进目录
      const rawText = heading.textContent || `标题${index + 1}`
      // 支持显式锚点：## 标题 {#自定义id}（Docusaurus / Pandoc 风格）
      const explicit = EXPLICIT_ID.exec(rawText)
      let text = rawText
      let base: string
      if (explicit) {
        text = rawText.replace(EXPLICIT_ID, '').trim()
        base = explicit[1]
        stripExplicitId(heading, text)
      } else {
        base = slugifyHeading(text)
      }
      const seen = used.get(base) || 0
      used.set(base, seen + 1)
      const id = seen === 0 ? base : `${base}-${seen + 1}`
      heading.setAttribute('id', id)
      toc.push({ id, text: text || `标题${index + 1}`, level: Number(heading.tagName.substring(1)) })

      // 标题旁的 # 锚点：hover 才显示，点击复制本章节链接
      const anchor = doc.createElement('a')
      anchor.className = 'heading-anchor'
      anchor.setAttribute('href', `#${id}`)
      anchor.setAttribute('aria-label', '复制本章节链接')
      anchor.setAttribute('title', '复制本章节链接')
      // 符号用 CSS ::before 画，不放文本节点：
      // 否则标题的 textContent 会带上 "#"，污染目录文字 / 搜索高亮 / 复制
      heading.appendChild(anchor)
    })
    root.querySelectorAll('a[href^="http"]').forEach((link) => {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    })
    root.querySelectorAll('img').forEach((img) => {
      img.setAttribute('loading', 'lazy')
      img.setAttribute('decoding', 'async')
      // OSS 图片走实时缩放 + WebP；原图地址留在 data-raw-src，灯箱用它看大图
      const raw = img.getAttribute('src') || ''
      const optimized = optimizeImage(raw, IMAGE_PRESETS.content)
      if (optimized && optimized !== raw) {
        img.setAttribute('data-raw-src', raw)
        img.setAttribute('src', optimized)
      }
    })
  }
  return { html: root ? root.innerHTML : clean, toc }
}

/** 取出代码块中的纯文本（按行拼接，不含行号与按钮文字） */
export function codeTextOf(pre: HTMLElement): string {
  const code = pre.querySelector('code')
  if (!code) return ''
  const lineNodes = code.querySelectorAll('.code-line')
  if (lineNodes.length) {
    return Array.from(lineNodes)
      .map((line) => line.textContent ?? '')
      .join('\n')
  }
  return code.textContent ?? ''
}
