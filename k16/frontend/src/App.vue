<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <div class="logo">
          <Switch :size="28" />
          <span class="logo-text">WIND TUNNEL LAB</span>
        </div>
        <nav class="nav-menu">
          <router-link 
            v-for="route in navRoutes" 
            :key="route.path" 
            :to="route.path"
            class="nav-item"
            :class="{ active: $route.path === route.path }"
          >
            <component :is="route.icon" :size="18" />
            <span>{{ route.name }}</span>
          </router-link>
        </nav>
      </div>
      <div class="header-right">
        <div class="system-status" @click="toggleStatusPanel">
          <span class="status-dot" :class="systemState"></span>
          <span class="status-text">{{ stateTextMap[systemState] }}</span>
        </div>
        <div class="attack-angle">
          <span class="label">攻角</span>
          <span class="value">{{ currentAngle }}°</span>
        </div>
        <div class="run-time">
          <span class="label">运行时间</span>
          <span class="value">{{ formatTime(runTime) }}</span>
        </div>
        <div class="user-info">
          <User />
        </div>
      </div>
    </header>
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Switch, User, Monitor, DataAnalysis, TrendCharts, PieChart, VideoCamera, Files, Setting, Warning, MagicStick } from '@element-plus/icons-vue'
import { useSystemStore } from '@/stores/system'

const router = useRouter()
const route = useRoute()
const systemStore = useSystemStore()

const navRoutes = [
  { path: '/', name: '实时监控', icon: Monitor },
  { path: '/pressure', name: '压力云图', icon: PieChart },
  { path: '/aerodynamic', name: '气动力分析', icon: TrendCharts },
  { path: '/spectrum', name: '频谱分析', icon: DataAnalysis },
  { path: '/flutter', name: '颤振分析', icon: Warning },
  { path: '/dmd', name: '模态分析', icon: MagicStick },
  { path: '/comparison', name: '工况对比', icon: DataAnalysis },
  { path: '/video', name: '视频同步', icon: VideoCamera },
  { path: '/export', name: '数据导出', icon: Files },
  { path: '/settings', name: '系统设置', icon: Setting }
]

const systemState = computed(() => systemStore.currentState)
const currentAngle = computed(() => systemStore.currentAngle)
const runTime = computed(() => systemStore.runTime)

const stateTextMap = {
  idle: '待机',
  starting: '启动中',
  stable: '稳定',
  acquiring: '采集中',
  stopped: '已停止',
  fault: '故障'
}

const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const toggleStatusPanel = () => {
  systemStore.toggleStatusPanel()
}

let timer = null
onMounted(() => {
  systemStore.connectWebSocket()
  timer = setInterval(() => {
    if (systemState.value === 'acquiring') {
      systemStore.incrementRunTime()
    }
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  systemStore.disconnectWebSocket()
})
</script>

<style scoped lang="scss">
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-primary);
}

.app-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: linear-gradient(180deg, rgba(26, 45, 71, 0.95) 0%, rgba(10, 22, 40, 0.95) 100%);
  border-bottom: 1px solid var(--color-border);
  backdrop-filter: blur(10px);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 40px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-accent);
  
  .logo-text {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 2px;
  }
}

.nav-menu {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 12px;
  border-radius: 4px;
  transition: all var(--transition-fast);
  
  &:hover {
    color: var(--color-accent);
    background: rgba(0, 212, 255, 0.05);
  }
  
  &.active {
    color: var(--color-accent);
    background: linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, transparent 100%);
    border-left: 2px solid var(--color-accent);
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.system-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--color-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  .status-text {
    font-size: 12px;
    font-weight: 500;
  }
}

.attack-angle,
.run-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  
  .label {
    font-size: 10px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .value {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 700;
    color: var(--color-accent);
  }
}

.user-info {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-secondary);
  border: 1px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
}

.app-main {
  flex: 1;
  overflow: hidden;
}
</style>
