/**
 * 轻量 SEO：动态设置标题与 meta 标签（无第三方依赖）。
 */
export interface SeoOptions {
  title?: string
  description?: string
  keywords?: string
  image?: string
  type?: 'website' | 'article'
  url?: string
}

function setMeta(attr: 'name' | 'property', key: string, content?: string | null) {
  if (!content) return
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function useSeo(options: SeoOptions) {
  const siteName = (document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')) || '我的个人网站'
  const title = options.title ? `${options.title} · ${siteName}` : siteName
  document.title = title

  setMeta('name', 'description', options.description)
  setMeta('name', 'keywords', options.keywords)

  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', options.description)
  setMeta('property', 'og:type', options.type || 'website')
  setMeta('property', 'og:image', options.image)
  setMeta('property', 'og:url', options.url || location.href)
  setMeta('name', 'twitter:card', options.image ? 'summary_large_image' : 'summary')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', options.description)
}
