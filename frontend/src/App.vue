<script setup lang="ts">
import { onMounted } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { useSiteStore } from '@/stores/site'

const site = useSiteStore()

onMounted(() => {
  site.init()
})
</script>

<template>
  <!-- 全局中文语言包：分页器、空状态等内置文案才不会显示 Total / No Data -->
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>
