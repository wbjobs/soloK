<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import AppLayout from '@/components/AppLayout.vue'
import Login from '@/views/Login.vue'

const route = useRoute()
const userStore = useUserStore()

const isLoggedIn = computed(() => userStore.isLoggedIn)
const isLoginPage = computed(() => route.name === 'login')
</script>

<template>
  <Login v-if="isLoginPage" />
  <AppLayout v-else-if="isLoggedIn" />
  <Login v-else />
</template>

<style scoped>
</style>
