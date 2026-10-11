<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    total: number
    page: number
    size?: number
  }>(),
  { size: 10 }
)

const emit = defineEmits<{ (e: 'change', page: number): void }>()

function onChange(value: number) {
  emit('change', value)
}
</script>

<template>
  <div v-if="props.total > props.size" class="pagination">
    <el-pagination
      background
      layout="prev, pager, next"
      :total="props.total"
      :current-page="props.page"
      :page-size="props.size"
      :pager-count="5"
      hide-on-single-page
      @current-change="onChange"
    />
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  justify-content: center;
  padding: 18px 0 4px;
}
</style>
