# 知识图谱协作编辑器

支持多人实时协作的知识图谱可视化编辑平台，基于 WebRTC P2P 通信实现低延迟同步，采用 CRDT 数据结构自动解决并发冲突。

## 项目简介

知识图谱协作编辑器是一个面向团队的知识管理工具，支持多人同时在线编辑和查看知识图谱。通过 P2P 通信实现低延迟的数据同步，结合 CRDT 技术确保并发操作的一致性，适用于团队知识管理、思维导图、概念图谱、领域知识建模等场景。

### 核心特性

- **实时协作**：多人同时编辑，操作毫秒级同步
- **P2P 通信**：WebRTC DataChannel 直连，减少服务器带宽压力
- **冲突自动解决**：Yjs CRDT 算法，无需手动处理冲突
- **操作回放**：完整的操作历史，支持时间轴回放
- **快照管理**：随时保存和恢复图谱状态
- **高性能渲染**：Canvas 2D 引擎，支持上千节点流畅渲染
- **数据持久化**：PostgreSQL JSONB 存储，高效查询

## 技术栈

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 6.x | 构建工具 |
| TailwindCSS | 3.x | 样式框架 |
| Zustand | 5.x | 状态管理 |
| Yjs | 13.x | CRDT 冲突解决 |
| simple-peer | 9.x | WebRTC 封装 |
| Canvas 2D | - | 图形渲染 |
| Lucide React | 1.x | 图标库 |

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 20.x | 运行时 |
| Express | 5.x | Web 框架 |
| TypeScript | 6.x | 类型安全 |
| Prisma | 5.x | ORM |
| PostgreSQL | 15 | 数据库 |
| ws | 8.x | WebSocket |
| jsonwebtoken | 9.x | 认证 |

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端 (React)                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐  │
│  │  UI 层   │──│ Canvas   │──│ CRDT     │──│ WebRTC          │  │
│  │ (React)  │  │ 渲染引擎  │  │ (Yjs)   │  │ DataChannel     │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┬────────┘  │
│                                                     │ P2P        │
└─────────────────────────────────────────────────────┼───────────┘
                                                      │
┌─────────────────────────────────────────────────────┼───────────┐
│                        服务端                        │           │
│  ┌─────────────────┐  ┌──────────────────────────┐  │           │
│  │ WebSocket 信令  │──│   REST API 服务          │  │           │
│  │   服务器        │  │ (房间/快照/操作日志)     │  │           │
│  └────────┬────────┘  └──────────┬───────────────┘  │           │
│           │                      │                  │           │
│           └──────────────────────┼──────────────────┘           │
│                                  │                              │
│                           ┌──────▼──────┐                       │
│                           │   Prisma    │                       │
│                           └──────┬──────┘                       │
└──────────────────────────────────┼──────────────────────────────┘
                                   │
                           ┌───────▼───────┐
                           │  PostgreSQL   │
                           │  JSONB + 索引 │
                           └───────────────┘
```

## 快速开始

### 环境要求

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker >= 24.0.0（用于启动 PostgreSQL）
- PostgreSQL >= 15（如不使用 Docker）

### 一键启动

```bash
# 1. 克隆项目
git clone <repository-url>
cd k53

# 2. 安装所有依赖
npm run install:all

# 3. 复制环境变量
cp .env.example .env

# 4. 启动数据库（需要 Docker）
docker-compose up -d

# 5. 初始化数据库
cd server
npm run prisma:migrate:dev

# 6. 返回根目录，启动前后端
cd ..
npm run dev
```

### 手动启动

```bash
# 安装根目录依赖
npm install

# 安装服务端依赖
cd server
npm install
npm run prisma:generate
npm run prisma:migrate:dev

# 安装客户端依赖
cd ../client
npm install

# 启动服务端（新终端）
cd ../server
npm run dev

# 启动客户端（新终端）
cd ../client
npm run dev
```

### 访问地址

- 前端应用: http://localhost:5173
- 后端 API: http://localhost:3001/api
- WebSocket: ws://localhost:3001
- Prisma Studio: http://localhost:5555 (运行 `cd server && npm run prisma:studio`)

## 数据库配置

### 使用 Docker（推荐）

项目已包含 `docker-compose.yml`，一键启动 PostgreSQL 15：

```bash
# 启动数据库
docker-compose up -d

# 查看数据库状态
docker-compose ps

# 停止数据库
docker-compose down

# 停止并删除数据卷（慎用）
docker-compose down -v
```

数据库连接信息（与 `.env.example` 一致）：
- 主机: localhost
- 端口: 5432
- 数据库: knowledge_graph
- 用户名: postgres
- 密码: postgres

### 手动配置

如不使用 Docker，需自行安装 PostgreSQL 15 并创建数据库：

```sql
-- 创建数据库
CREATE DATABASE knowledge_graph;

-- 创建用户（可选）
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE knowledge_graph TO postgres;
```

### Prisma 数据库操作

```bash
# 生成 Prisma Client
cd server
npm run prisma:generate

# 开发环境迁移
npm run prisma:migrate:dev

# 生产环境迁移
npm run prisma:migrate:deploy

# 查看数据库
npm run prisma:studio
```

## API 文档

### 认证说明

除创建和加入房间外，所有 API 请求需在 Header 中携带 JWT Token：
```
Authorization: Bearer <token>
```

### 房间管理 API

#### 创建房间
```http
POST /api/rooms
Content-Type: application/json

{
  "name": "我的知识图谱",
  "password": "optional-password",
  "userId": "user-123",
  "userName": "张三"
}
```

响应：
```json
{
  "roomId": "uuid-string",
  "token": "jwt-token",
  "room": {
    "id": "uuid-string",
    "name": "我的知识图谱",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 加入房间
```http
POST /api/rooms/:roomId/join
Content-Type: application/json

{
  "userId": "user-456",
  "userName": "李四",
  "password": "optional-password"
}
```

#### 获取房间列表
```http
GET /api/rooms
```

#### 获取房间信息
```http
GET /api/rooms/:roomId
Authorization: Bearer <token>
```

### 快照 API

#### 创建快照
```http
POST /api/rooms/:roomId/snapshots
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "v1.0 初始版本",
  "description": "完成基础框架搭建"
}
```

#### 获取快照列表
```http
GET /api/rooms/:roomId/snapshots
Authorization: Bearer <token>
```

#### 获取快照详情
```http
GET /api/snapshots/:snapshotId
Authorization: Bearer <token>
```

#### 恢复快照
```http
POST /api/snapshots/:snapshotId/restore
Authorization: Bearer <token>
```

#### 导出快照
```http
GET /api/snapshots/:snapshotId/export
Authorization: Bearer <token>
```

### 操作日志 API

#### 获取操作日志
```http
GET /api/rooms/:roomId/operations?limit=100&offset=0
Authorization: Bearer <token>
```

查询参数：
- `from`: 开始时间戳（毫秒）
- `to`: 结束时间戳（毫秒）
- `limit`: 返回数量，默认 100
- `offset`: 偏移量，默认 0

#### 回放操作
```http
POST /api/rooms/:roomId/replay
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromTime": 1704067200000,
  "toTime": 1704153600000
}
```

## 架构说明

### 目录结构

```
k53/
├── client/                      # 前端应用
│   ├── src/
│   │   ├── components/          # React 组件
│   │   │   └── editor/         # 编辑器组件（Canvas, Toolbar等）
│   │   ├── hooks/              # 自定义 Hooks
│   │   │   ├── useCanvas.ts
│   │   │   ├── useCRDT.ts
│   │   │   ├── useWebRTC.ts
│   │   │   └── useWebSocket.ts
│   │   ├── store/              # Zustand 状态管理
│   │   ├── crdt/               # Yjs CRDT 封装
│   │   ├── webrtc/             # WebRTC 连接管理
│   │   ├── canvas/             # Canvas 渲染引擎
│   │   │   ├── Renderer.ts
│   │   │   ├── Node.ts
│   │   │   ├── Edge.ts
│   │   │   └── Viewport.ts
│   │   └── types/              # TypeScript 类型定义
│   └── package.json
│
├── server/                      # 后端服务
│   ├── src/
│   │   ├── controllers/        # API 控制层
│   │   ├── services/           # 业务逻辑层
│   │   ├── repositories/       # 数据访问层
│   │   ├── signaling/          # WebSocket 信令服务器
│   │   │   ├── SignalingServer.ts
│   │   │   └── WebSocketManager.ts
│   │   ├── middleware/         # Express 中间件
│   │   ├── prisma/             # Prisma 配置和迁移
│   │   │   └── schema.prisma
│   │   ├── config/             # 配置
│   │   ├── app.ts              # Express 应用
│   │   └── server.ts           # 服务入口
│   └── package.json
│
├── package.json                # 根目录配置
├── docker-compose.yml          # 数据库 Docker 配置
├── .env.example                # 环境变量示例
└── .gitignore
```

### 核心模块说明

#### 1. Canvas 渲染引擎 (`client/src/canvas/`)

- **Renderer.ts**: 主渲染器，负责分层渲染、脏矩形优化
- **Node.ts**: 节点绘制和交互检测
- **Edge.ts**: 边绘制（贝塞尔曲线）和交互
- **Viewport.ts**: 视口管理（缩放、平移、坐标转换）

优化策略：
- 视口裁剪：只渲染可见区域
- 分层渲染：背景 → 边 → 节点 → 选中 → UI
- 脏矩形：只重绘变化区域
- requestAnimationFrame：与浏览器刷新同步

#### 2. CRDT 同步机制 (`client/src/crdt/`)

使用 Yjs 实现自动冲突解决：
- 每个客户端维护独立的 Yjs Doc 实例
- 本地操作编码为 Uint8Array，通过 WebRTC 广播
- 接收方自动应用更新，Yjs 内部解决冲突
- 基于逻辑时钟和 Lamport 时间戳保证一致性

冲突解决原则：
- 因果一致性：操作按因果顺序应用
- 并发操作：最后写入者获胜
- 删除操作：墓碑标记，避免复活

#### 3. WebRTC P2P 连接 (`client/src/webrtc/`)

连接建立流程：
1. 客户端通过 WebSocket 连接信令服务器
2. 信令服务器转发 SDP offer/answer 和 ICE candidate
3. 建立 P2P DataChannel 连接
4. 直接通过 DataChannel 传输 CRDT 更新

优点：
- 低延迟：直连无需服务器转发
- 高可用：P2P 网状拓扑，单节点掉线不影响其他
- 省带宽：服务器只需处理信令，无需转发业务数据

#### 4. 信令服务器 (`server/src/signaling/`)

- **SignalingServer.ts**: WebSocket 信令处理
- **WebSocketManager.ts**: 连接和房间管理

负责：
- WebSocket 连接维护
- 房间成员管理
- 信令消息转发（offer/answer/ICE）
- 成员上下线通知

#### 5. 三层架构（服务端）

```
controllers (API 层)
    ↓
services (业务逻辑层)
    ↓
repositories (数据访问层)
    ↓
Prisma ORM
    ↓
PostgreSQL
```

- **Controllers**: 处理 HTTP 请求，参数校验，响应格式化
- **Services**: 核心业务逻辑，事务管理
- **Repositories**: 数据访问封装，与 ORM 交互

### 数据模型

#### 核心表结构

**rooms 表** - 房间信息
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| name | String | 房间名称 |
| passwordHash | String? | 密码哈希 |
| createdBy | String | 创建者用户ID |
| currentState | JSONB | 当前图谱状态 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

**snapshots 表** - 图谱快照
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| roomId | UUID | 外键关联 rooms |
| name | String | 快照名称 |
| description | String? | 快照描述 |
| graphData | JSONB | 图谱全量数据 |
| operationCount | Int | 包含的操作数 |
| createdBy | String | 创建者用户ID |
| createdAt | DateTime | 创建时间 |

**operations 表** - 操作日志
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| roomId | UUID | 外键关联 rooms |
| memberId | UUID | 外键关联 members |
| operationType | String | 操作类型 |
| crdtData | JSONB | CRDT 操作数据 |
| version | Int | 版本号 |
| createdAt | DateTime | 操作时间 |

**members 表** - 房间成员
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| roomId | UUID | 外键关联 rooms |
| userId | String | 用户ID |
| userName | String | 用户昵称 |
| color | String | 用户标识颜色 |
| isOnline | Boolean | 是否在线 |
| joinedAt | DateTime | 加入时间 |
| lastActiveAt | DateTime | 最后活跃时间 |

## 项目脚本

```bash
# 同时启动前后端（开发模式）
npm run dev

# 仅启动后端
npm run dev:server

# 仅启动前端
npm run dev:client

# 构建前后端
npm run build

# 构建后端
npm run build:server

# 构建前端
npm run build:client

# 生产环境启动后端
npm start

# 一键安装所有依赖
npm run install:all
```

## 常见问题

### Q: WebRTC 连接失败怎么办？
A: 请检查：
1. 防火墙是否阻止 UDP 连接
2. 是否在同一局域网内（公网需要 STUN/TURN 服务器）
3. 浏览器是否允许摄像头/麦克风权限（虽不需要，但会影响 WebRTC 初始化）

### Q: 数据库连接失败？
A: 请检查：
1. PostgreSQL 是否已启动
2. `.env` 中的 `DATABASE_URL` 是否正确
3. 数据库 `knowledge_graph` 是否已创建

### Q: 如何重置数据库？
A: 
```bash
cd server
# 删除所有数据并重新运行迁移
npm run prisma:migrate:reset
# 或者手动删除 docker 卷
docker-compose down -v
docker-compose up -d
npm run prisma:migrate:dev
```

## License

ISC
