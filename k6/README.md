# 电力倒闸操作票校核引擎

基于 Java + SpringBoot + Neo4j + Redis + Drools 的电力倒闸操作票安全校核系统。

## 功能特性

### 核心功能
1. **操作票校核** (`POST /api/check`)
   - 接收操作票JSON（包含设备ID、操作序列）
   - 基于图数据库的电网拓扑模型进行校核
   - 执行五防规则和操作顺序约束检查
   - 返回校核结果和违规详情

2. **操作票模拟预演** (`POST /api/simulate`)
   - 执行虚拟操作
   - 返回每一步操作后的电网状态变化
   - 可视化展示操作影响范围

3. **操作历史追溯**
   - 按操作票ID查询历史
   - 按设备ID查询操作记录
   - 按操作员查询操作记录
   - 按时间范围查询操作历史
   - 违规操作记录查询

4. **违规案例库查询**
   - 典型违规案例库
   - 按规则、严重程度、设备类型查询
   - 案例风险分析和预防措施

### 五防规则
1. **防止带负荷拉合隔离开关**
2. **防止带地线合闸**
3. **防止带电挂地线**
4. **防止误入带电间隔**
5. **防止误分合断路器**

### 额外规则
- **操作顺序约束**：先合母线侧刀闸，再合线路侧刀闸
- **设备操作互斥锁**：防止并发操作同一设备

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Java | 17 | 编程语言 |
| Spring Boot | 3.2.5 | 应用框架 |
| Neo4j | 5.x | 图数据库，存储电网拓扑 |
| Redis | 7.x | 缓存、分布式锁、历史数据 |
| Drools | 8.44.0.Final | 规则引擎 |
| Lombok | latest | 代码简化 |

## 快速开始

### 环境要求
- JDK 17+
- Maven 3.6+
- Neo4j 5.x
- Redis 6.x+

### 配置说明

修改 `application.yml`:

```yaml
spring:
  neo4j:
    uri: bolt://localhost:7687
    authentication:
      username: neo4j
      password: neo4j123

  data:
    redis:
      host: localhost
      port: 6379
```

### 启动服务

```bash
# 编译
mvn clean package

# 运行
java -jar target/switching-order-check-1.0.0.jar
```

服务默认端口: 8080

## API 接口

### 1. 操作票校核

**POST** `/api/check`

请求示例:
```json
{
  "orderId": "ORDER-2024-001",
  "orderName": "110kV主变送电操作",
  "substation": "TEST_SUB",
  "operator": "OP-001",
  "operations": [
    {
      "stepNumber": 1,
      "deviceId": "DS-201-BUS",
      "deviceName": "主变高压侧母线侧刀闸",
      "operationType": "CLOSE",
      "deviceType": "Disconnector"
    },
    {
      "stepNumber": 2,
      "deviceId": "DS-201-LINE",
      "deviceName": "主变高压侧线路侧刀闸",
      "operationType": "CLOSE",
      "deviceType": "Disconnector"
    },
    {
      "stepNumber": 3,
      "deviceId": "CB-201",
      "deviceName": "主变高压侧断路器",
      "operationType": "CLOSE",
      "deviceType": "Breaker"
    }
  ]
}
```

响应示例:
```json
{
  "valid": true,
  "orderId": "ORDER-2024-001",
  "violations": [],
  "checkTime": "2024-01-15T10:30:00"
}
```

### 2. 操作票模拟预演

**POST** `/api/simulate`

请求体同上，响应包含每一步操作的详细结果和状态变化。

### 3. 操作历史查询

- `GET /api/history/order/{orderId}` - 按操作票查询
- `GET /api/history/device/{deviceId}` - 按设备查询
- `GET /api/history/operator/{operator}` - 按操作员查询
- `GET /api/history/time-range?startTime=xxx&endTime=xxx` - 按时间范围
- `GET /api/history/violations` - 查询所有违规历史

### 4. 违规案例库查询

- `GET /api/cases` - 查询所有案例
- `GET /api/cases/rule/{ruleName}` - 按规则查询
- `GET /api/cases/severity/{severity}` - 按严重程度查询
- `GET /api/cases/device-type/{deviceType}` - 按设备类型查询

## 项目结构

```
src/main/java/com/powergrid/check/
├── SwitchingOrderCheckApplication.java    # 启动类
├── config/                                 # 配置类
│   ├── DroolsConfig.java
│   ├── RedisConfig.java
│   ├── DataInitializer.java
│   └── GlobalExceptionHandler.java
├── controller/                             # 控制器
│   ├── SwitchingOrderController.java
│   ├── HistoryController.java
│   └── ViolationCaseController.java
├── service/                                # 服务层
│   ├── OrderCheckService.java
│   ├── RuleEngineService.java
│   ├── TopologyAnalysisService.java
│   ├── DeviceCacheService.java
│   ├── DeviceLockService.java
│   └── OperationHistoryService.java
├── model/                                  # 数据模型
│   ├── graph/                              # Neo4j图模型
│   │   ├── PowerDevice.java
│   │   ├── Busbar.java
│   │   ├── Breaker.java
│   │   ├── Disconnector.java
│   │   ├── GroundSwitch.java
│   │   ├── Line.java
│   │   ├── Transformer.java
│   │   └── Connection.java
│   ├── dto/                                # 数据传输对象
│   │   ├── SwitchingOrder.java
│   │   ├── OperationStep.java
│   │   ├── CheckResult.java
│   │   ├── Violation.java
│   │   ├── SimulationResult.java
│   │   └── SimulationStepResult.java
│   ├── fact/                               # Drools Fact对象
│   │   └── OperationContext.java
│   └── entity/                             # Redis实体
│       ├── OperationHistory.java
│       └── ViolationCase.java
└── repository/                             # 数据访问层
    ├── PowerDeviceRepository.java
    ├── OperationHistoryRepository.java
    └── ViolationCaseRepository.java

src/main/resources/
├── application.yml                         # 应用配置
└── rules/                                   # Drools规则文件
    ├── five-prevention-rules.drl           # 五防规则
    ├── operation-order-rules.drl           # 操作顺序规则
    └── device-lock-rules.drl               # 设备锁规则
```

## 电网拓扑模型

### 节点类型
- **Busbar** (母线)
- **Breaker** (断路器)
- **Disconnector** (隔离开关)
- **GroundSwitch** (接地刀闸)
- **Line** (线路)
- **Transformer** (变压器)

### 关系类型
- **CONNECTED_TO**：设备之间的连接关系

### 状态枚举
- `ENERGIZED` / `DE_ENERGIZED` - 带电/不带电（母线、线路等）
- `CLOSED` / `OPEN` - 闭合/断开（断路器、隔离开关、接地刀闸）

## 开发说明

### 添加新规则
在 `src/main/resources/rules/` 目录下创建 `.drl` 文件，Drools 会自动加载。

### 扩展设备类型
继承 `PowerDevice` 抽象类，添加特定属性和方法。

### 自定义检查逻辑
在 `RuleEngineService` 中扩展 `buildContext` 方法，或在 `TopologyAnalysisService` 中添加新的分析方法。

## 许可证

MIT License
