class MonitoringApp {
    constructor() {
        this.dataSimulator = null;
        this.thermalAnalysis = null;
        this.thermalAging = null;
        this.partialDischarge = null;
        this.visualization3D = null;
        this.playbackSystem = null;
        this.comparisonSystem = null;
        this.alertSystem = null;
        this.dataExport = null;
        this.currentAnalysisResults = null;
        this.selectedPoint = null;
        this.selectedCable = 0;
        
        this.init();
    }

    init() {
        console.log('正在初始化海底电缆热特性实时监测系统...');
        
        this.dataSimulator = new DataSimulator();
        this.thermalAnalysis = new ThermalAnalysis(this.dataSimulator);
        this.thermalAging = new ThermalAgingModel(this.dataSimulator);
        this.partialDischarge = new PartialDischargeSystem();
        
        try {
            this.visualization3D = new Visualization3D('three-container');
            this.alertSystem = new AlertSystem(this.visualization3D);
        } catch (e) {
            console.error('3D可视化初始化失败:', e);
        }
        
        this.playbackSystem = new PlaybackSystem(this.dataSimulator, 'playback-chart', 'heatmap-canvas');
        this.comparisonSystem = new ComparisonSystem(this.dataSimulator, 'comparison-chart', 'temperature-profile-chart');
        this.dataExport = new DataExport(this.dataSimulator, this.thermalAnalysis);
        
        this.lastUIUpdate = 0;
        this.lastChartUpdate = 0;
        this.lastThermalInversion = 0;
        this.lastAgingUpdate = 0;
        this.lastPDUpdate = 0;
        this.uiUpdateInterval = 200;
        this.chartUpdateInterval = 1000;
        this.thermalInversionInterval = 5000;
        this.agingUpdateInterval = 10000;
        this.pdUpdateInterval = 500;
        
        this.bindEvents();
        this.startDataAcquisition();
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 1000);
        
        console.log('系统初始化完成');
    }

    bindEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        if (this.visualization3D) {
            this.visualization3D.onPointClick = (cableId, pointIndex) => {
                this.onPointClick(cableId, pointIndex);
            };
            
            this.visualization3D.onPointHover = (cableId, pointIndex, mouseX, mouseY) => {
                this.onPointHover(cableId, pointIndex, mouseX, mouseY);
            };
        }
        
        document.getElementById('display-mode').addEventListener('change', (e) => {
            if (this.visualization3D) {
                this.visualization3D.setDisplayMode(e.target.value);
                this.update3DVisualization();
            }
        });
        
        document.getElementById('auto-rotate').addEventListener('change', (e) => {
            if (this.visualization3D) {
                this.visualization3D.setAutoRotate(e.target.checked);
            }
        });
        
        document.getElementById('show-terrain').addEventListener('change', (e) => {
            if (this.visualization3D) {
                this.visualization3D.setShowTerrain(e.target.checked);
            }
        });
        
        document.getElementById('show-discharge').addEventListener('change', (e) => {
            if (this.visualization3D) {
                this.visualization3D.setShowDischarge(e.target.checked);
            }
        });
        
        document.getElementById('show-density-heatmap').addEventListener('change', (e) => {
            if (this.visualization3D && this.partialDischarge) {
                const densityMap = this.partialDischarge.getDensityMap();
                this.visualization3D.setShowDensityHeatmap(e.target.checked, densityMap);
            }
        });
        
        document.getElementById('btn-export-excel').addEventListener('click', () => {
            const endTime = Date.now();
            const startTime = endTime - 24 * 3600 * 1000;
            this.dataExport.exportToExcel(startTime, endTime);
        });
        
        document.getElementById('btn-export-pdf').addEventListener('click', () => {
            const endTime = Date.now();
            const startTime = endTime - 24 * 3600 * 1000;
            this.dataExport.exportToPDF(startTime, endTime, this.currentAnalysisResults || []);
        });
        
        document.getElementById('btn-settings').addEventListener('click', () => {
            this.openSettings();
        });
        
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeSettings());
        });
        
        document.getElementById('btn-save-settings').addEventListener('click', () => {
            this.saveSettings();
        });
        
        document.querySelectorAll('#cable-selector input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectedCables();
            });
        });
    }

    startDataAcquisition() {
        this.dataSimulator.start((data, timestamp) => {
            this.onDataReceived(data, timestamp);
        });
    }

    onDataReceived(data, timestamp) {
        const now = Date.now();
        
        this.currentAnalysisResults = this.thermalAnalysis.update(data);
        
        if (now - this.lastUIUpdate >= this.uiUpdateInterval) {
            this.lastUIUpdate = now;
            this.updateUI(data);
            this.update3DVisualization();
            this.updateHotspotList();
            this.updateAgingDisplay();
            this.updatePartialDischargeDisplay();
        }
        
        if (this.alertSystem) {
            this.alertSystem.checkAlerts(this.currentAnalysisResults, data);
            if (now - this.lastUIUpdate >= this.uiUpdateInterval) {
                this.updateAlertList();
            }
        }
        
        if (now - this.lastChartUpdate >= this.chartUpdateInterval) {
            this.lastChartUpdate = now;
            this.comparisonSystem.updateProfileChart();
        }
        
        if (now - this.lastThermalInversion >= this.thermalInversionInterval) {
            this.lastThermalInversion = now;
            const endTime = now;
            const startTime = endTime - 3600 * 1000;
            const pointHistory = this.dataSimulator.getPointHistory(this.selectedCable, 5000, startTime, endTime);
            const load = data[this.selectedCable]?.load || 500;
            this.thermalAnalysis.invertThermalResistivity(this.selectedCable, 5000, load, pointHistory);
        }
        
        if (now - this.lastAgingUpdate >= this.agingUpdateInterval) {
            this.lastAgingUpdate = now;
            this.thermalAging.updateAging(data);
        }
        
        if (now - this.lastPDUpdate >= this.pdUpdateInterval) {
            this.lastPDUpdate = now;
            const newDischarges = this.partialDischarge.simulateDischarge(now);
            this.updateDischargeVisualization(newDischarges);
        }
    }

    updateUI(data) {
        const cable0Stats = this.dataSimulator.getStatistics(0);
        if (cable0Stats) {
            const maxTempEl = document.getElementById('max-temp');
            const minTempEl = document.getElementById('min-temp');
            const avgTempEl = document.getElementById('avg-temp');
            
            maxTempEl.textContent = `${cable0Stats.max.toFixed(1)}°C`;
            minTempEl.textContent = `${cable0Stats.min.toFixed(1)}°C`;
            avgTempEl.textContent = `${cable0Stats.avg.toFixed(1)}°C`;
            
            if (cable0Stats.max > CONFIG.thresholds.maxTemperature) {
                maxTempEl.className = 'metric-value danger';
            } else if (cable0Stats.max > CONFIG.thresholds.maxTemperature - 10) {
                maxTempEl.className = 'metric-value warning';
            } else {
                maxTempEl.className = 'metric-value';
            }
        }
        
        if (this.currentAnalysisResults && this.currentAnalysisResults[0]) {
            const result = this.currentAnalysisResults[0];
            const maxRateEl = document.getElementById('max-rate');
            const dcrEl = document.getElementById('dcr-value');
            const resistivityEl = document.getElementById('thermal-resistivity');
            
            maxRateEl.textContent = `${result.maxRate.toFixed(2)}°C/min`;
            dcrEl.textContent = `${result.dcr}A`;
            resistivityEl.textContent = `${this.thermalAnalysis.getThermalResistivity().toFixed(2)}K·m/W`;
            
            if (result.maxRate > CONFIG.thresholds.tempIncreaseRate) {
                maxRateEl.className = 'metric-value danger';
            } else if (result.maxRate > CONFIG.thresholds.tempIncreaseRate - 1) {
                maxRateEl.className = 'metric-value warning';
            } else {
                maxRateEl.className = 'metric-value';
            }
        }
    }

    update3DVisualization() {
        if (!this.visualization3D || !this.currentAnalysisResults) return;
        
        this.visualization3D.updateTemperatureData(this.dataSimulator.getCurrentData());
        this.visualization3D.updateCableColors(this.currentAnalysisResults);
        this.visualization3D.updateHotspots(this.currentAnalysisResults);
    }

    updateHotspotList() {
        const listEl = document.getElementById('hotspot-list');
        listEl.innerHTML = '';
        
        if (!this.currentAnalysisResults) {
            listEl.innerHTML = '<p class="no-data">暂无热点</p>';
            return;
        }
        
        let hasHotspots = false;
        
        this.currentAnalysisResults.forEach(result => {
            const cable = CONFIG.cables[result.cableId];
            
            result.hotspots.forEach(hotspot => {
                hasHotspots = true;
                const item = document.createElement('div');
                item.className = 'hotspot-item';
                item.innerHTML = `
                    <div><strong>${cable.name}</strong></div>
                    <div>位置: ${(hotspot.start / 1000).toFixed(2)}-${(hotspot.end / 1000).toFixed(2)}km</div>
                    <div>最高温度: ${hotspot.maxTemp.toFixed(1)}°C</div>
                    <div>温升速率: ${hotspot.maxRate.toFixed(2)}°C/min</div>
                `;
                listEl.appendChild(item);
            });
        });
        
        if (!hasHotspots) {
            listEl.innerHTML = '<p class="no-data">暂无热点</p>';
        }
    }

    updateAlertList() {
        const listEl = document.getElementById('alert-list');
        const alerts = this.alertSystem?.getAlerts() || [];
        
        if (alerts.length === 0) {
            listEl.innerHTML = '<p class="no-data">暂无告警</p>';
            return;
        }
        
        listEl.innerHTML = '';
        
        alerts.slice(0, 10).forEach(alert => {
            const item = document.createElement('div');
            item.className = `alert-item ${alert.type === 'warning' ? 'warning' : ''}`;
            item.innerHTML = `
                <div><strong>${alert.cableName}</strong></div>
                <div>${alert.message}</div>
                <div style="color:#6b7280;font-size:11px;">${new Date(alert.timestamp).toLocaleTimeString('zh-CN')}</div>
            `;
            listEl.appendChild(item);
        });
    }

    onPointClick(cableId, pointIndex) {
        this.selectedPoint = pointIndex;
        this.selectedCable = cableId;
        
        document.querySelectorAll('#cable-selector input').forEach(cb => {
            cb.checked = parseInt(cb.dataset.cable) === cableId;
        });
        
        this.playbackSystem.setSelectedPoint(pointIndex);
        this.comparisonSystem.setSelectedPosition(pointIndex / 1000);
        this.comparisonSystem.updateSelectedCables();
    }

    onPointHover(cableId, pointIndex, mouseX, mouseY) {
        const tooltip = document.getElementById('tooltip');
        
        if (cableId === null || pointIndex === null) {
            tooltip.classList.add('hidden');
            return;
        }
        
        const cable = CONFIG.cables[cableId];
        const temp = this.dataSimulator.getTemperatureAtPoint(cableId, pointIndex);
        const positionKm = (pointIndex / 1000).toFixed(2);
        
        const titleEl = document.getElementById('tooltip-title');
        const contentEl = document.getElementById('tooltip-content');
        
        titleEl.textContent = `${cable.name} - ${positionKm}km`;
        contentEl.innerHTML = `
            <div>温度: <strong>${temp ? temp.toFixed(1) : '--'}°C</strong></div>
            <div>测点编号: ${pointIndex}</div>
            <div style="color:#6b7280;font-size:11px;margin-top:4px;">点击查看历史曲线</div>
        `;
        
        tooltip.style.left = `${mouseX + 10}px`;
        tooltip.style.top = `${mouseY + 10}px`;
        tooltip.classList.remove('hidden');
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });
        
        if (tabName === '3d' && this.visualization3D) {
            setTimeout(() => this.visualization3D.onResize(), 100);
        } else if (tabName === 'comparison') {
            this.comparisonSystem.update();
        } else if (tabName === 'playback') {
            this.playbackSystem.updatePlayback();
        }
    }

    updateSelectedCables() {
        if (this.playbackSystem) {
            this.playbackSystem.updateSelectedCables();
        }
        if (this.comparisonSystem) {
            this.comparisonSystem.updateSelectedCables();
        }
    }

    updateCurrentTime() {
        const now = new Date();
        document.getElementById('current-time').textContent = 
            `当前时间: ${now.toLocaleString('zh-CN')}`;
    }

    openSettings() {
        document.getElementById('settings-modal').classList.remove('hidden');
        
        document.getElementById('setting-temp-threshold').value = CONFIG.thresholds.maxTemperature;
        document.getElementById('setting-rate-threshold').value = CONFIG.thresholds.tempIncreaseRate;
        document.getElementById('setting-ambient-temp').value = CONFIG.thresholds.ambientTemperature;
        document.getElementById('setting-diff-threshold').value = CONFIG.thresholds.ambientTempDiff;
        document.getElementById('setting-wechat-webhook').value = CONFIG.alert.wechatWebhook;
        document.getElementById('setting-email').value = CONFIG.alert.email;
    }

    closeSettings() {
        document.getElementById('settings-modal').classList.add('hidden');
    }

    saveSettings() {
        CONFIG.thresholds.maxTemperature = parseFloat(document.getElementById('setting-temp-threshold').value);
        CONFIG.thresholds.tempIncreaseRate = parseFloat(document.getElementById('setting-rate-threshold').value);
        CONFIG.thresholds.ambientTemperature = parseFloat(document.getElementById('setting-ambient-temp').value);
        CONFIG.thresholds.ambientTempDiff = parseFloat(document.getElementById('setting-diff-threshold').value);
        CONFIG.alert.wechatWebhook = document.getElementById('setting-wechat-webhook').value;
        CONFIG.alert.email = document.getElementById('setting-email').value;
        
        if (this.alertSystem) {
            this.alertSystem.setWechatWebhook(CONFIG.alert.wechatWebhook);
            this.alertSystem.setEmail(CONFIG.alert.email);
        }
        
        this.closeSettings();
        alert('设置已保存');
    }

    updateAgingDisplay() {
        if (!this.thermalAging) return;
        
        const report = this.thermalAging.getAgingReport();
        const lsi = this.thermalAging.calculateLifeStressIndex();
        
        document.getElementById('equivalent-time').textContent = `${report.equivalentYears.toFixed(2)}年`;
        
        const remainingLifeEl = document.getElementById('remaining-life');
        remainingLifeEl.textContent = `${report.remainingLife.toFixed(1)}年`;
        
        if (report.remainingLife < 5) {
            remainingLifeEl.className = 'metric-value danger';
        } else if (report.remainingLife < 15) {
            remainingLifeEl.className = 'metric-value warning';
        } else {
            remainingLifeEl.className = 'metric-value';
        }
        
        const consumptionEl = document.getElementById('life-consumption');
        consumptionEl.textContent = `${report.lifeConsumptionRate.toFixed(1)}%`;
        
        document.getElementById('life-stress-index').textContent = lsi.lsi.toFixed(2);
        
        const lifeBar = document.getElementById('life-bar');
        const remainingPercent = Math.max(0, Math.min(100, (report.remainingLife / report.maxLifeYears) * 100));
        lifeBar.style.width = `${remainingPercent}%`;
        
        if (remainingPercent < 20) {
            lifeBar.style.background = 'linear-gradient(90deg, #f87171, #fbbf24)';
        } else if (remainingPercent < 50) {
            lifeBar.style.background = 'linear-gradient(90deg, #fbbf24, #4ade80)';
        } else {
            lifeBar.style.background = 'linear-gradient(90deg, #4ade80, #4ecdc4)';
        }
    }

    updatePartialDischargeDisplay() {
        if (!this.partialDischarge) return;
        
        const stats = this.partialDischarge.getDischargeStatistics();
        
        document.getElementById('pd-count').textContent = stats.totalEvents;
        document.getElementById('pd-max-pc').textContent = `${stats.maxCharge.toFixed(0)}pC`;
        document.getElementById('pd-avg-pc').textContent = `${stats.avgCharge.toFixed(0)}pC`;
        
        const statusEl = document.getElementById('pd-status');
        statusEl.textContent = stats.alertLevel.level;
        
        switch (stats.alertLevel.severity) {
            case 3:
                statusEl.className = 'metric-value danger';
                break;
            case 2:
                statusEl.className = 'metric-value warning';
                break;
            case 1:
                statusEl.className = 'metric-value warning';
                break;
            default:
                statusEl.className = 'metric-value';
        }
    }

    updateDischargeVisualization(dischargeEvents) {
        if (!this.visualization3D || !dischargeEvents || dischargeEvents.length === 0) return;
        
        dischargeEvents.forEach(event => {
            this.visualization3D.addDischargeEvent(event, 0);
        });
        
        if (this.visualization3D.showDensityHeatmap) {
            const densityMap = this.partialDischarge.getDensityMap();
            this.visualization3D.updateDensityHeatmap(densityMap);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.app = new MonitoringApp();
});
