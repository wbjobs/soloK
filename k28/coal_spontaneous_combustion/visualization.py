"""
可视化模块 - TG-DSC曲线图绘制
"""
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams
from typing import Dict, List, Optional

from .data_models import CoalSample, TGDSCData
from .kinetics import friedman_method

rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
rcParams['axes.unicode_minus'] = False


def plot_tg_dsc_curves(sample: CoalSample, output_file: str, figsize: tuple = (12, 8)):
    """
    绘制TG-DSC曲线图（多升温速率对比）
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=figsize, sharex=True)
    
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd']
    
    for idx, (beta, data) in enumerate(sorted(sample.tg_dsc_data.items())):
        color = colors[idx % len(colors)]
        
        ax1.plot(data.temperature, data.tg, color=color, linewidth=2, label=f'{beta} °C/min')
        
        dtg_scaled = data.dtg * 100
        ax2.plot(data.temperature, dtg_scaled, color=color, linewidth=2, label=f'{beta} °C/min')
    
    ax1.set_ylabel('TG (%)', fontsize=12)
    ax1.set_title(f'{sample.sample_name} - TG-DSC曲线', fontsize=14, fontweight='bold')
    ax1.legend(loc='best')
    ax1.grid(True, alpha=0.3)
    ax1.set_ylim(bottom=0)
    
    ax2.set_xlabel('温度 (°C)', fontsize=12)
    ax2.set_ylabel('DTG (×100 %/°C)', fontsize=12)
    ax2.legend(loc='best')
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()


def plot_friedman_e_vs_alpha(sample: CoalSample, output_file: str, figsize: tuple = (10, 6)):
    """
    绘制Friedman法的活化能-转化率曲线
    """
    friedman_result = friedman_method(sample.tg_dsc_data)
    
    if len(friedman_result['e_vs_alpha']) == 0:
        return
    
    fig, ax1 = plt.subplots(figsize=figsize)
    
    alpha = friedman_result['e_vs_alpha'][:, 0]
    ea = friedman_result['e_vs_alpha'][:, 1]
    r2 = friedman_result['e_vs_alpha'][:, 2]
    
    ax1.plot(alpha, ea, 'b-o', linewidth=2, markersize=6, label='活化能 Ea')
    ax1.set_xlabel('转化率 α', fontsize=12)
    ax1.set_ylabel('活化能 Ea (kJ/mol)', fontsize=12, color='b')
    ax1.tick_params(axis='y', labelcolor='b')
    ax1.grid(True, alpha=0.3)
    
    ax2 = ax1.twinx()
    ax2.plot(alpha, r2, 'r--s', linewidth=2, markersize=4, label='R²')
    ax2.set_ylabel('拟合优度 R²', fontsize=12, color='r')
    ax2.tick_params(axis='y', labelcolor='r')
    ax2.set_ylim(0, 1.05)
    
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='best')
    
    plt.title(f'{sample.sample_name} - Friedman等转化率法', fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()


def plot_comparison_tg(samples: List[CoalSample], output_file: str, 
                       heating_rate: float = 10.0, figsize: tuple = (12, 8)):
    """
    批量对比多个煤样的TG曲线
    """
    fig, ax = plt.subplots(figsize=figsize)
    
    colors = plt.cm.tab10(np.linspace(0, 1, len(samples)))
    
    for idx, sample in enumerate(samples):
        if heating_rate in sample.tg_dsc_data:
            data = sample.tg_dsc_data[heating_rate]
            ax.plot(data.temperature, data.tg, color=colors[idx], 
                    linewidth=2, label=sample.sample_name)
    
    ax.set_xlabel('温度 (°C)', fontsize=12)
    ax.set_ylabel('TG (%)', fontsize=12)
    ax.set_title(f'多煤样TG曲线对比 ({heating_rate} °C/min)', fontsize=14, fontweight='bold')
    ax.legend(loc='best')
    ax.grid(True, alpha=0.3)
    ax.set_ylim(bottom=0)
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()


def plot_risk_comparison(samples: List[CoalSample], output_file: str, figsize: tuple = (12, 6)):
    """
    绘制多个煤样的自燃风险对比图
    """
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=figsize)
    
    sample_names = [s.sample_name for s in samples]
    risk_indices = [s.sc_result.risk_index if s.sc_result else 0 for s in samples]
    crossing_temps = [s.sc_result.crossing_point_temp if s.sc_result else 0 for s in samples]
    
    colors = plt.cm.RdYlGn_r(np.array(risk_indices) / 100)
    
    bars1 = ax1.barh(sample_names, risk_indices, color=colors)
    ax1.set_xlabel('自燃风险指数', fontsize=12)
    ax1.set_title('自燃风险指数对比', fontsize=12, fontweight='bold')
    ax1.set_xlim(0, 100)
    ax1.axvline(x=50, color='r', linestyle='--', alpha=0.5, label='临界值')
    ax1.grid(True, alpha=0.3, axis='x')
    
    bars2 = ax2.barh(sample_names, crossing_temps, color='skyblue')
    ax2.set_xlabel('交叉点温度 (°C)', fontsize=12)
    ax2.set_title('交叉点温度对比', fontsize=12, fontweight='bold')
    ax2.axvline(x=190, color='r', linestyle='--', alpha=0.5, label='容易自燃临界')
    ax2.axvline(x=230, color='orange', linestyle='--', alpha=0.5, label='自燃临界')
    ax2.grid(True, alpha=0.3, axis='x')
    ax2.legend(loc='best')
    
    plt.tight_layout()
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    plt.close()
