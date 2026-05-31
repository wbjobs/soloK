<template>
  <el-container class="app-layout">
    <el-aside :width="isCollapse ? '64px' : '220px'" class="sidebar">
      <div class="logo">
        <span v-if="!isCollapse">方言标注平台</span>
        <span v-else>方</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        :collapse-transition="false"
        router
        background-color="#1f2937"
        text-color="#9ca3af"
        active-text-color="#3b82f6"
        class="menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>数据看板</template>
        </el-menu-item>
        <el-sub-menu index="1">
          <template #title>
            <el-icon><Headset /></el-icon>
            <span>语音管理</span>
          </template>
          <el-menu-item index="/audio">语音列表</el-menu-item>
          <el-menu-item index="/audio/upload" v-if="userStore.user?.role === 'admin'">上传语音</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/annotations">
          <el-icon><Edit /></el-icon>
          <template #title>标注管理</template>
        </el-menu-item>
        <el-menu-item index="/negotiations" v-if="userStore.user?.role === 'admin'">
          <el-icon><ChatDotRound /></el-icon>
          <template #title>协商管理</template>
        </el-menu-item>
        <el-menu-item index="/dialects" v-if="userStore.user?.role === 'admin'">
          <el-icon><Location /></el-icon>
          <template #title>方言管理</template>
        </el-menu-item>
        <el-menu-item index="/datasets" v-if="userStore.user?.role === 'admin'">
          <el-icon><FolderOpened /></el-icon>
          <template #title>数据集管理</template>
        </el-menu-item>
        <el-menu-item index="/quality" v-if="userStore.user?.role === 'admin'">
          <el-icon><CircleCheck /></el-icon>
          <template #title>质量控制</template>
        </el-menu-item>
        <el-sub-menu index="2">
          <template #title>
            <el-icon><TrendCharts /></el-icon>
            <span>统计分析</span>
          </template>
          <el-menu-item index="/ranking">工作量排行</el-menu-item>
          <el-menu-item index="/progress">标注进度</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="isCollapse = !isCollapse">
            <Fold v-if="!isCollapse" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="item in breadcrumbs" :key="item.path">
              {{ item.title }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" :src="userStore.user?.avatar">
                {{ userStore.user?.username?.charAt(0)?.toUpperCase() }}
              </el-avatar>
              <span class="username">{{ userStore.user?.username }}</span>
              <el-tag :type="roleTagType" size="small" class="role-tag">
                {{ userStore.user?.role_display }}
              </el-tag>
              <el-icon><CaretBottom /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { ElMessageBox, ElMessage } from 'element-plus'
import {
  DataAnalysis,
  Headset,
  Edit,
  ChatDotRound,
  Location,
  FolderOpened,
  CircleCheck,
  TrendCharts,
  Fold,
  Expand,
  CaretBottom,
  User,
  SwitchButton
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const isCollapse = ref(false)

const activeMenu = computed(() => route.path)

const breadcrumbs = computed(() => {
  const matched = route.matched.filter(r => r.meta && r.meta.title)
  return matched.map(r => ({
    path: r.path,
    title: r.meta.title as string
  }))
})

const roleTagType = computed(() => {
  const role = userStore.user?.role
  if (role === 'admin') return 'danger'
  if (role === 'auditor') return 'warning'
  return 'primary'
})

const handleCommand = async (command: string) => {
  if (command === 'profile') {
    router.push('/profile')
  } else if (command === 'logout') {
    ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(async () => {
      await userStore.logout()
      ElMessage.success('已退出登录')
      router.push('/login')
    }).catch(() => {})
  }
}
</script>

<style scoped lang="scss">
.app-layout {
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background-color: #1f2937;
  transition: width 0.3s;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  background-color: #111827;
}

.menu {
  border-right: none;
  height: calc(100vh - 60px);
}

.header {
  background-color: #fff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-btn {
  font-size: 20px;
  cursor: pointer;
  color: #6b7280;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f3f4f6;
  }
}

.username {
  font-size: 14px;
  color: #374151;
}

.role-tag {
  margin-left: 4px;
}

.main {
  background-color: #f9fafb;
  overflow-y: auto;
  padding: 20px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
