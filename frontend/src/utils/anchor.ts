/**
 * 文章内锚点（章节跳转）。
 *
 * 背景：标题 id 由 markdown 渲染时生成，手写锚点和生成规则很容易不一致；
 * 加上 vue-router 的 scrollBehavior 会把任何导航滚回顶部，
 * 所以页内锚点必须自己处理（preventDefault + scrollIntoView + replaceState），不要走路由。
 */

/** 把标题文字/锚点文本归一化成同一套形式：小写、标点转 -、去掉首尾 - */
export function normalizeAnchor(text: string): string {
  return (
    String(text || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

/**
 * 「宽松」形式：把标点**全部删掉**（不换成 -）。
 *
 * 为什么需要：GitHub / Typora 生成的锚点是删除标点（`12.2 锁机制详解` → `122-锁机制详解`），
 * 而本站生成的 id 是标点换 `-`（`12-2-锁机制详解`）。两者只差标点，
 * 所以精确匹配失败后，再用这个形式兜一次底，历史文章里的手写锚点就能命中。
 */
export function looseAnchor(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

/**
 * 按锚点找目标标题，容错顺序：
 * 1. 原样匹配
 * 2. 解码后的原样（中文/空格被编码过）
 * 3. 归一化后匹配（点号、空格等差异）
 * 4. 去掉末尾 -数字 后匹配（兼容旧版 id 的序号后缀）
 * 5. 扫描所有标题，按归一化 id 兜底匹配
 * 6. 扫描所有标题，按「去标点」宽松形式兜底（兼容 GitHub/Typora 风格的手写锚点）
 */
export function findAnchorTarget(rawHash: string): HTMLElement | null {
  const raw = String(rawHash || '').replace(/^#/, '')
  if (!raw) return null

  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    /* 非法编码时用原样 */
  }

  const normalized = normalizeAnchor(decoded)
  const candidates = [raw, decoded, normalized, normalized.replace(/-\d+$/, '')]

  for (const id of candidates) {
    if (!id) continue
    const el = document.getElementById(id)
    if (el) return el
  }

  const headings = document.querySelectorAll<HTMLElement>(
    '.markdown-body h1[id], .markdown-body h2[id], .markdown-body h3[id]'
  )
  for (const heading of Array.from(headings)) {
    if (normalizeAnchor(heading.id) === normalized) return heading
  }

  const looseTarget = looseAnchor(decoded)
  if (looseTarget) {
    for (const heading of Array.from(headings)) {
      if (looseAnchor(heading.id) === looseTarget) return heading
    }
  }
  return null
}

/** 滚动到锚点；成功返回 true。会同步更新地址栏（replace，不产生历史记录） */
export function scrollToAnchor(rawHash: string): boolean {
  const target = findAnchorTarget(rawHash)
  if (!target) return false
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  history.replaceState(null, '', `#${target.id}`)
  return true
}
