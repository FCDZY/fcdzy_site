<script setup lang="ts">
/**
 * 文章列表分页组件
 * 布局：总条数 · 上一页 · 页码按钮 · 下一页
 * 首/末页时上一页 / 下一页自动禁用（Element Plus 内置行为）
 * 配色使用全局主题变量，深浅色自动适配，风格与文章卡片一致
 */
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
  <div v-if="props.total > 0" class="pagination">
    <el-pagination
      background
      layout="total, prev, pager, next"
      :total="props.total"
      :current-page="props.page"
      :page-size="props.size"
      :pager-count="5"
      :disabled="false"
      @current-change="onChange"
    />
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  justify-content: center;
  padding: 20px 0 6px;
}

.pagination :deep(.el-pagination) {
  --el-pagination-bg-color: var(--card);
  --el-pagination-text-color: var(--text-2);
  --el-pagination-button-color: var(--text-2);
  --el-pagination-button-bg-color: var(--card);
  --el-pagination-button-disabled-color: var(--text-3);
  --el-pagination-button-disabled-bg-color: var(--surface-2);
  --el-pagination-hover-color: var(--brand);
  gap: 6px;
}

.pagination :deep(.el-pagination__total) {
  height: 32px;
  line-height: 32px;
  margin-right: 10px;
  font-size: 13.5px;
  color: var(--text-3);
}

/* 与文章卡片一致的描边 + 圆角风格 */
.pagination :deep(.el-pagination.is-background .btn-prev),
.pagination :deep(.el-pagination.is-background .btn-next),
.pagination :deep(.el-pagination.is-background .el-pager li) {
  min-width: 32px;
  height: 32px;
  line-height: 30px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  color: var(--text-2);
  font-weight: 500;
  transition: color 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.pagination :deep(.el-pagination.is-background .btn-prev:not(:disabled):hover),
.pagination :deep(.el-pagination.is-background .btn-next:not(:disabled):hover),
.pagination :deep(.el-pagination.is-background .el-pager li:not(.is-active):hover) {
  color: var(--brand-dark);
  border-color: var(--chip-border-hover);
  background: var(--brand-soft-2);
}

.pagination :deep(.el-pagination.is-background .el-pager li.is-active) {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.pagination :deep(.el-pagination.is-background .btn-prev:disabled),
.pagination :deep(.el-pagination.is-background .btn-next:disabled) {
  background: var(--surface-2);
  color: var(--text-3);
  border-color: var(--border);
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .pagination :deep(.el-pagination__total) {
    width: 100%;
    margin: 0 0 -4px;
    text-align: center;
  }

  .pagination :deep(.el-pagination) {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
