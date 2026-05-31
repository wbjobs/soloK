# 虚拟制片摄像机追踪系统

基于 Unity3D + C++ 插件 + FreeD 协议的专业级虚拟制片解决方案。

## 功能特性

### 核心功能
- **FreeD 协议支持** - 接收广播级云台摄像机（Sony BRC 系列等）的 UDP 数据
- **实时位姿映射** - 真实摄像机位姿实时同步到 Unity 虚拟摄像机
- **绿幕抠像合成** - 基于 YCbCr 色彩空间的高精度 chroma key 算法
- **多摄像机切换** - 最多支持 4 机位无缝切换，带多种转场效果

### 高级功能
- **动态光照匹配** - 根据真实光源颜色/强度实时更新虚拟光照
- **景深匹配** - 根据镜头焦距和光圈计算虚拟景深效果
- **摄像机校准** - 棋盘格手动校准 + 标记点自动校准
- **运动轨迹录制** - 记录、编辑、回放摄像机运动路径
- **实时输出** - NDI/Spout 输出到监视器或流媒体
- **防抖滤波** - 多种滤波算法消除摄像机抖动

## 项目结构

```
k20/
├── FreeDPlugin/                 # C++ FreeD 协议解析插件
│   ├── include/                 # 头文件
│   │   ├── FreeDPluginAPI.h     # 插件导出 API
│   │   ├── FreeDProtocol.h      # FreeD 协议解析
│   │   └── UDPSocket.h          # UDP 套接字封装
│   ├── src/                     # 源文件
│   │   ├── FreeDPluginAPI.cpp   # 插件 API 实现
│   │   ├── FreeDProtocol.cpp    # 协议解析实现
│   │   └── UDPSocket.cpp        # UDP 实现
│   └── CMakeLists.txt           # CMake 构建配置
│
└── UnityProject/                # Unity 项目
    └── Assets/
        ├── Scripts/             # C# 脚本
        │   ├── Core/
        │   │   ├── FreeDNativeBindings.cs      # C++ 互操作层
        │   │   ├── FreeDCameraTracker.cs       # 摄像机追踪器
        │   │   └── VirtualProductionManager.cs # 系统管理器
        │   ├── Compositing/
        │   │   ├── ChromaKeyCompositor.cs      # 绿幕抠像合成
        │   │   └── DepthOfFieldMatcher.cs      # 景深匹配
        │   ├── Lighting/
        │   │   └── DynamicLightMatcher.cs      # 动态光照匹配
        │   ├── Calibration/
        │   │   └── CameraCalibrationTool.cs    # 摄像机校准工具
        │   ├── Recording/
        │   │   └── CameraPathRecorder.cs       # 轨迹录制回放
        │   ├── Switching/
        │   │   └── MultiCameraSwitcher.cs      # 多摄像机切换
        │   ├── Output/
        │   │   └── OutputSender.cs             # NDI/Spout 输出
        │   └── Stabilization/
        │       └── CameraImageStabilizer.cs    # 防抖滤波
        │
        ├── Shaders/               # 着色器
        │   ├── ChromaKey.shader   # 绿幕抠像 Shader
        │   ├── DepthOfField.shader # 景深 Shader
        │   └── VideoTransition.shader # 视频转场 Shader
        │
        ├── Plugins/               # C++ 插件编译输出
        ├── Prefabs/               # 预设
        └── Scenes/                # 场景
```

## 快速开始

### 1. 编译 C++ 插件

```bash
cd FreeDPlugin
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022"
cmake --build . --config Release
```

将编译生成的 `FreeDPlugin.dll` 复制到 `UnityProject/Assets/Plugins/` 目录。

### 2. Unity 项目设置

1. 打开 Unity 项目
2. 在 Player Settings 中启用 "Allow 'unsafe' Code"
3. 确保 Api Compatibility Level 设置为 .NET 4.x

### 3. 配置摄像机

1. 创建空 GameObject，添加 `FreeDCameraTracker` 组件
2. 设置 Camera ID（0-3）、UDP 端口号
3. 配置位置偏移和旋转偏移
4. 将虚拟摄像机设为该 GameObject 的子对象

### 4. 绿幕抠像设置

1. 在摄像机上添加 `ChromaKeyCompositor` 组件
2. 设置键控颜色（默认绿色 #00FF00）
3. 调整阈值和容差参数
4. 启用色溢抑制

## FreeD 协议数据格式

标准 FreeD 协议数据包（29字节）：

| 偏移 | 长度 | 描述 |
|------|------|------|
| 0 | 1 | 消息类型 (0xD1) |
| 1 | 1 | 摄像机 ID |
| 2 | 3 | 俯仰角 (Pan) |
| 5 | 3 | 偏航角 (Tilt) |
| 8 | 3 | 翻滚角 (Roll) |
| 11 | 3 | 位置 X |
| 14 | 3 | 位置 Y |
| 17 | 3 | 位置 Z |
| 20 | 2 | 变焦 (Zoom) |
| 22 | 2 | 聚焦 (Focus) |
| 24 | 2 | 光圈 (Aperture) |
| 26 | 3 | 校验和 |

## API 参考

### C++ 插件 API

```cpp
bool FreeD_Initialize(int cameraId, int port, const char* ipAddress);
bool FreeD_Update(int cameraId);
void FreeD_GetCameraData(int cameraId,
    double* pan, double* tilt, double* roll,
    double* x, double* y, double* z,
    double* zoom, double* focus, double* aperture);
void FreeD_SetFilterEnabled(int cameraId, bool enabled);
void FreeD_SetFilterSmoothing(int cameraId, double smoothing);
```

### Unity C# API

```csharp
// 摄像机追踪
FreeDCameraTracker tracker = camera.GetComponent<FreeDCameraTracker>();
tracker.Initialize();
tracker.EnableTracking = true;

// 多机位切换
MultiCameraSwitcher switcher = FindObjectOfType<MultiCameraSwitcher>();
switcher.SwitchToCamera(1, withTransition: true);

// 轨迹录制
CameraPathRecorder recorder = camera.GetComponent<CameraPathRecorder>();
recorder.StartRecording();
recorder.StopRecording();
recorder.StartPlayback();
```

## 系统要求

- Unity 2021.3 或更高版本
- Visual Studio 2022（用于 C++ 插件编译）
- Windows 10/11 (x64)
- 支持 FreeD 协议的广播级摄像机（Sony BRC、Panasonic AW-UE 系列等）

## 性能优化建议

1. **UDP 接收** - 使用独立线程处理网络数据
2. **抠像优化** - 使用 720p 预览，渲染输出用 1080p
3. **防抖参数** - 根据运动速度动态调整滤波强度
4. **内存管理** - 复用 RenderTexture，避免频繁创建销毁

## 扩展开发

### 添加新的视频输出协议

继承 `OutputSender` 类，重写 `SendFrame()` 方法：

```csharp
public class CustomOutputSender : OutputSender
{
    protected override void SendFrame()
    {
        // 实现自定义输出逻辑
    }
}
```

### 自定义转场效果

在 `VideoTransition.shader` 中添加新的转场模式。

## 许可证

MIT License
