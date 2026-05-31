const API_BASE = 'http://localhost:8000/api';
const SOCKETIO_URL = 'http://localhost:5000';

export const api = {
    async getPlumeData(contaminant = 'TCE', format = 'json') {
        const response = await fetch(`${API_BASE}/plume_data?contaminant=${contaminant}&format=${format}`);
        if (format === 'binary') {
            return await response.arrayBuffer();
        }
        return await response.json();
    },

    async getPlumeDataCSV(contaminant = 'TCE') {
        const response = await fetch(`${API_BASE}/plume_data/csv?contaminant=${contaminant}`);
        return await response.text();
    },

    async getWells() {
        const response = await fetch(`${API_BASE}/wells`);
        return await response.json();
    },

    async getWellData(wellId, hours = 720) {
        const response = await fetch(`${API_BASE}/wells/${wellId}?hours=${hours}`);
        return await response.json();
    },

    async getCurrentWellData() {
        const response = await fetch(`${API_BASE}/wells/current`);
        return await response.json();
    },

    async getRiskAssessment(threshold = null) {
        const url = threshold ? `${API_BASE}/risk?threshold=${threshold}` : `${API_BASE}/risk`;
        const response = await fetch(url);
        return await response.json();
    },

    async forecast(request) {
        const response = await fetch(`${API_BASE}/forecast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return await response.json();
    },

    async optimizeMonitoringNetwork(numNewWells = 5, contaminant = 'TCE') {
        const response = await fetch(`${API_BASE}/optimize?num_new_wells=${numNewWells}&contaminant=${contaminant}`);
        return await response.json();
    },

    async getTimeSeries(startDays = 30, endDays = 0, intervalHours = 24, contaminant = 'TCE') {
        const response = await fetch(`${API_BASE}/timeseries?start_days=${startDays}&end_days=${endDays}&interval_hours=${intervalHours}&contaminant=${contaminant}`);
        return await response.json();
    },

    async postSensorData(data) {
        const response = await fetch(`${API_BASE}/sensor_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    },

    async getHealth() {
        const response = await fetch('http://localhost:8000/health');
        return await response.json();
    },

    async getInjectionWells() {
        const response = await fetch(`${API_BASE}/injection_wells`);
        return await response.json();
    },

    async addInjectionWell(well) {
        const response = await fetch(`${API_BASE}/injection_wells`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(well)
        });
        return await response.json();
    },

    async deleteInjectionWell(wellId) {
        const response = await fetch(`${API_BASE}/injection_wells/${wellId}`, {
            method: 'DELETE'
        });
        return await response.json();
    },

    async clearInjectionWells() {
        const response = await fetch(`${API_BASE}/injection_wells/clear`, {
            method: 'POST'
        });
        return await response.json();
    },

    async simulateRemediation(request) {
        const response = await fetch(`${API_BASE}/remediation/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        return await response.json();
    },

    async getReagentDistribution(days = 7) {
        const response = await fetch(`${API_BASE}/remediation/reagent_distribution?days=${days}`);
        return await response.json();
    },

    async enkfAssimilate(config = null) {
        const response = await fetch(`${API_BASE}/enkf/assimilate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: config ? JSON.stringify(config) : '{}'
        });
        return await response.json();
    },

    async getEnkfParameters() {
        const response = await fetch(`${API_BASE}/enkf/parameters`);
        return await response.json();
    },

    async resetEnkf() {
        const response = await fetch(`${API_BASE}/enkf/reset`, {
            method: 'POST'
        });
        return await response.json();
    }
};

export const createSocket = () => {
    return io(SOCKETIO_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
};

export const colormap = {
    viridis: (value, min, max) => {
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
        const r = Math.round(255 * (0.28 + 0.8 * Math.sin((normalized - 0.5) * Math.PI * 1.2)));
        const g = Math.round(255 * (normalized < 0.5 ? normalized * 2 : 1 - (normalized - 0.5) * 2));
        const b = Math.round(255 * (0.9 - 0.8 * normalized));
        return `rgb(${r}, ${g}, ${b})`;
    },
    
    plasma: (value, min, max) => {
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
        const r = Math.round(255 * (0.05 + 0.95 * Math.pow(normalized, 0.5)));
        const g = Math.round(255 * Math.pow(normalized, 2));
        const b = Math.round(255 * Math.pow(1 - normalized, 0.5));
        return `rgb(${r}, ${g}, ${b})`;
    },
    
    getColor: (value, min, max) => {
        return colormap.viridis(value, min, max);
    },
    
    getColorArray: (value, min, max) => {
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
        const r = (0.28 + 0.8 * Math.sin((normalized - 0.5) * Math.PI * 1.2));
        const g = (normalized < 0.5 ? normalized * 2 : 1 - (normalized - 0.5) * 2);
        const b = (0.9 - 0.8 * normalized);
        return [r, g, b, 0.8];
    }
};
