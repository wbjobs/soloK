import { useRef, useState, useCallback } from 'react';
import './RemoteDesktop.css';

function RemoteDesktop({ onEvent }) {
  const desktopRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [lastEvent, setLastEvent] = useState(null);

  const handleMouseMove = useCallback((e) => {
    const rect = desktopRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });
  }, []);

  const handleClick = useCallback((e) => {
    const rect = desktopRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const eventData = {
      x: Math.round(x),
      y: Math.round(y),
      button: e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle',
      screenWidth: rect.width,
      screenHeight: rect.height
    };
    
    onEvent('mouse_click', eventData);
    setLastEvent({ type: 'mouse_click', data: eventData, time: new Date().toLocaleTimeString() });
  }, [onEvent]);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleKeyDown = useCallback((e) => {
    e.preventDefault();
    const eventData = {
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    };
    
    onEvent('key_press', eventData);
    setLastEvent({ type: 'key_press', data: eventData, time: new Date().toLocaleTimeString() });
  }, [onEvent]);

  const handleKeyUp = useCallback((e) => {
    const eventData = {
      key: e.key,
      code: e.code
    };
    onEvent('key_release', eventData);
  }, [onEvent]);

  return (
    <div className="remote-desktop-container">
      <h2>Remote Desktop Simulation</h2>
      <div className="desktop-wrapper">
        <div
          ref={desktopRef}
          className="desktop-screen"
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          tabIndex={0}
        >
          <div className="desktop-content">
            <div className="desktop-background">
              <div className="desktop-icon folder">
                <div className="icon-image">📁</div>
                <span>Documents</span>
              </div>
              <div className="desktop-icon folder">
                <div className="icon-image">📁</div>
                <span>Downloads</span>
              </div>
              <div className="desktop-icon file">
                <div className="icon-image">📄</div>
                <span>readme.txt</span>
              </div>
              <div className="desktop-icon app">
                <div className="icon-image">🖥️</div>
                <span>Terminal</span>
              </div>
            </div>
            <div className="taskbar">
              <div className="start-button">⊞</div>
              <div className="taskbar-items"></div>
              <div className="system-tray">
                <span>🔊</span>
                <span>📶</span>
                <span className="clock">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
          
          <div 
            className="cursor-indicator"
            style={{ 
              left: mousePos.x + 'px', 
              top: mousePos.y + 'px' 
            }}
          >
            👆
          </div>
        </div>
        
        <div className="desktop-info">
          <div className="info-item">
            <span>Position:</span>
            <code>({Math.round(mousePos.x)}, {Math.round(mousePos.y)})</code>
          </div>
          <div className="info-hint">
            Click anywhere to send mouse event • Press keys to send keyboard events
          </div>
        </div>
      </div>

      {lastEvent && (
        <div className="last-event">
          <h4>Last Event Sent</h4>
          <div className="event-details">
            <div><strong>Type:</strong> {lastEvent.type}</div>
            <div><strong>Data:</strong> {JSON.stringify(lastEvent.data)}</div>
            <div><strong>Time:</strong> {lastEvent.time}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RemoteDesktop;
