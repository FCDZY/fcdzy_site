<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSeo } from '@/composables/useSeo'

const router = useRouter()

useSeo({ title: '页面走丢了', description: '抱歉，你访问的页面不存在。' })
</script>

<template>
  <div class="page notfound-page">
    <div class="container">
      <div class="card notfound-card">
        <el-result icon="warning" title="404" sub-title="页面走丢了">
          <template #extra>
            <el-button type="primary" @click="router.push('/')">回到首页</el-button>
            <el-button @click="router.push('/articles')">看文章</el-button>
          </template>
        </el-result>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notfound-page {
  padding-top: 40px;
}

.notfound-card {
  padding: 28px 16px 34px;
}

@media (max-width: 768px) {
  .notfound-page {
    padding-top: 20px;
  }

  .notfound-card {
    padding: 16px 8px 24px;
  }
}
</style>
