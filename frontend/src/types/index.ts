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
  status?: 'DRAFT' | 'PUBLISHED'
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
  status: 'DRAFT' | 'PUBLISHED'
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
