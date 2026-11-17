/**
 * 阅读位置记忆。
 *
 * 长文读到一半关掉/跳走，下次进来给一条「上次读到 62%，继续阅读」的提示。
 * 刻意**不自动滚动** —— 自动跳位置对读者是惊吓；给个按钮让他自己决定。
 *
 * 存储：localStorage，key = fcdzy_read_pos:<slug>，30 天后过期。
 */
const PREFIX = 'fcdzy_read_pos:'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** 低于这个比例不记（等于没开始读） */
const MIN_PERCENT = 3
/** 高于这个比例清掉（已经读完） */
const MAX_PERCENT = 95

export interface ReadProgress {
  percent: number
  at: number
}

function readAll(): Record<string, ReadProgress> {
  try {
    const raw = localStorage.getItem('fcdzy_read_pos')
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ReadProgress>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, ReadProgress>) {
  try {
    localStorage.setItem('fcdzy_read_pos', JSON.stringify(map))
  } catch {
    /* 隐私模式 / 配额满：忽略 */
  }
}

/** 清理过期记录，顺便限制条数（避免 localStorage 越积越多） */
function prune(map: Record<string, ReadProgress>): Record<string, ReadProgress> {
  const now = Date.now()
  const entries = Object.entries(map)
    .filter(([, value]) => value && now - value.at < MAX_AGE_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 50)
  return Object.fromEntries(entries)
}

export function getReadProgress(slug?: string | null): ReadProgress | null {
  if (!slug) return null
  const map = readAll()
  const saved = map[slug]
  if (!saved || Date.now() - saved.at > MAX_AGE_MS) return null
  if (saved.percent < MIN_PERCENT || saved.percent > MAX_PERCENT) return null
  return saved
}

export function saveReadProgress(slug: string | null | undefined, percent: number) {
  if (!slug) return
  const map = prune(readAll())
  if (percent < MIN_PERCENT || percent > MAX_PERCENT) {
    if (map[slug]) {
      delete map[slug]
      writeAll(map)
    }
    return
  }
  map[slug] = { percent: Math.round(percent), at: Date.now() }
  writeAll(map)
}

export function clearReadProgress(slug?: string | null) {
  if (!slug) return
  const map = readAll()
  if (!map[slug]) return
  delete map[slug]
  writeAll(map)
}

/** 量出正文阅读进度（0~100）：正文顶部到窗口中线之间的进度 */
export function measurePercent(element: HTMLElement | null): number {
  if (!element) return 0
  const rect = element.getBoundingClientRect()
  const height = rect.height
  if (height <= 0) return 0
  const readingLine = window.scrollY + window.innerHeight / 2
  const percent = ((readingLine - (rect.top + window.scrollY)) / height) * 100
  return Math.max(0, Math.min(100, percent))
}

/** 滚到正文的指定百分比位置（把该处对到窗口上方 1/4 处，读起来更自然） */
export function scrollToPercent(element: HTMLElement | null, percent: number) {
  if (!element) return
  const rect = element.getBoundingClientRect()
  const top = rect.top + window.scrollY + (rect.height * percent) / 100 - window.innerHeight / 4
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
