<template>
  <div class="dialect-list">
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filterForm" class="filter-form">
        <el-form-item label="名称">
          <el-input
            v-model="filterForm.name"
            placeholder="请输入名称"
            clearable
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item label="语系">
          <el-select
            v-model="filterForm.language_family"
            placeholder="全部语系"
            clearable
            style="width: 140px"
          >
            <el-option label="汉语族" value="sinitic" />
            <el-option label="壮侗语系" value="tai-kadai" />
            <el-option label="苗瑶语系" value="hmong-mien" />
            <el-option label="藏缅语系" value="tibeto-burman" />
            <el-option label="阿尔泰语系" value="altaic" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filterForm.is_active"
            placeholder="全部状态"
            clearable
            style="width: 120px"
          >
            <el-option label="已启用" :value="true" />
            <el-option label="已禁用" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchData">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="resetFilter">重置</el-button>
        </el-form-item>
        <el-form-item>
          <el-button type="success" @click="handleAdd">
            <el-icon><Plus /></el-icon>新增方言片区
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card" shadow="never">
      <el-table
        :data="dialectList"
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="code" label="代码" width="120" />
        <el-table-column prop="language_family" label="语系" width="120">
          <template #default="{ row }">
            {{ languageFamilyMap[row.language_family] || row.language_family }}
          </template>
        </el-table-column>
        <el-table-column prop="tone_system" label="声调系统" width="140">
          <template #default="{ row }">
            {{ toneSystemMap[row.tone_system] || row.tone_system }}
          </template>
        </el-table-column>
        <el-table-column prop="tone_count" label="声调数" width="100" />
        <el-table-column prop="is_active" label="是否启用" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'" size="small">
              {{ row.is_active ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              type="info"
              link
              size="small"
              @click="handleSubregions(row)"
            >
              子片区
            </el-button>
            <el-button
              type="danger"
              link
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchData"
          @current-change="fetchData"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑方言片区' : '新增方言片区'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="dialogFormRef"
        :model="dialogForm"
        :rules="dialogRules"
        label-width="100px"
      >
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="dialogForm.name"
            placeholder="请输入方言片区名称"
          />
        </el-form-item>
        <el-form-item label="代码" prop="code">
          <el-input
            v-model="dialogForm.code"
            placeholder="请输入方言代码，如：yue"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="dialogForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入描述信息"
          />
        </el-form-item>
        <el-form-item label="语系" prop="language_family">
          <el-select
            v-model="dialogForm.language_family"
            placeholder="请选择语系"
            style="width: 100%"
          >
            <el-option label="汉语族" value="sinitic" />
            <el-option label="壮侗语系" value="tai-kadai" />
            <el-option label="苗瑶语系" value="hmong-mien" />
            <el-option label="藏缅语系" value="tibeto-burman" />
            <el-option label="阿尔泰语系" value="altaic" />
          </el-select>
        </el-form-item>
        <el-form-item label="声调系统" prop="tone_system">
          <el-select
            v-model="dialogForm.tone_system"
            placeholder="请选择声调系统"
            style="width: 100%"
            @change="handleToneSystemChange"
          >
            <el-option label="粤语9声" value="cantonese_9" />
            <el-option label="闽南语8声" value="minnan_8" />
            <el-option label="吴语8声" value="wu_8" />
            <el-option label="普通话5声" value="mandarin_5" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="dialogForm.tone_system === 'custom'"
          label="声调数"
          prop="tone_count"
        >
          <el-input-number
            v-model="dialogForm.tone_count"
            :min="1"
            :max="12"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="dialogForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmDialog">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="subregionDialogVisible"
      :title="`${currentDialect?.name || ''} - 子片区管理`"
      width="800px"
      :close-on-click-modal="false"
    >
      <div class="subregion-header">
        <el-button type="success" @click="handleAddSubregion">
          <el-icon><Plus /></el-icon>新增子片区
        </el-button>
      </div>
      <el-table
        :data="subregionList"
        style="width: 100%"
        v-loading="subregionLoading"
      >
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="code" label="代码" width="120" />
        <el-table-column prop="province" label="省份" width="100" />
        <el-table-column prop="city" label="城市" width="100" />
        <el-table-column prop="is_active" label="是否启用" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'" size="small">
              {{ row.is_active ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="handleEditSubregion(row)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              link
              size="small"
              @click="handleDeleteSubregion(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-dialog
      v-model="subregionFormDialogVisible"
      :title="isSubregionEdit ? '编辑子片区' : '新增子片区'"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="subregionFormRef"
        :model="subregionForm"
        :rules="subregionRules"
        label-width="100px"
      >
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="subregionForm.name"
            placeholder="请输入子片区名称"
          />
        </el-form-item>
        <el-form-item label="代码" prop="code">
          <el-input
            v-model="subregionForm.code"
            placeholder="请输入子片区代码"
          />
        </el-form-item>
        <el-form-item label="省份" prop="province">
          <el-input
            v-model="subregionForm.province"
            placeholder="请输入省份"
          />
        </el-form-item>
        <el-form-item label="城市" prop="city">
          <el-input
            v-model="subregionForm.city"
            placeholder="请输入城市"
          />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="subregionForm.description"
            type="textarea"
            :rows="2"
            placeholder="请输入描述信息"
          />
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="subregionForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="subregionFormDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSubregionDialog">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useUserStore } from '@/store/user'
import { dialectsApi } from '@/api'
import type { DialectRegion, DialectSubregion } from '@/types'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'

const userStore = useUserStore()

const loading = ref(false)
const dialectList = ref<DialectRegion[]>([])
const selectedIds = ref<number[]>([])

const filterForm = reactive({
  name: '',
  language_family: null as string | null,
  is_active: null as boolean | null
})

const pagination = reactive({
  page: 1,
  page_size: 20,
  total: 0
})

const dialogVisible = ref(false)
const isEdit = ref(false)
const currentEditId = ref<number | null>(null)
const dialogFormRef = ref<FormInstance>()
const dialogForm = reactive({
  name: '',
  code: '',
  description: '',
  language_family: '',
  tone_system: '',
  tone_count: 5,
  is_active: true
})

const dialogRules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入代码', trigger: 'blur' }],
  language_family: [{ required: true, message: '请选择语系', trigger: 'change' }],
  tone_system: [{ required: true, message: '请选择声调系统', trigger: 'change' }],
  tone_count: [
    {
      validator: (_rule, value, callback) => {
        if (dialogForm.tone_system === 'custom' && (value === null || value < 1)) {
          callback(new Error('请输入声调数'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ]
}

const languageFamilyMap: Record<string, string> = {
  'sinitic': '汉语族',
  'tai-kadai': '壮侗语系',
  'hmong-mien': '苗瑶语系',
  'tibeto-burman': '藏缅语系',
  'altaic': '阿尔泰语系'
}

const toneSystemMap: Record<string, string> = {
  'cantonese_9': '粤语9声',
  'minnan_8': '闽南语8声',
  'wu_8': '吴语8声',
  'mandarin_5': '普通话5声',
  'custom': '自定义'
}

const toneSystemCountMap: Record<string, number> = {
  'cantonese_9': 9,
  'minnan_8': 8,
  'wu_8': 8,
  'mandarin_5': 5
}

const subregionDialogVisible = ref(false)
const subregionLoading = ref(false)
const subregionList = ref<DialectSubregion[]>([])
const currentDialect = ref<DialectRegion | null>(null)

const subregionFormDialogVisible = ref(false)
const isSubregionEdit = ref(false)
const currentSubregionId = ref<number | null>(null)
const subregionFormRef = ref<FormInstance>()
const subregionForm = reactive({
  name: '',
  code: '',
  province: '',
  city: '',
  description: '',
  is_active: true
})

const subregionRules: FormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入代码', trigger: 'blur' }],
  province: [{ required: true, message: '请输入省份', trigger: 'blur' }],
  city: [{ required: true, message: '请输入城市', trigger: 'blur' }]
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-CN')
}

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      ...filterForm,
      page: pagination.page,
      page_size: pagination.page_size
    }
    const res = await dialectsApi.getDialectList(params)
    dialectList.value = res.results || []
    pagination.total = res.count || 0
  } catch (error) {
    ElMessage.error('获取方言片区列表失败')
  } finally {
    loading.value = false
  }
}

const resetFilter = () => {
  filterForm.name = ''
  filterForm.language_family = null
  filterForm.is_active = null
  pagination.page = 1
  fetchData()
}

const handleAdd = () => {
  isEdit.value = false
  currentEditId.value = null
  dialogForm.name = ''
  dialogForm.code = ''
  dialogForm.description = ''
  dialogForm.language_family = ''
  dialogForm.tone_system = ''
  dialogForm.tone_count = 5
  dialogForm.is_active = true
  dialogVisible.value = true
}

const handleEdit = (row: DialectRegion) => {
  isEdit.value = true
  currentEditId.value = row.id
  dialogForm.name = row.name
  dialogForm.code = row.code
  dialogForm.description = row.description
  dialogForm.language_family = row.language_family
  dialogForm.tone_system = row.tone_system
  dialogForm.tone_count = row.tone_count
  dialogForm.is_active = row.is_active
  dialogVisible.value = true
}

const handleToneSystemChange = (val: string) => {
  if (toneSystemCountMap[val]) {
    dialogForm.tone_count = toneSystemCountMap[val]
  }
}

const confirmDialog = async () => {
  if (!dialogFormRef.value) return
  
  try {
    await dialogFormRef.value.validate()
    
    const data = {
      name: dialogForm.name,
      code: dialogForm.code,
      description: dialogForm.description,
      language_family: dialogForm.language_family,
      tone_system: dialogForm.tone_system,
      tone_count: dialogForm.tone_count,
      is_active: dialogForm.is_active
    }
    
    if (isEdit.value && currentEditId.value) {
      await dialectsApi.updateDialect(currentEditId.value, data)
      ElMessage.success('编辑成功')
    } else {
      await dialectsApi.createDialect(data)
      ElMessage.success('新增成功')
    }
    
    dialogVisible.value = false
    fetchData()
  } catch (error) {
    if (error !== false) {
      ElMessage.error(isEdit.value ? '编辑失败' : '新增失败')
    }
  }
}

const handleDelete = (row: DialectRegion) => {
  ElMessageBox.confirm(
    `确定要删除方言片区 "${row.name}" 吗？`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await dialectsApi.deleteDialect(row.id)
      ElMessage.success('删除成功')
      fetchData()
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

const handleSubregions = async (row: DialectRegion) => {
  currentDialect.value = row
  subregionDialogVisible.value = true
  await fetchSubregions()
}

const fetchSubregions = async () => {
  if (!currentDialect.value) return
  
  subregionLoading.value = true
  try {
    const res = await dialectsApi.getSubregionList({
      region: currentDialect.value.id
    })
    subregionList.value = res.results || []
  } catch (error) {
    ElMessage.error('获取子片区列表失败')
  } finally {
    subregionLoading.value = false
  }
}

const handleAddSubregion = () => {
  isSubregionEdit.value = false
  currentSubregionId.value = null
  subregionForm.name = ''
  subregionForm.code = ''
  subregionForm.province = ''
  subregionForm.city = ''
  subregionForm.description = ''
  subregionForm.is_active = true
  subregionFormDialogVisible.value = true
}

const handleEditSubregion = (row: DialectSubregion) => {
  isSubregionEdit.value = true
  currentSubregionId.value = row.id
  subregionForm.name = row.name
  subregionForm.code = row.code
  subregionForm.province = row.province
  subregionForm.city = row.city
  subregionForm.description = row.description
  subregionForm.is_active = row.is_active
  subregionFormDialogVisible.value = true
}

const confirmSubregionDialog = async () => {
  if (!subregionFormRef.value || !currentDialect.value) return
  
  try {
    await subregionFormRef.value.validate()
    
    const data = {
      region: currentDialect.value.id,
      name: subregionForm.name,
      code: subregionForm.code,
      province: subregionForm.province,
      city: subregionForm.city,
      description: subregionForm.description,
      is_active: subregionForm.is_active
    }
    
    if (isSubregionEdit.value && currentSubregionId.value) {
      await dialectsApi.updateSubregion(currentSubregionId.value, data)
      ElMessage.success('编辑成功')
    } else {
      await dialectsApi.createSubregion(data)
      ElMessage.success('新增成功')
    }
    
    subregionFormDialogVisible.value = false
    fetchSubregions()
  } catch (error) {
    if (error !== false) {
      ElMessage.error(isSubregionEdit.value ? '编辑失败' : '新增失败')
    }
  }
}

const handleDeleteSubregion = (row: DialectSubregion) => {
  ElMessageBox.confirm(
    `确定要删除子片区 "${row.name}" 吗？`,
    '提示',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await dialectsApi.deleteSubregion(row.id)
      ElMessage.success('删除成功')
      fetchSubregions()
    } catch (error) {
      ElMessage.error('删除失败')
    }
  }).catch(() => {})
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped lang="scss">
.dialect-list {
  .filter-card {
    border-radius: 12px;
    margin-bottom: 20px;
    border: none;

    :deep(.el-card__body) {
      padding: 16px 20px;
    }
  }

  .filter-form {
    :deep(.el-form-item) {
      margin-bottom: 0;
      margin-right: 16px;
    }
  }

  .table-card {
    border-radius: 12px;
    border: none;
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .subregion-header {
    margin-bottom: 16px;
  }
}
</style>
