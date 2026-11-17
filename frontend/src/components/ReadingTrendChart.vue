<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ViewTrend } from '@/types'
import { useTheme } from '@/composables/useTheme'

/**
 * 阅读趋势（纯折线 + 平均线，不再填充面积）。
 * - 按需引入 ECharts 模块，只有本页会加载
 * - 跟随主题切换配色，容器尺寸变化自动 resize，卸载时 dispose
 */
echarts.use([LineChart, GridComponent, MarkLineComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ trend: ViewTrend | null; loading?: boolean }>()

const { isDark } = useTheme()
const chartEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

const points = computed(() => props.trend?.points ?? [])
const hasData = computed(() => (props.trend?.total ?? 0) > 0)
const total = computed(() => props.trend?.total ?? 0)
/** 区间平均值：只算有数据的天数（总阅读 ÷ 天数），用于画橙色均值线 */
const average = computed(() => {
  const values = points.value.map((point) => Number(point.views) || 0)
  if (!values.length) return 0
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length)
})

function buildOption() {
  const dark = isDark.value
  const labels = points.value.map((p) => p.label)
  const values = points.value.map((p) => p.views)

  return {
    grid: { left: 8, right: 26, top: 20, bottom: 6, containLabel: true },
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
        // 只取一点点平滑：点少的时候强平滑会"造出"不存在的峰
        smooth: 0.15,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 5,
        data: values,
        lineStyle: {
          width: 2,
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#8b5cf6' }
          ])
        },
        itemStyle: { color: '#6366f1', borderColor: dark ? '#14171d' : '#ffffff', borderWidth: 2 },
        // 不再填充面积：7~14 个点时面积会把小波动放大成"暴涨"
        areaStyle: null,
        emphasis: { scale: 1.6, itemStyle: { color: '#4f46e5' } },
        // 平均线：橙色虚线，和蓝紫阅读线明确区分
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.4, opacity: 0.9 },
          label: {
            position: 'insideEndTop',
            formatter: '平均 ' + average.value,
            color: '#d97706',
            fontSize: 11.5,
            fontWeight: 600,
            backgroundColor: dark ? 'rgba(20,23,29,.9)' : 'rgba(255,255,255,.92)',
            padding: [2, 5],
            borderRadius: 4
          },
          data: [{ yAxis: average.value }]
        }
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
    <p v-if="trend && !hasData" class="trend-hint">统计从今天开始累积</p>
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

/* 图表区域：加高到 340px，折线不再被压成横条（和仪表盘面板高度匹配） */
.trend-canvas {
  width: 100%;
  height: 340px;
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
