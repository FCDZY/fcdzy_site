/**
 * 本地图片链接的识别与替换。
 *
 * 从 Typora / Obsidian 导出的 Markdown 里，图片常常是相对路径：
 *   ![图](img/01_集合类体系结构图.png)
 *   ![图](./img/a.png)
 *   ![图](<../assets/b.png>)
 * 这些路径在站点上必然 404，需要在导入后换成 OSS 地址。
 */

export interface LocalImageRef {
  /** 正文里出现的原始地址（未解码，用于精确替换） */
  raw: string
  /** 解码后的路径 */
  path: string
  /** 文件名（小写、解码后），用于和用户选中的文件对应 */
  name: string
}

const IMAGE_RE = /!\[[^\]]*\]\(\s*(<[^>\n]+>|[^)\s]+)([^)]*)\)/g

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** 是否是「需要上传」的本地相对路径 */
export function isLocalImagePath(path: string): boolean {
  const value = path.trim()
  if (!value) return false
  if (/^(https?:)?\/\//i.test(value)) return false
  if (/^data:/i.test(value)) return false
  return true
}

function baseName(path: string): string {
  const clean = path.split(/[?#]/)[0]
  const parts = clean.split(/[\\/]/)
  return (parts[parts.length - 1] || '').toLowerCase()
}

/**
 * 找出正文里所有本地图片。按 raw 去重，保持出现顺序。
 */
export function findLocalImages(content?: string | null): LocalImageRef[] {
  const source = String(content || '')
  const seen = new Set<string>()
  const found: LocalImageRef[] = []
  for (const matched of source.matchAll(IMAGE_RE)) {
    let raw = matched[1]
    if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1)
    if (!isLocalImagePath(raw)) continue
    if (seen.has(raw)) continue
    seen.add(raw)
    const path = decode(raw)
    found.push({ raw, path, name: baseName(path) })
  }
  return found
}

// 代码块语言白名单：只有这些词出现在围栏上一行时才认为是「语言标签」
const LANGS = new Set([
  'java', 'js', 'javascript', 'ts', 'typescript', 'jsx', 'tsx', 'vue', 'html', 'css', 'scss', 'less',
  'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'sql', 'bash', 'sh', 'shell', 'zsh', 'powershell', 'ps1',
  'python', 'py', 'go', 'rust', 'kotlin', 'scala', 'c', 'h', 'cpp', 'csharp', 'cs', 'php', 'ruby',
  'swift', 'dart', 'lua', 'gradle', 'groovy', 'dockerfile', 'nginx', 'text', 'plaintext'
])

// Typora / 网页复制出来的「代码块」占位标签，没有语言但同样是单独一行
const PLACEHOLDER_LABELS = new Set(['代码块', 'code block', 'code', 'codeblock'])
const FENCE_ONLY = new RegExp("^\\s*(`{3,}|~{3,})\\s*$")

export interface FenceFixResult {
  content: string
  fixed: number
  langs: string[]
  placeholders: number
}

/**
 * 修「语言名单独成行」的代码块。
 * 有些 md（从网页/聊天窗口复制拼装而来）会把语言标记放在围栏上一行：
 *
 *   java
 *   (空行)
 *   ```
 *   代码
 *   ```
 *
 * 这种写法 markdown-it 会解析成「一段文字 java + 一个无语言围栏」，
 * 触发 preflight 的「没写语言」并丢掉高亮。这里把它合并回带语言的围栏。
 */
export function fixSplitFences(source: string): FenceFixResult {
  // Typora 粘出来的文件常是 CRLF，且语言标签和围栏之间会留 2~3 个空行
  const crlf = source.indexOf(String.fromCharCode(13) + String.fromCharCode(10)) >= 0
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  const langs: string[] = []
  let fixed = 0
  let placeholders = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const token = line.trim().toLowerCase()
    const isLang = LANGS.has(token) && !FENCE_ONLY.test(line)
    const isPlaceholder = PLACEHOLDER_LABELS.has(token) && !FENCE_ONLY.test(line)
    if (isLang || isPlaceholder) {
      let gap = 0
      let j = i + 1
      while (j < lines.length && !lines[j].trim() && gap < 4) {
        gap++
        j++
      }
      if (j < lines.length && FENCE_ONLY.test(lines[j]) && gap <= 3) {
        const fenceLine = lines[j]
        const fence = fenceLine.trim()
        const indent = fenceLine.slice(0, fenceLine.length - fenceLine.trimStart().length)
        const closing = fence[0] === '`' ? /^`{3,}$/ : /^~{3,}$/
        let closed = false
        for (let k = j + 1; k < lines.length; k++) {
          if (closing.test(lines[k].trim())) { closed = true; break }
        }
        if (closed) {
          const lang = isPlaceholder ? 'text' : token
          out.push(indent + fence + lang)
          langs.push(lang)
          if (isPlaceholder) placeholders++
          else fixed++
          i = j
          continue
        }
      }
    }
    out.push(line)
  }
  const joined = out.join(String.fromCharCode(10))
  return {
    content: crlf ? joined.replace(/\n/g, String.fromCharCode(13) + String.fromCharCode(10)) : joined,
    fixed,
    langs,
    placeholders
  }
}

/**
 * 把正文里的本地图片地址换成新地址。
 * mapping 的 key 用 raw（原始写法），value 是新 URL。
 */
export function replaceImages(content: string, mapping: Map<string, string>): string {
  if (!mapping.size) return content
  return String(content).replace(IMAGE_RE, (whole, rawImage: string, tail: string) => {
    let raw = rawImage
    if (raw.startsWith('<') && raw.endsWith('>')) raw = raw.slice(1, -1)
    const next = mapping.get(raw)
    if (!next) return whole
    return whole.replace(rawImage, next)
  })
}

/**
 * 按照片文件名把用户选中的文件配对到正文里的本地图片。
 * 同名文件可能出现在不同目录，按出现顺序依次消耗。
 */
export function pairFiles(
  refs: LocalImageRef[],
  files: File[]
): { pairs: { ref: LocalImageRef; file: File }[]; unmatchedRefs: LocalImageRef[] } {
  const pool = new Map<string, File[]>()
  for (const file of files) {
    const key = file.name.toLowerCase()
    const list = pool.get(key) || []
    list.push(file)
    pool.set(key, list)
  }
  const pairs: { ref: LocalImageRef; file: File }[] = []
  const unmatchedRefs: LocalImageRef[] = []
  for (const ref of refs) {
    const list = pool.get(ref.name)
    const file = list && list.length ? list.shift() : undefined
    if (file) pairs.push({ ref, file })
    else unmatchedRefs.push(ref)
  }
  return { pairs, unmatchedRefs }
}
