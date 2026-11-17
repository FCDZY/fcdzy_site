import { getToken } from '@/api/http'

/**
 * 下载后台导出的文章 zip。
 *
 * 走原生 fetch 而不是 axios 封装：接口返回的是二进制流（application/zip），
 * 公共拦截器会按 JSON 解析，容易出问题。
 */
export async function exportArticlesZip(): Promise<{ filename: string; size: number; count: number }> {
  const res = await fetch('/api/admin/export/articles', {
    headers: { Authorization: `Bearer ${getToken()}` }
  })
  if (!res.ok) {
    throw new Error(`导出失败（HTTP ${res.status}）`)
  }

  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const matched = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition)
  const filename = matched ? decodeURIComponent(matched[1].replace(/"/g, '')) : 'fcdzy-articles.zip'
  const count = Number(res.headers.get('X-Article-Count') || 0)

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 交给浏览器读文件后回收
  setTimeout(() => URL.revokeObjectURL(url), 2000)

  return { filename, size: blob.size, count }
}
