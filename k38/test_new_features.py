import numpy as np
import requests
import json


def generate_traveling_wave_test_data(fault_distance_km: float = 3.5,
                                       sampling_rate: int = 12800,
                                       duration_cycles: int = 4,
                                       power_frequency: float = 50.0):
    n_samples = int(sampling_rate * duration_cycles / power_frequency)
    t = np.arange(n_samples) / sampling_rate
    
    fault_start = int(n_samples * 0.25)
    
    wave_velocity = 2.98e5
    travel_time = fault_distance_km / wave_velocity
    
    zero_seq_voltage = np.zeros(n_samples)
    zero_seq_voltage[fault_start:] = 0.8 * np.sin(2 * np.pi * power_frequency * t[fault_start:])
    
    feeders = []
    base_amp = 10.0
    
    for feeder_id in range(1, 4):
        phase_a = base_amp * np.sin(2 * np.pi * power_frequency * t)
        phase_b = base_amp * np.sin(2 * np.pi * power_frequency * t - 2*np.pi/3)
        phase_c = base_amp * np.sin(2 * np.pi * power_frequency * t + 2*np.pi/3)
        
        zero_current = np.zeros(n_samples)
        
        if feeder_id == 2:
            fault_current_amp = 8.0
            zero_current[fault_start:] = fault_current_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:] + np.pi/2)
            
            tw1_samples = int(travel_time * sampling_rate)
            tw2_samples = int(3 * travel_time * sampling_rate)
            
            wave_amp = 2.0
            for i in range(fault_start, min(fault_start + 100, n_samples)):
                zero_current[i] += wave_amp * np.exp(-(i - fault_start) / 20) * np.sin(2 * np.pi * 1000 * (i - fault_start) / sampling_rate)
            
            for i in range(fault_start + tw1_samples, min(fault_start + tw1_samples + 100, n_samples)):
                zero_current[i] += 0.6 * wave_amp * np.exp(-(i - fault_start - tw1_samples) / 20) * np.sin(2 * np.pi * 1000 * (i - fault_start - tw1_samples) / sampling_rate)
            
            for i in range(fault_start + tw2_samples, min(fault_start + tw2_samples + 100, n_samples)):
                zero_current[i] += 0.3 * wave_amp * np.exp(-(i - fault_start - tw2_samples) / 20) * np.sin(2 * np.pi * 1000 * (i - fault_start - tw2_samples) / sampling_rate)
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
        "feeders": feeders,
        "line_parameters": {
            "line_length": 10.0,
            "substation_latitude": 39.9042,
            "substation_longitude": 116.4074,
            "line_azimuth": 45.0
        }
    }


def generate_arc_fault_test_data(is_intermittent: bool = True,
                                  sampling_rate: int = 12800,
                                  duration_cycles: int = 6,
                                  power_frequency: float = 50.0):
    n_samples = int(sampling_rate * duration_cycles / power_frequency)
    t = np.arange(n_samples) / sampling_rate
    
    fault_start = int(n_samples * 0.25)
    
    zero_seq_voltage = np.zeros(n_samples)
    zero_seq_voltage[fault_start:] = 0.8 * np.sin(2 * np.pi * power_frequency * t[fault_start:])
    
    feeders = []
    base_amp = 10.0
    
    for feeder_id in range(1, 5):
        phase_a = base_amp * np.sin(2 * np.pi * power_frequency * t)
        phase_b = base_amp * np.sin(2 * np.pi * power_frequency * t - 2*np.pi/3)
        phase_c = base_amp * np.sin(2 * np.pi * power_frequency * t + 2*np.pi/3)
        
        zero_current = np.zeros(n_samples)
        
        if feeder_id == 3:
            fault_current_amp = 8.0
            
            if is_intermittent:
                cycle_samples = int(sampling_rate / power_frequency)
                for cycle in range((n_samples - fault_start) // cycle_samples):
                    cycle_start = fault_start + cycle * cycle_samples
                    cycle_end = cycle_start + cycle_samples
                    
                    if cycle % 3 != 2:
                        arc_factor = np.random.uniform(0.6, 1.0)
                        zero_current[cycle_start:cycle_end] = arc_factor * fault_current_amp * np.sin(2 * np.pi * power_frequency * t[cycle_start:cycle_end] + np.pi/2)
                        
                        chop_start = cycle_start + int(cycle_samples * 0.45)
                        chop_end = min(chop_start + int(sampling_rate / 1000), cycle_end)
                        zero_current[chop_start:chop_end] *= np.linspace(1, 0.05, chop_end - chop_start)
                        
                        noise_amp = 0.6
                        zero_current[cycle_start:cycle_end] += noise_amp * np.random.randn(cycle_end - cycle_start)
                        
                        hf_noise = 0.5 * np.sin(2 * np.pi * 2500 * t[cycle_start:cycle_end])
                        hf_noise *= np.random.randint(0, 2, size=len(hf_noise)) * 2 - 1
                        zero_current[cycle_start:cycle_end] += hf_noise
                    else:
                        zero_current[cycle_start:cycle_end] = 0.5 * np.sin(2 * np.pi * power_frequency * t[cycle_start:cycle_end] + np.pi/2)
            else:
                zero_current[fault_start:] = fault_current_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:] + np.pi/2)
                zero_current[fault_start:] += 0.15 * np.random.randn(len(zero_current) - fault_start)
        else:
            zero_current[fault_start:] = 0.8 * np.sin(2 * np.pi * power_frequency * t[fault_start:] - np.pi/2)
        
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
        "feeders": feeders,
        "line_parameters": {
            "line_length": 10.0,
            "substation_latitude": 39.9042,
            "substation_longitude": 116.4074,
            "line_azimuth": 45.0
        }
    }


def test_traveling_wave_ranging():
    print("\n" + "=" * 70)
    print("测试1: 故障行波测距与GIS定位")
    print("=" * 70)
    
    expected_distance = 3.5
    test_data = generate_traveling_wave_test_data(fault_distance_km=expected_distance)
    print(f"设置故障距离: {expected_distance} km")
    print(f"故障馈线: 2")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n识别故障馈线: {result['fault_feeder_id']}")
            print(f"选线正确: {result['fault_feeder_id'] == 2}")
            
            if result.get('traveling_wave'):
                tw = result['traveling_wave']
                print(f"\n行波测距结果:")
                print(f"  测距方法: {tw['method']}")
                print(f"  故障距离: {tw['fault_distance']} km")
                print(f"  测距置信度: {tw['confidence']:.2%}")
                print(f"  行波波速: {tw['wave_velocity']} km/s")
                print(f"  反射波数量: {tw['reflection_count']}")
                print(f"  行波到达时间: {[round(t, 3) for t in tw['arrival_times']]} ms")
                
                if tw['fault_distance'] > 0:
                    error = abs(tw['fault_distance'] - expected_distance)
                    print(f"  测距误差: {error:.3f} km ({error/expected_distance*100:.1f}%)")
            
            if result.get('gis_location'):
                gis = result['gis_location']
                print(f"\nGIS定位结果:")
                print(f"  纬度: {gis['latitude']}")
                print(f"  经度: {gis['longitude']}")
                print(f"  距变电站距离: {gis['distance_from_substation']} km")
                print(f"  线路方位角: {gis['line_azimuth']}°")
            
            return result['fault_feeder_id'] == 2
        else:
            print(f"请求失败: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_arc_detection_intermittent():
    print("\n" + "=" * 70)
    print("测试2: 间歇性电弧故障检测")
    print("=" * 70)
    
    test_data = generate_arc_fault_test_data(is_intermittent=True)
    print(f"故障类型: 间歇性电弧故障")
    print(f"故障馈线: 3")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n识别故障馈线: {result['fault_feeder_id']}")
            print(f"选线正确: {result['fault_feeder_id'] == 3}")
            
            if result.get('arc_detection'):
                arc = result['arc_detection']
                print(f"\n电弧检测结果:")
                print(f"  电弧类型: {arc['arc_type']}")
                print(f"  是否电弧故障: {arc['is_arc_fault']}")
                print(f"  燃弧次数: {arc['arc_count']}")
                print(f"  平均燃弧时间: {arc['average_arc_duration']} ms")
                print(f"  平均熄弧时间: {arc['average_extinguish_duration']} ms")
                print(f"  高频能量比: {arc['high_frequency_energy']:.4f}")
                print(f"  过零点偏移: {arc['zero_crossing_deviation']:.4f}")
                print(f"  检测置信度: {arc['confidence']:.2%}")
                
                is_correct = arc['arc_type'] == 'intermittent_arc' and arc['is_arc_fault']
                print(f"  电弧类型识别正确: {is_correct}")
                
                return result['fault_feeder_id'] == 3 and is_correct
            
            return result['fault_feeder_id'] == 3
        else:
            print(f"请求失败: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def test_stable_ground_detection():
    print("\n" + "=" * 70)
    print("测试3: 稳定接地故障检测（无电弧）")
    print("=" * 70)
    
    test_data = generate_arc_fault_test_data(is_intermittent=False)
    print(f"故障类型: 稳定金属性接地")
    print(f"故障馈线: 3")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": False, "generate_waveform": False},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"\n识别故障馈线: {result['fault_feeder_id']}")
            print(f"选线正确: {result['fault_feeder_id'] == 3}")
            
            if result.get('arc_detection'):
                arc = result['arc_detection']
                print(f"\n电弧检测结果:")
                print(f"  电弧类型: {arc['arc_type']}")
                print(f"  是否电弧故障: {arc['is_arc_fault']}")
                print(f"  检测置信度: {arc['confidence']:.2%}")
                
                is_correct = not arc['is_arc_fault']
                print(f"  非电弧识别正确: {is_correct}")
                
                return result['fault_feeder_id'] == 3 and is_correct
            
            return result['fault_feeder_id'] == 3
        else:
            print(f"请求失败: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("新功能测试: 行波测距 + GIS定位 + 电弧检测")
    print("请确保服务已启动: python main.py")
    
    all_passed = True
    
    all_passed &= test_traveling_wave_ranging()
    all_passed &= test_arc_detection_intermittent()
    all_passed &= test_stable_ground_detection()
    
    print("\n" + "=" * 70)
    if all_passed:
        print("所有新功能测试通过!")
    else:
        print("部分测试失败!")
    print("=" * 70)
