import numpy as np
import requests
import json
from typing import List, Dict


def generate_test_fault_data(num_feeders: int = 5, 
                            fault_feeder: int = 2,
                            sampling_rate: int = 12800,
                            duration_cycles: int = 4,
                            power_frequency: float = 50.0,
                            fault_resistance: float = 100.0,
                            grounding_type: str = "ungrounded") -> Dict:
    n_samples = int(sampling_rate * duration_cycles / power_frequency)
    t = np.arange(n_samples) / sampling_rate
    
    fault_start = int(n_samples * 0.25)
    
    base_amp = 10.0
    zero_volt_amp = 0.8
    
    zero_seq_voltage = np.zeros(n_samples)
    
    feeders = []
    
    for feeder_id in range(1, num_feeders + 1):
        phase_a = base_amp * np.sin(2 * np.pi * power_frequency * t + np.random.uniform(-0.1, 0.1))
        phase_b = base_amp * np.sin(2 * np.pi * power_frequency * t - 2*np.pi/3 + np.random.uniform(-0.1, 0.1))
        phase_c = base_amp * np.sin(2 * np.pi * power_frequency * t + 2*np.pi/3 + np.random.uniform(-0.1, 0.1))
        
        zero_current = np.zeros(n_samples)
        
        if feeder_id == fault_feeder:
            fault_current_amp = zero_volt_amp * 1000 / fault_resistance
            zero_current[fault_start:] = fault_current_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:] + np.pi/2)
            
            fifth_harmonic = 0.15 * fault_current_amp * np.sin(2 * np.pi * 5 * power_frequency * t[fault_start:])
            zero_current[fault_start:] += fifth_harmonic
            
            high_freq_transient = 0.3 * fault_current_amp * np.exp(-t[fault_start:fault_start+int(sampling_rate/100)] * 500) * \
                                  np.sin(2 * np.pi * 500 * t[fault_start:fault_start+int(sampling_rate/100)])
            zero_current[fault_start:fault_start+len(high_freq_transient)] += high_freq_transient
            
            phase_a[fault_start:] *= 0.7
        else:
            zero_current[fault_start:] = 0.05 * base_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:] - np.pi/2)
        
        feeders.append({
            "feeder_id": feeder_id,
            "phase_a": phase_a.tolist(),
            "phase_b": phase_b.tolist(),
            "phase_c": phase_c.tolist(),
            "zero_sequence": zero_current.tolist()
        })
    
    zero_seq_voltage[fault_start:] = zero_volt_amp * np.sin(2 * np.pi * power_frequency * t[fault_start:])
    
    return {
        "sampling_rate": sampling_rate,
        "power_frequency": power_frequency,
        "duration_cycles": duration_cycles,
        "zero_sequence_voltage": zero_seq_voltage.tolist(),
        "feeders": feeders
    }


def test_analyze_api():
    print("=" * 60)
    print("测试故障分析API")
    print("=" * 60)
    
    test_data = generate_test_fault_data(
        num_feeders=5,
        fault_feeder=3,
        fault_resistance=100.0
    )
    
    print(f"\n生成测试数据: {len(test_data['feeders'])} 条馈线, 故障馈线: 3")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/analyze",
            params={"save_history": True, "generate_waveform": True},
            json=test_data,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print("\n" + "=" * 60)
            print("分析结果:")
            print("=" * 60)
            print(f"故障类型: {result['fault_type']}")
            print(f"故障馈线: {result['fault_feeder_id']}")
            print(f"母线故障: {result['is_bus_fault']}")
            print(f"接地方式: {result['grounding_type']}")
            print(f"接地电阻类型: {result['resistance_type']}")
            print(f"估算电阻: {result['estimated_resistance']} Ω")
            print(f"故障起始采样点: {result['fault_start_sample']}")
            print(f"波形图生成: {'是' if result.get('waveform_base64') else '否'}")
            
            print("\n馈线故障概率排序:")
            for fp in result['feeder_probabilities']:
                print(f"  馈线 {fp['feeder_id']}: {fp['probability']:.2%} (排名 {fp['rank']})")
            
            print("\n各算法结果:")
            for ar in result['algorithm_results']:
                print(f"\n  {ar['algorithm_name']} (权重: {ar['weight']:.2f}):")
                print(f"    候选馈线: {ar['candidate_feeders']}")
                for fid, score in ar['confidence_scores'].items():
                    print(f"    馈线 {fid}: {score:.2%}")
            
            return True
        else:
            print(f"请求失败: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"测试失败: {str(e)}")
        return False


def test_statistics_api():
    print("\n" + "=" * 60)
    print("测试统计信息API")
    print("=" * 60)
    
    try:
        response = requests.get("http://localhost:8000/api/statistics", timeout=10)
        if response.status_code == 200:
            stats = response.json()
            print(f"总记录数: {stats['total_records']}")
            print(f"故障类型分布: {stats['fault_type_distribution']}")
            print(f"接地方式分布: {stats['grounding_type_distribution']}")
            return True
        else:
            print(f"请求失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"测试失败: {str(e)}")
        return False


def test_health_api():
    print("\n" + "=" * 60)
    print("测试健康检查API")
    print("=" * 60)
    
    try:
        response = requests.get("http://localhost:8000/api/health", timeout=5)
        if response.status_code == 200:
            health = response.json()
            print(f"服务状态: {health['status']}")
            print(f"时间戳: {health['timestamp']}")
            return True
        else:
            print(f"请求失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"测试失败: {str(e)}")
        return False


def test_root_api():
    print("\n" + "=" * 60)
    print("测试根API")
    print("=" * 60)
    
    try:
        response = requests.get("http://localhost:8000/", timeout=5)
        if response.status_code == 200:
            root = response.json()
            print(f"服务名称: {root['service']}")
            print(f"版本: {root['version']}")
            print(f"状态: {root['status']}")
            print("\n支持的算法:")
            for alg in root['algorithms']:
                print(f"  - {alg}")
            return True
        else:
            print(f"请求失败: {response.status_code}")
            return False
    except Exception as e:
        print(f"测试失败: {str(e)}")
        return False


def save_test_data(filename: str = "test_data.json"):
    test_data = generate_test_fault_data(num_feeders=5, fault_feeder=2, fault_resistance=50.0)
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(test_data, f, indent=2)
    print(f"\n测试数据已保存到: {filename}")


if __name__ == "__main__":
    print("配电网单相接地故障选线API服务测试")
    print("请确保服务已启动: python main.py")
    
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "generate":
        save_test_data()
        sys.exit(0)
    
    all_passed = True
    
    all_passed &= test_root_api()
    all_passed &= test_health_api()
    all_passed &= test_analyze_api()
    all_passed &= test_statistics_api()
    
    print("\n" + "=" * 60)
    if all_passed:
        print("所有测试通过!")
    else:
        print("部分测试失败!")
    print("=" * 60)
