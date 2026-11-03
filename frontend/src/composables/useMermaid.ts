import type { ThemeMode } from './useTheme'

/**
 * 正文里的 mermaid 流程图渲染。
 *
 * 设计要点：
 * 1. 懒加载：只有页面里真的出现 .mermaid-block 时才 import('mermaid')，主包体积不受影响；
 * 2. 源码兜底：渲染前源码一直在 DOM 里（.mermaid-src），渲染失败就保留源码 + 一行提示；
 * 3. 主题联动：亮/暗分别用 mermaid 的 default / dark 主题，切换主题时重渲染；
 * 4. 安全：securityLevel 用默认的 strict，不会执行流程图里的脚本/链接。
 */

type MermaidApi = typeof import('mermaid')['default']

let loader: Promise<MermaidApi> | null = null
let appliedTheme: string | null = null
let seq = 0

/** 同一时间只渲染一次，避免主题切换时重复执行 */
let chain: Promise<void> = Promise.resolve()

function loadMermaid(): Promise<MermaidApi> {
  if (!loader) {
    loader = import('mermaid').then((mod) => (mod.default ?? (mod as unknown as MermaidApi)))
  }
  return loader
}

async function ensureTheme(theme: ThemeMode): Promise<MermaidApi> {
  const mermaid = await loadMermaid()
  const next = theme === 'dark' ? 'dark' : 'default'
  if (appliedTheme !== next) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: next,
      fontFamily: 'inherit',
      // 让 SVG 背景透明，跟卡片底色融合
      themeVariables: { background: 'transparent' }
    })
    appliedTheme = next
  }
  return mermaid
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function paint(root: HTMLElement, theme: ThemeMode, force: boolean): Promise<void> {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'))
  if (!blocks.length) return

  const mermaid = await ensureTheme(theme)

  for (const block of blocks) {
    // 源码存在 data-src 里（encodeURIComponent 避免属性转义问题），渲染后会替换 innerHTML
    if (!block.dataset.src) {
      const source = block.querySelector('.mermaid-src')?.textContent ?? ''
      if (!source.trim()) continue
      block.dataset.src = encodeURIComponent(source)
    }
    if (!force && block.dataset.renderedTheme === theme) continue

    const source = decodeURIComponent(block.dataset.src)
    const id = `mermaid-svg-${(seq += 1)}`
    try {
      const { svg } = await mermaid.render(id, source)
      block.innerHTML = svg
      block.dataset.renderedTheme = theme
      block.classList.add('is-rendered')
      block.classList.remove('is-error')
      block.removeAttribute('title')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      block.innerHTML =
        `<pre class="mermaid-src">${escapeHtml(source)}</pre>` +
        `<p class="mermaid-error-tip">流程图渲染失败，已显示源码：${escapeHtml(message)}</p>`
      block.classList.add('is-error')
      block.classList.remove('is-rendered')
    } finally {
      // mermaid 渲染成功时生成的 <svg> 会带同样的 id，这里只清理「不在本块内」的临时节点，
      // 否则会把刚插入的图删掉（踩过）。
      const stray = document.getElementById(id)
      if (stray && !block.contains(stray)) {
        stray.remove()
      }
    }
  }
}

/**
 * 渲染 root 下所有 mermaid 代码块。
 * 多次调用会自动排队；同一主题下已渲染过的会跳过，除非 force = true。
 */
export function renderMermaidBlocks(
  root: HTMLElement | null | undefined,
  theme: ThemeMode,
  force = false
): Promise<void> {
  if (!root) return chain
  chain = chain
    .then(() => paint(root, theme, force))
    .catch((error) => {
      // 兜底：不因为一张图挂掉整篇文章
      console.warn('[mermaid] 渲染失败', error)
    })
  return chain
}
