#include "gui/TimeHistoryWidget.h"
#include "io/DataExporter.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QPushButton>
#include <QComboBox>
#include <QLabel>
#include <QListWidget>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QDateTime>
#include <QFileDialog>
#include <QMessageBox>
#include <QInputDialog>
#include <QtCharts/QLineSeries>
#include <QtCharts/QValueAxis>
#include <QtCharts/QDateTimeAxis>
#include <QtCharts/QChart>
#include <QtCharts/QChartView>

using namespace QtCharts;

TimeHistoryWidget::TimeHistoryWidget(QWidget* parent)
    : QWidget(parent)
    , m_pointCounter(0)
    , m_isRecording(false)
    , m_samplingRate(30.0)
    , m_currentStrainType("Exx")
{
    m_colors = {
        Qt::red, Qt::blue, Qt::green, Qt::magenta, Qt::cyan,
        Qt::yellow, Qt::darkRed, Qt::darkBlue, Qt::darkGreen, Qt::darkMagenta
    };
    setupUI();
}

void TimeHistoryWidget::setupUI() {
    auto* mainLayout = new QHBoxLayout(this);

    auto* controlPanel = new QWidget(this);
    auto* controlLayout = new QVBoxLayout(controlPanel);

    auto* pointGroup = new QGroupBox(tr("Measurement Points"), controlPanel);
    auto* pointLayout = new QVBoxLayout(pointGroup);

    m_pointList = new QListWidget(pointGroup);
    pointLayout->addWidget(m_pointList);

    auto* pointBtnLayout = new QHBoxLayout();
    m_btnAddPoint = new QPushButton(tr("Add"), pointGroup);
    m_btnRemovePoint = new QPushButton(tr("Remove"), pointGroup);
    m_btnClearPoints = new QPushButton(tr("Clear"), pointGroup);
    pointBtnLayout->addWidget(m_btnAddPoint);
    pointBtnLayout->addWidget(m_btnRemovePoint);
    pointBtnLayout->addWidget(m_btnClearPoints);
    pointLayout->addLayout(pointBtnLayout);

    controlLayout->addWidget(pointGroup);

    auto* strainGroup = new QGroupBox(tr("Strain Component"), controlPanel);
    auto* strainLayout = new QVBoxLayout(strainGroup);
    m_strainTypeCombo = new QComboBox(strainGroup);
    m_strainTypeCombo->addItem("Exx", "exx");
    m_strainTypeCombo->addItem("Eyy", "eyy");
    m_strainTypeCombo->addItem("Exy", "exy");
    m_strainTypeCombo->addItem("E1", "e1");
    m_strainTypeCombo->addItem("E2", "e2");
    m_strainTypeCombo->addItem("Max Shear", "maxshear");
    m_strainTypeCombo->addItem("Von Mises", "vonmises");
    strainLayout->addWidget(m_strainTypeCombo);
    controlLayout->addWidget(strainGroup);

    auto* recordGroup = new QGroupBox(tr("Recording"), controlPanel);
    auto* recordLayout = new QVBoxLayout(recordGroup);
    m_btnStartStop = new QPushButton(tr("Start"), recordGroup);
    recordLayout->addWidget(m_btnStartStop);
    m_btnExport = new QPushButton(tr("Export CSV"), recordGroup);
    recordLayout->addWidget(m_btnExport);
    m_statusLabel = new QLabel(tr("Idle"), recordGroup);
    recordLayout->addWidget(m_statusLabel);
    controlLayout->addWidget(recordGroup);

    controlLayout->addStretch();

    mainLayout->addWidget(controlPanel, 0);

    m_chart = new QChart();
    m_chart->setTitle(tr("Strain - Time History"));
    m_chart->setAnimationOptions(QChart::SeriesAnimations);
    m_chart->legend()->setVisible(true);
    m_chart->legend()->setAlignment(Qt::AlignBottom);

    auto* axisX = new QValueAxis();
    axisX->setTitleText(tr("Time (s)"));
    m_chart->addAxis(axisX, Qt::AlignBottom);

    auto* axisY = new QValueAxis();
    axisY->setTitleText(tr("Strain"));
    m_chart->addAxis(axisY, Qt::AlignLeft);

    m_chartView = new QChartView(m_chart);
    m_chartView->setRenderHint(QPainter::Antialiasing);
    mainLayout->addWidget(m_chartView, 1);

    connect(m_btnAddPoint, &QPushButton::clicked, this, [this]() {
        bool ok;
        QString name = QInputDialog::getText(this, tr("Add Point"), tr("Point name:"),
                                            QLineEdit::Normal, QString("P%1").arg(++m_pointCounter), &ok);
        if (ok && !name.isEmpty()) {
            addPoint(QPoint(-1, -1), name);
        }
    });

    connect(m_btnRemovePoint, &QPushButton::clicked, this, [this]() {
        int row = m_pointList->currentRow();
        if (row >= 0) removePoint(row);
    });

    connect(m_btnClearPoints, &QPushButton::clicked, this, &TimeHistoryWidget::clearPoints);

    connect(m_btnStartStop, &QPushButton::clicked, this, [this]() {
        if (m_isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    connect(m_btnExport, &QPushButton::clicked, this, [this]() {
        if (m_times.empty()) {
            QMessageBox::information(this, tr("Export"), tr("No data to export"));
            return;
        }
        QString path = QFileDialog::getSaveFileName(this, tr("Export CSV"),
            QString("strain_history_%1.csv").arg(QDateTime::currentDateTime().toString("yyyyMMdd_HHmmss")),
            tr("CSV Files (*.csv)"));
        if (!path.isEmpty()) {
            DataExporter::exportTimeHistoryCSV(path, m_times, m_strainData, m_pointNames);
            QMessageBox::information(this, tr("Export"), tr("Data exported successfully"));
        }
    });

    connect(m_strainTypeCombo, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &TimeHistoryWidget::onStrainTypeChanged);

    connect(m_pointList, &QListWidget::currentRowChanged, this, &TimeHistoryWidget::onPointSelectionChanged);
}

void TimeHistoryWidget::setStrainType(const QString& type) {
    m_currentStrainType = type;
    int idx = m_strainTypeCombo->findData(type);
    if (idx >= 0) m_strainTypeCombo->setCurrentIndex(idx);
}

void TimeHistoryWidget::setDataSamplingRate(double rateHz) {
    m_samplingRate = rateHz;
}

void TimeHistoryWidget::addPoint(const QPoint& imagePoint, const QString& name) {
    m_points.append(imagePoint);
    QString pointName = name.isEmpty() ? QString("P%1").arg(++m_pointCounter) : name;
    m_pointNames.append(pointName);
    m_pointList->addItem(QString("%1 (%2,%3)").arg(pointName).arg(imagePoint.x()).arg(imagePoint.y()));

    auto* series = new QLineSeries();
    series->setName(pointName);
    series->setColor(m_colors[(m_points.size() - 1) % m_colors.size()]);
    m_chart->addSeries(series);
    auto axes = m_chart->axes();
    series->attachAxis(axes[0]);
    series->attachAxis(axes[1]);

    updateChart();
}

void TimeHistoryWidget::removePoint(int index) {
    if (index < 0 || index >= m_points.size()) return;

    m_points.removeAt(index);
    m_pointNames.removeAt(index);
    delete m_pointList->takeItem(index);

    auto seriesList = m_chart->series();
    if (index < seriesList.size()) {
        m_chart->removeSeries(seriesList[index]);
        delete seriesList[index];
    }

    if (index < static_cast<int>(m_strainData.size())) {
        m_strainData.erase(m_strainData.begin() + index);
    }
}

void TimeHistoryWidget::clearPoints() {
    m_points.clear();
    m_pointNames.clear();
    m_pointList->clear();
    for (auto* series : m_chart->series()) {
        m_chart->removeSeries(series);
        delete series;
    }
    m_strainData.clear();
}

void TimeHistoryWidget::addFrameData(double time, const std::vector<double>& strainValues) {
    if (!m_isRecording) return;

    m_times.push_back(time);
    for (size_t i = 0; i < m_strainData.size() && i < strainValues.size(); ++i) {
        m_strainData[i].push_back(strainValues[i]);
    }
    updateChart();

    m_statusLabel->setText(tr("Frames: %1").arg(m_times.size()));
}

void TimeHistoryWidget::setFrameData(const std::vector<double>& times,
                                     const std::vector<std::vector<double>>& strainData)
{
    m_times = times;
    m_strainData = strainData;
    updateChart();
}

void TimeHistoryWidget::startRecording() {
    m_isRecording = true;
    m_btnStartStop->setText(tr("Stop"));
    m_statusLabel->setText(tr("Recording..."));
    m_times.clear();
    m_strainData.assign(m_points.size(), std::vector<double>());
    emit recordingStarted();
}

void TimeHistoryWidget::stopRecording() {
    m_isRecording = false;
    m_btnStartStop->setText(tr("Start"));
    m_statusLabel->setText(tr("Stopped. Frames: %1").arg(m_times.size()));
    emit recordingStopped();
}

void TimeHistoryWidget::onPointSelectionChanged() {
    // Could highlight the selected point on the chart
}

void TimeHistoryWidget::onStrainTypeChanged(int index) {
    Q_UNUSED(index);
    m_currentStrainType = m_strainTypeCombo->currentData().toString();
}

void TimeHistoryWidget::updateChart() {
    auto seriesList = m_chart->series();
    for (int i = 0; i < seriesList.size() && i < static_cast<int>(m_strainData.size()); ++i) {
        auto* lineSeries = qobject_cast<QLineSeries*>(seriesList[i]);
        if (!lineSeries) continue;
        lineSeries->clear();
        const auto& data = m_strainData[i];
        for (int j = 0; j < static_cast<int>(m_times.size()) && j < static_cast<int>(data.size()); ++j) {
            lineSeries->append(m_times[j], data[j]);
        }
    }
}
