import { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import './LatencyChart.css';

const COLORS = {
  mouse_click: '#e94560',
  mouse_move: '#ff6b6b',
  key_press: '#4ade80',
  key_release: '#22c55e'
};

const MAX_CHART_ITEMS = 50;

function useDebounce(callback, delay) {
  const timeoutRef = useRef(null);
  
  return (...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  };
}

function LatencyChart() {
  const [data, setData] = useState([]);
  const [avgLatency, setAvgLatency] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef(null);
  const localEventCache = useRef([]);
  const lastFetchTime = useRef(0);
  const MIN_FETCH_INTERVAL = 8000;

  const processStats = useCallback((stats) => {
    const chartData = stats.events
      .slice(-MAX_CHART_ITEMS)
      .map((event, index) => ({
        name: `${index + 1}`,
        latency: event.latency,
        type: event.type,
        time: new Date(event.timestamp).toLocaleTimeString()
      }));

    setData(chartData);
    setAvgLatency(Math.round(stats.avgLatency));
    setEventCount(stats.eventCount);
    setLastRefresh(new Date());
  }, []);

  const fetchStats = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchTime.current < MIN_FETCH_INTERVAL) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/events/stats', {
        signal: abortControllerRef.current.signal,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const stats = await response.json();
      processStats(stats);
      lastFetchTime.current = now;

      if (stats.fromCache) {
        console.log('Stats served from memory cache');
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to fetch stats:', error);
      }
    }
    setIsLoading(false);
  }, [processStats]);

  const debouncedFetch = useDebounce(() => fetchStats(true), 300);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      fetchStats(false);
    }, 10000);
    
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchStats]);

  const CustomTooltip = useMemo(() => {
    return ({ active, payload }) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
          <div className="custom-tooltip">
            <p><strong>Latency:</strong> {data.latency}ms</p>
            <p><strong>Type:</strong> {data.type}</p>
            <p><strong>Time:</strong> {data.time}</p>
          </div>
        );
      }
      return null;
    };
  }, []);

  const chartKey = useMemo(() => {
    return data.length > 0 ? data[data.length - 1]?.name : 'empty';
  }, [data]);

  return (
    <div className="latency-chart-container">
      <div className="chart-header">
        <h2>Event Latency (Last 10 seconds)</h2>
        <div className="refresh-info">
          {isLoading ? (
            <span className="loading">Refreshing...</span>
          ) : (
            <span>Last refresh: {lastRefresh?.toLocaleTimeString() || 'N/A'}</span>
          )}
          <button 
            className="refresh-btn"
            onClick={debouncedFetch}
            disabled={isLoading}
          >
            ↻
          </button>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{eventCount}</div>
          <div className="stat-label">Events</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{avgLatency}</div>
          <div className="stat-label">Avg Latency (ms)</div>
        </div>
      </div>

      <div className="chart-wrapper">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart 
              data={data} 
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              key={chartKey}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="name" 
                stroke="#64748b"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                stroke="#64748b"
                label={{ 
                  value: 'Latency (ms)', 
                  angle: -90, 
                  position: 'insideLeft',
                  fill: '#94a3b8'
                }}
              />
              <Tooltip 
                content={<CustomTooltip />} 
                isAnimationActive={false}
              />
              <Legend />
              <Bar 
                dataKey="latency" 
                name="Latency (ms)" 
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                maxBarSize={30}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[entry.type] || '#64748b'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="no-data">
            <p>No events recorded yet.</p>
            <p className="hint">Click on the remote desktop or press keys to generate events.</p>
          </div>
        )}
      </div>

      <div className="legend-info">
        <h4>Event Types</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color" style={{ background: COLORS.mouse_click }}></span>
            <span>Mouse Click</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: COLORS.key_press }}></span>
            <span>Key Press</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: COLORS.key_release }}></span>
            <span>Key Release</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LatencyChart;
