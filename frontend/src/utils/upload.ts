/**
 * 图片上传的统一前端校验规则（与后端 UploadService 保持一致）。
 *
 * 后端也会再校验一次，这里只是提前拦下来，少发一次无意义的请求、提示更快。
 * 规则：只允许 jpg / jpeg / png / webp，单张不超过 5MB。
 */
export const UPLOAD_ACCEPT = '.jpg,.jpeg,.png,.webp'

/** 允许的扩展名（小写，无点） */
export const UPLOAD_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']

/** 单张图片大小上限（MB） */
export const UPLOAD_MAX_MB = 5

/** 单张图片大小上限（字节） */
export const UPLOAD_MAX_BYTES = UPLOAD_MAX_MB * 1024 * 1024

/** el-upload 的 accept 属性（MIME 形式，部分浏览器更认这个） */
export const UPLOAD_ACCEPT_MIME = 'image/jpeg,image/png,image/webp'

/**
 * 校验单个文件。
 * @returns 通过返回空字符串；不通过返回可直接展示给用户的中文提示。
 */
export function validateImageFile(file: File): string {
  const name = file.name || ''
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (!UPLOAD_EXTENSIONS.includes(ext)) {
    return '只支持 jpg / png / webp 格式的图片'
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    const sizeMb = (file.size / 1024 / 1024).toFixed(1)
    return `图片不能超过 ${UPLOAD_MAX_MB}MB（当前 ${sizeMb}MB），请压缩后再上传`
  }
  return ''
}
