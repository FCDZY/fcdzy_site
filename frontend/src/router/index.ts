import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { reloadOnceForStaleChunk } from '@/utils/errorReporter'
import { SITE_SHORT_NAME } from '@/constants/site'
import { getToken } from '@/api/http'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/FrontLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/front/HomeView.vue'), meta: { title: '首页' } },
      {
        path: 'articles',
        name: 'articles',
        component: () => import('@/views/front/ArticleListView.vue'),
        meta: { title: '文章列表' }
      },
      {
        path: 'category/:slug',
        name: 'category',
        component: () => import('@/views/front/ArticleListView.vue'),
        props: (route) => ({ categorySlug: route.params.slug as string }),
        meta: { title: '分类' }
      },
      {
        path: 'tag/:slug',
        name: 'tag',
        component: () => import('@/views/front/ArticleListView.vue'),
        props: (route) => ({ tagSlug: route.params.slug as string }),
        meta: { title: '标签' }
      },
      { path: 'article/:slug', name: 'article', component: () => import('@/views/front/ArticleDetailView.vue') },
      { path: 'categories', name: 'categories', component: () => import('@/views/front/CategoriesView.vue'), meta: { title: '分类' } },
      { path: 'topics', name: 'topics', component: () => import('@/views/front/TopicListView.vue'), meta: { title: '专题' } },
      { path: 'topic/:slug', name: 'topic', component: () => import('@/views/front/TopicDetailView.vue') },
      { path: 'about', name: 'about', component: () => import('@/views/front/AboutView.vue'), meta: { title: '关于' } }
    ]
  },
  {
    path: '/yzdcf/login',
    name: 'admin-login',
    component: () => import('@/views/admin/LoginView.vue'),
    meta: { title: '管理员登录' }
  },
  {
    path: '/yzdcf',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/DashboardView.vue'), meta: { title: '仪表盘' } },
      { path: 'articles', name: 'admin-articles', component: () => import('@/views/admin/AdminArticleListView.vue'), meta: { title: '文章管理' } },
      { path: 'articles/new', name: 'admin-article-create', component: () => import('@/views/admin/AdminArticleEditView.vue'), meta: { title: '写文章' } },
      {
        path: 'articles/:id/edit',
        name: 'admin-article-edit',
        component: () => import('@/views/admin/AdminArticleEditView.vue'),
        props: true,
        meta: { title: '编辑文章' }
      },
      { path: 'categories', name: 'admin-categories', component: () => import('@/views/admin/AdminCategoryView.vue'), meta: { title: '分类管理' } },
      { path: 'tags', name: 'admin-tags', component: () => import('@/views/admin/AdminTagView.vue'), meta: { title: '标签管理' } },
      { path: 'topics', name: 'admin-topics', component: () => import('@/views/admin/AdminTopicView.vue'), meta: { title: '专题管理' } },
      { path: 'comments', name: 'admin-comments', component: () => import('@/views/admin/AdminCommentView.vue'), meta: { title: '评论管理' } },
      {
        path: 'topics/:id',
        name: 'admin-topic-edit',
        component: () => import('@/views/admin/AdminTopicEditView.vue'),
        props: true,
        meta: { title: '专题排序' }
      },
      { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/AdminSettingsView.vue'), meta: { title: '站点配置' } },
      { path: 'profile', name: 'admin-profile', component: () => import('@/views/admin/AdminProfileView.vue'), meta: { title: '账号设置' } }
    ]
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/front/NotFoundView.vue') }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    // 同一页面只改筛选 query：保持滚动位置，别把用户弹回顶部。
    // 但页码变了（点导航「首页」从 ?page=2 回到 /）就老老实实回顶部。
    if (to.path === from.path && to.query.page === from.query.page) return false
    return { top: 0 }
  }
})

/* 记录「这次是浏览器的后退/前进」：首页靠它判断要不要恢复滚动位置 */
window.addEventListener('popstate', () => {
  /* 打同步标记：Vue 的过渡类名在下一帧才生成，只有挂到 <html> 上才来得及 */
  document.documentElement.classList.add('nav-back')
  window.setTimeout(() => document.documentElement.classList.remove('nav-back'), 600)
  try {
    sessionStorage.setItem('fcdzy_nav_back', '1')
  } catch {
    /* 隐私模式下不可用，忽略 */
  }
})

router.beforeEach((to) => {
  const needsAuth = to.path.startsWith('/yzdcf') && to.name !== 'admin-login'
  if (needsAuth && !getToken()) {
    return { name: 'admin-login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'admin-login' && getToken()) {
    return { name: 'admin-dashboard' }
  }
  return true
})

// 标签页标题统一用短名（FCDZY）：完整站名在标签页里会被浏览器截断。
// 页面级的 useSeo 会在挂载后再覆盖一次，这里兜住后台等不走 useSeo 的页面。
router.afterEach((to) => {
  const title = to.meta?.title as string | undefined
  document.title = title && to.name !== 'home' ? `${title} · ${SITE_SHORT_NAME}` : SITE_SHORT_NAME
})

/* 懒加载的路由分包 404（发版后旧页面还在要已删除的文件）：
   先整页重载一次拿新的 index.html，避免用户停在白屏 */
router.onError((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)) {
    return
  }
  reloadOnceForStaleChunk()
})

export default router
