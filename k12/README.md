# 卫星通信链路预算与干扰分析平台

基于 Python + FastAPI + NumPy + SciPy + Redis + PostgreSQL 的卫星通信分析平台。

## 功能特性

### 1. 链路预算计算 (POST /api/v1/link_budget)
- 输入：上下行频率、卫星轨道位置、地球站位置、天线直径、发射功率、调制方式
- 输出：EIRP、G/T、自由空间损耗、雨衰、载噪比C/N、链路余量

### 2. 干扰分析 (POST /api/v1/interference)
- 考虑同频干扰（相邻卫星）、邻星干扰、交调干扰
- 基于ITU-R S.1323建议书计算干扰噪声比I/N和载干比C/I
- 返回干扰裕度和是否满足协调门限

### 3. 波束覆盖图生成 (POST /api/v1/beam_coverage)
- 支持抛物面天线和阵列馈电天线模型
- 计算地球表面EIRP等高线
- 返回GeoJSON格式数据

### 4. 频率协调模拟 (POST /api/v1/frequency_coordination)
- 支持最多5个卫星系统同时申请频率
- 计算干扰矩阵
- 推荐最优频率分配方案

### 5. 蒙特卡洛仿真 (POST /api/v1/monte_carlo)
- 考虑大气衰减、指向误差的随机性
- 输出链路可用度曲线

## 技术栈

- **Web框架**: FastAPI 0.109.0
- **科学计算**: NumPy 1.26.3, SciPy 1.11.4
- **缓存**: Redis 5.0.1
- **数据库**: PostgreSQL + SQLAlchemy 2.0.25
- **任务队列**: Celery 5.3.4
- **数据格式**: GeoJSON 3.1.0

## 项目结构

```
k12/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI主应用
│   ├── config.py            # 配置管理
│   ├── database.py          # 数据库连接
│   ├── cache.py             # Redis缓存
│   ├── schemas.py           # Pydantic数据模型
│   ├── routers.py           # API路由
│   ├── workers.py           # Celery异步任务
│   └── core/
│       ├── __init__.py
│       ├── link_budget.py   # 链路预算算法
│       ├── interference.py  # 干扰分析算法
│       ├── beam_coverage.py # 波束覆盖算法
│       ├── frequency_coordination.py # 频率协调
│       └── monte_carlo.py   # 蒙特卡洛仿真
├── requirements.txt
├── .env
├── main.py                  # 启动脚本
└── test_api.py              # API测试脚本
```

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

**前提条件**：
- Redis 服务运行在 localhost:6379
- PostgreSQL 服务运行在 localhost:5432

**启动FastAPI服务**：
```bash
python main.py
```

**启动Celery Worker**（可选，用于异步任务）：
```bash
celery -A app.workers.celery worker --loglevel=info
```

### 3. 访问API文档

打开浏览器访问：http://localhost:8000/docs

## API使用示例

### 链路预算计算

```python
import requests

payload = {
    "uplink_frequency": 14.0,
    "downlink_frequency": 12.0,
    "satellite_orbit": 35786.0,
    "earth_station_lat": 39.9,
    "earth_station_lon": 116.4,
    "antenna_diameter": 3.0,
    "transmit_power": 100.0,
    "modulation": "QPSK"
}

response = requests.post("http://localhost:8000/api/v1/link_budget", json=payload)
print(response.json())
```

### 运行测试

```bash
python test_api.py
```

## 环境变量配置 (.env)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/satellite_db
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
CACHE_TTL=3600
```
