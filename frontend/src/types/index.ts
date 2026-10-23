export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  list: T[]
  /** 与 list 等价的分页别名（后端同时返回，便于按 records/total 消费） */
  records?: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface Category {
  id: number
  name: string
  slug: string
  description?: string | null
  sortOrder?: number
  articleCount?: number | null
}

export interface Tag {
  id: number
  name: string
  slug: string
  articleCount?: number | null
}

export interface Topic {
  id: number
  name: string
  slug: string
  description?: string | null
  coverImage?: string | null
  sortOrder?: number
  articleCount?: number | null
  createdAt?: string
}

export interface ArticleNav {
  title: string
  slug: string
}

export interface Article {
  id: number
  title: string
  slug: string
  summary?: string | null
  content?: string | null
  coverImage?: string | null
  status?: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'
  /** 定时发布时间（服务器时区墙钟，仅定时文章有值） */
  schedulePublishTime?: string | null
  topped?: boolean
  viewCount?: number
  category?: Category | null
  tags?: Tag[]
  topics?: Topic[]
  prev?: ArticleNav | null
  next?: ArticleNav | null
  publishedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface TopicDetail {
  topic: Topic
  articles: Article[]
  articleIds: number[]
}

export interface AdminUser {
  id: number
  username: string
  nickname?: string | null
  avatar?: string | null
  email?: string | null
  lastLoginAt?: string | null
}

export interface LoginResult {
  token: string
  tokenType: string
  expiresIn: number
  user: AdminUser
}

export interface Stats {
  articleCount: number
  publishedCount: number
  draftCount: number
  scheduledCount: number
  categoryCount: number
  tagCount: number
  topicCount: number
  totalViews: number
}

export interface ArticleForm {
  title: string
  slug?: string
  summary?: string
  content?: string
  coverImage?: string
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED'
  /** 定时发布时间：yyyy-MM-dd HH:mm:ss（服务器时区墙钟），status=SCHEDULED 时必填 */
  schedulePublishTime?: string
  categoryId?: number | null
  tagIds?: number[]
  topped?: boolean
}

export interface CategoryForm {
  name: string
  slug?: string
  description?: string
  sortOrder?: number
}

export interface TagForm {
  name: string
  slug?: string
}

export interface TopicForm {
  name: string
  slug?: string
  description?: string
  coverImage?: string
  sortOrder?: number
}

export type SiteConfig = Record<string, string>

export interface UploadResult {
  url: string
  name: string
}

/** 前台展示用评论（后端不返回邮箱等隐私字段） */
export interface Comment {
  id: number
  parentId?: number | null
  rootId?: number | null
  nickname: string
  content: string
  /** 回复目标昵称；直接评论文章时为 null */
  replyToNickname?: string | null
  createdAt: string
  replies: Comment[]
}

/** 访客提交评论的表单 */
export interface CommentForm {
  nickname: string
  /** 选填，不填即匿名 */
  email?: string
  content: string
  /** 回复某条评论时传其 id */
  parentId?: number | null
}

/** 后台评论（含邮箱、IP、审核状态） */
export interface AdminComment {
  id: number
  articleId?: number
  articleTitle?: string
  articleSlug?: string
  parentId?: number | null
  rootId?: number | null
  nickname: string
  email?: string | null
  content: string
  status: 'PENDING' | 'APPROVED'
  ip?: string
  userAgent?: string
  createdAt: string
  approvedAt?: string | null
  replyCount: number
}
/** 近 N 天阅读趋势（后台仪表盘折线图） */
export interface ViewTrendPoint {
  /** yyyy-MM-dd */
  date: string
  /** MM-dd，图表 X 轴用 */
  label: string
  views: number
}

export interface ViewTrend {
  days: number
  total: number
  hasData: boolean
  points: ViewTrendPoint[]
}