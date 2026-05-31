# 语音深度伪造检测取证系统

基于深度学习的语音深度伪造检测和取证分析系统

## 功能特性

### 🔍 伪造检测
- **RawNet2**: 基于原始波形的端到端深度伪造检测
- **LFCC+GMM**: 传统声学特征分析
- **频谱一致性检测**: 频域相位伪影检测
- **集成学习**: 多模型融合，输出综合伪造概率

### 🎯 伪造区域定位
- 基于注意力机制的帧级伪造定位
- 输出可疑时间段（时间戳）
- 波形图中高亮显示伪造区域

### 🔬 溯源分析
- TTS引擎识别（支持8种常见引擎指纹）
- 重压缩痕迹检测
- 原始音频格式推测

### 📄 证据报告
- 导出PDF检测报告
- 包含波形图、频谱图标注
- 检测详情和可读性评估

### 👤 说话人验证
- 声纹注册和管理
- 说话人身份验证
- 伪造攻击检测

### 🎙️ 实时检测
- 麦克风实时录音检测
- 即时分析反馈

## 技术栈

### 后端
- **框架**: FastAPI
- **深度学习**: PyTorch
- **音频处理**: Librosa, PyDub
- **机器学习**: scikit-learn
- **报告生成**: ReportLab

### 前端
- **框架**: React 18
- **音频可视化**: WaveSurfer.js
- **图表**: Recharts
- **UI组件**: Lucide React

## 快速开始

### 环境要求
- Python 3.8+
- Node.js 16+
- ffmpeg（音频处理）

### 后端安装

```bash
cd backend
pip install -r requirements.txt
```

### 启动后端服务

```bash
cd backend
python main.py
```

后端服务将在 `http://localhost:8000` 启动

### 前端安装

```bash
cd frontend
npm install
```

### 启动前端开发服务器

```bash
cd frontend
npm start
```

前端应用将在 `http://localhost:3000` 启动

## API 接口

### 音频上传
```
POST /api/upload
Content-Type: multipart/form-data
```

### 音频分析
```
POST /api/detection/analyze?file_id={file_id}
```

### 说话人注册
```
POST /api/speaker/register
```

### 说话人验证
```
POST /api/speaker/verify?file_id={file_id}
```

### 生成报告
```
POST /api/report/generate
```

### 下载报告
```
GET /api/report/download/{report_id}
```

## 项目结构

```
k37/
├── backend/
│   ├── main.py                 # FastAPI主入口
│   ├── requirements.txt        # Python依赖
│   ├── api/                    # API路由
│   │   ├── detection.py       # 检测接口
│   │   ├── speaker.py         # 说话人验证接口
│   │   └── report.py         # 报告接口
│   ├── models/                 # 检测模型
│   │   ├── rawnet2.py        # RawNet2模型
│   │   ├── lfcc_gmm.py      # LFCC+GMM模型
│   │   ├── spectral_detector.py # 频谱一致性检测
│   │   ├── ensemble_localizer.py # 集成学习和定位
│   │   ├── traceability.py    # 溯源分析
│   │   └── speaker_verifier.py # 说话人验证
│   └── utils/
│       ├── audio_utils.py     # 音频处理工具
│       └── report_generator.py # PDF报告生成
└── frontend/
    ├── package.json
    ├── public/
    └── src/
        ├── App.js
        ├── components/          # React组件
        └── services/          # API服务
```

## 支持的TTS引擎

- Tacotron2
- WaveGlow
- MelGAN
- HiFi-GAN
- WaveNet
- Tacotron
- FastSpeech
- VITS

## 许可证

MIT License
