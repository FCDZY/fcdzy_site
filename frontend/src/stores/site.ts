import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { publicApi } from '@/api'
import type { Category, SiteConfig, Tag, Topic } from '@/types'

const FALLBACK: SiteConfig = {
  siteName: '我的个人网站',
  siteSubtitle: '记录技术、生活与思考',
  siteDescription: '这是一个使用 SpringBoot + Vue3 搭建的个人网站。',
  siteKeywords: '个人网站,博客,技术分享',
  authorName: '站长',
  authorBio: '',
  footerText: '© 我的个人网站',
  homeBannerTitle: '欢迎来到我的个人网站',
  homeBannerSubtitle: '这里记录我的技术笔记与生活随笔',
  /** 首页 Hero 背景图（为空时使用默认渐变） */
  homeHeroImage: '',
  /** 首页 Hero 背景呼吸动画开关：'true' / 'false' */
  homeHeroAnimation: 'true'
}

export const useSiteStore = defineStore('site', () => {
  const config = ref<SiteConfig>({ ...FALLBACK })
  const categories = ref<Category[]>([])
  const tags = ref<Tag[]>([])
  const topics = ref<Topic[]>([])
  const loaded = ref(false)

  const siteName = computed(() => config.value.siteName || FALLBACK.siteName)
  const siteSubtitle = computed(() => config.value.siteSubtitle || FALLBACK.siteSubtitle)

  async function loadConfig() {
    try {
      const data = await publicApi.siteConfig()
      config.value = { ...FALLBACK, ...data }
    } catch {
      config.value = { ...FALLBACK }
    }
    applyDocumentMeta()
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
