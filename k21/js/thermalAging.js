class ThermalAgingModel {
    constructor(dataSimulator) {
        this.dataSimulator = dataSimulator;
        
        this.agingParams = {
            activationEnergy: 1.1,
            referenceTemp: 90,
            ratedLifeHours: 200000,
            boltzmannConstant: 8.617e-5,
            maxLifeYears: 40
        };
        
        this.agingHistory = [];
        this.accumulatedAging = 0;
        this.equivalentOperatingTime = 0;
        this.remainingLife = this.agingParams.maxLifeYears;
        
        this.init();
    }

    init() {
        const historyData = this.dataSimulator.historyData;
        if (historyData && historyData.length > 0) {
            this.calculateHistoricalAging();
        }
    }

    calculateArrheniusFactor(temperature) {
        const { activationEnergy, referenceTemp, boltzmannConstant } = this.agingParams;
        
        const tempK = temperature + 273.15;
        const refTempK = referenceTemp + 273.15;
        
        const factor = Math.exp(
            (activationEnergy / boltzmannConstant) * 
            (1 / tempK - 1 / refTempK)
        );
        
        return factor;
    }

    calculateAgingRate(temperature) {
        const arrheniusFactor = this.calculateArrheniusFactor(temperature);
        const { ratedLifeHours, referenceTemp } = this.agingParams;
        
        const agingAtRef = 1 / ratedLifeHours;
        
        const agingRate = agingAtRef / arrheniusFactor;
        
        return agingRate;
    }

    calculateHistoricalAging() {
        const historyData = this.dataSimulator.historyData;
        if (!historyData || historyData.length < 2) return;
        
        let totalAging = 0;
        let totalEquivalentTime = 0;
        
        const intervalHours = CONFIG.dts.scanInterval / 3600000;
        
        for (let i = 1; i < historyData.length; i++) {
            const prevData = historyData[i - 1];
            const currData = historyData[i];
            
            if (prevData.cables[0] && currData.cables[0]) {
                const prevTemps = prevData.cables[0].temperatures;
                const currTemps = currData.cables[0].temperatures;
                
                let avgTemp = 0;
                const sampleStep = 100;
                let sampleCount = 0;
                
                for (let j = 0; j < prevTemps.length; j += sampleStep) {
                    avgTemp += (prevTemps[j] + currTemps[j]) / 2;
                    sampleCount++;
                }
                avgTemp /= sampleCount;
                
                const agingRate = this.calculateAgingRate(avgTemp);
                const agingIncrement = agingRate * intervalHours;
                totalAging += agingIncrement;
                
                const equivalentFactor = this.calculateArrheniusFactor(avgTemp);
                totalEquivalentTime += intervalHours * equivalentFactor;
            }
        }
        
        this.accumulatedAging = totalAging;
        this.equivalentOperatingTime = totalEquivalentTime;
        
        this.updateRemainingLife();
    }

    updateAging(currentData) {
        const intervalHours = CONFIG.dts.scanInterval / 3600000;
        
        if (!currentData[0]) return;
        
        const temps = currentData[0].temperatures;
        
        let avgTemp = 0;
        const sampleStep = 100;
        let sampleCount = 0;
        
        for (let j = 0; j < temps.length; j += sampleStep) {
            avgTemp += temps[j];
            sampleCount++;
        }
        avgTemp /= sampleCount;
        
        const agingRate = this.calculateAgingRate(avgTemp);
        this.accumulatedAging += agingRate * intervalHours;
        
        const equivalentFactor = this.calculateArrheniusFactor(avgTemp);
        this.equivalentOperatingTime += intervalHours * equivalentFactor;
        
        this.updateRemainingLife();
    }

    updateRemainingLife() {
        const { maxLifeYears, ratedLifeHours } = this.agingParams;
        
        const consumedLifeRatio = this.accumulatedAging * ratedLifeHours;
        const remainingYears = maxLifeYears * (1 - Math.min(1, consumedLifeRatio));
        
        const historyHours = this.equivalentOperatingTime;
        const historyYears = historyHours / (365 * 24);
        
        this.remainingLife = Math.max(0, maxLifeYears - historyYears);
    }

    getAgingReport() {
        const { maxLifeYears, ratedLifeHours, referenceTemp } = this.agingParams;
        
        const equivalentYears = this.equivalentOperatingTime / (365 * 24);
        const lifeConsumptionRate = (equivalentYears / maxLifeYears) * 100;
        
        const historyData = this.dataSimulator.historyData;
        let maxTemp = 0;
        let hotspotCount = 0;
        
        if (historyData && historyData.length > 0) {
            const latestData = historyData[historyData.length - 1];
            if (latestData.cables[0]) {
                const temps = latestData.cables[0].temperatures;
                maxTemp = Math.max(...temps);
                
                for (let i = 0; i < temps.length; i++) {
                    if (temps[i] > referenceTemp) {
                        hotspotCount++;
                    }
                }
            }
        }
        
        return {
            accumulatedAging: this.accumulatedAging,
            equivalentOperatingTime: this.equivalentOperatingTime,
            equivalentYears: equivalentYears,
            remainingLife: this.remainingLife,
            lifeConsumptionRate: lifeConsumptionRate,
            maxTemperature: maxTemp,
            hotspotCount: hotspotCount,
            arrheniusAtMaxTemp: this.calculateArrheniusFactor(maxTemp),
            maxLifeYears: maxLifeYears
        };
    }

    predictRemainingLife(temperatureProfile) {
        const { maxLifeYears, ratedLifeHours } = this.agingParams;
        
        let avgTemp = 0;
        if (temperatureProfile && temperatureProfile.length > 0) {
            avgTemp = temperatureProfile.reduce((a, b) => a + b, 0) / temperatureProfile.length;
        }
        
        const arrheniusFactor = this.calculateArrheniusFactor(avgTemp);
        const acceleratedHours = ratedLifeHours / arrheniusFactor;
        const acceleratedYears = acceleratedHours / (365 * 24);
        
        const remainingYears = Math.max(0, acceleratedYears - this.equivalentOperatingTime / (365 * 24));
        
        return {
            predictedLife: acceleratedYears,
            remainingLife: remainingYears,
            arrheniusFactor: arrheniusFactor,
            averageTemperature: avgTemp
        };
    }

    getHotspotAgingAnalysis() {
        const historyData = this.dataSimulator.historyData;
        if (!historyData || historyData.length === 0) return [];
        
        const latestData = historyData[historyData.length - 1];
        if (!latestData.cables[0]) return [];
        
        const temps = latestData.cables[0].temperatures;
        const { referenceTemp } = this.agingParams;
        
        const hotspots = [];
        const step = 100;
        
        for (let i = 0; i < temps.length; i += step) {
            if (temps[i] > referenceTemp - 10) {
                const arrhenius = this.calculateArrheniusFactor(temps[i]);
                const lifeReduction = (1 - 1 / arrhenius) * 100;
                
                hotspots.push({
                    position: i,
                    positionKm: (i / 1000).toFixed(2),
                    temperature: temps[i],
                    arrheniusFactor: arrhenius.toFixed(2),
                    lifeReduction: lifeReduction.toFixed(1)
                });
            }
        }
        
        return hotspots.sort((a, b) => b.temperature - a.temperature).slice(0, 10);
    }

    calculateLifeStressIndex() {
        const report = this.getAgingReport();
        const hotspots = this.getHotspotAgingAnalysis();
        
        let hotspotFactor = 1;
        if (hotspots.length > 0) {
            hotspotFactor = Math.max(...hotspots.map(h => parseFloat(h.arrheniusFactor)));
        }
        
        const lsi = report.lifeConsumptionRate * hotspotFactor / 100;
        
        return {
            lsi: Math.min(10, lsi),
            level: lsi < 0.3 ? '正常' : lsi < 0.7 ? '注意' : '警告',
            hotspotFactor: hotspotFactor.toFixed(2)
        };
    }
}
