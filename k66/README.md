# Remote Desktop Simulation System

A distributed remote desktop system with React frontend, Node.js backend, and Python edge service for simulating mouse and keyboard operations.

## Architecture

```
┌─────────────────┐     WebRTC/Socket.io     ┌─────────────────┐     HTTP     ┌─────────────────┐
│   React Frontend│ ────────────────────────> │  Node.js Backend│ ───────────> │ Python Service  │
│                 │                           │  (WebRTC + MongoDB) │            │  (pyautogui)    │
│ - Desktop UI    │  Events with timestamps   │  - Event logging  │  Forward    │  - Mouse click  │
│ - Event capture │ <───────────────────────  │  - Latency stats  │  Events     │  - Keyboard ops │
│ - Latency chart │                           │                   │             │                 │
└─────────────────┘                           └─────────────────┘              └─────────────────┘
```

## Components

### 1. Frontend (React)
- **Location**: `/frontend`
- **Features**:
  - Remote desktop simulation UI
  - Mouse click event capture
  - Keyboard event capture
  - Real-time latency bar chart (refreshes every 10 seconds)
  - All events carry timestamps

### 2. Backend (Node.js)
- **Location**: `/backend`
- **Features**:
  - WebRTC signaling server
  - Socket.io for real-time communication
  - MongoDB event storage
  - REST API for latency statistics
  - Event forwarding to Python service

### 3. Python Service
- **Location**: `/python-service`
- **Features**:
  - Flask API server
  - pyautogui for mouse/keyboard simulation
  - Screen coordinate scaling
  - Event confirmation callback

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB
- (Optional) Docker & Docker Compose

### Local Development

#### Windows (Using start.bat)
```bash
start.bat
```

#### Manual Setup

**1. Start MongoDB**
```bash
mongod --dbpath="./mongodb-data"
```

**2. Start Backend**
```bash
cd backend
npm install
npm run dev
```

**3. Start Frontend**
```bash
cd frontend
npm install
npm start
```

**4. Start Python Service**
```bash
cd python-service
pip install -r requirements.txt
python main.py
```

### Docker Compose
```bash
docker-compose up -d
```

## API Endpoints

### Backend
- `GET /api/events` - Get recent events
- `GET /api/events/stats` - Get latency statistics (last 10 seconds)
- `POST /api/events/confirm` - Confirm event processing

### Python Service
- `POST /event` - Receive and process events
- `GET /health` - Health check
- `GET /screenshot` - Take screenshot

## Project Structure

```
k66/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── RemoteDesktop.js      # Desktop simulation
│   │   │   └── LatencyChart.js       # Latency bar chart
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
│
├── backend/                  # Node.js server
│   ├── src/
│   │   ├── models/
│   │   │   └── Event.js             # MongoDB schema
│   │   └── server.js               # Main server
│   └── package.json
│
├── python-service/           # Python edge service
│   ├── main.py                      # Flask server + pyautogui
│   ├── requirements.txt
│   └── Dockerfile
│
├── docker-compose.yml
├── start.bat
└── README.md
```

## Event Data Structure

```javascript
{
  type: 'mouse_click' | 'key_press' | 'key_release',
  data: { /* event specific data */ },
  frontendTimestamp: 1234567890123,
  backendTimestamp: 1234567890150,
  pythonTimestamp: 1234567890180,
  latency: {
    frontendToBackend: 27,
    backendToPython: 30,
    total: 57
  }
}
```

## Notes

- The Python service requires a display environment for pyautogui
- For Docker deployment, ensure X11 forwarding is configured
- Latency chart refreshes every 10 seconds with data from the last 10 seconds
