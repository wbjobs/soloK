#include "gui/ExportDialog.h"
#include "io/DataExporter.h"

#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QFormLayout>
#include <QGroupBox>
#include <QPushButton>
#include <QComboBox>
#include <QCheckBox>
#include <QLineEdit>
#include <QLabel>
#include <QSpinBox>
#include <QDoubleSpinBox>
#include <QFileDialog>
#include <QMessageBox>
#include <QDialogButtonBox>

ExportDialog::ExportDialog(const ExportConfig& config, QWidget* parent)
    : QDialog(parent)
    , m_config(config)
{
    setWindowTitle(tr("Export Data"));
    resize(450, 500);
    setupUI();
}

void ExportDialog::setupUI() {
    auto* mainLayout = new QVBoxLayout(this);

    auto* formatGroup = new QGroupBox(tr("Format"));
    auto* formatLayout = new QVBoxLayout(formatGroup);
    m_comboFormat = new QComboBox(formatGroup);
    m_comboFormat->addItem(tr("VTK (ParaView)"), "vtk");
    m_comboFormat->addItem(tr("CSV (Spreadsheet)"), "csv");
    m_comboFormat->addItem(tr("PDF Report"), "pdf");
    m_comboFormat->addItem(tr("PNG Image"), "png");
    formatLayout->addWidget(m_comboFormat);
    mainLayout->addWidget(formatGroup);

    auto* fileGroup = new QGroupBox(tr("File"));
    auto* fileLayout = new QHBoxLayout(fileGroup);
    m_editFilePath = new QLineEdit(fileGroup);
    auto* btnBrowse = new QPushButton(tr("Browse..."), fileGroup);
    fileLayout->addWidget(m_editFilePath, 1);
    fileLayout->addWidget(btnBrowse);
    mainLayout->addWidget(fileGroup);

    auto* optionsGroup = new QGroupBox(tr("Options"));
    auto* optionsLayout = new QVBoxLayout(optionsGroup);

    m_chkCoordinates = new QCheckBox(tr("Include coordinates"), optionsGroup);
    m_chkCoordinates->setChecked(true);
    optionsLayout->addWidget(m_chkCoordinates);

    m_chkDisplacement = new QCheckBox(tr("Include displacement"), optionsGroup);
    m_chkDisplacement->setChecked(true);
    optionsLayout->addWidget(m_chkDisplacement);

    m_chkStrain = new QCheckBox(tr("Include strain components"), optionsGroup);
    m_chkStrain->setChecked(true);
    optionsLayout->addWidget(m_chkStrain);

    m_chkPrincipal = new QCheckBox(tr("Include principal strains"), optionsGroup);
    m_chkPrincipal->setChecked(true);
    optionsLayout->addWidget(m_chkPrincipal);

    m_chkVonMises = new QCheckBox(tr("Include von Mises"), optionsGroup);
    m_chkVonMises->setChecked(true);
    optionsLayout->addWidget(m_chkVonMises);

    auto* dpiLayout = new QHBoxLayout();
    dpiLayout->addWidget(new QLabel(tr("DPI:")));
    m_spinDpi = new QSpinBox(optionsGroup);
    m_spinDpi->setRange(72, 1200);
    m_spinDpi->setValue(300);
    dpiLayout->addWidget(m_spinDpi);
    dpiLayout->addStretch();
    optionsLayout->addLayout(dpiLayout);

    mainLayout->addWidget(optionsGroup);

    m_labelPreview = new QLabel(this);
    m_labelPreview->setWordWrap(true);
    mainLayout->addWidget(m_labelPreview);

    auto* btnBox = new QDialogButtonBox(QDialogButtonBox::Ok | QDialogButtonBox::Cancel, this);
    mainLayout->addWidget(btnBox);

    connect(btnBrowse, &QPushButton::clicked, this, &ExportDialog::onBrowse);
    connect(m_comboFormat, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &ExportDialog::onFormatChanged);
    connect(btnBox, &QDialogButtonBox::accepted, this, [this]() {
        if (m_editFilePath->text().isEmpty()) {
            QMessageBox::warning(this, tr("Warning"), tr("Please select output file"));
            return;
        }
        accept();
    });
    connect(btnBox, &QDialogButtonBox::rejected, this, &QDialog::reject);

    onFormatChanged(0);
}

QString ExportDialog::selectedFormat() const {
    return m_comboFormat->currentData().toString();
}

QString ExportDialog::filePath() const { return m_editFilePath->text(); }
bool ExportDialog::includeCoordinates() const { return m_chkCoordinates->isChecked(); }
bool ExportDialog::includeDisplacement() const { return m_chkDisplacement->isChecked(); }
bool ExportDialog::includeStrain() const { return m_chkStrain->isChecked(); }
bool ExportDialog::includePrincipal() const { return m_chkPrincipal->isChecked(); }
bool ExportDialog::includeVonMises() const { return m_chkVonMises->isChecked(); }
int ExportDialog::dpi() const { return m_spinDpi->value(); }

void ExportDialog::onBrowse() {
    QString format = selectedFormat();
    QString filter;
    if (format == "vtk") filter = tr("VTK Files (*.vtk)");
    else if (format == "csv") filter = tr("CSV Files (*.csv)");
    else if (format == "pdf") filter = tr("PDF Files (*.pdf)");
    else filter = tr("Images (*.png *.jpg *.bmp *.tif)");

    QString path = QFileDialog::getSaveFileName(this, tr("Export File"), "", filter);
    if (!path.isEmpty()) m_editFilePath->setText(path);
}

void ExportDialog::onFormatChanged(int index) {
    QString format = m_comboFormat->itemData(index).toString();

    bool csvMode = (format == "csv");
    m_chkCoordinates->setEnabled(csvMode);
    m_chkDisplacement->setEnabled(csvMode);
    m_chkStrain->setEnabled(csvMode);
    m_chkPrincipal->setEnabled(csvMode);
    m_chkVonMises->setEnabled(csvMode);

    bool imageMode = (format == "png" || format == "pdf");
    m_spinDpi->setEnabled(imageMode);

    QString desc;
    if (format == "vtk") desc = tr("VTK legacy format for ParaView post-processing.");
    else if (format == "csv") desc = tr("CSV spreadsheet for data analysis.");
    else if (format == "pdf") desc = tr("PDF report with images and statistics.");
    else desc = tr("High-resolution image export.");
    m_labelPreview->setText(desc);
}
