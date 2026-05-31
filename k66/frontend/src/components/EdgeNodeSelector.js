import { useState, useEffect } from 'react';
import './EdgeNodeSelector.css';

function EdgeNodeSelector({ selectedNode, onSelectNode }) {
  const [nodes, setNodes] = useState([]);
  const [optimalNode, setOptimalNode] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNodes = async () => {
    try {
      const [nodesRes, optimalRes] = await Promise.all([
        fetch('http://localhost:3001/api/nodes'),
        fetch('http://localhost:3001/api/nodes/optimal')
      ]);
      
      const nodesData = await nodesRes.json();
      const optimalData = await optimalRes.json();
      
      setNodes(nodesData.nodes || []);
      setOptimalNode(optimalData.node);
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return '#4ade80';
      case 'degraded': return '#fbbf24';
      default: return '#64748b';
    }
  };

  const formatLatency = (latency) => {
    if (!latency) return '-';
    if (latency < 100) return `${latency}ms 🟢`;
    if (latency < 300) return `${latency}ms 🟡`;
    return `${latency}ms 🔴`;
  };

  if (isLoading) {
    return (
      <div className="node-selector loading">
        <span>Loading nodes...</span>
      </div>
    );
  }

  return (
    <div className="node-selector">
      <h3>Edge Nodes</h3>
      
      {optimalNode && (
        <div className="optimal-node-badge">
          <span className="star">⭐</span>
          <span>Optimal: {optimalNode.name} ({formatLatency(optimalNode.latency?.average)})</span>
        </div>
      )}

      <div className="node-list">
        {nodes.length === 0 ? (
          <div className="no-nodes">
            <p>No edge nodes registered</p>
            <p className="hint">Start a Python service to register a node</p>
          </div>
        ) : (
          nodes.map(node => (
            <div 
              key={node.nodeId}
              className={`node-card ${selectedNode?.nodeId === node.nodeId ? 'selected' : ''} ${node.status}`}
              onClick={() => node.status === 'online' && onSelectNode(node)}
            >
              <div className="node-header">
                <span className="node-name">{node.name}</span>
                <span 
                  className="node-status"
                  style={{ background: getStatusColor(node.status) }}
                ></span>
              </div>
              
              <div className="node-details">
                <div className="detail-row">
                  <span>Location:</span>
                  <span>{node.location}</span>
                </div>
                <div className="detail-row">
                  <span>System:</span>
                  <span>{node.system}</span>
                </div>
                <div className="detail-row">
                  <span>Latency:</span>
                  <span>{formatLatency(node.latency?.average)}</span>
                </div>
                <div className="detail-row">
                  <span>Events:</span>
                  <span>{node.eventCount || 0}</span>
                </div>
              </div>

              {node.nodeId === optimalNode?.nodeId && (
                <div className="optimal-badge">BEST</div>
              )}
            </div>
          ))
        )}
      </div>

      <button 
        className="refresh-btn"
        onClick={fetchNodes}
      >
        ↻ Refresh
      </button>
    </div>
  );
}

export default EdgeNodeSelector;
