# 自动扶梯异常行为检测系统

基于浏览器的纯前端边缘计算AI异常检测系统，使用React + MediaPipe + TensorFlow.js技术栈。

## 功能特性

### 🎥 实时监控
- 支持最多4路摄像头视频流
- 2x2网格布局，支持双击全屏
- 实时FPS和延迟显示
- 扶梯方向配置（上行/下行/左行/右行）

### 🧍 姿态估计
- **MediaPipe Pose** - 高精度人体姿态识别
- 33个人体关键点检测
- 实时骨架可视化
- 关键点置信度过滤

### 🚨 异常行为检测
1. **摔倒检测**
   - 躯干倾角 > 60°
   - 头部高度下降 > 身高50%
   - 可调节阈值参数

2. **逆行检测**
   - 光流法计算运动方向
   - 持续时间 > 1秒触发报警
   - 与扶梯方向自动比对

3. **大件行李检测**
   - 手部与髋部距离 > 0.8倍身宽
   - 双手位置异常分析

4. **跳跃/奔跑检测**
   - 垂直速度阈值检测
   - 步频分析（>3步/秒）
   - 膝盖高度异常检测

### 🔔 报警系统
- 实时画面边框标注
- 行为类型和置信度显示
- Web Audio API语音警报
- 中文语音提示
- IndexedDB本地存储报警记录
- 报警视频片段存储（前后5秒）

### 📊 统计看板
- 今日异常总数统计
- 各类型分布饼图
- 高峰时段热力图
- 最近报警列表
- 数据实时更新

### 🔒 隐私保护
- 人脸区域高斯模糊
- 纯前端处理，不上传视频数据
- 本地IndexedDB存储
- 可开关的隐私保护选项

### ⚙️ 系统设置
- 摄像头启用/禁用
- 扶梯方向配置
- 检测阈值调节
- 报警音量控制
- 语音报警开关
- 人脸模糊开关

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **样式方案**: TailwindCSS 3
- **姿态估计**: MediaPipe Pose
- **机器学习**: TensorFlow.js
- **状态管理**: Zustand
- **图表库**: Recharts
- **数据存储**: IndexedDB
- **音频处理**: Web Audio API + SpeechSynthesis

## 项目结构

```
src/
├── components/
│   ├── monitor/
│   │   ├── VideoGrid.tsx        # 多视图视频网格
│   │   └── VideoPlayer.tsx      # 单路视频播放器
│   ├── dashboard/
│   │   └── Dashboard.tsx        # 统计看板
│   ├── alerts/
│   │   └── AlertList.tsx        # 报警记录列表
│   ├── settings/
│   │   └── SettingsPanel.tsx    # 设置面板
│   └── common/
│       └── Sidebar.tsx          # 侧边导航
├── hooks/
│   ├── useCamera.ts             # 摄像头Hook
│   └── usePoseDetection.ts      # 姿态检测Hook
├── services/
│   ├── MediaPipeService.ts      # MediaPipe服务
│   ├── BehaviorAnalyzer.ts      # 行为分析器
│   ├── AlertAudio.ts            # 音频报警
│   ├── IndexedDBService.ts      # 数据库服务
│   └── VideoRecorder.ts         # 视频录制
├── store/
│   └── useAppStore.ts           # 全局状态
├── types/
│   └── index.ts                 # 类型定义
├── utils/
│   ├── geometry.ts              # 几何计算工具
│   └── opticalFlow.ts           # 光流计算
├── App.tsx
├── main.tsx
└── index.css
```

## 快速开始

### 安装依赖
```bash
npm install
```

### 开发模式
```bash
npm run dev
```
访问 http://localhost:3000

### 构建生产版本
```bash
npm run build
```

### 预览生产版本
```bash
npm run preview
```

## 使用说明

1. **首次使用**
   - 打开页面后，浏览器会请求摄像头权限
   - 点击"允许"以启用摄像头功能
   - 系统会自动加载MediaPipe模型

2. **监控视图**
   - 默认启用1号摄像头
   - 双击视频可全屏显示
   - 左下角显示FPS和处理延迟
   - 右下角显示扶梯运行方向

3. **检测配置**
   - 进入"系统设置"页面
   - 可启用/禁用各摄像头
   - 设置扶梯运行方向
   - 调节各项检测阈值

4. **查看统计**
   - 进入"统计看板"页面
   - 查看今日异常总数
   - 分析异常类型分布
   - 识别高峰时段

5. **报警记录**
   - 进入"报警记录"页面
   - 查看历史报警列表
   - 点击可播放报警视频
   - 支持清空记录

## 边缘计算特性

✅ **纯前端处理** - 所有计算在浏览器完成  
✅ **零数据上传** - 视频数据不离开用户设备  
✅ **模型加速** - WebGL GPU加速  
✅ **本地存储** - IndexedDB持久化存储  
✅ **隐私保护** - 人脸模糊处理  

## 性能优化

- MediaPipe GPU加速
- WebGL后端渲染
- 帧采样优化
- 骨架点平滑插值
- 懒加载模型资源

## 浏览器兼容性

- Chrome 90+ ✅
- Edge 90+ ✅
- Firefox 88+ ✅ (部分功能)
- Safari 14+ ✅ (部分功能)

**推荐使用最新版Chrome浏览器以获得最佳体验**

## 注意事项

1. **摄像头权限**：必须授予摄像头访问权限才能使用
2. **HTTPS要求**：生产环境必须使用HTTPS
3. **性能影响**：多路同时检测可能占用较高CPU/GPU
4. **模型加载**：首次使用需要下载MediaPipe模型（约10MB）

## License

MIT License
