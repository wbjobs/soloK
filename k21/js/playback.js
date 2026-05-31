class PlaybackSystem {
    constructor(dataSimulator, chartCanvasId, heatmapCanvasId) {
        this.dataSimulator = dataSimulator;
        this.chartCanvas = document.getElementById(chartCanvasId);
        this.heatmapCanvas = document.getElementById(heatmapCanvasId);
        this.chart = null;
        this.isPlaying = false;
        this.playbackSpeed = 1;
        this.currentIndex = 0;
        this.selectedCables = [0];
        this.selectedPoint = 5000;
        this.animationFrame = null;
        this.lastUpdateTime = 0;
        
        this.initChart();
        this.initHeatmap();
        this.bindEvents();
    }

    initChart() {
        const ctx = this.chartCanvas.getContext('2d');
        this.chart = new Chart(ctx, {
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
                        text: '温度历史曲线',
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
                        ticks: { color: '#9ca3af' },
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

    initHeatmap() {
        const ctx = this.heatmapCanvas.getContext('2d');
        const rect = this.heatmapCanvas.parentElement.getBoundingClientRect();
        this.heatmapCanvas.width = rect.width - 20;
        this.heatmapCanvas.height = rect.height - 20;
    }

    bindEvents() {
        document.getElementById('btn-play').addEventListener('click', () => this.togglePlay());
        document.getElementById('btn-reset').addEventListener('click', () => this.reset());
        document.getElementById('btn-prev').addEventListener('click', () => this.stepBackward());
        document.getElementById('btn-next').addEventListener('click', () => this.stepForward());
        
        document.getElementById('playback-speed').addEventListener('change', (e) => {
            this.playbackSpeed = parseFloat(e.target.value);
        });
        
        document.getElementById('playback-slider').addEventListener('input', (e) => {
            const historyData = this.dataSimulator.historyData;
            this.currentIndex = Math.floor((e.target.value / 100) * (historyData.length - 1));
            this.updatePlayback();
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
        this.updatePlayback();
    }

    togglePlay() {
        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('btn-play');
        btn.textContent = this.isPlaying ? '⏸ 暂停' : '▶ 播放';
        
        if (this.isPlaying) {
            this.play();
        } else {
            this.stop();
        }
    }

    play() {
        const animate = (timestamp) => {
            if (!this.isPlaying) return;
            
            const elapsed = timestamp - this.lastUpdateTime;
            const interval = CONFIG.dts.scanInterval / this.playbackSpeed;
            
            if (elapsed >= interval) {
                this.lastUpdateTime = timestamp;
                this.currentIndex++;
                
                const historyData = this.dataSimulator.historyData;
                if (this.currentIndex >= historyData.length) {
                    this.currentIndex = 0;
                }
                
                this.updatePlayback();
            }
            
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        this.lastUpdateTime = performance.now();
        this.animationFrame = requestAnimationFrame(animate);
    }

    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    reset() {
        this.isPlaying = false;
        this.stop();
        this.currentIndex = 0;
        document.getElementById('btn-play').textContent = '▶ 播放';
        this.updatePlayback();
    }

    stepForward() {
        const historyData = this.dataSimulator.historyData;
        this.currentIndex = Math.min(this.currentIndex + 1, historyData.length - 1);
        this.updatePlayback();
    }

    stepBackward() {
        this.currentIndex = Math.max(this.currentIndex - 1, 0);
        this.updatePlayback();
    }

    updatePlayback() {
        const historyData = this.dataSimulator.historyData;
        if (historyData.length === 0) return;
        
        const progress = (this.currentIndex / (historyData.length - 1)) * 100;
        document.getElementById('playback-slider').value = progress;
        document.getElementById('timeline-progress').style.width = `${progress}%`;
        
        const currentData = historyData[this.currentIndex];
        const time = new Date(currentData.timestamp);
        document.getElementById('playback-current-time').textContent = 
            time.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        this.updateChart(currentData);
        this.updateHeatmap(currentData);
    }

    updateChart(currentData) {
        const historyData = this.dataSimulator.historyData;
        const windowSize = 100;
        const startIndex = Math.max(0, this.currentIndex - windowSize);
        const endIndex = this.currentIndex + 1;
        
        const windowData = historyData.slice(startIndex, endIndex);
        
        const labels = windowData.map(d => {
            const time = new Date(d.timestamp);
            return time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        });
        
        const datasets = this.selectedCables.map(cableId => {
            const cable = CONFIG.cables[cableId];
            const data = windowData.map(d => {
                if (d.cables[cableId]) {
                    return d.cables[cableId].temperatures[this.selectedPoint] || 0;
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
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 4
            };
        });
        
        this.chart.data.labels = labels;
        this.chart.data.datasets = datasets;
        this.chart.update('none');
    }

    updateHeatmap(currentData) {
        const canvas = this.heatmapCanvas;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        if (this.selectedCables.length === 0) return;
        
        const cableHeight = height / this.selectedCables.length;
        const sampleRate = Math.floor(CONFIG.dts.totalPoints / width);
        
        this.selectedCables.forEach((cableId, cableIndex) => {
            if (!currentData.cables[cableId]) return;
            
            const temperatures = currentData.cables[cableId].temperatures;
            const y = cableIndex * cableHeight;
            
            for (let x = 0; x < width; x++) {
                const dataIndex = Math.floor(x * sampleRate);
                const temp = temperatures[dataIndex] || 25;
                const color = getTemperatureColor(temp);
                
                ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                ctx.fillRect(x, y, 1, cableHeight - 2);
            }
            
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText(CONFIG.cables[cableId].name, 5, y + 12);
        });
        
        ctx.fillStyle = '#9ca3af';
        ctx.font = '10px Arial';
        ctx.fillText('0 km', 5, height - 5);
        ctx.fillText('5 km', width / 2 - 15, height - 5);
        ctx.fillText('10 km', width - 35, height - 5);
    }

    setSelectedPoint(pointIndex) {
        this.selectedPoint = pointIndex;
        this.updatePlayback();
    }

    destroy() {
        this.stop();
        if (this.chart) {
            this.chart.destroy();
        }
    }
}
