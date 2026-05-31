import os
from utils.data_generator import SyntheticDataGenerator
from database import Database
from utils.feature_extraction import FeatureExtractor

def main():
    print("正在生成示例数据集...")
    
    db = Database()
    feature_extractor = FeatureExtractor()
    
    generator = SyntheticDataGenerator(n_sensors=16, sampling_rate=50, duration=90)
    dataset, labels = generator.generate_dataset(
        n_samples_per_class=3,
        add_drift=True,
        add_batch_effect=True
    )
    
    for sample in dataset:
        sample_id = db.add_sample(
            name=sample['name'],
            odor_class=sample['odor_class'],
            sensor_count=sample['sensor_count'],
            sampling_rate=sample['sampling_rate'],
            duration=sample['duration'],
            batch_date=sample['batch_date'],
            notes='示例数据'
        )
        
        for i in range(sample['sensor_count']):
            db.add_sensor_data(
                sample_id, i,
                sample['time'],
                sample['responses'][:, i]
            )
        
        features = feature_extractor.extract_features_array(
            sample['time'], sample['responses']
        )
        for i, feat in enumerate(features):
            db.add_features(sample_id, i, feat)
    
    print(f"已生成 {len(dataset)} 个样本并保存到数据库")
    print("气味类别包括:", set(labels))

if __name__ == '__main__':
    main()
