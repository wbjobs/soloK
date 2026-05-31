#!/usr/bin/env python
import requests
import json

BASE_URL = "http://localhost:8000"


def test_health():
    print("Testing /health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2, ensure_ascii=False))
    return response.status_code == 200


def test_kilns():
    print("\nTesting /kilns endpoint...")
    response = requests.get(f"{BASE_URL}/kilns")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Total kilns: {len(data['kilns'])}")
    print("First 5 kilns:")
    for k in data['kilns'][:5]:
        print(f"  - {k['kiln_id']}: {k['kiln_name']}")
    return response.status_code == 200


def test_identify():
    print("\nTesting /identify endpoint...")
    sample_data = {
        "sample_id": "test_001",
        "composition": {
            "Na2O": 2.5,
            "MgO": 0.8,
            "Al2O3": 18.0,
            "SiO2": 72.0,
            "P2O5": 0.1,
            "K2O": 3.0,
            "CaO": 1.5,
            "TiO2": 0.5,
            "MnO": 0.05,
            "Fe2O3": 1.2,
            "ZrO2": 0.03,
            "SrO": 0.02
        },
        "preprocess_method": "sum"
    }

    response = requests.post(
        f"{BASE_URL}/identify",
        json=sample_data
    )
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Predicted kiln: {result['kiln_name']} ({result['kiln_id']})")
    print(f"Confidence: {result['confidence']:.2%}")
    print(f"Reliable: {result['is_reliable']}")
    print(f"Predicted year: {result['predicted_year']} ({result['year_min']}-{result['year_max']})")
    return response.status_code == 200


def test_batch_identify():
    print("\nTesting /batch_identify endpoint...")
    batch_data = {
        "samples": [
            {
                "sample_id": f"batch_{i:03d}",
                "composition": {
                    "Na2O": 2.0 + i*0.1,
                    "MgO": 1.0,
                    "Al2O3": 17.0 + i*0.2,
                    "SiO2": 70.0 - i*0.3,
                    "P2O5": 0.1,
                    "K2O": 3.0,
                    "CaO": 2.0,
                    "TiO2": 0.6,
                    "MnO": 0.05,
                    "Fe2O3": 1.5,
                    "ZrO2": 0.03,
                    "SrO": 0.02
                }
            }
            for i in range(5)
        ],
        "enable_clustering": True
    }

    response = requests.post(
        f"{BASE_URL}/batch_identify",
        json=batch_data
    )
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Processed {len(result['results'])} samples")
    for i, r in enumerate(result['results'][:3]):
        print(f"  Sample {r['sample_id']}: {r['kiln_name']} (conf: {r['confidence']:.2%})")

    if result.get('clustering_result'):
        cr = result['clustering_result']
        print(f"Clustering: {cr['n_clusters']} clusters, silhouette score: {cr['silhouette_score']:.3f}")
        print(f"Cluster sizes: {cr['cluster_sizes']}")

    return response.status_code == 200


def test_reference():
    print("\nTesting /reference/{kiln_id} endpoint...")
    kiln_id = "jingdezhen"
    response = requests.get(f"{BASE_URL}/reference/{kiln_id}")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Kiln: {data['kiln_name']}")
        print(f"Sample count: {data['sample_count']}")
        print(f"Year range: {data['year_stats']['min']}-{data['year_stats']['max']}")
        print("Key element means:")
        for elem in ['SiO2', 'Al2O3', 'Fe2O3', 'CaO']:
            stats = data['element_stats'][elem]
            print(f"  {elem}: {stats['mean']:.2f}% (±{stats['std']:.2f})")
    return response.status_code == 200


def main():
    print("="*60)
    print("古陶瓷成分分析溯源API - 测试脚本")
    print("="*60)

    tests = [
        ("Health check", test_health),
        ("Kiln list", test_kilns),
        ("Single identify", test_identify),
        ("Batch identify", test_batch_identify),
        ("Reference data", test_reference)
    ]

    passed = 0
    failed = 0

    for name, test_func in tests:
        try:
            if test_func():
                print(f"✓ {name} - PASSED")
                passed += 1
            else:
                print(f"✗ {name} - FAILED")
                failed += 1
        except Exception as e:
            print(f"✗ {name} - ERROR: {e}")
            failed += 1

    print("\n" + "="*60)
    print(f"Results: {passed} passed, {failed} failed")
    print("="*60)


if __name__ == "__main__":
    main()
