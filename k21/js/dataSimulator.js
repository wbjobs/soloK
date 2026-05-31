class DataSimulator {
    constructor() {
        this.cables = CONFIG.cables;
        this.totalPoints = CONFIG.dts.totalPoints;
        this.scanInterval = CONFIG.dts.scanInterval;
        this.historyHours = CONFIG.playback.historyHours;
        this.historyData = [];
        this.currentData = [];
        this.currentLoad = [];
        this.isRunning = false;
        this.scanCount = 0;
        this.lastScanTime = Date.now();
        this.hotspotPositions = this.generateHotspotPositions();
        this.initializeHistoryData();
    }

    generateHotspotPositions() {
        const positions = [];
        const hotspotCount = 5;
        for (let i = 0; i < hotspotCount; i++) {
            positions.push({
                position: Math.floor(Math.random() * this.totalPoints),
                width: 50 + Math.floor(Math.random() * 100),
                intensity: 0.5 + Math.random() * 0.5
            });
        }
        return positions;
    }

    initializeHistoryData() {
        const totalScans = Math.ceil((this.historyHours * 3600 * 1000) / this.scanInterval);
        const startTime = Date.now() - totalScans * this.scanInterval;
        
        for (let i = 0; i < totalScans; i++) {
            const timestamp = startTime + i * this.scanInterval;
            const scanData = this.generateScanData(timestamp, i / totalScans);
            this.historyData.push({
                timestamp,
                cables: scanData
            });
        }
        
        this.currentData = this.historyData[this.historyData.length - 1].cables;
    }

    generateScanData(timestamp, progress) {
        const cableData = [];
        const hourOfDay = (new Date(timestamp).getHours() + new Date(timestamp).getMinutes() / 60);
        const loadVariation = 0.6 + 0.4 * Math.sin((hourOfDay - 6) * Math.PI / 12);
        
        for (let c = 0; c < this.cables.length; c++) {
            const cable = this.cables[c];
            const temperatures = new Float32Array(this.totalPoints);
            const load = 200 + 400 * loadVariation + Math.sin(progress * Math.PI * 4) * 100;
            
            for (let i = 0; i < this.totalPoints; i++) {
                let temp = cable.baseTemp;
                temp += Math.sin(i / 500) * 3;
                temp += Math.sin(i / 200 + c * 2) * 2;
                temp += (load / 600) * 15;
                
                for (const hotspot of this.hotspotPositions) {
                    const dist = Math.abs(i - hotspot.position);
                    if (dist < hotspot.width) {
                        const hotspotFactor = 1 - dist / hotspot.width;
                        temp += hotspot.intensity * hotspotFactor * 30 * (0.5 + 0.5 * Math.sin(progress * Math.PI * 8 + c));
                    }
                }
                
                temp += (Math.random() - 0.5) * 0.5;
                
                if (i > 3000 && i < 3500 && c === 0) {
                    temp += 20 + Math.sin(progress * Math.PI * 6) * 10;
                }
                
                if (i > 7000 && i < 7200 && c === 1) {
                    temp += 15 + Math.sin(progress * Math.PI * 10) * 8;
                }
                
                temperatures[i] = Math.max(15, Math.min(120, temp));
            }
            
            cableData.push({
                cableId: c,
                temperatures,
                load: load * (c === 0 ? 1 : (c === 1 ? 0.6 : 0.4))
            });
        }
        
        return cableData;
    }

    start(callback) {
        this.isRunning = true;
        this.callback = callback;
        this.scan();
    }

    stop() {
        this.isRunning = false;
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
        }
    }

    scan() {
        if (!this.isRunning) return;
        
        const now = Date.now();
        this.scanCount++;
        
        const scanData = this.generateScanData(now, this.scanCount / 1000);
        this.currentData = scanData;
        this.lastScanTime = now;
        
        this.historyData.push({
            timestamp: now,
            cables: scanData
        });
        
        const maxHistoryScans = Math.ceil((this.historyHours * 3600 * 1000) / this.scanInterval);
        if (this.historyData.length > maxHistoryScans) {
            this.historyData.shift();
        }
        
        if (this.callback) {
            this.callback(scanData, now);
        }
        
        const elapsed = Date.now() - now;
        const nextDelay = Math.max(0, this.scanInterval - elapsed);
        this.timeoutId = setTimeout(() => this.scan(), nextDelay);
    }

    getCurrentData() {
        return this.currentData;
    }

    getHistoryData(startTime, endTime) {
        return this.historyData.filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
    }

    getHistoryDataAtTime(timestamp) {
        let closest = this.historyData[0];
        let minDiff = Math.abs(closest.timestamp - timestamp);
        
        for (const data of this.historyData) {
            const diff = Math.abs(data.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = data;
            }
        }
        
        return closest;
    }

    getTemperatureAtPoint(cableId, pointIndex) {
        if (!this.currentData[cableId]) return null;
        return this.currentData[cableId].temperatures[pointIndex];
    }

    getPointHistory(cableId, pointIndex, startTime, endTime) {
        const history = [];
        const data = this.getHistoryData(startTime, endTime);
        
        for (const scan of data) {
            if (scan.cables[cableId]) {
                history.push({
                    timestamp: scan.timestamp,
                    temperature: scan.cables[cableId].temperatures[pointIndex]
                });
            }
        }
        
        return history;
    }

    getStatistics(cableId) {
        if (!this.currentData[cableId]) return null;
        
        const temps = this.currentData[cableId].temperatures;
        let sum = 0;
        let max = -Infinity;
        let min = Infinity;
        let maxIndex = 0;
        let minIndex = 0;
        
        for (let i = 0; i < temps.length; i++) {
            sum += temps[i];
            if (temps[i] > max) {
                max = temps[i];
                maxIndex = i;
            }
            if (temps[i] < min) {
                min = temps[i];
                minIndex = i;
            }
        }
        
        return {
            max,
            min,
            avg: sum / temps.length,
            maxIndex,
            minIndex
        };
    }
}
