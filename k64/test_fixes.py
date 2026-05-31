import urllib.request
import json
import time
import threading
import h5py
import numpy as np

print("=== Test 1: SSE multi-client scalability ===")

def read_sse(client_id, results, duration=5):
    try:
        req = urllib.request.Request('http://localhost:8000/simulate')
        resp = urllib.request.urlopen(req, timeout=15)
        buffer = ''
        frame_count = 0
        start = time.time()
        while time.time() - start < duration:
            chunk = resp.read(8192)
            if not chunk:
                break
            buffer += chunk.decode('utf-8')
            while '\n' in buffer:
                end_idx = buffer.find('\n')
                line = buffer[:end_idx].strip()
                buffer = buffer[end_idx+1:]
                if line.startswith('data:'):
                    data_str = line[5:].strip()
                    if data_str and not data_str.startswith('{'):
                        pass
                    elif data_str:
                        try:
                            data = json.loads(data_str)
                            if 'step' in data:
                                frame_count += 1
                        except:
                            pass
        resp.close()
        elapsed = time.time() - start
        fps = frame_count / elapsed if elapsed > 0 else 0
        results[client_id] = {'frames': frame_count, 'fps': fps}
        print(f"  Client {client_id}: {frame_count} frames in {elapsed:.1f}s = {fps:.1f} fps")
    except Exception as e:
        results[client_id] = {'error': str(e)}
        print(f"  Client {client_id}: ERROR - {e}")

results = {}
threads = []
for i in range(6):
    t = threading.Thread(target=read_sse, args=(i, results))
    threads.append(t)
    t.start()

for t in threads:
    t.join()

successful = [r for r in results.values() if 'fps' in r]
if successful:
    avg_fps = sum(r['fps'] for r in successful) / len(successful)
    print(f"\n  Average FPS across {len(successful)} clients: {avg_fps:.1f}")
    min_fps = min(r['fps'] for r in successful)
    print(f"  Min FPS: {min_fps:.1f}")
else:
    print("  No successful clients!")

print("\n=== Test 2: HDF5 snapshot verification ===")
time.sleep(3)

try:
    with h5py.File('data/trajectory.h5', 'r') as f:
        n_snapshots = len(f['trajectory/step'])
        print(f"  Snapshots: {n_snapshots}")
        if n_snapshots > 0:
            for i in range(min(3, n_snapshots)):
                ke = f['trajectory/kinetic_energy'][i]
                pe = f['trajectory/potential_energy'][i]
                step = f['trajectory/step'][i]
                is_nan = np.isnan(ke)
                print(f"  Step {step}: KE={ke:.4f}, PE={pe:.4f}, NaN={is_nan}")
            all_valid = not any(np.isnan(f['trajectory/kinetic_energy'][:]))
            print(f"  All KE values valid: {all_valid}")
except Exception as e:
    print(f"  HDF5 error: {e}")

print("\n=== Test 3: /status endpoint ===")
try:
    req = urllib.request.Request('http://localhost:8000/status')
    resp = urllib.request.urlopen(req, timeout=5)
    data = json.loads(resp.read().decode())
    print(f"  Status: {data}")
except Exception as e:
    print(f"  Error: {e}")

print("\nAll tests completed!")
