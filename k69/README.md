# 地震波形监测系统

一个完整的地震波形数据监测系统，包含后端数据存储、异常检测API和前端可视化界面。

## 功能特性

### 后端 (Python + InfluxDB)
- **数据生成**: 模拟真实地震波形数据，每分钟10000个数据点，可持续1个月
- **数据存储**: 使用InfluxDB高效存储时序数据
- **异常检测**: 基于STL分解 + 3-sigma算法进行异常检测
- **API服务**: FastAPI提供RESTful API，支持数据查询、异常检测、统计和CSV导出

### 前端 (Vue + ECharts)
- **波形可视化**: 使用ECharts展示地震波形数据
- **可拖拽时间轴**: 支持dataZoom组件拖拽浏览数据
- **异常标记**: 异常点用红色标记显示
- **数据导出**: 支持将异常片段导出为CSV文件
- **每日统计**: 展示每日异常数量统计图表

## 项目结构

```
k69/
├── backend/                 # 后端服务
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py      # InfluxDB数据管理
│   │   ├── data_generator.py # 地震波形数据生成器
│   │   ├── detector.py      # STL+3-sigma异常检测
│   │   └── main.py          # FastAPI主服务
│   ├── import_data.py       # 数据导入脚本
│   ├── requirements.txt     # Python依赖
│   └── .env                 # 环境变量配置
├── frontend/                # 前端应用
│   ├── src/
│   │   ├── components/
│   │   │   ├── WaveformChart.vue  # 波形图表组件
│   │   │   └── StatsPanel.vue     # 统计面板组件
│   │   ├── App.vue          # 主应用组件
│   │   └── main.js          # 入口文件
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   └── vue.config.js
├── docker-compose.yml       # InfluxDB Docker配置
└── README.md
```

## 快速开始

### 1. 启动InfluxDB

使用Docker Compose启动InfluxDB：

```bash
docker-compose up -d
```

InfluxDB Web UI: http://localhost:8086
- 用户名: admin
- 密码: admin123456
- 组织: seismic-org
- 令牌: seismic-monitor-token

### 2. 安装后端依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 导入模拟数据

生成并导入7天的模拟数据（可调整天数）：

```bash
python import_data.py 7
```

### 4. 启动后端服务

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API文档: http://localhost:8000/docs

### 5. 安装前端依赖

```bash
cd frontend
npm install
```

### 6. 启动前端开发服务器

```bash
npm run serve
```

访问: http://localhost:8080

## API接口说明

### 健康检查
```
GET /api/health
```

### 查询波形数据
```
GET /api/seismic/data?start_time={start}&end_time={end}&with_detection={true/false}
```

### 异常检测
```
GET /api/seismic/detect?start_time={start}&end_time={end}&sigma_threshold=3.0
```

### 每日异常统计
```
GET /api/seismic/stats/daily?start_time={start}&end_time={end}
```

### 导出CSV
```
GET /api/seismic/export/csv?start_time={start}&end_time={end}&anomalies_only={true/false}
GET /api/seismic/export/segments/csv?start_time={start}&end_time={end}
```

## 异常检测算法

系统使用STL（Seasonal and Trend decomposition using Loess）分解结合3-sigma原则进行异常检测：

1. **STL分解**: 将时间序列分解为趋势项、季节项和残差项
2. **3-sigma检测**: 对残差项计算均值和标准差，超出±3σ范围的数据点标记为异常
3. **异常片段聚合**: 将时间接近的异常点聚合为异常片段

## 技术栈

### 后端
- FastAPI 0.109+
- InfluxDB 2.7
- Pandas 2.1+
- Statsmodels 0.14+ (STL分解)
- NumPy, SciPy

### 前端
- Vue 3.4+
- ECharts 5.4+
- Element Plus 2.5+
- Axios

## 性能说明

- 数据采样率: 10000点/分钟 ≈ 167点/秒
- 1个月数据量: 约43.2亿个数据点
- 前端显示时自动降采样，最多显示5000个点以保证性能

## 注意事项

1. 确保Docker已安装并运行
2. 首次运行需要先生成并导入数据
3. 大数据量查询时建议缩小时间范围
4. InfluxDB默认配置适合开发环境，生产环境请调整配置
