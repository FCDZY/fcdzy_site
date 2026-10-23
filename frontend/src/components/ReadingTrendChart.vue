<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ViewTrend } from '@/types'
import { useTheme } from '@/composables/useTheme'

/**
 * 近 7 天阅读趋势（面积折线图）。
 * - 按需引入 ECharts 模块，只有本页会加载
 * - 跟随主题切换配色，容器尺寸变化自动 resize，卸载时 dispose
 */
echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ trend: ViewTrend | null; loading?: boolean }>()

const { isDark } = useTheme()
const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

const points = computed(() => props.trend?.points ?? [])
const hasData = computed(() => (props.trend?.total ?? 0) > 0)
const total = computed(() => props.trend?.total ?? 0)

function buildOption() {
  const dark = isDark.value
  const labels = points.value.map((p) => p.label)
  const values = points.value.map((p) => p.views)

  return {
    grid: { left: 8, right: 14, top: 18, bottom: 6, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: dark ? 'rgba(23,26,33,.94)' : '#ffffff',
      borderColor: dark ? 'rgba(255,255,255,.14)' : 'rgba(16,24,40,.08)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: dark ? '#e8ebf0' : '#1f2937', fontSize: 12.5 },
      axisPointer: {
        type: 'line',
        lineStyle: { color: dark ? 'rgba(255,255,255,.25)' : 'rgba(59,130,246,.35)', type: 'dashed' }
      },
      formatter: (items: { axisValue: string; data: number }[]) => {
        const item = items?.[0]
        if (!item) return ''
        return `${item.axisValue}　<b>${item.data}</b> 次阅读`
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: dark ? 'rgba(255,255,255,.16)' : 'rgba(16,24,40,.12)' } },
      axisTick: { show: false },
      axisLabel: { color: dark ? 'rgba(232,235,240,.7)' : '#6b7280', fontSize: 12 }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: dark ? 'rgba(255,255,255,.07)' : 'rgba(16,24,40,.06)' } },
      axisLabel: { color: dark ? 'rgba(232,235,240,.55)' : '#9ca3af', fontSize: 12 }
    },
    series: [
      {
        name: '阅读量',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 6,
        data: values,
        lineStyle: {
          width: 2.5,
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#8b5cf6' }
          ])
        },
        itemStyle: { color: '#6366f1', borderColor: dark ? '#171a21' : '#ffffff', borderWidth: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(99,102,241,.28)' },
            { offset: 1, color: 'rgba(99,102,241,.02)' }
          ])
        },
        emphasis: { scale: 1.4, itemStyle: { color: '#4f46e5' } }
      }
    ],
    animationDuration: 600,
    animationEasing: 'cubicOut'
  }
}

function render() {
  if (!chartEl.value) return
  if (!chart) {
    chart = echarts.init(chartEl.value, undefined, { renderer: 'canvas' })
    chart.setOption(buildOption() as echarts.EChartsCoreOption)
    return
  }
  chart.setOption(buildOption() as echarts.EChartsCoreOption, true)
}

onMounted(() => {
  render()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => chart?.resize())
    if (chartEl.value) observer.observe(chartEl.value)
  }
  window.addEventListener('resize', onWindowResize)
})

function onWindowResize() {
  chart?.resize()
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})

watch([() => props.trend, isDark], () => render())
</script>

<template>
  <div class="trend">
    <div class="trend-head">
      <div class="trend-title">
        <span>近 7 天阅读趋势</span>
        <span class="trend-total">共 {{ total }} 次</span>
      </div>
      <span v-if="trend && !hasData" class="trend-hint">统计从今天开始累积</span>
    </div>
    <div ref="chartEl" class="trend-canvas" />
    <div v-if="loading && !trend" class="trend-loading">加载中…</div>
  </div>
</template>

<style scoped>
.trend {
  position: relative;
}

.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.trend-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.trend-total {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
}

.trend-hint {
  font-size: 12px;
  color: var(--text-3);
}

.trend-canvas {
  width: 100%;
  height: 240px;
}

.trend-loading {
  position: absolute;
  inset: 30px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-3);
}

@media (max-width: 768px) {
  .trend-canvas {
    height: 200px;
  }
}
</style>
