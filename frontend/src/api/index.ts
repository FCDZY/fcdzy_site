import { request } from './http'
import type {
  AdminComment,
  AdminUser,
  Article,
  ArticleForm,
  Category,
  CategoryForm,
  Comment,
  CommentForm,
  LoginResult,
  PageResult,
  SiteConfig,
  Stats,
  Tag,
  TagForm,
  Topic,
  TopicDetail,
  TopicForm,
  UploadResult,
  ViewTrend
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
  /** 服务器时间信息（定时发布选择器用它，避免浏览器时区偏差） */
  serverInfo: () => request<{ now: string; zone: string; epochMillis: number }>({ url: '/public/server-info', method: 'get' }),
  articles: (params: ArticleQuery) => request<PageResult<Article>>({ url: '/public/articles', method: 'get', params }),
  recentArticles: (limit = 5) => request<Article[]>({ url: '/public/articles/recent', method: 'get', params: { limit } }),
  /** 热门文章：后端按阅读量降序，默认最多 5 篇 */
  hotArticles: (limit = 5) => request<Article[]>({ url: '/public/articles/hot', method: 'get', params: { limit } }),
  article: (slug: string) => request<Article>({ url: `/public/articles/${slug}`, method: 'get' }),
  categories: () => request<Category[]>({ url: '/public/categories', method: 'get' }),
  tags: () => request<Tag[]>({ url: '/public/tags', method: 'get' }),
  topics: () => request<Topic[]>({ url: '/public/topics', method: 'get' }),
  topic: (slug: string) => request<TopicDetail>({ url: `/public/topics/${slug}`, method: 'get' }),
  /** 已通过的一级评论分页（每条带其下回复） */
  comments: (slug: string, pageNum = 1, pageSize = 10) =>
    request<PageResult<Comment>>({
      url: `/public/articles/${slug}/comments`,
      method: 'get',
      params: { pageNum, pageSize }
    }),
  /** 已通过的评论总数（含回复） */
  commentCount: (slug: string) => request<number>({ url: `/public/articles/${slug}/comments/count`, method: 'get' }),
  /** 访客提交评论（无需登录，默认待审核） */
  createComment: (slug: string, data: CommentForm) =>
    request<Comment>({ url: `/public/articles/${slug}/comments`, method: 'post', data })
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
  /** 近 N 天阅读趋势（默认 7 天，仪表盘折线图用） */
  viewTrend: (days = 7) => request<ViewTrend>({ url: '/admin/stats/views', method: 'get', params: { days } }),

  articleList: (params: ArticleQuery) => request<PageResult<Article>>({ url: '/admin/articles', method: 'get', params }),
  articleOptions: () => request<Article[]>({ url: '/admin/articles/options', method: 'get' }),
  articleDetail: (id: number) => request<Article>({ url: `/admin/articles/${id}`, method: 'get' }),
  articleCreate: (data: ArticleForm) => request<Article>({ url: '/admin/articles', method: 'post', data }),
  articleUpdate: (id: number, data: ArticleForm) => request<Article>({ url: `/admin/articles/${id}`, method: 'put', data }),
  articleDelete: (id: number) => request<void>({ url: `/admin/articles/${id}`, method: 'delete' }),
  articleStatus: (id: number, status: 'DRAFT' | 'PUBLISHED') =>
    request<Article>({ url: `/admin/articles/${id}/status`, method: 'put', params: { status } }),
  /** 取消定时发布：回到草稿并清空定时时间 */
  articleCancelSchedule: (id: number) =>
    request<Article>({ url: `/admin/articles/${id}/cancel-schedule`, method: 'put' }),

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

  /** 上传单张图片（后端中转：校验 → 阿里云 OSS → 返回公共读 URL） */
  upload: (file: File, onProgress?: (event: any) => void) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadResult>({
      url: '/admin/upload',
      method: 'post',
      data: form,
      onUploadProgress: onProgress
    })
  },
  /** 上传配置：mode=oss（已接阿里云）/ local（未配置时本地兜底）、大小上限、允许的格式 */
  uploadConfig: () =>
    request<{ mode: string; maxSizeBytes: number; maxSizeMb: number; accept: string[]; cacheMaxAge: number }>({
      url: '/admin/upload/config',
      method: 'get'
    }),

  siteConfig: () => request<SiteConfig>({ url: '/admin/site-config', method: 'get' }),
  updateSiteConfig: (data: SiteConfig) => request<SiteConfig>({ url: '/admin/site-config', method: 'put', data }),

  /** 评论管理 */
  commentList: (params: { status?: string; articleId?: number | null; keyword?: string; pageNum?: number; pageSize?: number }) =>
    request<PageResult<AdminComment>>({ url: '/admin/comments', method: 'get', params }),
  commentApprove: (id: number) => request<AdminComment>({ url: `/admin/comments/${id}/approve`, method: 'put' }),
  /** 删除评论（楼中楼连同回复一起删除），返回删除条数 */
  commentDelete: (id: number) => request<number>({ url: `/admin/comments/${id}`, method: 'delete' }),
  commentPendingCount: () => request<number>({ url: '/admin/comments/pending-count', method: 'get' })
}
