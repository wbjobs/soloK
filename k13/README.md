# 脑机接口实验数据流可视化驾驶舱

一套用于在线 EEG 实验的数据采集、处理与可视化平台。

## 技术栈

- 前端：React 18 + TypeScript + Plotly.js + WebSocket + TailwindCSS
- 后端：Python 3.11 + FastAPI + Redis + InfluxDB 2.x
- 信号处理：SciPy + NumPy + MNE 风格的球面样条插值

## 功能

- 实时 EEG 数据流（WebSocket，最多 64 通道，250-1000Hz）
- 时域滚动瀑布图（WebGL 加速的 Plotly Heatmap）
- 频域实时分析：Welch PSD + 可切换频带热力图
- 伪迹检测：基于阈值与频带能量的 EOG / EMG 自动标注
- 事件标记与 ERP 提取/导出
- 脑地形图：2D 等高线 + 3D 曲面（球面样条插值）
- 实验配置：10-20 扩展电极位置、陷波/带通滤波器参数管理
- 多会话对比 + 时间锁定叠加平均

## 快速开始

```bash
docker compose up -d
cd backend && pip install -r requirements.txt && python main.py
cd frontend && npm install && npm start
```

默认访问 http://localhost:3000 ，后端 API http://localhost:8000/docs
