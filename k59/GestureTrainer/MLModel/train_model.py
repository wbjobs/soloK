import coremltools
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
import os

def generate_synthetic_data(n_samples=2000):
    np.random.seed(42)
    X = []
    y = []

    styles = ["原创", "模仿", "紧张", "自信", "犹豫"]

    for _ in range(n_samples):
        style_idx = np.random.randint(0, len(styles))
        style = styles[style_idx]

        if style == "自信":
            avg_speed = np.random.uniform(200, 400)
            speed_std = np.random.uniform(10, 80)
            avg_accel = np.random.uniform(-200, 200)
            accel_std = np.random.uniform(500, 5000)
            pause_count = np.random.randint(0, 2)
            pattern_length = np.random.randint(7, 10)
            total_pause = np.random.uniform(0, 0.2)
            duration = np.random.uniform(1.0, 3.0)
        elif style == "紧张":
            avg_speed = np.random.uniform(30, 100)
            speed_std = np.random.uniform(80, 250)
            avg_accel = np.random.uniform(-1000, 1000)
            accel_std = np.random.uniform(50000, 200000)
            pause_count = np.random.randint(2, 6)
            pattern_length = np.random.randint(4, 7)
            total_pause = np.random.uniform(0.3, 1.5)
            duration = np.random.uniform(2.0, 6.0)
        elif style == "犹豫":
            avg_speed = np.random.uniform(40, 120)
            speed_std = np.random.uniform(40, 150)
            avg_accel = np.random.uniform(-300, 300)
            accel_std = np.random.uniform(5000, 30000)
            pause_count = np.random.randint(2, 5)
            pattern_length = np.random.randint(4, 6)
            total_pause = np.random.uniform(0.5, 2.0)
            duration = np.random.uniform(2.5, 5.0)
        elif style == "原创":
            avg_speed = np.random.uniform(100, 300)
            speed_std = np.random.uniform(50, 200)
            avg_accel = np.random.uniform(-500, 500)
            accel_std = np.random.uniform(10000, 80000)
            pause_count = np.random.randint(0, 3)
            pattern_length = np.random.randint(7, 10)
            total_pause = np.random.uniform(0, 0.8)
            duration = np.random.uniform(1.5, 4.0)
        else:
            avg_speed = np.random.uniform(80, 200)
            speed_std = np.random.uniform(20, 100)
            avg_accel = np.random.uniform(-200, 200)
            accel_std = np.random.uniform(2000, 15000)
            pause_count = np.random.randint(0, 2)
            pattern_length = np.random.randint(5, 8)
            total_pause = np.random.uniform(0, 0.5)
            duration = np.random.uniform(1.5, 3.5)

        features = [
            avg_speed, speed_std, avg_accel, accel_std,
            pause_count, pattern_length, total_pause, duration
        ]
        safe_features = [
            max(0.0, min(1000.0, features[0])),
            max(0.0, min(500.0, features[1])),
            max(-5000.0, min(5000.0, features[2])),
            max(0.0, min(2000.0, features[3])),
            max(0.0, min(20.0, features[4])),
            max(1.0, min(9.0, features[5])),
            max(0.0, min(10.0, features[6])),
            max(0.0, min(30.0, features[7]))
        ]
        X.append(safe_features)
        y.append(style)

    return np.array(X), np.array(y)

def train_and_export():
    print("Generating synthetic training data...")
    X, y = generate_synthetic_data(3000)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"Training samples: {len(X_train)}, Test samples: {len(X_test)}")

    print("Training RandomForest classifier...")
    clf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
    clf.fit(X_train, y_train)

    accuracy = clf.score(X_test, y_test)
    print(f"Test accuracy: {accuracy:.4f}")

    feature_names = [
        "avgSpeed", "speedStdDev", "avgAcceleration", "accelStdDev",
        "pauseCount", "patternLength", "totalPauseDuration", "duration"
    ]

    print("Converting to Core ML model...")
    import coremltools as ct

    class_labels = ["原创", "模仿", "紧张", "自信", "犹豫"]

    coreml_model = ct.converters.sklearn_converter.convert(
        clf,
        feature_names,
        "GestureStyleClassifier",
        class_labels=class_labels
    )

    coreml_model.short_description = "Classifies gesture drawing style based on speed, acceleration, and pause features"
    coreml_model.input_description["avgSpeed"] = "Average drawing speed (points/second)"
    coreml_model.input_description["speedStdDev"] = "Standard deviation of speed"
    coreml_model.input_description["avgAcceleration"] = "Average acceleration"
    coreml_model.input_description["accelStdDev"] = "Standard deviation of acceleration"
    coreml_model.input_description["pauseCount"] = "Number of pause points"
    coreml_model.input_description["patternLength"] = "Number of grid points in pattern"
    coreml_model.input_description["totalPauseDuration"] = "Total pause duration (seconds)"
    coreml_model.input_description["duration"] = "Total drawing duration (seconds)"
    coreml_model.output_description["style"] = "Predicted drawing style class"

    output_path = os.path.join(os.path.dirname(__file__), "GestureStyleClassifier.mlmodel")
    coreml_model.save(output_path)
    print(f"Core ML model saved to: {output_path}")

if __name__ == "__main__":
    train_and_export()
