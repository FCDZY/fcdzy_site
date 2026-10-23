/**
 * 纯文本工具（不依赖 markdown-it / highlight.js，避免被首页等轻量页面连带打包）。
 */
export function plainText(content?: string | null, maxLength = 120): string {
  if (!content) return ''
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}
