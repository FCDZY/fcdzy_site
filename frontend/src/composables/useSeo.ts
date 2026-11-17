/**
 * 轻量 SEO：动态设置标题与 meta 标签（无第三方依赖）。
 */
import { SITE_NAME, SITE_SHORT_NAME } from '@/constants/site'

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
  // 标签页用短名（FCDZY），否则长名字会被浏览器截断成 "FCDZY个…"
  const shortName = SITE_SHORT_NAME
  const title = options.title ? `${options.title} · ${shortName}` : shortName
  document.title = title

  // og:site_name 保持完整站名，社交分享卡片上仍显示全称
  setMeta('property', 'og:site_name', SITE_NAME)

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
