import numpy as np
from utils.classifier import OdorClassifier

print("Testing classifier fixes...\n")

np.random.seed(42)
X_train = np.random.randn(60, 96)
y_train = np.repeat([f'class_{i}' for i in range(20)], 3)

clf = OdorClassifier(method='random_forest')
accuracy = clf.fit(X_train, y_train)
print(f'Training accuracy: {accuracy:.2%}')

print('\nKnown samples:')
X_known = X_train[0:3]
top3_known = clf.predict_top3(X_known)
for i, result in enumerate(top3_known):
    for r in result:
        is_unk = r.get('is_unknown', False)
        print(f"  {r['class']}: {r['similarity']:.2f}% (unknown={is_unk})")

print('\nUnknown samples (outlier test):')
X_unknown = np.random.randn(3, 96) * 10
top3_unknown = clf.predict_top3(X_unknown)
for i, result in enumerate(top3_unknown):
    for r in result:
        is_unk = r.get('is_unknown', False)
        print(f"  {r['class']}: {r['similarity']:.2f}% (unknown={is_unk})")

print('\nTest completed successfully!')
