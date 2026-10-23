<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'

/**
 * 顶部全站搜索：
 * - 收起态只显示放大镜图标；hover 或点击展开输入框（磨砂半透明胶囊，与导航风格一致）
 * - 回车或点击放大镜触发，跳转到 /articles?keyword=… 由文章列表页展示结果
 * - 展开使用绝对定位向左生长，不会把导航菜单挤动
 */
const router = useRouter()

const open = ref(false)
const keyword = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

async function expand() {
  open.value = true
  await nextTick()
  inputRef.value?.focus()
}

function onIconClick() {
  if (!open.value) {
    expand()
    return
  }
  if (keyword.value.trim()) {
    submit()
  } else {
    expand()
  }
}

function submit() {
  const value = keyword.value.trim()
  if (!value) {
    inputRef.value?.focus()
    return
  }
  router.push({ path: '/articles', query: { keyword: value } })
  keyword.value = ''
  open.value = false
  inputRef.value?.blur()
}

function onBlur() {
  if (!keyword.value.trim()) {
    open.value = false
  }
}

function onEsc() {
  keyword.value = ''
  open.value = false
  inputRef.value?.blur()
}
</script>

<template>
  <div class="site-search" :class="{ 'is-open': open }">
    <form class="search-pill" role="search" @submit.prevent="submit">
      <input
        ref="inputRef"
        v-model="keyword"
        class="search-input"
        type="search"
        enterkeyhint="search"
        aria-label="搜索文章"
        placeholder="搜索标题、简介或正文…"
        tabindex="-1"
        @focus="open = true"
        @blur="onBlur"
        @keydown.esc.prevent="onEsc"
      />
      <button
        class="search-btn"
        type="button"
        :aria-label="open ? '搜索' : '展开搜索'"
        :aria-expanded="open"
        :title="open ? '搜索（回车）' : '搜索'"
        @click="onIconClick"
      >
        <el-icon :size="18"><Search /></el-icon>
      </button>
    </form>
  </div>
</template>

<style scoped>
.site-search {
  position: relative;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
}

/* 磨砂半透明胶囊：无白色实底、无白色硬边框 */
.search-pill {
  position: absolute;
  top: 0;
  right: 0;
  height: 38px;
  width: 38px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 0 8px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.26);
  backdrop-filter: saturate(160%) blur(12px);
  -webkit-backdrop-filter: saturate(160%) blur(12px);
  transition: width 0.24s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.site-search:hover .search-pill,
.site-search.is-open .search-pill {
  width: 216px;
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.34);
}

.search-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #fff;
  font-size: 13.5px;
  font-family: inherit;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.site-search:hover .search-input,
.site-search.is-open .search-input {
  opacity: 1;
  pointer-events: auto;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.62);
}

/* 去掉 search 类型自带的清除按钮，避免破坏胶囊样式 */
.search-input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

.search-input::-webkit-search-decoration {
  -webkit-appearance: none;
  appearance: none;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  border-radius: 999px;
  transition: color 0.16s ease, background-color 0.16s ease;
}

.search-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

@media (max-width: 768px) {
  .site-search:hover .search-pill,
  .site-search.is-open .search-pill {
    width: 168px;
  }
}
</style>
