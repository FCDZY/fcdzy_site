<script setup lang="ts">
import { computed, watch } from 'vue'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'

const site = useSiteStore()

const year = new Date().getFullYear()

const authorName = computed(() => site.config.authorName || site.siteName)
const githubUrl = computed(() => {
  const url = site.config.githubUrl
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
})
const startYear = computed(() => site.config.startYear || '')

watch(
  () => site.siteName,
  () => {
    useSeo({
      title: '关于',
      description: site.config.siteDescription,
      keywords: site.config.siteKeywords
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="page about-page">
    <div class="container">
      <h1 class="page-title">关于</h1>
      <p class="page-subtitle">关于本站和它的作者</p>

      <section class="card card--dark author-card">
        <img v-if="site.config.authorAvatar" :src="site.config.authorAvatar" :alt="authorName" class="avatar" />
        <span v-else class="avatar placeholder">{{ authorName.slice(0, 1) }}</span>
        <div class="author-body">
          <h2 class="author-name">{{ authorName }}</h2>
          <p class="author-bio">{{ site.config.authorBio || '这个人很懒，还没有写简介。' }}</p>
          <div class="links">
            <a v-if="site.config.email" class="link" :href="`mailto:${site.config.email}`">
              <el-icon><Message /></el-icon>
              <span>{{ site.config.email }}</span>
            </a>
            <a v-if="githubUrl" class="link" :href="githubUrl" target="_blank" rel="noopener noreferrer">
              <el-icon><Link /></el-icon>
              <span>GitHub</span>
            </a>
          </div>
        </div>
      </section>

      <section class="card card--dark site-card">
        <h2 class="block-title">站点信息</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="站点名称">{{ site.siteName }}</el-descriptions-item>
          <el-descriptions-item v-if="site.siteSubtitle" label="站点副标题">{{ site.siteSubtitle }}</el-descriptions-item>
          <el-descriptions-item label="站点描述">{{ site.config.siteDescription || '暂无' }}</el-descriptions-item>
          <el-descriptions-item label="作者">{{ authorName }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">
            <a v-if="site.config.email" :href="`mailto:${site.config.email}`">{{ site.config.email }}</a>
            <span v-else>未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="GitHub">
            <a v-if="githubUrl" :href="githubUrl" target="_blank" rel="noopener noreferrer">{{ githubUrl }}</a>
            <span v-else>未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="建站年份">{{ startYear || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="运行时间">{{ startYear ? `${startYear} - ${year}` : `${year}` }}</el-descriptions-item>
        </el-descriptions>
      </section>

      <div class="actions">
        <router-link class="btn" to="/articles">浏览全部文章</router-link>
        <router-link class="btn ghost" to="/topics">查看专题</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about-page {
  padding-top: 22px;
}

.author-card {
  display: flex;
  gap: 20px;
  padding: 24px;
  margin-bottom: 18px;
  align-items: flex-start;
}

.avatar {
  width: 92px;
  height: 92px;
  flex: 0 0 92px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--media-bg);
}

.avatar.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  font-size: 34px;
  font-weight: 700;
}

.author-body {
  min-width: 0;
}

.author-name {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 800;
  /* 深色玻璃上：白色标题 + 阴影 */
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow-strong);
}

.author-bio {
  margin: 0 0 14px;
  color: var(--text-on-dark-2);
  text-shadow: var(--text-on-dark-shadow);
  font-size: 14.5px;
  white-space: pre-wrap;
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* 联系方式胶囊：半透明浅色（与导航搜索框/首页卡片同一套玻璃语言） */
.link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow);
  font-size: 13.5px;
  transition: all 0.16s ease;
}

.link:hover {
  background: rgba(255, 255, 255, 0.24);
  border-color: rgba(255, 255, 255, 0.34);
  color: #fff;
  transform: translateY(-1px);
}

.site-card {
  padding: 22px;
  margin-bottom: 18px;
  /*
   * 用 Element Plus 自己的变量把「站点信息」表格改成深色玻璃：
   * 结构 / 行顺序 / 字段都不动，只把白底、灰边框、深色文字换成半透明 + 浅色。
   */
  --el-fill-color-blank: transparent;
  --el-text-color-regular: var(--text-on-dark-3);
  --el-text-color-primary: var(--text-on-dark-1);
}

/*
 * 注意：EP 把 --el-descriptions-* 定义在 .el-descriptions 自身，
 * 设在外层卡片上会被它覆盖（表现为「浅字压浅灰底」），所以这两个变量必须落在 .el-descriptions 上。
 */
.site-card :deep(.el-descriptions) {
  --el-descriptions-item-bordered-label-background: rgba(255, 255, 255, 0.08);
  --el-descriptions-table-border: 1px solid rgba(255, 255, 255, 0.16);
}

/* 表格里的链接在深色底上要用浅蓝，否则几乎看不见 */
.site-card :deep(.el-descriptions__content a) {
  color: #8ec5ff;
}

.site-card :deep(.el-descriptions__content a:hover) {
  color: #bfe0ff;
  text-decoration: underline;
}

.block-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-on-dark-1);
  text-shadow: var(--text-on-dark-shadow);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 20px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 14.5px;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.24);
  transition: all 0.18s ease;
}

.btn:hover {
  background: var(--brand-dark);
  transform: translateY(-1px);
}

/* 次要按钮：半透明浅色胶囊，压在白蓝主按钮旁边不抢眼，也不留白底 */
.btn.ghost {
  background: rgba(255, 255, 255, 0.14);
  color: var(--text-on-dark-1);
  border: 1px solid rgba(255, 255, 255, 0.24);
  text-shadow: var(--text-on-dark-shadow);
  box-shadow: none;
}

.btn.ghost:hover {
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.34);
}

@media (max-width: 768px) {
  .about-page {
    padding-top: 16px;
  }

  .author-card {
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 20px 16px;
    gap: 14px;
  }

  .avatar {
    width: 76px;
    height: 76px;
    flex: none;
  }

  .links {
    justify-content: center;
  }

  .author-name {
    font-size: 19px;
  }

  .site-card {
    padding: 16px;
  }

  .block-title {
    font-size: 16.5px;
  }
}
</style>
