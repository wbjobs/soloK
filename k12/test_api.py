import requests
import json

BASE_URL = "http://localhost:8000/api/v1"


def test_link_budget():
    print("\n=== 测试链路预算接口 ===")
    payload = {
        "uplink_frequency": 14.0,
        "downlink_frequency": 12.0,
        "satellite_orbit": 35786.0,
        "earth_station_lat": 39.9,
        "earth_station_lon": 116.4,
        "antenna_diameter": 3.0,
        "transmit_power": 100.0,
        "modulation": "QPSK",
        "bandwidth": 36.0,
        "noise_temperature": 290.0,
        "elevation_angle": 45.0
    }

    response = requests.post(f"{BASE_URL}/link_budget", json=payload)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"错误: {response.text}")


def test_interference():
    print("\n=== 测试干扰分析接口 ===")
    payload = {
        "victim_freq": 12.0,
        "victim_eirp": 50.0,
        "victim_bandwidth": 36.0,
        "victim_gt": 25.0,
        "interferer_count": 2,
        "interferer_eirp": [48.0, 45.0],
        "interferer_separation": [2.5, 5.0],
        "interferer_type": ["co_channel", "adjacent_satellite"],
        "antenna_diameter": 3.0,
        "frequency": 12.0
    }

    response = requests.post(f"{BASE_URL}/interference", json=payload)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"错误: {response.text}")


def test_frequency_coordination():
    print("\n=== 测试频率协调接口 ===")
    payload = {
        "satellite_count": 3,
        "satellite_names": ["SAT1", "SAT2", "SAT3"],
        "frequency_bands": [
            [[11.7, 12.2], [12.2, 12.7]],
            [[11.7, 12.2], [12.2, 12.7]],
            [[11.7, 12.2], [12.2, 12.7]]
        ],
        "bandwidth_required": 36.0,
        "eirp_list": [50.0, 48.0, 47.0],
        "gt_list": [25.0, 24.0, 23.0],
        "separation_angles": [
            [0.0, 3.0, 6.0],
            [3.0, 0.0, 3.0],
            [6.0, 3.0, 0.0]
        ]
    }

    response = requests.post(f"{BASE_URL}/frequency_coordination", json=payload)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"错误: {response.text}")


def test_monte_carlo():
    print("\n=== 测试蒙特卡洛仿真接口 ===")
    payload = {
        "iterations": 500,
        "uplink_frequency": 14.0,
        "downlink_frequency": 12.0,
        "satellite_orbit": 35786.0,
        "antenna_diameter": 3.0,
        "transmit_power": 100.0,
        "bandwidth": 36.0,
        "modulation": "QPSK",
        "atmospheric_attenuation_mean": 0.5,
        "atmospheric_attenuation_std": 0.3,
        "pointing_error_mean": 0.1,
        "pointing_error_std": 0.05,
        "rain_attenuation_mean": 1.0,
        "rain_attenuation_std": 0.8,
        "required_margin": 3.0
    }

    response = requests.post(f"{BASE_URL}/monte_carlo", json=payload)
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print(f"状态: {result.get('status')}")
        if result.get('status') == 'completed':
            print(f"平均余量: {result.get('mean_margin')} dB")
            print(f"99%可用度余量: {result.get('availability_99')} dB")
            print(f"99.9%可用度余量: {result.get('availability_999')} dB")
        else:
            print(f"任务ID: {result.get('task_id')}")
    else:
        print(f"错误: {response.text}")


if __name__ == "__main__":
    print("卫星通信链路预算与干扰分析平台 - API测试")
    print("=" * 50)

    try:
        test_link_budget()
        test_interference()
        test_frequency_coordination()
        test_monte_carlo()
    except requests.exceptions.ConnectionError:
        print("\n错误: 无法连接到服务器")
        print("请先运行: python main.py 启动服务器")
