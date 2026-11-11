import { ref } from 'vue'

/**
 * 阅读偏好：字号 / 行宽。
 *
 * 放在 localStorage 而不是数据库：
 * 这是「读者本机」的显示偏好，不需要跨设备同步，也不需要服务端存储。
 * （和 useTheme 用的是同一套思路）
 */
export type FontSize = 'sm' | 'md' | 'lg'
export type LineWidth = 'narrow' | 'normal' | 'wide'

const STORAGE_KEY = 'fcdzy_reading_prefs'

const FONT_SIZES: FontSize[] = ['sm', 'md', 'lg']
const LINE_WIDTHS: LineWidth[] = ['narrow', 'normal', 'wide']

const fontSize = ref<FontSize>('md')
const lineWidth = ref<LineWidth>('normal')

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { fontSize?: string; lineWidth?: string }
    if (parsed.fontSize && FONT_SIZES.includes(parsed.fontSize as FontSize)) {
      fontSize.value = parsed.fontSize as FontSize
    }
    if (parsed.lineWidth && LINE_WIDTHS.includes(parsed.lineWidth as LineWidth)) {
      lineWidth.value = parsed.lineWidth as LineWidth
    }
  } catch {
    /* 隐私模式 / 非法 JSON 时用默认值 */
  }
}

function apply() {
  const root = document.documentElement
  root.dataset.readingSize = fontSize.value
  root.dataset.readingWidth = lineWidth.value
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: fontSize.value, lineWidth: lineWidth.value }))
  } catch {
    /* 忽略 */
  }
}

/** 首屏应用（在 main.ts 里调用一次，和 initTheme 同级） */
export function initReadingPrefs() {
  readStored()
  apply()
}

export function setFontSize(value: FontSize) {
  fontSize.value = value
  apply()
  persist()
}

export function setLineWidth(value: LineWidth) {
  lineWidth.value = value
  apply()
  persist()
}

export function useReadingPrefs() {
  return { fontSize, lineWidth, setFontSize, setLineWidth }
}
