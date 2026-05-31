# RadTran - 放射性核素在地下水中迁移预测工具

RadTran是一个用于模拟放射性核素在地下水中迁移的数值模拟工具，结合了Fortran高性能计算和Python便捷的数据处理与可视化能力。

## 功能特性

### 核心功能
- **对流-弥散方程求解**: 使用有限差分法（隐式格式）求解二维浓度分布
- **自动时间步长调整**: 基于CFL条件自动调整时间步长，确保数值稳定性
- **放射性衰变链**: 支持U-238等衰变链的耦合求解
- **源项释放模式**: 瞬时释放和持续释放两种模式

### 输入参数
**含水层参数**:
- 孔隙度 (porosity)
- 渗透系数 (permeability)
- 纵向/横向弥散度 (alpha_l, alpha_t)
- 阻滞因子 (retardation)

**核素参数**:
- 半衰期 (half_life)
- 分配系数 (distribution_coeff)
- 衰变链关系 (parent)
- 初始浓度

### 输出结果
1. **浓度等值线图**: 不同时间的浓度分布图（PNG格式）
2. **GIF动画**: 浓度随时间变化的动画
3. **突破曲线**: 指定监测点的浓度-时间曲线
4. **超标范围**: 超过饮用水标准的边界坐标（GeoJSON格式）
5. **敏感性分析**: 蒙特卡洛模拟，输出浓度概率分布和超标概率
6. **数据导出**: VTK格式（ParaView可视化）和CSV格式

## 安装

### 环境要求
- Python 3.8+
- NumPy
- Matplotlib
- SciPy
- pyevtk (可选，用于VTK导出)
- geojson
- PyYAML
- tqdm
- Fortran编译器 (gfortran, ifort等，可选)

### 安装步骤

1. 克隆或下载本项目

2. 安装Python依赖:
```bash
pip install -r requirements.txt
```

3. （可选）编译Fortran扩展:
```bash
python setup.py build_ext --inplace
```

或者使用Make:
```bash
make build
```

## 使用方法

### 1. 创建配置文件

```bash
python -m radtran.cli create-config
```

或者使用示例配置:
```bash
cp examples/config_single_nuclide.yaml config.yaml
```

### 2. 运行模拟

```bash
python -m radtran.cli run -c config.yaml
```

常用选项:
```bash
# 生成动画
python -m radtran.cli run -c config.yaml --animation

# 导出VTK和GeoJSON
python -m radtran.cli run -c config.yaml --vtk --geojson

# 运行敏感性分析
python -m radtran.cli run -c config.yaml --sensitivity

# 指定输出目录
python -m radtran.cli run -c config.yaml -o results
```

### 3. 配置文件说明

```yaml
# 含水层参数
aquifer:
  porosity: 0.3           # 孔隙度
  permeability: 1e-10     # 渗透系数 (m/s)
  alpha_l: 10.0           # 纵向弥散度 (m)
  alpha_t: 1.0            # 横向弥散度 (m)
  retardation: 1.0        # 阻滞因子

# 核素参数
nuclides:
  - name: Cs-137
    half_life: 9.46e8     # 半衰期 (秒)
    distribution_coeff: 2.0

# 源项配置
source:
  mode: continuous        # instantaneous | continuous
  strength: 1e6           # 源强 (Bq)
  x: 50.0                 # X坐标 (m)
  y: 50.0                 # Y坐标 (m)
  radius: 5.0             # 源半径 (m)
  duration: 3.154e7       # 持续时间 (秒)

# 网格配置
grid:
  nx: 100                 # X方向网格数
  ny: 100                 # Y方向网格数
  dx: 2.0                 # X方向间距 (m)
  dy: 2.0                 # Y方向间距 (m)

# 模拟配置
max_time: 3.154e9        # 总模拟时间 (秒)
threshold: 100.0         # 浓度阈值 (Bq/L)

# 监测点
monitoring_points:
  Well_A: [100.0, 50.0]
  Well_B: [150.0, 50.0]
```

## 示例配置

项目包含多个示例配置文件:

- `examples/config_single_nuclide.yaml` - 单核素（Cs-137）瞬时释放模拟
- `examples/config_decay_chain.yaml` - U-238衰变链耦合模拟

## 项目结构

```
radtran/
├── src/
│   ├── fortran/
│   │   └── radtran_solver.f90    # Fortran核心求解器
│   └── python/
│       ├── __init__.py
│       ├── config.py              # 配置管理
│       ├── solver.py              # 求解器包装
│       ├── visualization.py       # 可视化模块
│       ├── export.py              # 数据导出
│       ├── sensitivity.py         # 敏感性分析
│       └── cli.py                 # 命令行接口
├── examples/                      # 示例配置
├── tests/                         # 测试文件
├── requirements.txt
├── setup.py
└── Makefile
```

## 数学模型

### 对流-弥散方程

放射性核素在地下水中的迁移满足以下对流-弥散方程：

```
∂(θR C)/∂t = ∇·(θD ∇C) - ∇·(θv C) - θλR C
```

其中:
- C: 浓度 (Bq/L)
- θ: 孔隙度
- R: 阻滞因子
- D: 水动力弥散系数张量
- v: 地下水流速
- λ: 衰变常数

### 衰变链耦合

对于衰变链中的子核素，需要考虑母核素的衰变贡献：

```
∂C_i/∂t = ... + λ_{i-1} C_{i-1}
```

## 引用与参考

1.  Zheng, C., & Bennett, G. D. (2002). Applied contaminant transport modeling. John Wiley & Sons.
2.  Anderson, M. P., & Woessner, W. W. (1992). Applied groundwater modeling. Academic Press.

## 许可证

本项目仅供科研和教育使用。
