<script setup lang="ts">
import { computed } from 'vue'
import type { Article } from '@/types'
import ArticleRow from '@/components/ArticleRow.vue'

/**
 * 时间线文章列表（按天分组）
 *
 * 结构：`日期节点(96px) │ 竖线 │ 文章内容`
 *  - 同一天的多篇文章共用一个节点（不重复大数字）
 *  - 行内不再显示日期（由左侧大数字承担）
 *  - 竖线画在容器上，整列连续不断
 */
const props = withDefaults(
  defineProps<{
    articles: Article[]
    /** 缩略图宽度：首页/列表页统一 120 */
    thumbWidth?: number
    /** 紧凑模式：日期栏收窄（首页右栏较窄时用） */
    compact?: boolean
  }>(),
  { thumbWidth: 120, compact: false }
)

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

interface Group {
  /** yyyy-MM-dd */
  date: string
  /** 4 位年份 */
  year: string
  /** 两位月份，如 10 */
  monthNum: string
  day: string
  items: Article[]
}

/**
 * 按天分组。
 * 先按发布时间倒序排一遍：接口在部分场景下可能按 id 排序，
 * 不排会导致同一天被拆成两组、大数字重复出现。
 */
const groups = computed<Group[]>(() => {
  const result: Group[] = []
  const sorted = [...props.articles].sort((a, b) => {
    const da = (a.publishedAt || a.createdAt || '').toString()
    const db = (b.publishedAt || b.createdAt || '').toString()
    return da < db ? 1 : da > db ? -1 : 0
  })
  for (const article of sorted) {
    const raw = (article.publishedAt || article.createdAt || '').slice(0, 10)
    if (!raw) continue
    const [, mm, dd] = raw.split('-')
    const last = result[result.length - 1]
    if (last && last.date === raw) {
      last.items.push(article)
    } else {
      result.push({
        date: raw,
        year: raw.slice(0, 4),
        monthNum: mm,
        day: String(Number(dd)),
        items: [article]
      })
    }
  }
  return result
})
</script>

<template>
  <div class="timeline" :class="{ 'is-compact': compact }">
    <section v-for="group in groups" :key="group.date" class="tl-group">
      <div class="tl-node">
        <span class="tl-dot" aria-hidden="true" />
        <time class="tl-date" :datetime="group.date">
          <span class="tl-ym">{{ group.year }}.{{ group.monthNum }}</span>
          <span class="tl-day">{{ group.day }}</span>
        </time>
      </div>

      <div class="tl-body">
        <ArticleRow
          v-for="item in group.items"
          :key="item.id"
          :article="item"
          :thumb-width="thumbWidth"
          hide-date
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.timeline {
  position: relative;
  margin-top: 18px;
}

/* 竖线：整列连续，不随分组断开 */
.timeline::before {
  content: '';
  position: absolute;
  top: 14px;
  bottom: 6px;
  left: 96px;
  width: 1px;
  background: var(--row-line);
}

.tl-group {
  display: grid;
  /* 日期列收窄到 78px：给卡片让出 18px，同时日期仍在同一位置 */
  grid-template-columns: 78px minmax(0, 1fr);
}

.tl-group + .tl-group {
  margin-top: 26px;
}

/* 左侧大日期：右对齐，紧贴竖线 */
.tl-node {
  position: relative;
  padding: 6px 20px 0 0;
  text-align: right;
}

.tl-dot {
  position: absolute;
  top: 13px;
  right: -4px;
  width: 8px;
  height: 8px;
  background: transparent;
  /* 边框加粗到 2px：中间的孔只剩 4px，竖线穿过时几乎看不出"十字" */
  border: 2px solid var(--row-title);
  border-radius: 50%;
  transition: background-color 0.18s ease;
}

/* 鼠标落在当天任意一张卡片上 → 圆点变实心 */
.tl-group:has(.article-row:hover) .tl-dot {
  background: var(--row-title);
}

.tl-date {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

/* 年.月：小号但必须看得清——11px + 浅灰对比度只有 2.9:1，加深到正文灰并提字重 */
.tl-ym {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--row-summary);
  font-variant-numeric: tabular-nums;
}

/* 天：大数字，视觉主体 */
.tl-day {
  font-size: 38px;
  font-weight: 800;
  line-height: 0.95;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--row-title);
}

.tl-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-left: 30px;
  min-width: 0;
}


/* 紧凑模式：日期栏 64px、数字 28px（首页右栏宽度有限） */
.timeline.is-compact::before {
  left: 64px;
}

.timeline.is-compact .tl-group {
  grid-template-columns: 64px minmax(0, 1fr);
}

.timeline.is-compact .tl-node {
  padding-right: 16px;
}

.timeline.is-compact .tl-day {
  font-size: 28px;
}

.timeline.is-compact .tl-ym {
  /* 紧凑模式日期列 64px，字号提到 11.5px 后正好放得下「2026.10」 */
  font-size: 11.5px;
  letter-spacing: 0.03em;
}

.timeline.is-compact .tl-body {
  padding-left: 22px;
}

@media (max-width: 720px) {
  .timeline::before {
    left: 62px;
    top: 10px;
  }

  .tl-group {
    grid-template-columns: 62px minmax(0, 1fr);
  }

  .tl-node {
    /* 年月提到 10.5px 后右内距收 4px，避免「2026.10」顶到屏幕左边缘 */
    padding-right: 12px;
  }

  .tl-day {
    font-size: 24px;
  }

  .tl-ym {
    font-size: 10.5px;
    letter-spacing: 0.03em;
  }

  .tl-body {
    padding-left: 18px;
  }
}
</style>
