import { api, createSocket, colormap } from './api.js?v=2';
import { SceneManager } from './scene.js?v=2';
import { ChartManager } from './charts.js?v=2';

class Application {
    constructor() {
        this.scene = null;
        this.socket = null;
        this.charts = new ChartManager();
        this.currentData = null;
        this.timeSeriesData = null;
        this.currentTimeIndex = 0;
        this.isPlaying = false;
        this.playInterval = null;
        this._lastVisualizationTime = 0;
        this._visualizationThrottleMs = 100;
        this.injectionWells = [];
        this.pendingInjectionPosition = null;
        this.remediationResult = null;
        this.comparisonMode = false;
        this.comparisonData = null;
        this.enkfResult = null;
        this.settings = {
            threshold: 5,
            contaminant: 'TCE',
            showIsosurface: true,
            showWells: true,
            showCutPlane: false,
            showHighRisk: true,
            cutPlaneAxis: 'x',
            cutPlanePosition: 50,
            speed: 3600
        };
        
        this.init();
    }

    async init() {
        this.initScene();
        this.initControls();
        this.initSocket();
        this.drawColorbar();
        
        try {
            await this.loadInitialData();
        } catch (e) {
            console.error('Error loading initial data:', e);
            this.showConnectionError();
        }
        
        this.setupEventListeners();
    }

    initScene() {
        const container = document.getElementById('canvas-container');
        this.scene = new SceneManager(container);
    }

    initSocket() {
        try {
            this.socket = createSocket();
            
            this.socket.on('connect', () => {
                console.log('Connected to Socket.IO server');
                this.updateConnectionStatus(true);
            });
            
            this.socket.on('disconnect', () => {
                console.log('Disconnected from Socket.IO server');
                this.updateConnectionStatus(false);
            });
            
            this.socket.on('initial_data', (data) => {
                console.log('Received initial data');
                this.handleInitialData(data);
            });
            
            this.socket.on('sensor_update', (data) => {
                this.handleSensorUpdate(data);
            });
            
            this.socket.on('well_trend', (data) => {
                this.handleWellTrend(data);
            });
            
            this.socket.on('speed_changed', (data) => {
                console.log('Speed changed to:', data.speed);
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                this.updateConnectionStatus(false);
            });
            
        } catch (e) {
            console.error('Error initializing socket:', e);
        }
    }

    initControls() {
        document.getElementById('threshold-slider').addEventListener('input', (e) => {
            this.settings.threshold = parseFloat(e.target.value);
            document.getElementById('threshold-value').textContent = this.settings.threshold.toFixed(1);
            this.scene.setThreshold(this.settings.threshold);
            this.updateVisualization();
        });
        
        document.getElementById('contaminant-select').addEventListener('change', (e) => {
            this.settings.contaminant = e.target.value;
            this.loadPlumeData();
        });
        
        document.getElementById('show-isosurface').addEventListener('change', (e) => {
            this.settings.showIsosurface = e.target.checked;
            this.scene.setShowIsosurface(this.settings.showIsosurface);
        });
        
        document.getElementById('show-wells').addEventListener('change', (e) => {
            this.settings.showWells = e.target.checked;
            this.scene.setShowWells(this.settings.showWells);
        });
        
        document.getElementById('show-cutplane').addEventListener('change', (e) => {
            this.settings.showCutPlane = e.target.checked;
            this.scene.setShowCutPlane(this.settings.showCutPlane);
            if (this.settings.showCutPlane && this.currentData) {
                this.updateCutPlane();
            }
        });
        
        document.getElementById('show-highrisk').addEventListener('change', (e) => {
            this.settings.showHighRisk = e.target.checked;
            this.scene.setShowHighRisk(this.settings.showHighRisk);
        });
        
        document.getElementById('cutplane-axis').addEventListener('change', (e) => {
            this.settings.cutPlaneAxis = e.target.value;
            if (this.settings.showCutPlane && this.currentData) {
                this.updateCutPlane();
            }
        });
        
        document.getElementById('cutplane-position').addEventListener('input', (e) => {
            this.settings.cutPlanePosition = parseFloat(e.target.value);
            if (this.settings.showCutPlane && this.currentData) {
                this.updateCutPlane();
            }
        });
        
        document.getElementById('speed-select').addEventListener('change', (e) => {
            this.settings.speed = parseInt(e.target.value);
            if (this.socket) {
                this.socket.emit('set_speed', { speed: this.settings.speed });
            }
        });
        
        document.getElementById('play-btn').addEventListener('click', () => {
            this.startAnimation();
        });
        
        document.getElementById('pause-btn').addEventListener('click', () => {
            this.stopAnimation();
        });
        
        document.getElementById('timeline').addEventListener('input', (e) => {
            this.currentTimeIndex = parseInt(e.target.value);
            this.updateTimePoint();
        });
        
        document.getElementById('forecast-btn').addEventListener('click', () => {
            this.runForecast();
        });
        
        document.getElementById('optimize-btn').addEventListener('click', () => {
            this.runOptimization();
        });
        
        document.getElementById('close-trend').addEventListener('click', () => {
            document.getElementById('trend-popup').classList.add('hidden');
        });
        
        window.addEventListener('well-click', (e) => {
            const wellId = e.detail.wellId;
            this.showWellTrend(wellId);
        });

        window.addEventListener('place-injection-well', (e) => {
            this.handlePlaceInjectionWell(e.detail);
        });

        window.addEventListener('injection-well-click', (e) => {
            this.editInjectionWell(e.detail.well);
        });

        this.initRemediationControls();
        this.initEnKFControls();
    }

    initRemediationControls() {
        document.getElementById('place-injection-btn').addEventListener('click', () => {
            this.startPlacingInjectionWell();
        });

        document.getElementById('clear-injection-btn').addEventListener('click', () => {
            this.clearInjectionWells();
        });

        document.getElementById('confirm-injection-btn').addEventListener('click', () => {
            this.confirmInjectionWell();
        });

        document.getElementById('cancel-injection-btn').addEventListener('click', () => {
            this.cancelInjectionWell();
        });

        document.getElementById('simulate-remediation-btn').addEventListener('click', () => {
            this.runRemediationSimulation();
        });

        document.getElementById('show-comparison-btn').addEventListener('click', () => {
            this.showComparisonAnimation();
        });

        document.getElementById('apply-remediation-btn').addEventListener('click', () => {
            this.applyRemediationResult();
        });
    }

    initEnKFControls() {
        document.getElementById('assimilate-btn').addEventListener('click', () => {
            this.runEnKFAssimilation();
        });

        document.getElementById('reset-enkf-btn').addEventListener('click', () => {
            this.resetEnKF();
        });
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.drawColorbar();
        });
    }

    async loadInitialData() {
        console.log('Loading initial data...');
        
        try {
            const health = await api.getHealth();
            console.log('Backend health:', health);
        } catch (e) {
            console.warn('Backend not available, waiting for socket data');
        }
        
        try {
            const wellData = await api.getCurrentWellData();
            console.log('Loaded well data:', wellData.length, 'wells');
            
            const plumeData = await api.getPlumeData(this.settings.contaminant, 'json');
            console.log('Loaded plume data');
            
            this.currentData = {
                voxelData: plumeData.data,
                dims: plumeData.dimensions,
                wellData: wellData,
                bounds: [
                    plumeData.x_min, plumeData.x_max,
                    plumeData.y_min, plumeData.y_max,
                    plumeData.z_min, plumeData.z_max
                ]
            };
            
            this.scene.bounds = this.currentData.bounds;
            this.updateVisualization();
            
            const maxConc = Math.max(...plumeData.data);
            this.scene.setConcentrationRange(0, Math.max(50, maxConc));
            this.drawColorbar();
            
            const risk = await api.getRiskAssessment();
            this.updateRiskDisplay(risk);
            
            document.getElementById('well-count').textContent = wellData.length;
            
        } catch (e) {
            console.error('Error loading initial data:', e);
            throw e;
        }
    }

    async loadPlumeData() {
        try {
            const plumeData = await api.getPlumeData(this.settings.contaminant, 'json');
            const wellData = await api.getCurrentWellData();
            
            this.currentData = {
                voxelData: plumeData.data,
                dims: plumeData.dimensions,
                wellData: wellData,
                bounds: [
                    plumeData.x_min, plumeData.x_max,
                    plumeData.y_min, plumeData.y_max,
                    plumeData.z_min, plumeData.z_max
                ]
            };
            
            const maxConc = Math.max(...plumeData.data);
            this.scene.setConcentrationRange(0, Math.max(50, maxConc));
            this.drawColorbar();
            
            this.updateVisualization();
            
            const risk = await api.getRiskAssessment();
            this.updateRiskDisplay(risk);
            
        } catch (e) {
            console.error('Error loading plume data:', e);
        }
    }

    handleInitialData(data) {
        console.log('Handling initial data from socket');
        
        if (data.voxel_grid) {
            this.currentData = {
                voxelData: data.voxel_grid.data,
                dims: data.voxel_grid.dimensions,
                wellData: data.well_data,
                bounds: data.voxel_grid.bounds ? [
                    data.voxel_grid.bounds.x_min, data.voxel_grid.bounds.x_max,
                    data.voxel_grid.bounds.y_min, data.voxel_grid.bounds.y_max,
                    data.voxel_grid.bounds.z_min, data.voxel_grid.bounds.z_max
                ] : this.currentData?.bounds || [0, 100, 0, 100, 0, 20]
            };
            
            this.scene.bounds = this.currentData.bounds;
            
            const maxConc = Math.max(...data.voxel_grid.data);
            this.scene.setConcentrationRange(0, Math.max(50, maxConc));
            this.drawColorbar();
            
            this.updateVisualization();
        }
        
        if (data.wells) {
            document.getElementById('well-count').textContent = data.wells.length;
        }
        
        document.getElementById('well-count').textContent = data.well_data?.length || 30;
    }

    handleSensorUpdate(data) {
        if (!data.voxel_grid || !data.well_data) return;
        
        this.currentData = {
            voxelData: data.voxel_grid.data,
            dims: data.voxel_grid.dimensions,
            wellData: data.well_data,
            bounds: this.currentData?.bounds || [0, 100, 0, 100, 0, 20]
        };
        
        this.updateVisualization();
        this.updateInfoDisplay(data);
        
        if (data.risk_assessment) {
            this.updateRiskDisplay(data.risk_assessment);
        }
        
        if (data.time_hours !== undefined) {
            document.getElementById('simulation-hours').textContent = data.time_hours;
        }
    }

    handleWellTrend(data) {
        if (!data.trend) return;
        
        document.getElementById('trend-title').textContent = `${data.well_id} - 历史趋势`;
        this.charts.drawTrendChart('trend-chart', data.trend);
        document.getElementById('trend-popup').classList.remove('hidden');
    }

    updateVisualization() {
        if (!this.currentData) return;
        
        const now = performance.now();
        if (now - this._lastVisualizationTime < this._visualizationThrottleMs) return;
        this._lastVisualizationTime = now;
        
        const { voxelData, dims, wellData } = this.currentData;
        
        if (this.settings.showIsosurface) {
            this.scene.updateIsosurface(voxelData, dims, this.settings.threshold);
        }
        
        this.scene.updateWells(wellData, this.settings.showWells);
        
        if (this.settings.showCutPlane) {
            this.updateCutPlane();
        }
    }

    updateCutPlane() {
        if (!this.currentData) return;
        
        const { voxelData, dims } = this.currentData;
        this.scene.updateCutPlane(
            voxelData,
            dims,
            this.settings.cutPlaneAxis,
            this.settings.cutPlanePosition,
            this.settings.showCutPlane
        );
    }

    updateRiskDisplay(risk) {
        if (!risk) return;
        
        document.getElementById('risk-volume').textContent = 
            `${risk.exceedance_volume.toFixed(1)} m³`;
        document.getElementById('risk-percent').textContent = 
            `${risk.exceedance_percentage.toFixed(2)}%`;
        
        const maxConc = risk.high_risk_regions?.length > 0 
            ? Math.max(...risk.high_risk_regions.map(r => r.max_concentration))
            : 0;
        document.getElementById('max-concentration').textContent = 
            `${maxConc.toFixed(2)} μg/L`;
        
        this.scene.updateHighRiskRegions(
            risk.high_risk_regions,
            this.settings.showHighRisk
        );
    }

    updateInfoDisplay(data) {
        if (data.timestamp) {
            const timestamp = new Date(data.timestamp);
            document.getElementById('current-timestamp').textContent = 
                timestamp.toLocaleString('zh-CN');
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (connected) {
            statusEl.textContent = '已连接';
            statusEl.className = 'status-connected';
        } else {
            statusEl.textContent = '未连接';
            statusEl.className = 'status-disconnected';
        }
    }

    showConnectionError() {
        console.warn('Connection to backend failed. Please ensure the backend server is running.');
    }

    drawColorbar() {
        this.charts.drawColorbar('colorbar', 0, 50);
    }

    showWellTrend(wellId) {
        if (this.socket) {
            this.socket.emit('get_well_trend', { well_id: wellId, hours: 720 });
        } else {
            api.getWellData(wellId, 720).then(data => {
                document.getElementById('trend-title').textContent = `${wellId} - 历史趋势`;
                this.charts.drawTrendChart('trend-chart', data);
                document.getElementById('trend-popup').classList.remove('hidden');
            });
        }
    }

    async runForecast() {
        try {
            document.getElementById('forecast-btn').disabled = true;
            document.getElementById('forecast-btn').textContent = '预测中...';
            
            const request = {
                months_ahead: 3,
                contaminant: this.settings.contaminant
            };
            
            const result = await api.forecast(request);
            console.log('Forecast result:', result);
            
            if (result.forecast) {
                this.currentData.voxelData = result.forecast.data;
                this.updateVisualization();
                this.updateRiskDisplay(result.risk_assessment);
                
                alert('预测完成！显示3个月后的羽流分布');
            }
            
        } catch (e) {
            console.error('Forecast error:', e);
            alert('预测失败: ' + e.message);
        } finally {
            document.getElementById('forecast-btn').disabled = false;
            document.getElementById('forecast-btn').textContent = '预测3个月后';
        }
    }

    async runOptimization() {
        try {
            document.getElementById('optimize-btn').disabled = true;
            document.getElementById('optimize-btn').textContent = '优化中...';
            
            const result = await api.optimizeMonitoringNetwork(5, this.settings.contaminant);
            console.log('Optimization result:', result);
            
            if (result.candidate_locations) {
                this.scene.showOptimizationCandidates(result.candidate_locations);
                
                alert(
                    `监测网优化完成！\n\n` +
                    `建议新增监测井位置: ${result.candidate_locations.length} 个\n` +
                    `当前最大方差: ${result.current_max_variance.toFixed(4)}\n` +
                    `优化后最大方差: ${result.optimized_max_variance.toFixed(4)}\n` +
                    `方差降低: ${((1 - result.optimized_max_variance / result.current_max_variance) * 100).toFixed(1)}%`
                );
            }
            
        } catch (e) {
            console.error('Optimization error:', e);
            alert('优化失败: ' + e.message);
        } finally {
            document.getElementById('optimize-btn').disabled = false;
            document.getElementById('optimize-btn').textContent = '监测网优化';
        }
    }

    async loadTimeSeries() {
        try {
            const data = await api.getTimeSeries(30, 0, 24, this.settings.contaminant);
            this.timeSeriesData = data;
            
            const timelineSlider = document.getElementById('timeline');
            timelineSlider.max = data.length - 1;
            
            document.getElementById('start-time').textContent = 
                new Date(data[0].timestamp).toLocaleDateString('zh-CN');
            document.getElementById('end-time').textContent = 
                new Date(data[data.length - 1].timestamp).toLocaleDateString('zh-CN');
            
            console.log('Loaded time series:', data.length, 'time points');
            
        } catch (e) {
            console.error('Error loading time series:', e);
        }
    }

    updateTimePoint() {
        if (!this.timeSeriesData || this.timeSeriesData.length === 0) return;
        
        const point = this.timeSeriesData[this.currentTimeIndex];
        if (!point) return;
        
        this.currentData = {
            voxelData: point.voxel_data,
            dims: this.currentData?.dims || [21, 21, 11],
            wellData: point.well_data,
            bounds: this.currentData?.bounds || [0, 100, 0, 100, 0, 20]
        };
        
        this.updateVisualization();
        
        const timestamp = new Date(point.timestamp);
        document.getElementById('current-timestamp').textContent = 
            timestamp.toLocaleString('zh-CN');
        document.getElementById('current-time').textContent = 
            timestamp.toLocaleDateString('zh-CN');
    }

    startAnimation() {
        if (this.isPlaying) return;
        
        if (!this.timeSeriesData) {
            this.loadTimeSeries().then(() => {
                this._startPlayback();
            });
        } else {
            this._startPlayback();
        }
    }

    _startPlayback() {
        this.isPlaying = true;
        let lastFrameTime = 0;
        const frameInterval = 500;
        
        const tick = (timestamp) => {
            if (!this.isPlaying) return;
            
            if (timestamp - lastFrameTime >= frameInterval) {
                lastFrameTime = timestamp;
                
                if (this.currentTimeIndex >= this.timeSeriesData.length - 1) {
                    this.currentTimeIndex = 0;
                } else {
                    this.currentTimeIndex++;
                }
                
                document.getElementById('timeline').value = this.currentTimeIndex;
                this.updateTimePoint();
            }
            
            this.playInterval = requestAnimationFrame(tick);
        };
        
        this.playInterval = requestAnimationFrame(tick);
    }

    stopAnimation() {
        this.isPlaying = false;
        if (this.playInterval) {
            cancelAnimationFrame(this.playInterval);
            this.playInterval = null;
        }
    }

    startPlacingInjectionWell() {
        this.scene.setInjectionPlaceMode(true);
        document.getElementById('place-injection-btn').textContent = '📍 点击场景放置';
        document.getElementById('place-injection-btn').style.background = '#ff6b00';
    }

    handlePlaceInjectionWell(position) {
        this.pendingInjectionPosition = position;
        this.scene.setInjectionPlaceMode(false);
        document.getElementById('place-injection-btn').textContent = '📍 放置注入井';
        document.getElementById('place-injection-btn').style.background = '';
        
        document.getElementById('injection-params').style.display = 'block';
        
        const idx = this.injectionWells.length + 1;
        document.getElementById('injection-well-id').value = `INJ-${String(idx).padStart(3, '0')}`;
    }

    cancelInjectionWell() {
        this.pendingInjectionPosition = null;
        document.getElementById('injection-params').style.display = 'none';
    }

    async confirmInjectionWell() {
        if (!this.pendingInjectionPosition) return;

        const well = {
            well_id: document.getElementById('injection-well-id').value,
            x: this.pendingInjectionPosition.x,
            y: this.pendingInjectionPosition.y,
            z: this.pendingInjectionPosition.z || 10,
            type: document.getElementById('injection-type').value,
            reagent_concentration: parseFloat(document.getElementById('reagent-concentration').value),
            injection_rate: parseFloat(document.getElementById('injection-rate').value),
            reaction_half_life: parseFloat(document.getElementById('reaction-half-life').value),
            degradation_rate: parseFloat(document.getElementById('degradation-rate').value)
        };

        try {
            await api.addInjectionWell(well);
            this.injectionWells.push(well);
            this.scene.updateInjectionWells(this.injectionWells);
            
            this.pendingInjectionPosition = null;
            document.getElementById('injection-params').style.display = 'none';
            
            alert(`注入井 ${well.well_id} 已放置`);
        } catch (e) {
            console.error('Error adding injection well:', e);
            alert('添加注入井失败: ' + e.message);
        }
    }

    async clearInjectionWells() {
        try {
            await api.clearInjectionWells();
            this.injectionWells = [];
            this.scene.updateInjectionWells([]);
            document.getElementById('remediation-result').style.display = 'none';
        } catch (e) {
            console.error('Error clearing injection wells:', e);
        }
    }

    editInjectionWell(well) {
        alert(`编辑注入井 ${well.well_id}\n位置: (${well.x.toFixed(1)}, ${well.y.toFixed(1)})`);
    }

    async runRemediationSimulation() {
        if (this.injectionWells.length === 0) {
            alert('请先放置至少一个注入井');
            return;
        }

        try {
            document.getElementById('simulate-remediation-btn').disabled = true;
            document.getElementById('simulate-remediation-btn').textContent = '模拟中...';

            const request = {
                injection_wells: this.injectionWells,
                duration_days: parseInt(document.getElementById('remediation-duration').value),
                timestep_days: 1,
                contaminant: this.settings.contaminant
            };

            const result = await api.simulateRemediation(request);
            console.log('Remediation result:', result);

            this.remediationResult = result;
            this.comparisonData = {
                before: result.initial_state.concentration,
                after: result.final_state.concentration
            };

            document.getElementById('remediation-result').style.display = 'block';
            document.getElementById('remediation-reduction').textContent = 
                result.reduction_percentage.toFixed(1) + '%';
            document.getElementById('risk-reduction').textContent = 
                result.risk_reduction.toFixed(1) + '%';
            document.getElementById('reagent-used').textContent = 
                (result.total_reagent_used / 1000).toFixed(2) + ' kg';

        } catch (e) {
            console.error('Remediation simulation error:', e);
            alert('模拟失败: ' + e.message);
        } finally {
            document.getElementById('simulate-remediation-btn').disabled = false;
            document.getElementById('simulate-remediation-btn').textContent = '▶ 运行修复模拟';
        }
    }

    showComparisonAnimation() {
        if (!this.comparisonData) return;
        
        this.comparisonMode = true;
        let showingBefore = true;
        let count = 0;
        const maxCycles = 6;

        const animate = () => {
            if (count >= maxCycles * 2) {
                this.comparisonMode = false;
                return;
            }

            if (showingBefore) {
                this.currentData.voxelData = this.comparisonData.before;
                showingBefore = false;
            } else {
                this.currentData.voxelData = this.comparisonData.after;
                showingBefore = true;
                count++;
            }
            
            this.updateVisualization();
            setTimeout(animate, 1000);
        };

        animate();
    }

    applyRemediationResult() {
        if (!this.remediationResult) return;
        
        this.currentData.voxelData = this.remediationResult.final_state.concentration;
        this.updateVisualization();
        
        alert('修复结果已应用');
    }

    async runEnKFAssimilation() {
        try {
            document.getElementById('assimilate-btn').disabled = true;
            document.getElementById('assimilate-btn').textContent = '同化中...';

            const sensorData = this.currentData?.wellData?.map(w => ({
                well_id: w.id,
                x: w.x,
                y: w.y,
                z: w.z,
                measurement: w.concentration,
                timestamp: new Date().toISOString()
            })) || [];

            const config = {
                ensemble_size: parseInt(document.getElementById('enkf-ensemble-size').value),
                observation_noise: parseFloat(document.getElementById('enkf-noise').value),
                parameters_to_update: [
                    document.getElementById('param-k').checked ? 'hydraulic_conductivity' : null,
                    document.getElementById('param-phi').checked ? 'porosity' : null,
                    document.getElementById('param-lambda').checked ? 'degradation_rate' : null
                ].filter(Boolean),
                sensor_data: sensorData
            };

            const result = await api.enkfAssimilate(config);
            console.log('EnKF result:', result);

            this.enkfResult = result;

            const paramList = document.getElementById('parameter-list');
            paramList.innerHTML = Object.entries(result.updated_parameters).map(([key, val]) => {
                const nameMap = {
                    hydraulic_conductivity: '水力传导率',
                    porosity: '孔隙度',
                    degradation_rate: '降解速率'
                };
                const unc = result.parameter_uncertainty[key] || 0;
                return `
                    <div class="risk-item">
                        <span class="risk-label">${nameMap[key] || key}:</span>
                        <span>${val.toFixed(4)} (±${(unc * 100).toFixed(1)}%)</span>
                    </div>
                `;
            }).join('');

            document.getElementById('enkf-result').style.display = 'block';
            document.getElementById('forecast-improvement').textContent = 
                (result.forecast_improvement * 100).toFixed(1) + '%';

        } catch (e) {
            console.error('EnKF assimilation error:', e);
            alert('数据同化失败: ' + e.message);
        } finally {
            document.getElementById('assimilate-btn').disabled = false;
            document.getElementById('assimilate-btn').textContent = '🔄 执行数据同化';
        }
    }

    async resetEnKF() {
        try {
            await api.resetEnkf();
            document.getElementById('enkf-result').style.display = 'none';
            alert('参数已重置');
        } catch (e) {
            console.error('Error resetting EnKF:', e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new Application();
});
