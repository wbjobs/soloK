import numpy as np
import matplotlib
matplotlib.use('Qt5Agg')
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.backends.backend_qt5agg import NavigationToolbar2QT as NavigationToolbar
from mpl_toolkits.mplot3d import Axes3D
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import AgglomerativeClustering
from scipy.cluster.hierarchy import dendrogram, linkage
from scipy.spatial.distance import pdist
import seaborn as sns
from config import CLASS_COLORS, ODOR_CLASSES

plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
plt.rcParams['axes.unicode_minus'] = False


class PlotCanvas(FigureCanvas):
    def __init__(self, parent=None, width=8, height=6, dpi=100):
        self.fig = Figure(figsize=(width, height), dpi=dpi)
        super().__init__(self.fig)
        self.setParent(parent)
        self.axes = None

    def clear(self):
        self.fig.clear()
        self.draw()


class PCAVisualizer:
    def __init__(self, n_components=3):
        self.n_components = n_components
        self.scaler = StandardScaler()
        self.pca = PCA(n_components=n_components)
        self.explained_variance_ratio_ = None

    def fit_transform(self, X):
        X_scaled = self.scaler.fit_transform(X)
        X_pca = self.pca.fit_transform(X_scaled)
        self.explained_variance_ratio_ = self.pca.explained_variance_ratio_
        return X_pca

    def transform(self, X):
        X_scaled = self.scaler.transform(X)
        return self.pca.transform(X_scaled)

    def plot_2d(self, X_pca, labels=None, ax=None, title='PCA得分图 (2D)'):
        if ax is None:
            fig, ax = plt.subplots(figsize=(10, 8))
        
        unique_labels = np.unique(labels) if labels is not None else ['Data']
        
        for i, label in enumerate(unique_labels):
            if labels is not None:
                mask = np.array(labels) == label
                x = X_pca[mask, 0]
                y = X_pca[mask, 1]
                color = CLASS_COLORS.get(label, plt.cm.tab10(i))
            else:
                x = X_pca[:, 0]
                y = X_pca[:, 1]
                color = 'steelblue'
                label = 'Data'
            
            ax.scatter(x, y, c=color, label=label, alpha=0.7, s=80, edgecolors='white', linewidth=0.5)
        
        ax.set_xlabel(f'PC1 ({self.explained_variance_ratio_[0]:.2%} 方差)', fontsize=12)
        ax.set_ylabel(f'PC2 ({self.explained_variance_ratio_[1]:.2%} 方差)', fontsize=12)
        ax.set_title(title, fontsize=14, fontweight='bold')
        ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
        ax.grid(True, alpha=0.3)
        
        return ax

    def plot_3d(self, X_pca, labels=None, ax=None, title='PCA得分图 (3D)'):
        if ax is None:
            fig = plt.figure(figsize=(10, 8))
            ax = fig.add_subplot(111, projection='3d')
        
        unique_labels = np.unique(labels) if labels is not None else ['Data']
        
        for i, label in enumerate(unique_labels):
            if labels is not None:
                mask = np.array(labels) == label
                x = X_pca[mask, 0]
                y = X_pca[mask, 1]
                z = X_pca[mask, 2]
                color = CLASS_COLORS.get(label, plt.cm.tab10(i))
            else:
                x = X_pca[:, 0]
                y = X_pca[:, 1]
                z = X_pca[:, 2]
                color = 'steelblue'
                label = 'Data'
            
            ax.scatter(x, y, z, c=color, label=label, alpha=0.7, s=80, edgecolors='white', linewidth=0.5)
        
        ax.set_xlabel(f'PC1 ({self.explained_variance_ratio_[0]:.2%})', fontsize=10)
        ax.set_ylabel(f'PC2 ({self.explained_variance_ratio_[1]:.2%})', fontsize=10)
        ax.set_zlabel(f'PC3 ({self.explained_variance_ratio_[2]:.2%})', fontsize=10)
        ax.set_title(title, fontsize=14, fontweight='bold')
        ax.legend(bbox_to_anchor=(1.2, 1), loc='upper left')
        
        return ax


class RadarPlot:
    def __init__(self, sensor_names=None):
        self.sensor_names = sensor_names

    def plot(self, values, ax=None, title='雷达图', labels=None, colors=None):
        values = np.array(values)
        if values.ndim == 1:
            values = values.reshape(1, -1)
        
        n_samples, n_vars = values.shape
        n_sensors = n_vars
        
        if self.sensor_names is None:
            self.sensor_names = [f'S{i+1}' for i in range(n_sensors)]
        
        angles = np.linspace(0, 2 * np.pi, n_sensors, endpoint=False).tolist()
        angles += angles[:1]
        
        if ax is None:
            fig = plt.figure(figsize=(8, 8))
            ax = fig.add_subplot(111, polar=True)
        
        if colors is None:
            colors = [plt.cm.tab10(i) for i in range(n_samples)]
        
        if labels is None:
            labels = [f'样本 {i+1}' for i in range(n_samples)]
        
        for i in range(n_samples):
            val = values[i].tolist()
            val += val[:1]
            ax.plot(angles, val, 'o-', linewidth=2, label=labels[i], color=colors[i])
            ax.fill(angles, val, alpha=0.25, color=colors[i])
        
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(self.sensor_names, fontsize=10)
        ax.set_title(title, size=14, y=1.1, fontweight='bold')
        ax.legend(loc='upper right', bbox_to_anchor=(1.3, 1.1))
        ax.grid(True)
        
        return ax


class HierarchicalClustering:
    def __init__(self, method='ward', metric='euclidean'):
        self.method = method
        self.metric = metric
        self.linkage_matrix = None

    def fit(self, X):
        self.linkage_matrix = linkage(X, method=self.method, metric=self.metric)
        return self

    def plot_dendrogram(self, X, labels=None, ax=None, title='层次聚类树状图', color_threshold=None):
        if self.linkage_matrix is None:
            self.fit(X)
        
        if ax is None:
            fig, ax = plt.subplots(figsize=(12, 8))
        
        if labels is not None:
            labels = [str(l) for l in labels]
        
        dendrogram(
            self.linkage_matrix,
            labels=labels,
            ax=ax,
            leaf_rotation=45,
            leaf_font_size=10,
            color_threshold=color_threshold
        )
        
        ax.set_ylabel('距离', fontsize=12)
        ax.set_title(title, fontsize=14, fontweight='bold')
        plt.setp(ax.get_xticklabels(), rotation=45, ha='right')
        
        return ax


class ResponseCurvePlot:
    def __init__(self):
        pass

    def plot(self, time, responses, sensor_names=None, ax=None, title='传感器响应曲线'):
        if ax is None:
            fig, ax = plt.subplots(figsize=(12, 6))
        
        n_sensors = responses.shape[1]
        
        if sensor_names is None:
            sensor_names = [f'S{i+1}' for i in range(n_sensors)]
        
        colors = plt.cm.tab10(np.linspace(0, 1, min(n_sensors, 10)))
        
        for i in range(n_sensors):
            color_idx = i % 10
            ax.plot(time, responses[:, i], label=sensor_names[i], 
                   color=colors[color_idx], linewidth=1.5, alpha=0.8)
        
        ax.set_xlabel('时间 (s)', fontsize=12)
        ax.set_ylabel('响应值', fontsize=12)
        ax.set_title(title, fontsize=14, fontweight='bold')
        ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left', ncol=2)
        ax.grid(True, alpha=0.3)
        
        return ax

    def plot_single(self, time, response, sensor_name='Sensor', ax=None, title=None):
        if ax is None:
            fig, ax = plt.subplots(figsize=(10, 4))
        
        ax.plot(time, response, linewidth=2, color='steelblue')
        ax.fill_between(time, response, alpha=0.3, color='steelblue')
        
        ax.set_xlabel('时间 (s)', fontsize=12)
        ax.set_ylabel('响应值', fontsize=12)
        if title:
            ax.set_title(title, fontsize=14, fontweight='bold')
        else:
            ax.set_title(f'{sensor_name} 响应曲线', fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3)
        
        return ax


class HeatmapPlot:
    def __init__(self):
        pass

    def plot_feature_heatmap(self, features, sample_labels=None, feature_names=None, 
                             ax=None, title='特征热力图'):
        if ax is None:
            fig, ax = plt.subplots(figsize=(12, 8))
        
        sns.heatmap(
            features,
            annot=False,
            cmap='viridis',
            ax=ax,
            xticklabels=feature_names if feature_names else True,
            yticklabels=sample_labels if sample_labels else True,
            cbar_kws={'label': '标准化值'}
        )
        
        ax.set_title(title, fontsize=14, fontweight='bold')
        plt.setp(ax.get_xticklabels(), rotation=45, ha='right')
        
        return ax


class ClassificationResultPlot:
    def __init__(self):
        pass

    def plot_top3(self, top3_results, ax=None, title='识别结果'):
        if ax is None:
            fig, ax = plt.subplots(figsize=(8, 5))
        
        classes = [r['class'] for r in top3_results]
        similarities = [r['similarity'] for r in top3_results]
        
        colors = ['#2ECC71', '#3498DB', '#E74C3C']
        
        bars = ax.barh(classes[::-1], similarities[::-1], color=colors[::-1], alpha=0.8)
        
        for i, (bar, sim) in enumerate(zip(bars, similarities[::-1])):
            width = bar.get_width()
            ax.text(width + 1, bar.get_y() + bar.get_height()/2,
                   f'{sim:.2f}%',
                   va='center', fontsize=12, fontweight='bold')
        
        ax.set_xlabel('相似度 (%)', fontsize=12)
        ax.set_title(title, fontsize=14, fontweight='bold')
        ax.set_xlim(0, 110)
        ax.grid(True, alpha=0.3, axis='x')
        
        return ax
