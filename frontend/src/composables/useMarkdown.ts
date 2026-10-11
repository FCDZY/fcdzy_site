import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import DOMPurify from 'dompurify'
import { plainText } from '@/utils/text'

export { plainText }

const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  highlight(code: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code class="language-${lang}">${
          hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        }</code></pre>`
      } catch {
        /* 忽略高亮失败，走默认转义 */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
  }
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
    ADD_ATTR: ['target', 'id', 'class'],
    ADD_TAGS: ['iframe']
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
