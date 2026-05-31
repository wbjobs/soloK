# 音轨分离与混音工具

一个基于 Python 的音频处理工具，使用 Demucs 进行音轨分离，并提供自定义混音功能。支持独立调节每个音轨的音量、EQ、混响和延迟效果。

## 功能特性

- **音轨分离**: 使用 Demucs 将歌曲分离为 4 个独立音轨：
  - 人声 (vocals)
  - 鼓 (drums)
  - 贝斯 (bass)
  - 其他乐器 (other)

- **自定义效果器**:
  - **音量控制**: 以 dB 为单位调节每个音轨的增益
  - **EQ 均衡器**: 独立调节低频、中频、高频增益
  - **混响效果**: 可调节房间大小、衰减、干湿比
  - **延迟效果**: 可调节延迟时间、反馈、干湿比

- **混音导出**: 将处理后的音轨重新混合并导出为 WAV 格式

## 安装依赖

```bash
pip install -r requirements.txt
```

## 使用方法

### 1. 初始化配置文件

```bash
python main.py init-config
```

这会在当前目录生成默认配置文件 `config.yaml`。

### 2. 音轨分离与混音

```bash
python main.py mix input_song.mp3 -c config.yaml -o output/mixed.wav --export-stems
```

参数说明：
- `input_song.mp3`: 输入音频文件路径
- `-c, --config`: 混音配置文件（YAML 格式）
- `-o, --output`: 输出混音文件路径
- `--export-stems`: 同时导出分离后的独立音轨
- `--stems-dir`: 指定音轨导出目录（可选）

### 3. 仅分离音轨

```bash
python main.py separate input_song.mp3 -o output_stems/
```

## 配置文件说明

配置文件使用 YAML 格式，每个音轨包含以下参数：

```yaml
vocals:
  volume: 0.0           # 音量增益 (dB)
  eq_low: 0.0           # 低频增益 (dB)
  eq_mid: 0.0           # 中频增益 (dB)
  eq_high: 0.0          # 高频增益 (dB)
  reverb_enable: false  # 是否启用混响
  reverb_room_size: 0.5 # 房间大小 (0-1)
  reverb_decay: 0.5     # 衰减系数 (0-1)
  reverb_wet: 0.3       # 湿信号比例 (0-1)
  delay_enable: false   # 是否启用延迟
  delay_time: 300.0     # 延迟时间 (毫秒)
  delay_feedback: 0.4   # 反馈系数 (0-1)
  delay_wet: 0.3        # 湿信号比例 (0-1)
```

共有 4 个音轨可配置：`vocals`、`drums`、`bass`、`other`。

## 示例配置

参考 `example_config.yaml` 获取一个更复杂的配置示例，包含人声加混响、鼓加低频增强等效果。

## 项目结构

```
.
├── main.py              # 主入口文件
├── cli.py               # CLI 命令行接口
├── stem_separator.py    # 音轨分离模块 (Demucs)
├── effects.py           # 自定义效果器模块
├── mixer.py             # 混音引擎
├── requirements.txt     # 依赖列表
├── example_config.yaml  # 示例配置文件
└── README.md           # 项目文档
```

## 效果器技术说明

### EQ 均衡器
- 使用 Butterworth 滤波器实现
- 低频：< 200Hz
- 中频：200Hz - 2000Hz
- 高频：> 2000Hz

### 混响效果
- 基于多延迟线和梳状滤波器实现
- 模拟不同大小的房间声学效果

### 延迟效果
- 支持多回声反馈
- 可调节延迟时间和反馈强度
