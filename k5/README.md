# 方言语音合成标注平台

一个专业的方言语音标注平台，支持多语言方言的语音标注、质量控制和数据集导出。

## 技术栈

- **前端**: Vue 3 + TypeScript + Element Plus + Pinia + Vite
- **后端**: Django 5 + Django REST Framework
- **数据库**: PostgreSQL
- **缓存**: Redis
- **对象存储**: MinIO
- **语音处理**: librosa, soundfile, praatio

## 功能特性

### 管理员功能
- 上传方言语音片段（WAV格式，5-15秒）
- 系统自动切分音素边界并生成初始标注
- 管理方言片区、标注员、标注任务
- 标注进度看板（饼图展示各标注员任务完成率）
- 标注员工作量排行榜
- 数据集导出（JSON + TextGrid格式）
- 质量控制与一致性检查

### 标注员功能
- Web端收听语音
- 可视化波形图 + 频谱图
- 校正音素时间轴
- 标注声调（支持粤语9声调等）
- 拼音/国际音标(IPA)双模式显示
- 质量协商功能

### 质量控制
- 两个标注员独立标注同一语音
- 系统计算标注一致性（Kappa系数）
- 不一致处标红协商

### API接口
- `GET /api/dataset/{dataset_id}/export` - 返回标注数据包下载链接

## 项目结构

```
k5/
├── backend/                 # Django后端
│   ├── apps/
│   │   ├── accounts/       # 用户管理
│   │   ├── dialects/       # 方言片区管理
│   │   ├── audio/          # 语音片段管理
│   │   ├── annotations/    # 标注管理
│   │   ├── quality/        # 质量控制
│   │   ├── datasets/       # 数据集管理
│   │   └── stats/          # 统计看板
│   ├── core/               # 核心配置
│   └── utils/              # 工具函数
├── frontend/               # Vue3前端
│   ├── src/
│   │   ├── api/            # API接口
│   │   ├── components/     # 通用组件
│   │   ├── views/          # 页面视图
│   │   ├── store/          # Pinia状态管理
│   │   ├── router/         # 路由配置
│   │   └── utils/          # 工具函数
└── docker/                 # Docker配置
```

## 快速开始

### 后端启动

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### 前端启动

```bash
cd frontend
npm install
npm run dev
```

## 许可证

MIT License
