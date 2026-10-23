import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { publicApi } from '@/api'
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
      link.href = favicon
    }
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
    const root = document.documentElement
    const light = (config.value.homeHeroImage || '').trim()
    const dark = (config.value.homeHeroImageDark || '').trim()

    const setOrRemove = (name: string, value: string) => {
      if (value) {
        root.style.setProperty(name, `url("${value}")`)
      } else {
        root.style.removeProperty(name)
      }
    }

    setOrRemove('--page-bg-image', light)
    setOrRemove('--page-bg-image-dark', dark || light)

    root.classList.toggle('has-page-bg', Boolean(light || dark))
    root.classList.toggle('page-bg-breath', (config.value.homeHeroAnimation ?? 'true') !== 'false')
  }

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
