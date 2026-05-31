# 煤自燃倾向性鉴定命令行工具

基于Python+NumPy+SciPy+scikit-learn开发的煤自燃倾向性鉴定工具，支持多升温速率联合动力学分析和自燃倾向性综合评判。

## 功能特性

### 数据处理
- **基线校正**：自动识别TG曲线起始平台，支持常数、线性、多项式三种校正方法
- **多升温速率支持**：5/10/15/20°C/min等多种升温速率数据处理

### 动力学参数计算
- **Kissinger法**：基于峰值温度计算活化能和指前因子
- **Ozawa法**：FWO等转化率法计算活化能
- **Coats-Redfern法**：积分法匹配41种反应机理函数
- **Friedman法**：微分等转化率法，获得活化能随转化率变化

### 反应机理函数
内置41种常用反应机理函数，包括：
- 幂函数法则 (P1-P4)
- Avrami-Erofeev方程 (A2-A4)
- 相边界反应 (R1-R3)
- 扩散控制模型 (D1-D5)
- 反应级数模型 (F0.5-F3)
- 以及其他常用机理模型

### 自燃倾向性评判
- **交叉点温度计算**：基于DTG曲线确定着火点温度
- **自燃风险指数**：基于活化能和挥发分的加权公式
- **等级划分**：参考GB/T 20104-2006
  - 容易自燃
  - 自燃
  - 不易自燃
  - 不自然

### 输出结果
- 动力学三参数（活化能、指前因子、反应机理）及拟合优度R²
- TG-DSC曲线图（PNG格式）
- 判级结论PDF报告
- 批量处理对比表格（Excel格式）

## 安装

```bash
pip install -r requirements.txt
```

或使用开发模式安装：

```bash
pip install -e .
```

## 使用方法

### 1. 生成示例数据

```bash
python -m coal_spontaneous_combustion generate_example data/
```

### 2. 分析煤样数据

```bash
python -m coal_spontaneous_combustion analyze data/example_coal_data.xlsx -o output/
```

### 3. 查看结果摘要

```bash
python -m coal_spontaneous_combustion summary output/results.json
```

查看特定样本详情：

```bash
python -m coal_spontaneous_combustion summary output/results.json -s CS001
```

### 4. 列出所有机理函数

```bash
python -m coal_spontaneous_combustion list-mechanisms
```

## 数据格式要求

### Excel数据文件结构

**Sheet 1: 煤样信息**
| 样本ID | 样本名称 | 水分(%) | 灰分(%) | 挥发分(%) | 固定碳(%) | C(%) | H(%) | O(%) | N(%) | S(%) |
|--------|----------|---------|---------|-----------|-----------|------|------|------|------|------|
| CS001  | 煤样1    | 2.5     | 12.5    | 32.5      | 52.5      | 78.2 | 5.2  | 12.5 | 1.5  | 0.8  |

**TG-DSC数据Sheet**
命名格式：`TGDSC_{升温速率}_{样本ID}`

| 温度(°C) | TG(%) | DSC(mW/mg) |
|----------|-------|------------|
| 30       | 100.0 | 0.0        |
| 35       | 99.9  | 0.1        |
| ...      | ...   | ...        |

## 项目结构

```
coal_spontaneous_combustion/
├── __init__.py          # 包初始化
├── __main__.py          # 入口文件
├── data_models.py       # 数据模型定义
├── data_io.py           # 数据输入输出
├── baseline_correction.py  # 基线校正模块
├── mechanism_functions.py  # 41种机理函数定义
├── kinetics.py          # 动力学参数计算
├── spontaneous_combustion.py  # 自燃倾向性评判
├── visualization.py     # 可视化模块
├── report_generator.py  # PDF报告生成
└── cli.py               # 命令行接口
```

## 运行测试

```bash
python test_tool.py
```

## 技术栈

- **NumPy**: 数值计算
- **SciPy**: 科学计算、优化、信号处理
- **scikit-learn**: 机器学习工具
- **Matplotlib**: 数据可视化
- **Pandas**: 数据处理
- **ReportLab**: PDF报告生成
- **Click**: 命令行接口

## 参考文献

1. GB/T 20104-2006 煤自燃倾向性色谱吸氧鉴定法
2. Kissinger, H. E. (1957). Reaction kinetics in differential thermal analysis.
3. Ozawa, T. (1965). A new method of analyzing thermogravimetric data.
4. Friedman, H. L. (1964). Kinetics of thermal degradation of char-forming plastics.
