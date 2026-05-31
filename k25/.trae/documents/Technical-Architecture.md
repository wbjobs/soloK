## 1. 架构设计

```mermaid
architecture-beta
    group browser["浏览器端 (纯前端)"]
    group video["视频流处理层"]
    group pose["姿态估计层"]
    group analysis["行为分析层"]
    group alert["报警系统层"]
    group storage["数据存储层"]
    group ui["UI展示层"]

    service webcam["摄像头/WebRTC"]:video
    service canvas["Canvas渲染"]:video
    service mediapipe["MediaPipe Pose"]:pose
    service movenet["MoveNet(TF.js)"]:pose
    service rules["规则引擎"]:analysis
    service opticalflow["光流计算"]:analysis
    service alarm["报警触发"]:alert
    service audio["Web Audio API"]:alert
    service indexeddb["IndexedDB"]:storage
    service charts["图表组件"]:ui
    service dashboard["看板组件"]:ui

    webcam --> canvas
    canvas --> mediapipe
    mediapipe --> rules
    canvas --> opticalflow
    opticalflow --> rules
    rules --> alarm
    alarm --> audio
    alarm --> indexeddb
    alarm --> charts
    rules --> dashboard
```

## 2. 技术描述

- **前端框架**: React@18 + TypeScript + Vite@5
- **样式方案**: TailwindCSS@3 + PostCSS
- **姿态估计**: MediaPipe Pose + @mediapipe/pose
- **机器学习**: TensorFlow.js (@tensorflow/tfjs) + MoveNet 量化模型
- **图表库**: Recharts (React图表组件)
- **状态管理**: Zustand (轻量级状态管理)
- **数据存储**: IndexedDB (本地视频片段存储)
- **音频处理**: Web Audio API (语音警报)
- **视频处理**: Canvas API + MediaRecorder API

## 3. 目录结构

```
src/
├── components/
│   ├── monitor/          # 监控相关组件
│   │   ├── VideoGrid.tsx        # 多视图视频网格
│   │   ├── VideoPlayer.tsx      # 单路视频播放器
│   │   ├── PoseCanvas.tsx       # 姿态绘制Canvas
│   │   └── DetectionOverlay.tsx # 检测结果叠加层
│   ├── dashboard/        # 统计看板
│   │   ├── StatsCards.tsx       # 统计卡片
│   │   ├── TypePieChart.tsx     # 类型分布饼图
│   │   └── HeatmapChart.tsx     # 时段热力图
│   ├── alerts/           # 报警相关
│   │   ├── AlertList.tsx        # 报警事件列表
│   │   └── AlertPlayer.tsx      # 报警视频回放
│   └── common/           # 公共组件
│       ├── StatusBadge.tsx      # 状态徽章
│       └── ControlPanel.tsx     # 控制面板
├── hooks/
│   ├── useCamera.ts       # 摄像头Hook
│   ├── usePoseDetection.ts # 姿态检测Hook
│   ├── useBehaviorAnalysis.ts # 行为分析Hook
│   └── useAlertSystem.ts  # 报警系统Hook
├── services/
│   ├── pose/              # 姿态估计服务
│   │   ├── MediaPipeService.ts
│   │   └── MoveNetService.ts
│   ├── analysis/          # 行为分析服务
│   │   ├── FallDetection.ts
│   │   ├── RetrogradeDetection.ts
│   │   ├── LuggageDetection.ts
│   │   └── JumpDetection.ts
│   ├── storage/           # 存储服务
│   │   ├── IndexedDBService.ts
│   │   └── VideoRecorder.ts
│   └── audio/             # 音频服务
│       └── AlertAudio.ts
├── store/
│   ├── useMonitorStore.ts # 监控状态
│   ├── useAlertStore.ts   # 报警状态
│   └── useSettingsStore.ts # 设置状态
├── types/
│   ├── pose.ts            # 姿态类型定义
│   ├── detection.ts       # 检测类型定义
│   └── alert.ts           # 报警类型定义
├── utils/
│   ├── geometry.ts        # 几何计算工具
│   ├── keypoints.ts       # 关键点处理工具
│   └── opticalFlow.ts     # 光流计算工具
└── App.tsx
```

## 4. 核心类型定义

```typescript
// 关键点类型
interface Keypoint {
  x: number;
  y: number;
  z?: number;
  score: number;
  name: string;
}

// 姿态结果
interface PoseResult {
  keypoints: Keypoint[];
  keypoints3D?: Keypoint[];
  score: number;
}

// 检测结果
interface DetectionResult {
  type: 'fall' | 'retrograde' | 'luggage' | 'jump';
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  timestamp: number;
  personId: string;
}

// 报警事件
interface AlertEvent {
  id: string;
  type: DetectionType;
  timestamp: number;
  confidence: number;
  videoBlobId: string;
  cameraId: string;
  thumbnail: string;
}
```

## 5. 模型量化方案

### 5.1 TensorFlow.js 量化
- 使用 MoveNet Thunder/ Lightning 的 INT8 量化版本
- 模型加载时指定量化后端
- 启用 WebGL 加速或 WebNN 后端

```typescript
import * as tf from '@tensorflow/tfjs';

// 设置量化后端
await tf.setBackend('webgl');
tf.enableProdMode();

// 加载量化模型
const model = await tf.loadGraphModel(
  'https://tfhub.dev/google/lite-model/movenet/singlepose/thunder/tflite/int8/4?lite-format=tflite',
  { fromTFHub: true }
);
```

### 5.2 MediaPipe 优化
- 使用 GPU 加速
- 降低模型复杂度
- 帧采样策略（每2帧处理1帧）

## 6. 行为识别规则

### 6.1 摔倒检测
- 躯干倾角 > 60°
- 头部高度下降 > 身高的 50%
- 持续时间 > 500ms

### 6.2 逆行检测
- 光流方向与扶梯方向相反
- 持续时间 > 1秒
- 水平位移 > 30像素

### 6.3 大件行李检测
- 手部与髋部距离 > 0.8倍身宽
- 双手位置异常偏低

### 6.4 跳跃/奔跑检测
- 垂直速度 > 0.5m/s
- 步频 > 3步/秒
- 膝盖高度异常

## 7. 数据存储设计

### 7.1 IndexedDB Store
```
ObjectStore: alertVideos
  - keyPath: id
  - indexes: timestamp, cameraId, type

ObjectStore: alertEvents
  - keyPath: id
  - indexes: timestamp, type
```
