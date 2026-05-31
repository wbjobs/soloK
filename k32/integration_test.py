import os
import sys
import time
import json


def run_tests():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    from fastapi.testclient import TestClient
    from main import app
    from config import UPLOAD_DIR, FASTA_DIR, DATABASE_PATH
    from database import init_db

    if os.path.exists(DATABASE_PATH):
        os.remove(DATABASE_PATH)

    init_db()

    client = TestClient(app)

    print("=" * 60)
    print("Integration Test: Proteomics API Service")
    print("=" * 60)

    print("\n[1] Testing root endpoint...")
    response = client.get("/")
    assert response.status_code == 200, f"Root endpoint failed: {response.status_code}"
    print(f"    OK: {response.json()['name']}")

    print("\n[2] Testing FASTA database build...")
    fasta_path = os.path.join(FASTA_DIR, "sample.fasta")
    response = client.post(
        "/fasta/build",
        data={
            "name": "test_db",
            "file_path": fasta_path,
            "enzyme": "trypsin",
            "include_reverse": "true",
        },
    )
    if response.status_code == 200:
        print(f"    OK: Built database with {response.json()['peptide_count']} peptides")
    else:
        print(f"    Response: {response.status_code} - {response.json()}")

    print("\n[3] Testing FASTA database listing...")
    response = client.get("/fasta/databases")
    assert response.status_code == 200
    dbs = response.json()
    print(f"    OK: {len(dbs)} databases available")
    for db in dbs:
        print(f"       - {db['name']}: {db['protein_count']} proteins, {db['peptide_count']} peptides")

    print("\n[4] Testing modifications listing...")
    response = client.get("/modifications")
    assert response.status_code == 200
    mods = response.json()["modifications"]
    print(f"    OK: {len(mods)} modifications available")

    print("\n[5] Testing adding a custom modification...")
    response = client.post(
        "/modifications",
        json={
            "name": "Test Mod",
            "mass_shift": 28.0313,
            "residues": ["K"],
            "type": "variable",
        },
    )
    assert response.status_code == 200, f"Failed: {response.status_code} - {response.text}"
    print(f"    OK: Added modification '{response.json()['mod_id']}'")

    print("\n[6] Testing MGF file search submission...")
    mgf_path = os.path.join(UPLOAD_DIR, "test.mgf")
    with open(mgf_path, "rb") as f:
        response = client.post(
            "/search",
            data={
                "fasta_db": "test_db",
                "precursor_mz_tolerance_ppm": 5.0,
                "fragment_mz_tolerance_da": 0.5,
                "fdr_threshold": 0.01,
                "modifications": "phosphorylation,oxidation",
            },
            files={"file": ("test.mgf", f, "application/octet-stream")},
        )

    if response.status_code == 200:
        job_id = response.json()["job_id"]
        print(f"    OK: Job submitted with ID: {job_id}")

        print("\n[7] Testing job status query...")
        for i in range(20):
            time.sleep(0.3)
            response = client.get(f"/job/{job_id}")
            assert response.status_code == 200
            status = response.json()
            print(f"    Progress: {status['progress']}% - {status['status']} - {status.get('message', '')}")
            if status["status"] in ("completed", "failed"):
                break

        print("\n[8] Testing job results...")
        response = client.get(f"/job/{job_id}")
        result = response.json()
        print(f"    Status: {result['status']}")
        print(f"    Result count: {result['result_count']}")
        if result["results"]:
            print(f"    Top results:")
            for r in result["results"][:5]:
                print(f"       - {r['peptide_sequence']}: score={r['score']:.4f}, q_value={r.get('q_value', 'N/A')}")
        else:
            print(f"    No results passed FDR threshold")
    else:
        print(f"    Response: {response.status_code} - {response.text}")

    print("\n[9] Testing job listing...")
    response = client.get("/jobs")
    assert response.status_code == 200
    jobs = response.json()["jobs"]
    print(f"    OK: {len(jobs)} total jobs")

    print("\n" + "=" * 60)
    print("Integration test completed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    run_tests()
