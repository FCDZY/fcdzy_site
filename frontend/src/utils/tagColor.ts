/**
 * 标签文字色工具。
 * 色值本体写在 main.css 的 --tag-c-0..7（浅色 / 深色各一套），
 * 这里只负责「按标签名稳定取色」：同一个标签任何时候都是同一个颜色，
 * 相邻两个标签若撞色则顺延一位，避免并排同色。
 */
export const TAG_PALETTE_SIZE = 8

/** 用标签名做稳定哈希 → 调色板下标 */
export function tagColorIndex(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % TAG_PALETTE_SIZE
}

/** 一批标签的 CSS 变量引用（与 names 等长），相邻不撞色 */
export function buildTagColorVars(names: string[]): string[] {
  let prev = -1
  return names.map((name) => {
    let index = tagColorIndex(name)
    if (index === prev) {
      index = (index + 1) % TAG_PALETTE_SIZE
    }
    prev = index
    return `var(--tag-c-${index})`
  })
}

/** 单个标签的 CSS 变量引用 */
export function tagColorVar(name: string): string {
  return `var(--tag-c-${tagColorIndex(name)})`
}
