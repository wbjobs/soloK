#include "ReportPreview.h"
#include <QVBoxLayout>
#include <QDateTime>
#include <QColor>

ReportPreview::ReportPreview(QWidget* parent)
    : QWidget(parent)
{
    QVBoxLayout* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);

    m_textEdit = new QTextEdit(this);
    m_textEdit->setReadOnly(true);
    m_textEdit->setFont(QFont("SimHei", 10));
    layout->addWidget(m_textEdit);

    clear();
}

void ReportPreview::updateReport(const std::vector<AnomalyRegion>& anomalies,
                                 const std::vector<DrillingSuggestion>& suggestions)
{
    QString html;

    html += "<h2 style='color: #2c3e50;'>隧道红外探水超前预报报告</h2>";
    html += QString("<p style='color: #7f8c8d;'>报告生成时间: %1</p>")
        .arg(QDateTime::currentDateTime().toString("yyyy-MM-dd hh:mm:ss"));

    html += "<h3 style='color: #3498db;'>一、异常区统计</h3>";
    html += "<table border='1' cellpadding='5' cellspacing='0' style='border-collapse: collapse;'>";
    html += "<tr style='background-color: #3498db; color: white;'>"
            "<th>编号</th><th>位置(X,Y,Z)</th><th>温差(°C)</th>"
            "<th>平均温度(°C)</th><th>含水性</th></tr>";

    for (size_t i = 0; i < anomalies.size(); ++i) {
        const auto& a = anomalies[i];
        ThreeDPosition pos = a.threeDPosition();

        QString color;
        switch (a.waterProbability()) {
        case WaterProbability::High: color = "#e74c3c"; break;
        case WaterProbability::Medium: color = "#e67e22"; break;
        case WaterProbability::Low: color = "#f1c40f"; break;
        default: color = "#2ecc71"; break;
        }

        html += QString("<tr>"
                        "<td align='center'>%1</td>"
                        "<td>(%2, %3, %4)</td>"
                        "<td align='right'>%5</td>"
                        "<td align='right'>%6</td>"
                        "<td align='center' style='background-color: %7; color: white;'>%8</td>"
                        "</tr>")
            .arg(i + 1)
            .arg(pos.x, 0, 'f', 2)
            .arg(pos.y, 0, 'f', 2)
            .arg(pos.z, 0, 'f', 2)
            .arg(a.temperatureDifference(), 0, 'f', 2)
            .arg(a.averageTemperature(), 0, 'f', 2)
            .arg(color)
            .arg(a.probabilityString());
    }
    html += "</table>";

    html += "<h3 style='color: #3498db;'>二、超前钻探建议</h3>";
    if (!suggestions.empty()) {
        html += "<ol>";
        for (const auto& s : suggestions) {
            html += QString("<li>位置: (%1m, %2m, %3m) - 优先级: %4 - %5</li>")
                .arg(s.position.x, 0, 'f', 2)
                .arg(s.position.y, 0, 'f', 2)
                .arg(s.position.z, 0, 'f', 2)
                .arg(s.priority, 0, 'f', 2)
                .arg(s.description);
        }
        html += "</ol>";
    } else {
        html += "<p style='color: #7f8c8d;'>当前无钻探建议</p>";
    }

    html += "<h3 style='color: #3498db;'>三、综合结论</h3>";

    WaterProbability maxProb = WaterProbability::None;
    int highCount = 0, mediumCount = 0, lowCount = 0;
    for (const auto& a : anomalies) {
        if (a.waterProbability() > maxProb) maxProb = a.waterProbability();
        switch (a.waterProbability()) {
        case WaterProbability::High: highCount++; break;
        case WaterProbability::Medium: mediumCount++; break;
        case WaterProbability::Low: lowCount++; break;
        default: break;
        }
    }

    QString conclusion, suggestion, conclusionColor;
    switch (maxProb) {
    case WaterProbability::High:
        conclusion = "掌子面前方存在较高含水可能性";
        suggestion = "建议立即进行超前钻探验证,并做好防水预案。";
        conclusionColor = "#e74c3c";
        break;
    case WaterProbability::Medium:
        conclusion = "掌子面前方存在中等含水可能性";
        suggestion = "建议考虑进行超前钻探,加强施工监测。";
        conclusionColor = "#e67e22";
        break;
    case WaterProbability::Low:
        conclusion = "掌子面前方存在较低含水可能性";
        suggestion = "建议保持关注,继续常规监测。";
        conclusionColor = "#f1c40f";
        break;
    case WaterProbability::None:
    default:
        conclusion = "未检测到明显含水异常";
        suggestion = "可正常施工,保持常规监测。";
        conclusionColor = "#2ecc71";
        break;
    }

    html += QString("<p style='font-size: 14px; font-weight: bold; color: %1;'>%2</p>")
        .arg(conclusionColor).arg(conclusion);
    html += QString("<p>%1</p>").arg(suggestion);
    html += QString("<p>检测到异常区共%1处: 高风险%2处, 中风险%3处, 低风险%4处</p>")
        .arg(anomalies.size()).arg(highCount).arg(mediumCount).arg(lowCount);

    m_textEdit->setHtml(html);
}

void ReportPreview::clear()
{
    m_textEdit->setHtml("<p style='color: #7f8c8d;'>请导入数据并进行分析以生成预报报告</p>");
}
