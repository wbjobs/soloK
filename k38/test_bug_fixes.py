import numpy as np
import requests
import json


def generate_low_init_angle_fault():
    sampling_rate = 12800
    duration_cycles = 4
    power_frequency = 50.0
    n_samples = int(sampling_rate * duration_cycles / power_frequency)
    t = np.arange(n_samples) / sampling_rate
    
    fault_start = int(n_samples * 0.25)
    init_angle = 0.08
    
    zero_seq_voltage = np.zeros(n_samples)
    zero_seq_voltage[fault_start:] = 0.9 * np.sin(2 * np.pi * power_frequency * t[fault_start:] + init_angle)
    
    feeders = []
    base_amp = 10.0
    
    for feeder_id in range(1, 6):
        phase_a = base_amp * np.sin(2 * np.pi * power_frequency * t)
        phase_b = base_amp * np.sin(2 * np.pi * power_frequency * t - 2*np.pi/3)
        phase_c = base_amp * np.sin(2 * np.pi * power_frequency * t + 2*np.pi/3)
        
        zero_current = np.zeros(n_samples)
        
        if feeder_id == 2:
            fault_current_amp = 10.0
            zero_current[fault_start:] = fault_current_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:] + init_angle + np.pi/2)
            
            fifth_harmonic = 0.2 * fault_current_amp * np.sin(2 * np.pi * 5 * power_frequency * t[fault_start:])
            third_harmonic = 0.1 * fault_current_amp * np.sin(2 * np.pi * 3 * power_frequency * t[fault_start:])
            zero_current[fault_start:] += fifth_harmonic + third_harmonic
            
            high_freq = 0.4 * fault_current_amp * np.exp(-t[fault_start:fault_start+200] * 400) * \
                       np.sin(2 * np.pi * 1000 * t[fault_start:fault_start+200])
            zero_current[fault_start:fault_start+len(high_freq)] += high_freq
        else:
            zero_current[fault_start:] = 0.5 * np.sin(2 * np.pi * power_frequency * t[fault_start:] - np.pi/2)
        
        feeders.append({
            "feeder_id": feeder_id,
            "phase_a": phase_a.tolist(),
            "phase_b": phase_b.tolist(),
            "phase_c": phase_c.tolist(),
            "zero_sequence": zero_current.tolist()
        })
    
    return {
        "sampling_rate": sampling_rate,
        "power_frequency": power_frequency,
        "duration_cycles": duration_cycles,
        "zero_sequence_voltage": zero_seq_voltage.tolist(),
        "feeders": feeders
    }


def generate_arc_suppression_high_resistance():
    sampling_rate = 12800
    duration_cycles = 4
    power_frequency = 50.0
    n_samples = int(sampling_rate * duration_cycles / power_frequency)
    t = np.arange(n_samples) / sampling_rate
    
    fault_start = int(n_samples * 0.25)
    
    zero_seq_voltage = np.zeros(n_samples)
    zero_seq_voltage[fault_start:] = 0.6 * np.sin(2 * np.pi * power_frequency * t[fault_start:])
    
    compensation_rate = 0.12
    feeders = []
    base_amp = 10.0
    
    for feeder_id in range(1, 6):
        phase_a = base_amp * np.sin(2 * np.pi * power_frequency * t)
        phase_b = base_amp * np.sin(2 * np.pi * power_frequency * t - 2*np.pi/3)
        phase_c = base_amp * np.sin(2 * np.pi * power_frequency * t + 2*np.pi/3)
        
        zero_current = np.zeros(n_samples)
        
        if feeder_id == 4:
            fault_current_amp = 0.8 / 800 * 1000
            
            base_fundamental = fault_current_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:] + np.pi/2)
            compensated_fundamental = base_fundamental * (1 - compensation_rate)
            
            fifth_harmonic = 0.25 * fault_current_amp * np.sin(2 * np.pi * 5 * power_frequency * t[fault_start:])
            third_harmonic = 0.15 * fault_current_amp * np.sin(2 * np.pi * 3 * power_frequency * t[fault_start:])
            seventh_harmonic = 0.10 * fault_current_amp * np.sin(2 * np.pi * 7 * power_frequency * t[fault_start:])
            
            zero_current[fault_start:] = compensated_fundamental + fifth_harmonic + third_harmonic + seventh_harmonic
            
            high_freq = 0.3 * fault_current_amp * np.exp(-t[fault_start:fault_start+150] * 400) * \
                       np.sin(2 * np.pi * 600 * t[fault_start:fault_start+150])
            zero_current[fault_start:fault_start+len(high_freq)] += high_freq
        else:
            zero_current[fault_start:] = 0.08 * np.sin(2 * np.pi * power_frequency * t[fault_start:] - np.pi/2)
            zero_current[fault_start:] += 0.02 * np.sin(2 * np.pi * 5 * power_frequency * t[fault_start:])
        
        feeders.append({
            "feeder_id": feeder_id,
            "phase_a": phase_a.tolist(),
            "phase_b": phase_b.tolist(),
            "phase_c": phase_c.tolist(),
            "zero_sequence": zero_current.tolist()
        })
    
    return {
        "sampling_rate": sampling_rate,
        "power_frequency": power_frequency,
        "duration_cycles": duration_cycles,
        "zero_sequence_voltage": zero_seq_voltage.tolist(),
        "feeders": feeders
    }


def test_low_init_angle():
    print("\n" + "=" * 70)
    print("测试1: 故障初相角接近0°时的首半波极性判断")
    print("=" * 70)
    
    test_data = generate_low_init_angle_fault()
    print(f"故障馈线设置为: 2")
    print("故障初相角: ~3° (接近0°)")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n识别结果: 馈线 {result['fault_feeder_id']}")
            print(f"实际故障馈线: 2")
            print(f"识别正确: {result['fault_feeder_id'] == 2}")
            
            print("\n馈线故障概率:")
            for fp in result['feeder_probabilities']:
                marker = " <-- 故障馈线" if fp['feeder_id'] == 2 else ""
                print(f"  馈线 {fp['feeder_id']}: {fp['probability']:.2%}{marker}")
            
            print("\n暂态分量法结果:")
            for ar in result['algorithm_results']:
                if ar['algorithm_name'] == 'transient':
                    for fid, score in ar['confidence_scores'].items():
                        marker = " <-- 故障馈线" if int(fid) == 2 else ""
                        print(f"  馈线 {fid}: {score:.2%}{marker}")
            
            return result['fault_feeder_id'] == 2
        else:
            print(f"请求失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        return False


def test_arc_suppression_high_r():
    print("\n" + "=" * 70)
    print("测试2: 消弧线圈接地系统高阻接地 (五次谐波法)")
    print("=" * 70)
    
    test_data = generate_arc_suppression_high_resistance()
    print(f"故障馈线设置为: 4")
    print("接地电阻: 800Ω (高阻)")
    print("消弧线圈补偿度: 12%")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n识别结果: 馈线 {result['fault_feeder_id']}")
            print(f"实际故障馈线: 4")
            print(f"识别正确: {result['fault_feeder_id'] == 4}")
            print(f"电阻类型: {result['resistance_type']}")
            print(f"估算电阻: {result['estimated_resistance']} Ω")
            
            print("\n馈线故障概率:")
            for fp in result['feeder_probabilities']:
                marker = " <-- 故障馈线" if fp['feeder_id'] == 4 else ""
                print(f"  馈线 {fp['feeder_id']}: {fp['probability']:.2%}{marker}")
            
            print("\n五次谐波法结果:")
            for ar in result['algorithm_results']:
                if ar['algorithm_name'] == 'fifth_harmonic':
                    for fid, score in ar['confidence_scores'].items():
                        marker = " <-- 故障馈线" if int(fid) == 4 else ""
                        print(f"  馈线 {fid}: {score:.2%}{marker}")
            
            return result['fault_feeder_id'] == 4
        else:
            print(f"请求失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        return False


if __name__ == "__main__":
    print("Bug修复验证测试")
    print("请确保服务已启动: python main.py")
    
    all_passed = True
    
    all_passed &= test_low_init_angle()
    all_passed &= test_arc_suppression_high_r()
    
    print("\n" + "=" * 70)
    if all_passed:
        print("所有Bug修复测试通过!")
    else:
        print("部分测试失败!")
    print("=" * 70)
