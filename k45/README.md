# 代码坏味检测 API

一个基于抽象语法树(AST)和文本相似度检测的代码坏味检测服务，支持Python和JavaScript代码分析。

## 功能特性

### 支持的代码坏味类型

| 坏味类型 | 名称 | 描述 |
|---------|------|------|
| `long_method` | 长方法 | 方法/函数代码行数过多 |
| `duplicate_code` | 重复代码 | 存在相同或高度相似的代码片段 |
| `large_class` | 过大类 | 类代码行数或方法数量过多 |
| `too_many_parameters` | 参数过多 | 方法/函数参数数量过多 |
| `global_data_abuse` | 全局数据滥用 | 过度使用全局变量 |
| `shotgun_surgery` | 霰弹式修改 | 单个方法访问/修改多个不同对象的数据 |
| `feature_envy` | 依恋情结 | 方法过度依赖其他类的功能 |
| `data_clumps` | 数据泥团 | 相同的参数组在多个地方重复出现 |

### 技术栈

- **Web框架**: Flask
- **任务队列**: Celery + Redis
- **数据库**: PostgreSQL
- **AST解析**: Python标准库(ast) + esprima(JavaScript)
- **相似度检测**: difflib + MD5哈希

## 环境要求

- Python 3.8+
- PostgreSQL 12+
- Redis 6+

## 安装配置

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env` 文件并修改配置：

```bash
cp .env.example .env
```

主要配置项：

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/code_smell_detector
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
API_KEYS=api_key_123,api_key_456
RATE_LIMIT=100
RATE_LIMIT_PERIOD=3600
```

### 3. 启动服务

**启动Redis**:
```bash
redis-server
```

**启动PostgreSQL并创建数据库**:
```sql
CREATE DATABASE code_smell_detector;
```

**启动Celery Worker**:
```bash
celery -A tasks.celery worker --loglevel=info -P solo
```

**启动Flask API**:
```bash
python app.py
```

## API 使用文档

### 认证

所有API请求(除健康检查外)需要在请求头中携带API Key：

```
X-API-Key: api_key_123
```

### 接口列表

#### 1. 健康检查

```
GET /api/health
```

**响应示例**:
```json
{
  "status": "healthy",
  "service": "code-smell-detector-api",
  "version": "1.0.0"
}
```

#### 2. 提交分析任务

**上传ZIP文件**:
```
POST /api/analyze
Content-Type: multipart/form-data

file: <zip文件>
```

**GitHub URL**:
```
POST /api/analyze
Content-Type: application/json

{
  "github_url": "https://github.com/username/repo"
}
```

**响应示例**:
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Analysis task has been queued"
}
```

#### 3. 查询任务状态

```
GET /api/tasks/{task_id}
```

**响应示例**:
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "source_type": "github",
  "source": "https://github.com/username/repo",
  "created_at": "2024-01-01T12:00:00Z",
  "completed_at": "2024-01-01T12:01:30Z",
  "total_files": 42,
  "total_smells": 156
}
```

#### 4. 获取分析结果

```
GET /api/tasks/{task_id}/results?page=1&per_page=50&type=long_method&severity=high
```

**查询参数**:
- `page`: 页码(默认1)
- `per_page`: 每页数量(默认50)
- `type`: 按坏味类型过滤
- `severity`: 按严重程度过滤

**响应示例**:
```json
{
  "task": { ... },
  "smells": [
    {
      "id": 1,
      "smell_type": "long_method",
      "file_path": "src/utils.py",
      "language": "python",
      "start_line": 10,
      "end_line": 45,
      "description": "方法 'process_data' 有 36 行代码，超过阈值 20 行",
      "suggestion": "考虑将方法 'process_data' 拆分为多个更小的方法...",
      "severity": "medium",
      "code_snippet": "def process_data(...):\n    ...",
      "metrics": {
        "line_count": 36,
        "threshold": 20
      }
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 50,
    "total_pages": 4,
    "total_items": 156
  }
}
```

#### 5. 获取分析摘要

```
GET /api/tasks/{task_id}/summary
```

**响应示例**:
```json
{
  "task": { ... },
  "by_type": {
    "long_method": 45,
    "duplicate_code": 23,
    "large_class": 12,
    ...
  },
  "by_severity": {
    "high": 34,
    "medium": 89,
    "low": 33
  },
  "by_language": {
    "python": 98,
    "javascript": 58
  },
  "by_file": {
    "src/main.py": 23,
    "src/utils.py": 18,
    ...
  }
}
```

#### 6. 获取支持的坏味类型

```
GET /api/smell-types
```

## 使用示例

### 使用 curl

```bash
# 提交GitHub仓库分析
curl -X POST http://localhost:5000/api/analyze \
  -H "X-API-Key: api_key_123" \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/pallets/flask"}'

# 查询任务状态
curl -H "X-API-Key: api_key_123" \
  http://localhost:5000/api/tasks/{task_id}

# 获取分析结果
curl -H "X-API-Key: api_key_123" \
  http://localhost:5000/api/tasks/{task_id}/results
```

### 使用 Python

```python
import requests

API_KEY = "api_key_123"
BASE_URL = "http://localhost:5000/api"

headers = {"X-API-Key": API_KEY}

# 提交分析任务
response = requests.post(
    f"{BASE_URL}/analyze",
    headers=headers,
    json={"github_url": "https://github.com/username/repo"}
)
task_id = response.json()["task_id"]

# 获取结果
response = requests.get(
    f"{BASE_URL}/tasks/{task_id}/results",
    headers=headers
)
results = response.json()
```

## 项目结构

```
.
├── app.py                 # Flask主应用
├── config.py              # 配置文件
├── models.py              # 数据库模型
├── tasks.py               # Celery任务
├── celery_app.py          # Celery配置
├── analyzer.py            # 代码分析器主模块
├── repo_handler.py        # 仓库处理器
├── detectors/
│   ├── __init__.py
│   ├── python_detector.py     # Python AST检测器
│   ├── javascript_detector.py # JavaScript AST检测器
│   └── duplicate_detector.py  # 重复代码检测器
├── requirements.txt       # 依赖列表
├── .env                   # 环境变量
└── README.md              # 文档
```

## 检测阈值配置

可在各检测器文件中调整检测阈值：

**Python检测器** (`detectors/python_detector.py`):
- 长方法: > 20行
- 过大类: > 150行 或 > 15个方法
- 参数过多: > 5个参数

**JavaScript检测器** (`detectors/javascript_detector.py`):
- 长方法: > 25行
- 过大类: > 150行 或 > 15个方法
- 参数过多: > 5个参数

**重复代码检测器** (`detectors/duplicate_detector.py`):
- 最小代码块: 5行
- 相似度阈值: 85%

## License

MIT
