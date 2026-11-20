<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useRoute, useRouter } from 'vue-router'
import { publicApi } from '@/api'
import type { Article, Category, Topic } from '@/types'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'
import { useTheme } from '@/composables/useTheme'
import { IMAGE_PRESETS, optimizeImage } from '@/utils/image'
import TimelineList from '@/components/TimelineList.vue'
import HeroParallax from '@/components/HeroParallax.vue'
import AppPagination from '@/components/AppPagination.vue'
import SiteHeader from '@/components/SiteHeader.vue'

const site = useSiteStore()
const router = useRouter()
const route = useRoute()
const { isDark } = useTheme()

const PAGE_SIZE = 8

/** 个人卡里的搜索框：回车后在本页展示结果，不跳页 */
const profileKeyword = ref('')
/** 当前生效的搜索词（空 = 不在搜索态） */
const activeKeyword = ref('')

async function submitSearch() {
  const value = profileKeyword.value.trim()
  if (!value) {
    await clearSearch()
    return
  }
  activeKeyword.value = value
  profileKeyword.value = value
  /* 搜索与分类/专题互斥：进入搜索态就退出它们 */
  activeCategory.value = null
  activeTopic.value = null
  topicArticles.value = []
  menuOpen.value = false
  topicMenuOpen.value = false
  page.value = 1
  await loadArticles()
  scrollToTop()
  router.replace({ path: '/', query: { keyword: value } })
}

/** 退出搜索态，回到正常首页 */
async function clearSearch() {
  activeKeyword.value = ''
  profileKeyword.value = ''
  page.value = 1
  await loadArticles()
  const query = { ...route.query }
  delete query.keyword
  router.replace({ path: '/', query })
  expandHeroKeepingFeed()
}

const listRef = ref<HTMLElement | null>(null)
const heroRef = ref<HTMLElement | null>(null)

/**
 * Hero 鼠标视差 + 光斑（A + D 方案）
 *  - 图片 scale(1.06) + 位移 ±12px；文字反向位移 30%
 *  - 光斑 240px 白色柔光跟随指针
 *  - 只用 CSS 变量驱动 transform，不触发 Vue 重渲染
 */
const PARALLAX_PX = 12

function onHeroPointer(event: PointerEvent) {
  const hero = heroRef.value
  if (!hero) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const rect = hero.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  const nx = (event.clientX - rect.left) / rect.width - 0.5
  const ny = (event.clientY - rect.top) / rect.height - 0.5
  hero.style.setProperty('--px', `${(nx * 2 * PARALLAX_PX).toFixed(2)}px`)
  hero.style.setProperty('--py', `${(ny * 2 * PARALLAX_PX).toFixed(2)}px`)
  hero.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
  hero.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
  hero.style.setProperty('--spot-o', '1')
}

function onHeroLeave() {
  const hero = heroRef.value
  if (!hero) return
  hero.style.setProperty('--px', '0px')
  hero.style.setProperty('--py', '0px')
  hero.style.setProperty('--spot-o', '0')
}
const articles = ref<Article[]>([])

/* ===== 分类下拉：首页内联过滤（不跳页，只换卡片） ===== */
const categories = ref<Category[]>([])
const activeCategory = ref<Category | null>(null)
const menuOpen = ref(false)
/** 全部文章数（未过滤时就是 total，过滤后仍要显示它） */
const totalAll = ref(0)

/* ===== 专题下拉：选中后置顶块的位置换成专题概述 ===== */
const topics = ref<Topic[]>([])
const activeTopic = ref<Topic | null>(null)
const topicArticles = ref<Article[]>([])
const topicMenuOpen = ref(false)

function findCategory(slug: unknown) {
  const key = typeof slug === 'string' ? slug : ''
  return key ? categories.value.find((c) => c.slug === key) ?? null : null
}

/** 选中某个分类后：重置分页、重新拉数据、把 feed 顶部滚进视野 */
async function applyCategory(cat: Category | null) {
  activeCategory.value = cat
  menuOpen.value = false
  /* 三个筛选条件互斥：选分类就退出搜索与专题 */
  activeKeyword.value = ''
  profileKeyword.value = ''
  activeTopic.value = null
  topicArticles.value = []
  page.value = 1
  await loadArticles()
  if (cat) scrollToTop()
  else expandHeroKeepingFeed()

  const query = { ...route.query }
  if (cat) query.category = cat.slug
  else delete query.category
  delete query.keyword
  delete query.topic
  delete query.page
  router.replace({ path: '/', query })
}

/**
 * 自定义缓动滚动：系统自带的 behavior:'smooth' 距离长时会拖到 2s 以上，
 * 这里固定 620ms + easeInOutCubic，快慢可控。
 */
function smoothScrollTo(targetTop: number, duration = 620) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const start = window.scrollY
  const delta = targetTop - start
  if (reduce || Math.abs(delta) < 1) {
    window.scrollTo(0, targetTop)
    return
  }
  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration)
    window.scrollTo(0, start + delta * ease(p))
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/**
 * 从筛选态回到「全部」：Hero 一边展开一边补滚动，
 * 让列表在视觉上停在原地，而不是被 100vh 的大图顶下去（用户反馈的「跳回 Hero」）。
 * 展开 520ms，这里跟 640ms，避免最后一帧还没补完。
 */
function expandHeroKeepingFeed() {
  const el = listRef.value
  const hero = heroRef.value
  if (!el || !hero) return
  const startTop = el.getBoundingClientRect().top
  let raf = 0
  let done = false

  const correct = () => {
    const drift = el.getBoundingClientRect().top - startTop
    if (drift > 0.5) window.scrollBy(0, drift)
  }
  const track = () => {
    if (done) return
    correct()
    raf = requestAnimationFrame(track)
  }
  const stop = (event?: TransitionEvent) => {
    if (done) return
    if (event && (event.propertyName !== 'height' || event.target !== hero)) return
    done = true
    cancelAnimationFrame(raf)
    correct()
    /* 再补两次：图片解码 / 列表重排可能让高度晚一帧稳定 */
    requestAnimationFrame(correct)
    window.setTimeout(() => {
      correct()
      /* 收口：把 Hero 底边精确贴到视口顶边（scrollY = Hero 文档底坐标），
         既不留一条图，导航也刚好完整露出 */
      const heroEl = heroRef.value
      const target = heroEl
        ? heroEl.getBoundingClientRect().bottom + window.scrollY
        : el.getBoundingClientRect().top + window.scrollY - 96
      smoothScrollTo(Math.max(0, target), 220)
    }, 140)
  }

  raf = requestAnimationFrame(track)
  hero.addEventListener('transitionend', stop)
  window.setTimeout(() => {
    hero.removeEventListener('transitionend', stop)
    stop()
  }, 1200)
}

/** 筛选态 Hero 已收起，直接回到页顶（导航下方就是列表） */
function scrollToTop() {
  smoothScrollTo(0)
}

/** 把 feed 顶部对齐到导航下方，避免收起置顶时内容整体窜动 */
function scrollToFeed() {
  const el = listRef.value
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 96
  smoothScrollTo(Math.max(0, top))
}

function onDocPointerDown(event: PointerEvent) {
  const el = event.target as HTMLElement | null
  if (el?.closest?.('.head-tools')) return
  menuOpen.value = false
  topicMenuOpen.value = false
}

function onDocKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  menuOpen.value = false
  topicMenuOpen.value = false
}

/** 首页每段最多展示几条置顶，超出折叠 */
const PINNED_LIMIT = 2
const pinnedArticles = computed(() => articles.value.filter((a) => a.topped))
const shownPinned = computed(() => pinnedArticles.value.slice(0, PINNED_LIMIT))
const hiddenPinnedCount = computed(() => Math.max(0, pinnedArticles.value.length - PINNED_LIMIT))
const normalArticles = computed(() => articles.value.filter((a) => !a.topped))
/** 专题视图下去掉「置顶」标：专题是按时间策展的列表，置顶语义不适用 */
const topicDisplayArticles = computed(() => topicArticles.value.map((a) => ({ ...a, topped: false })))
/** 任何筛选生效时收起 Hero：短列表页不该还露着上一屏大图 */
const isFiltered = computed(() => !!(activeCategory.value || activeKeyword.value || activeTopic.value))
/** 首帧不播收起动画（深链直接带 ?category= 时不该看到 Hero 闪一下） */
const heroReady = ref(false)
/** 正在恢复到「点击文章前的滚动位置」：这期间先别画，免得先露一帧错误位置 */
const restoring = ref(false)
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

const bannerTitle = computed(() => site.config.homeBannerTitle || site.siteName)
const bannerSubtitle = computed(() => site.config.homeBannerSubtitle || '')
const authorName = computed(() => site.config.authorName || site.siteName)
const authorBio = computed(() => site.config.authorBio || '记录与思考。')

/** Hero 背景图：跟随深浅色取不同素材，图片经过 OSS 尺寸/质量处理 */
const heroImage = computed(() => {
  const raw = isDark.value
    ? site.config.homeHeroImageDark || site.config.homeHeroImage
    : site.config.homeHeroImage || site.config.homeHeroImageDark
  return raw ? optimizeImage(raw, IMAGE_PRESETS.hero) : ''
})

const avatarUrl = computed(() =>
  site.config.authorAvatar ? optimizeImage(site.config.authorAvatar, IMAGE_PRESETS.avatar) : ''
)


async function loadArticles() {
  loading.value = true
  error.value = ''
  try {
    // 分页参数使用 pageNum / pageSize，后端返回 records（=list）与 total
    const result = await publicApi.articles({
      pageNum: page.value,
      pageSize: PAGE_SIZE,
      ...(activeCategory.value ? { categoryId: activeCategory.value.id } : {}),
      ...(activeKeyword.value ? { keyword: activeKeyword.value } : {})
    })
    articles.value = result.records ?? result.list ?? []
    total.value = result.total ?? 0
    if (!activeCategory.value && !activeKeyword.value) totalAll.value = total.value
  } catch {
    articles.value = []
    total.value = 0
    error.value = '文章加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function findTopic(slug: unknown) {
  const key = typeof slug === 'string' ? slug : ''
  return key ? topics.value.find((t) => t.slug === key) ?? null : null
}

/** 选中专题：置顶收起，拉该专题的文章，概述卡占据置顶块的位置 */
async function applyTopic(topic: Topic | null) {
  activeTopic.value = topic
  topicMenuOpen.value = false
  /* 三个筛选条件互斥 */
  activeCategory.value = null
  activeKeyword.value = ''
  profileKeyword.value = ''
  menuOpen.value = false
  page.value = 1

  if (topic) {
    try {
      const detail = await publicApi.topic(topic.slug)
      topicArticles.value = detail.articles ?? []
      activeTopic.value = detail.topic ?? topic
    } catch {
      topicArticles.value = []
    }
    scrollToTop()
  } else {
    topicArticles.value = []
    await loadArticles()
    expandHeroKeepingFeed()
  }

  const query = { ...route.query }
  if (topic) query.topic = topic.slug
  else delete query.topic
  delete query.category
  delete query.keyword
  delete query.page
  router.replace({ path: '/', query })
}

async function loadTopics() {
  try {
    topics.value = await publicApi.topics()
  } catch {
    topics.value = []
  }
}

async function loadCategories() {
  try {
    categories.value = await publicApi.categories()
    // 直接用 ?category= 打开时还没加载过「全部」，用分类计数兜底个人卡的文章总数
    if (!totalAll.value) {
      totalAll.value = categories.value.reduce((sum, cat) => sum + (cat.articleCount ?? 0), 0)
    }
  } catch {
    categories.value = []
  }
}

function scrollToList() {
  /* 正好滚到 Hero 底边：背景图只留在首屏，内容区顶部是 76px 的留白 */
  const hero = document.querySelector('.hero') as HTMLElement | null
  if (!hero) return
  smoothScrollTo(hero.offsetHeight)
}


function changePage(next: number) {
  page.value = next
  loadArticles()
  scrollToList()
  /* 页码进 URL：从详情页返回时才能回到同一页 */
  const query = { ...route.query }
  if (next > 1) query.page = String(next)
  else delete query.page
  router.replace({ path: '/', query })
}

/* ===== 从详情页返回：恢复列表滚动位置 ===== */
const HOME_SCROLL_KEY = 'fcdzy_home_scroll'

type ScrollMemory = { fullPath: string; y: number } | null

/** 必须在挂载最开始读：Hero 收起/展开会触发滚动事件，晚读会被 0 覆盖 */
function readScrollMemory(): ScrollMemory {
  try {
    return JSON.parse(sessionStorage.getItem(HOME_SCROLL_KEY) ?? 'null') as ScrollMemory
  } catch {
    return null
  }
}

/**
 * 等 Hero 高度稳定（筛选态挂载时会从 100vh 收到 0），最多等 900ms。
 * 用 setTimeout 轮询而不是 rAF：标签页无渲染时 rAF 不推进。
 */
function waitHeroSettled(max = 900) {
  const hero = heroRef.value
  if (!hero) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const started = Date.now()
    let last = -1
    const tick = () => {
      const h = hero.getBoundingClientRect().height
      if (Math.abs(h - last) < 0.5 || Date.now() - started > max) {
        resolve()
        return
      }
      last = h
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

/** 离开首页时记下位置；只有去文章详情才值得记 */
onBeforeRouteLeave((to) => {
  if (!to.path.startsWith('/article/')) {
    try {
      sessionStorage.removeItem(HOME_SCROLL_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  try {
    sessionStorage.setItem(
      HOME_SCROLL_KEY,
      JSON.stringify({ fullPath: route.fullPath, y: Math.round(window.scrollY) })
    )
  } catch {
    /* 隐私模式下不可用，忽略 */
  }
})

/**
 * 只处理「从文章详情按返回」这一种情况：
 * 数据加载完再滚，避免页面还没撑开就被截断回顶部。
 */
async function restoreHomeScroll(saved: ScrollMemory, cameBack: boolean) {
  if (!saved || saved.y < 40) return
  if (!cameBack) return
  if (saved.fullPath !== route.fullPath) return
  /* 用掉就清掉，避免下次普通进入首页时又恢复一次 */
  try {
    sessionStorage.removeItem(HOME_SCROLL_KEY)
  } catch {
    /* ignore */
  }

  /* 筛选态挂载时 Hero 会收起（520ms），等高度稳定再滚，否则会被随后的收缩夹回 0 */
  await waitHeroSettled()
  const target = saved.y
  await nextTick()
  /* 数据和图片还没把页面撑够时会滚不到，1.2s 内反复校正 */
  await new Promise<void>((resolve) => {
    const started = Date.now()
    const step = () => {
      window.scrollTo(0, target)
      if (Math.abs(window.scrollY - target) < 2 || Date.now() - started > 1200) {
        resolve()
        return
      }
      window.setTimeout(step, 60)
    }
    step()
  })
}

watch(
  () => site.siteName,
  () => {
    useSeo({
      title: '',
      description: site.config.siteDescription,
      keywords: site.config.siteKeywords
    })
  },
  { immediate: true }
)


onMounted(async () => {
  /* 先读记忆与「是不是后退」标记，再等任何异步 */
  const scrollMemory = readScrollMemory()
  let cameBack = false
  try {
    cameBack = sessionStorage.getItem('fcdzy_nav_back') === '1'
    sessionStorage.removeItem('fcdzy_nav_back')
  } catch {
    cameBack = false
  }
  restoring.value = !!cameBack && !!scrollMemory && scrollMemory.y >= 40
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      heroReady.value = true
    }, 120)
  })
  await loadCategories()
  await loadTopics()
  activeCategory.value = findCategory(route.query.category)
  /* ?page=2 直接打开 / 从详情返回时停在同一页 */
  const pageParam = Math.floor(Number(route.query.page))
  if (Number.isFinite(pageParam) && pageParam > 1) page.value = pageParam
  /* ?keyword= 直接打开时也进搜索态 */
  const kw = typeof route.query.keyword === 'string' ? route.query.keyword.trim() : ''
  if (kw) {
    activeKeyword.value = kw
    profileKeyword.value = kw
  }
  /* ?topic= 直接打开时进专题态 */
  const topicSlug = typeof route.query.topic === 'string' ? route.query.topic : ''
  const topic = findTopic(topicSlug)
  if (topic) await applyTopic(topic)
  else await loadArticles()
  try {
    await restoreHomeScroll(scrollMemory, cameBack)
  } finally {
    /* 恢复成功或放弃，都要把页面放出来 */
    restoring.value = false
  }
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onDocKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onDocKeydown)
})

/** 浏览器前进/后退改变了 ?topic= 时同步专题状态 */
watch(
  () => route.query.topic,
  async (slug) => {
    if (route.path !== '/') return
    const next = findTopic(slug)
    if ((next?.id ?? null) === (activeTopic.value?.id ?? null)) return
    if (next) await applyTopic(next)
    else {
      activeTopic.value = null
      topicArticles.value = []
      loadArticles()
    }
  }
)

/** 浏览器前进/后退改变了 ?page= 时同步页码 */
watch(
  () => route.query.page,
  (next) => {
    if (route.path !== '/') return
    const target = Math.max(1, Math.floor(Number(next)) || 1)
    if (target === page.value) return
    page.value = target
    loadArticles()
  }
)

/** 浏览器前进/后退改变了 ?category= 时同步过滤状态 */
watch(
  () => route.query.category,
  (slug) => {
    if (route.path !== '/') return
    const next = findCategory(slug)
    if ((next?.id ?? null) === (activeCategory.value?.id ?? null)) return
    activeCategory.value = next
    page.value = 1
    loadArticles()
  }
)
</script>

<template>
  <div
    class="home"
    :class="{ 'is-filtered': isFiltered, 'is-ready': heroReady, 'is-restoring': restoring }"
  >
    <!-- ===== Hero：整幅背景图（鼠标视差 + 光斑） ===== -->
    <section ref="heroRef" class="hero" @pointermove="onHeroPointer" @pointerleave="onHeroLeave">
      <!-- 背景：2.5D 三层视差（移动端回落到后台配置的图片） -->
      <HeroParallax :fallback-src="heroImage" />
      <div class="hero-overlay" aria-hidden="true" />
      <div class="hero-spot" aria-hidden="true" />


      <div class="container hero-content">
        <p class="hero-brand">FCDZY</p>
        <h1 class="hero-title">{{ bannerTitle }}</h1>
        <p v-if="bannerSubtitle" class="hero-subtitle">{{ bannerSubtitle }}</p>
      </div>

      <!-- 下滑箭头：全屏 Hero 里唯一的「往下还有内容」提示 -->
      <button class="hero-scroll" type="button" aria-label="下滑查看文章" @click="scrollToList">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m6 6 6 6 6-6" />
          <path d="m6 13 6 6 6-6" />
        </svg>
      </button>

    </section>

    <!-- ===== 主体：左侧个人卡 + 右侧紧凑文章流 ===== -->
    <div class="home-body">
      <!-- 导航移到内容区顶部（首屏留给整幅图） -->
      <SiteHeader />
      <div class="container home-grid">
        <aside class="profile card">
          <div class="profile-avatar">
            <img v-if="avatarUrl" :src="avatarUrl" :alt="authorName" />
            <span v-else class="avatar-fallback">{{ authorName.slice(0, 1) }}</span>
          </div>
          <h2 class="profile-name">{{ authorName }}</h2>
          <p class="profile-bio">{{ authorBio }}</p>

          <div class="profile-social">
            <a
              v-if="site.config.githubUrl"
              class="social-link"
              :href="site.config.githubUrl"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <path
                  d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10 10 0 0 0 12 2z"
                />
              </svg>
            </a>
            <a v-if="site.config.email" class="social-link" :href="`mailto:${site.config.email}`" aria-label="Email">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                <path d="m4 7.5 8 5.5 8-5.5" />
              </svg>
            </a>
          </div>


          <div class="profile-divider profile-divider--align-top" aria-hidden="true"></div>

          <div class="profile-stats">
            <div class="stat">
              <b>{{ totalAll || total }}</b>
              <span>文章</span>
            </div>
            <div class="stat">
              <b>{{ site.categories.length }}</b>
              <span>分类</span>
            </div>
            <div class="stat">
              <b>{{ site.tags.length }}</b>
              <span>标签</span>
            </div>
          </div>

        <div class="profile-divider" aria-hidden="true"></div>

          <nav class="profile-nav">
            <router-link class="nav-item is-on" to="/">首页</router-link>
            <router-link class="nav-item" to="/categories">分类 / 专题</router-link>
            <router-link class="nav-item" to="/about">关于</router-link>
          </nav>

          <!-- 个人卡里的搜索：回车跳「全部文章」并带上关键词 -->
          <form class="profile-search" @submit.prevent="submitSearch">
            <input
              v-model="profileKeyword"
              class="profile-search-input"
              type="search"
              placeholder="搜索文章…"
              aria-label="搜索文章"
            />
            <button class="profile-search-btn" type="submit" aria-label="搜索">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </form>
        </aside>

        <div ref="listRef" class="stream">
          <el-skeleton v-if="loading" :rows="5" animated class="skeleton" />

          <div v-else-if="error" class="card state-box">
            <p class="state-text">{{ error }}</p>
            <el-button type="primary" plain @click="loadArticles">重新加载</el-button>
          </div>

          <div v-else-if="!articles.length && !activeTopic" class="card empty">
            <template v-if="activeKeyword">
              <p>没有找到匹配「{{ activeKeyword }}」的文章</p>
              <button type="button" class="clear-btn" @click="clearSearch">清除搜索</button>
            </template>
            <p v-else>还没有发布任何文章</p>
          </div>

          <template v-else>
            <!-- 置顶段：选了分类就整段收起，下面的列表自然上移补位 -->
            <section v-if="!activeCategory && !activeKeyword && !activeTopic && shownPinned.length" class="feed-block">
              <div class="block-head">
                <h2>置顶</h2>
                <span class="block-count">{{ pinnedArticles.length }} 篇</span>
              </div>
              <TimelineList :articles="shownPinned" :thumb-width="104" compact />
              <router-link v-if="hiddenPinnedCount" class="more-pinned" to="/articles">
                还有 {{ hiddenPinnedCount }} 篇置顶 →
              </router-link>
            </section>

            <!-- 列表段：默认「最新」，选中分类后变成该分类，工具条位置不动 -->
            <section v-if="activeCategory || activeKeyword || activeTopic || normalArticles.length" class="feed-block">
              <div class="block-head">
                <h2 v-if="activeKeyword">搜索：“{{ activeKeyword }}”</h2>
                <h2 v-else-if="activeTopic">{{ activeTopic.name }}</h2>
                <h2 v-else>{{ activeCategory ? activeCategory.name : '最新' }}</h2>

                <div class="head-tools">
                  <div v-if="!activeKeyword" class="cat-wrap">
                    <button
                      type="button"
                      class="cat-btn"
                      :class="{ 'is-open': menuOpen }"
                      :aria-expanded="menuOpen"
                      aria-haspopup="menu"
                      @click="menuOpen = !menuOpen"
                    >
                      {{ activeCategory ? '切换分类' : '分类' }}
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    <div v-if="menuOpen" class="cat-menu" role="menu">
                      <button
                        type="button"
                        class="cat-item"
                        :class="{ 'is-active': !activeCategory }"
                        role="menuitem"
                        @click="applyCategory(null)"
                      >
                        <span>全部</span>
                        <span class="cat-num">{{ totalAll }}</span>
                      </button>
                      <button
                        v-for="cat in categories"
                        :key="cat.id"
                        type="button"
                        class="cat-item"
                        :class="{ 'is-active': activeCategory?.id === cat.id }"
                        role="menuitem"
                        @click="applyCategory(cat)"
                      >
                        <span>{{ cat.name }}</span>
                        <span class="cat-num">{{ cat.articleCount ?? '' }}</span>
                      </button>
                    </div>
                  </div>

                  <div v-if="!activeKeyword" class="cat-wrap">
                    <button
                      type="button"
                      class="cat-btn"
                      :class="{ 'is-open': topicMenuOpen }"
                      :aria-expanded="topicMenuOpen"
                      aria-haspopup="menu"
                      @click="topicMenuOpen = !topicMenuOpen"
                    >
                      {{ activeTopic ? '切换专题' : '专题' }}
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>

                    <div v-if="topicMenuOpen" class="cat-menu" role="menu">
                      <button
                        type="button"
                        class="cat-item"
                        :class="{ 'is-active': !activeTopic }"
                        role="menuitem"
                        @click="applyTopic(null)"
                      >
                        <span>全部文章</span>
                        <span class="cat-num">{{ totalAll }}</span>
                      </button>
                      <button
                        v-for="topic in topics"
                        :key="topic.id"
                        type="button"
                        class="cat-item"
                        :class="{ 'is-active': activeTopic?.id === topic.id }"
                        role="menuitem"
                        @click="applyTopic(topic)"
                      >
                        <span>{{ topic.name }}</span>
                        <span class="cat-num">{{ topic.articleCount ?? 0 }}</span>
                      </button>
                    </div>
                  </div>

                  <span class="block-count">{{ activeTopic ? topicArticles.length : total }} 篇</span>
                  <button v-if="activeKeyword" type="button" class="clear-btn" @click="clearSearch">清除</button>
                </div>
              </div>

              <!-- 专题概述：占据置顶块收起来后空出的位置 -->
              <div v-if="activeTopic" class="topic-overview">
                <div class="topic-overview-body">
                  <p class="topic-desc">{{ activeTopic.description || '这个专题还没有写简介。' }}</p>
                  <p class="topic-meta">
                    <template v-if="topicArticles.length">{{ topicArticles.length }} 篇文章 · 按发布时间倒序</template>
                    <template v-else>
                      这个专题还没有文章 ·
                      <button type="button" class="clear-btn" @click="applyTopic(null)">返回全部文章</button>
                    </template>
                  </p>
                </div>
                <div v-if="activeTopic.coverImage" class="topic-cover">
                  <img :src="optimizeImage(activeTopic.coverImage, { width: 400, quality: 86 })" :alt="activeTopic.name" />
                </div>
              </div>

              <TimelineList
                v-if="activeTopic ? topicArticles.length : true"
                :articles="activeTopic ? topicDisplayArticles : activeCategory || activeKeyword ? articles : normalArticles"
                :thumb-width="104"
                compact
              />
            </section>
          </template>

          <AppPagination v-if="!activeTopic" :total="total" :page="page" :size="PAGE_SIZE" @change="changePage" />
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>

/* ===================== Hero ===================== */
.hero {
  position: relative;
  display: flex;
  align-items: center;
  /* 全屏 Hero：svh 让移动端地址栏收放时不跳动，老浏览器退回 vh */
  height: 100vh;
  height: 100svh;
  overflow: hidden;
  isolation: isolate;
}

/* 筛选态（分类 / 专题 / 搜索）整块收起，列表直接从导航下方开始 */
/* 恢复滚动位置期间先隐藏，位置对上后再淡入，避免「先跳一下再回位」 */
.home {
  transition: opacity 0.16s ease;
}

.home.is-restoring {
  opacity: 0;
  pointer-events: none;
}

.home.is-ready .hero {
  transition: height 0.52s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.36s ease;
}

.home.is-filtered .hero {
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 40%;
  /* 不再做底部渐隐：图片直接铺到 Hero 底边（用户要求去掉那层朦胧感） */
  /* 鼠标视差：放大 6% 留位移余量，只动 transform（GPU 合成） */
  transform: scale(1.06) translate3d(var(--px, 0px), var(--py, 0px), 0);
  transition: transform 0.25s ease-out;
  will-change: transform;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  /* 只在最顶部压一点点暗，保证导航白字可读；图片本身的颜色不做任何处理 */
  background: linear-gradient(180deg, rgba(10, 14, 20, 0.34) 0%, rgba(10, 14, 20, 0.1) 14%, transparent 30%);
}

.hero-content {
  position: relative;
  /* 文字与图片反向移动 30%，产生层次差 */
  transform: translate3d(calc(var(--px, 0px) * -0.3), calc(var(--py, 0px) * -0.3), 0);
  transition: transform 0.25s ease-out;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding-top: calc(var(--header-height, 62px) + 24px);
  padding-bottom: 40px;
  text-align: center;
}

.hero-brand {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: var(--text-on-dark-shadow);
}

.hero-title {
  /* 压暗层去掉后，靠文字自身的投影保证在亮背景上可读 */
  text-shadow: 0 2px 18px rgba(4, 10, 18, 0.55), 0 1px 3px rgba(4, 10, 18, 0.45);
  margin: 0;
  font-size: clamp(30px, 4.4vw, 46px);
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.01em;
  color: #fff;
  text-shadow: 0 8px 30px rgba(24, 10, 26, 0.5);
}

.hero-subtitle {
  text-shadow: 0 1px 10px rgba(4, 10, 18, 0.6);
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 2px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
  text-shadow: var(--text-on-dark-shadow);
}

.hero-subtitle::before,
.hero-subtitle::after {
  content: '';
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.55);
}


/* ===================== 主体布局 ===================== */
.home-body {
  position: relative;
  padding-bottom: 72px;
  /* 不铺底色：让全局背景图贯穿（卡片自己用 82% 毛玻璃保证可读） */
}



.home-grid {
  display: grid;
  /* 文章在左、个人卡在右（用户要求把卡片挪到右手边） */
  /* 个人卡列 260px：腾出 20px 给卡片，使卡片正好 +160px */
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 22px;
  align-items: start;
  /* 导航自占 62px，这里再留 44px：标题与导航之间约 44px，不挤也不空 */
  margin-top: 44px;
  /* 比全站 1080px 更宽：让时间轴与文章整体左移，日期贴近左侧留白 */
  /* 不对称留白：左边 60px（时间轴左移 40px），右边自动收回，卡片因此加宽 */
  /* 左边距 144px：让时间轴竖线正好落在 224px（用户标注的位置），右边留 15px */
  max-width: none;
  width: calc(100% - 159px);
  margin-left: 144px;
}

.stream {
  grid-column: 1;
  grid-row: 1;
}

/* ---- 左侧个人卡 ---- */
.profile {
  position: sticky;
  /* 右侧列，并与左侧第一张文章卡片顶部对齐（标题区高 33px + 间距） */
  grid-column: 2;
  grid-row: 1;
  margin-top: 62px;
  top: calc(var(--header-height, 62px) + 16px);
  padding: 18px 16px 14px;
  text-align: center;
  /* 和文章卡片同一套哑光浮起：同投影、同圆角，不另立一套 */
  background: var(--card-surface);
  border: 1px solid var(--card-edge);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
}


.profile-avatar {
  width: 76px;
  height: 76px;
  margin: 0 auto 9px;
  overflow: hidden;
  background: var(--surface-muted, rgba(15, 23, 42, 0.06));
  border: 3px solid var(--surface-card);
  border-radius: 50%;
  box-shadow: 0 6px 18px rgba(160, 120, 170, 0.26);
}

.profile-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 26px;
  font-weight: 700;
  color: var(--text-3);
}

.profile-name {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text-1);
}

.profile-bio {
  margin: 5px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-3);
}

.profile-social {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 10px;
  color: var(--text-3);
}

.social-link {
  display: inline-flex;
  color: inherit;
  opacity: 0.8;
  transition: opacity 0.18s ease;
}

.social-link:hover {
  opacity: 1;
}

.profile-divider {
  height: 1px;
  margin: 12px 0 10px;
  background: var(--border-soft, rgba(15, 23, 42, 0.08));
}

/*
 * 第一条分割线下移，让它的 y 与右侧第一篇文章行的分隔线对齐，
 * 形成横贯左右两栏的「同一根基线」（数值按当前卡片内容量出来的 18px）。
 */
.profile-divider--align-top {
  margin-top: 30px;
}

.profile-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat b {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

.stat span {
  font-size: 10.5px;
  color: var(--text-3);
}

.stat + .stat {
  border-left: 1px solid var(--border-soft, rgba(15, 23, 42, 0.08));
}

.profile-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 12px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
  text-decoration: none;
  background: var(--surface-muted, rgba(15, 23, 42, 0.04));
  border-radius: 10px;
  transition: background-color 0.18s ease;
}

.nav-item:hover {
  background: var(--surface-muted-strong, rgba(15, 23, 42, 0.08));
}

.nav-item.is-on {
  background: var(--surface-muted-strong, rgba(15, 23, 42, 0.1));
}

/* ---- 右侧文章流 ---- */
/* 卡片右侧截断在 1148px（用户标注位置），与个人卡之间留出更大空隙 */
.stream {
  display: flex;
  flex-direction: column;
  /* 卡片有了投影，间距放宽一点，阴影才不会互相压住 */
  gap: 16px;
  min-width: 0;
  /* 卡片在 1148px 处截断：补 205px 右侧留白，个人卡位置不动 */
  padding-right: 205px;
}
/* 每段的小标题：置顶 / 最新 */
.feed-block + .feed-block {
  margin-top: 34px;
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--row-line, rgba(16, 24, 40, 0.14));
}

.block-head h2 {
  margin: 0;
  /* 13.5 / 700：比颗粒度更重的标签，但和 16px 卡片标题仍留 2.5px 层级差 */
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-1);
}

.block-head .block-count {
  font-size: 13.5px;
  letter-spacing: 0.04em;
  /* 实心近黑：和「置顶 / 最新」小标题同一视觉重量 */
  color: var(--ui-strong);
  text-shadow: var(--ui-strong-shadow);
  text-decoration: none;
}

.block-head .more {
  font-size: 13.5px;
  letter-spacing: 0.04em;
  color: var(--text-3);
  text-decoration: none;
}

.block-head .more:hover {
  color: var(--brand-strong, #4f46e5);
}

/* ---- 分类下拉 ---- */
.head-tools {
  display: flex;
  gap: 14px;
  align-items: baseline;
}

/* 搜索态的「清除」：和分类按钮同一档视觉重量 */
.clear-btn {
  padding: 0;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ui-strong);
  text-shadow: var(--ui-strong-shadow);
  background: none;
  border: 0;
  cursor: pointer;
  transition: color 0.16s ease;
}

.clear-btn:hover {
  color: var(--row-title);
}

/* ---- 专题概述：占住置顶块收起来后空出的位置 ---- */
.topic-overview {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  /* 和文章卡片同宽：左边让出时间轴日期列（64px 列 + 22px 内距） */
  margin: 0 0 18px 86px;
  padding: 18px 20px;
  background: var(--card-surface);
  border: 1px solid var(--card-line);
  border-radius: 10px;
}

.topic-overview-body {
  min-width: 0;
}

.topic-desc {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--row-summary);
}

.topic-meta {
  margin: 8px 0 0;
  font-size: 11.5px;
  letter-spacing: 0.3px;
  color: var(--meta-faint);
}

.topic-cover {
  flex: none;
  width: 138px;
  height: 138px;
  overflow: hidden;
  background: var(--surface-muted, rgba(15, 23, 42, 0.05));
  border: 1px solid var(--image-line);
  border-radius: 6px;
}

.topic-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.topic-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  padding: 34px 20px;
}

.cat-wrap {
  position: relative;
}

.cat-btn {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 0;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  /* 实心近黑 + 极轻投影：对应参考图那种厚重感 */
  color: var(--ui-strong);
  text-shadow: var(--ui-strong-shadow);
  background: none;
  border: 0;
  cursor: pointer;
  transition: color 0.16s ease;
}

.cat-btn:hover,
.cat-btn.is-open {
  color: var(--text-1);
}

.cat-btn svg {
  transition: transform 0.16s ease;
}

.cat-btn.is-open svg {
  transform: rotate(180deg);
}

.cat-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 30;
  min-width: 168px;
  padding: 6px;
  background: var(--card-surface);
  border: 1px solid var(--card-line);
  border-radius: 10px;
  box-shadow: 0 14px 34px rgba(16, 24, 40, 0.12);
}

.cat-item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  /* 跟着工具条一起放大，菜单项和按钮同一档 */
  font-size: 13px;
  color: var(--text-2);
  text-align: left;
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.cat-item:hover {
  color: var(--text-1);
  background: var(--row-hover, rgba(15, 23, 42, 0.05));
}

.cat-item.is-active {
  font-weight: 600;
  color: var(--text-1);
}

.cat-num {
  font-size: 11.5px;
  color: var(--meta-faint, var(--text-3));
  font-variant-numeric: tabular-nums;
}

.more-pinned {
  display: inline-block;
  margin-top: 10px;
  font-size: 12px;
  color: var(--text-3);
  text-decoration: none;
}

.more-pinned:hover {
  color: var(--brand-strong, #4f46e5);
}

.state-box,
.empty {
  padding: 28px;
  text-align: center;
  color: var(--text-3);
}

/* ===================== 响应式 ===================== */
@media (max-width: 960px) {
  .topic-overview {
    margin-left: 86px;
  }

  .hero {
    min-height: 300px;
  }

  .hero-content {
    padding-top: calc(var(--header-height, 62px) + 36px);
    padding-bottom: 52px;
  }

  .home-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-top: 20px;
    /* 移动端取消桌面端的不对称留白 */
    width: 100%;
    margin-left: auto;
  }

  .profile {
    position: static;
    grid-column: 1;
    grid-row: 2;
    margin-top: 0;
  }

  /* 手机端取消卡片右侧的 205px 截断 */
  .stream {
    padding-right: 0;
  }
}

/* 宽屏：个人卡左移贴住文章卡片（用户选 B），空隙 227px → 22px */
@media (min-width: 961px) {
  .profile {
    /* 与 .stream 的 205px 右侧留白等量反向补偿 */
    margin-left: -205px;
    /* 负 margin 会把格子撑宽，这里锁死宽度 */
    width: 260px;
    justify-self: start;
  }
}

/* 1560 以下的窗口没有富余宽度，别截断卡片：让卡片吃满，个人卡自然跟上 */
@media (max-width: 1559px) {
  .stream {
    padding-right: 0;
  }

  .profile {
    margin-left: 0;
    width: auto;
    justify-self: stretch;
  }
}


/* ---- 个人卡内搜索：与列表页同一套「下划线」语言 ---- */
.profile-search {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  padding: 0 2px 6px;
  border-bottom: 1px solid var(--row-line);
}

.profile-search-input {
  flex: 1;
  min-width: 0;
  padding: 2px 0;
  font-size: 12.5px;
  color: var(--row-title);
  background: transparent;
  border: 0;
  outline: none;
}

.profile-search-input::placeholder {
  color: var(--meta-faint);
  letter-spacing: 0.5px;
}

.profile-search-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--meta-faint);
  cursor: pointer;
  background: transparent;
  border: 0;
  transition: color 0.18s ease;
}

.profile-search-btn:hover {
  color: var(--row-title);
}

/* ---- Hero 底部下滑箭头 ---- */
.hero-scroll {
  position: absolute;
  bottom: 22px;
  left: 50%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  /* 箭头压在整幅照片上，明暗不定：白箭头 + 半透明深底 + 轻模糊，亮暗处都看得见 */
  color: #fff;
  cursor: pointer;
  background: transparent;
  border: 0;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
  transform: translateX(-50%);
  transition: background 0.2s ease, border-color 0.2s ease;
  animation: hero-bob 2.4s ease-in-out infinite;
}

.hero-scroll:hover {
  filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.75));
}

@keyframes hero-bob {
  0%,
  100% {
    transform: translateX(-50%) translateY(0);
  }
  50% {
    transform: translateX(-50%) translateY(7px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-scroll {
    animation: none;
  }
}

/* 光斑：跟随指针的柔光，模拟玻璃/油墨反光 */
.hero-spot {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: radial-gradient(
    240px circle at var(--spot-x, 50%) var(--spot-y, 50%),
    rgba(255, 255, 255, 0.1) 0%,
    rgba(255, 255, 255, 0.04) 40%,
    transparent 70%
  );
  opacity: var(--spot-o, 0);
  transition: opacity 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .hero-bg,
  .hero-content {
    transform: none;
    transition: none;
  }

  .hero-spot {
    display: none;
  }
}
</style>
