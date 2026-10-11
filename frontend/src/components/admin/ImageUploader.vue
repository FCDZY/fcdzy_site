<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    height?: number
    tip?: string
  }>(),
  { height: 130, tip: '支持 jpg / png / gif / webp，单文件不超过 10MB' }
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const uploading = ref(false)

async function customUpload(options: any) {
  const file = options.file as File
  uploading.value = true
  try {
    const result = await adminApi.upload(file)
    emit('update:modelValue', result.url)
    ElMessage.success('上传成功')
    options.onSuccess?.(result)
  } catch (error) {
    options.onError?.(error as Error)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="image-uploader">
    <el-upload :show-file-list="false" accept="image/*" :http-request="customUpload" class="uploader">
      <div class="box" :style="{ height: `${props.height}px` }" v-loading="uploading">
        <img v-if="props.modelValue" :src="props.modelValue" alt="预览" />
        <div v-else class="placeholder">
          <el-icon :size="22"><Plus /></el-icon>
          <span>点击上传图片</span>
        </div>
      </div>
    </el-upload>
    <div class="row">
      <el-input
        :model-value="props.modelValue"
        placeholder="图片地址，也可直接粘贴外链"
        clearable
        @update:model-value="(value: string) => emit('update:modelValue', value)"
      />
      <el-button v-if="props.modelValue" @click="emit('update:modelValue', '')">移除</el-button>
    </div>
    <div v-if="props.tip" class="tip">{{ props.tip }}</div>
  </div>
</template>

<style scoped>
.image-uploader {
  width: 100%;
}

.uploader :deep(.el-upload) {
  width: 100%;
}

.box {
  width: 100%;
  max-width: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: #fafbfc;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.16s ease;
}

.box:hover {
  border-color: var(--brand);
}

.box img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 13px;
}

.row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  max-width: 460px;
}

.tip {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
}
</style>
