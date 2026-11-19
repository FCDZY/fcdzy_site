<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Hero 背景：贪吃蛇（原型）
 *
 *  - 实心方块蛇身，长度固定、不进食、不出界（左右上下环绕）
 *  - 鼠标移动 → 蛇朝鼠标方向转弯（禁止 180° 掉头）
 *  - 鼠标静止 ~0.9s 后 → 随机游走（每 0.7s 换一次方向）
 *  - 只画在 Hero 里；`pointer-events: none`，不挡任何交互
 *  - 每步重绘一次（约 9 次/秒），不跑 60fps，省电
 */

const canvasRef = ref<HTMLCanvasElement | null>(null)

const CELL = 30
const STEP_MS = 110
const IDLE_MS = 900
const RANDOM_TURN_MS = 700
const SEGMENTS = 16

let raf = 0
let lastStep = 0
let lastMouseMove = 0
let lastRandomTurn = 0
let ctx: CanvasRenderingContext2D | null = null
let dpr = 1

let cols = 0
let rows = 0
/** 蛇身：头在数组末尾 */
let snake: Array<{ x: number; y: number }> = []
let dir = { x: 1, y: 0 }
let pointer = { x: 0, y: 0 }

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function resize() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.max(1, Math.round(rect.width * dpr))
  canvas.height = Math.max(1, Math.round(rect.height * dpr))
  ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  cols = Math.ceil(rect.width / CELL)
  rows = Math.ceil(rect.height / CELL)

  // 初始化：从左侧横向进入
  const cy = Math.floor(rows / 2)
  snake = Array.from({ length: SEGMENTS }, (_, i) => ({
    x: Math.max(0, Math.floor(cols / 3) - i),
    y: cy
  }))
  dir = { x: 1, y: 0 }
}

function draw() {
  if (!ctx) return
  const w = cols * CELL
  const h = rows * CELL
  ctx.clearRect(0, 0, w, h)

  for (let i = 0; i < snake.length; i += 1) {
    const seg = snake[i]
    // 尾巴逐渐变淡
    const t = 1 - i / snake.length
    ctx.fillStyle = `rgba(255, 255, 255, ${0.16 + t * 0.42})`
    const pad = i === snake.length - 1 ? 1 : 2
    ctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2)
  }
}

/** 候选方向：不允许 180° 掉头 */
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 }
]

function isReverse(next: { x: number; y: number }) {
  return next.x === -dir.x && next.y === -dir.y
}

function randomTurn() {
  const options = DIRECTIONS.filter((d) => !isReverse(d))
  dir = options[Math.floor(Math.random() * options.length)] || dir
}

/** 朝鼠标方向转弯：取位移更大的那个轴 */
function turnToPointer() {
  const head = snake[snake.length - 1]
  if (!head) return
  const headX = head.x * CELL + CELL / 2
  const headY = head.y * CELL + CELL / 2
  const dx = pointer.x - headX
  const dy = pointer.y - headY
  if (Math.abs(dx) < CELL && Math.abs(dy) < CELL) return

  const next =
    Math.abs(dx) >= Math.abs(dy)
      ? { x: Math.sign(dx), y: 0 }
      : { x: 0, y: Math.sign(dy) }

  if (!isReverse(next)) dir = next
}

function step() {
  const head = snake[snake.length - 1]
  if (!head) return
  let nextX = head.x + dir.x
  let nextY = head.y + dir.y

  // 环绕，不出界
  if (nextX < 0) nextX = cols - 1
  if (nextX >= cols) nextX = 0
  if (nextY < 0) nextY = rows - 1
  if (nextY >= rows) nextY = 0

  snake.push({ x: nextX, y: nextY })
  snake.shift()
}

function loop(now: number) {
  raf = window.requestAnimationFrame(loop)
  if (!lastStep) lastStep = now
  if (now - lastStep < STEP_MS) return
  lastStep = now

  const idle = now - lastMouseMove > IDLE_MS
  if (idle) {
    if (now - lastRandomTurn > RANDOM_TURN_MS) {
      lastRandomTurn = now
      randomTurn()
    }
  } else {
    turnToPointer()
  }

  step()
  draw()
}

function onPointerMove(event: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  // 只在指针位于 Hero 内时才跟随
  if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
    pointer = { x, y }
    lastMouseMove = performance.now()
  }
}

function onVisibility() {
  if (document.hidden) {
    window.cancelAnimationFrame(raf)
    raf = 0
  } else if (!raf) {
    lastStep = 0
    raf = window.requestAnimationFrame(loop)
  }
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resize()
  draw()
  if (reduceMotion()) return

  resizeObserver = new ResizeObserver(() => {
    resize()
    draw()
  })
  if (canvasRef.value) resizeObserver.observe(canvasRef.value)

  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)
  raf = window.requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(raf)
  window.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('visibilitychange', onVisibility)
  resizeObserver?.disconnect()
})
</script>

<template>
  <canvas ref="canvasRef" class="snake-canvas" aria-hidden="true" />
</template>

<style scoped>
.snake-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>
