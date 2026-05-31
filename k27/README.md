# 异步电机故障诊断系统

基于 React + ECharts + Python + FastAPI + TensorFlow + InfluxDB 的异步电机故障诊断系统。

## 功能特性

### 数据采集
- 振动传感器数据（加速度计，XYZ三轴，采样率20kHz）
- 电流信号（三相电流，采样率10kHz）
- 温度数据（轴承、绕组）

### 信号处理
- **振动包络解调**：提取轴承故障特征频率（BPFI、BPFO、BSF、FTF）
- **电流特征分析**：希尔伯特变换提取转子断条特征
- **阶次跟踪**：变速工况下重采样至角域

### 故障分类（ResNet-1D）
- 轴承故障（内圈/外圈/滚动体/保持架）
- 转子故障（断条/偏心）
- 定子故障（匝间短路）
- 不对中/不平衡

### 高级功能
- 故障程度量化：输出严重程度指数（0-100%）
- 趋势预测：基于LSTM预测未来7天的特征量变化趋势
- 诊断报告PDF：含频谱图、特征频率标注、维护建议
- 实时报警阈值自适应（基于统计过程控制SPC）
- 频谱图自动标注故障特征频率（理论计算±容差带）

## 项目结构

```
k27/
├── backend/                    # 后端服务
│   ├── app/
│   │   ├── api/                # API接口
│   │   ├── core/               # 核心配置、数据库
│   │   ├── ml/                 # 机器学习模型
│   │   ├── services/           # 业务服务
│   │   └── signal_processing/  # 信号处理算法
│   ├── requirements.txt
│   └── main.py
├── frontend/                   # 前端应用
│   ├── src/
│   │   ├── components/         # 可视化组件
│   │   ├── pages/              # 页面组件
│   │   └── services/           # API服务
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 快速开始

### 后端启动

```bash
cd backend

# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

后端服务将在 http://localhost:8000 启动

API文档：http://localhost:8000/docs

### 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务将在 http://localhost:3000 启动

## API接口

### 数据采集
- `POST /api/v1/data/vibration` - 接收振动数据
- `POST /api/v1/data/current` - 接收电流数据
- `POST /api/v1/data/temperature` - 接收温度数据

### 故障诊断
- `POST /api/v1/diagnose` - 执行故障诊断
- `POST /api/v1/predict-trend` - 趋势预测

### 报告管理
- `POST /api/v1/report/generate` - 生成诊断报告
- `GET /api/v1/report/download/{filename}` - 下载报告

### 系统配置
- `GET /api/v1/thresholds` - 获取自适应阈值
- `POST /api/v1/thresholds/update` - 更新阈值
- `GET /api/v1/fault-frequencies` - 获取故障特征频率

## 技术栈

### 后端
- **FastAPI**: 高性能Web框架
- **TensorFlow**: 深度学习框架
- **InfluxDB**: 时序数据库
- **NumPy/SciPy**: 数值计算
- **PyWavelets**: 小波变换
- **ReportLab**: PDF生成

### 前端
- **React**: UI框架
- **ECharts**: 图表库
- **Ant Design**: UI组件库
- **Vite**: 构建工具

## 故障特征频率

### 轴承故障频率
- **BPFI** (内圈故障): n/2 × f_r × (1 + d/D × cosβ)
- **BPFO** (外圈故障): n/2 × f_r × (1 - d/D × cosβ)
- **BSF** (滚动体故障): D/(2d) × f_r × (1 - (d/D)² × cos²β)
- **FTF** (保持架故障): 1/2 × f_r × (1 - d/D × cosβ)

### 转子故障频率
- 转差频率: f_s × s
- 边带频率: f_s × (1 ± 2ks)

## 许可证

MIT License
