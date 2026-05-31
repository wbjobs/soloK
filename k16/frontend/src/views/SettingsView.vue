<template>
  <div class="settings-view">
    <div class="settings-panel panel">
      <div class="panel-header">
        <span><Setting :size="16" /> 系统设置</span>
      </div>
      <div class="panel-content">
        <div class="settings-section">
          <h4 class="section-title">采集参数</h4>
          <div class="form-grid">
            <div class="form-item">
              <label>采样率 (Hz)</label>
              <input type="number" v-model="settings.sampleRate" />
            </div>
            <div class="form-item">
              <label>压力通道数</label>
              <input type="number" v-model="settings.pressureChannels" />
            </div>
            <div class="form-item">
              <label>风速 (m/s)</label>
              <input type="number" v-model="settings.windSpeed" />
            </div>
            <div class="form-item">
              <label>攻角范围 (°)</label>
              <div class="range-input">
                <input type="number" v-model="settings.angleMin" />
                <span>~</span>
                <input type="number" v-model="settings.angleMax" />
              </div>
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h4 class="section-title">数据质量控制</h4>
          <div class="form-grid">
            <div class="form-item">
              <label>3σ 异常检测</label>
              <el-switch v-model="settings.sigmaDetection" />
            </div>
            <div class="form-item">
              <label>滑动窗口大小</label>
              <input type="number" v-model="settings.windowSize" />
            </div>
            <div class="form-item">
              <label>野点剔除阈值</label>
              <input type="number" v-model="settings.outlierThreshold" step="0.1" />
            </div>
            <div class="form-item">
              <label>相邻通道相关性校验</label>
              <el-switch v-model="settings.correlationCheck" />
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h4 class="section-title">报警阈值</h4>
          <div class="form-grid">
            <div class="form-item">
              <label>压力上限 (Pa)</label>
              <input type="number" v-model="settings.pressureHigh" />
            </div>
            <div class="form-item">
              <label>压力下限 (Pa)</label>
              <input type="number" v-model="settings.pressureLow" />
            </div>
            <div class="form-item">
              <label>天平力阈值 (N)</label>
              <input type="number" v-model="settings.forceThreshold" />
            </div>
            <div class="form-item">
              <label>温度阈值 (°C)</label>
              <input type="number" v-model="settings.tempThreshold" />
            </div>
          </div>
        </div>
        
        <div class="settings-section">
          <h4 class="section-title">网络配置</h4>
          <div class="form-grid">
            <div class="form-item">
              <label>UDP 接收端口</label>
              <input type="number" v-model="network.udpPort" />
            </div>
            <div class="form-item">
              <label>WebSocket 端口</label>
              <input type="number" v-model="network.wsPort" />
            </div>
            <div class="form-item">
              <label>InfluxDB 地址</label>
              <input type="text" v-model="network.influxHost" />
            </div>
            <div class="form-item">
              <label>InfluxDB 端口</label>
              <input type="number" v-model="network.influxPort" />
            </div>
          </div>
        </div>
        
        <div class="settings-actions">
          <button class="btn btn-primary" @click="saveSettings">
            <Check /> 保存设置
          </button>
          <button class="btn" @click="resetSettings">
            <RefreshLeft /> 恢复默认
          </button>
        </div>
      </div>
    </div>
    
    <div class="status-panel panel">
      <div class="panel-header">
        <span><Monitor :size="16" /> 系统状态</span>
      </div>
      <div class="panel-content">
        <div class="status-grid">
          <div class="status-card">
            <div class="status-icon ok">
              <Connection />
            </div>
            <div class="status-info">
              <span class="status-name">C++ 数据服务</span>
              <span class="status-value running">运行中</span>
            </div>
          </div>
          
          <div class="status-card">
            <div class="status-icon ok">
              <Platform />
            </div>
            <div class="status-info">
              <span class="status-name">Python 计算服务</span>
              <span class="status-value running">运行中</span>
            </div>
          </div>
          
          <div class="status-card">
            <div class="status-icon ok">
              <DataAnalysis />
            </div>
            <div class="status-info">
              <span class="status-name">InfluxDB</span>
              <span class="status-value running">已连接</span>
            </div>
          </div>
          
          <div class="status-card">
            <div class="status-icon ok">
              <Odometer />
            </div>
            <div class="status-info">
              <span class="status-name">数据接收</span>
              <span class="status-value">2000 Hz</span>
            </div>
          </div>
        </div>
        
        <div class="calibration-section">
          <h4 class="section-title">传感器校准</h4>
          <div class="calibration-actions">
            <button class="btn" @click="calibratePressure">
              <Tools /> 压力传感器校准
            </button>
            <button class="btn" @click="calibrateBalance">
              <Scale /> 天平校准
            </button>
          </div>
        </div>
        
        <div class="about-section">
          <h4 class="section-title">关于系统</h4>
          <div class="about-info">
            <div class="about-row">
              <span>系统版本</span>
              <span>v1.0.0</span>
            </div>
            <div class="about-row">
              <span>构建时间</span>
              <span>2024-01-15</span>
            </div>
            <div class="about-row">
              <span>运行时长</span>
              <span>12天 5小时</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import {
  Setting,
  Check,
  RefreshLeft,
  Monitor,
  Connection,
  Platform,
  DataAnalysis,
  Odometer,
  Tools,
  Scale
} from '@element-plus/icons-vue'

const settings = reactive({
  sampleRate: 2000,
  pressureChannels: 128,
  windSpeed: 50,
  angleMin: -5,
  angleMax: 30,
  sigmaDetection: true,
  windowSize: 50,
  outlierThreshold: 3.0,
  correlationCheck: true,
  pressureHigh: 5000,
  pressureLow: -5000,
  forceThreshold: 2000,
  tempThreshold: 60
})

const network = reactive({
  udpPort: 12345,
  wsPort: 5000,
  influxHost: 'localhost',
  influxPort: 8086
})

const saveSettings = () => {
  alert('设置已保存！')
}

const resetSettings = () => {
  if (confirm('确定要恢复默认设置吗？')) {
    settings.sampleRate = 2000
    settings.pressureChannels = 128
    settings.windSpeed = 50
    settings.angleMin = -5
    settings.angleMax = 30
  }
}

const calibratePressure = () => {
  alert('压力传感器校准开始...')
}

const calibrateBalance = () => {
  alert('天平校准开始...')
}
</script>

<style scoped lang="scss">
.settings-view {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.settings-panel {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease;
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
  }
}

.settings-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-border);
  
  &:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }
  
  .section-title {
    font-size: 13px;
    color: var(--color-accent);
    margin-bottom: 16px;
    font-family: var(--font-display);
    letter-spacing: 0.5px;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  
  label {
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  
  input[type="text"],
  input[type="number"] {
    padding: 8px 12px;
    background: var(--color-primary);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    border-radius: 2px;
    font-size: 12px;
    font-family: var(--font-body);
    
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
  
  .range-input {
    display: flex;
    align-items: center;
    gap: 8px;
    
    input {
      flex: 1;
    }
    
    span {
      color: var(--color-text-secondary);
    }
  }
}

.settings-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
  
  .btn {
    flex: 1;
  }
}

.status-panel {
  display: flex;
  flex-direction: column;
  animation: fadeIn 0.5s ease 0.1s both;
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
  }
}

.status-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--color-border);
}

.status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-primary);
  border-radius: 4px;
  
  .status-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    
    &.ok {
      background: rgba(0, 200, 83, 0.1);
      color: #00C853;
    }
    
    &.error {
      background: rgba(255, 82, 82, 0.1);
      color: #FF5252;
    }
  }
  
  .status-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    
    .status-name {
      font-size: 12px;
      color: var(--color-text-secondary);
    }
    
    .status-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-primary);
      
      &.running {
        color: #00C853;
      }
    }
  }
}

.calibration-section,
.about-section {
  margin-bottom: 24px;
  
  .section-title {
    font-size: 12px;
    color: var(--color-accent);
    margin-bottom: 12px;
    font-family: var(--font-display);
  }
}

.calibration-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  
  .btn {
    width: 100%;
    justify-content: flex-start;
  }
}

.about-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  
  &:last-child {
    border-bottom: none;
  }
  
  span:first-child {
    color: var(--color-text-secondary);
  }
  
  span:last-child {
    color: var(--color-text-primary);
    font-family: var(--font-display);
  }
}
</style>
