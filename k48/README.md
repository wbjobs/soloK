# 可靠UDP文件传输服务

基于Node.js实现的简化版可靠UDP文件传输服务，类似TFTP但带拥塞控制。

## 功能特性

- **ACK确认和超时重传**：动态计算RTT（往返时间），自适应超时时间
- **滑动窗口**：窗口大小可配置，支持批量传输
- **拥塞控制**：慢启动（Slow Start）+ 拥塞避免（Congestion Avoidance）
- **文件完整性校验**：每个数据包带CRC32校验，传输完成后整体MD5校验
- **断点续传**：支持传输中断后从上次位置继续
- **传输统计**：吞吐量、重传率、平均RTT等统计信息

## 项目结构

```
.
├── checksum.js      # CRC32和MD5校验工具
├── packet.js        # UDP数据包格式定义
├── rtt.js           # RTT计算和超时重传管理
├── congestion.js    # 拥塞控制和滑动窗口
├── server.js        # 服务端程序
├── client.js        # 客户端程序
├── test_generator.js # 测试文件生成器
└── package.json     # 项目配置
```

## 使用方法

### 1. 启动服务端

```bash
# 使用默认端口6969
node server.js

# 指定端口
node server.js 8888
```

接收到的文件将保存在 `received/` 目录下。

### 2. 客户端发送文件

```bash
# 基本用法
node client.js <文件名>

# 指定服务器地址和端口
node client.js -h 192.168.1.100 -p 8888 myfile.zip

# 设置窗口大小（默认16）
node client.js -w 32 largefile.iso

# 断点续传
node client.js -r largefile.iso
```

### 3. 生成测试文件

```bash
# 生成2MB的测试文件
node test_generator.js testfile.bin 2
```

## 命令行参数

### 客户端参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `-h, --host` | 服务器地址 | 127.0.0.1 |
| `-p, --port` | 服务器端口 | 6969 |
| `-w, --window` | 滑动窗口大小 | 16 |
| `-r, --resume` | 启用断点续传 | false |

## 传输测试示例

```bash
# 终端1 - 启动服务端
node server.js

# 终端2 - 生成测试文件
node test_generator.js testfile.bin 5

# 终端2 - 发送文件
node client.js -w 32 testfile.bin
```

## 技术实现

### 数据包格式

```
+--------+----------+----------+-------------------+
| Type   | Seq Num  | CRC32    | Data              |
| 1 byte | 4 bytes  | 4 bytes  | Variable length   |
+--------+----------+----------+-------------------+
```

**包类型：**
- `SYN (0)`: 握手请求，携带文件信息
- `DATA (1)`: 数据分片
- `ACK (2)`: 确认包
- `FIN (3)`: 传输结束，携带MD5

### RTT计算

使用Jacobson/Karels算法：
- SRTT = (1 - α) * SRTT + α * RTT
- RTTVAR = (1 - β) * RTTVAR + β * |RTT - SRTT|
- RTO = SRTT + 4 * RTTVAR

其中 α = 0.125, β = 0.25

### 拥塞控制

1. **慢启动**：cwnd从1开始，每个ACK增加1，达到ssthresh后进入拥塞避免
2. **拥塞避免**：每个RTT cwnd增加1/cwnd
3. **超时**：ssthresh = cwnd/2，cwnd = 1，重新慢启动

## License

ISC
