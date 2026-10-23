import { computed, ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'fcdzy_theme'

function readStored(): ThemeMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** 全局唯一的主题状态（轻量单例，不依赖 Pinia，便于在挂载前应用） */
const theme = ref<ThemeMode>(readStored())
const isDark = computed(() => theme.value === 'dark')

let transitionTimer: number | undefined

function applyToDom() {
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
}

/** 首屏应用：直接生效，不加过渡，避免闪一下 */
export function initTheme() {
  applyToDom()
}

function applyWithTransition() {
  const root = document.documentElement
  root.classList.add('theme-transition')
  applyToDom()
  if (transitionTimer) {
    window.clearTimeout(transitionTimer)
  }
  transitionTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 360)
}

export function setTheme(next: ThemeMode) {
  if (theme.value === next) return
  theme.value = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* 隐私模式下忽略 */
  }
  applyWithTransition()
}

export function toggleTheme() {
  setTheme(isDark.value ? 'light' : 'dark')
}

export function useTheme() {
  return { theme, isDark, toggleTheme, setTheme }
}
