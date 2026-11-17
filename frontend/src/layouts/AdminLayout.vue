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

/**
 * 菜单分组：参考「内容 / 互动 / 设置」三段式，
 * 每组之间用小号大写组名隔开，降低一次性扫读的负担。
 */
const menuGroups = [
  {
    label: '',
    items: [{ path: '/yzdcf', label: '仪表盘', icon: 'Odometer' }]
  },
  {
    label: '内容',
    items: [
      { path: '/yzdcf/articles', label: '文章管理', icon: 'Document' },
      { path: '/yzdcf/categories', label: '分类管理', icon: 'FolderOpened' },
      { path: '/yzdcf/tags', label: '标签管理', icon: 'PriceTag' },
      { path: '/yzdcf/topics', label: '专题管理', icon: 'Collection' }
    ]
  },
  {
    label: '互动',
    items: [{ path: '/yzdcf/comments', label: '评论管理', icon: 'ChatDotRound' }]
  },
  {
    label: '设置',
    items: [
      { path: '/yzdcf/settings', label: '站点配置', icon: 'Setting' },
      { path: '/yzdcf/profile', label: '账号设置', icon: 'User' }
    ]
  }
]

/** 拍平后的菜单（activePath 计算用） */
const menus = menuGroups.flatMap((group) => group.items)

const activePath = computed(() => {
  const matched = menus
    .filter((menu) => route.path === menu.path || route.path.startsWith(`${menu.path}/`))
    .sort((a, b) => b.path.length - a.path.length)
  return matched[0]?.path || '/yzdcf'
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
      <div class="aside-brand" @click="router.push('/yzdcf')">
        <span class="dot">M</span>
        <span v-show="!collapsed" class="name">{{ site.siteName }} · 后台</span>
      </div>
      <nav class="menu-nav">
        <template v-for="(group, index) in menuGroups" :key="index">
          <p v-if="group.label && !collapsed" class="menu-group">{{ group.label }}</p>
          <el-menu :default-active="activePath" :collapse="collapsed" router class="menu">
            <el-menu-item v-for="menu in group.items" :key="menu.path" :index="menu.path">
              <el-icon><component :is="menu.icon" /></el-icon>
              <template #title>{{ menu.label }}</template>
            </el-menu-item>
          </el-menu>
        </template>
      </nav>
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
                <el-dropdown-item @click="router.push('/yzdcf/profile')">账号设置</el-dropdown-item>
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
  height: 58px;
  padding: 0 16px;
  color: var(--admin-fg);
  cursor: pointer;
  border-bottom: 1px solid var(--admin-line);
  white-space: nowrap;
}

.dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 9px;
  background: #ffd43b;
  color: #111;
  font-weight: 800;
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
  --el-menu-text-color: var(--admin-muted);
  --el-menu-hover-bg-color: var(--admin-aside-hover);
  --el-menu-active-color: var(--admin-fg);
}

/* 菜单项：圆角、留白更大、选中用灰底不用彩色 */
.menu :deep(.el-menu-item) {
  height: 38px;
  margin: 2px 10px;
  border-radius: 9px;
  font-size: 14px;
}

.menu :deep(.el-menu-item) {
  position: relative;
  transition: background-color 0.18s ease, color 0.18s ease;
}

.menu :deep(.el-menu-item:hover) {
  background: var(--admin-aside-hover);
  color: var(--admin-fg);
}

/* 选中项：灰底 + 加粗（参考图的做法：不用彩色块，靠底和字重） */
.menu :deep(.el-menu-item.is-active) {
  background: var(--admin-aside-active);
  color: var(--admin-fg);
  font-weight: 650;
}

.menu :deep(.el-menu-item.is-active .el-icon) {
  color: var(--admin-fg);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--admin-header-bg);
  border-bottom: 1px solid var(--admin-line);
  box-shadow: none;
  height: 58px;
  padding: 0 14px;
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
  background: var(--admin-main-bg);
  padding: 26px 30px 40px;
}

/* 页面标题（顶栏里的）稍微收紧，和参考图的轻量感一致 */
.title {
  font-weight: 650;
  color: var(--admin-fg);
}

@media (max-width: 768px) {
  .main {
    padding: 16px 14px 32px;
  }
}

@media (max-width: 768px) {
  .username {
    display: none;
  }
}
</style>
