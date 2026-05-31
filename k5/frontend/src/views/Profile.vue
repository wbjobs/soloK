<template>
  <div class="profile">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="profile-card" shadow="never">
          <div class="avatar-section">
            <el-avatar :size="100" :src="user?.avatar">
              {{ user?.username?.charAt(0)?.toUpperCase() }}
            </el-avatar>
            <h2 class="username">{{ user?.username }}</h2>
            <el-tag :type="roleTagType" size="large">
              {{ user?.role_display }}
            </el-tag>
          </div>

          <el-divider />

          <div class="stats-section">
            <div class="stat-item">
              <div class="stat-value">{{ user?.total_annotations || 0 }}</div>
              <div class="stat-label">总标注数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ user?.total_audio_minutes?.toFixed(1) || 0 }}</div>
              <div class="stat-label">总时长(分钟)</div>
            </div>
          </div>
        </el-card>

        <el-card class="quick-stats" shadow="never">
          <template #header>
            <span>今日统计</span>
          </template>
          <div class="today-stats">
            <div class="today-item">
              <div class="today-icon annotation">
                <el-icon :size="20"><Edit /></el-icon>
              </div>
              <div class="today-info">
                <div class="today-value">{{ todayStats.annotations }}</div>
                <div class="today-label">今日标注</div>
              </div>
            </div>
            <div class="today-item">
              <div class="today-icon time">
                <el-icon :size="20"><Clock /></el-icon>
              </div>
              <div class="today-info">
                <div class="today-value">{{ todayStats.minutes }}</div>
                <div class="today-label">今日时长(分钟)</div>
              </div>
            </div>
            <div class="today-item">
              <div class="today-icon quality">
                <el-icon :size="20"><CircleCheck /></el-icon>
              </div>
              <div class="today-info">
                <div class="today-value">{{ todayStats.avgKappa }}</div>
                <div class="today-label">平均Kappa</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card class="form-card" shadow="never">
          <template #header>
            <div class="card-header">
              <span>个人信息</span>
              <el-button type="primary" @click="handleSave" :loading="saving">
                保存修改
              </el-button>
            </div>
          </template>

          <el-tabs v-model="activeTab">
            <el-tab-pane label="基本信息" name="basic">
              <el-form
                ref="formRef"
                :model="profileForm"
                :rules="profileRules"
                label-width="120px"
                class="profile-form"
              >
                <el-row :gutter="20">
                  <el-col :span="12">
                    <el-form-item label="用户名" prop="username">
                      <el-input v-model="profileForm.username" disabled />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="邮箱" prop="email">
                      <el-input v-model="profileForm.email" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="姓名" prop="first_name">
                      <el-input v-model="profileForm.first_name" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="姓氏" prop="last_name">
                      <el-input v-model="profileForm.last_name" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="手机号" prop="phone">
                      <el-input v-model="profileForm.phone" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="方言偏好">
                      <el-select
                        v-model="profileForm.dialect_preference"
                        placeholder="请选择方言偏好"
                        style="width: 100%"
                        clearable
                      >
                        <el-option
                          v-for="dialect in dialects"
                          :key="dialect.id"
                          :label="dialect.name"
                          :value="dialect.code"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="修改密码" name="password">
              <el-form
                ref="passwordFormRef"
                :model="passwordForm"
                :rules="passwordRules"
                label-width="120px"
                class="password-form"
              >
                <el-form-item label="当前密码" prop="old_password">
                  <el-input
                    v-model="passwordForm.old_password"
                    type="password"
                    show-password
                    placeholder="请输入当前密码"
                  />
                </el-form-item>
                <el-form-item label="新密码" prop="new_password">
                  <el-input
                    v-model="passwordForm.new_password"
                    type="password"
                    show-password
                    placeholder="请输入新密码"
                  />
                </el-form-item>
                <el-form-item label="确认新密码" prop="confirm_password">
                  <el-input
                    v-model="passwordForm.confirm_password"
                    type="password"
                    show-password
                    placeholder="请再次输入新密码"
                  />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" @click="changePassword" :loading="changingPassword">
                    修改密码
                  </el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane label="活动记录" name="activity">
              <div class="activity-list">
                <div
                  v-for="(activity, index) in activityList"
                  :key="index"
                  class="activity-item"
                >
                  <div class="activity-icon" :class="activity.type">
                    <el-icon :size="16">
                      <component :is="getActivityIcon(activity.type)" />
                    </el-icon>
                  </div>
                  <div class="activity-content">
                    <div class="activity-title">{{ activity.title }}</div>
                    <div class="activity-desc">{{ activity.desc }}</div>
                  </div>
                  <div class="activity-time">{{ activity.time }}</div>
                </div>
              </div>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { authApi, dialectsApi } from '@/api'
import type { User, DialectRegion } from '@/types'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import {
  Edit,
  Clock,
  CircleCheck,
  Document,
  Upload,
  ChatDotRound
} from '@element-plus/icons-vue'

const userStore = useUserStore()

const formRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()
const saving = ref(false)
const changingPassword = ref(false)
const activeTab = ref('basic')

const user = computed(() => userStore.user)
const dialects = ref<DialectRegion[]>([])

const profileForm = reactive({
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  dialect_preference: ''
})

const passwordForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: ''
})

const profileRules: FormRules = {
  email: [
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }
  ]
}

const passwordRules: FormRules = {
  old_password: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于6位', trigger: 'blur' }
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.new_password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const roleTagType = computed(() => {
  const role = user.value?.role
  if (role === 'admin') return 'danger'
  if (role === 'auditor') return 'warning'
  return 'primary'
})

const todayStats = reactive({
  annotations: 0,
  minutes: 0,
  avgKappa: '0.00'
})

const activityList = ref([
  { type: 'annotation', title: '完成标注', desc: '完成了语音片段 audio_001.wav 的标注', time: '10分钟前' },
  { type: 'annotation', title: '开始标注', desc: '开始标注语音片段 audio_002.wav', time: '30分钟前' },
  { type: 'upload', title: '上传成功', desc: '上传了3个语音片段', time: '2小时前' },
  { type: 'negotiation', title: '协商完成', desc: '参与了标注协商并达成一致', time: '昨天' },
  { type: 'review', title: '质量审核', desc: '标注通过了质量审核', time: '昨天' }
])

const getActivityIcon = (type: string) => {
  const icons: Record<string, any> = {
    annotation: Edit,
    upload: Upload,
    negotiation: ChatDotRound,
    review: Document
  }
  return icons[type] || Document
}

const loadUserProfile = () => {
  if (user.value) {
    profileForm.username = user.value.username
    profileForm.email = user.value.email
    profileForm.first_name = user.value.first_name
    profileForm.last_name = user.value.last_name
    profileForm.phone = user.value.phone || ''
    profileForm.dialect_preference = user.value.dialect_preference || ''
  }
}

const fetchDialects = async () => {
  try {
    const res = await dialectsApi.getDialectRegions()
    dialects.value = res.results || []
  } catch (error) {
    console.error('获取方言列表失败', error)
  }
}

const handleSave = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    
    saving.value = true
    try {
      await authApi.updateProfile({
        email: profileForm.email,
        first_name: profileForm.first_name,
        last_name: profileForm.last_name,
        phone: profileForm.phone,
        dialect_preference: profileForm.dialect_preference
      })
      
      ElMessage.success('个人信息已更新')
      await userStore.fetchUser()
    } catch (error: any) {
      ElMessage.error(error.response?.data?.detail || '保存失败')
    } finally {
      saving.value = false
    }
  })
}

const changePassword = async () => {
  if (!passwordFormRef.value) return
  
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    changingPassword.value = true
    try {
      await authApi.changePassword({
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password
      })
      
      ElMessage.success('密码修改成功')
      passwordForm.old_password = ''
      passwordForm.new_password = ''
      passwordForm.confirm_password = ''
      activeTab.value = 'basic'
    } catch (error: any) {
      ElMessage.error(error.response?.data?.detail || '密码修改失败')
    } finally {
      changingPassword.value = false
    }
  })
}

onMounted(() => {
  loadUserProfile()
  fetchDialects()
})
</script>

<style scoped lang="scss">
.profile {
  .profile-card,
  .quick-stats,
  .form-card {
    border-radius: 12px;
    border: none;
    margin-bottom: 20px;

    :deep(.el-card__header) {
      border-bottom: 1px solid #f3f4f6;
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }

  .avatar-section {
    text-align: center;
    padding: 20px 0;

    .username {
      margin: 12px 0 8px;
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }
  }

  .stats-section {
    display: flex;
    justify-content: space-around;
    padding: 10px 0;

    .stat-item {
      text-align: center;

      .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: #3b82f6;
      }

      .stat-label {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
      }
    }
  }

  .today-stats {
    .today-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #f3f4f6;

      &:last-child {
        border-bottom: none;
      }

      .today-icon {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;

        &.annotation {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        &.time {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        }

        &.quality {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
        }
      }

      .today-info {
        .today-value {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }

        .today-label {
          font-size: 12px;
          color: #6b7280;
        }
      }
    }
  }

  .profile-form,
  .password-form {
    padding: 20px 0;
  }

  .activity-list {
    padding: 20px 0;

    .activity-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid #f3f4f6;

      &:last-child {
        border-bottom: none;
      }

      .activity-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.annotation {
          background: #dbeafe;
          color: #3b82f6;
        }

        &.upload {
          background: #dcfce7;
          color: #22c55e;
        }

        &.negotiation {
          background: #fef3c7;
          color: #f59e0b;
        }

        &.review {
          background: #f3e8ff;
          color: #8b5cf6;
        }
      }

      .activity-content {
        flex: 1;

        .activity-title {
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
          margin-bottom: 4px;
        }

        .activity-desc {
          font-size: 13px;
          color: #6b7280;
        }
      }

      .activity-time {
        font-size: 12px;
        color: #9ca3af;
        flex-shrink: 0;
      }
    }
  }
}
</style>
