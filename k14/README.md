# 古建筑木结构残损评估命令行工具

基于 Rust + ndarray + rayon 并行计算的古建筑木结构残损评估工具。

## 功能特性

- **点云数据输入**: 支持 .las 和 .ply 格式
- **木材树种支持**: 松木、杉木、楠木
- **环境参数**: 温度、湿度影响因子
- **残损检测**:
  - 腐朽深度检测（颜色阈值 + 回波强度）
  - 虫蛀孔洞检测（聚类算法）
  - 裂缝检测（RANSAC 平面拟合）
- **力学评估**: 基于残余截面计算抗弯/抗压承载力
- **安全等级**: I/II/III/IV 级（参考《木结构设计规范》GB50005-2017）
- **报告输出**: Markdown 格式，含 ASCII 3D 残损热图
- **批量处理**: 并行处理整个建筑的所有构件
- **修复建议**: 自动推荐修复方案（环氧灌注/木粉填充/铁件加固/替换）
- **配置化**: YAML 配置文件可调整各项参数
- **历史对比**: 两次扫描结果差异分析

## 安装

```bash
# 克隆项目
git clone <repository>
cd timber-assess

# 构建项目
cargo build --release

# 添加到 PATH（可选）
export PATH=$PATH:$(pwd)/target/release
```

## 快速开始

### 1. 生成演示数据

```bash
# 生成示例点云文件
timber-assess demo
```

### 2. 分析单个文件

```bash
# 基本用法
timber-assess analyze ./demo/beam_damaged.ply

# 指定木材树种和环境参数
timber-assess analyze ./demo/beam_damaged.ply \
  --species fir \
  --temperature 25 \
  --humidity 70

# 指定输出路径和导出VTK
timber-assess analyze ./demo/beam_damaged.ply \
  --output ./report.md \
  --export-vtk
```

### 3. 批量处理

```bash
# 批量处理目录下所有 .ply 文件
timber-assess process --input "./demo/*.ply" --output ./reports

# 使用自定义配置文件
timber-assess process \
  --input "./scans/*.las" \
  --output ./reports \
  --config ./my_config.yaml
```

### 4. 历史数据对比

```bash
# 对比两次扫描结果
timber-assess compare \
  --old ./snapshot_old.json \
  --new ./beam_new.ply \
  --output ./comparison.md
```

### 5. 生成默认配置

```bash
timber-assess init-config ./config.yaml
```

## 命令行参数

### 全局参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--config` | 配置文件路径 | - |
| `--species` | 木材树种: pine/fir/nanmu 或 中文 | pine |
| `--temperature` | 环境温度 (°C) | 20.0 |
| `--humidity` | 环境湿度 (%) | 50.0 |

### analyze 命令

| 参数 | 说明 |
|------|------|
| `input` | 输入点云文件路径 (.las/.ply) |
| `--output` | 输出报告文件路径 |
| `--export-vtk` | 导出 VTK 可视化文件 |

### process 命令

| 参数 | 说明 |
|------|------|
| `input` | 输入文件匹配模式 (如: ./scans/*.las) |
| `--output` | 输出报告目录 |

### compare 命令

| 参数 | 说明 |
|------|------|
| `old` | 历史快照文件路径 (.json) |
| `new` | 新的点云文件路径 |
| `--output` | 输出对比报告路径 |

## 配置文件说明

```yaml
# 腐朽检测配置
decay:
  color_threshold_low: [100, 50, 0]    # 腐朽颜色下限 RGB
  color_threshold_high: [180, 120, 60] # 腐朽颜色上限 RGB
  intensity_threshold: 50.0            # 回波强度阈值
  min_decay_area: 10.0                 # 最小腐朽区域

# 虫蛀检测配置
insect:
  hole_radius_min: 2.0      # 虫孔最小半径
  hole_radius_max: 15.0     # 虫孔最大半径
  clustering_eps: 50.0      # 聚类距离阈值
  min_cluster_size: 3       # 最小聚类大小

# 开裂检测配置
crack:
  ransac_iterations: 1000   # RANSAC 迭代次数
  distance_threshold: 5.0   # 点到平面距离阈值
  min_crack_length: 50.0    # 最小裂缝长度
  max_crack_width: 30.0     # 最大裂缝宽度

# 力学评估配置
mechanics:
  safety_factor: 1.5        # 安全系数
  reference_standard: "GB50005-2017"  # 参考标准
  environment_factor: 1.0   # 环境影响系数

# 输出配置
output:
  heatmap_resolution: 20    # ASCII热图分辨率
  export_vtk: false         # 是否导出VTK
  report_template: "default" # 报告模板
```

## 安全等级说明

| 等级 | 名称 | 承载力保留率 | 说明 |
|------|------|-------------|------|
| I级 | 完好 | ≥90% | 结构完好，可正常使用 |
| II级 | 轻微 | 70%-90% | 轻微损伤，建议监控使用 |
| III级 | 严重 | 40%-70% | 严重损伤，需尽快加固 |
| IV级 | 危险 | <40% | 危险状态，必须立即处理 |

## 木材力学参数

| 树种 | 抗弯强度 (N/mm²) | 抗压强度 (N/mm²) | 弹性模量 (N/mm²) |
|------|-----------------|-----------------|-----------------|
| 松木 | 17.0 | 12.0 | 10000 |
| 杉木 | 15.0 | 10.0 | 9000 |
| 楠木 | 20.0 | 15.0 | 12000 |

## 项目结构

```
timber-assess/
├── src/
│   ├── main.rs          # 主程序入口
│   ├── lib.rs           # 库导出
│   ├── cli.rs           # 命令行接口
│   ├── config.rs        # 配置管理
│   ├── pointcloud.rs    # 点云数据处理
│   ├── damage.rs        # 残损检测模块
│   ├── mechanics.rs     # 力学评估模块
│   ├── report.rs        # 报告生成模块
│   ├── batch.rs         # 批量处理模块
│   └── comparison.rs    # 历史数据对比
├── Cargo.toml
├── config.yaml          # 默认配置文件
└── README.md
```

## 技术栈

- **Rust**: 高性能系统编程语言
- **ndarray**: 多维数组运算
- **rayon**: 数据并行计算
- **clap**: 命令行参数解析
- **serde**: 序列化/反序列化
- **kdtree**: 空间数据索引

## 许可证

MIT
