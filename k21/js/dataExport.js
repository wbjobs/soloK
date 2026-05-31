class DataExport {
    constructor(dataSimulator, thermalAnalysis) {
        this.dataSimulator = dataSimulator;
        this.thermalAnalysis = thermalAnalysis;
    }

    exportToExcel(startTime, endTime) {
        const historyData = this.dataSimulator.getHistoryData(startTime, endTime);
        
        if (historyData.length === 0) {
            alert('没有可导出的数据');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        
        CONFIG.cables.forEach(cable => {
            const sheetData = this.createExcelSheetData(historyData, cable.id);
            const ws = XLSX.utils.aoa_to_sheet(sheetData);
            
            ws['!cols'] = this.createColumnWidths(historyData.length);
            
            this.applyColorScale(ws, sheetData);
            
            XLSX.utils.book_append_sheet(wb, ws, cable.name.substring(0, 30));
        });
        
        const summaryData = this.createSummarySheet(historyData);
        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, '数据汇总');
        
        const fileName = `温度分布数据_${new Date(startTime).toISOString().split('T')[0]}_${new Date(endTime).toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    createExcelSheetData(historyData, cableId) {
        const data = [];
        
        const headers = ['时间'];
        const step = 100;
        for (let i = 0; i < CONFIG.dts.totalPoints; i += step) {
            headers.push(`${(i / 1000).toFixed(1)}km`);
        }
        data.push(headers);
        
        const sampleRate = Math.max(1, Math.floor(historyData.length / 100));
        
        historyData.forEach((scan, index) => {
            if (index % sampleRate !== 0) return;
            
            if (!scan.cables[cableId]) return;
            
            const row = [new Date(scan.timestamp).toLocaleString('zh-CN')];
            const temps = scan.cables[cableId].temperatures;
            
            for (let i = 0; i < CONFIG.dts.totalPoints; i += step) {
                row.push(temps[i] ? temps[i].toFixed(2) : '');
            }
            
            data.push(row);
        });
        
        return data;
    }

    createColumnWidths(dataLength) {
        const cols = [{ wch: 20 }];
        const step = 100;
        const numPoints = Math.ceil(CONFIG.dts.totalPoints / step);
        
        for (let i = 0; i < numPoints; i++) {
            cols.push({ wch: 8 });
        }
        
        return cols;
    }

    applyColorScale(ws, data) {
        if (data.length < 2) return;
        
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        for (let r = 1; r <= range.e.r; r++) {
            for (let c = 1; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                const cell = ws[cellAddress];
                
                if (cell && cell.t === 'n') {
                    const temp = cell.v;
                    const color = getTemperatureColor(temp);
                    
                    if (!ws['!cols']) ws['!cols'] = [];
                    cell.s = {
                        fill: {
                            patternType: 'solid',
                            fgColor: { rgb: this.rgbToHex(color) }
                        }
                    };
                }
            }
        }
    }

    rgbToHex(rgb) {
        return rgb.map(c => c.toString(16).padStart(2, '0')).join('');
    }

    createSummarySheet(historyData) {
        const data = [];
        
        data.push(['海底电缆温度监测报告']);
        data.push([]);
        data.push(['报告生成时间', new Date().toLocaleString('zh-CN')]);
        data.push(['数据时间段', 
            `${new Date(historyData[0].timestamp).toLocaleString('zh-CN')} 至 ${new Date(historyData[historyData.length - 1].timestamp).toLocaleString('zh-CN')}`]);
        data.push(['数据点数', historyData.length]);
        data.push([]);
        
        data.push(['电缆名称', '最高温度(°C)', '最低温度(°C)', '平均温度(°C)', '最大温升速率(°C/min)', '动态载流量(A)']);
        
        CONFIG.cables.forEach(cable => {
            const cableData = historyData
                .filter(h => h.cables[cable.id])
                .map(h => h.cables[cable.id]);
            
            if (cableData.length === 0) return;
            
            let maxTemp = -Infinity;
            let minTemp = Infinity;
            let sumTemp = 0;
            let count = 0;
            
            cableData.forEach(d => {
                const temps = d.temperatures;
                for (let i = 0; i < temps.length; i++) {
                    maxTemp = Math.max(maxTemp, temps[i]);
                    minTemp = Math.min(minTemp, temps[i]);
                    sumTemp += temps[i];
                    count++;
                }
            });
            
            const avgTemp = sumTemp / count;
            const lastDcr = cableData[cableData.length - 1].load;
            
            data.push([
                cable.name,
                maxTemp.toFixed(2),
                minTemp.toFixed(2),
                avgTemp.toFixed(2),
                '--',
                Math.round(lastDcr)
            ]);
        });
        
        return data;
    }

    async exportToPDF(startTime, endTime, analysisResults) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape', 'mm', 'a4');
        
        doc.setFillColor(26, 26, 46);
        doc.rect(0, 0, 297, 210, 'F');
        
        doc.setTextColor(78, 205, 196);
        doc.setFontSize(20);
        doc.text('海底电缆热特性监测报告', 148, 20, { align: 'center' });
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.text(`报告生成时间: ${new Date().toLocaleString('zh-CN')}`, 10, 35);
        doc.text(`数据时间段: ${new Date(startTime).toLocaleString('zh-CN')} 至 ${new Date(endTime).toLocaleString('zh-CN')}`, 10, 45);
        
        this.drawPDFSummaryTable(doc, analysisResults, 10, 60);
        
        this.drawPDFTemperatureChart(doc, 10, 100, 277, 90);
        
        doc.setPage(2);
        
        doc.setFillColor(26, 26, 46);
        doc.rect(0, 0, 297, 210, 'F');
        
        this.drawPDFHotspotTable(doc, analysisResults, 10, 30);
        
        const fileName = `监测报告_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
    }

    drawPDFSummaryTable(doc, analysisResults, x, y) {
        doc.setTextColor(78, 205, 196);
        doc.setFontSize(14);
        doc.text('实时监测数据汇总', x, y);
        
        doc.setFontSize(10);
        const headerY = y + 10;
        const rowHeight = 8;
        const colWidths = [60, 35, 35, 35, 40, 35];
        const headers = ['电缆名称', '最高温度', '最低温度', '平均温度', '最大温升速率', '动态载流量'];
        
        headers.forEach((header, i) => {
            doc.setTextColor(78, 205, 196);
            doc.text(header, x + colWidths.slice(0, i).reduce((a, b) => a + b, 0), headerY);
        });
        
        analysisResults.forEach((result, i) => {
            const cable = CONFIG.cables[result.cableId];
            const stats = this.dataSimulator.getStatistics(result.cableId);
            if (!stats) return;
            
            const rowY = headerY + (i + 1) * rowHeight;
            const colX = x;
            
            doc.setTextColor(255, 255, 255);
            doc.text(cable.name, colX, rowY);
            doc.text(`${stats.max.toFixed(1)}°C`, colX + colWidths[0], rowY);
            doc.text(`${stats.min.toFixed(1)}°C`, colX + colWidths[0] + colWidths[1], rowY);
            doc.text(`${stats.avg.toFixed(1)}°C`, colX + colWidths[0] + colWidths[1] + colWidths[2], rowY);
            doc.text(`${result.maxRate.toFixed(2)}°C/min`, colX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3], rowY);
            doc.text(`${result.dcr}A`, colX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], rowY);
        });
    }

    drawPDFTemperatureChart(doc, x, y, width, height) {
        doc.setTextColor(78, 205, 196);
        doc.setFontSize(14);
        doc.text('温度分布示意图', x, y);
        
        const chartY = y + 10;
        const chartHeight = height - 20;
        
        doc.setDrawColor(78, 205, 196);
        doc.setLineWidth(0.5);
        doc.rect(x, chartY, width, chartHeight);
        
        const gradient = this.createTemperatureGradient(doc, x, chartY, width, chartHeight);
        
        const currentData = this.dataSimulator.getCurrentData();
        if (currentData[0]) {
            const temps = currentData[0].temperatures;
            const step = Math.ceil(temps.length / width);
            
            for (let i = 0; i < width; i++) {
                const temp = temps[i * step] || 25;
                const color = getTemperatureColor(temp);
                
                doc.setFillColor(color[0], color[1], color[2]);
                doc.rect(x + i, chartY, 1, chartHeight, 'F');
            }
        }
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.text('0 km', x, chartY + chartHeight + 10);
        doc.text('5 km', x + width / 2 - 10, chartY + chartHeight + 10);
        doc.text('10 km', x + width - 20, chartY + chartHeight + 10);
    }

    createTemperatureGradient(doc, x, y, width, height) {
        return null;
    }

    drawPDFHotspotTable(doc, analysisResults, x, y) {
        doc.setTextColor(78, 205, 196);
        doc.setFontSize(14);
        doc.text('热点区域汇总', x, y);
        
        let currentY = y + 15;
        
        analysisResults.forEach((result, cableIndex) => {
            const cable = CONFIG.cables[result.cableId];
            
            if (result.hotspots.length > 0) {
                doc.setTextColor(cable.color.replace('#', ''));
                doc.setFontSize(11);
                doc.text(`${cable.name} - 热点区域:`, x, currentY);
                currentY += 8;
                
                result.hotspots.forEach((hotspot, i) => {
                    const typeText = hotspot.type === 'critical' ? '严重' : 
                                    hotspot.type === 'rate' ? '速率' : '预警';
                    
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(9);
                    doc.text(
                        `  ${i + 1}. 位置: ${(hotspot.start / 1000).toFixed(2)}-${(hotspot.end / 1000).toFixed(2)}km | ` +
                        `最高温度: ${hotspot.maxTemp.toFixed(1)}°C | ` +
                        `类型: ${typeText}`,
                        x, currentY
                    );
                    currentY += 7;
                });
                
                currentY += 5;
            }
        });
    }
}
