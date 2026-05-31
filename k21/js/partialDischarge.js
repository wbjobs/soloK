class PartialDischargeSystem {
    constructor() {
        this.hfctSensors = [
            { id: 0, position: 0, name: 'HFCT-001', sensitivity: 5 },
            { id: 1, position: 2500, name: 'HFCT-002', sensitivity: 5 },
            { id: 2, position: 5000, name: 'HFCT-003', sensitivity: 5 },
            { id: 3, position: 7500, name: 'HFCT-004', sensitivity: 5 },
            { id: 4, position: 9999, name: 'HFCT-005', sensitivity: 5 }
        ];
        
        this.dischargeEvents = [];
        this.dischargeDensityMap = new Float32Array(CONFIG.dts.totalPoints);
        this.dischargeSources = this.initializeDischargeSources();
        this.maxDischargeValue = 1000;
        this.densityWindowSize = 100;
        
        this.alertThreshold = {
            pC: 500,
            countPerMinute: 10
        };
    }

    initializeDischargeSources() {
        const sources = [];
        const numSources = 8;
        
        for (let i = 0; i < numSources; i++) {
            sources.push({
                position: Math.floor(Math.random() * CONFIG.dts.totalPoints),
                baseIntensity: 50 + Math.random() * 200,
                frequency: 0.1 + Math.random() * 0.5,
                type: ['内部放电', '表面放电', '电晕放电', '悬浮电位'][Math.floor(Math.random() * 4)],
                active: Math.random() > 0.3
            });
        }
        
        sources.push({
            position: 3200,
            baseIntensity: 300,
            frequency: 0.8,
            type: '内部放电',
            active: true
        });
        
        sources.push({
            position: 7100,
            baseIntensity: 250,
            frequency: 0.6,
            type: '表面放电',
            active: true
        });
        
        return sources;
    }

    simulateDischarge(currentTime) {
        const newEvents = [];
        
        this.dischargeSources.forEach(source => {
            if (!source.active) return;
            
            const timeFactor = Math.sin(currentTime * source.frequency * 0.001);
            const shouldFire = Math.random() < source.frequency * 0.02;
            
            if (shouldFire) {
                const intensity = source.baseIntensity * (0.8 + Math.random() * 0.4) * Math.abs(timeFactor);
                const positionJitter = (Math.random() - 0.5) * 50;
                const dischargePosition = Math.max(0, Math.min(CONFIG.dts.totalPoints - 1, 
                    Math.floor(source.position + positionJitter)));
                
                const event = {
                    id: Date.now() + Math.random(),
                    timestamp: currentTime,
                    position: dischargePosition,
                    positionKm: (dischargePosition / 1000).toFixed(3),
                    pCValue: Math.round(intensity),
                    type: source.type,
                    sourceId: this.hfctSensors[
                        Math.floor(source.position / (CONFIG.dts.totalPoints / this.hfctSensors.length))
                    ]?.id || 0,
                    phaseAngle: Math.floor(Math.random() * 360),
                    riseTime: 10 + Math.random() * 20,
                    pulseWidth: 50 + Math.random() * 100
                };
                
                newEvents.push(event);
                this.dischargeEvents.push(event);
            }
        });
        
        const maxEvents = 10000;
        if (this.dischargeEvents.length > maxEvents) {
            this.dischargeEvents = this.dischargeEvents.slice(-maxEvents);
        }
        
        this.updateDensityMap();
        
        return newEvents;
    }

    locateDischarge(event) {
        const { position, pCValue } = event;
        
        const sensorReadings = this.hfctSensors.map(sensor => {
            const distance = Math.abs(sensor.position - position);
            const attenuation = Math.exp(-distance / 5000);
            const measuredValue = pCValue * attenuation * (0.95 + Math.random() * 0.1);
            
            return {
                sensorId: sensor.id,
                sensorPosition: sensor.position,
                measuredValue: measuredValue,
                distance: distance
            };
        });
        
        const sortedReadings = [...sensorReadings].sort((a, b) => b.measuredValue - a.measuredValue);
        
        if (sortedReadings.length >= 2) {
            const s1 = sortedReadings[0];
            const s2 = sortedReadings[1];
            const timeDiff = (s1.distance - s2.distance) / 200;
            
            return {
                estimatedPosition: position,
                confidence: Math.min(100, 80 + pCValue / 10),
                timeDiff: timeDiff.toFixed(3),
                dominantSensor: sortedReadings[0].sensorId,
                sensorReadings: sensorReadings
            };
        }
        
        return {
            estimatedPosition: position,
            confidence: 50,
            dominantSensor: 0,
            sensorReadings: sensorReadings
        };
    }

    updateDensityMap() {
        const windowSize = this.densityWindowSize;
        const halfWindow = windowSize / 2;
        const decayFactor = 0.995;
        
        for (let i = 0; i < this.dischargeDensityMap.length; i++) {
            this.dischargeDensityMap[i] *= decayFactor;
        }
        
        const recentEvents = this.dischargeEvents.slice(-500);
        
        recentEvents.forEach(event => {
            const pos = event.position;
            const intensity = Math.min(1, event.pCValue / this.maxDischargeValue);
            
            const start = Math.max(0, pos - halfWindow);
            const end = Math.min(this.dischargeDensityMap.length - 1, pos + halfWindow);
            
            for (let i = start; i <= end; i++) {
                const dist = Math.abs(i - pos);
                const gaussian = Math.exp(-(dist * dist) / (2 * halfWindow * halfWindow));
                this.dischargeDensityMap[i] += intensity * gaussian * 0.1;
                this.dischargeDensityMap[i] = Math.min(1, this.dischargeDensityMap[i]);
            }
        });
    }

    getDensityMap() {
        return this.dischargeDensityMap;
    }

    getDischargeStatistics(timeWindowMs = 60000) {
        const now = Date.now();
        const startTime = now - timeWindowMs;
        
        const recentEvents = this.dischargeEvents.filter(e => e.timestamp >= startTime);
        
        const totalEvents = recentEvents.length;
        const totalCharge = recentEvents.reduce((sum, e) => sum + e.pCValue, 0);
        const maxCharge = recentEvents.length > 0 ? 
            Math.max(...recentEvents.map(e => e.pCValue)) : 0;
        const avgCharge = totalEvents > 0 ? totalCharge / totalEvents : 0;
        
        const typeCounts = {};
        recentEvents.forEach(e => {
            typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
        });
        
        const alertLevel = this.calculateAlertLevel(recentEvents, maxCharge);
        
        return {
            totalEvents,
            totalCharge,
            maxCharge,
            avgCharge,
            typeCounts,
            alertLevel,
            eventsPerMinute: totalEvents / (timeWindowMs / 60000)
        };
    }

    calculateAlertLevel(events, maxCharge) {
        const eventsPerMinute = events.length;
        const avgCharge = events.length > 0 ? 
            events.reduce((sum, e) => sum + e.pCValue, 0) / events.length : 0;
        
        let level = '正常';
        let severity = 0;
        
        if (maxCharge > 1000 || eventsPerMinute > 50) {
            level = '严重';
            severity = 3;
        } else if (maxCharge > 500 || eventsPerMinute > 20) {
            level = '警告';
            severity = 2;
        } else if (maxCharge > 200 || eventsPerMinute > 10) {
            level = '注意';
            severity = 1;
        }
        
        return { level, severity, avgCharge, maxCharge, eventsPerMinute };
    }

    getDischargeHotspots(threshold = 0.3) {
        const hotspots = [];
        const minDistance = 200;
        
        for (let i = 0; i < this.dischargeDensityMap.length; i += 10) {
            if (this.dischargeDensityMap[i] > threshold) {
                let maxDensity = 0;
                let maxPos = i;
                
                for (let j = Math.max(0, i - 50); j < Math.min(this.dischargeDensityMap.length, i + 50); j++) {
                    if (this.dischargeDensityMap[j] > maxDensity) {
                        maxDensity = this.dischargeDensityMap[j];
                        maxPos = j;
                    }
                }
                
                const recentEvents = this.dischargeEvents.filter(e => 
                    Math.abs(e.position - maxPos) < 100
                ).slice(-20);
                
                const existingHotspot = hotspots.find(h => 
                    Math.abs(h.position - maxPos) < minDistance
                );
                
                if (!existingHotspot) {
                    hotspots.push({
                        position: maxPos,
                        positionKm: (maxPos / 1000).toFixed(2),
                        density: maxDensity.toFixed(3),
                        eventCount: recentEvents.length,
                        avgPC: recentEvents.length > 0 ? 
                            (recentEvents.reduce((s, e) => s + e.pCValue, 0) / recentEvents.length).toFixed(0) : 0
                    });
                }
                
                i += 100;
            }
        }
        
        return hotspots.sort((a, b) => parseFloat(b.density) - parseFloat(a.density));
    }

    getEventsInRange(startPosition, endPosition, timeWindowMs = 300000) {
        const startTime = Date.now() - timeWindowMs;
        
        return this.dischargeEvents.filter(e => 
            e.timestamp >= startTime &&
            e.position >= startPosition &&
            e.position <= endPosition
        );
    }

    pruneOldEvents(maxAgeMs = 3600000) {
        const cutoffTime = Date.now() - maxAgeMs;
        this.dischargeEvents = this.dischargeEvents.filter(e => e.timestamp >= cutoffTime);
    }
}
