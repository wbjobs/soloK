import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue')
  },
  {
    path: '/pressure',
    name: 'Pressure',
    component: () => import('@/views/PressureView.vue')
  },
  {
    path: '/aerodynamic',
    name: 'Aerodynamic',
    component: () => import('@/views/AerodynamicView.vue')
  },
  {
    path: '/spectrum',
    name: 'Spectrum',
    component: () => import('@/views/SpectrumView.vue')
  },
  {
    path: '/flutter',
    name: 'Flutter',
    component: () => import('@/views/FlutterView.vue')
  },
  {
    path: '/dmd',
    name: 'DMD',
    component: () => import('@/views/DMDView.vue')
  },
  {
    path: '/comparison',
    name: 'Comparison',
    component: () => import('@/views/ComparisonView.vue')
  },
  {
    path: '/video',
    name: 'VideoSync',
    component: () => import('@/views/VideoSyncView.vue')
  },
  {
    path: '/export',
    name: 'Export',
    component: () => import('@/views/ExportView.vue')
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
