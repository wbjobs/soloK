class ComparisonSystem {
    constructor(dataSimulator, comparisonChartId, profileChartId) {
        this.dataSimulator = dataSimulator;
        this.comparisonChart = null;
        this.profileChart = null;
        this.selectedCables = [0];
        this.selectedPosition = 5000;
        this.timeRange = 86400;
        
        this.lastProfileData = {};
        this.lastProfileUpdate = 0;
        this.profileUpdateInterval = 1000;
        this.tempChangeThreshold = 0.5;
        
        this.initComparisonChart(comparisonChartId);
        this.initProfileChart(profileChartId);
        this.bindEvents();
    }

    initComparisonChart(chartId) {
        const ctx = document.getElementById(chartId).getContext('2d');
        this.comparisonChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e0e0',
                            font: { size: 12 }
                        }
                    },
                    title: {
                        display: true,
                        text: '多电缆温度对比 - 指定位置历史曲线',
                        color: '#4ecdc4',
                        font: { size: 14 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#4ecdc4',
                        bodyColor: '#fff',
                        borderColor: 'rgba(78, 205, 196, 0.5)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af', maxTicksLimit: 12 },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    y: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        title: {
                            display: true,
                            text: '温度 (°C)',
                            color: '#9ca3af'
                        }
                    }
                }
            }
        });
    }

    initProfileChart(chartId) {
        const ctx = document.getElementById(chartId).getContext('2d');
        this.profileChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    mode: 'nearest',
                    intersect: false
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#e0e0e0',
                            font: { size: 12 }
                        }
                    },
                    title: {
                        display: true,
                        text: '温度分布曲线 - 沿电缆长度',
                        color: '#4ecdc4',
                        font: { size: 14 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#4ecdc4',
                        bodyColor: '#fff',
                        borderColor: 'rgba(78, 205, 196, 0.5)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#9ca3af', maxTicksLimit: 10 },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        title: {
                            display: true,
                            text: '位置 (km)',
                            color: '#9ca3af'
                        }
                    },
                    y: {
                        ticks: { color: '#9ca3af' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        title: {
                            display: true,
                            text: '温度 (°C)',
                            color: '#9ca3af'
                        }
                    }
                }
            }
        });
    }

    bindEvents() {
        document.getElementById('comparison-position').addEventListener('input', (e) => {
            this.selectedPosition = Math.floor(parseFloat(e.target.value) * 1000);
            document.getElementById('position-value').textContent = `${e.target.value} km`;
            this.updateComparisonChart();
        });
        
        document.getElementById('comparison-time-range').addEventListener('change', (e) => {
            this.timeRange = parseInt(e.target.value);
            this.updateComparisonChart();
        });
        
        document.querySelectorAll('#cable-selector input').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateSelectedCables();
            });
        });
    }

    updateSelectedCables() {
        this.selectedCables = [];
        document.querySelectorAll('#cable-selector input:checked').forEach(checkbox => {
            this.selectedCables.push(parseInt(checkbox.dataset.cable));
        });
        this.updateComparisonChart();
        this.updateProfileChart();
    }

    update() {
        this.updateComparisonChart();
        this.updateProfileChart();
    }

    updateComparisonChart() {
        const endTime = Date.now();
        const startTime = endTime - this.timeRange * 1000;
        
        const historyData = this.dataSimulator.getHistoryData(startTime, endTime);
        
        if (historyData.length === 0) return;
        
        const sampleRate = Math.max(1, Math.floor(historyData.length / 200));
        const sampledData = historyData.filter((_, i) => i % sampleRate === 0);
        
        const labels = sampledData.map(d => {
            const time = new Date(d.timestamp);
            return time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        });
        
        const datasets = this.selectedCables.map(cableId => {
            const cable = CONFIG.cables[cableId];
            const data = sampledData.map(d => {
                if (d.cables[cableId]) {
                    return d.cables[cableId].temperatures[this.selectedPosition] || 0;
                }
                return 0;
            });
            
            return {
                label: cable.name,
                data: data,
                borderColor: cable.color,
                backgroundColor: cable.color + '20',
                borderWidth: 2,
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4
            };
        });
        
        this.comparisonChart.data.labels = labels;
        this.comparisonChart.data.datasets = datasets;
        this.comparisonChart.update('none');
    }

    updateProfileChart() {
        const now = Date.now();
        if (now - this.lastProfileUpdate < this.profileUpdateInterval) return;
        
        const currentData = this.dataSimulator.getCurrentData();
        if (currentData.length === 0) return;
        
        const step = 100;
        let needsUpdate = false;
        
        for (const cableId of this.selectedCables) {
            if (!currentData[cableId]) continue;
            
            const lastData = this.lastProfileData[cableId];
            const temps = currentData[cableId].temperatures;
            
            if (!lastData) {
                needsUpdate = true;
                break;
            }
            
            let maxDiff = 0;
            for (let i = 0; i < CONFIG.dts.totalPoints; i += step * 10) {
                const diff = Math.abs(temps[i] - lastData[i]);
                maxDiff = Math.max(maxDiff, diff);
                if (maxDiff > this.tempChangeThreshold) {
                    needsUpdate = true;
                    break;
                }
            }
            
            if (needsUpdate) break;
        }
        
        if (!needsUpdate && Object.keys(this.lastProfileData).length === this.selectedCables.length) {
            return;
        }
        
        this.lastProfileUpdate = now;
        
        const labels = [];
        for (let i = 0; i < CONFIG.dts.totalPoints; i += step) {
            labels.push((i / 1000).toFixed(1));
        }
        
        const datasets = this.selectedCables.map(cableId => {
            const cable = CONFIG.cables[cableId];
            if (!currentData[cableId]) return null;
            
            const temps = currentData[cableId].temperatures;
            this.lastProfileData[cableId] = temps;
            
            const data = [];
            for (let i = 0; i < CONFIG.dts.totalPoints; i += step) {
                data.push(temps[i] || 0);
            }
            
            return {
                label: cable.name,
                data: data,
                borderColor: cable.color,
                backgroundColor: cable.color + '10',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                pointHoverRadius: 3
            };
        }).filter(d => d !== null);
        
        this.profileChart.data.labels = labels;
        this.profileChart.data.datasets = datasets;
        this.profileChart.update('none');
    }

    setSelectedPosition(positionKm) {
        this.selectedPosition = Math.floor(positionKm * 1000);
        document.getElementById('comparison-position').value = positionKm;
        document.getElementById('position-value').textContent = `${positionKm.toFixed(1)} km`;
        this.updateComparisonChart();
    }

    destroy() {
        if (this.comparisonChart) {
            this.comparisonChart.destroy();
        }
        if (this.profileChart) {
            this.profileChart.destroy();
        }
    }
}
