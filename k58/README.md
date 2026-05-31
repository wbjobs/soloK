# 分布式ID生成器服务

基于 Go + gRPC + Etcd 实现的分布式ID生成器服务，支持三种生成模式。

## 功能特性

- **三种生成模式**
  - 雪花算法（Snowflake）：兼容Twitter Snowflake，worker ID自动注册到Etcd
  - 数据库号段模式（Segment）：MySQL批量分配
  - 纯随机UUID（UUID v4）

- **批量获取**：支持批量获取ID，最多1000个/次
- **健康检查**：内置健康检查gRPC接口
- **优雅停机**：支持信号驱动的优雅停机
- **Prometheus指标**
  - ID生成耗时
  - QPS（请求量统计）
  - Worker冲突次数
- **配置热重载**：通过Etcd watch实现配置实时更新

## 项目结构

```
.
├── api/
│   └── proto/
│       ├── idgenerator.proto    # gRPC proto定义
│       └── idgenerator.pb.go    # 生成的Go代码
├── cmd/
│   └── server/
│       └── main.go              # 服务入口
├── internal/
│   ├── config/                  # 配置管理（热重载）
│   ├── generator/               # 生成器管理器
│   ├── health/                  # 健康检查
│   ├── metrics/                 # Prometheus指标
│   └── server/                  # gRPC服务实现
├── pkg/
│   ├── snowflake/               # 雪花算法
│   ├── segment/                 # 号段模式
│   └── uuid/                    # UUID生成
├── config.json                  # 配置示例
└── go.mod
```

## 快速开始

### 前置依赖

- Go 1.21+
- Etcd 3.x
- MySQL 5.7+/8.x

### 安装依赖

```bash
go mod tidy
```

### 配置Etcd

将配置写入Etcd：

```bash
etcdctl put /idgenerator/config '{
  "mode": "snowflake",
  "grpc_port": 50051,
  "http_port": 9090,
  "etcd_endpoints": ["localhost:2379"],
  "mysql_dsn": "root:password@tcp(localhost:3306)/idgen?charset=utf8mb4&parseTime=True&loc=Local",
  "biz_tag": "default",
  "segment_step": 1000
}'
```

### MySQL初始化

创建数据库和表（首次启动会自动创建表）：

```sql
CREATE DATABASE idgen;
```

### 启动服务

```bash
go run cmd/server/main.go
```

## gRPC接口

### GenerateID - 生成ID

```protobuf
rpc GenerateID(GenerateIDRequest) returns (GenerateIDResponse);
```

请求参数：
- `mode`: 生成模式 (SNOWFLAKE/SEGMENT/UUID)
- `count`: 获取数量 (1-1000)

响应：
- `ids`: int64类型ID数组（雪花/号段模式）
- `uuids`: 字符串UUID数组（UUID模式）
- `mode`: 实际使用的模式

### HealthCheck - 健康检查

```protobuf
rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
```

响应：
- `healthy`: 服务是否健康
- `message`: 状态消息
- `details`: 各组件详细状态

## Prometheus指标

访问 `http://localhost:9090/metrics` 查看指标：

- `id_generation_duration_seconds`: ID生成耗时直方图
- `id_requests_total`: 请求总数（按模式和状态分类）
- `worker_conflicts_total`: Worker冲突次数

## 配置热重载

更新Etcd中的配置即可触发热重载：

```bash
etcdctl put /idgenerator/config '{...新配置...}'
```

## 雪花算法说明

改进的雪花算法格式（63bit有效位）：

```
+---------------------------------------------------------------------+
| 39位时间戳(ms) | 2位业务类型 | 10位分片键 | 7位Worker ID | 5位序列号 |
+---------------------------------------------------------------------+
```

- 时间戳：39bit，从2024-01-01开始，可使用约174年
- 业务类型：2bit，支持4种业务
- 分片键：10bit，支持1024个分片
- Worker ID：7bit，通过Etcd自动分配，最多128个节点
- 序列号：5bit，每毫秒最多生成32个ID

### 元数据反解

雪花ID嵌入的元数据可以通过 `ParseID` gRPC接口反解：

```go
// 直接调用库方法
parsed := snowflake.ParseID(id)
fmt.Printf("Time: %v, BizType: %d, ShardKey: %d, WorkerID: %d\n",
    parsed.Time, parsed.BizType, parsed.ShardKey, parsed.WorkerID)
```

- Worker ID通过Etcd自动分配，带Lease自动续期
- 支持时钟回拨检测（≤5ms等待追上，>5ms拒绝）
- 冲突时自动重试分配Worker ID

## 号段模式说明

- 采用数据库乐观锁批量分配号段
- 双缓冲机制：当前号段快用完时预加载下一个
- 支持自定义步长（step）

## 优雅停机

服务监听 `SIGINT` 和 `SIGTERM` 信号：

1. 停止gRPC服务接受新请求
2. 等待正在处理的请求完成
3. 关闭Metrics服务
4. 释放Etcd租约
5. 关闭数据库连接
