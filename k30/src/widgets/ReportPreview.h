#ifndef REPORTPREVIEW_H
#define REPORTPREVIEW_H

#include "../data/AnomalyRegion.h"
#include "../processing/WaterStructureLocalizer.h"
#include <QWidget>
#include <QTextEdit>
#include <QVector>

class ReportPreview : public QWidget
{
    Q_OBJECT
public:
    explicit ReportPreview(QWidget* parent = nullptr);

    void updateReport(const std::vector<AnomalyRegion>& anomalies,
                      const std::vector<DrillingSuggestion>& suggestions);
    void clear();

private:
    QTextEdit* m_textEdit;
};

#endif
