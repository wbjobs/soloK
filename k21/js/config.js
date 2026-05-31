const CONFIG = {
    cables: [
        { id: 0, name: '电缆A - 主线路', color: '#ff6b6b', baseTemp: 28 },
        { id: 1, name: '电缆B - 备用线路', color: '#4ecdc4', baseTemp: 26 },
        { id: 2, name: '电缆C - 支线1', color: '#45b7d1', baseTemp: 25 },
        { id: 3, name: '电缆D - 支线2', color: '#96ceb4', baseTemp: 27 }
    ],
    
    dts: {
        scanInterval: 5000,
        spatialResolution: 1,
        cableLength: 10000,
        totalPoints: 10000
    },
    
    thresholds: {
        maxTemperature: 90,
        tempIncreaseRate: 5,
        ambientTempDiff: 20,
        ambientTemperature: 25
    },
    
    playback: {
        historyHours: 48,
        defaultSpeed: 1,
        speeds: [0.5, 1, 2, 5, 10, 30, 60]
    },
    
    iec60287: {
        R: 0.0001,
        Wd: 10,
        T1: 0.5,
        T2: 0.3,
        T3: 0.8,
        T4: 1.2,
        n: 1,
        lambda1: 0.1,
        lambda2: 0.05
    },
    
    alert: {
        wechatWebhook: '',
        email: '',
        cooldownPeriod: 60000
    },
    
    colors: {
        temperature: [
            { temp: 20, color: [0, 100, 255] },
            { temp: 40, color: [0, 200, 200] },
            { temp: 60, color: [100, 255, 100] },
            { temp: 80, color: [255, 200, 0] },
            { temp: 100, color: [255, 50, 50] }
        ],
        rate: [
            { rate: -2, color: [0, 100, 255] },
            { rate: 0, color: [100, 200, 100] },
            { rate: 2, color: [255, 200, 0] },
            { rate: 5, color: [255, 50, 50] }
        ]
    }
};

function getTemperatureColor(temp) {
    const colors = CONFIG.colors.temperature;
    if (temp <= colors[0].temp) return colors[0].color;
    if (temp >= colors[colors.length - 1].temp) return colors[colors.length - 1].color;
    
    for (let i = 0; i < colors.length - 1; i++) {
        if (temp >= colors[i].temp && temp <= colors[i + 1].temp) {
            const t = (temp - colors[i].temp) / (colors[i + 1].temp - colors[i].temp);
            return [
                Math.round(colors[i].color[0] + t * (colors[i + 1].color[0] - colors[i].color[0])),
                Math.round(colors[i].color[1] + t * (colors[i + 1].color[1] - colors[i].color[1])),
                Math.round(colors[i].color[2] + t * (colors[i + 1].color[2] - colors[i].color[2]))
            ];
        }
    }
    return colors[0].color;
}

function getRateColor(rate) {
    const colors = CONFIG.colors.rate;
    if (rate <= colors[0].rate) return colors[0].color;
    if (rate >= colors[colors.length - 1].rate) return colors[colors.length - 1].color;
    
    for (let i = 0; i < colors.length - 1; i++) {
        if (rate >= colors[i].rate && rate <= colors[i + 1].rate) {
            const t = (rate - colors[i].rate) / (colors[i + 1].rate - colors[i].rate);
            return [
                Math.round(colors[i].color[0] + t * (colors[i + 1].color[0] - colors[i].color[0])),
                Math.round(colors[i].color[1] + t * (colors[i + 1].color[1] - colors[i].color[1])),
                Math.round(colors[i].color[2] + t * (colors[i + 1].color[2] - colors[i].color[2]))
            ];
        }
    }
    return colors[0].color;
}
