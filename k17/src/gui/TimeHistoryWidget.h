#ifndef TIMEHISTORYWIDGET_H
#define TIMEHISTORYWIDGET_H

#include <QWidget>
#include <QChartView>
#include <QLineSeries>
#include <QValueAxis>
#include <QCheckBox>
#include <QComboBox>
#include <QVector>
#include <QPoint>
#include <QStringList>
#include <vector>

class QLabel;
class QPushButton;
class QListWidget;
class QSpinBox;
class QComboBox;

class TimeHistoryWidget : public QWidget {
    Q_OBJECT

public:
    explicit TimeHistoryWidget(QWidget* parent = nullptr);

    void setStrainType(const QString& type);
    void setDataSamplingRate(double rateHz);

public slots:
    void addPoint(const QPoint& imagePoint, const QString& name = QString());
    void removePoint(int index);
    void clearPoints();

    void addFrameData(double time, const std::vector<double>& strainValues);
    void setFrameData(const std::vector<double>& times,
                      const std::vector<std::vector<double>>& strainData);

    void startRecording();
    void stopRecording();

signals:
    void recordingStarted();
    void recordingStopped();

private slots:
    void onPointSelectionChanged();
    void onStrainTypeChanged(int index);
    void onExportData();

private:
    void setupUI();
    void updateChart();

    QChartView* m_chartView;
    QChart* m_chart;
    QListWidget* m_pointList;
    QComboBox* m_strainTypeCombo;
    QPushButton* m_btnAddPoint;
    QPushButton* m_btnRemovePoint;
    QPushButton* m_btnClearPoints;
    QPushButton* m_btnExport;
    QPushButton* m_btnStartStop;
    QLabel* m_statusLabel;
    QSpinBox* m_maxPointsSpin;

    QVector<QPoint> m_points;
    QStringList m_pointNames;
    std::vector<double> m_times;
    std::vector<std::vector<double>> m_strainData;
    QVector<QColor> m_colors;
    int m_pointCounter;
    bool m_isRecording;
    double m_samplingRate;
    QString m_currentStrainType;
};

#endif
