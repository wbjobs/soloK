# 农作物病害高光谱监测平台

基于高光谱影像的农作物病害检测与监测系统，支持模型可解释性分析和光谱库检索。

## 功能特性

### 光谱预处理
- Savitzky-Golay平滑滤波
- 标准正态变量变换(SNV)
- 一阶/二阶导数光谱
- 基线去除（ALS/多项式拟合）
- 光谱重采样

### 病害检测模型
- 基于一维CNN的光谱分类（5类：健康/条锈病/叶锈病/白粉病/赤霉病）
- 病害严重程度等级回归（1-5级）
- PyTorch深度学习框架

### 模型可解释性
- Grad-CAM显示对分类贡献最大的波段
- 波段重要性排序
- 可视化贡献热力图

### 光谱库检索
- 输入病害光谱特征，匹配已知病害类型
- 支持多种相似度计算方法（光谱角匹配、欧氏距离、余弦相似度、皮尔逊相关系数）
- 内置常见小麦病害光谱模板

### 植被指数计算
- NDVI (归一化植被指数)
- PRI (光化学反射指数)
- PSRI (植物衰老反射指数)
- CCCI (冠层叶绿素含量指数)
- NDRE, GNDVI, SAVI, EVI

### 变化检测
- 历史影像对比（同一田块不同日期）
- 病害扩散方向和速率分析
- 时序植被指数对比

### 变量施肥处方
- 基于病害分布生成变量施肥处方图
- 支持多种肥料类型
- 分级施肥策略

### API接口
- `POST /api/v1/classify` - 上传光谱数据返回分类结果
- `POST /api/v1/prescription` - 生成变量施肥处方图
- `POST /api/v1/grad-cam` - Grad-CAM可解释性分析
- `POST /api/v1/spectral-search` - 光谱库检索
- `POST /api/v1/upload-hypercube` - 上传高光谱数据
- `GET /api/v1/disease-distribution/{id}` - 病害分布热力图
- `POST /api/v1/change-detection` - 变化检测

## 技术栈

### 后端
- Python 3.9+
- FastAPI - Web框架
- PyTorch - 深度学习
- PostgreSQL + PostGIS - 空间数据库
- NumPy, SciPy, Scikit-learn - 科学计算
- Spectral, Rasterio - 高光谱数据处理

### 前端
- React 18
- TypeScript
- Material-UI - UI组件库
- Plotly.js - 光谱可视化
- OpenLayers - 地图组件
- Zustand - 状态管理

## 项目结构

```
k24/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── disease_model.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── spectral.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── spectral_preprocessing.py
│   │   │   ├── grad_cam.py
│   │   │   ├── spectral_library.py
│   │   │   ├── vegetation_indices.py
│   │   │   └── hypercube_handler.py
│   │   ├── database/
│   │   │   ├── __init__.py
│   │   │   ├── models.py
│   │   │   └── database.py
│   │   └── __init__.py
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── SpectrumChart.tsx
    │   │   └── Heatmap.tsx
    │   ├── pages/
    │   │   ├── UploadPage.tsx
    │   │   ├── AnalysisPage.tsx
    │   │   ├── MapPage.tsx
    │   │   ├── LibraryPage.tsx
    │   │   ├── HistoryPage.tsx
    │   │   └── PrescriptionPage.tsx
    │   ├── services/
    │   │   └── api.ts
    │   ├── store/
    │   │   └── useStore.ts
    │   ├── App.tsx
    │   └── index.tsx
    ├── package.json
    └── tsconfig.json
```

## 快速开始

### 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
copy .env.example .env
# 编辑 .env 文件，配置数据库连接

# 启动服务
python main.py
```

API文档地址: http://localhost:8000/docs

### 前端启动

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

前端地址: http://localhost:3000

### 数据库配置

```sql
-- 创建数据库
CREATE DATABASE hyperspectral_db;

-- 启用PostGIS扩展
CREATE EXTENSION postgis;
```

## 使用说明

1. **数据上传**：在「数据上传」页面上传ENVI格式的高光谱数据（.hdr + .dat/.img）
2. **光谱分析**：查看平均光谱曲线，进行病害分类和Grad-CAM可解释性分析
3. **病害分布**：查看病害热力图和植被指数分布图，支持导出GeoJSON
4. **光谱库检索**：输入光谱特征，匹配已知病害类型
5. **历史对比**：选择两个时期的数据，进行变化检测和扩散分析
6. **施肥处方**：基于病害严重程度生成变量施肥处方图

## 支持的病害类型

- 健康 (Healthy)
- 条锈病 (Stripe Rust)
- 叶锈病 (Leaf Rust)
- 白粉病 (Powdery Mildew)
- 赤霉病 (Fusarium Head Blight)

## 数据格式要求

- 格式: ENVI标准格式（.hdr头文件 + .dat/.img数据文件）
- 波段数: 100-200波段
- 波长范围: 400-1000nm
- 空间分辨率: 无人机/卫星影像

## 开发说明

### 训练自定义模型

```python
from app.models.disease_model import DiseaseClassifier
import torch

# 初始化模型
classifier = DiseaseClassifier(num_bands=150, num_classes=5)

# 训练代码...
# ...

# 保存权重
torch.save(classifier.classifier.state_dict(), 'classifier.pth')
torch.save(classifier.severity_regressor.state_dict(), 'regressor.pth')
```

### 扩展光谱库

```python
from app.services.spectral_library import SpectralLibrary

library = SpectralLibrary()
library.add_spectrum(
    spectrum=spectrum_data,
    disease_name='新病害类型',
    severity=3,
    crop_type='小麦',
    description='病害描述'
)
```

## License

MIT License
