<template>
  <div class="export-view">
    <div class="export-panel panel">
      <div class="panel-header">
        <span><Files :size="16" /> 数据导出</span>
      </div>
      <div class="panel-content">
        <div class="export-options">
          <div class="option-section">
            <h4 class="section-title">选择试验数据</h4>
            <div class="test-selector">
              <div 
                v-for="test in testList" 
                :key="test.id"
                class="test-item"
                :class="{ selected: selectedTests.includes(test.id) }"
                @click="toggleTest(test.id)"
              >
                <span class="test-check">
                  <Check v-if="selectedTests.includes(test.id)" />
                </span>
                <div class="test-info">
                  <span class="test-name">{{ test.name }}</span>
                  <span class="test-date">{{ test.date }}</span>
                </div>
                <span class="test-size">{{ test.size }}</span>
              </div>
            </div>
          </div>
          
          <div class="option-section">
            <h4 class="section-title">导出格式</h4>
            <div class="format-selector">
              <div 
                v-for="format in formats" 
                :key="format.key"
                class="format-card"
                :class="{ selected: selectedFormat === format.key }"
                @click="selectedFormat = format.key"
              >
                <component :is="format.icon" :size="24" />
                <span class="format-name">{{ format.name }}</span>
                <span class="format-desc">{{ format.desc }}</span>
              </div>
            </div>
          </div>
          
          <div class="option-section">
            <h4 class="section-title">数据选择</h4>
            <div class="data-options">
              <label class="checkbox-item">
                <input type="checkbox" v-model="dataOptions.pressure" />
                <span>压力传感器数据 (128通道)</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="dataOptions.balance" />
                <span>天平六分量力</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="dataOptions.aero" />
                <span>气动力系数</span>
              </label>
              <label class="checkbox-item">
                <input type="checkbox" v-model="dataOptions.fft" />
                <span>FFT频谱数据</span>
              </label>
            </div>
          </div>
          
          <div class="option-section">
            <h4 class="section-title">通道范围</h4>
            <div class="channel-range">
              <span>通道</span>
              <input type="number" v-model="channelRange.start" min="1" max="128" />
              <span>-</span>
              <input type="number" v-model="channelRange.end" min="1" max="128" />
            </div>
          </div>
          
          <div class="export-actions">
            <button class="btn btn-primary" @click="handleExport" :disabled="exporting">
              <Download v-if="!exporting" />
              <Loading v-else />
              {{ exporting ? '导出中...' : '开始导出' }}
            </button>
            <button class="btn" @click="generateReport">
              <Document /> 生成PDF报告
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <div class="history-panel panel">
      <div class="panel-header">
        <span><Clock :size="16" /> 导出历史</span>
      </div>
      <div class="panel-content">
        <div class="history-list">
          <div 
            v-for="item in exportHistory" 
            :key="item.id"
            class="history-item"
          >
            <div class="history-info">
              <span class="history-name">{{ item.name }}</span>
              <span class="history-date">{{ item.date }}</span>
            </div>
            <span class="history-size">{{ item.size }}</span>
            <button class="btn small" @click="downloadFile(item)">
              <Download />
            </button>
          </div>
          <div v-if="exportHistory.length === 0" class="empty-state">
            <Folder />
            <span>暂无导出记录</span>
          </div>
        </div>
      </div>
    </div>
    
    <div class="report-preview panel">
      <div class="panel-header">
        <span><Document :size="16" /> 试验报告预览</span>
      </div>
      <div class="panel-content">
        <div class="report-preview-content">
          <div class="report-title">风洞试验报告</div>
          <div class="report-section">
            <h5>试验摘要</h5>
            <table class="report-table">
              <tr><td>试验编号</td><td>WT-2024-001</td></tr>
              <tr><td>试验日期</td><td>2024-01-15</td></tr>
              <tr><td>试验模型</td><td>NACA 0012 翼型</td></tr>
              <tr><td>攻角范围</td><td>-5° ~ 30°</td></tr>
              <tr><td>来流速度</td><td>50 m/s</td></tr>
            </table>
          </div>
          <div class="report-section">
            <h5>气动力系数汇总</h5>
            <table class="data-table">
              <thead>
                <tr><th>攻角 (°)</th><th>CL</th><th>CD</th><th>CM</th><th>L/D</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in summaryData" :key="row.angle">
                  <td>{{ row.angle }}</td>
                  <td>{{ row.CL }}</td>
                  <td>{{ row.CD }}</td>
                  <td>{{ row.CM }}</td>
                  <td>{{ row.LD }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { Files, Check, Download, Document, Clock, Folder, Loading, DataLine, Grid, Picture } from '@element-plus/icons-vue'

const testList = ref([
  { id: 1, name: 'NACA0012 - 攻角0°', date: '2024-01-15 14:30', size: '256 MB' },
  { id: 2, name: 'NACA0012 - 攻角5°', date: '2024-01-15 15:15', size: '248 MB' },
  { id: 3, name: 'NACA0012 - 攻角10°', date: '2024-01-15 16:00', size: '261 MB' },
  { id: 4, name: 'NACA0012 - 攻角15°', date: '2024-01-15 16:45', size: '252 MB' }
])

const formats = [
  { key: 'mat', name: 'MATLAB', desc: '.mat 格式', icon: DataLine },
  { key: 'csv', name: 'CSV', desc: '.csv 逗号分隔', icon: Grid },
  { key: 'pdf', name: 'PDF报告', desc: '含图表和表格', icon: Document }
]

const selectedTests = ref([1, 2])
const selectedFormat = ref('mat')
const exporting = ref(false)

const dataOptions = reactive({
  pressure: true,
  balance: true,
  aero: true,
  fft: false
})

const channelRange = reactive({
  start: 1,
  end: 128
})

const exportHistory = ref([
  { id: 1, name: 'WT-2024-001_data.mat', date: '2024-01-15 17:30', size: '512 MB' },
  { id: 2, name: 'WT-2024-001_report.pdf', date: '2024-01-15 17:35', size: '8.5 MB' }
])

const summaryData = [
  { angle: -5, CL: 0.102, CD: 0.012, CM: -0.015, LD: 8.50 },
  { angle: 0, CL: 0.356, CD: 0.018, CM: 0.002, LD: 19.78 },
  { angle: 5, CL: 0.612, CD: 0.025, CM: 0.018, LD: 24.48 },
  { angle: 10, CL: 0.825, CD: 0.038, CM: 0.035, LD: 21.71 },
  { angle: 15, CL: 0.987, CD: 0.062, CM: 0.052, LD: 15.92 }
]

const toggleTest = (id) => {
  const idx = selectedTests.value.indexOf(id)
  if (idx > -1) {
    selectedTests.value.splice(idx, 1)
  } else {
    selectedTests.value.push(id)
  }
}

const handleExport = () => {
  exporting.value = true
  setTimeout(() => {
    exporting.value = false
    alert('导出完成！文件已保存到下载目录。')
  }, 2000)
}

const generateReport = () => {
  exporting.value = true
  setTimeout(() => {
    exporting.value = false
    alert('PDF报告生成完成！')
  }, 3000)
}

const downloadFile = (item) => {
  console.log('Downloading:', item.name)
}
</script>

<style scoped lang="scss">
.export-view {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: auto 1fr;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.export-panel {
  grid-row: 1 / 3;
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease;
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
  }
}

.export-options {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.option-section {
  .section-title {
    font-size: 13px;
    color: var(--color-accent);
    margin-bottom: 12px;
    font-family: var(--font-display);
    letter-spacing: 0.5px;
  }
}

.test-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.test-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.selected {
    border-color: var(--color-accent);
    background: rgba(0, 212, 255, 0.05);
  }
  
  .test-check {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-accent);
  }
  
  &.selected .test-check {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-primary);
  }
  
  .test-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    
    .test-name {
      font-size: 12px;
      color: var(--color-text-primary);
    }
    
    .test-date {
      font-size: 11px;
      color: var(--color-text-secondary);
    }
  }
  
  .test-size {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-family: var(--font-display);
  }
}

.format-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.format-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: var(--color-primary);
  border: 2px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  &:hover {
    border-color: var(--color-accent);
  }
  
  &.selected {
    border-color: var(--color-accent);
    background: rgba(0, 212, 255, 0.1);
  }
  
  .format-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .format-desc {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
}

.data-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-primary);
  
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--color-accent);
  }
}

.channel-range {
  display: flex;
  align-items: center;
  gap: 12px;
  
  span {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  
  input[type="number"] {
    width: 80px;
    padding: 6px 10px;
    background: var(--color-primary);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: 2px;
    font-size: 12px;
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
}

.export-actions {
  display: flex;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
  
  .btn {
    flex: 1;
  }
}

.history-panel,
.report-preview {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease 0.1s both;
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
  }
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--color-primary);
  border-radius: 4px;
  
  .history-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    
    .history-name {
      font-size: 11px;
      color: var(--color-text-primary);
    }
    
    .history-date {
      font-size: 10px;
      color: var(--color-text-secondary);
    }
  }
  
  .history-size {
    font-size: 10px;
    color: var(--color-text-secondary);
    font-family: var(--font-display);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.report-preview {
  animation-delay: 0.2s;
}

.report-preview-content {
  padding: 10px;
}

.report-title {
  text-align: center;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-accent);
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.report-section {
  margin-bottom: 16px;
  
  h5 {
    font-size: 12px;
    color: var(--color-text-primary);
    margin-bottom: 8px;
  }
}

.report-table {
  width: 100%;
  font-size: 11px;
  
  td {
    padding: 4px 0;
    color: var(--color-text-secondary);
    
    &:first-child {
      color: var(--color-text-primary);
      font-weight: 500;
    }
  }
}

.data-table {
  width: 100%;
  font-size: 10px;
  border-collapse: collapse;
  
  th, td {
    padding: 4px 6px;
    text-align: center;
    border: 1px solid var(--color-border);
  }
  
  th {
    background: var(--color-primary);
    color: var(--color-accent);
    font-weight: 600;
  }
  
  td {
    color: var(--color-text-primary);
  }
}
</style>
