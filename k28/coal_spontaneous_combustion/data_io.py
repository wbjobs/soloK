"""
数据输入输出模块
"""
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional
import json

from .data_models import (
    CoalSample, ProximateAnalysis, UltimateAnalysis, TGDSCData
)


def read_excel_data(file_path: str) -> List[CoalSample]:
    """
    从Excel文件读取煤样数据
    
    Excel文件结构：
    - Sheet1: 煤样基本信息（样本ID、名称、工业分析、元素分析）
    - Sheet_<rate>: 各升温速率的TG-DSC数据
    """
    file_path = Path(file_path)
    xl = pd.ExcelFile(file_path)
    
    samples = []
    
    info_df = xl.parse('煤样信息') if '煤样信息' in xl.sheet_names else xl.parse(xl.sheet_names[0])
    
    for _, row in info_df.iterrows():
        sample_id = str(row.get('样本ID', row.get('sample_id', '')))
        sample_name = str(row.get('样本名称', row.get('sample_name', sample_id)))
        
        proximate = ProximateAnalysis(
            moisture=float(row.get('水分', row.get('moisture', 0))),
            ash=float(row.get('灰分', row.get('ash', 0))),
            volatile=float(row.get('挥发分', row.get('volatile', 0))),
            fixed_carbon=float(row.get('固定碳', row.get('fixed_carbon', 0)))
        )
        
        ultimate = UltimateAnalysis(
            c=float(row.get('C', row.get('碳', 0))),
            h=float(row.get('H', row.get('氢', 0))),
            o=float(row.get('O', row.get('氧', 0))),
            n=float(row.get('N', row.get('氮', 0))),
            s=float(row.get('S', row.get('硫', 0)))
        )
        
        sample = CoalSample(
            sample_id=sample_id,
            sample_name=sample_name,
            proximate=proximate,
            ultimate=ultimate
        )
        
        for rate in [5, 10, 15, 20]:
            sheet_patterns = [
                f'TGDSC_{rate}',
                f'TGDSC_{rate}_{sample_id}',
                f'{sample_id}_{rate}'
            ]
            
            for sheet_name in sheet_patterns:
                if sheet_name in xl.sheet_names:
                    df = xl.parse(sheet_name)
                    temp = df['温度(°C)'].values if '温度(°C)' in df.columns else df.iloc[:, 0].values
                    tg = df['TG(%)'].values if 'TG(%)' in df.columns else df.iloc[:, 1].values
                    dsc = df['DSC(mW/mg)'].values if 'DSC(mW/mg)' in df.columns else None
                    
                    tg_data = TGDSCData(
                        heating_rate=rate,
                        temperature=temp,
                        tg=tg,
                        dsc=dsc
                    )
                    sample.add_tg_dsc_data(rate, tg_data)
                    break
        
        samples.append(sample)
    
    return samples


def read_tg_dsc_csv(file_path: str, heating_rate: float) -> TGDSCData:
    """从CSV文件读取单个升温速率的TG-DSC数据"""
    df = pd.read_csv(file_path)
    
    temp_col = next((c for c in df.columns if '温度' in c or 'temp' in c.lower()), df.columns[0])
    tg_col = next((c for c in df.columns if 'TG' in c or 'tg' in c), df.columns[1])
    dsc_col = next((c for c in df.columns if 'DSC' in c or 'dsc' in c), None)
    
    temperature = df[temp_col].values
    tg = df[tg_col].values
    dsc = df[dsc_col].values if dsc_col else None
    
    return TGDSCData(
        heating_rate=heating_rate,
        temperature=temperature,
        tg=tg,
        dsc=dsc
    )


def save_results_json(samples: List[CoalSample], output_file: str):
    """保存结果为JSON文件"""
    results = []
    for sample in samples:
        sample_dict = {
            'sample_id': sample.sample_id,
            'sample_name': sample.sample_name,
            'proximate': {
                'moisture': sample.proximate.moisture,
                'ash': sample.proximate.ash,
                'volatile': sample.proximate.volatile,
                'fixed_carbon': sample.proximate.fixed_carbon
            },
            'ultimate': {
                'c': sample.ultimate.c,
                'h': sample.ultimate.h,
                'o': sample.ultimate.o,
                'n': sample.ultimate.n,
                's': sample.ultimate.s
            },
            'kinetic_results': {
                k: {
                    'method': v.method,
                    'activation_energy': v.activation_energy,
                    'pre_exponential_factor': v.pre_exponential_factor,
                    'r_squared': v.r_squared,
                    'mechanism_function': v.mechanism_function,
                    'mechanism_code': v.mechanism_code
                } for k, v in sample.kinetic_results.items()
            },
            'sc_result': {
                'crossing_point_temp': sample.sc_result.crossing_point_temp,
                'risk_index': sample.sc_result.risk_index,
                'risk_level': sample.sc_result.risk_level,
                'activation_energy_avg': sample.sc_result.activation_energy_avg,
                'volatile_content': sample.sc_result.volatile_content
            } if sample.sc_result else None
        }
        results.append(sample_dict)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


def save_comparison_table(samples: List[CoalSample], output_file: str):
    """保存批量对比表格"""
    data = []
    for sample in samples:
        row = {
            '样本ID': sample.sample_id,
            '样本名称': sample.sample_name,
            '挥发分(%)': sample.proximate.volatile,
            '交叉点温度(°C)': sample.sc_result.crossing_point_temp if sample.sc_result else None,
            '自燃风险指数': sample.sc_result.risk_index if sample.sc_result else None,
            '自燃等级': sample.sc_result.risk_level if sample.sc_result else None,
        }
        
        for method_name, result in sample.kinetic_results.items():
            row[f'{method_name}_Ea(kJ/mol)'] = result.activation_energy
            row[f'{method_name}_lnA'] = np.log(result.pre_exponential_factor) if result.pre_exponential_factor > 0 else 0
            row[f'{method_name}_R²'] = result.r_squared
        
        data.append(row)
    
    df = pd.DataFrame(data)
    df.to_excel(output_file, index=False)
