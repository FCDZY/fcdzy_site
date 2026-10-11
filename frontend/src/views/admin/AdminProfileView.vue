<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import ImageUploader from '@/components/admin/ImageUploader.vue'

interface ProfileForm {
  nickname: string
  email: string
  avatar: string
}

interface PasswordForm {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)

const profileRef = ref<FormInstance>()
const passwordRef = ref<FormInstance>()

const profile = reactive<ProfileForm>({
  nickname: '',
  email: '',
  avatar: ''
})

const password = reactive<PasswordForm>({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailValidator: FormItemRule['validator'] = (_rule, value, callback) => {
  const text = typeof value === 'string' ? value : ''
  if (text && !emailPattern.test(text)) {
    callback(new Error('邮箱格式不正确'))
    return
  }
  callback()
}

const confirmValidator: FormItemRule['validator'] = (_rule, value, callback) => {
  if (value !== password.newPassword) {
    callback(new Error('两次输入的密码不一致'))
    return
  }
  callback()
}

const profileRules: FormRules<ProfileForm> = {
  nickname: [{ max: 30, message: '昵称最多 30 个字符', trigger: 'blur' }],
  email: [{ validator: emailValidator, trigger: 'blur' }]
}

const passwordRules: FormRules<PasswordForm> = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码至少 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: confirmValidator, trigger: 'blur' }
  ]
}

function fillProfile() {
  profile.nickname = auth.user?.nickname || ''
  profile.email = auth.user?.email || ''
  profile.avatar = auth.user?.avatar || ''
}

/** 新密码变化时重新校验「确认新密码」，保持一致性提示同步 */
function revalidateConfirm() {
  if (!password.confirmPassword) return
  passwordRef.value?.validateField('confirmPassword')
}

async function load() {
  loading.value = true
  try {
    await auth.fetchMe()
  } catch {
    // 拉取失败不阻塞页面，使用 store 中已有信息
  } finally {
    fillProfile()
    loading.value = false
  }
}

async function saveProfile() {
  if (!profileRef.value) return
  const valid = await profileRef.value.validate().catch(() => false)
  if (!valid) return
  savingProfile.value = true
  try {
    await authApi.updateProfile({
      nickname: profile.nickname.trim(),
      email: profile.email.trim(),
      avatar: profile.avatar.trim()
    })
    await auth.fetchMe()
    fillProfile()
    ElMessage.success('资料已保存')
  } catch {
    // 提示由 api 层处理
  } finally {
    savingProfile.value = false
  }
}

async function changePassword() {
  if (!passwordRef.value) return
  const valid = await passwordRef.value.validate().catch(() => false)
  if (!valid) return
  savingPassword.value = true
  try {
    await authApi.changePassword(password.oldPassword, password.newPassword)
    ElMessage.success('密码修改成功，请使用新密码重新登录')
    auth.logout()
    router.push({ name: 'admin-login' })
  } catch {
    // 提示由 api 层处理
  } finally {
    savingPassword.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page" v-loading="loading">
    <el-row :gutter="16">
      <el-col :xs="24" :md="13">
        <el-card shadow="never" class="block-card">
          <template #header>
            <span class="head-title">基本资料</span>
          </template>

          <el-form ref="profileRef" :model="profile" :rules="profileRules" label-width="90px" label-position="top">
            <el-form-item label="用户名">
              <el-input :model-value="auth.user?.username || ''" disabled placeholder="用户名不可修改" />
            </el-form-item>
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="profile.nickname" placeholder="显示在后台与文章作者处" maxlength="30" clearable />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="profile.email" placeholder="用于接收通知" clearable />
            </el-form-item>
            <el-form-item label="头像" prop="avatar">
              <ImageUploader v-model="profile.avatar" :height="120" tip="建议正方形图片，展示时会裁切为圆形" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingProfile" @click="saveProfile">保存资料</el-button>
            </el-form-item>
          </el-form>

          <div v-if="auth.user?.lastLoginAt" class="tip">上次登录时间：{{ auth.user.lastLoginAt }}</div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="11">
        <el-card shadow="never" class="block-card">
          <template #header>
            <span class="head-title">修改密码</span>
          </template>

          <el-form
            ref="passwordRef"
            :model="password"
            :rules="passwordRules"
            label-width="90px"
            label-position="top"
          >
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="password.oldPassword" type="password" show-password placeholder="请输入当前密码" />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="password.newPassword"
                type="password"
                show-password
                placeholder="至少 6 位"
                @input="revalidateConfirm"
              />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirmPassword">
              <el-input
                v-model="password.confirmPassword"
                type="password"
                show-password
                placeholder="请再次输入新密码"
                @keyup.enter="changePassword"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingPassword" @click="changePassword">修改密码</el-button>
            </el-form-item>
          </el-form>

          <div class="tip warn">修改成功后需要使用新密码重新登录。</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.block-card {
  height: 100%;
}

.head-title {
  font-weight: 600;
}

.tip {
  font-size: 12px;
  color: var(--text-3);
}

.warn {
  color: #e6a23c;
}

@media (max-width: 768px) {
  .block-card {
    margin-bottom: 14px;
  }
}
</style>
