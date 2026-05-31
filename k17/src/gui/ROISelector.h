#ifndef ROISELECTOR_H
#define ROISELECTOR_H

#include <QWidget>
#include <QList>
#include <QRect>
#include <QString>

class QListWidget;
class QPushButton;
class QDoubleSpinBox;
class QLabel;
class QGroupBox;

class ROISelector : public QWidget {
    Q_OBJECT

public:
    struct ROIItem {
        QRect rect;
        QString name;
    };

    explicit ROISelector(QWidget* parent = nullptr);

    QList<ROIItem> rois() const;
    ROIItem currentROI() const;

signals:
    void roiAdded(const QRect& rect, const QString& name);
    void roiRemoved(int index);
    void roiSelected(int index);
    void roisCleared();

public slots:
    void addROI(const QRect& rect, const QString& name = QString());
    void removeCurrentROI();
    void clearROIs();

private slots:
    void onAddFromViewer();
    void onRemove();
    void onClear();
    void onItemChanged();

private:
    void updateUI();
    void setupUI();

    QListWidget* m_listWidget;
    QPushButton* m_btnAdd;
    QPushButton* m_btnRemove;
    QPushButton* m_btnClear;
    QDoubleSpinBox* m_spinX;
    QDoubleSpinBox* m_spinY;
    QDoubleSpinBox* m_spinWidth;
    QDoubleSpinBox* m_spinHeight;
    QLabel* m_labelInfo;
    QList<ROIItem> m_rois;
    int m_roiCounter;
};

#endif
