<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import { useSeo } from '@/composables/useSeo'

interface LoginForm {
  username: string
  password: string
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const site = useSiteStore()

const formRef = ref<FormInstance>()
const form = reactive<LoginForm>({ username: '', password: '' })

const rules: FormRules<LoginForm> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

useSeo({ title: '管理员登录' })

async function handleSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await auth.login(form.username, form.password)
    ElMessage.success('登录成功')
    const redirect = route.query.redirect as string | undefined
    router.push(redirect || '/admin')
  } catch {
    // 错误提示由 api 层统一处理
  }
}
</script>

<template>
  <div class="login-wrapper">
    <div class="login-card">
      <div class="brand">
        <h1>{{ site.siteName }}</h1>
        <p>后台管理</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" size="large" @submit.prevent="handleSubmit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" clearable @keyup.enter="handleSubmit">
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            @keyup.enter="handleSubmit"
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="submit" :loading="auth.loading" @click="handleSubmit">登 录</el-button>
        </el-form-item>
      </el-form>

      <div class="footer">
        <p>默认账号：admin / admin123</p>
        <p>首次登录后请前往「账号设置」修改密码</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 48%, #6366f1 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 32px 28px 20px;
  background: var(--card);
  border-radius: 16px;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.25);
}

.brand {
  text-align: center;
  margin-bottom: 24px;
}

.brand h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-1);
  word-break: break-word;
}

.brand p {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--text-3);
  letter-spacing: 2px;
}

.submit {
  width: 100%;
}

.footer {
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  text-align: center;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.9;
}

.footer p {
  margin: 0;
}
</style>
