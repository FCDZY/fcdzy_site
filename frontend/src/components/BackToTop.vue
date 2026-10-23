<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 全局回到顶部按钮：
 * - 滚动超过 300px 才显示（带淡入淡出）
 * - 点击平滑滚回顶部（系统开启「减少动态效果」时直接跳转）
 * - 配色使用全局主题变量，深浅色自动适配
 * - 同时兼容 window 滚动与 el-main 这类内部滚动容器
 *   （scroll 事件不冒泡，因此用捕获阶段监听 document 上的所有滚动）
 */
const props = withDefaults(defineProps<{ threshold?: number }>(), { threshold: 300 })

const visible = ref(false)
let ticking = false
let scroller: HTMLElement | Window = window

function scrollTopOf(target: HTMLElement | Window): number {
  if (target === window) {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
  }
  return (target as HTMLElement).scrollTop
}

function update() {
  visible.value = scrollTopOf(scroller) > props.threshold
}

function onScroll(event: Event) {
  const target = event.target
  // 文档级滚动（window / documentElement / body）统一按 window 处理，其余取真正的滚动容器
  scroller =
    !target || target === document || target === document.documentElement || target === document.body ||
    !(target instanceof HTMLElement)
      ? window
      : target

  if (ticking) return
  ticking = true
  window.requestAnimationFrame(() => {
    update()
    ticking = false
  })
}

function toTop() {
  const reduceMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth'
  if (scroller === window) {
    window.scrollTo({ top: 0, behavior })
  } else {
    ;(scroller as HTMLElement).scrollTo({ top: 0, behavior })
  }
}

onMounted(() => {
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  update()
})

onBeforeUnmount(() => {
  document.removeEventListener('scroll', onScroll, { capture: true })
})
</script>

<template>
  <Transition name="backtop">
    <button
      v-show="visible"
      class="back-to-top"
      type="button"
      aria-label="回到顶部"
      title="回到顶部"
      @click="toTop"
    >
      <el-icon :size="18"><CaretTop /></el-icon>
    </button>
  </Transition>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  right: 24px;
  bottom: 32px;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--card);
  color: var(--text-2);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, color 0.2s ease,
    background-color 0.3s ease, border-color 0.3s ease;
}

.back-to-top:hover {
  transform: translateY(-3px);
  color: var(--brand-dark);
  border-color: var(--chip-border-hover);
  box-shadow: var(--card-shadow-hover);
}

.back-to-top:active {
  transform: translateY(-1px);
}

.back-to-top:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.backtop-enter-active,
.backtop-leave-active {
  transition: opacity 0.22s ease;
}

.backtop-enter-from,
.backtop-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .back-to-top {
    right: 16px;
    bottom: 20px;
    width: 40px;
    height: 40px;
  }
}
</style>
