class ThermalAnalysis {
    constructor(dataSimulator) {
        this.dataSimulator = dataSimulator;
        this.previousData = null;
        this.rateHistory = [];
        this.thermalResistivity = 1.0;
    }

    update(currentData) {
        const analysisResults = [];
        
        for (let c = 0; c < currentData.length; c++) {
            const cable = currentData[c];
            const rates = this.calculateTemperatureRates(cable.cableId, cable.temperatures);
            const hotspots = this.detectHotspots(cable.temperatures, rates);
            const dcr = this.calculateDCR(cable.temperatures, cable.load);
            
            analysisResults.push({
                cableId: cable.cableId,
                rates,
                hotspots,
                dcr,
                maxRate: Math.max(...rates),
                avgRate: rates.reduce((a, b) => a + b, 0) / rates.length
            });
        }
        
        this.previousData = currentData;
        return analysisResults;
    }

    calculateTemperatureRates(cableId, currentTemps) {
        const rates = new Float32Array(currentTemps.length);
        const intervalMinutes = CONFIG.dts.scanInterval / 60000;
        
        if (!this.previousData || !this.previousData[cableId]) {
            return rates;
        }
        
        const prevTemps = this.previousData[cableId].temperatures;
        
        for (let i = 0; i < currentTemps.length; i++) {
            rates[i] = (currentTemps[i] - prevTemps[i]) / intervalMinutes;
        }
        
        return rates;
    }

    detectHotspots(temperatures, rates) {
        const hotspots = [];
        const threshold = CONFIG.thresholds.maxTemperature;
        const ambientDiff = CONFIG.thresholds.ambientTempDiff;
        const ambientTemp = CONFIG.thresholds.ambientTemperature;
        const rateThreshold = CONFIG.thresholds.tempIncreaseRate;
        
        let inHotspot = false;
        let hotspotStart = -1;
        let hotspotMaxTemp = 0;
        let hotspotMaxRate = 0;
        
        for (let i = 0; i < temperatures.length; i++) {
            const temp = temperatures[i];
            const rate = rates[i] || 0;
            const isHotspot = temp > threshold || 
                             (temp - ambientTemp) > ambientDiff ||
                             rate > rateThreshold;
            
            if (isHotspot && !inHotspot) {
                inHotspot = true;
                hotspotStart = i;
                hotspotMaxTemp = temp;
                hotspotMaxRate = rate;
            } else if (isHotspot && inHotspot) {
                hotspotMaxTemp = Math.max(hotspotMaxTemp, temp);
                hotspotMaxRate = Math.max(hotspotMaxRate, rate);
            } else if (!isHotspot && inHotspot) {
                inHotspot = false;
                if (i - hotspotStart >= 3) {
                    hotspots.push({
                        start: hotspotStart,
                        end: i - 1,
                        maxTemp: hotspotMaxTemp,
                        maxRate: hotspotMaxRate,
                        length: (i - hotspotStart) * CONFIG.dts.spatialResolution,
                        type: this.getHotspotType(hotspotMaxTemp, hotspotMaxRate)
                    });
                }
            }
        }
        
        if (inHotspot) {
            if (temperatures.length - hotspotStart >= 3) {
                hotspots.push({
                    start: hotspotStart,
                    end: temperatures.length - 1,
                    maxTemp: hotspotMaxTemp,
                    maxRate: hotspotMaxRate,
                    length: (temperatures.length - hotspotStart) * CONFIG.dts.spatialResolution,
                    type: this.getHotspotType(hotspotMaxTemp, hotspotMaxRate)
                });
            }
        }
        
        return hotspots;
    }

    getHotspotType(temp, rate) {
        if (temp > CONFIG.thresholds.maxTemperature) {
            return 'critical';
        }
        if (rate > CONFIG.thresholds.tempIncreaseRate) {
            return 'rate';
        }
        return 'warning';
    }

    calculateDCR(temperatures, load) {
        const { R, Wd, T1, T2, T3, T4, n, lambda1, lambda2 } = CONFIG.iec60287;
        const ambientTemp = CONFIG.thresholds.ambientTemperature;
        
        const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
        const deltaT = avgTemp - ambientTemp;
        
        const theta = 90 - ambientTemp;
        
        const soilMoistureFactor = this.getSoilMoistureFactor();
        const compensatedT4 = T4 * soilMoistureFactor;
        
        const Wc = (theta - n * (Wd * (T2 + T3 + compensatedT4))) / 
                   (R * (T1 + (1 + lambda1) * n * T2 + (1 + lambda1 + lambda2) * n * (T3 + compensatedT4)));
        
        const dcr = Math.sqrt(Math.abs(Wc / R));
        
        const adjustment = Math.max(0.5, Math.min(1.5, 1 - deltaT / 100));
        const moistureAdjustment = 1.0 + (1 - soilMoistureFactor) * 0.15;
        
        return Math.round(dcr * adjustment * moistureAdjustment);
    }

    getSoilMoistureFactor() {
        const now = new Date();
        const month = now.getMonth();
        
        const seasonalMoisture = {
            0: 0.85,
            1: 0.88,
            2: 0.92,
            3: 0.95,
            4: 0.98,
            5: 0.95,
            6: 0.82,
            7: 0.75,
            8: 0.78,
            9: 0.85,
            10: 0.90,
            11: 0.87
        };
        
        const baseMoisture = seasonalMoisture[month] || 0.85;
        
        const dayOfYear = this.getDayOfYear(now);
        const annualVariation = Math.sin((dayOfYear - 80) * Math.PI / 182.5) * 0.08;
        
        const dailyVariation = Math.sin((now.getHours() - 6) * Math.PI / 12) * 0.02;
        
        return Math.max(0.7, Math.min(1.0, baseMoisture + annualVariation + dailyVariation));
    }

    getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    invertThermalResistivity(cableId, pointIndex, current, pointHistory) {
        if (pointHistory.length < 10) return this.thermalResistivity;
        
        const R = CONFIG.iec60287.R;
        const T1 = CONFIG.iec60287.T1;
        
        let sumResistivity = 0;
        let count = 0;
        
        for (let i = 1; i < pointHistory.length; i++) {
            const prev = pointHistory[i - 1];
            const curr = pointHistory[i];
            
            const deltaT = curr.temperature - prev.temperature;
            const dt = (curr.timestamp - prev.timestamp) / 1000;
            
            if (dt > 0 && Math.abs(deltaT) > 0.1) {
                const I = current;
                const Q = I * I * R;
                
                if (Q > 0) {
                    const rho = (deltaT * T1 * 1000) / (Q * dt);
                    if (rho > 0.1 && rho < 10) {
                        sumResistivity += rho;
                        count++;
                    }
                }
            }
        }
        
        if (count > 0) {
            this.thermalResistivity = sumResistivity / count;
        }
        
        return this.thermalResistivity;
    }

    getThermalResistivity() {
        return this.thermalResistivity;
    }

    getStatistics(cableId) {
        const stats = this.dataSimulator.getStatistics(cableId);
        return stats;
    }

    getRateStatistics(rates) {
        if (!rates || rates.length === 0) {
            return { max: 0, min: 0, avg: 0 };
        }
        
        let max = -Infinity;
        let min = Infinity;
        let sum = 0;
        
        for (const rate of rates) {
            max = Math.max(max, rate);
            min = Math.min(min, rate);
            sum += rate;
        }
        
        return {
            max,
            min,
            avg: sum / rates.length
        };
    }
}
