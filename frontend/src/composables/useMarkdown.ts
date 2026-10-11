import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
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

/**
 * 渲染 fenced 代码块：语言标签 + 行号 + 一键复制按钮。
 * 返回值以 <pre 开头，markdown-it 会直接采用而不再包一层。
 */
function renderCodeBlock(code: string, lang: string): string {
  const language = lang && hljs.getLanguage(lang) ? lang : ''
  let highlighted: string
  if (language) {
    try {
      highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      highlighted = md.utils.escapeHtml(code)
    }
  } else {
    highlighted = md.utils.escapeHtml(code)
  }

  const body = splitHighlightedLines(highlighted)
    .map((line) => `<span class="code-line">${line}</span>`)
    .join('')
  const langAttr = language ? ` data-lang="${language}"` : ''
  const langClass = language ? ` class="language-${language}"` : ''

  return (
    `<pre class="hljs code-block"${langAttr}>` +
    `<button class="code-copy" type="button" aria-label="复制代码"><span>复制</span></button>` +
    `<code${langClass}>${body}</code></pre>`
  )
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  highlight: renderCodeBlock
})

export interface TocItem {
  id: string
  text: string
  level: number
}

export interface RenderResult {
  html: string
  toc: TocItem[]
}

function slugifyHeading(text: string, index: number): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base ? `${base}-${index}` : `heading-${index}`
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
    headings.forEach((heading, index) => {
      const text = heading.textContent || `标题${index + 1}`
      const id = slugifyHeading(text, index)
      heading.setAttribute('id', id)
      toc.push({ id, text, level: Number(heading.tagName.substring(1)) })
    })
    root.querySelectorAll('a[href^="http"]').forEach((link) => {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    })
    root.querySelectorAll('img').forEach((img) => {
      img.setAttribute('loading', 'lazy')
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
