const EdgeNode = require('../models/EdgeNode');
const axios = require('axios');

class EdgeNodeManager {
  constructor() {
    this.nodes = new Map();
    this.heartbeatInterval = null;
    this.latencyProbeInterval = null;
    this.startMonitoring();
  }

  async registerNode(nodeData) {
    const { nodeId, name, url, location, system } = nodeData;
    
    let node = await EdgeNode.findOne({ nodeId });
    
    if (!node) {
      node = new EdgeNode({
        nodeId,
        name: name || nodeId,
        url,
        location: location || 'unknown',
        system: system || 'unknown',
        status: 'online',
        lastHeartbeat: new Date()
      });
    } else {
      node.name = name || node.name;
      node.url = url;
      node.status = 'online';
      node.lastHeartbeat = new Date();
      if (location) node.location = location;
      if (system) node.system = system;
    }
    
    await node.save();
    this.nodes.set(nodeId, node.toObject());
    
    console.log(`Edge node registered: ${nodeId} at ${url}`);
    return node;
  }

  async updateHeartbeat(nodeId, healthData = {}) {
    const node = await EdgeNode.findOne({ nodeId });
    
    if (!node) {
      return null;
    }
    
    node.lastHeartbeat = new Date();
    node.status = 'online';
    
    if (healthData.screen_size) {
      node.screenSize = healthData.screen_size;
    }
    if (healthData.input_method) {
      node.inputMethod = healthData.input_method;
    }
    if (healthData.accessibility_permission !== undefined) {
      node.set('metadata.accessibilityPermission', String(healthData.accessibility_permission));
    }
    
    await node.save();
    this.nodes.set(nodeId, node.toObject());
    
    return node;
  }

  async unregisterNode(nodeId) {
    await EdgeNode.findOneAndUpdate(
      { nodeId },
      { status: 'offline' }
    );
    this.nodes.delete(nodeId);
    console.log(`Edge node unregistered: ${nodeId}`);
  }

  async probeLatency(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    const startTime = Date.now();
    try {
      const response = await axios.get(`${node.url}/health`, {
        timeout: 5000
      });
      const latency = Date.now() - startTime;
      
      await this.updateLatency(nodeId, latency);
      
      if (response.data.screen_size) {
        await EdgeNode.findOneAndUpdate(
          { nodeId },
          {
            screenSize: response.data.screen_size,
            inputMethod: response.data.input_method,
            system: response.data.system
          }
        );
      }
      
      return latency;
    } catch (error) {
      await this.updateNodeStatus(nodeId, 'degraded');
      console.warn(`Failed to probe node ${nodeId}:`, error.message);
      return null;
    }
  }

  async updateLatency(nodeId, latency) {
    const node = await EdgeNode.findOne({ nodeId });
    if (!node) return;
    
    node.latency.current = latency;
    node.latency.history.push(latency);
    
    if (node.latency.history.length > 20) {
      node.latency.history.shift();
    }
    
    node.latency.average = Math.round(
      node.latency.history.reduce((a, b) => a + b, 0) / node.latency.history.length
    );
    
    await node.save();
    this.nodes.set(nodeId, node.toObject());
  }

  async updateNodeStatus(nodeId, status) {
    await EdgeNode.findOneAndUpdate(
      { nodeId },
      { status }
    );
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = status;
      this.nodes.set(nodeId, node);
    }
  }

  async getOptimalNode() {
    const onlineNodes = await EdgeNode.find({ status: 'online' })
      .sort({ 'latency.average': 1 })
      .limit(5)
      .lean();
    
    if (onlineNodes.length === 0) {
      return null;
    }
    
    const scoredNodes = onlineNodes.map(node => {
      const latencyScore = 1000 / (node.latency.average + 1);
      const weightScore = node.weight * 100;
      const errorPenalty = node.errorCount * 10;
      const score = latencyScore + weightScore - errorPenalty;
      return { ...node, score };
    });
    
    scoredNodes.sort((a, b) => b.score - a.score);
    
    return scoredNodes[0];
  }

  async getAllNodes() {
    return await EdgeNode.find().sort({ status: -1, 'latency.average': 1 }).lean();
  }

  async getOnlineNodes() {
    return await EdgeNode.find({ status: 'online' }).sort({ 'latency.average': 1 }).lean();
  }

  startMonitoring() {
    this.heartbeatInterval = setInterval(async () => {
      const timeoutThreshold = Date.now() - 30000;
      const offlineNodes = await EdgeNode.find({
        status: { $in: ['online', 'degraded'] },
        lastHeartbeat: { $lt: new Date(timeoutThreshold) }
      });
      
      for (const node of offlineNodes) {
        await this.updateNodeStatus(node.nodeId, 'offline');
        console.log(`Node ${node.nodeId} marked as offline (timeout)`);
      }
    }, 10000);

    this.latencyProbeInterval = setInterval(async () => {
      const onlineNodes = await EdgeNode.find({ status: 'online' });
      for (const node of onlineNodes) {
        this.probeLatency(node.nodeId);
      }
    }, 15000);
  }

  stopMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.latencyProbeInterval) {
      clearInterval(this.latencyProbeInterval);
    }
  }

  async incrementEventCount(nodeId) {
    await EdgeNode.findOneAndUpdate(
      { nodeId },
      { $inc: { eventCount: 1 } }
    );
  }

  async incrementErrorCount(nodeId) {
    await EdgeNode.findOneAndUpdate(
      { nodeId },
      { $inc: { errorCount: 1 } }
    );
  }
}

const edgeNodeManager = new EdgeNodeManager();

module.exports = edgeNodeManager;
