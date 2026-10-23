export function formatDate(value?: string | null, withTime = false): string {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return withTime ? `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}` : base
}

export function formatRelative(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(value)
}

export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) return '0'
  if (value < 1000) return String(value)
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 10000).toFixed(1)}w`
}
