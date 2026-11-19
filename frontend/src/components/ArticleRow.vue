<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { optimizeImage } from '@/utils/image'
import type { Article } from '@/types'
import { formatDate } from '@/utils/format'
import { plainText } from '@/utils/text'
import { buildTagColorVars } from '@/utils/tagColor'

/**
 * 文章行（编辑式列表，首页与列表页共用）
 *
 * 规则：
 *  - 缩略图永远在右侧、固定槽位；没有封面也保留占位，保证所有行骨架一致
 *  - 无白底、无阴影、无圆角；行与行之间靠 1px 细线分隔（--row-line 两套主题）
 *  - 标题墨色、摘要深灰 1.7 行高
 *  - 元信息做「页码式」注脚：11px、字距 1px、浅灰
 *  - 图片 4px 圆角 + 1px 极淡描边，不做灰度
 */
const props = withDefaults(
  defineProps<{
    article: Article
    /** 缩略图宽度：首页 168，列表页更紧凑 120 */
    thumbWidth?: number
    /** 时间线模式下日期由左侧大数字承担，行内不再重复显示 */
    hideDate?: boolean
  }>(),
  { thumbWidth: 168, hideDate: false }
)

const router = useRouter()

const thumbUrl = computed(() => optimizeImage(props.article.coverImage || '', { width: 400, quality: 86 }))
const coverFailed = ref(false)
const showCover = computed(() => !!thumbUrl.value && !coverFailed.value)

const summary = computed(() => props.article.summary || plainText(props.article.content, 64))
const readingMinutes = computed(() => Number(props.article.readingMinutes) || 0)
const cardTags = computed(() => (props.article.tags || []).slice(0, 2))
const cardTagColors = computed(() => buildTagColorVars(cardTags.value.map((tag) => tag.name)))
const dateText = computed(() => formatDate(props.article.publishedAt || props.article.createdAt))

/** 分类配色：技术类固定蓝；其它按名字稳定取一种颜色（不随刷新变化） */
const OTHER_CAT_SLOTS = 5

const catColor = computed(() => {
  const name = props.article.category?.name || ''
  if (!name) return ''
  if (/技术|开发|编程|前端|后端/.test(name)) return 'var(--cat-tech)'
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return `var(--cat-${hash % OTHER_CAT_SLOTS})`
})

/**
 * 缩略图槽位：正方形。
 * 高度跟随所在行（grid stretch），宽度由 aspect-ratio 反推 —— 卡片等高时图片就是和行一样高的正方形。
 * thumbWidth 保留给移动端兜底（行高不够时按它取方形边长）。
 */
const mediaStyle = computed(() => ({
  minWidth: props.thumbWidth + 'px'
}))

function open() {
  router.push({ name: 'article', params: { slug: props.article.slug } })
}
</script>

<template>
  <article class="article-card article-row" @click="open">
    <div class="row-body">
      <div class="row-meta">
        <span v-if="article.topped" class="row-topped">置顶</span>
        <span v-if="article.category" class="row-cat" :style="{ color: catColor }">{{ article.category.name }}</span>
        <template v-if="!hideDate">
          <span class="row-dot" aria-hidden="true">·</span>
          <span class="row-date">{{ dateText }}</span>
        </template>
        <template v-if="readingMinutes">
          <span class="row-dot" aria-hidden="true">·</span>
          <span class="row-time">{{ readingMinutes }} 分钟</span>
        </template>
      </div>

      <h3 class="row-title">{{ article.title }}</h3>
      <p class="row-summary">{{ summary }}</p>

      <div class="row-foot">
        <div class="tags">
          <span
            v-for="(tag, index) in cardTags"
            :key="tag.id"
            class="tag"
            :style="{ '--tag-color': cardTagColors[index] }"
            @click.stop="router.push(`/tag/${tag.slug}`)"
            >#{{ tag.name }}</span
          >
        </div>
      </div>
    </div>

    <div class="card-media" :class="{ 'is-empty': !showCover }" :style="mediaStyle">
      <img v-if="showCover" :src="thumbUrl" :alt="article.title" loading="lazy" @error="coverFailed = true" />
    </div>
  </article>
</template>

<style scoped>
.article-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  /* stretch：让图片槽位拿到与行内容相同的高度，正方形才有参照 */
  align-items: stretch;
  /* A 方案：每篇一张实色卡片，靠卡片本身分隔，不再用横线 */
  padding: 18px 20px;
  cursor: pointer;
  background: var(--card-surface);
  border: 1px solid var(--card-line);
  border-radius: 10px;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}

.article-row:hover {
  background: var(--card-surface-hover);
  border-color: var(--card-line-hover);
}

.card-media {
  overflow: hidden;
  /* 正方形：边长 = 卡片内容高度（174 - 18×2 = 138），图片 cover 裁切 */
  width: 138px;
  height: 138px;
  aspect-ratio: 1 / 1;
  background: var(--surface-muted, rgba(15, 23, 42, 0.05));
  border: 1px solid var(--image-line);
  border-radius: 6px;
}
.card-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 没有封面：虚线 + 极淡斜纹占位 */
.card-media.is-empty {
  border-style: dashed;
  background-color: transparent;
  background-image: repeating-linear-gradient(45deg, var(--image-line) 0 1px, transparent 1px 8px);
}

.row-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 页码式注脚 */
.row-meta {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  overflow: hidden;
  margin-bottom: 6px;
  font-size: 11.5px;
  letter-spacing: 0.3px;
  color: var(--meta-faint);
  white-space: nowrap;
}

.row-cat {
  color: var(--meta-faint);
}

.row-topped {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  /* 置顶用橙色，与蓝色分类区分 */
  color: var(--cat-top);
  font-weight: 500;
}

.row-topped::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentcolor;
}

.row-dot {
  opacity: 0.5;
}

.row-date,
.row-time {
  font-variant-numeric: tabular-nums;
}

.row-title {
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  /* 立体感：上亮下暗的金属渐变 + 轻投影 */
  background-image: linear-gradient(180deg, var(--title-grad-1) 0%, var(--title-grad-2) 45%, var(--title-grad-3) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 2px 3px var(--title-shadow));
  white-space: nowrap;
  text-overflow: ellipsis;
  transition: filter 0.18s ease, background-image 0.18s ease;
}

.article-row:hover .row-title {
  filter: drop-shadow(0 2px 3px var(--title-shadow)) brightness(1.18);
}

.row-summary {
  /* 固定占两行高度：只有一行摘要的卡片也要和两行的一样高 */
  min-height: 3.6em;
  margin: 8px 0 0;
  overflow: hidden;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--row-summary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.row-foot {
  display: flex;
  gap: 10px;
  align-items: center;
  /* 没有标签的文章也留出同样的高度，所有卡片高度才一致 */
  min-height: 20px;
  min-width: 0;
  margin-top: 10px;
}

.tags {
  display: flex;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
}

.tag {
  flex: none;
  font-size: 11.5px;
  letter-spacing: 0.3px;
  color: var(--tag-color, var(--meta-faint));
  white-space: nowrap;
  cursor: pointer;
}

.tag:hover {
  text-decoration: underline;
}

@media (max-width: 720px) {
  .article-row {
    gap: 12px;
    padding: 14px 2px;
  }

  /* 手机上按固定小方形，别让图片吃掉正文宽度 */
  .card-media {
    width: 76px;
    height: 76px;
    min-width: 0;
  }

  .row-title {
    /* 窄屏正文栏变窄，标题允许折两行，不再单行截断 */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    font-size: 16px;
    white-space: normal;
  }
}
</style>
