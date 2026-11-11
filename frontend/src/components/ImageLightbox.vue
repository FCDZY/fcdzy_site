<script setup lang="ts">
/**
 * 图片灯箱：直接用 Element Plus 自带的 ElImageViewer
 * （自带缩放、旋转、左右切换、Esc 关闭，省得自己实现一堆边界情况）
 */
defineProps<{
  urls: string[]
  index: number
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <el-image-viewer
    :url-list="urls"
    :initial-index="index"
    :hide-on-click-modal="true"
    teleported
    @close="emit('close')"
  />
</template>
