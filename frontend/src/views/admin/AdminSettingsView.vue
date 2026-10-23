<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api'
import { useSiteStore } from '@/stores/site'
import type { SiteConfig } from '@/types'
import ImageUploader from '@/components/admin/ImageUploader.vue'

interface SettingsForm {
  siteDescription: string
  siteKeywords: string
  siteFavicon: string
  authorName: string
  authorAvatar: string
  authorBio: string
  footerText: string
  icp: string
  githubUrl: string
  email: string
  startYear: string
  homeBannerTitle: string
  homeBannerSubtitle: string
  homeHeroImage: string
  homeHeroImageDark: string
  homeHeroAnimation: boolean
}

const site = useSiteStore()

const loading = ref(false)
const saving = ref(false)

const form = reactive<SettingsForm>({
  siteDescription: '',
  siteKeywords: '',
  siteFavicon: '',
  authorName: '',
  authorAvatar: '',
  authorBio: '',
  footerText: '',
  icp: '',
  githubUrl: '',
  email: '',
  startYear: '',
  homeBannerTitle: '',
  homeBannerSubtitle: '',
  homeHeroImage: '',
  homeHeroImageDark: '',
  homeHeroAnimation: true
})

const activeTab = ref('basic')

function pad(value?: string | null): string {
  return value ?? ''
}

function applyConfig(config: SiteConfig) {
  form.siteDescription = pad(config.siteDescription)
  form.siteKeywords = pad(config.siteKeywords)
  form.siteFavicon = pad(config.siteFavicon)
  form.authorName = pad(config.authorName)
  form.authorAvatar = pad(config.authorAvatar)
  form.authorBio = pad(config.authorBio)
  form.footerText = pad(config.footerText)
  form.icp = pad(config.icp)
  form.githubUrl = pad(config.githubUrl)
  form.email = pad(config.email)
  form.startYear = pad(config.startYear)
  form.homeBannerTitle = pad(config.homeBannerTitle)
  form.homeBannerSubtitle = pad(config.homeBannerSubtitle)
  form.homeHeroImage = pad(config.homeHeroImage)
  form.homeHeroImageDark = pad(config.homeHeroImageDark)
  form.homeHeroAnimation = pad(config.homeHeroAnimation) !== 'false'
}

async function load() {
  loading.value = true
  try {
    const config = await adminApi.siteConfig()
    applyConfig(config || {})
  } catch {
    // 提示由 api 层处理
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const payload: SiteConfig = {
      siteDescription: form.siteDescription.trim(),
      siteKeywords: form.siteKeywords.trim(),
      siteFavicon: form.siteFavicon.trim(),
      authorName: form.authorName.trim(),
      authorAvatar: form.authorAvatar.trim(),
      authorBio: form.authorBio.trim(),
      footerText: form.footerText.trim(),
      icp: form.icp.trim(),
      githubUrl: form.githubUrl.trim(),
      email: form.email.trim(),
      startYear: form.startYear.trim(),
      homeBannerTitle: form.homeBannerTitle.trim(),
      homeBannerSubtitle: form.homeBannerSubtitle.trim(),
      homeHeroImage: form.homeHeroImage.trim(),
      homeHeroImageDark: form.homeHeroImageDark.trim(),
      homeHeroAnimation: form.homeHeroAnimation ? 'true' : 'false'
    }
    await adminApi.updateSiteConfig(payload)
    await site.loadConfig()
    ElMessage.success('站点配置已保存，前台已同步更新')
  } catch {
    // 提示由 api 层处理
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div class="head">
          <span class="head-title">站点配置</span>
          <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-form :model="form" label-width="120px" label-position="top" class="form-narrow">
            <el-form-item label="站点描述">
              <el-input
                v-model="form.siteDescription"
                type="textarea"
                :rows="3"
                maxlength="300"
                show-word-limit
                placeholder="用于 SEO description"
              />
            </el-form-item>
            <el-form-item label="站点关键词">
              <el-input v-model="form.siteKeywords" placeholder="多个关键词用英文逗号分隔" clearable />
            </el-form-item>
            <el-form-item label="站点图标（favicon）">
              <ImageUploader v-model="form.siteFavicon" :height="100" tip="建议 32×32 或 64×64 的 ico / png" />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="作者信息" name="author">
          <el-form :model="form" label-width="120px" label-position="top" class="form-narrow">
            <el-form-item label="作者名称">
              <el-input v-model="form.authorName" placeholder="如：站长" maxlength="50" clearable />
            </el-form-item>
            <el-form-item label="作者头像">
              <ImageUploader v-model="form.authorAvatar" :height="120" tip="建议正方形图片，会裁切为圆形" />
            </el-form-item>
            <el-form-item label="作者简介">
              <el-input
                v-model="form.authorBio"
                type="textarea"
                :rows="4"
                maxlength="500"
                show-word-limit
                placeholder="展示在「关于」页面与文章页作者区"
              />
            </el-form-item>
            <el-form-item label="GitHub 地址">
              <el-input v-model="form.githubUrl" placeholder="https://github.com/yourname" clearable />
            </el-form-item>
            <el-form-item label="联系邮箱">
              <el-input v-model="form.email" placeholder="you@example.com" clearable />
            </el-form-item>
            <el-form-item label="建站年份">
              <el-input v-model="form.startYear" placeholder="如：2024，用于页脚版权区间" style="max-width: 220px" clearable />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="页脚与备案" name="footer">
          <el-form :model="form" label-width="120px" label-position="top" class="form-narrow">
            <el-form-item label="页脚文字">
              <el-input
                v-model="form.footerText"
                type="textarea"
                :rows="3"
                maxlength="200"
                show-word-limit
                placeholder="如：© 2024 我的个人网站 · 保留所有权利"
              />
            </el-form-item>
            <el-form-item label="ICP 备案号">
              <el-input v-model="form.icp" placeholder="如：京ICP备00000000号-1" clearable />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="首页 Banner" name="banner">
          <el-form :model="form" label-width="120px" label-position="top" class="form-narrow">
            <el-form-item label="全局背景图（浅色）">
              <ImageUploader
                v-model="form.homeHeroImage"
                :height="170"
                tip="铺满整页的固定背景（cover / 居中 / 不重复 / 滚动不动）；留空时使用默认渐变"
              />
            </el-form-item>
            <el-form-item label="全局背景图（深色）">
              <ImageUploader
                v-model="form.homeHeroImageDark"
                :height="170"
                tip="深色模式自动切换为这张图；留空则深色模式沿用浅色背景图"
              />
            </el-form-item>
            <el-form-item label="背景呼吸动画">
              <div class="switch-row">
                <el-switch v-model="form.homeHeroAnimation" active-text="开启" inactive-text="关闭" />
                <span class="hint">25 秒一个周期；固定背景不做缩放，改为背景薄纱明暗微动</span>
              </div>
            </el-form-item>
            <el-form-item label="Banner 主标题">
              <el-input v-model="form.homeBannerTitle" placeholder="如：欢迎来到我的个人网站" maxlength="80" clearable />
            </el-form-item>
            <el-form-item label="Banner 副标题">
              <el-input
                v-model="form.homeBannerSubtitle"
                type="textarea"
                :rows="3"
                maxlength="200"
                show-word-limit
                placeholder="如：这里记录我的技术笔记与生活随笔"
              />
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>

      <div class="footer-bar">
        <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.head-title {
  font-weight: 600;
}

.form-narrow {
  max-width: 640px;
}

.switch-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.hint {
  font-size: 12.5px;
  color: var(--text-3);
}

.footer-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
</style>
