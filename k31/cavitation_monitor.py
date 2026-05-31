"""
船舶螺旋桨空化监测诊断系统 - 主程序入口
"""
import numpy as np
import time
from typing import Dict, Optional
from config import SystemConfig, DEFAULT_CONFIG, CAVITATION_TYPES
from data_acquisition import HydrophoneSimulator, OperatingConditionsSource, DataBuffer
from preprocessing import SignalPreprocessor, GeometryCorrection
from feature_extraction import FeatureExtractor
from cavitation_detection import CavitationDetector
from cavitation_classifier import CavitationTypeClassifier
from cavitation_severity import CavitationSeverityAssessor
from visualization import VisualizationManager
from alarm_recorder import AlarmAndRecordingManager

class CavitationMonitoringSystem:
    def __init__(self, config: SystemConfig = DEFAULT_CONFIG):
        self.config = config
        
        self.hydrophone_simulator = HydrophoneSimulator(config)
        self.conditions_source = OperatingConditionsSource(config)
        self.data_buffer = DataBuffer(config)
        
        self.preprocessor = SignalPreprocessor(config)
        self.geometry_correction = GeometryCorrection(config)
        
        self.feature_extractor = FeatureExtractor(config)
        self.detector = CavitationDetector(config)
        self.classifier = CavitationTypeClassifier(config)
        self.severity_assessor = CavitationSeverityAssessor(config)
        
        self.visualization = VisualizationManager(config)
        self.alarm_manager = AlarmAndRecordingManager(config)
        
        self.is_running = False
        self.is_calibrated = False
        self.start_time = None
        
        self.processed_frames = 0
        self.total_processing_time = 0.0
    
    def calibrate(self, duration_seconds: float = 5.0):
        print("开始系统校准...")
        
        n_samples = int(duration_seconds * self.config.hydrophone.sample_rate)
        chunk_size = int(0.1 * self.config.hydrophone.sample_rate)
        chunks_collected = 0
        
        while chunks_collected * chunk_size < n_samples:
            raw_signals, conditions = self.hydrophone_simulator.get_samples(
                chunk_size,
                rpm=self.config.conditions.shaft_speed,
                ship_speed=self.config.conditions.ship_speed
            )
            
            processed_signals, metadata = self.preprocessor.preprocess(raw_signals, conditions)
            features = self.feature_extractor.extract_all(processed_signals, conditions['shaft_speed'])
            
            self.detector.calibrate(features)
            self.severity_assessor.noise_analyzer.calibrate(processed_signals)
            
            chunks_collected += 1
        
        self.is_calibrated = True
        print(f"校准完成，共处理 {chunks_collected} 帧数据")
    
    def process_frame(self, raw_signals: np.ndarray, conditions: dict) -> Dict:
        start_time = time.time()
        
        processed_signals, preprocess_metadata = self.preprocessor.preprocess(raw_signals, conditions)
        
        rpm = conditions.get('shaft_speed', self.config.conditions.shaft_speed)
        ship_speed = conditions.get('ship_speed', self.config.conditions.ship_speed)
        
        corrected_signals = self.geometry_correction.correct_for_geometry(
            processed_signals, rpm, ship_speed
        )
        
        features = self.feature_extractor.extract_all(corrected_signals, rpm)
        
        detection_result = self.detector.detect(features)
        
        classification_result = self.classifier.classify(corrected_signals, features)
        
        severity_result = self.severity_assessor.assess(
            corrected_signals, conditions, detection_result, classification_result
        )
        
        self.visualization.update(
            corrected_signals, conditions, 
            detection_result, classification_result, severity_result
        )
        
        alarm_result = self.alarm_manager.process(
            corrected_signals, conditions,
            detection_result, classification_result, severity_result
        )
        
        processing_time = time.time() - start_time
        self.processed_frames += 1
        self.total_processing_time += processing_time
        
        result = {
            'timestamp': conditions.get('timestamp', 0),
            'conditions': conditions,
            'preprocess_metadata': preprocess_metadata,
            'features': features,
            'detection': detection_result,
            'classification': classification_result,
            'severity': severity_result,
            'alarms': alarm_result,
            'processing_time': processing_time,
            'visualization_state': self.visualization.get_current_state()
        }
        
        return result
    
    def run_simulation(self, duration_seconds: float = 60.0, 
                       cavitation_scenario: Optional[int] = None,
                       enable_plotting: bool = False) -> Dict:
        print(f"\n{'='*60}")
        print("船舶螺旋桨空化监测诊断系统 - 仿真运行")
        print(f"{'='*60}\n")
        
        if not self.is_calibrated:
            self.calibrate(3.0)
        
        self.is_running = True
        self.start_time = time.time()
        
        chunk_size = int(0.1 * self.config.hydrophone.sample_rate)
        total_chunks = int(duration_seconds / 0.1)
        current_chunk = 0
        
        simulation_results = []
        
        if cavitation_scenario is not None:
            self.hydrophone_simulator.set_cavitation_state(cavitation_scenario, 0.7)
            print(f"设置空化场景: {CAVITATION_TYPES[cavitation_scenario]} (强度: 0.7)")
        
        print(f"\n开始仿真，时长: {duration_seconds} 秒")
        print(f"采样率: {self.config.hydrophone.sample_rate} Hz")
        print(f"水听器数量: {self.config.hydrophone.num_hydrophones}")
        print(f"每帧样本数: {chunk_size}")
        print(f"总帧数: {total_chunks}\n")
        
        try:
            while current_chunk < total_chunks and self.is_running:
                current_time = self.start_time + current_chunk * 0.1
                
                conditions = self.conditions_source.get_conditions(current_time)
                
                raw_signals, sim_conditions = self.hydrophone_simulator.get_samples(
                    chunk_size,
                    rpm=conditions['shaft_speed'],
                    ship_speed=conditions['ship_speed']
                )
                
                conditions['cavitation_state'] = sim_conditions.get('cavitation_state', 0)
                conditions['cavitation_intensity'] = sim_conditions.get('cavitation_intensity', 0)
                
                result = self.process_frame(raw_signals, conditions)
                simulation_results.append(result)
                
                if current_chunk % 10 == 0:
                    self._print_progress(current_chunk, total_chunks, result)
                
                if result['alarms'].get('recording_saved'):
                    print(f"\n[报警] 数据已保存至: {result['alarms']['recording_saved']}")
                
                current_chunk += 1
                
        except KeyboardInterrupt:
            print("\n用户中断，停止仿真")
        
        self.is_running = False
        
        avg_processing_time = self.total_processing_time / max(1, self.processed_frames)
        print(f"\n{'='*60}")
        print("仿真完成")
        print(f"{'='*60}")
        print(f"总处理帧数: {self.processed_frames}")
        print(f"平均处理时间: {avg_processing_time*1000:.2f} ms/帧")
        print(f"实时处理率: {0.1 / avg_processing_time:.2f}x 实时")
        
        summary = self._generate_summary(simulation_results)
        self._print_summary(summary)
        
        if enable_plotting:
            self._generate_visualizations()
        
        return {
            'results': simulation_results,
            'summary': summary
        }
    
    def _print_progress(self, current: int, total: int, result: Dict):
        progress = current / total * 100
        cav_state = result['classification'].get('class_name', '未知')
        severity = result['severity'].get('severity_level', '未知')
        confidence = result['detection'].get('confidence', 0)
        noise_level = result['detection'].get('noise_level_db', 0)
        
        print(f"[{progress:5.1f}%] 帧 {current}/{total} | "
              f"状态: {cav_state:10s} | "
              f"严重度: {severity:4s} | "
              f"置信度: {confidence:6.1%} | "
              f"噪声级: {noise_level:5.1f} dB | "
              f"处理: {result['processing_time']*1000:5.1f} ms")
    
    def _generate_summary(self, results: list) -> Dict:
        if not results:
            return {}
        
        cavitation_detections = [r for r in results if r['detection'].get('is_cavitating', False)]
        detection_rate = len(cavitation_detections) / len(results)
        
        class_counts = {}
        severity_counts = {}
        avg_confidence = 0
        avg_noise_level = 0
        avg_kurtosis = 0
        avg_sigma_ratio = 0
        avg_severity_score = 0
        
        for r in results:
            cls = r['classification'].get('class_name', '未知')
            sev = r['severity'].get('severity_level', '未知')
            
            class_counts[cls] = class_counts.get(cls, 0) + 1
            severity_counts[sev] = severity_counts.get(sev, 0) + 1
            
            avg_confidence += r['detection'].get('confidence', 0)
            avg_noise_level += r['detection'].get('noise_level_db', 0)
            avg_kurtosis += r['detection'].get('kurtosis', 0)
            avg_sigma_ratio += r['severity'].get('sigma_ratio', 0)
            avg_severity_score += r['severity'].get('severity_score', 0)
        
        n = len(results)
        
        return {
            'total_frames': n,
            'detection_rate': detection_rate,
            'class_distribution': {k: v/n for k, v in class_counts.items()},
            'severity_distribution': {k: v/n for k, v in severity_counts.items()},
            'avg_confidence': avg_confidence / n,
            'avg_noise_level': avg_noise_level / n,
            'avg_kurtosis': avg_kurtosis / n,
            'avg_sigma_ratio': avg_sigma_ratio / n,
            'avg_severity_score': avg_severity_score / n,
            'alarm_count': len(self.visualization.get_alarm_history()),
            'alarm_history': self.visualization.get_alarm_history()
        }
    
    def _print_summary(self, summary: Dict):
        print(f"\n{'='*60}")
        print("运行统计摘要")
        print(f"{'='*60}")
        print(f"空化检测率: {summary.get('detection_rate', 0):.1%}")
        print(f"平均置信度: {summary.get('avg_confidence', 0):.2%}")
        print(f"平均噪声级: {summary.get('avg_noise_level', 0):.1f} dB re 1μPa")
        print(f"平均峰度: {summary.get('avg_kurtosis', 0):.2f}")
        print(f"平均σ/σ_c: {summary.get('avg_sigma_ratio', 0):.3f}")
        print(f"平均严重度: {summary.get('avg_severity_score', 0):.3f}")
        print(f"报警次数: {summary.get('alarm_count', 0)}")
        
        print("\n空化类型分布:")
        for cls, ratio in summary.get('class_distribution', {}).items():
            print(f"  {cls:15s}: {ratio:.1%}")
        
        print("\n严重程度分布:")
        for sev, ratio in summary.get('severity_distribution', {}).items():
            print(f"  {sev:6s}: {ratio:.1%}")
    
    def _generate_visualizations(self):
        print("\n生成可视化图表...")
        
        timestamp = time.strftime('%Y%m%d_%H%M%S')
        
        summary_plot = self.visualization.create_summary_plot(
            f'summary_{timestamp}.png'
        )
        if summary_plot:
            print(f"  趋势图已保存: {summary_plot}")
        
        spectrogram_plot = self.visualization.create_spectrogram_plot(
            f'spectrogram_{timestamp}.png'
        )
        if spectrogram_plot:
            print(f"  瀑布图已保存: {spectrogram_plot}")
        
        propeller_plot = self.visualization.create_propeller_3d_plot(
            f'propeller_3d_{timestamp}.png'
        )
        if propeller_plot:
            print(f"  3D螺旋桨图已保存: {propeller_plot}")
    
    def stop(self):
        self.is_running = False
    
    def get_system_status(self) -> Dict:
        return {
            'is_running': self.is_running,
            'is_calibrated': self.is_calibrated,
            'processed_frames': self.processed_frames,
            'avg_processing_time': self.total_processing_time / max(1, self.processed_frames),
            'config': self.config
        }

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='船舶螺旋桨空化监测诊断系统')
    parser.add_argument('--duration', type=float, default=60.0, help='仿真时长（秒）')
    parser.add_argument('--scenario', type=int, default=None, choices=[0, 1, 2, 3, 4],
                        help='空化场景: 0=无空化, 1=叶梢涡, 2=叶面, 3=叶背, 4=根涡')
    parser.add_argument('--rpm', type=float, default=120.0, help='轴转速（RPM）')
    parser.add_argument('--speed', type=float, default=15.0, help='航速（节）')
    parser.add_argument('--calibrate', type=float, default=3.0, help='校准时长（秒）')
    parser.add_argument('--plot', action='store_true', help='生成可视化图表')
    
    args = parser.parse_args()
    
    config = DEFAULT_CONFIG
    config.conditions.shaft_speed = args.rpm
    config.conditions.ship_speed = args.speed
    
    system = CavitationMonitoringSystem(config)
    
    if args.calibrate > 0:
        system.calibrate(args.calibrate)
    
    results = system.run_simulation(
        duration_seconds=args.duration,
        cavitation_scenario=args.scenario,
        enable_plotting=args.plot
    )
    
    return results

if __name__ == '__main__':
    main()
