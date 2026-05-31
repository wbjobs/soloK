from detectors.python_detector import PythonSmellDetector
from detectors.javascript_detector import JavaScriptSmellDetector
from detectors.duplicate_detector import DuplicateCodeDetector

print("=== 测试Python代码坏味检测器 ===")
detector = PythonSmellDetector()
smells = detector.detect('test_samples/bad_code.py')
print(f"检测到 {len(smells)} 个代码坏味:")
for smell in smells:
    print(f"  [{smell['severity']}] {smell['smell_type']}: {smell['description'][:60]}...")
    print(f"    文件: {smell['file_path']} 行 {smell['start_line']}-{smell['end_line']}")
    print(f"    建议: {smell['suggestion'][:60]}...")
    print()

print("\n=== 测试JavaScript代码坏味检测器 ===")
detector = JavaScriptSmellDetector()
smells = detector.detect('test_samples/bad_code.js')
print(f"检测到 {len(smells)} 个代码坏味:")
for smell in smells:
    print(f"  [{smell['severity']}] {smell['smell_type']}: {smell['description'][:60]}...")
    print(f"    文件: {smell['file_path']} 行 {smell['start_line']}-{smell['end_line']}")
    print()

print("\n=== 测试重复代码检测器 ===")
detector = DuplicateCodeDetector()
smells = detector.detect(['test_samples/bad_code.py', 'test_samples/bad_code.js'])
print(f"检测到 {len(smells)} 个重复代码坏味:")
for smell in smells:
    print(f"  [{smell['severity']}] {smell['smell_type']}: {smell['description']}")
    print(f"    文件: {smell['file_path']} 行 {smell['start_line']}-{smell['end_line']}")
    print()
