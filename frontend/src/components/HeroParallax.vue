<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Hero 背景：2.5D 分层视差
 *
 * 素材由 color + depth 两张图离线生成（python）：
 *   base  背景板（人物/近景已填充补掉，避免视差时重影）
 *   mid   中景（人物、栏杆、右侧铁架）
 *   near  近景（前景红色结构）
 *
 * 鼠标移动 → 三层以不同幅度反向/正向位移，形成纵深感。
 * 位移只用 transform，纯 CSS 变量驱动，不触发重渲染。
 * 移动端（< 900px）直接显示后台配置的单图，省流量也省性能。
 */
const props = withDefaults(
  defineProps<{
    /** 后台配置的 Hero 图：移动端 / 不支持时的兜底 */
    fallbackSrc?: string
  }>(),
  { fallbackSrc: '' }
)

const rootRef = ref<HTMLElement | null>(null)

/** 三层位移幅度（px），近景最大 */
const OFFSETS = { base: 4, mid: 11, near: 20 }

function onPointerMove(event: PointerEvent) {
  const el = rootRef.value
  if (!el) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if (window.innerWidth < 900) return
  const nx = event.clientX / window.innerWidth - 0.5
  const ny = event.clientY / window.innerHeight - 0.5
  el.style.setProperty('--nx', nx.toFixed(4))
  el.style.setProperty('--ny', ny.toFixed(4))
}

function reset() {
  const el = rootRef.value
  if (!el) return
  el.style.setProperty('--nx', '0')
  el.style.setProperty('--ny', '0')
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('pointerleave', reset)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerleave', reset)
})
</script>

<template>
  <div ref="rootRef" class="hero-layers" aria-hidden="true">
    <!-- 兜底图：移动端 / 老浏览器 -->
    <img v-if="props.fallbackSrc" class="layer layer--fallback" :src="props.fallbackSrc" alt="" fetchpriority="high" />

    <!-- 三层视差 -->
    <div class="layer-stack">
      <img class="layer layer--base" src="/hero-layers/base.webp" alt="" fetchpriority="high" />
      <img class="layer layer--mid" src="/hero-layers/mid.webp" alt="" />
      <img class="layer layer--right" src="/hero-layers/right.webp" alt="" />
      <img class="layer layer--near" src="/hero-layers/near.webp" alt="" />
    </div>
  </div>
</template>

<style scoped>
.hero-layers {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  /* 鼠标归一化坐标，由 JS 写入 */
  --nx: 0;
  --ny: 0;
}

.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 45%;
  will-change: transform;
  transition: transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* 兜底图：移动端可见，桌面隐藏 */
.layer--fallback {
  display: none;
}

.layer-stack {
  position: absolute;
  inset: 0;
  /* 真·3D：给容器透视，随鼠标轻微旋转；层用 translateZ 拉开距离 */
  perspective: 1400px;
  perspective-origin: 50% 50%;
  transform-style: preserve-3d;
  /* nx/ny 取值区间是 ±0.5，乘 5deg 才能到 ±2.5° 的观感 */
  transform: rotateX(calc(var(--ny) * -5deg)) rotateY(calc(var(--nx) * 5deg));
  transition: transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1);
  will-change: transform;
}

/* 大气雾：只压画面顶部，模拟远处城市的空气层 */
.layer-stack::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(150, 220, 255, 0.1) 0%, rgba(150, 220, 255, 0.04) 32%, transparent 55%);
}

/* 三层不同幅度：越近动得越多 */
.layer--base {
  transform: translateZ(0) scale(1.1) translate3d(calc(var(--nx) * 8px), calc(var(--ny) * 6px), 0);
  /* 空气透视：远景轻微发虚、发灰、提亮一点 */
  filter: blur(0.6px) saturate(0.94) brightness(1.04);
}

.layer--mid {
  transform: translateZ(24px) scale(1.1) translate3d(calc(var(--nx) * 20px), calc(var(--ny) * 15px), 0);
  /* 接触阴影：按 PNG 的 alpha 轮廓投影，人物/栏杆会"浮"在城市上 */
  /* 双层阴影：2px 贴地短影 + 30px 软长影，才有"离地"的体积感 */
  filter: drop-shadow(0 3px 6px rgba(0, 8, 16, 0.45)) drop-shadow(0 14px 30px rgba(0, 8, 16, 0.5));
}

/* 右侧铁架：比人物稍近一点，单独走一档 */
.layer--right {
  transform: translateZ(38px) scale(1.1) translate3d(calc(var(--nx) * 30px), calc(var(--ny) * 21px), 0);
  filter: drop-shadow(0 2px 5px rgba(0, 8, 16, 0.4)) drop-shadow(0 10px 24px rgba(0, 8, 16, 0.45));
}

.layer--near {
  transform: translateZ(56px) scale(1.1) translate3d(calc(var(--nx) * 40px), calc(var(--ny) * 28px), 0);
  filter: drop-shadow(0 4px 8px rgba(0, 8, 16, 0.5)) drop-shadow(0 18px 38px rgba(0, 8, 16, 0.55));
}

/* 移动端 / 窄屏：用后台配置的单图 */
@media (max-width: 899px) {
  .layer-stack {
    display: none;
  }

  .layer--fallback {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .layer {
    transition: none;
  }

  .layer-stack {
    perspective: none;
    transform: none;
    transition: none;
  }
}
</style>
