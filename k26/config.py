import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
MODEL_DIR = os.path.join(BASE_DIR, 'models')
DB_PATH = os.path.join(DATA_DIR, 'enose.db')

SENSOR_CONFIG = {
    'min_sensors': 8,
    'max_sensors': 32,
    'min_sampling_rate': 10,
    'max_sampling_rate': 100,
    'min_duration': 60,
    'max_duration': 120
}

ODOR_CLASSES = [
    '咖啡', '红酒', '白酒', '啤酒', '新鲜牛肉', '新鲜猪肉',
    '新鲜鸡肉', '腐败牛肉', '腐败猪肉', '腐败鸡肉', '面包霉',
    '青霉', '曲霉', '甲醛', '苯', '甲苯', '二甲苯', '氨气',
    '硫化氢', '丙酮'
]

CLASS_COLORS = {
    '咖啡': '#8B4513', '红酒': '#8B0000', '白酒': '#FFFAF0',
    '啤酒': '#DAA520', '新鲜牛肉': '#CD5C5C', '新鲜猪肉': '#FFB6C1',
    '新鲜鸡肉': '#FFEFD5', '腐败牛肉': '#4A4A4A', '腐败猪肉': '#556B2F',
    '腐败鸡肉': '#808000', '面包霉': '#9ACD32', '青霉': '#2E8B57',
    '曲霉': '#D2691E', '甲醛': '#4169E1', '苯': '#9370DB',
    '甲苯': '#BA55D3', '二甲苯': '#EE82EE', '氨气': '#00CED1',
    '硫化氢': '#FF6347', '丙酮': '#20B2AA'
}

PREPROCESSING_CONFIG = {
    'baseline_samples': 10,
    'smooth_window': 5,
    'smooth_method': 'savgol',
    'savgol_polyorder': 2
}

FEATURE_CONFIG = {
    'features': ['max_value', 'steady_value', 'rise_time', 
                 'area', 'slope', 'response_recovery_ratio']
}

CLASSIFIER_CONFIG = {
    'default_method': 'random_forest',
    'rf_n_estimators': 100,
    'svm_kernel': 'rbf',
    'svm_C': 1.0,
    'pca_components': 3
}
