import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/store/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { requiresAuth: true, title: '数据看板' }
  },
  {
    path: '/audio',
    name: 'audio',
    component: () => import('@/views/audio/AudioList.vue'),
    meta: { requiresAuth: true, title: '语音管理' }
  },
  {
    path: '/audio/upload',
    name: 'audio-upload',
    component: () => import('@/views/audio/AudioUpload.vue'),
    meta: { requiresAuth: true, title: '上传语音', roles: ['admin'] }
  },
  {
    path: '/audio/:id',
    name: 'audio-detail',
    component: () => import('@/views/audio/AudioDetail.vue'),
    meta: { requiresAuth: true, title: '语音详情' }
  },
  {
    path: '/annotate/:audioId',
    name: 'annotate',
    component: () => import('@/views/annotations/AnnotationEditor.vue'),
    meta: { requiresAuth: true, title: '标注编辑' }
  },
  {
    path: '/annotations',
    name: 'annotations',
    component: () => import('@/views/annotations/AnnotationList.vue'),
    meta: { requiresAuth: true, title: '标注管理' }
  },
  {
    path: '/negotiations',
    name: 'negotiations',
    component: () => import('@/views/annotations/NegotiationList.vue'),
    meta: { requiresAuth: true, title: '协商管理', roles: ['admin'] }
  },
  {
    path: '/dialects',
    name: 'dialects',
    component: () => import('@/views/dialects/DialectList.vue'),
    meta: { requiresAuth: true, title: '方言管理', roles: ['admin'] }
  },
  {
    path: '/datasets',
    name: 'datasets',
    component: () => import('@/views/datasets/DatasetList.vue'),
    meta: { requiresAuth: true, title: '数据集管理', roles: ['admin'] }
  },
  {
    path: '/datasets/create',
    name: 'dataset-create',
    component: () => import('@/views/datasets/DatasetCreate.vue'),
    meta: { requiresAuth: true, title: '创建数据集', roles: ['admin'] }
  },
  {
    path: '/quality',
    name: 'quality',
    component: () => import('@/views/quality/QualityDashboard.vue'),
    meta: { requiresAuth: true, title: '质量控制', roles: ['admin'] }
  },
  {
    path: '/ranking',
    name: 'ranking',
    component: () => import('@/views/stats/AnnotatorRanking.vue'),
    meta: { requiresAuth: true, title: '工作量排行' }
  },
  {
    path: '/progress',
    name: 'progress',
    component: () => import('@/views/stats/ProgressDashboard.vue'),
    meta: { requiresAuth: true, title: '标注进度' }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/Profile.vue'),
    meta: { requiresAuth: true, title: '个人中心' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore()

  if (to.meta.requiresAuth && !userStore.isLoggedIn) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  if (to.meta.roles && userStore.user) {
    const roles = to.meta.roles as string[]
    if (!roles.includes(userStore.user.role)) {
      next({ name: 'dashboard' })
      return
    }
  }

  if (to.name === 'login' && userStore.isLoggedIn) {
    next({ name: 'dashboard' })
    return
  }

  next()
})

export default router
