# 红外探水隧道超前预报系统 - 编译说明

## 依赖库

确保系统已安装以下库：

1. **Qt6** (>= 6.2.0)
   - 组件: Core, Gui, Widgets, PrintSupport, Charts

2. **OpenCV** (>= 4.0)
   - 用于图像处理和计算机视觉

3. **FFTW3** (>= 3.3)
   - 用于快速傅里叶变换（时间序列分析）

4. **CMake** (>= 3.16)
   - 构建系统

5. **C++编译器**
   - Windows: MSVC 2019 或 MinGW
   - 支持 C++17 标准

## Windows 编译步骤

### 1. 设置环境变量

确保 Qt、OpenCV、FFTW 的 bin 目录已添加到 PATH 环境变量。

### 2. 创建构建目录

```powershell
mkdir build
cd build
```

### 3. 配置 CMake

```powershell
cmake .. -DCMAKE_PREFIX_PATH="C:/Qt/6.5.0/msvc2019_64;C:/opencv/build;C:/fftw3"
```

根据实际安装路径调整。

### 4. 编译

```powershell
cmake --build . --config Release
```

### 5. 运行

可执行文件位于 `build/Release/InfraredWaterDetection.exe`

## 项目结构

```
src/
├── main.cpp                    # 程序入口
├── MainWindow.h/cpp            # 主窗口
├── data/
│   ├── ThreeDPosition.h/cpp    # 三维位置数据结构
│   ├── TemperatureFrame.h/cpp  # 温度帧数据
│   └── AnomalyRegion.h/cpp     # 异常区域数据
├── io/
│   └── FLIRImporter.h/cpp      # FLIR红外数据导入
├── processing/
│   ├── ImageRegistration.h/cpp    # 图像配准
│   ├── TemperatureCalibration.h/cpp # 温度标定
│   ├── TemperatureFieldAnalyzer.h/cpp # 温度场分析
│   ├── TimeSeriesAnalyzer.h/cpp    # 时间序列分析
│   └── WaterStructureLocalizer.h/cpp # 含水构造定位
├── report/
│   └── ReportGenerator.h/cpp   # PDF报告生成
└── widgets/
    ├── TemperatureViewer.h/cpp # 温度图像查看器
    ├── TimeSeriesChart.h/cpp   # 时间序列图表
    └── ReportPreview.h/cpp     # 报告预览
```

## 功能说明

1. **数据导入**: 支持 CSV、TIFF 格式的红外热成像序列
2. **图像配准**: 使用光流法消除手持热像仪抖动
3. **温度标定**: 环境温度、反射温度、大气透射率补偿
4. **温度场分析**: 伪彩色图、温度梯度、低温异常识别
5. **时间序列分析**: 温度趋势分析、FFT频谱分析
6. **含水定位**: 三维空间位置推算、钻探建议
7. **报告导出**: PDF格式预报报告

## 注意事项

1. 首次运行可能需要部署 Qt 运行时库
2. 确保 OpenCV 的 opencv_world*.dll 和 FFTW 的 fftw3*.dll 与可执行文件同目录
3. 建议使用 Release 模式编译以获得最佳性能
