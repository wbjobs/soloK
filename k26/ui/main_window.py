import sys
import os
import numpy as np
from datetime import datetime
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
                             QTabWidget, QLabel, QPushButton, QFileDialog, QComboBox,
                             QTableWidget, QTableWidgetItem, QMessageBox, QGroupBox,
                             QFormLayout, QLineEdit, QTextEdit, QSpinBox, QDoubleSpinBox,
                             QCheckBox, QSplitter, QListWidget, QProgressBar)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont, QColor

from database import Database
from config import ODOR_CLASSES, CLASS_COLORS
from utils.preprocessing import DataImporter, SignalPreprocessor
from utils.feature_extraction import FeatureExtractor
from utils.classifier import OdorClassifier
from utils.drift_compensation import DriftCompensator, BatchEffectRemover, DomainAdaptation
from utils.visualization import (PlotCanvas, PCAVisualizer, RadarPlot, 
                                   HierarchicalClustering, ResponseCurvePlot,
                                   ClassificationResultPlot)
from utils.realtime_acquisition import RealTimeAcquisition
from utils.data_generator import SyntheticDataGenerator
from utils.concentration_estimator import ConcentrationEstimator
from utils.sensor_diagnosis import RealTimeSensorDiagnostic


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('电子鼻气味图谱分析系统')
        self.setGeometry(100, 100, 1400, 900)
        
        self.db = Database()
        self.data_importer = DataImporter()
        self.preprocessor = SignalPreprocessor()
        self.feature_extractor = FeatureExtractor()
        self.classifier = None
        self.realtime_acq = RealTimeAcquisition()
        self.concentration_estimator = ConcentrationEstimator()
        self.sensor_diagnostic = RealTimeSensorDiagnostic()
        
        self.current_data = None
        self.current_features = None
        self.selected_samples = []
        
        self.init_ui()
        self.init_classifier()
        self.load_samples()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        
        title_label = QLabel('电子鼻气味图谱分析系统')
        title_label.setFont(QFont('Arial', 18, QFont.Bold))
        title_label.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(title_label)
        
        self.tab_widget = QTabWidget()
        self.tab_widget.addTab(self.create_data_import_tab(), '数据导入')
        self.tab_widget.addTab(self.create_preprocessing_tab(), '信号预处理')
        self.tab_widget.addTab(self.create_feature_extraction_tab(), '特征提取')
        self.tab_widget.addTab(self.create_classification_tab(), '气味识别')
        self.tab_widget.addTab(self.create_visualization_tab(), '多元分析')
        self.tab_widget.addTab(self.create_drift_compensation_tab(), '漂移补偿')
        self.tab_widget.addTab(self.create_database_tab(), '指纹库管理')
        self.tab_widget.addTab(self.create_realtime_tab(), '实时采集')
        
        main_layout.addWidget(self.tab_widget)
        
        status_bar = self.statusBar()
        status_bar.showMessage('系统就绪')

    def create_data_import_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        import_group = QGroupBox('导入数据')
        import_layout = QFormLayout(import_group)
        
        self.file_type_combo = QComboBox()
        self.file_type_combo.addItems(['CSV文件', 'Excel文件', 'Numpy文件'])
        import_layout.addRow('文件类型:', self.file_type_combo)
        
        import_btn = QPushButton('选择文件')
        import_btn.clicked.connect(self.import_data)
        import_layout.addRow('', import_btn)
        
        batch_date_input = QLineEdit(datetime.now().strftime('%Y-%m-%d'))
        import_layout.addRow('批次日期:', batch_date_input)
        self.batch_date_input = batch_date_input
        
        odor_class_combo = QComboBox()
        odor_class_combo.addItems(ODOR_CLASSES)
        import_layout.addRow('气味类别:', odor_class_combo)
        self.import_odor_combo = odor_class_combo
        
        sample_name_input = QLineEdit()
        import_layout.addRow('样本名称:', sample_name_input)
        self.sample_name_input = sample_name_input
        
        notes_input = QTextEdit()
        notes_input.setMaximumHeight(60)
        import_layout.addRow('备注:', notes_input)
        self.notes_input = notes_input
        
        save_btn = QPushButton('保存到数据库')
        save_btn.clicked.connect(self.save_to_database)
        import_layout.addRow('', save_btn)
        
        left_layout.addWidget(import_group)
        
        gen_group = QGroupBox('生成模拟数据')
        gen_layout = QFormLayout(gen_group)
        
        gen_sensor_spin = QSpinBox()
        gen_sensor_spin.setRange(8, 32)
        gen_sensor_spin.setValue(16)
        gen_layout.addRow('传感器数量:', gen_sensor_spin)
        self.gen_sensor_spin = gen_sensor_spin
        
        gen_odor_combo = QComboBox()
        gen_odor_combo.addItems(ODOR_CLASSES)
        gen_layout.addRow('气味类别:', gen_odor_combo)
        self.gen_odor_combo = gen_odor_combo
        
        gen_btn = QPushButton('生成数据')
        gen_btn.clicked.connect(self.generate_synthetic_data)
        gen_layout.addRow('', gen_btn)
        
        gen_batch_btn = QPushButton('批量生成数据集')
        gen_batch_btn.clicked.connect(self.generate_batch_dataset)
        gen_layout.addRow('', gen_batch_btn)
        
        left_layout.addWidget(gen_group)
        left_layout.addStretch()
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        info_group = QGroupBox('数据信息')
        info_layout = QFormLayout(info_group)
        self.sensor_count_label = QLabel('-')
        self.sampling_rate_label = QLabel('-')
        self.duration_label = QLabel('-')
        info_layout.addRow('传感器数量:', self.sensor_count_label)
        info_layout.addRow('采样频率:', self.sampling_rate_label)
        info_layout.addRow('持续时间:', self.duration_label)
        right_layout.addWidget(info_group)
        
        self.response_canvas = PlotCanvas(width=8, height=5)
        right_layout.addWidget(self.response_canvas)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([300, 900])
        layout.addWidget(splitter)
        
        return widget

    def create_preprocessing_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        params_group = QGroupBox('预处理参数')
        params_layout = QFormLayout(params_group)
        
        baseline_spin = QSpinBox()
        baseline_spin.setRange(1, 100)
        baseline_spin.setValue(10)
        params_layout.addRow('基线样本数:', baseline_spin)
        self.baseline_spin = baseline_spin
        
        smooth_method_combo = QComboBox()
        smooth_method_combo.addItems(['savgol', 'moving_average'])
        params_layout.addRow('平滑方法:', smooth_method_combo)
        self.smooth_method_combo = smooth_method_combo
        
        smooth_window_spin = QSpinBox()
        smooth_window_spin.setRange(3, 51)
        smooth_window_spin.setValue(5)
        params_layout.addRow('平滑窗口:', smooth_window_spin)
        self.smooth_window_spin = smooth_window_spin
        
        self.baseline_check = QCheckBox('基线校正')
        self.baseline_check.setChecked(True)
        params_layout.addRow('', self.baseline_check)
        
        self.smooth_check = QCheckBox('平滑处理')
        self.smooth_check.setChecked(True)
        params_layout.addRow('', self.smooth_check)
        
        self.normalize_check = QCheckBox('归一化')
        self.normalize_check.setChecked(False)
        params_layout.addRow('', self.normalize_check)
        
        process_btn = QPushButton('执行预处理')
        process_btn.clicked.connect(self.run_preprocessing)
        params_layout.addRow('', process_btn)
        
        left_layout.addWidget(params_group)
        left_layout.addStretch()
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.before_canvas = PlotCanvas(width=6, height=4)
        self.before_canvas.fig.suptitle('预处理前')
        self.after_canvas = PlotCanvas(width=6, height=4)
        self.after_canvas.fig.suptitle('预处理后')
        
        right_layout.addWidget(self.before_canvas)
        right_layout.addWidget(self.after_canvas)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([250, 950])
        layout.addWidget(splitter)
        
        return widget

    def create_feature_extraction_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        feature_group = QGroupBox('特征选择')
        feature_layout = QVBoxLayout(feature_group)
        
        self.feature_checks = {}
        features = ['max_value', 'steady_value', 'rise_time', 
                   'area', 'slope', 'response_recovery_ratio']
        feature_names = ['最大值', '稳态值', '上升时间', 
                        '面积', '斜率', '响应恢复比']
        
        for feat, name in zip(features, feature_names):
            check = QCheckBox(name)
            check.setChecked(True)
            feature_layout.addWidget(check)
            self.feature_checks[feat] = check
        
        extract_btn = QPushButton('提取特征')
        extract_btn.clicked.connect(self.extract_features)
        feature_layout.addWidget(extract_btn)
        
        left_layout.addWidget(feature_group)
        left_layout.addStretch()
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.feature_table = QTableWidget()
        right_layout.addWidget(self.feature_table)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([250, 950])
        layout.addWidget(splitter)
        
        return widget

    def create_classification_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        model_group = QGroupBox('分类模型')
        model_layout = QFormLayout(model_group)
        
        model_method_combo = QComboBox()
        model_method_combo.addItems(['random_forest', 'svm'])
        model_layout.addRow('分类方法:', model_method_combo)
        self.model_method_combo = model_method_combo
        
        self.use_pca_check = QCheckBox('使用PCA降维')
        model_layout.addRow('', self.use_pca_check)
        
        train_btn = QPushButton('训练模型')
        train_btn.clicked.connect(self.train_classifier)
        model_layout.addRow('', train_btn)
        
        predict_btn = QPushButton('识别当前样本')
        predict_btn.clicked.connect(self.classify_sample)
        model_layout.addRow('', predict_btn)
        
        save_model_btn = QPushButton('保存模型')
        save_model_btn.clicked.connect(self.save_model)
        model_layout.addRow('', save_model_btn)
        
        load_model_btn = QPushButton('加载模型')
        load_model_btn.clicked.connect(self.load_model)
        model_layout.addRow('', load_model_btn)
        
        left_layout.addWidget(model_group)
        left_layout.addStretch()
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.result_canvas = PlotCanvas(width=8, height=5)
        right_layout.addWidget(self.result_canvas)
        
        result_group = QGroupBox('识别结果')
        result_layout = QFormLayout(result_group)
        self.result_labels = [QLabel('-') for _ in range(3)]
        for i, label in enumerate(self.result_labels):
            result_layout.addRow(f'Top {i+1}:', label)
        right_layout.addWidget(result_group)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([250, 950])
        layout.addWidget(splitter)
        
        return widget

    def create_visualization_tab(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        viz_tabs = QTabWidget()
        viz_tabs.addTab(self.create_pca_tab(), 'PCA得分图')
        viz_tabs.addTab(self.create_radar_tab(), '雷达图')
        viz_tabs.addTab(self.create_clustering_tab(), '层次聚类')
        
        layout.addWidget(viz_tabs)
        return widget

    def create_pca_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        params_group = QGroupBox('PCA参数')
        params_layout = QFormLayout(params_group)
        
        pca_dim_combo = QComboBox()
        pca_dim_combo.addItems(['2D', '3D'])
        params_layout.addRow('维度:', pca_dim_combo)
        self.pca_dim_combo = pca_dim_combo
        
        color_by_combo = QComboBox()
        color_by_combo.addItems(['按类别', '按批次'])
        params_layout.addRow('着色:', color_by_combo)
        self.color_by_combo = color_by_combo
        
        plot_btn = QPushButton('绘制PCA图')
        plot_btn.clicked.connect(self.plot_pca)
        params_layout.addRow('', plot_btn)
        
        left_layout.addWidget(params_group)
        left_layout.addStretch()
        
        self.pca_canvas = PlotCanvas(width=10, height=8)
        layout.addWidget(left_panel)
        layout.addWidget(self.pca_canvas)
        
        return widget

    def create_radar_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        sample_group = QGroupBox('选择样本')
        sample_layout = QVBoxLayout(sample_group)
        
        self.radar_sample_list = QListWidget()
        self.radar_sample_list.setSelectionMode(QListWidget.MultiSelection)
        sample_layout.addWidget(self.radar_sample_list)
        
        refresh_btn = QPushButton('刷新样本列表')
        refresh_btn.clicked.connect(self.refresh_sample_list)
        sample_layout.addWidget(refresh_btn)
        
        plot_btn = QPushButton('绘制雷达图')
        plot_btn.clicked.connect(self.plot_radar)
        sample_layout.addWidget(plot_btn)
        
        left_layout.addWidget(sample_group)
        left_layout.addStretch()
        
        self.radar_canvas = PlotCanvas(width=10, height=8)
        layout.addWidget(left_panel)
        layout.addWidget(self.radar_canvas)
        
        return widget

    def create_clustering_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        params_group = QGroupBox('聚类参数')
        params_layout = QFormLayout(params_group)
        
        linkage_combo = QComboBox()
        linkage_combo.addItems(['ward', 'complete', 'average', 'single'])
        params_layout.addRow('链接方法:', linkage_combo)
        self.linkage_combo = linkage_combo
        
        metric_combo = QComboBox()
        metric_combo.addItems(['euclidean', 'cityblock', 'cosine'])
        params_layout.addRow('距离度量:', metric_combo)
        self.metric_combo = metric_combo
        
        plot_btn = QPushButton('绘制聚类树')
        plot_btn.clicked.connect(self.plot_clustering)
        params_layout.addRow('', plot_btn)
        
        left_layout.addWidget(params_group)
        left_layout.addStretch()
        
        self.cluster_canvas = PlotCanvas(width=10, height=8)
        layout.addWidget(left_panel)
        layout.addWidget(self.cluster_canvas)
        
        return widget

    def create_drift_compensation_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        method_group = QGroupBox('补偿方法')
        method_layout = QFormLayout(method_group)
        
        method_combo = QComboBox()
        method_combo.addItems(['PCA投影', '批次对齐', 'CORAL域自适应'])
        method_layout.addRow('方法:', method_combo)
        self.drift_method_combo = method_combo
        
        ref_batch_combo = QComboBox()
        ref_batch_combo.addItems(['自动选择'])
        method_layout.addRow('参考批次:', ref_batch_combo)
        self.ref_batch_combo = ref_batch_combo
        
        apply_btn = QPushButton('应用补偿')
        apply_btn.clicked.connect(self.apply_drift_compensation)
        method_layout.addRow('', apply_btn)
        
        left_layout.addWidget(method_group)
        left_layout.addStretch()
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.drift_before_canvas = PlotCanvas(width=8, height=4)
        self.drift_before_canvas.fig.suptitle('补偿前')
        self.drift_after_canvas = PlotCanvas(width=8, height=4)
        self.drift_after_canvas.fig.suptitle('补偿后')
        
        right_layout.addWidget(self.drift_before_canvas)
        right_layout.addWidget(self.drift_after_canvas)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([250, 950])
        layout.addWidget(splitter)
        
        return widget

    def create_database_tab(self):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        filter_group = QGroupBox('筛选')
        filter_layout = QFormLayout(filter_group)
        
        filter_class_combo = QComboBox()
        filter_class_combo.addItems(['全部'] + ODOR_CLASSES)
        filter_layout.addRow('气味类别:', filter_class_combo)
        self.filter_class_combo = filter_class_combo
        
        refresh_btn = QPushButton('刷新列表')
        refresh_btn.clicked.connect(self.load_samples)
        filter_layout.addRow('', refresh_btn)
        
        left_layout.addWidget(filter_group)
        
        edit_group = QGroupBox('编辑样本')
        edit_layout = QFormLayout(edit_group)
        
        edit_name_input = QLineEdit()
        edit_layout.addRow('样本名称:', edit_name_input)
        self.edit_name_input = edit_name_input
        
        edit_class_combo = QComboBox()
        edit_class_combo.addItems(ODOR_CLASSES)
        edit_layout.addRow('气味类别:', edit_class_combo)
        self.edit_class_combo = edit_class_combo
        
        edit_notes_input = QTextEdit()
        edit_notes_input.setMaximumHeight(60)
        edit_layout.addRow('备注:', edit_notes_input)
        self.edit_notes_input = edit_notes_input
        
        update_btn = QPushButton('更新')
        update_btn.clicked.connect(self.update_sample)
        edit_layout.addRow('', update_btn)
        
        delete_btn = QPushButton('删除')
        delete_btn.clicked.connect(self.delete_sample)
        edit_layout.addRow('', delete_btn)
        
        left_layout.addWidget(edit_group)
        left_layout.addStretch()
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.samples_table = QTableWidget()
        self.samples_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.samples_table.itemSelectionChanged.connect(self.on_sample_selected)
        right_layout.addWidget(self.samples_table)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([300, 900])
        layout.addWidget(splitter)
        
        return widget

    def create_realtime_tab(self):
        widget = QWidget()
        main_layout = QVBoxLayout(widget)
        
        top_panel = QWidget()
        top_layout = QHBoxLayout(top_panel)
        
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        
        config_group = QGroupBox('采集配置')
        config_layout = QFormLayout(config_group)
        
        rt_sensor_spin = QSpinBox()
        rt_sensor_spin.setRange(8, 32)
        rt_sensor_spin.setValue(16)
        config_layout.addRow('传感器数量:', rt_sensor_spin)
        self.rt_sensor_spin = rt_sensor_spin
        
        rt_rate_combo = QComboBox()
        rt_rate_combo.addItems(['10 Hz', '25 Hz', '50 Hz', '100 Hz'])
        rt_rate_combo.setCurrentIndex(2)
        config_layout.addRow('采样频率:', rt_rate_combo)
        self.rt_rate_combo = rt_rate_combo
        
        max_display_spin = QSpinBox()
        max_display_spin.setRange(100, 2000)
        max_display_spin.setValue(500)
        config_layout.addRow('最大显示点:', max_display_spin)
        self.max_display_spin = max_display_spin
        
        left_layout.addWidget(config_group)
        
        control_group = QGroupBox('采集控制')
        control_layout = QFormLayout(control_group)
        
        rt_odor_combo = QComboBox()
        rt_odor_combo.addItems(ODOR_CLASSES)
        control_layout.addRow('模拟气味:', rt_odor_combo)
        self.rt_odor_combo = rt_odor_combo
        
        self.use_simulation_check = QCheckBox('使用模拟数据')
        self.use_simulation_check.setChecked(True)
        control_layout.addRow('', self.use_simulation_check)
        
        self.start_btn = QPushButton('开始采集')
        self.start_btn.clicked.connect(self.start_acquisition)
        control_layout.addRow('', self.start_btn)
        
        self.stop_btn = QPushButton('停止采集')
        self.stop_btn.clicked.connect(self.stop_acquisition)
        self.stop_btn.setEnabled(False)
        control_layout.addRow('', self.stop_btn)
        
        left_layout.addWidget(control_group)
        
        result_group = QGroupBox('实时识别结果')
        result_layout = QFormLayout(result_group)
        self.rt_result_labels = [QLabel('-') for _ in range(3)]
        for i, label in enumerate(self.rt_result_labels):
            result_layout.addRow(f'Top {i+1}:', label)
        left_layout.addWidget(result_group)
        
        concentration_group = QGroupBox('浓度估算')
        concentration_layout = QFormLayout(concentration_group)
        self.rt_concentration_label = QLabel('-')
        concentration_layout.addRow('估算浓度:', self.rt_concentration_label)
        self.rt_concentration_range_label = QLabel('-')
        concentration_layout.addRow('浓度范围:', self.rt_concentration_range_label)
        left_layout.addWidget(concentration_group)
        left_layout.addStretch()
        
        middle_panel = QWidget()
        middle_layout = QVBoxLayout(middle_panel)
        
        health_group = QGroupBox('传感器健康状态')
        health_layout = QVBoxLayout(health_group)
        
        self.overall_health_bar = QProgressBar()
        self.overall_health_bar.setRange(0, 100)
        self.overall_health_bar.setValue(100)
        self.overall_health_bar.setStyleSheet(
            "QProgressBar::chunk { background-color: #2ECC71; }"
        )
        health_layout.addWidget(QLabel('整体健康度:'))
        health_layout.addWidget(self.overall_health_bar)
        
        self.sensor_status_table = QTableWidget()
        self.sensor_status_table.setColumnCount(3)
        self.sensor_status_table.setHorizontalHeaderLabels(['传感器', '状态', '健康分'])
        self.sensor_status_table.verticalHeader().setVisible(False)
        health_layout.addWidget(self.sensor_status_table)
        
        middle_layout.addWidget(health_group)
        
        diagnosis_group = QGroupBox('故障诊断')
        diagnosis_layout = QFormLayout(diagnosis_group)
        self.diagnosis_label = QLabel('系统正常')
        diagnosis_layout.addRow('诊断结果:', self.diagnosis_label)
        self.diagnosis_details_label = QLabel('-')
        diagnosis_layout.addRow('详细信息:', self.diagnosis_details_label)
        middle_layout.addWidget(diagnosis_group)
        
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        
        self.rt_canvas = PlotCanvas(width=10, height=6)
        right_layout.addWidget(self.rt_canvas)
        
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(left_panel)
        splitter.addWidget(middle_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([250, 300, 750])
        top_layout.addWidget(splitter)
        
        main_layout.addWidget(top_panel)
        
        return widget

    def init_classifier(self):
        self.classifier = OdorClassifier(method='random_forest')

    def import_data(self):
        file_type = self.file_type_combo.currentText()
        
        if file_type == 'CSV文件':
            file_path, _ = QFileDialog.getOpenFileName(self, '选择文件', '', 'CSV Files (*.csv)')
            if file_path:
                self.current_data = self.data_importer.from_csv(file_path)
        elif file_type == 'Excel文件':
            file_path, _ = QFileDialog.getOpenFileName(self, '选择文件', '', 'Excel Files (*.xlsx *.xls)')
            if file_path:
                self.current_data = self.data_importer.from_excel(file_path)
        else:
            file_path, _ = QFileDialog.getOpenFileName(self, '选择文件', '', 'Numpy Files (*.npy)')
            if file_path:
                self.current_data = self.data_importer.from_numpy(file_path)
        
        if self.current_data:
            self.update_data_info()
            self.plot_response_curves()

    def update_data_info(self):
        self.sensor_count_label.setText(str(self.current_data['sensor_count']))
        self.sampling_rate_label.setText(f"{self.current_data['sampling_rate']:.1f} Hz")
        duration = self.current_data['time'][-1] - self.current_data['time'][0]
        self.duration_label.setText(f"{duration:.1f} s")

    def plot_response_curves(self):
        if self.current_data is None:
            return
        
        self.response_canvas.clear()
        ax = self.response_canvas.fig.add_subplot(111)
        
        plotter = ResponseCurvePlot()
        plotter.plot(self.current_data['time'], 
                     self.current_data['responses'],
                     ax=ax)
        
        self.response_canvas.draw()

    def generate_synthetic_data(self):
        n_sensors = self.gen_sensor_spin.value()
        odor_class = self.gen_odor_combo.currentText()
        
        generator = SyntheticDataGenerator(
            n_sensors=n_sensors,
            sampling_rate=50,
            duration=90
        )
        
        sample = generator.generate_sample(odor_class)
        self.current_data = sample
        self.sample_name_input.setText(f"{odor_class}_demo")
        
        self.update_data_info()
        self.plot_response_curves()
        self.statusBar().showMessage('模拟数据已生成')

    def generate_batch_dataset(self):
        generator = SyntheticDataGenerator(n_sensors=16, sampling_rate=50, duration=90)
        dataset, labels = generator.generate_dataset(n_samples_per_class=3)
        
        for sample in dataset:
            sample_id = self.db.add_sample(
                name=sample['name'],
                odor_class=sample['odor_class'],
                sensor_count=sample['sensor_count'],
                sampling_rate=sample['sampling_rate'],
                duration=sample['duration'],
                batch_date=sample['batch_date'],
                notes='自动生成的模拟数据'
            )
            
            for i in range(sample['sensor_count']):
                self.db.add_sensor_data(
                    sample_id, i,
                    sample['time'],
                    sample['responses'][:, i]
                )
            
            features = self.feature_extractor.extract_features_array(
                sample['time'], sample['responses']
            )
            for i, feat in enumerate(features):
                self.db.add_features(sample_id, i, feat)
        
        self.load_samples()
        self.statusBar().showMessage(f'已生成 {len(dataset)} 个样本并保存到数据库')

    def save_to_database(self):
        if self.current_data is None:
            QMessageBox.warning(self, '警告', '没有数据可保存')
            return
        
        name = self.sample_name_input.text() or '未命名样本'
        odor_class = self.import_odor_combo.currentText()
        batch_date = self.batch_date_input.text()
        notes = self.notes_input.toPlainText()
        
        sample_id = self.db.add_sample(
            name=name,
            odor_class=odor_class,
            sensor_count=self.current_data['sensor_count'],
            sampling_rate=self.current_data['sampling_rate'],
            duration=self.current_data['time'][-1] - self.current_data['time'][0],
            batch_date=batch_date,
            notes=notes
        )
        
        for i in range(self.current_data['sensor_count']):
            self.db.add_sensor_data(
                sample_id, i,
                self.current_data['time'],
                self.current_data['responses'][:, i]
            )
        
        features = self.feature_extractor.extract_features_array(
            self.current_data['time'], self.current_data['responses']
        )
        for i, feat in enumerate(features):
            self.db.add_features(sample_id, i, feat)
        
        self.load_samples()
        self.statusBar().showMessage(f'样本已保存，ID: {sample_id}')

    def run_preprocessing(self):
        if self.current_data is None:
            QMessageBox.warning(self, '警告', '请先导入数据')
            return
        
        self.preprocessor.config['baseline_samples'] = self.baseline_spin.value()
        self.preprocessor.config['smooth_window'] = self.smooth_window_spin.value()
        self.preprocessor.config['smooth_method'] = self.smooth_method_combo.currentText()
        
        self.before_canvas.clear()
        ax1 = self.before_canvas.fig.add_subplot(111)
        plotter = ResponseCurvePlot()
        plotter.plot(self.current_data['time'], 
                     self.current_data['responses'], ax=ax1,
                     title='原始信号')
        
        processed = self.preprocessor.preprocess_pipeline(
            self.current_data['time'],
            self.current_data['responses'],
            do_baseline=self.baseline_check.isChecked(),
            do_smooth=self.smooth_check.isChecked(),
            do_normalize=self.normalize_check.isChecked()
        )
        
        self.current_data['processed_responses'] = processed
        
        self.after_canvas.clear()
        ax2 = self.after_canvas.fig.add_subplot(111)
        plotter.plot(self.current_data['time'], processed, ax=ax2,
                    title='预处理后信号')
        
        self.before_canvas.draw()
        self.after_canvas.draw()
        self.statusBar().showMessage('预处理完成')

    def extract_features(self):
        if self.current_data is None:
            QMessageBox.warning(self, '警告', '请先导入数据')
            return
        
        responses = self.current_data.get('processed_responses', 
                                         self.current_data['responses'])
        
        self.current_features = self.feature_extractor.extract_feature_matrix(
            self.current_data['time'], responses, flatten=False
        )
        
        n_sensors, n_features = self.current_features.shape
        
        self.feature_table.setRowCount(n_sensors)
        self.feature_table.setColumnCount(n_features)
        self.feature_table.setHorizontalHeaderLabels(self.feature_extractor.feature_names)
        self.feature_table.setVerticalHeaderLabels([f'S{i+1}' for i in range(n_sensors)])
        
        for i in range(n_sensors):
            for j in range(n_features):
                item = QTableWidgetItem(f"{self.current_features[i, j]:.4f}")
                self.feature_table.setItem(i, j, item)
        
        self.statusBar().showMessage('特征提取完成')

    def train_classifier(self):
        df = self.db.get_feature_matrix()
        
        if len(df) == 0:
            QMessageBox.warning(self, '警告', '数据库中没有样本数据')
            return
        
        X = []
        y = []
        batch_dates = []
        
        for sample_id, group in df.groupby('sample_id'):
            features = group[['max_value', 'steady_value', 'rise_time', 
                             'area', 'slope', 'response_recovery_ratio']].values.flatten()
            X.append(features)
            y.append(group['odor_class'].iloc[0])
            batch_dates.append(group['batch_date'].iloc[0])
        
        X = np.array(X)
        y = np.array(y)
        
        method = self.model_method_combo.currentText()
        self.classifier = OdorClassifier(method=method)
        
        accuracy = self.classifier.fit(X, y, use_pca=self.use_pca_check.isChecked())
        
        self.realtime_acq.set_classifier(self.classifier)
        self.realtime_acq.set_feature_extractor(self.feature_extractor)
        
        QMessageBox.information(self, '训练完成', 
                               f'模型训练完成\n训练集准确率: {accuracy:.2%}')
        self.statusBar().showMessage('模型训练完成')

    def classify_sample(self):
        if self.classifier is None or self.classifier.model is None:
            QMessageBox.warning(self, '警告', '请先训练模型')
            return
        
        if self.current_features is None:
            QMessageBox.warning(self, '警告', '请先提取特征')
            return
        
        features_flat = self.current_features.flatten().reshape(1, -1)
        top3 = self.classifier.predict_top3(features_flat)[0]
        
        is_unknown = any(result.get('is_unknown', False) for result in top3)
        
        for i, result in enumerate(top3):
            suffix = ''
            if result.get('is_unknown', False):
                suffix = ' [疑似未知]'
            self.result_labels[i].setText(f"{result['class']} - {result['similarity']:.2f}%{suffix}")
        
        self.result_canvas.clear()
        ax = self.result_canvas.fig.add_subplot(111)
        
        plotter = ClassificationResultPlot()
        plotter.plot_top3(top3, ax=ax)
        
        if is_unknown:
            ax.text(0.5, 1.02, '⚠ 警告：样本可能不属于已知类别', 
                   transform=ax.transAxes, ha='center', 
                   fontsize=12, color='red', fontweight='bold')
        
        self.result_canvas.draw()
        
        status = '识别完成'
        if is_unknown:
            status += ' - 警告: 样本疑似未知类别'
        self.statusBar().showMessage(status)

    def save_model(self):
        if self.classifier is None or self.classifier.model is None:
            QMessageBox.warning(self, '警告', '没有可保存的模型')
            return
        
        name, ok = QFileDialog.getSaveFileName(self, '保存模型', '', 'Model Files (*.pkl)')
        if ok:
            model_path = self.classifier.save_model(name)
            self.db.save_model(
                name=os.path.basename(name),
                model_type=self.classifier.method,
                model_path=model_path
            )
            self.statusBar().showMessage('模型已保存')

    def load_model(self):
        file_path, _ = QFileDialog.getOpenFileName(self, '加载模型', '', 'Model Files (*.pkl)')
        if file_path:
            if self.classifier is None:
                self.classifier = OdorClassifier()
            self.classifier.load_model(file_path)
            
            self.realtime_acq.set_classifier(self.classifier)
            self.realtime_acq.set_feature_extractor(self.feature_extractor)
            
            self.statusBar().showMessage('模型已加载')

    def plot_pca(self):
        df = self.db.get_feature_matrix()
        
        if len(df) == 0:
            QMessageBox.warning(self, '警告', '数据库中没有样本数据')
            return
        
        X = []
        labels = []
        batch_labels = []
        
        for sample_id, group in df.groupby('sample_id'):
            features = group[['max_value', 'steady_value', 'rise_time', 
                             'area', 'slope', 'response_recovery_ratio']].values.flatten()
            X.append(features)
            labels.append(group['odor_class'].iloc[0])
            batch_labels.append(group['batch_date'].iloc[0])
        
        X = np.array(X)
        
        viz = PCAVisualizer(n_components=3)
        X_pca = viz.fit_transform(X)
        
        self.pca_canvas.clear()
        
        color_by = self.color_by_combo.currentText()
        color_labels = labels if color_by == '按类别' else batch_labels
        
        if self.pca_dim_combo.currentText() == '2D':
            ax = self.pca_canvas.fig.add_subplot(111)
            viz.plot_2d(X_pca, labels=color_labels, ax=ax)
        else:
            ax = self.pca_canvas.fig.add_subplot(111, projection='3d')
            viz.plot_3d(X_pca, labels=color_labels, ax=ax)
        
        self.pca_canvas.draw()
        self.statusBar().showMessage('PCA图已绘制')

    def refresh_sample_list(self):
        samples = self.db.get_all_samples()
        self.radar_sample_list.clear()
        
        for _, row in samples.iterrows():
            self.radar_sample_list.addItem(f"{row['id']} - {row['name']} ({row['odor_class']})")

    def plot_radar(self):
        selected_items = self.radar_sample_list.selectedItems()
        
        if not selected_items:
            QMessageBox.warning(self, '警告', '请选择样本')
            return
        
        self.radar_canvas.clear()
        ax = self.radar_canvas.fig.add_subplot(111, polar=True)
        
        radar = RadarPlot()
        all_values = []
        all_labels = []
        colors = []
        
        for i, item in enumerate(selected_items):
            sample_id = int(item.text().split(' - ')[0])
            features_df = self.db.get_features(sample_id)
            
            values = features_df['max_value'].values
            all_values.append(values)
            all_labels.append(item.text())
            colors.append(plt.cm.tab10(i))
        
        radar.plot(np.array(all_values), ax=ax, 
                  labels=all_labels, colors=colors)
        
        self.radar_canvas.draw()
        self.statusBar().showMessage('雷达图已绘制')

    def plot_clustering(self):
        df = self.db.get_feature_matrix()
        
        if len(df) == 0:
            QMessageBox.warning(self, '警告', '数据库中没有样本数据')
            return
        
        X = []
        labels = []
        
        for sample_id, group in df.groupby('sample_id'):
            features = group[['max_value', 'steady_value', 'rise_time', 
                             'area', 'slope', 'response_recovery_ratio']].values.flatten()
            X.append(features)
            labels.append(f"{sample_id}-{group['odor_class'].iloc[0]}")
        
        X = np.array(X)
        
        self.cluster_canvas.clear()
        ax = self.cluster_canvas.fig.add_subplot(111)
        
        hc = HierarchicalClustering(
            method=self.linkage_combo.currentText(),
            metric=self.metric_combo.currentText()
        )
        hc.plot_dendrogram(X, labels=labels, ax=ax)
        
        self.cluster_canvas.draw()
        self.statusBar().showMessage('聚类树已绘制')

    def apply_drift_compensation(self):
        df = self.db.get_feature_matrix()
        
        if len(df) == 0:
            QMessageBox.warning(self, '警告', '数据库中没有样本数据')
            return
        
        X = []
        batch_labels = []
        odor_labels = []
        
        for sample_id, group in df.groupby('sample_id'):
            features = group[['max_value', 'steady_value', 'rise_time', 
                             'area', 'slope', 'response_recovery_ratio']].values.flatten()
            X.append(features)
            batch_labels.append(group['batch_date'].iloc[0])
            odor_labels.append(group['odor_class'].iloc[0])
        
        X = np.array(X)
        
        self.drift_before_canvas.clear()
        ax1 = self.drift_before_canvas.fig.add_subplot(111)
        viz_before = PCAVisualizer(n_components=2)
        X_before_pca = viz_before.fit_transform(X)
        viz_before.plot_2d(X_before_pca, labels=batch_labels, ax=ax1, title='补偿前 - 按批次着色')
        
        method = self.drift_method_combo.currentText()
        
        if method == 'PCA投影':
            compensator = DriftCompensator(n_components=2)
            X_corrected = compensator.fit_transform(X)
            X_corrected = compensator.inverse_transform(X_corrected)
        elif method == '批次对齐':
            remover = BatchEffectRemover()
            X_corrected = remover.fit_transform(X, batch_labels)
        else:
            da = DomainAdaptation(method='coral')
            unique_batches = np.unique(batch_labels)
            ref_batch = unique_batches[0]
            ref_mask = np.array([b == ref_batch for b in batch_labels])
            X_source = X[ref_mask]
            X_corrected = da.fit(X_source, X).transform(X)
        
        self.drift_after_canvas.clear()
        ax2 = self.drift_after_canvas.fig.add_subplot(111)
        viz_after = PCAVisualizer(n_components=2)
        X_after_pca = viz_after.fit_transform(X_corrected)
        viz_after.plot_2d(X_after_pca, labels=batch_labels, ax=ax2, title='补偿后 - 按批次着色')
        
        self.drift_before_canvas.draw()
        self.drift_after_canvas.draw()
        self.statusBar().showMessage('漂移补偿完成')

    def load_samples(self):
        filter_class = self.filter_class_combo.currentText()
        
        if filter_class == '全部':
            samples = self.db.get_all_samples()
        else:
            samples = self.db.get_samples_by_class(filter_class)
        
        self.samples_table.setRowCount(len(samples))
        self.samples_table.setColumnCount(6)
        self.samples_table.setHorizontalHeaderLabels(
            ['ID', '名称', '类别', '传感器', '采样率', '批次日期']
        )
        
        for i, (_, row) in enumerate(samples.iterrows()):
            self.samples_table.setItem(i, 0, QTableWidgetItem(str(row['id'])))
            self.samples_table.setItem(i, 1, QTableWidgetItem(row['name']))
            self.samples_table.setItem(i, 2, QTableWidgetItem(row['odor_class']))
            self.samples_table.setItem(i, 3, QTableWidgetItem(str(row['sensor_count'])))
            self.samples_table.setItem(i, 4, QTableWidgetItem(f"{row['sampling_rate']:.1f}"))
            self.samples_table.setItem(i, 5, QTableWidgetItem(row['batch_date']))
            
            color = CLASS_COLORS.get(row['odor_class'], '#FFFFFF')
            for j in range(6):
                self.samples_table.item(i, j).setBackground(QColor(color))
                self.samples_table.item(i, j).setForeground(
                    QColor('#000000' if color != '#FFFAF0' else '#000000')
                )
        
        self.refresh_sample_list()

    def on_sample_selected(self):
        selected = self.samples_table.selectedItems()
        if not selected:
            return
        
        row = selected[0].row()
        sample_id = int(self.samples_table.item(row, 0).text())
        
        samples = self.db.get_all_samples()
        sample = samples[samples['id'] == sample_id].iloc[0]
        
        self.edit_name_input.setText(sample['name'])
        idx = self.edit_class_combo.findText(sample['odor_class'])
        if idx >= 0:
            self.edit_class_combo.setCurrentIndex(idx)
        self.edit_notes_input.setText(sample.get('notes', ''))
        
        sensor_data = self.db.get_sensor_data(sample_id)
        if sensor_data:
            times = sensor_data[0]['time']
            responses = np.column_stack([sensor_data[i]['response'] 
                                        for i in range(len(sensor_data))])
            self.current_data = {
                'time': times,
                'responses': responses,
                'sensor_count': len(sensor_data),
                'sampling_rate': sample['sampling_rate']
            }
            self.update_data_info()

    def update_sample(self):
        selected = self.samples_table.selectedItems()
        if not selected:
            QMessageBox.warning(self, '警告', '请选择样本')
            return
        
        row = selected[0].row()
        sample_id = int(self.samples_table.item(row, 0).text())
        
        self.db.update_sample(
            sample_id,
            name=self.edit_name_input.text(),
            odor_class=self.edit_class_combo.currentText(),
            notes=self.edit_notes_input.toPlainText()
        )
        
        self.load_samples()
        self.statusBar().showMessage('样本已更新')

    def delete_sample(self):
        selected = self.samples_table.selectedItems()
        if not selected:
            QMessageBox.warning(self, '警告', '请选择样本')
            return
        
        reply = QMessageBox.question(self, '确认', '确定要删除此样本吗？',
                                    QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            row = selected[0].row()
            sample_id = int(self.samples_table.item(row, 0).text())
            self.db.delete_sample(sample_id)
            self.load_samples()
            self.statusBar().showMessage('样本已删除')

    def start_acquisition(self):
        sampling_rate_map = {
            '10 Hz': 10,
            '25 Hz': 25,
            '50 Hz': 50,
            '100 Hz': 100
        }
        
        sampling_rate = sampling_rate_map.get(self.rt_rate_combo.currentText(), 50)
        n_sensors = self.rt_sensor_spin.value()
        max_display_points = self.max_display_spin.value()
        
        self.sensor_diagnostic = RealTimeSensorDiagnostic(n_sensors=n_sensors)
        self.concentration_estimator = ConcentrationEstimator(n_sensors=n_sensors)
        
        ref_baselines = np.ones(n_sensors) * 0.1
        ref_responses = np.ones(n_sensors) * 0.8
        self.sensor_diagnostic.set_reference(ref_baselines, ref_responses)
        
        self._init_sensor_status_table(n_sensors)
        
        self.realtime_acq = RealTimeAcquisition(
            n_sensors=n_sensors,
            sampling_rate=sampling_rate,
            max_display_points=max_display_points,
            display_fps=30
        )
        
        self.realtime_acq.set_simulated_odor(self.rt_odor_combo.currentText())
        self.realtime_acq.set_classifier(self.classifier)
        self.realtime_acq.set_feature_extractor(self.feature_extractor)
        
        self.realtime_acq.data_received.connect(self.update_realtime_plot)
        self.realtime_acq.prediction_result.connect(self.update_realtime_result)
        self.realtime_acq.acquisition_stopped.connect(self.on_acquisition_stopped)
        
        self.realtime_acq.start_acquisition(use_simulation=self.use_simulation_check.isChecked())
        
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.statusBar().showMessage(f'采集开始 - {sampling_rate} Hz, {n_sensors} 传感器')

    def stop_acquisition(self):
        self.realtime_acq.stop_acquisition()

    def on_acquisition_stopped(self):
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.statusBar().showMessage('采集停止')

    def _init_sensor_status_table(self, n_sensors):
        self.sensor_status_table.setRowCount(n_sensors)
        for i in range(n_sensors):
            self.sensor_status_table.setItem(i, 0, QTableWidgetItem(f'S{i+1}'))
            self.sensor_status_table.setItem(i, 1, QTableWidgetItem('正常'))
            self.sensor_status_table.setItem(i, 2, QTableWidgetItem('100'))

    def _update_sensor_diagnosis(self, diagnosis):
        overall_health = self.sensor_diagnostic.get_overall_health_score()
        self.overall_health_bar.setValue(overall_health)
        
        if overall_health >= 80:
            self.overall_health_bar.setStyleSheet("QProgressBar::chunk { background-color: #2ECC71; }")
        elif overall_health >= 50:
            self.overall_health_bar.setStyleSheet("QProgressBar::chunk { background-color: #F39C12; }")
        else:
            self.overall_health_bar.setStyleSheet("QProgressBar::chunk { background-color: #E74C3C; }")
        
        for i in range(len(diagnosis['sensor_status'])):
            status = diagnosis['sensor_status'][i]
            health_score = self.sensor_diagnostic.get_sensor_health_score(i)
            
            status_text = {'normal': '正常', 'warning': '警告', 'error': '故障', 'critical': '严重'}.get(status, status)
            self.sensor_status_table.setItem(i, 1, QTableWidgetItem(status_text))
            self.sensor_status_table.setItem(i, 2, QTableWidgetItem(str(health_score)))
            
            if status == 'normal':
                color = QColor('#2ECC71')
            elif status == 'warning':
                color = QColor('#F39C12')
            elif status == 'error':
                color = QColor('#E74C3C')
            else:
                color = QColor('#8E44AD')
            
            for j in range(3):
                self.sensor_status_table.item(i, j).setBackground(color)
        
        overall_status = diagnosis['overall_status']
        status_text = {'normal': '系统正常', 'warning': '传感器警告', 'error': '传感器故障', 'critical': '系统严重故障'}.get(overall_status, overall_status)
        self.diagnosis_label.setText(status_text)
        
        if diagnosis['failed_sensors']:
            failed = ', '.join([f'S{i+1}' for i in diagnosis['failed_sensors']])
            self.diagnosis_details_label.setText(f'故障传感器: {failed}')
        elif diagnosis['warning_sensors']:
            warned = ', '.join([f'S{i+1}' for i in diagnosis['warning_sensors']])
            self.diagnosis_details_label.setText(f'警告传感器: {warned}')
        else:
            self.diagnosis_details_label.setText('-')

    def _estimate_concentration(self, top3, responses):
        if len(responses) == 0:
            return
        
        mean_responses = np.mean(responses[-100:, :], axis=0) if responses.ndim > 1 else responses
        conc_result = self.concentration_estimator.estimate_from_top3(top3, mean_responses)
        
        if conc_result and conc_result['best_estimate']:
            best = conc_result['best_estimate']
            self.rt_concentration_label.setText(f"{best['concentration']} {best['unit']}")
            self.rt_concentration_range_label.setText(best['range'])
        else:
            self.rt_concentration_label.setText('无法估算')
            self.rt_concentration_range_label.setText('-')

    def update_realtime_plot(self, times, responses):
        self.rt_canvas.clear()
        ax = self.rt_canvas.fig.add_subplot(111)
        
        plotter = ResponseCurvePlot()
        plotter.plot(times, responses, ax=ax, title='实时响应曲线')
        
        self.rt_canvas.draw()
        
        diagnosis = self.sensor_diagnostic.process_realtime_data(times, responses)
        self._update_sensor_diagnosis(diagnosis)

    def update_realtime_result(self, top3):
        for i, result in enumerate(top3):
            suffix = ''
            if result.get('is_unknown', False):
                suffix = ' [未知]'
            self.rt_result_labels[i].setText(f"{result['class']} - {result['similarity']:.2f}%{suffix}")
        
        times, responses = self.realtime_acq.get_current_data()
        if responses is not None:
            self._estimate_concentration(top3, responses)


import matplotlib.pyplot as plt
