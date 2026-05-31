class AlertSystem {
    constructor(visualization3D) {
        this.visualization3D = visualization3D;
        this.alerts = [];
        this.lastAlertTime = {};
        this.cooldownPeriod = CONFIG.alert.cooldownPeriod;
        this.wechatWebhook = CONFIG.alert.wechatWebhook;
        this.email = CONFIG.alert.email;
        this.onAlert = null;
    }

    checkAlerts(analysisResults, currentData) {
        const newAlerts = [];
        
        analysisResults.forEach((result, cableId) => {
            const cable = CONFIG.cables[cableId];
            
            result.hotspots.forEach(hotspot => {
                const alertKey = `${cableId}-${hotspot.start}-${hotspot.type}`;
                const now = Date.now();
                
                if (!this.lastAlertTime[alertKey] || 
                    (now - this.lastAlertTime[alertKey]) > this.cooldownPeriod) {
                    
                    const alert = {
                        id: now + Math.random(),
                        cableId,
                        cableName: cable.name,
                        type: hotspot.type,
                        position: (hotspot.start + hotspot.end) / 2,
                        positionKm: ((hotspot.start + hotspot.end) / 2 / 1000).toFixed(2),
                        maxTemp: hotspot.maxTemp.toFixed(1),
                        maxRate: hotspot.maxRate.toFixed(2),
                        length: hotspot.length,
                        timestamp: now,
                        message: this.getAlertMessage(hotspot.type, cable.name, hotspot)
                    };
                    
                    newAlerts.push(alert);
                    this.alerts.unshift(alert);
                    this.lastAlertTime[alertKey] = now;
                    
                    if (this.visualization3D) {
                        this.visualization3D.addAlertMarker(cableId, hotspot.start, hotspot.type);
                    }
                    
                    this.sendAlert(alert);
                }
            });
            
            if (result.maxRate > CONFIG.thresholds.tempIncreaseRate) {
                const alertKey = `${cableId}-rate-alert`;
                const now = Date.now();
                
                if (!this.lastAlertTime[alertKey] || 
                    (now - this.lastAlertTime[alertKey]) > this.cooldownPeriod) {
                    
                    const alert = {
                        id: now + Math.random(),
                        cableId,
                        cableName: cable.name,
                        type: 'rate',
                        position: null,
                        positionKm: null,
                        maxTemp: null,
                        maxRate: result.maxRate.toFixed(2),
                        length: null,
                        timestamp: now,
                        message: `【速率告警】${cable.name} 温升速率过快: ${result.maxRate.toFixed(2)}°C/min`
                    };
                    
                    newAlerts.push(alert);
                    this.alerts.unshift(alert);
                    this.lastAlertTime[alertKey] = now;
                    
                    this.sendAlert(alert);
                }
            }
        });
        
        if (this.alerts.length > 50) {
            this.alerts = this.alerts.slice(0, 50);
        }
        
        if (newAlerts.length > 0 && this.onAlert) {
            this.onAlert(newAlerts);
        }
        
        return newAlerts;
    }

    getAlertMessage(type, cableName, hotspot) {
        switch (type) {
            case 'critical':
                return `【严重告警】${cableName} 温度超过阈值: ${hotspot.maxTemp.toFixed(1)}°C (位置: ${((hotspot.start + hotspot.end) / 2 / 1000).toFixed(2)}km)`;
            case 'rate':
                return `【速率告警】${cableName} 温升速率过快: ${hotspot.maxRate.toFixed(2)}°C/min`;
            case 'warning':
                return `【预警】${cableName} 温度异常: ${hotspot.maxTemp.toFixed(1)}°C (位置: ${((hotspot.start + hotspot.end) / 2 / 1000).toFixed(2)}km)`;
            default:
                return `【告警】${cableName} 温度异常`;
        }
    }

    async sendAlert(alert) {
        console.log('发送告警:', alert.message);
        
        if (this.wechatWebhook) {
            try {
                await this.sendWechatAlert(alert);
            } catch (e) {
                console.error('企业微信告警发送失败:', e);
            }
        }
        
        if (this.email) {
            try {
                await this.sendEmailAlert(alert);
            } catch (e) {
                console.error('邮件告警发送失败:', e);
            }
        }
    }

    async sendWechatAlert(alert) {
        if (!this.wechatWebhook) return;
        
        const message = {
            msgtype: 'markdown',
            markdown: {
                content: `### 海底电缆监测系统告警\n\n` +
                         `**告警类型**: ${this.getTypeText(alert.type)}\n` +
                         `**电缆名称**: ${alert.cableName}\n` +
                         `**告警时间**: ${new Date(alert.timestamp).toLocaleString('zh-CN')}\n` +
                         `${alert.positionKm ? `**告警位置**: ${alert.positionKm} km\n` : ''}` +
                         `${alert.maxTemp ? `**最高温度**: ${alert.maxTemp}°C\n` : ''}` +
                         `${alert.maxRate ? `**温升速率**: ${alert.maxRate}°C/min\n` : ''}` +
                         `${alert.length ? `**影响范围**: ${alert.length}m\n` : ''}` +
                         `\n**告警详情**: ${alert.message}`
            }
        };
        
        await fetch(this.wechatWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
    }

    async sendEmailAlert(alert) {
        const subject = `【电缆监测告警】${alert.cableName} - ${this.getTypeText(alert.type)}`;
        const body = `
            <h3>海底电缆监测系统告警</h3>
            <p><strong>告警类型:</strong> ${this.getTypeText(alert.type)}</p>
            <p><strong>电缆名称:</strong> ${alert.cableName}</p>
            <p><strong>告警时间:</strong> ${new Date(alert.timestamp).toLocaleString('zh-CN')}</p>
            ${alert.positionKm ? `<p><strong>告警位置:</strong> ${alert.positionKm} km</p>` : ''}
            ${alert.maxTemp ? `<p><strong>最高温度:</strong> ${alert.maxTemp}°C</p>` : ''}
            ${alert.maxRate ? `<p><strong>温升速率:</strong> ${alert.maxRate}°C/min</p>` : ''}
            ${alert.length ? `<p><strong>影响范围:</strong> ${alert.length}m</p>` : ''}
            <p><strong>告警详情:</strong> ${alert.message}</p>
        `;
        
        console.log('邮件内容:', { to: this.email, subject, body });
    }

    getTypeText(type) {
        const types = {
            'critical': '严重告警',
            'rate': '速率告警',
            'warning': '预警'
        };
        return types[type] || '未知告警';
    }

    getAlerts() {
        return this.alerts;
    }

    clearAlerts() {
        this.alerts = [];
        this.lastAlertTime = {};
    }

    setWechatWebhook(url) {
        this.wechatWebhook = url;
    }

    setEmail(email) {
        this.email = email;
    }

    setCooldownPeriod(period) {
        this.cooldownPeriod = period;
    }
}
