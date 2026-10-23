<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Article } from '@/types'
import { formatDate, formatNumber } from '@/utils/format'
import { plainText } from '@/utils/text'
import { buildTagColorVars } from '@/utils/tagColor'

const props = withDefaults(
  defineProps<{
    article: Article
    /** 是否启用左侧缩略图位（预留） */
    showCover?: boolean
    /** 预留：自定义缩略图地址；不传时使用文章封面（后台可设置，也会自动取正文首图） */
    thumb?: string
  }>(),
  { showCover: true, thumb: '' }
)

const router = useRouter()

/** 左侧缩略图地址；为空时该位置不占空间，保持原有纯文字布局 */
const thumbUrl = computed(() => (props.showCover ? props.thumb || props.article.coverImage || '' : ''))
/**
 * 图片加载失败降级（例如 OSS 防盗链 403、外链失效）：
 * 不显示浏览器的破图占位，而是回落到「无图」版式，阅读体验更干净。
 */
const coverFailed = ref(false)
const showCoverImage = computed(() => !!thumbUrl.value && !coverFailed.value)
watch(thumbUrl, () => {
  coverFailed.value = false
})
const summary = computed(() => props.article.summary || plainText(props.article.content, 110))
/** 卡片底部小标签的彩色（与侧栏标签云同一套调色板与取色规则） */
const cardTags = computed(() => (props.article.tags || []).slice(0, 3))
const cardTagColors = computed(() => buildTagColorVars(cardTags.value.map((tag) => tag.name)))

function open() {
  router.push({ name: 'article', params: { slug: props.article.slug } })
}
</script>

<template>
  <article class="article-card card card--dark" @click="open">
    <!--
      左侧缩略图位（预留）：结构常驻，无图时 display:none 不占空间，
      后续给 article.coverImage 或 thumb 传值即可自动生效，无需改动布局。
    -->
    <div class="card-media" :class="{ 'is-empty': !showCoverImage }">
      <img
        v-if="showCoverImage"
        :src="thumbUrl"
        :alt="article.title"
        loading="lazy"
        @error="coverFailed = true"
      />
    </div>

    <div class="body">
      <div class="meta">
        <span v-if="article.category" class="category">{{ article.category.name }}</span>
        <span v-if="article.topped" class="topped">置顶</span>
        <span class="date">{{ formatDate(article.publishedAt || article.createdAt) }}</span>
      </div>
      <h3 class="title">{{ article.title }}</h3>
      <p class="summary">{{ summary }}</p>
      <div class="footer">
        <div class="tags">
          <span
            v-for="(tag, index) in cardTags"
            :key="tag.id"
            class="tag"
            :style="{ '--tag-color': cardTagColors[index] }"
            ># {{ tag.name }}</span
          >
        </div>
        <span class="views">{{ formatNumber(article.viewCount) }} 次阅读</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.article-card {
  position: relative;
  display: flex;
  gap: 16px;
  padding: 16px;
  margin-bottom: 14px;
  cursor: pointer;
  /* 默认：柔和浅阴影 */
  box-shadow: var(--card-shadow);
  /* 悬浮过渡：位移动画平滑不突兀 */
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1),
    box-shadow 0.28s cubic-bezier(0.22, 0.61, 0.36, 1), border-color 0.28s ease;
  will-change: transform, box-shadow;
}

.article-card:hover {
  /* 上浮 4px + 阴影扩大加深 */
  transform: translateY(-4px);
  box-shadow: var(--card-shadow-hover);
  border-color: var(--card-hover-border);
  z-index: 1;
}

/* ===== 左侧缩略图位（预留） ===== */
.card-media {
  flex: 0 0 180px;
  width: 180px;
  height: 116px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--media-bg);
}

/* 无图时不占空间，卡片保持原有全文布局 */
.card-media.is-empty {
  display: none;
}

.card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.35s ease;
}

.article-card:hover .card-media img {
  transform: scale(1.04);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  column-gap: 10px;
  row-gap: 6px;
  font-size: 12.5px;
  /* 深色玻璃上：次要信息用半透明白，保证可读又不过分抢眼 */
  color: var(--text-on-dark-3);
  text-shadow: var(--text-on-dark-shadow);
}

/* 日期：等宽数字 + 稍宽字距，与两侧标签拉开呼吸感 */
.date {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.category {
  color: var(--brand-dark);
  background: var(--brand-soft);
  padding: 1px 8px;
  border-radius: 999px;
}

.topped {
  color: var(--warn-text);
  background: var(--warn-soft);
  padding: 1px 8px;
  border-radius: 999px;
}

.title {
  margin: 8px 0 6px;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* 主标题：纯白 + 阴影，深色玻璃上对比度最高 */
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow-strong), 0 1px 8px rgba(0, 0, 0, 0.35);
}

.summary {
  margin: 0;
  /* 简介：浅白（不透明度 0.88，不发虚）+ 柔和阴影 */
  color: var(--text-on-dark-2);
  text-shadow: var(--text-on-dark-shadow);
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.footer {
  margin-top: auto;
  padding-top: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  font-size: 12.5px;
  color: var(--text-on-dark-3);
  text-shadow: var(--text-on-dark-shadow);
}

.tags {
  display: flex;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.tag {
  white-space: nowrap;
  /* 彩色纯文字 + 轻微阴影：深色玻璃上既保持彩色又能读清 */
  color: var(--tag-color, var(--brand-dark));
  text-shadow: var(--text-on-dark-shadow);
}

/* 阅读量：等宽数字右对齐，多位数不会左右跳动 */
.views {
  flex: 0 0 auto;
  white-space: nowrap;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  .article-card {
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .article-card:hover {
    transform: none;
  }
}

@media (max-width: 640px) {
  .article-card {
    gap: 12px;
    padding: 12px;
  }

  .article-card:hover {
    transform: translateY(-2px);
  }

  .card-media {
    flex: 0 0 104px;
    width: 104px;
    height: 78px;
  }

  .title {
    font-size: 15.5px;
    -webkit-line-clamp: 2;
  }

  .summary {
    -webkit-line-clamp: 2;
    font-size: 13px;
  }

  .views {
    display: none;
  }
}
</style>
