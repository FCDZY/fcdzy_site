<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 文章详情页顶部阅读进度条。
 *
 * - 位置：`position: fixed; top: 0`，3px 细条，不拦截鼠标事件
 * - 进度：已滚动距离 / (文档可滚动高度 - 视口高度)，即公式里的「文章总可滚动高度」
 * - 平滑：用 transform: scaleX + 短过渡，滚动时跟随而不是突兀跳变
 * - 边界：内容不足一屏（无可滚动距离）时保持 0 且整条隐藏；滚到底部判定为 100%
 * - 只在文章详情页挂载（由 ArticleDetailView 决定），其它页面不会渲染
 */
const visible = ref(false)
const progress = ref(0)

let rafId = 0
let pending = false
let observer: ResizeObserver | null = null

function measure() {
  const doc = document.documentElement
  const scrollable = doc.scrollHeight - window.innerHeight
  // 边界：文章内容比屏幕还短（或刚好一屏）时没有可滚动距离 → 保持 0，不显示满条
  if (scrollable <= 0) {
    return 0
  }
  const scrolled = window.scrollY || doc.scrollTop || 0
  // 边界：滚到底（含 1px 取整误差）判为 100%
  if (scrolled >= scrollable - 1) {
    return 1
  }
  if (scrolled <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, scrolled / scrollable))
}

function apply() {
  pending = false
  const next = measure()
  progress.value = next
  // 0% 时整条隐藏，避免顶部留一条没意义的底线
  visible.value = next > 0.0005
}

function onScroll() {
  if (pending) {
    return
  }
  pending = true
  rafId = requestAnimationFrame(apply)
}

function onResize() {
  apply()
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize, { passive: true })
  // 正文图片 / 评论加载后文档高度会变，用 ResizeObserver 重新校准
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(onResize)
    observer.observe(document.body)
  }
  apply()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onResize)
  observer?.disconnect()
  observer = null
  if (rafId) {
    cancelAnimationFrame(rafId)
  }
})
</script>

<template>
  <div class="reading-progress" :class="{ 'is-visible': visible }" aria-hidden="true">
    <span class="reading-progress__bar" :style="{ transform: `scaleX(${progress})` }" />
  </div>
</template>

<style scoped>
/* 固定在视口最顶端：只有 3px 高，压在导航条最上沿，不遮挡导航文字 */
.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 300;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.reading-progress.is-visible {
  opacity: 1;
}

.reading-progress__bar {
  display: block;
  width: 100%;
  height: 100%;
  transform: scaleX(0);
  transform-origin: 0 50%;
  /* 短过渡 + GPU 变换：滚动时跟手又不会一格一格跳 */
  transition: transform 0.12s ease-out;
  will-change: transform;
  border-radius: 0 2px 2px 0;
  background: linear-gradient(
    90deg,
    rgba(96, 165, 250, 0.72) 0%,
    rgba(129, 140, 248, 0.68) 55%,
    rgba(167, 139, 250, 0.62) 100%
  );
  box-shadow: 0 0 6px rgba(96, 165, 250, 0.35);
}

html.dark .reading-progress__bar {
  background: linear-gradient(
    90deg,
    rgba(125, 211, 252, 0.78) 0%,
    rgba(165, 180, 252, 0.72) 55%,
    rgba(196, 181, 253, 0.66) 100%
  );
  box-shadow: 0 0 8px rgba(125, 211, 252, 0.32);
}

/* 系统开启「减少动态效果」时不做过渡 */
@media (prefers-reduced-motion: reduce) {
  .reading-progress,
  .reading-progress__bar {
    transition: none;
  }
}
</style>
