#include "gui/ROISelector.h"
#include <QListWidget>
#include <QPushButton>
#include <QDoubleSpinBox>
#include <QLabel>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QGroupBox>
#include <QFormLayout>
#include <QInputDialog>
#include <QMessageBox>

ROISelector::ROISelector(QWidget* parent)
    : QWidget(parent)
    , m_roiCounter(0)
{
    setupUI();
}

void ROISelector::setupUI() {
    auto* mainLayout = new QVBoxLayout(this);

    m_listWidget = new QListWidget(this);
    m_listWidget->setSelectionMode(QAbstractItemView::SingleSelection);
    mainLayout->addWidget(m_listWidget, 1);

    auto* btnLayout = new QHBoxLayout();
    m_btnAdd = new QPushButton(tr("Add"), this);
    m_btnRemove = new QPushButton(tr("Remove"), this);
    m_btnClear = new QPushButton(tr("Clear"), this);
    btnLayout->addWidget(m_btnAdd);
    btnLayout->addWidget(m_btnRemove);
    btnLayout->addWidget(m_btnClear);
    mainLayout->addLayout(btnLayout);

    auto* coordGroup = new QGroupBox(tr("Coordinates"), this);
    auto* formLayout = new QFormLayout(coordGroup);
    m_spinX = new QDoubleSpinBox(coordGroup);
    m_spinY = new QDoubleSpinBox(coordGroup);
    m_spinWidth = new QDoubleSpinBox(coordGroup);
    m_spinHeight = new QDoubleSpinBox(coordGroup);
    m_spinX->setRange(0, 100000);
    m_spinY->setRange(0, 100000);
    m_spinWidth->setRange(0, 100000);
    m_spinHeight->setRange(0, 100000);
    formLayout->addRow(tr("X:"), m_spinX);
    formLayout->addRow(tr("Y:"), m_spinY);
    formLayout->addRow(tr("Width:"), m_spinWidth);
    formLayout->addRow(tr("Height:"), m_spinHeight);
    mainLayout->addWidget(coordGroup);

    m_labelInfo = new QLabel(this);
    mainLayout->addWidget(m_labelInfo);

    connect(m_btnAdd, &QPushButton::clicked, this, &ROISelector::onAddFromViewer);
    connect(m_btnRemove, &QPushButton::clicked, this, &ROISelector::onRemove);
    connect(m_btnClear, &QPushButton::clicked, this, &ROISelector::onClear);
    connect(m_listWidget, &QListWidget::currentRowChanged, this, &ROISelector::onItemChanged);

    updateUI();
}

QList<ROISelector::ROIItem> ROISelector::rois() const { return m_rois; }

ROISelector::ROIItem ROISelector::currentROI() const {
    int row = m_listWidget->currentRow();
    if (row >= 0 && row < m_rois.size()) return m_rois[row];
    return ROIItem();
}

void ROISelector::addROI(const QRect& rect, const QString& name) {
    ROIItem item;
    item.rect = rect;
    item.name = name.isEmpty() ? QString("ROI_%1").arg(++m_roiCounter) : name;
    m_rois.append(item);
    m_listWidget->addItem(QString("%1 (%2, %3, %4x%5)")
        .arg(item.name)
        .arg(rect.x()).arg(rect.y())
        .arg(rect.width()).arg(rect.height()));
    m_listWidget->setCurrentRow(m_rois.size() - 1);
    emit roiAdded(rect, item.name);
}

void ROISelector::removeCurrentROI() {
    int row = m_listWidget->currentRow();
    if (row < 0 || row >= m_rois.size()) return;
    m_rois.removeAt(row);
    delete m_listWidget->takeItem(row);
    emit roiRemoved(row);
}

void ROISelector::clearROIs() {
    m_rois.clear();
    m_listWidget->clear();
    m_roiCounter = 0;
    updateUI();
    emit roisCleared();
}

void ROISelector::onAddFromViewer() {
    bool ok;
    QString name = QInputDialog::getText(this, tr("Add ROI"), tr("ROI Name:"),
                                         QLineEdit::Normal, QString("ROI_%1").arg(m_roiCounter + 1), &ok);
    if (ok && !name.isEmpty()) {
        Q_UNUSED(name);
        emit roiAdded(QRect(), name);
    }
}

void ROISelector::onRemove() {
    removeCurrentROI();
    updateUI();
}

void ROISelector::onClear() {
    if (m_rois.isEmpty()) return;
    if (QMessageBox::question(this, tr("Clear ROIs"), tr("Clear all ROIs?")) == QMessageBox::Yes) {
        clearROIs();
    }
}

void ROISelector::onItemChanged() {
    int row = m_listWidget->currentRow();
    if (row >= 0 && row < m_rois.size()) {
        const auto& roi = m_rois[row];
        m_spinX->setValue(roi.rect.x());
        m_spinY->setValue(roi.rect.y());
        m_spinWidth->setValue(roi.rect.width());
        m_spinHeight->setValue(roi.rect.height());
        emit roiSelected(row);
    }
    updateUI();
}

void ROISelector::updateUI() {
    bool hasSelection = m_listWidget->currentRow() >= 0 && !m_rois.isEmpty();
    m_btnRemove->setEnabled(hasSelection);
    m_btnClear->setEnabled(!m_rois.isEmpty());
    m_labelInfo->setText(tr("ROI Count: %1").arg(m_rois.size()));
}
