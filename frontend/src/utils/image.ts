/**
 * 图片地址优化：给自家 OSS 的图片追加实时处理参数（缩放 + WebP + 质量）。
 *
 * 好处：原图不动、数据库不动，只改 URL —— 一张 3.4MB 的 Banner 能降到 200KB 左右。
 * 非 OSS 域名（外链、data URI、本地 /uploads）原样返回。
 */
const OSS_HOST = 'takeout-dish.oss-cn-beijing.aliyuncs.com'

export interface ImageOptions {
  /** 目标宽度（像素），高度按比例缩放 */
  width?: number
  /** 质量 1-100 */
  quality?: number
  /** 是否转 WebP（默认是） */
  webp?: boolean
}

export function isOssImage(url?: string | null): boolean {
  if (!url) return false
  return url.includes(OSS_HOST) || url.includes('oss-cn-')
}

/**
 * 追加 x-oss-process。参数里只有 `/ , _` 这类安全字符，直接拼在 query 上，
 * 不做 encodeURIComponent（否则部分 CDN/OSS 规则会解析失败）。
 */
export function optimizeImage(url?: string | null, options: ImageOptions = {}): string {
  if (!url) return ''
  const source = String(url).trim()
  if (!isOssImage(source)) return source
  if (source.includes('x-oss-process')) return source

  const width = options.width && options.width > 0 ? Math.round(options.width) : 1200
  const quality = options.quality && options.quality > 0 ? Math.min(100, Math.round(options.quality)) : 80
  const parts = [`image/resize,w_${width}`]
  if (options.webp !== false) {
    parts.push('format,webp')
  }
  parts.push(`quality,q_${quality}`)

  const separator = source.includes('?') ? '&' : '?'
  return `${source}${separator}x-oss-process=${parts.join('/')}`
}

/** 常用的几种尺寸 */
export const IMAGE_PRESETS = {
  /** 首页 Banner / 全局背景的兜底值（实际用 viewportHeroOptions 按屏幕算） */
  hero: { width: 3200, quality: 86 } as ImageOptions,
  /** 文章封面 / 列表缩略图 */
  cover: { width: 1000, quality: 80 } as ImageOptions,
  /** 正文插图 */
  content: { width: 1200, quality: 82 } as ImageOptions,
  /** 头像 / favicon 这类小图 */
  avatar: { width: 160, quality: 82 } as ImageOptions,
  favicon: { width: 64, quality: 85 } as ImageOptions,
  /** 低清占位（模糊底图），体积 1~3KB */
  placeholder: { width: 40, quality: 40 } as ImageOptions
}
/**
 * 背景图（满屏铺满）的尺寸选择。
 *
 * 背景是 `background-size: cover`，必须按「屏幕物理像素」准备，
 * 否则会被放大 2 倍而发糊。之前固定 w_1920，在 2 倍屏上等于放大 2.2 倍。
 *
 * 规则：屏幕 CSS 宽 × 设备像素比（上限 2）× 1.15 余量，夹在 1600~3200 之间。
 * OSS 不会把图放大，超过原图宽度时自动按原宽输出。
 */
export function viewportHeroOptions(): ImageOptions {
  if (typeof window === 'undefined') {
    return { width: 2400, quality: 86 }
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cssWidth = window.innerWidth || 1600
  const width = Math.round(Math.min(3200, Math.max(1600, cssWidth * dpr * 1.15)))
  return { width, quality: 86 }
}
