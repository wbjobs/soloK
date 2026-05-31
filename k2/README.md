# 古籍刻本异体字OCR后矫正API服务

基于Python+FastAPI+PostgreSQL+Redis的古籍刻本异体字OCR后矫正服务。

## 功能特性

- 接收OCR引擎输出的古籍文本（含错误识别），返回矫正后的标准繁体字文本
- 异体字映射库（康熙字典体、俗体、简笔变体→标准繁体），收录7000+组映射
- 上下文矫正算法：根据相邻字序列判断（如"於""于"混用时依据清代刻书习惯纠正）
- 批量矫正接口：支持一次提交最多100篇文章，使用Celery异步任务队列
- 矫正历史可追溯：每次矫正记录存入数据库
- 基于Redis的限流（每IP每分钟30次请求）
- 动态学习更新接口：支持添加罕见异体字

## 技术栈

- **Web框架**: FastAPI
- **数据库**: PostgreSQL
- **缓存/队列**: Redis + Celery
- **ORM**: SQLAlchemy

## 安装配置

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

配置项说明：
- `DATABASE_URL`: PostgreSQL连接字符串
- `REDIS_URL`: Redis连接字符串
- `CELERY_BROKER_URL`: Celery消息队列URL
- `CELERY_RESULT_BACKEND`: Celery结果后端URL
- `RATE_LIMIT_PER_MINUTE`: 每分钟请求限制
- `PORT`: 服务端口

### 3. 初始化数据库

```bash
python init_db.py
```

## 启动服务

### 启动API服务

```bash
python run.py
```

服务将在 `http://localhost:8000` 启动。

### 启动Celery Worker

```bash
python run_celery.py
```

## API接口

### POST /correct - 单篇文本矫正

**请求**:
```json
{
    "text": "OCR原始文本",
    "book_id": "Siku_001"
}
```

**响应**:
```json
{
    "corrected_text": "矫正后的文本",
    "changes": [
        {"position": 5, "from": "変", "to": "變"}
    ],
    "task_id": "任务ID"
}
```

### POST /batch_correct - 批量文本矫正

**请求**:
```json
{
    "articles": [
        {"text": "文本1", "book_id": "book1"},
        {"text": "文本2", "book_id": "book2"}
    ]
}
```

**响应**:
```json
{
    "task_id": "批量任务ID",
    "status": "pending",
    "message": "批量矫正任务已提交，共2篇文章"
}
```

### GET /history/{task_id} - 查询矫正历史

**响应**:
```json
{
    "task_id": "任务ID",
    "book_id": "书籍ID",
    "original_text": "原始文本",
    "corrected_text": "矫正后文本",
    "changes": [...],
    "created_at": "2024-01-01T00:00:00"
}
```

### GET /batch_history/{task_id} - 查询批量矫正历史

**响应**:
```json
{
    "task_id": "批量任务ID",
    "status": "completed",
    "total_count": 100,
    "success_count": 98,
    "failed_count": 2,
    "results": [...],
    "created_at": "2024-01-01T00:00:00",
    "completed_at": "2024-01-01T00:01:00"
}
```

### POST /add_variant - 添加异体字映射

**请求**:
```json
{
    "variant": "异体字",
    "standard": "标准繁体字",
    "variant_type": "康熙字典体",
    "source": "用户提交"
}
```

**响应**:
```json
{
    "success": true,
    "message": "异体字映射已添加/更新",
    "variant": "异体字",
    "standard": "标准繁体字"
}
```

### GET /stats - 获取系统统计信息

**响应**:
```json
{
    "variant_mappings": 7000,
    "total_corrections": 100,
    "total_batch_tasks": 10
}
```

## 项目结构

```
k2/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI应用入口
│   ├── config.py         # 配置管理
│   ├── database.py       # 数据库连接
│   ├── redis_client.py   # Redis客户端
│   ├── celery_app.py     # Celery配置
│   ├── celery_tasks.py   # Celery任务
│   ├── models.py         # 数据库模型
│   ├── schemas.py        # Pydantic模型
│   ├── corrector.py      # 矫正算法
│   ├── variant_data.py   # 异体字数据
│   ├── rate_limiter.py   # 限流中间件
│   └── routes.py         # API路由
├── init_db.py            # 数据库初始化脚本
├── run.py                # 启动脚本
├── run_celery.py         # Celery启动脚本
├── requirements.txt      # 依赖列表
└── .env.example          # 环境变量示例
```

## 矫正算法说明

### 异体字替换
- 基于内置异体字映射库，包含康熙字典体、俗体、简笔变体等类型
- 支持动态添加新的异体字映射

### 上下文矫正
- 根据相邻字序列判断，如"於""于"混用时依据清代刻书习惯纠正
- 包含多个上下文规则：于/於、才/纔、以/已等

## 限流策略

- 基于Redis实现滑动窗口限流
- 默认每IP每分钟最多30次请求
- 响应头包含限流信息：
  - `X-RateLimit-Limit`: 每分钟最大请求数
  - `X-RateLimit-Remaining`: 剩余请求数
