#include "gui/CalibrationDialog.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QPushButton>
#include <QLineEdit>
#include <QDoubleSpinBox>
#include <QComboBox>
#include <QLabel>
#include <QFormLayout>
#include <QMessageBox>
#include <QFileDialog>
#include <QTabWidget>
#include <QImage>
#include <QPixmap>
#include <QDialogButtonBox>
#include <QSpinBox>

CalibrationDialog::CalibrationDialog(Calibrator* calibrator, QWidget* parent)
    : QDialog(parent)
    , m_calibrator(calibrator)
{
    if (m_calibrator) {
        m_data = m_calibrator->data();
    }
    setupUI();
    updateStatus();
    setWindowTitle(tr("System Calibration"));
    resize(500, 400);
}

void CalibrationDialog::setupUI() {
    auto* mainLayout = new QVBoxLayout(this);

    auto* tabWidget = new QTabWidget(this);

    auto* manualTab = new QWidget();
    auto* manualLayout = new QVBoxLayout(manualTab);

    auto* manualGroup = new QGroupBox(tr("Manual Reference Calibration"));
    auto* formLayout = new QFormLayout(manualGroup);

    m_spinPixelLength = new QDoubleSpinBox(manualGroup);
    m_spinPixelLength->setRange(1, 100000);
    m_spinPixelLength->setDecimals(1);
    m_spinPixelLength->setValue(m_data.referenceLengthPixels > 0 ? m_data.referenceLengthPixels : 100);
    formLayout->addRow(tr("Pixel Distance:"), m_spinPixelLength);

    m_spinPhysicalLength = new QDoubleSpinBox(manualGroup);
    m_spinPhysicalLength->setRange(0.001, 10000);
    m_spinPhysicalLength->setDecimals(4);
    m_spinPhysicalLength->setSingleStep(0.1);
    m_spinPhysicalLength->setValue(m_data.referenceLengthPhysical > 0 ? m_data.referenceLengthPhysical : 1.0);
    formLayout->addRow(tr("Physical Length:"), m_spinPhysicalLength);

    m_comboUnit = new QComboBox(manualGroup);
    m_comboUnit->addItem("mm", "mm");
    m_comboUnit->addItem("μm", "μm");
    m_comboUnit->addItem("cm", "cm");
    m_comboUnit->addItem("inch", "inch");
    int unitIdx = m_comboUnit->findData(m_data.physicalUnit);
    if (unitIdx >= 0) m_comboUnit->setCurrentIndex(unitIdx);
    formLayout->addRow(tr("Unit:"), m_comboUnit);

    manualLayout->addWidget(manualGroup);

    auto* btnCalibrate = new QPushButton(tr("Calibrate"), manualTab);
    manualLayout->addWidget(btnCalibrate);
    manualLayout->addStretch();

    connect(btnCalibrate, &QPushButton::clicked, this, &CalibrationDialog::onManualCalibrate);

    tabWidget->addTab(manualTab, tr("Manual"));

    auto* boardTab = new QWidget();
    auto* boardLayout = new QVBoxLayout(boardTab);

    auto* boardGroup = new QGroupBox(tr("Checkerboard Calibration"));
    auto* boardForm = new QFormLayout(boardGroup);

    m_spinBoardCols = new QDoubleSpinBox(boardGroup);
    m_spinBoardCols->setRange(3, 20);
    m_spinBoardCols->setDecimals(0);
    m_spinBoardCols->setValue(9);
    boardForm->addRow(tr("Inner Columns:"), m_spinBoardCols);

    m_spinBoardRows = new QDoubleSpinBox(boardGroup);
    m_spinBoardRows->setRange(3, 20);
    m_spinBoardRows->setDecimals(0);
    m_spinBoardRows->setValue(6);
    boardForm->addRow(tr("Inner Rows:"), m_spinBoardRows);

    m_spinSquareSize = new QDoubleSpinBox(boardGroup);
    m_spinSquareSize->setRange(0.1, 100);
    m_spinSquareSize->setDecimals(3);
    m_spinSquareSize->setSingleStep(0.5);
    m_spinSquareSize->setValue(10);
    boardForm->addRow(tr("Square Size (mm):"), m_spinSquareSize);

    boardLayout->addWidget(boardGroup);

    m_btnLoadImages = new QPushButton(tr("Load Calibration Images..."), boardTab);
    boardLayout->addWidget(m_btnLoadImages);

    m_labelPreview = new QLabel(tr("No images loaded"), boardTab);
    m_labelPreview->setAlignment(Qt::AlignCenter);
    m_labelPreview->setMinimumHeight(150);
    m_labelPreview->setStyleSheet("border: 1px solid #666; background:#222; color:#aaa;");
    boardLayout->addWidget(m_labelPreview);

    boardLayout->addStretch();

    connect(m_btnLoadImages, &QPushButton::clicked, this, &CalibrationDialog::onLoadCalibrationImages);

    tabWidget->addTab(boardTab, tr("Checkerboard"));

    mainLayout->addWidget(tabWidget);

    m_labelStatus = new QLabel(this);
    mainLayout->addWidget(m_labelStatus);

    auto* btnBox = new QDialogButtonBox(QDialogButtonBox::Ok | QDialogButtonBox::Cancel, this);
    mainLayout->addWidget(btnBox);

    connect(btnBox, &QDialogButtonBox::accepted, this, &CalibrationDialog::onApply);
    connect(btnBox, &QDialogButtonBox::rejected, this, &QDialog::reject);
}

void CalibrationDialog::onManualCalibrate() {
    if (!m_calibrator) return;
    double pxLen = m_spinPixelLength->value();
    double physLen = m_spinPhysicalLength->value();
    QString unit = m_comboUnit->currentData().toString();
    m_calibrator->calibrateFromReference(pxLen, physLen, unit);
    m_data = m_calibrator->data();
    updateStatus();
}

void CalibrationDialog::onLoadCalibrationImages() {
    if (!m_calibrator) return;

    QStringList files = QFileDialog::getOpenFileNames(
        this, tr("Select Calibration Images"), "",
        tr("Images (*.png *.jpg *.jpeg *.bmp *.tif *.tiff)"));

    if (files.isEmpty()) return;

    m_calibrationImages.clear();
    for (const auto& file : files) {
        cv::Mat img = cv::imread(file.toStdString());
        if (!img.empty()) {
            m_calibrationImages.append(img);
        }
    }

    if (!m_calibrationImages.isEmpty()) {
        QImage img(m_calibrationImages.first().data, m_calibrationImages.first().cols,
                   m_calibrationImages.first().rows, QImage::Format_RGB888);
        m_previewImage = img.rgbSwapped();
        QPixmap pixmap = QPixmap::fromImage(m_previewImage).scaled(
            m_labelPreview->size(), Qt::KeepAspectRatio, Qt::SmoothTransformation);
        m_labelPreview->setPixmap(pixmap);
        m_labelPreview->setText(QString());
    }

    int cols = static_cast<int>(m_spinBoardCols->value());
    int rows = static_cast<int>(m_spinBoardRows->value());
    double squareSize = m_spinSquareSize->value();

    m_calibrator->calibrateFromBoard(cols, rows, squareSize, m_calibrationImages);
    m_data = m_calibrator->data();
    updateStatus();
}

void CalibrationDialog::onApply() {
    if (m_calibrator) {
        m_calibrator->setData(m_data);
    }
    accept();
}

void CalibrationDialog::updateStatus() {
    if (m_data.isCalibrated) {
        m_labelStatus->setText(tr("<b>Status:</b> Calibrated | "
                                  "Pixel size: %1 %2 | "
                                  "Factor: %3")
                               .arg(m_data.pixelSize, 0, 'f', 4)
                               .arg(m_data.physicalUnit)
                               .arg(m_data.conversionFactor, 0, 'e', 4));
    } else {
        m_labelStatus->setText(tr("<b>Status:</b> Not calibrated"));
    }
}
