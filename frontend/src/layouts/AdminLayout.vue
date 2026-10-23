<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import { useTheme } from '@/composables/useTheme'
import BackToTop from '@/components/BackToTop.vue'

const auth = useAuthStore()
const site = useSiteStore()
const { isDark, toggleTheme } = useTheme()
const route = useRoute()
const router = useRouter()
const collapsed = ref(false)

const menus = [
  { path: '/admin', label: '仪表盘', icon: 'Odometer' },
  { path: '/admin/articles', label: '文章管理', icon: 'Document' },
  { path: '/admin/categories', label: '分类管理', icon: 'FolderOpened' },
  { path: '/admin/tags', label: '标签管理', icon: 'PriceTag' },
  { path: '/admin/topics', label: '专题管理', icon: 'Collection' },
  { path: '/admin/comments', label: '评论管理', icon: 'ChatDotRound' },
  { path: '/admin/settings', label: '站点配置', icon: 'Setting' },
  { path: '/admin/profile', label: '账号设置', icon: 'User' }
]

const activePath = computed(() => {
  const matched = menus
    .filter((menu) => route.path === menu.path || route.path.startsWith(`${menu.path}/`))
    .sort((a, b) => b.path.length - a.path.length)
  return matched[0]?.path || '/admin'
})

const pageTitle = computed(() => (route.meta?.title as string) || '后台管理')

onMounted(async () => {
  collapsed.value = window.innerWidth < 960
  if (auth.isLoggedIn() && !auth.user) {
    try {
      await auth.fetchMe()
    } catch {
      auth.logout()
      router.push({ name: 'admin-login' })
    }
  }
})

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
  } catch {
    return
  }
  auth.logout()
  ElMessage.success('已退出登录')
  router.push({ name: 'admin-login' })
}
</script>

<template>
  <el-container class="admin-layout">
    <el-aside :width="collapsed ? '64px' : '212px'" class="aside">
      <div class="aside-brand" @click="router.push('/admin')">
        <span class="dot">M</span>
        <span v-show="!collapsed" class="name">{{ site.siteName }} · 后台</span>
      </div>
      <el-menu :default-active="activePath" :collapse="collapsed" router class="menu">
        <el-menu-item v-for="menu in menus" :key="menu.path" :index="menu.path">
          <el-icon><component :is="menu.icon" /></el-icon>
          <template #title>{{ menu.label }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="left">
          <el-button text :icon="collapsed ? 'Expand' : 'Fold'" @click="collapsed = !collapsed" />
          <span class="title">{{ pageTitle }}</span>
        </div>
        <div class="right">
          <el-button text :icon="isDark ? 'Sunny' : 'Moon'" @click="toggleTheme">
            {{ isDark ? '浅色模式' : '深色模式' }}
          </el-button>
          <el-button text @click="router.push('/')">查看前台</el-button>
          <el-dropdown>
            <span class="user">
              <el-avatar :size="28" :src="auth.user?.avatar || undefined">
                {{ (auth.user?.nickname || auth.user?.username || 'A').slice(0, 1) }}
              </el-avatar>
              <span class="username">{{ auth.user?.nickname || auth.user?.username || '管理员' }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="router.push('/admin/profile')">账号设置</el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>

    <BackToTop />
  </el-container>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
}

.aside {
  background: var(--admin-aside-bg);
  transition: width 0.2s ease, background-color 0.3s ease;
  overflow-x: hidden;
}

.aside-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 14px;
  color: #fff;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}

.dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 8px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  font-weight: 700;
  font-size: 14px;
}

.name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu {
  border-right: none;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #cbd5e1;
  --el-menu-hover-bg-color: var(--admin-aside-hover);
  --el-menu-active-color: #ffffff;
}

.menu :deep(.el-menu-item) {
  position: relative;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.menu :deep(.el-menu-item:hover) {
  background: var(--admin-aside-hover);
  color: #fff;
}

/* 选中项：不用整块蓝底，改为左侧彩色竖线 + 白字 */
.menu :deep(.el-menu-item.is-active) {
  background: transparent;
  color: #fff;
  font-weight: 600;
}

.menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, #60a5fa, #818cf8);
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.45);
}

.menu :deep(.el-menu-item.is-active .el-icon) {
  color: #93c5fd;
}

/* 收起时竖线照样保留 */
.menu.el-menu--collapse :deep(.el-menu-item.is-active)::before {
  top: 12px;
  bottom: 12px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  height: 56px;
  padding: 0 12px;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  font-weight: 600;
}

.user {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
}

.user:hover {
  background: var(--surface-2);
}

.username {
  font-size: 14px;
  color: var(--text-2);
}

.main {
  background: var(--bg);
  padding: 0;
}

@media (max-width: 768px) {
  .username {
    display: none;
  }
}
</style>
