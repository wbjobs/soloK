class ApiClient {
  constructor(baseUrl = 'http://localhost:3000/api') {
    this.baseUrl = baseUrl;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    if (mergedOptions.body) {
      mergedOptions.body = JSON.stringify(mergedOptions.body);
    }
    
    try {
      const response = await fetch(url, mergedOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }
  
  async getPresets() {
    return this.request('/presets', { method: 'GET' });
  }
  
  async getPreset(id) {
    return this.request(`/presets/${id}`, { method: 'GET' });
  }
  
  async savePreset(name, params) {
    return this.request('/presets', {
      method: 'POST',
      body: { name, params }
    });
  }
  
  async updatePreset(id, name, params) {
    return this.request(`/presets/${id}`, {
      method: 'PUT',
      body: { name, params }
    });
  }
  
  async deletePreset(id) {
    return this.request(`/presets/${id}`, { method: 'DELETE' });
  }
  
  async getCameraPaths() {
    return this.request('/camera-paths', { method: 'GET' });
  }
  
  async getCameraPath(id) {
    return this.request(`/camera-paths/${id}`, { method: 'GET' });
  }
  
  async saveCameraPath(name, frames, duration) {
    return this.request('/camera-paths', {
      method: 'POST',
      body: { name, frames, duration }
    });
  }
  
  async deleteCameraPath(id) {
    return this.request(`/camera-paths/${id}`, { method: 'DELETE' });
  }
  
  async checkHealth() {
    try {
      await this.request('/health', { method: 'GET' });
      return true;
    } catch {
      return false;
    }
  }
}

const apiClient = new ApiClient();
export default apiClient;
