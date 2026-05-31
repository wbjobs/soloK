# 邮政包裹路径追溯系统

## 项目简介

这是一个完整的邮政包裹路径追溯系统，采用前后端分离架构：
- **后端**: Node.js + Express + MySQL + JWT认证
- **前端**: React + React Router + Leaflet地图

## 功能特性

### 后端功能
- ✅ JWT用户认证（管理员/快递员角色）
- ✅ 15位唯一运单号生成（含校验位算法）
- ✅ 包裹创建和管理API
- ✅ 扫描节点录入（到达/出发）
- ✅ 路径追溯API (`/api/tracking/:trackingNumber/trace`)
- ✅ 时效预警（航空4小时/陆运8小时）

### 前端页面
- 🔐 登录页面
- 📋 包裹列表页面
- ➕ 创建包裹页面
- 🗺️ 路径追溯地图页面（Leaflet）

## 快速开始

### 环境要求
- Node.js >= 16
- MySQL >= 5.7

### 1. 数据库初始化

```bash
# 在MySQL中执行初始化脚本
mysql -u root -p < backend/database/init.sql
```

初始化脚本会创建：
- 数据库：`parcel_tracking`
- 测试用户：
  - 管理员: `admin` / `password`
  - 快递员: `courier1` / `password`

### 2. 后端配置

修改 `backend/.env` 文件中的数据库配置：

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=parcel_tracking
```

启动后端服务：

```bash
cd backend
npm install
npm start
```

后端运行在 `http://localhost:3001`

### 3. 前端启动

```bash
cd frontend
npm install
npm start
```

前端运行在 `http://localhost:3000`

## API接口文档

### 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录 |

### 包裹接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/parcels` | 获取包裹列表 | 需要登录 |
| POST | `/api/parcels` | 创建包裹 | 需要登录 |
| GET | `/api/parcels/:trackingNumber` | 获取包裹详情 | 需要登录 |

### 路径追溯接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/tracking/scan` | 扫描节点 | 需要登录 |
| GET | `/api/tracking/:trackingNumber/trace` | 获取完整路径 | 公开 |

#### 路径追溯API响应示例

```json
{
  "tracking_number": "PK12345678901234",
  "shipping_method": "air",
  "status": "in_transit",
  "sender": {...},
  "receiver": {...},
  "trace_path": [
    {
      "id": 1,
      "node_type": "transfer_center",
      "node_name": "北京转运中心",
      "latitude": 39.9042,
      "longitude": 116.4074,
      "arrived_at": "2024-01-01T10:00:00Z",
      "departed_at": "2024-01-01T14:30:00Z",
      "duration_ms": 16200000,
      "is_timeout": true
    }
  ]
}
```

## 运单号规则

- 格式：`PK` + 12位数字 + 1位校验位 = 共15位
- 校验算法：Luhn变体算法
- 示例：`PK28374659012837`

## 时效标准

| 运输方式 | 标准停留时长 |
|---------|------------|
| 航空 | 4小时 |
| 陆运 | 8小时 |

超过标准时长的节点会在地图上标红显示。

## 项目结构

```
k1/
├── backend/
│   ├── config/
│   │   └── db.js              # 数据库配置
│   ├── database/
│   │   └── init.sql           # 数据库初始化脚本
│   ├── middleware/
│   │   └── auth.js            # JWT认证中间件
│   ├── routes/
│   │   ├── auth.js            # 认证路由
│   │   ├── parcels.js         # 包裹管理路由
│   │   └── tracking.js        # 路径追溯路由
│   ├── utils/
│   │   └── trackingGenerator.js  # 运单号生成器
│   ├── server.js              # 主服务入口
│   ├── package.json
│   └── .env                   # 环境变量
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Navbar.js
    │   │   └── ProtectedRoute.js
    │   ├── context/
    │   │   └── AuthContext.js
    │   ├── pages/
    │   │   ├── Login.js
    │   │   ├── ParcelList.js
    │   │   ├── CreateParcel.js
    │   │   └── TraceMap.js
    │   ├── services/
    │   │   └── api.js
    │   ├── App.js
    │   ├── index.js
    │   └── index.css
    └── package.json
```
