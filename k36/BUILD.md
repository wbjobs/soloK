# TreeLidar 3D - 三维点云单木分割测量系统

## 项目简介

基于 C++/Qt+PCL+Open3D+VTK 开发的三维点云单木分割测量桌面应用，支持LiDAR点云数据处理、单木分割、参数提取、可视化和结果导出。

## 功能特性

### 1. 数据加载
- 支持 LAS/LAZ/PLY/PCD 格式点云
- 支持地面/植被分类标签自动识别
- 大文件分块加载（1公顷样地高效处理）

### 2. 地形归一化
- 基于地面点生成DEM（数字高程模型）
- 支持空洞填充和双线性插值
- 计算每个点的相对高度（树高）

### 3. 单木分割算法
- **树顶检测**：基于局部最大值（点云密度峰值）+ 高斯平滑 + 非最大值抑制
- **分割方法**：
  - 分水岭分割（基于距离变换的区域生长）
  - 区域生长分割
- **手动修正**：支持合并/切分/删除树木

### 4. 结构参数提取
- 树高（最高点相对高度）
- 冠幅（X/Y方向投影最大直径）
- 胸径（DBH，1.3m高度处点云最小二乘圆拟合）
- 树冠体积（凸包或体素占用）
- 坡度校正（DBH测量时考虑地形坡向）

### 5. 可视化
- 点云按高程/树ID/标签/强度着色
- 树干圆柱体、树冠轮廓叠加显示
- 树顶标记、俯视投影图（伪彩色CHM）

### 6. 结果导出
- 单木参数表格（CSV）
- 分割后的单木点云（按树ID分文件，PLY/PCD格式）
- 林地样方统计报告（PDF，包含样地概况、林木统计、单木表、投影图）
- DEM（ArcGIS ASCII Grid格式）
- 冠层高度模型（PNG）

### 7. 批量处理
- 支持整个样地1公顷点云自动处理
- 多文件队列处理，进度实时显示
- 处理失败自动继续下一个文件

## 技术栈

- **编程语言**：C++17
- **GUI框架**：Qt 5.15+
- **点云处理**：PCL 1.11+
- **三维可视化**：VTK 9.0+
- **点云库**：Open3D 0.15+（预留接口）
- **LAS格式支持**：LASlib 或 libLAS
- **构建系统**：CMake 3.18+

## 项目结构

```
k36/
├── CMakeLists.txt              # CMake构建配置
├── include/                    # 头文件目录
│   ├── core/                   # 核心数据结构
│   │   ├── typedefs.h          # 自定义点类型、枚举
│   │   ├── PointCloudData.h    # 点云数据容器
│   │   ├── Tree.h              # 单木数据结构
│   │   └── SegmentationResult.h # 分割结果管理
│   ├── io/                     # 输入输出
│   │   ├── PointCloudLoader.h  # 点云加载器
│   │   └── ResultExporter.h    # 结果导出器
│   ├── segmentation/           # 分割算法
│   │   ├── TerrainNormalizer.h # 地形归一化
│   │   ├── TreeTopDetector.h   # 树顶检测
│   │   ├── TreeSegmenter.h     # 单木分割
│   │   └── ManualCorrection.h  # 手动修正
│   ├── features/               # 特征提取
│   │   ├── TreeParameterExtractor.h # 测树因子提取
│   │   └── SlopeCorrector.h    # 坡度校正
│   ├── visualization/          # 可视化
│   │   ├── PointCloudVisualizer.h # 点云可视化
│   │   └── TreeVisualizer.h    # 树木结构可视化
│   └── gui/                    # 图形界面
│       ├── MainWindow.h        # 主窗口
│       └── ProcessingWorker.h  # 后台处理线程
├── src/                        # 源文件目录
│   ├── main.cpp                # 程序入口
│   ├── core/
│   ├── io/
│   ├── segmentation/
│   ├── features/
│   ├── visualization/
│   └── gui/
│       ├── MainWindow.ui       # Qt界面设计
│       ├── MainWindow.cpp
│       └── ProcessingWorker.cpp
└── data/                       # 示例数据目录
```

## 核心算法说明

### 1. DEM生成与地形归一化
```
算法：渐进形态学滤波 + 反距离加权插值
步骤：
  1. 从分类标签提取地面点（label=2）
  2. 生成规则格网DEM（分辨率可配置，默认1m）
  3. 空洞填充：3x3滑动窗口均值插值
  4. 双线性插值计算每个点的地面高度
  5. 归一化高度 = 原始Z - 地面高度
```

### 2. 局部最大值树顶检测
```
算法：移动窗口局部最大值 + 高斯平滑
步骤：
  1. 将归一化点云投影到二维格网（分辨率=检测窗口/2）
  2. 格网赋值：取每个格网内最大高度值
  3. 高斯平滑去噪（sigma=0.5）
  4. 3x3窗口局部最大值检测
  5. 非最大值抑制，去除距离过近的树顶
```

### 3. 分水岭分割（基于Dijkstra）
```
算法：标记控制的分水岭分割
步骤：
  1. 以检测到的树顶作为标记点
  2. 构建点云KD树，计算邻接关系
  3. 对每个标记点执行Dijkstra最短路径传播
  4. 传播代价 = 空间距离 + 高度差权重
  5. 每个点分配给代价最小的标记点
```

### 4. DBH圆拟合
```
算法：最小二乘圆拟合 + RANSAC迭代优化
步骤：
  1. 提取1.3m±0.2m高度范围内的树干点
  2. 投影到XY平面，最小二乘拟合圆
  3. RANSAC迭代去除外点
  4. 计算圆半径 -> DBH = 2 × 半径
  5. 坡度校正：DBH_corrected = DBH / cos(坡度角)
```

### 5. 坡度坡向计算
```
算法：SVD平面拟合
步骤：
  1. 以树干基部为中心，取5x5m窗口内的DEM格网点
  2. SVD分解拟合平面 Z = ax + by + c
  3. 坡度角 = arctan(√(a² + b²))
  4. 坡向角 = arctan2(-a, -b) （方位角，北向为0°）
```

## 依赖库安装

### Windows (推荐 vcpkg)
```powershell
vcpkg install qt5:x64-windows
vcpkg install pcl:x64-windows
vcpkg install open3d:x64-windows
vcpkg install vtk:x64-windows
vcpkg install laslib:x64-windows
```

### Ubuntu/Debian
```bash
sudo apt-get install build-essential cmake qtbase5-dev libqt5opengl5-dev \
    libpcl-dev libvtk9-dev libopen3d-dev liblas-dev
```

### macOS (Homebrew)
```bash
brew install cmake qt@5 pcl vtk open3d laslib
```

## 编译构建

### Windows (Visual Studio 2022)
```powershell
mkdir build
cd build
cmake .. -G "Visual Studio 17 2022" -A x64 ^
    -DCMAKE_TOOLCHAIN_FILE=[vcpkg路径]/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

### Linux/macOS
```bash
mkdir build
cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)
```

## 使用说明

### 单文件处理流程
1. 点击「打开点云」，选择 LAS/PLY 文件
2. 调整处理参数（DEM分辨率、最小树高、检测窗口等）
3. 选择分割算法（分水岭/区域生长）
4. 点击「开始分割」，等待处理完成
5. 在左侧「树木列表」中选择单棵树查看参数
6. 使用「手动修正」功能调整分割结果
7. 点击「导出结果」或「导出PDF」保存处理结果

### 批量处理流程
1. 点击「批量处理」
2. 选择多个点云文件
3. 选择输出目录
4. 程序自动依次处理所有文件并导出结果

### 手动修正操作
- **合并树木**：在树木列表中选择2棵树，点击「合并树木」
- **切分树木**：在点云中拾取至少3个属于新树的点，选择要切分的树，点击「切分树木」
- **删除树木**：选择要删除的树，点击「删除树木」

### 可视化控制
- **着色方式**：按高度/树ID/分类标签/强度
- **显示选项**：树木结构、树顶标记、地面点
- **交互操作**：
  - 鼠标左键拖动：旋转视角
  - 鼠标右键拖动：平移
  - 鼠标滚轮：缩放
  - 点选点云：拾取点（用于切分树木）

## 配置参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| DEM分辨率 | 1.0m | 地形格网大小，值越小精度越高但速度越慢 |
| 最小树高 | 2.0m | 低于此高度的点不参与树顶检测 |
| 检测窗口 | 3.0m | 局部最大值检测窗口，应略大于平均冠幅 |
| DBH高度 | 1.3m | 胸径测量高度，林业标准为1.3m |
| 坡度校正 | 启用 | 根据地形坡度校正DBH测量值 |

## 输出文件说明

```
输出目录/
├── project_trees.csv           # 单木参数表
├── project_report.pdf          # 林地统计报告
├── project_dem.asc             # DEM（ArcGIS ASCII Grid）
├── project_chm.png             # 冠层高度模型（伪彩色）
└── trees/
    ├── tree_0001.ply           # 树1点云
    ├── tree_0002.ply           # 树2点云
    └── ...
```

### CSV参数表字段
- tree_id: 树木ID
- height: 树高(m)
- crown_diameter_x: X方向冠幅(m)
- crown_diameter_y: Y方向冠幅(m)
- dbh: 原始胸径(cm)
- dbh_corrected: 坡度校正后胸径(cm)
- crown_volume: 树冠体积(m³)
- total_volume: 单木材积(m³)
- treetop_x/y/z: 树顶坐标(m)
- trunk_base_x/y/z: 树干基部坐标(m)
- slope_angle: 坡度角(°)
- aspect_angle: 坡向角(°)
- point_count: 点数

## 注意事项

1. **内存要求**：处理1公顷点云（约500-1000万点）建议内存 >= 16GB
2. **LAS格式**：建议使用LASlib获得最佳性能，libLAS作为后备
3. **分类标签**：LAS文件需包含分类标签（地面=2，低植被=3，高植被=5）
4. **坐标系**：建议使用投影坐标系（如UTM），单位为米
5. **坡度校正**：适用于坡度小于30°的地形，过大坡度会导致DBH估计偏差

## 常见问题

### Q: 打开LAS文件失败
A: 检查是否安装了LASlib或libLAS，确认文件未损坏且格式正确。

### Q: 树顶检测数量过少
A: 减小「检测窗口」或降低「最小树高」参数。

### Q: 分割结果过度分割
A: 增大「检测窗口」，或切换到「区域生长」算法。

### Q: DBH值为0
A: 检查1.3m高度处是否有足够的树干点，降低「最小DBH点数」参数。

### Q: 可视化卡顿
A: 勾选「导出时下采样」减少点数，或降低点云大小。

## 技术支持

- 问题反馈：请在项目仓库提交 Issue
- 文档更新：见 BUILD.md 和代码注释

## 许可证

本项目仅供学术研究使用，商业使用请联系作者。
