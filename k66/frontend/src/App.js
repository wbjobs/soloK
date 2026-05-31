import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import RemoteDesktop from './components/RemoteDesktop';
import LatencyChart from './components/LatencyChart';
import EdgeNodeSelector from './components/EdgeNodeSelector';
import MacroPanel from './components/MacroPanel';
import SecurityConfirmation from './components/SecurityConfirmation';
import ReliableEventSender from './services/ReliableEventSender';
import './App.css';

const SOCKET_URL = 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [eventCount, setEventCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [bufferCount, setBufferCount] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState(null);
  const [activeTab, setActiveTab] = useState('latency');
  
  const eventSenderRef = useRef(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      console.log('Connected to backend');
    });

    newSocket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (err) => {
      console.warn('Connection error:', err.message);
    });

    eventSenderRef.current = new ReliableEventSender(newSocket, {
      maxRetries: 5,
      retryDelay: 1000,
      onAck: (data) => {
        console.log('Event acknowledged:', data);
      }
    });

    setSocket(newSocket);

    const statsInterval = setInterval(() => {
      if (eventSenderRef.current && eventSenderRef.current.getStats) {
        const stats = eventSenderRef.current.getStats();
        setPendingCount(stats.pendingCount);
        setBufferCount(stats.bufferCount);
      }
    }, 1000);

    const recordingInterval = setInterval(() => {
      if (isRecording && socket) {
        fetch(`http://localhost:3001/api/macros/record/status/${sessionId}`)
          .then(res => res.json())
          .then(data => setRecordingStatus(data))
          .catch(() => {});
      }
    }, 500);

    return () => {
      clearInterval(statsInterval);
      clearInterval(recordingInterval);
      if (eventSenderRef.current) {
        eventSenderRef.current.destroy();
      }
      newSocket.close();
    };
  }, [isRecording, sessionId, socket]);

  const sendEvent = useCallback((type, data) => {
    if (eventSenderRef.current && socket?.connected) {
      eventSenderRef.current.send(type, data, sessionId);
      setEventCount(prev => prev + 1);
    }
  }, [socket, sessionId]);

  const handleStartRecording = async () => {
    try {
      await fetch('http://localhost:3001/api/macros/record/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          userId: 'user_' + sessionId,
          name: `Recording ${new Date().toLocaleString()}`
        })
      });
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  };

  const handleStopRecording = async (name, description, tags) => {
    try {
      const response = await fetch('http://localhost:3001/api/macros/record/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          description,
          tags
        })
      });
      const data = await response.json();
      setIsRecording(false);
      setRecordingStatus(null);
      return data.macro;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  };

  const handleCancelRecording = async () => {
    try {
      await fetch('http://localhost:3001/api/macros/record/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      setIsRecording(false);
      setRecordingStatus(null);
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }
  };

  const handleSelectNode = (node) => {
    setSelectedNode(node);
    console.log('Selected node:', node.name);
  };

  return (
    <div className="app">
      <SecurityConfirmation socket={socket} />
      
      <header className="app-header">
        <h1>Remote Desktop Simulation</h1>
        <div className="status-bar">
          <div className={`status-indicator ${connectionStatus}`}>
            <span className="status-dot"></span>
            {connectionStatus}
          </div>
          <div className="event-count">
            Events Sent: {eventCount}
          </div>
          <div className="queue-stats">
            {pendingCount > 0 && <span className="pending">Pending: {pendingCount}</span>}
            {bufferCount > 0 && <span className="buffer">Buffered: {bufferCount}</span>}
          </div>
          {selectedNode && (
            <div className="selected-node">
              📍 {selectedNode.name}
            </div>
          )}
          <div className="session-id">
            Session: {sessionId.slice(0, 12)}...
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="desktop-section">
          <RemoteDesktop onEvent={sendEvent} />
        </div>
        
        <div className="sidebar-section">
          <div className="sidebar-tabs">
            <button 
              className={`tab-btn ${activeTab === 'latency' ? 'active' : ''}`}
              onClick={() => setActiveTab('latency')}
            >
              📊 Latency
            </button>
            <button 
              className={`tab-btn ${activeTab === 'nodes' ? 'active' : ''}`}
              onClick={() => setActiveTab('nodes')}
            >
              🖥️ Nodes
            </button>
            <button 
              className={`tab-btn ${activeTab === 'macros' ? 'active' : ''}`}
              onClick={() => setActiveTab('macros')}
            >
              🎬 Macros
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'latency' && (
              <div className="chart-section">
                <LatencyChart />
              </div>
            )}
            
            {activeTab === 'nodes' && (
              <EdgeNodeSelector 
                selectedNode={selectedNode}
                onSelectNode={handleSelectNode}
              />
            )}
            
            {activeTab === 'macros' && (
              <MacroPanel
                sessionId={sessionId}
                isRecording={isRecording}
                recordingStatus={recordingStatus}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                onCancelRecording={handleCancelRecording}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
