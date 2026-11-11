<script setup lang="ts">
import { computed } from 'vue'
import type { FontSize, LineWidth } from '@/composables/useReadingPrefs'
import { useReadingPrefs } from '@/composables/useReadingPrefs'

const { fontSize, lineWidth, setFontSize, setLineWidth } = useReadingPrefs()

const sizeModel = computed<FontSize>({
  get: () => fontSize.value,
  set: (value) => setFontSize(value)
})

const widthModel = computed<LineWidth>({
  get: () => lineWidth.value,
  set: (value) => setLineWidth(value)
})

const SIZES: Array<{ value: FontSize; label: string }> = [
  { value: 'sm', label: '小' },
  { value: 'md', label: '标准' },
  { value: 'lg', label: '大' }
]

const WIDTHS: Array<{ value: LineWidth; label: string }> = [
  { value: 'narrow', label: '窄' },
  { value: 'normal', label: '标准' },
  { value: 'wide', label: '宽' }
]
</script>

<template>
  <el-popover
    trigger="click"
    placement="bottom-end"
    :width="236"
    popper-class="reading-settings-popover"
    teleported
  >
    <template #reference>
      <button type="button" class="reading-settings-btn" aria-label="阅读设置" title="阅读设置">
        <el-icon :size="14"><Setting /></el-icon>
      </button>
    </template>

    <div class="rs-row">
      <span class="rs-label">字号</span>
      <el-radio-group v-model="sizeModel" size="small">
        <el-radio-button v-for="item in SIZES" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="rs-row">
      <span class="rs-label">行宽</span>
      <el-radio-group v-model="widthModel" size="small">
        <el-radio-button v-for="item in WIDTHS" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <p class="rs-tip">设置只保存在本机浏览器</p>
  </el-popover>
</template>

<style scoped>
.reading-settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;
}

.reading-settings-btn:hover {
  color: var(--brand-dark);
  background: var(--surface-hover);
  border-color: var(--card-border);
}

.rs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.rs-label {
  font-size: 13px;
  color: var(--text-2);
  white-space: nowrap;
}

.rs-tip {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
