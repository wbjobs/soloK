"""
船舶螺旋桨空化监测诊断系统 - 演示脚本
"""
import sys
import os
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import SystemConfig, DEFAULT_CONFIG, CAVITATION_TYPES
from cavitation_monitor import CavitationMonitoringSystem

def demo_basic_functionality():
    print("=" * 70)
    print("船舶螺旋桨空化监测诊断系统 - 功能演示")
    print("=" * 70)
    print()
    
    config = DEFAULT_CONFIG
    config.conditions.shaft_speed = 120.0
    config.conditions.ship_speed = 15.0
    config.hydrophone.num_hydrophones = 8
    config.hydrophone.sample_rate = 200000
    
    system = CavitationMonitoringSystem(config)
    
    print("系统配置:")
    print(f"  水听器数量: {config.hydrophone.num_hydrophones}")
    print(f"  采样率: {config.hydrophone.sample_rate} Hz")
    print(f"  ADC分辨率: {config.hydrophone.adc_bits} 位")
    print(f"  螺旋桨直径: {config.propeller.diameter} m")
    print(f"  叶片数: {config.propeller.num_blades}")
    print(f"  侧斜角: {config.propeller.skew_angle}°")
    print(f"  纵倾角: {config.propeller.rake_angle}°")
    print(f"  额定转速: {config.conditions.shaft_speed} RPM")
    print(f"  额定航速: {config.conditions.ship_speed} 节")
    print()
    
    print("1. 系统校准")
    print("-" * 50)
    system.calibrate(duration_seconds=2.0)
    print()
    
    print("2. 基准测试 - 无空化状态")
    print("-" * 50)
    results_normal = system.run_simulation(
        duration_seconds=10.0,
        cavitation_scenario=0,
        enable_plotting=False
    )
    print()
    
    print("3. 叶梢涡空化测试")
    print("-" * 50)
    results_tip_vortex = system.run_simulation(
        duration_seconds=10.0,
        cavitation_scenario=1,
        enable_plotting=False
    )
    print()
    
    print("4. 叶背空化测试")
    print("-" * 50)
    results_back = system.run_simulation(
        duration_seconds=10.0,
        cavitation_scenario=3,
        enable_plotting=False
    )
    print()
    
    print("=" * 70)
    print("性能对比分析")
    print("=" * 70)
    print()
    
    scenarios = [
        ("无空化", results_normal['summary']),
        ("叶梢涡空化", results_tip_vortex['summary']),
        ("叶背空化", results_back['summary'])
    ]
    
    print(f"{'场景':<15} {'检测率':<10} {'平均噪声级':<12} {'平均峰度':<10} {'σ/σ_c':<10} {'严重度':<10}")
    print("-" * 70)
    
    for name, summary in scenarios:
        if summary:
            print(f"{name:<15} {summary.get('detection_rate', 0):<10.1%} "
                  f"{summary.get('avg_noise_level', 0):<12.1f} "
                  f"{summary.get('avg_kurtosis', 0):<10.2f} "
                  f"{summary.get('avg_sigma_ratio', 0):<10.3f} "
                  f"{summary.get('avg_severity_score', 0):<10.3f}")
    
    print()
    print("=" * 70)
    print("空化类型识别验证")
    print("=" * 70)
    print()
    
    for name, summary in scenarios:
        if summary and 'class_distribution' in summary:
            print(f"场景: {name}")
            for cls, ratio in summary['class_distribution'].items():
                print(f"  {cls}: {ratio:.1%}")
            print()
    
    print("=" * 70)
    print("归一化处理说明")
    print("=" * 70)
    print()
    print("船速归一化:")
    print(f"  参考航速: {config.normalization.reference_speed} 节")
    print(f"  速度指数: {config.normalization.speed_exponent}")
    print(f"  公式: P_norm = P / (V/V_ref)^({config.normalization.speed_exponent}/2)")
    print()
    print("转速归一化:")
    print(f"  参考转速: {config.normalization.reference_rpm} RPM")
    print(f"  转速指数: {config.normalization.rpm_exponent}")
    print(f"  公式: P_norm = P / (N/N_ref)^({config.normalization.rpm_exponent}/2)")
    print()
    print("几何参数修正:")
    print(f"  侧斜角修正: 1 / cos({config.propeller.skew_angle}°) = {1/np.cos(np.radians(config.propeller.skew_angle)):.3f}")
    print(f"  纵倾角修正: 1 / cos({config.propeller.rake_angle}°) = {1/np.cos(np.radians(config.propeller.rake_angle)):.3f}")
    print()
    
    print("=" * 70)
    print("系统阈值配置")
    print("=" * 70)
    print()
    print(f"噪声级阈值: {config.thresholds.noise_level} dB re 1μPa")
    print(f"峰度阈值: {config.thresholds.kurtosis}")
    print(f"偏度阈值: {config.thresholds.skewness}")
    print(f"峰值因子阈值: {config.thresholds.crest_factor}")
    print(f"宽带能量比阈值: {config.thresholds.broadband_energy_ratio}")
    print()
    
    print("=" * 70)
    print("演示完成!")
    print("=" * 70)
    print()
    print("生成可视化图表...")
    
    timestamp = None
    try:
        import time
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        system.visualization.create_summary_plot(f'demo_summary_{timestamp}.png')
        system.visualization.create_spectrogram_plot(f'demo_spectrogram_{timestamp}.png')
        system.visualization.create_propeller_3d_plot(f'demo_propeller_{timestamp}.png')
        print(f"图表已保存到当前目录，前缀: demo_*_{timestamp}.png")
    except Exception as e:
        print(f"图表生成跳过 (需要matplotlib): {e}")
    
    print()
    print("报警记录已保存至: records/ 目录")
    
    return system

def demo_real_time_simulation():
    print("\n" + "=" * 70)
    print("实时监测模拟")
    print("=" * 70)
    print()
    
    config = DEFAULT_CONFIG
    system = CavitationMonitoringSystem(config)
    
    print("开始实时监测 (按 Ctrl+C 停止)...")
    print()
    
    try:
        results = system.run_simulation(
            duration_seconds=30.0,
            enable_plotting=True
        )
    except KeyboardInterrupt:
        print("\n监测已停止")
    
    return system

if __name__ == '__main__':
    print("\n船舶螺旋桨空化监测诊断系统")
    print("=" * 70)
    print()
    print("功能模块:")
    print("  1. 数据采集 - 8通道水听器阵列 (200kHz, 24位ADC)")
    print("  2. 信号预处理 - 船速/转速归一化、滤波、几何修正")
    print("  3. 特征提取 - 时域/频域/高阶谱特征")
    print("  4. 空化检测 - 多特征融合检测算法")
    print("  5. 类型识别 - CNN-1D分类器 (4种空化类型)")
    print("  6. 强度评估 - 空化数σ/σ_c、噪声级增量")
    print("  7. 可视化 - 瀑布图、趋势曲线、3D螺旋桨动画")
    print("  8. 报警记录 - 阈值检测、前后30秒数据保存")
    print()
    
    try:
        demo_basic_functionality()
    except Exception as e:
        print(f"演示过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n按回车键退出...")
    try:
        input()
    except:
        pass
