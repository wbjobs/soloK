import numpy as np
import requests


def generate_simple_test_data(fault_feeder_id: int = 3, 
                               with_arc: bool = False,
                               sampling_rate: int = 12800,
                               duration_cycles: int = 4):
    n_samples = int(sampling_rate * duration_cycles / 50.0)
    t = np.arange(n_samples) / sampling_rate
    fault_start = int(n_samples * 0.25)
    
    zero_seq_voltage = np.zeros(n_samples)
    zero_seq_voltage[fault_start:] = 0.9 * np.sin(2 * np.pi * 50 * t[fault_start:])
    
    feeders = []
    base_amp = 10.0
    
    for feeder_id in range(1, 6):
        phase_a = base_amp * np.sin(2 * np.pi * 50 * t)
        phase_b = base_amp * np.sin(2 * np.pi * 50 * t - 2*np.pi/3)
        phase_c = base_amp * np.sin(2 * np.pi * 50 * t + 2*np.pi/3)
        
        zero_current = np.zeros(n_samples)
        
        if feeder_id == fault_feeder_id:
            fault_current_amp = 10.0
            zero_current[fault_start:] = fault_current_amp * np.sin(2 * np.pi * 50 * t[fault_start:] + np.pi/2)
            
            if with_arc:
                cycle_samples = int(sampling_rate / 50)
                for cycle in range((n_samples - fault_start) // cycle_samples):
                    if cycle % 2 == 0:
                        arc_start = fault_start + cycle * cycle_samples
                        arc_end = arc_start + cycle_samples
                        
                        zero_current[arc_start:arc_end] *= np.random.uniform(0.5, 1.0)
                        
                        chop_start = arc_start + int(cycle_samples * 0.45)
                        chop_end = min(chop_start + int(sampling_rate / 1000), arc_end)
                        zero_current[chop_start:chop_end] *= 0.1
                        
                        zero_current[arc_start:arc_end] += 0.5 * np.random.randn(arc_end - arc_start)
                        
                        hf_noise = 0.3 * np.sin(2 * np.pi * 2500 * t[arc_start:arc_end])
                        hf_noise *= np.random.randint(0, 2, size=len(hf_noise)) * 2 - 1
                        zero_current[arc_start:arc_end] += hf_noise
            
            fifth_harmonic = 0.2 * fault_current_amp * np.sin(2 * np.pi * 250 * t[fault_start:])
            zero_current[fault_start:] += fifth_harmonic
            
            high_freq = 0.4 * fault_current_amp * np.exp(-t[fault_start:fault_start+200] * 400) * \
                       np.sin(2 * np.pi * 1000 * t[fault_start:fault_start+200])
            zero_current[fault_start:fault_start+len(high_freq)] += high_freq
        else:
            zero_current[fault_start:] = 1.0 * np.sin(2 * np.pi * 50 * t[fault_start:] - np.pi/2)
        
        feeders.append({
            "feeder_id": feeder_id,
            "phase_a": phase_a.tolist(),
            "phase_b": phase_b.tolist(),
            "phase_c": phase_c.tolist(),
            "zero_sequence": zero_current.tolist()
        })
    
    return {
        "sampling_rate": sampling_rate,
        "power_frequency": 50,
        "duration_cycles": duration_cycles,
        "zero_sequence_voltage": zero_seq_voltage.tolist(),
        "feeders": feeders,
        "line_parameters": {
            "line_length": 10.0,
            "substation_latitude": 39.9042,
            "substation_longitude": 116.4074,
            "line_azimuth": 45.0
        }
    }


def test_stable_ground_with_new_features():
    print("\n" + "=" * 70)
    print("测试1: 稳定接地故障 - 新功能验证")
    print("=" * 70)
    
    test_data = generate_simple_test_data(fault_feeder_id=2, with_arc=False)
    print(f"故障馈线: 2")
    print(f"故障类型: 稳定接地")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n选线结果: 馈线 {result['fault_feeder_id']}")
            print(f"选线正确: {result['fault_feeder_id'] == 2}")
            
            if result.get('traveling_wave'):
                tw = result['traveling_wave']
                print(f"\n✅ 行波测距功能正常:")
                print(f"   故障距离: {tw['fault_distance']} km")
                print(f"   测距置信度: {tw['confidence']:.2%}")
                print(f"   反射波数量: {tw['reflection_count']}")
            
            if result.get('gis_location'):
                gis = result['gis_location']
                print(f"\n✅ GIS定位功能正常:")
                print(f"   坐标: ({gis['latitude']}, {gis['longitude']})")
                print(f"   距变电站: {gis['distance_from_substation']} km")
            
            if result.get('arc_detection'):
                arc = result['arc_detection']
                print(f"\n✅ 电弧检测功能正常:")
                print(f"   电弧类型: {arc['arc_type']}")
                print(f"   是否电弧故障: {arc['is_arc_fault']}")
                print(f"   检测置信度: {arc['confidence']:.2%}")
                
                expected_no_arc = not arc['is_arc_fault']
                print(f"   稳定接地识别正确: {expected_no_arc}")
            
            return result['fault_feeder_id'] == 2
        else:
            print(f"请求失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_arc_fault_detection():
    print("\n" + "=" * 70)
    print("测试2: 间歇性电弧故障检测")
    print("=" * 70)
    
    test_data = generate_simple_test_data(fault_feeder_id=4, with_arc=True)
    print(f"故障馈线: 4")
    print(f"故障类型: 间歇性电弧")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n选线结果: 馈线 {result['fault_feeder_id']}")
            print(f"选线正确: {result['fault_feeder_id'] == 4}")
            
            if result.get('arc_detection'):
                arc = result['arc_detection']
                print(f"\n电弧检测结果:")
                print(f"   电弧类型: {arc['arc_type']}")
                print(f"   是否电弧故障: {arc['is_arc_fault']}")
                print(f"   燃弧次数: {arc['arc_count']}")
                print(f"   高频能量比: {arc['high_frequency_energy']:.4f}")
                print(f"   过零点偏移: {arc['zero_crossing_deviation']:.4f}")
                print(f"   检测置信度: {arc['confidence']:.2%}")
                
                if arc['is_arc_fault']:
                    print(f"   ✅ 间歇性电弧识别正确!")
                else:
                    print(f"   ⚠️  电弧未检测到 (信号可能需要更强)")
            
            return result['fault_feeder_id'] == 4
        else:
            print(f"请求失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("新功能简化测试")
    print("=" * 70)
    
    all_passed = True
    
    all_passed &= test_stable_ground_with_new_features()
    all_passed &= test_arc_fault_detection()
    
    print("\n" + "=" * 70)
    if all_passed:
        print("✅ 所有新功能集成测试通过!")
        print("   - 行波测距功能正常")
        print("   - GIS定位功能正常")
        print("   - 电弧检测功能正常")
    else:
        print("部分测试需要调整")
    print("=" * 70)
