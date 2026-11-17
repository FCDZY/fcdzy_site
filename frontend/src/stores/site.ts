import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { publicApi } from '@/api'
import { IMAGE_PRESETS, optimizeImage, viewportHeroOptions } from '@/utils/image'
import type { Category, SiteConfig, Tag, Topic } from '@/types'
import { SITE_NAME, SITE_SUBTITLE } from '@/constants/site'

const FALLBACK: SiteConfig = {
  siteDescription: '这是一个使用 SpringBoot + Vue3 搭建的个人网站。',
  siteKeywords: '个人网站,博客,技术分享',
  authorName: '站长',
  authorBio: '',
  footerText: '© 我的个人网站',
  homeBannerTitle: '欢迎来到我的个人网站',
  homeBannerSubtitle: '这里记录我的技术笔记与生活随笔',
  /** 全局固定背景图（浅色，为空时使用默认渐变） */
  homeHeroImage: '',
  /** 深色模式背景图（为空时沿用浅色图） */
  homeHeroImageDark: '',
  /** 背景薄纱呼吸动画开关：'true' / 'false' */
  homeHeroAnimation: 'true'
}

export const useSiteStore = defineStore('site', () => {
  const config = ref<SiteConfig>({ ...FALLBACK })
  const categories = ref<Category[]>([])
  const tags = ref<Tag[]>([])
  const topics = ref<Topic[]>([])
  const loaded = ref(false)

  /** 站点名称/副标题已改为前端常量（后台不再提供这两个配置项） */
  const siteName = computed(() => SITE_NAME)
  const siteSubtitle = computed(() => SITE_SUBTITLE)

  async function loadConfig() {
    try {
      const data = await publicApi.siteConfig()
      config.value = { ...FALLBACK, ...data }
    } catch {
      config.value = { ...FALLBACK }
    }
    applyDocumentMeta()
    applyPageBackground()
  }

  async function loadTaxonomies() {
    const [categoryList, tagList, topicList] = await Promise.all([
      publicApi.categories().catch(() => [] as Category[]),
      publicApi.tags().catch(() => [] as Tag[]),
      publicApi.topics().catch(() => [] as Topic[])
    ])
    categories.value = categoryList
    tags.value = tagList
    topics.value = topicList
  }

  async function init() {
    if (loaded.value) return
    await Promise.all([loadConfig(), loadTaxonomies()])
    loaded.value = true
  }

  function applyDocumentMeta() {
    // 每个页面会通过 useSeo() 写入自己的 title/description，这里只处理站点级信息
    setMeta('property', 'og:site_name', siteName.value)
    const favicon = config.value.siteFavicon
    if (favicon) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        document.head.appendChild(link)
      }
      // favicon 只要 64px 就够，原始 152KB 太大
      link.href = optimizeImage(favicon, IMAGE_PRESETS.favicon)
    }
  }

/** 预加载图片（插 <link rel=preload>），同一地址只插一次 */
const preloaded = new Set<string>()
function preloadImage(url: string) {
  if (!url || preloaded.has(url)) return
  preloaded.add(url)
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = url
  try {
    link.fetchPriority = 'high'
  } catch {
    /* 老浏览器忽略 */
  }
  document.head.appendChild(link)
}

/** 预加载并返回是否成功（成功后好把占位图换成正图） */
function warmImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(false)
      return
    }
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = url
  })
}
  function setMeta(attr: 'name' | 'property', key: string, content: string) {
    let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute(attr, key)
      document.head.appendChild(meta)
    }
    meta.content = content
  }

  /**
   * 把后台配置的背景图挂到 html 的 CSS 变量上（body 背景 + 深色模式备份）。
   * - 未配置时移除内联变量，回落到 main.css 里的默认渐变
   * - 只配置了浅色图时，深色模式沿用同一张图（配合深色薄纱）
   * - homeHeroAnimation 控制背景薄纱的呼吸动画开关
   */
  function applyPageBackground() {
    /*
     * 全站统一为浅色渐变背景（不再使用后台的 Hero 图当页面底图）：
     * Hero 图只出现在首页 Hero 区，底色由 main.css 的 --page-bg-image 渐变承担，
     * 这样首页/列表页/关于页的气质一致，也不会有「图片在正文后面干扰阅读」的问题。
     */
    const root = document.documentElement
    root.style.removeProperty('--page-bg-image')
    root.style.removeProperty('--page-bg-image-dark')
    root.classList.remove('has-page-bg')
    root.classList.remove('page-bg-breath')  }

  function categoryById(id?: number | null) {
    if (!id) return null
    return categories.value.find((item) => item.id === id) || null
  }

  function categoryBySlug(slug?: string | null) {
    if (!slug) return null
    return categories.value.find((item) => item.slug === slug) || null
  }

  function tagBySlug(slug?: string | null) {
    if (!slug) return null
    return tags.value.find((item) => item.slug === slug) || null
  }

  return {
    config,
    categories,
    tags,
    topics,
    loaded,
    siteName,
    siteSubtitle,
    loadConfig,
    loadTaxonomies,
    init,
    categoryById,
    categoryBySlug,
    tagBySlug
  }
})
