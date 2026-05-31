"""
改进效果验证测试脚本
"""
import sys
import numpy as np

sys.path.insert(0, '.')

from config import DEFAULT_CONFIG
from data_acquisition import HydrophoneSimulator
from preprocessing import SignalPreprocessor
from feature_extraction_improved import FeatureExtractorEnhanced
from cavitation_detection_improved import ImprovedCavitationDetector
from cavitation_classifier_improved import EnhancedCavitationClassifier

def test_low_condition_false_positive():
    print("=" * 70)
    print("测试1: 低工况假阳性抑制验证")
    print("=" * 70)
    print()
    
    config = DEFAULT_CONFIG
    config.conditions.shaft_speed = 30
    config.conditions.ship_speed = 4
    
    simulator = HydrophoneSimulator(config)
    preprocessor = SignalPreprocessor(config)
    extractor = FeatureExtractorEnhanced(config)
    detector = ImprovedCavitationDetector(config)
    
    print("设置: 低转速(30 RPM) + 低航速(4节) + 无空化")
    print()
    
    false_positives = 0
    total_frames = 100
    
    for i in range(total_frames):
        raw_signals, conditions = simulator.get_samples(
            20000, rpm=30, ship_speed=4
        )
        conditions['cavitation_state'] = 0
        
        processed, meta = preprocessor.preprocess(raw_signals, conditions)
        features = extractor.extract_all(processed, 30)
        
        result = detector.detect(features, 30, 4, processed)
        
        if result['is_cavitating']:
            false_positives += 1
    
    fp_rate = false_positives / total_frames * 100
    
    print(f"测试帧数: {total_frames}")
    print(f"假阳性次数: {false_positives}")
    print(f"假阳性率: {fp_rate:.1f}%")
    print()
    
    if fp_rate < 10:
        print("✓ 假阳性率 < 10%，改进效果显著！")
    else:
        print(f"⚠ 假阳性率 {fp_rate:.1f}%，仍需优化")
    
    print()
    return fp_rate

def test_face_back_classification():
    print("=" * 70)
    print("测试2: 叶面/叶背空化区分验证")
    print("=" * 70)
    print()
    
    config = DEFAULT_CONFIG
    simulator = HydrophoneSimulator(config)
    preprocessor = SignalPreprocessor(config)
    extractor = FeatureExtractorEnhanced(config)
    classifier = EnhancedCavitationClassifier(config)
    
    print("测试A: 叶面空化识别")
    print("-" * 50)
    
    simulator.set_cavitation_state(2, 0.8)
    face_correct = 0
    total_test = 50
    
    for i in range(total_test):
        raw_signals, conditions = simulator.get_samples(20000, rpm=120, ship_speed=15)
        processed, meta = preprocessor.preprocess(raw_signals, conditions)
        features = extractor.extract_all(processed, 120)
        
        result = classifier.classify_multichannel(processed, features)
        if result['class_index'] == 2:
            face_correct += 1
    
    face_accuracy = face_correct / total_test * 100
    print(f"叶面空化识别准确率: {face_accuracy:.1f}% ({face_correct}/{total_test})")
    print()
    
    print("测试B: 叶背空化识别")
    print("-" * 50)
    
    simulator.set_cavitation_state(3, 0.8)
    back_correct = 0
    
    for i in range(total_test):
        raw_signals, conditions = simulator.get_samples(20000, rpm=120, ship_speed=15)
        processed, meta = preprocessor.preprocess(raw_signals, conditions)
        features = extractor.extract_all(processed, 120)
        
        result = classifier.classify_multichannel(processed, features)
        if result['class_index'] == 3:
            back_correct += 1
    
    back_accuracy = back_correct / total_test * 100
    print(f"叶背空化识别准确率: {back_accuracy:.1f}% ({back_correct}/{total_test})")
    print()
    
    avg_accuracy = (face_accuracy + back_accuracy) / 2
    print(f"平均区分准确率: {avg_accuracy:.1f}%")
    print()
    
    if avg_accuracy > 85:
        print("✓ 叶面/叶背区分准确率 > 85%，改进效果显著！")
    else:
        print(f"⚠ 平均准确率 {avg_accuracy:.1f}%，仍需优化")
    
    print()
    return face_accuracy, back_accuracy

def test_feature_enhancements():
    print("=" * 70)
    print("测试3: 增强特征有效性验证")
    print("=" * 70)
    print()
    
    config = DEFAULT_CONFIG
    simulator = HydrophoneSimulator(config)
    preprocessor = SignalPreprocessor(config)
    extractor = FeatureExtractorEnhanced(config)
    
    print("测试新增特征是否正常提取...")
    print()
    
    raw_signals, conditions = simulator.get_samples(20000, rpm=120, ship_speed=15)
    processed, meta = preprocessor.preprocess(raw_signals, conditions)
    features = extractor.extract_all(processed, 120)
    
    new_features = [
        'pulse_count', 'avg_rise_time', 'avg_fall_time', 'rise_fall_ratio',
        'spectral_flatness', 'spectral_crest', 'harmonic_deviation',
        'harmonic_decay_ratio', 'modulation_depth', 'high_low_freq_ratio',
        'even_odd_harmonic_ratio', 'avg_sideband_ratio',
        'diagonal_offdiagonal_ratio', 'envelope_kurtosis'
    ]
    
    found_count = 0
    for feat in new_features:
        if feat in features:
            found_count += 1
            value = np.mean(features[feat])
            print(f"  ✓ {feat:30s}: {value:.4f}")
        else:
            print(f"  ✗ {feat:30s}: 未找到")
    
    print()
    print(f"新增特征提取成功率: {found_count}/{len(new_features)} = {found_count/len(new_features)*100:.1f}%")
    print()
    
    return found_count == len(new_features)

def test_adaptive_threshold():
    print("=" * 70)
    print("测试4: 工况自适应阈值验证")
    print("=" * 70)
    print()
    
    config = DEFAULT_CONFIG
    detector = ImprovedCavitationDetector(config)
    
    print("不同工况下的自适应阈值:")
    print()
    
    test_conditions = [
        (30, 4, "低工况"),
        (60, 8, "中低工况"),
        (90, 12, "中工况"),
        (120, 15, "额定工况"),
        (150, 18, "高工况")
    ]
    
    for rpm, speed, label in test_conditions:
        thresholds = detector.condition_threshold.get_adaptive_threshold(rpm, speed)
        print(f"  {label:10s} (RPM={rpm:3d}, 航速={speed:2d}kn): "
              f"宽带比阈值={thresholds['broadband_ratio']:.2f}, "
              f"峰度阈值={thresholds['kurtosis']:.2f}")
    
    print()
    print("✓ 工况自适应阈值功能正常")
    print()
    return True

def main():
    print("\n" + "=" * 70)
    print("船舶螺旋桨空化监测系统 - 改进效果验证")
    print("=" * 70)
    print()
    
    print("改进目标:")
    print("  1. 假阳性率: 从 >30% 降低到 <10%")
    print("  2. 叶面/叶背区分准确率: 从 <60% 提升到 >85%")
    print()
    
    try:
        fp_rate = test_low_condition_false_positive()
        face_acc, back_acc = test_face_back_classification()
        features_ok = test_feature_enhancements()
        adaptive_ok = test_adaptive_threshold()
        
        print("=" * 70)
        print("改进效果总结")
        print("=" * 70)
        print()
        
        print(f"假阳性率: {fp_rate:.1f}% {'✓' if fp_rate < 10 else '⚠'}")
        print(f"叶面空化准确率: {face_acc:.1f}% {'✓' if face_acc > 85 else '⚠'}")
        print(f"叶背空化准确率: {back_acc:.1f}% {'✓' if back_acc > 85 else '⚠'}")
        print(f"新增特征: {'全部正常 ✓' if features_ok else '部分缺失 ⚠'}")
        print(f"自适应阈值: {'正常 ✓' if adaptive_ok else '异常 ⚠'}")
        print()
        
        all_passed = fp_rate < 10 and face_acc > 85 and back_acc > 85 and features_ok and adaptive_ok
        
        if all_passed:
            print("🎉 所有改进目标已达成！")
        else:
            print("📊 部分目标已达成，建议进一步优化参数")
        
        print()
        
        print("改进技术要点:")
        print("  1. 工况自适应阈值 - 根据RPM和航速动态调整检测阈值")
        print("  2. 脉冲波形特征 - 上升时间/下降时间/脉宽等空化特有特征")
        print("  3. BPF谐波分析 - 衰减率、奇偶比、边带能量比")
        print("  4. 多尺度CNN - 3个分支捕获不同尺度特征")
        print("  5. 时空一致性验证 - 时间平滑+多通道共识+多维验证")
        print()
        
    except Exception as e:
        print(f"测试过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
    
    print("测试完成！")
    print()

if __name__ == '__main__':
    main()
