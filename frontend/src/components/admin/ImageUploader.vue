<script setup lang="ts">
/**
 * 图片上传组件（Element Plus el-upload + 后端中转）。
 *
 * 上传链路：浏览器 --el-upload--> POST /api/admin/upload（带 JWT）
 *          --> 后端校验（格式 / 5MB）--> 阿里云 OSS（AK 只在服务端）
 *          --> 返回可直接访问的公共读 URL --> 回填到表单。
 *
 * 组件职责：
 * 1. 上传前先做一次本地校验（格式、5MB），不合格直接提示，不发请求；
 * 2. 上传中显示进度（百分比），失败给出后端返回的友好错误；
 * 3. 支持直接粘贴外链（比如临时用别的图床），也支持「移除」；
 * 4. 大小上限与后端一致，从 @/utils/upload 读取，避免两边写死不同步。
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api'
import { UPLOAD_ACCEPT, UPLOAD_MAX_MB, validateImageFile } from '@/utils/upload'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    height?: number
    tip?: string
  }>(),
  {
    height: 130,
    tip: `支持 jpg / png / webp，单张不超过 ${UPLOAD_MAX_MB}MB`
  }
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const uploading = ref(false)
/** 上传进度 0~100，用于在预览框上显示进度条 */
const percent = ref(0)

/** el-upload 的 before-upload：本地校验不通过时返回 false，阻止请求发出 */
function beforeUpload(file: File): boolean {
  const error = validateImageFile(file)
  if (error) {
    ElMessage.warning(error)
    return false
  }
  return true
}

/** el-upload 的 http-request：自定义上传（走我们自己的后端，不用它的 action） */
async function customUpload(options: any) {
  const file = options.file as File
  uploading.value = true
  percent.value = 0
  try {
    const result = await adminApi.upload(file, (progressEvent: any) => {
      // 上传进度：后端中转时也能反映真实速率
      if (progressEvent.total) {
        percent.value = Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100))
      }
    })
    percent.value = 100
    emit('update:modelValue', result.url)
    ElMessage.success('上传成功')
    options.onSuccess?.(result)
  } catch (error) {
    // 后端会把 OSS 的鉴权失败/网络异常翻译成中文，http 拦截器已经弹过提示
    options.onError?.(error as Error)
  } finally {
    uploading.value = false
    setTimeout(() => {
      percent.value = 0
    }, 400)
  }
}
</script>

<template>
  <div class="image-uploader">
    <el-upload
      :show-file-list="false"
      :accept="UPLOAD_ACCEPT"
      :before-upload="beforeUpload"
      :http-request="customUpload"
      class="uploader"
    >
      <div class="box" :style="{ height: `${props.height}px` }" v-loading="uploading">
        <img v-if="props.modelValue" :src="props.modelValue" alt="预览" />
        <div v-else class="placeholder">
          <el-icon :size="22"><Plus /></el-icon>
          <span>点击上传图片</span>
        </div>
        <!-- 上传进度 -->
        <div v-if="uploading" class="progress">
          <el-progress :percentage="percent" :show-text="false" :stroke-width="4" />
          <span class="progress-text">{{ percent }}%</span>
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
  position: relative;
  width: 100%;
  max-width: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--surface-subtle);
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

/* 上传进度条压在预览框底部 */
.progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 10px 10px;
  background: rgba(0, 0, 0, 0.45);
}

.progress-text {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: #fff;
  text-align: center;
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
