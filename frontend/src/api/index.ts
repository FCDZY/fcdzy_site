import { request } from './http'
import type {
  AdminUser,
  Article,
  ArticleForm,
  Category,
  CategoryForm,
  LoginResult,
  PageResult,
  SiteConfig,
  Stats,
  Tag,
  TagForm,
  Topic,
  TopicDetail,
  TopicForm,
  UploadResult
} from '@/types'

export interface ArticleQuery {
  /** 页码（新参数名，与 page 等价，优先级更高） */
  pageNum?: number
  /** 每页条数（新参数名，与 size 等价，默认 10） */
  pageSize?: number
  page?: number
  size?: number
  categoryId?: number | null
  tagId?: number | null
  keyword?: string | null
  status?: string | null
}

/** 前台公开接口 */
export const publicApi = {
  siteConfig: () => request<SiteConfig>({ url: '/public/site-config', method: 'get' }),
  articles: (params: ArticleQuery) => request<PageResult<Article>>({ url: '/public/articles', method: 'get', params }),
  recentArticles: (limit = 5) => request<Article[]>({ url: '/public/articles/recent', method: 'get', params: { limit } }),
  /** 热门文章：后端按阅读量降序，默认最多 5 篇 */
  hotArticles: (limit = 5) => request<Article[]>({ url: '/public/articles/hot', method: 'get', params: { limit } }),
  article: (slug: string) => request<Article>({ url: `/public/articles/${slug}`, method: 'get' }),
  categories: () => request<Category[]>({ url: '/public/categories', method: 'get' }),
  tags: () => request<Tag[]>({ url: '/public/tags', method: 'get' }),
  topics: () => request<Topic[]>({ url: '/public/topics', method: 'get' }),
  topic: (slug: string) => request<TopicDetail>({ url: `/public/topics/${slug}`, method: 'get' })
}

/** 登录与个人账号 */
export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResult>({ url: '/auth/login', method: 'post', data: { username, password } }),
  me: () => request<AdminUser>({ url: '/auth/me', method: 'get' }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request<void>({ url: '/auth/password', method: 'put', data: { oldPassword, newPassword } }),
  updateProfile: (data: { nickname?: string; avatar?: string; email?: string }) =>
    request<AdminUser>({ url: '/auth/profile', method: 'put', data })
}

/** 后台管理接口 */
export const adminApi = {
  stats: () => request<Stats>({ url: '/admin/stats', method: 'get' }),

  articleList: (params: ArticleQuery) => request<PageResult<Article>>({ url: '/admin/articles', method: 'get', params }),
  articleOptions: () => request<Article[]>({ url: '/admin/articles/options', method: 'get' }),
  articleDetail: (id: number) => request<Article>({ url: `/admin/articles/${id}`, method: 'get' }),
  articleCreate: (data: ArticleForm) => request<Article>({ url: '/admin/articles', method: 'post', data }),
  articleUpdate: (id: number, data: ArticleForm) => request<Article>({ url: `/admin/articles/${id}`, method: 'put', data }),
  articleDelete: (id: number) => request<void>({ url: `/admin/articles/${id}`, method: 'delete' }),
  articleStatus: (id: number, status: 'DRAFT' | 'PUBLISHED') =>
    request<Article>({ url: `/admin/articles/${id}/status`, method: 'put', params: { status } }),

  categoryList: () => request<Category[]>({ url: '/admin/categories', method: 'get' }),
  categoryCreate: (data: CategoryForm) => request<Category>({ url: '/admin/categories', method: 'post', data }),
  categoryUpdate: (id: number, data: CategoryForm) => request<Category>({ url: `/admin/categories/${id}`, method: 'put', data }),
  categoryDelete: (id: number) => request<void>({ url: `/admin/categories/${id}`, method: 'delete' }),

  tagList: () => request<Tag[]>({ url: '/admin/tags', method: 'get' }),
  tagCreate: (data: TagForm) => request<Tag>({ url: '/admin/tags', method: 'post', data }),
  tagUpdate: (id: number, data: TagForm) => request<Tag>({ url: `/admin/tags/${id}`, method: 'put', data }),
  tagDelete: (id: number) => request<void>({ url: `/admin/tags/${id}`, method: 'delete' }),

  topicList: () => request<Topic[]>({ url: '/admin/topics', method: 'get' }),
  topicDetail: (id: number) => request<TopicDetail>({ url: `/admin/topics/${id}`, method: 'get' }),
  topicCreate: (data: TopicForm) => request<Topic>({ url: '/admin/topics', method: 'post', data }),
  topicUpdate: (id: number, data: TopicForm) => request<Topic>({ url: `/admin/topics/${id}`, method: 'put', data }),
  topicDelete: (id: number) => request<void>({ url: `/admin/topics/${id}`, method: 'delete' }),
  topicArticles: (id: number, articleIds: number[]) =>
    request<number[]>({ url: `/admin/topics/${id}/articles`, method: 'put', data: { articleIds } }),

  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadResult>({ url: '/admin/upload', method: 'post', data: form })
  },

  siteConfig: () => request<SiteConfig>({ url: '/admin/site-config', method: 'get' }),
  updateSiteConfig: (data: SiteConfig) => request<SiteConfig>({ url: '/admin/site-config', method: 'put', data })
}
