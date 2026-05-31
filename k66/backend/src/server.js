require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const Event = require('./models/Event');
const axios = require('axios');
const edgeNodeManager = require('./services/EdgeNodeManager');
const macroManager = require('./services/MacroManager');
const securityManager = require('./services/SecurityManager');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const sessions = new Map();
const BATCH_SIZE = 50;
const BATCH_INTERVAL = 1000;
const STATS_CACHE_TTL = 1000;

class EventBuffer {
  constructor() {
    this.events = [];
    this.buffer = [];
    this.statsCache = null;
    this.statsCacheTime = 0;
    this.batchTimer = null;
    this.startBatchProcessing();
  }

  addToBuffer(event) {
    this.buffer.push(event);
    this.events.push(event);
    
    const maxAge = Date.now() - 15000;
    this.events = this.events.filter(e => e.backendTimestamp > maxAge);
    
    this.statsCache = null;
    return true;
  }

  async flushBuffer() {
    if (this.buffer.length === 0) return;
    
    const batch = this.buffer.splice(0, BATCH_SIZE);
    try {
      await Event.insertMany(batch, { ordered: false });
    } catch (error) {
      console.warn('Batch insert partial failure:', error.writeErrors?.length || 0, 'errors');
    }
  }

  startBatchProcessing() {
    this.batchTimer = setInterval(() => {
      this.flushBuffer();
    }, BATCH_INTERVAL);
  }

  getStats() {
    const now = Date.now();
    if (this.statsCache && (now - this.statsCacheTime) < STATS_CACHE_TTL) {
      return this.statsCache;
    }

    const tenSecondsAgo = now - 10000;
    const recentEvents = this.events.filter(e => e.backendTimestamp >= tenSecondsAgo);
    
    const stats = {
      events: recentEvents.map((e, i) => ({
        type: e.type,
        latency: e.latency?.total || e.latency?.frontendToBackend || 0,
        timestamp: e.backendTimestamp
      })),
      avgLatency: recentEvents.length > 0
        ? recentEvents.reduce((sum, e) => sum + (e.latency?.total || e.latency?.frontendToBackend || 0), 0) / recentEvents.length
        : 0,
      eventCount: recentEvents.length,
      fromCache: true
    };

    this.statsCache = stats;
    this.statsCacheTime = now;
    return stats;
  }

  async flushAll() {
    await this.flushBuffer();
  }

  destroy() {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
  }
}

const eventBuffer = new EventBuffer();

class PythonEventQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxRetries = 3;
    this.processTimer = null;
    this.startProcessing();
  }

  push(event) {
    this.queue.push({ ...event, retries: 0 });
  }

  async processBatch() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const batch = this.queue.splice(0, 20);
    
    const optimalNode = await edgeNodeManager.getOptimalNode();
    const targetUrl = optimalNode ? optimalNode.url : process.env.PYTHON_SERVICE_URL;
    
    if (optimalNode) {
      console.log(`Routing event to optimal node: ${optimalNode.nodeId} (latency: ${optimalNode.latency.average}ms)`);
    }
    
    for (const event of batch) {
      try {
        await axios.post(`${targetUrl}/event`, {
          eventId: event.eventId,
          type: event.type,
          data: event.data,
          backendTimestamp: event.backendTimestamp
        }, { timeout: 3000 });
        
        if (optimalNode) {
          await edgeNodeManager.incrementEventCount(optimalNode.nodeId);
        }
      } catch (error) {
        if (event.retries < this.maxRetries) {
          event.retries++;
          this.queue.push(event);
        } else {
          console.warn(`Event ${event.eventId} failed after max retries`);
          if (optimalNode) {
            await edgeNodeManager.incrementErrorCount(optimalNode.nodeId);
          }
        }
      }
    }
    
    this.processing = false;
  }

  startProcessing() {
    this.processTimer = setInterval(() => {
      this.processBatch();
    }, 500);
  }

  destroy() {
    if (this.processTimer) {
      clearInterval(this.processTimer);
    }
  }
}

const pythonEventQueue = new PythonEventQueue();

const processedSequenceIds = new Map();
const SEQUENCE_CACHE_SIZE = 1000;

function isDuplicateEvent(sequenceId) {
  if (!sequenceId) return false;
  if (processedSequenceIds.has(sequenceId)) {
    return true;
  }
  if (processedSequenceIds.size >= SEQUENCE_CACHE_SIZE) {
    const oldestKey = processedSequenceIds.keys().next().value;
    processedSequenceIds.delete(oldestKey);
  }
  processedSequenceIds.set(sequenceId, Date.now());
  return false;
}

const pendingSecurityConfirmations = new Map();

app.get('/api/events/stats', async (req, res) => {
  try {
    const stats = eventBuffer.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const events = await Event.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events/confirm', async (req, res) => {
  try {
    const { eventId, pythonTimestamp } = req.body;
    
    const eventIndex = eventBuffer.events.findIndex(e => e._id?.toString() === eventId);
    if (eventIndex !== -1) {
      const event = eventBuffer.events[eventIndex];
      event.pythonTimestamp = pythonTimestamp;
      if (!event.latency) event.latency = {};
      event.latency.backendToPython = pythonTimestamp - event.backendTimestamp;
      event.latency.total = pythonTimestamp - event.frontendTimestamp;
      eventBuffer.statsCache = null;
    }

    setImmediate(async () => {
      try {
        await Event.findByIdAndUpdate(eventId, {
          pythonTimestamp,
          'latency.backendToPython': pythonTimestamp - (eventBuffer.events[eventIndex]?.backendTimestamp || Date.now()),
          'latency.total': pythonTimestamp - (eventBuffer.events[eventIndex]?.frontendTimestamp || Date.now())
        });
      } catch (err) {
        console.warn('Async update failed:', err.message);
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    bufferSize: eventBuffer.events.length,
    pythonQueueSize: pythonEventQueue.queue.length,
    mongoStatus: mongoose.connection.readyState
  });
});

app.post('/api/nodes/register', async (req, res) => {
  try {
    const node = await edgeNodeManager.registerNode(req.body);
    res.json({ success: true, node });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nodes/heartbeat', async (req, res) => {
  try {
    const { nodeId, ...healthData } = req.body;
    const node = await edgeNodeManager.updateHeartbeat(nodeId, healthData);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    res.json({ success: true, node });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nodes', async (req, res) => {
  try {
    const nodes = await edgeNodeManager.getAllNodes();
    res.json({ nodes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nodes/optimal', async (req, res) => {
  try {
    const node = await edgeNodeManager.getOptimalNode();
    res.json({ node });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/macros/record/start', (req, res) => {
  try {
    const { sessionId, userId, name } = req.body;
    const result = macroManager.startRecording(sessionId, userId, name);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/macros/record/stop', async (req, res) => {
  try {
    const { sessionId, description, tags } = req.body;
    const macro = await macroManager.stopRecording(sessionId, description, tags);
    if (!macro) {
      return res.status(404).json({ error: 'No active recording' });
    }
    res.json({ macro });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/macros/record/cancel', (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = macroManager.cancelRecording(sessionId);
    res.json(result || { error: 'No active recording' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/macros/record/status/:sessionId', (req, res) => {
  try {
    const status = macroManager.getRecordingStatus(req.params.sessionId);
    res.json(status || { isRecording: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/macros', async (req, res) => {
  try {
    const macros = await macroManager.getMacros(req.query);
    res.json({ macros });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/macros/:macroId', async (req, res) => {
  try {
    const macro = await macroManager.getMacro(req.params.macroId);
    if (!macro) {
      return res.status(404).json({ error: 'Macro not found' });
    }
    res.json({ macro });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/macros/:macroId', async (req, res) => {
  try {
    const result = await macroManager.deleteMacro(req.params.macroId);
    res.json({ success: !!result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/macros/:macroId/play', async (req, res) => {
  try {
    const { options, sessionId } = req.body;
    
    const result = await macroManager.playMacro(
      req.params.macroId,
      (type, data, playbackId) => {
        io.to(sessionId).emit('macro-event', {
          type,
          data,
          playbackId
        });
        
        const backendTimestamp = Date.now();
        const eventData = {
          type,
          data,
          frontendTimestamp: Date.now() - 100,
          sessionId,
          sequenceId: `macro_${playbackId}_${Date.now()}`,
          retryCount: 0
        };
        
        const event = new Event({
          ...eventData,
          backendTimestamp,
          latency: {
            frontendToBackend: 100,
            backendToPython: 0,
            total: 100
          }
        });
        
        eventBuffer.addToBuffer({
          _id: event._id,
          ...eventData,
          backendTimestamp,
          latency: event.latency
        });
        
        pythonEventQueue.push({
          eventId: event._id,
          type,
          data,
          backendTimestamp
        });
      },
      options
    );
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/macros/play/:playbackId/stop', (req, res) => {
  try {
    const result = macroManager.stopPlayback(req.params.playbackId);
    res.json(result || { error: 'Playback not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/security/config', async (req, res) => {
  try {
    const config = await securityManager.getConfig();
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/security/config', async (req, res) => {
  try {
    const config = await securityManager.updateConfig(req.body);
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/security/confirmations/pending', async (req, res) => {
  try {
    const confirmations = await securityManager.getPendingConfirmations();
    res.json({ confirmations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/security/confirmations/:id/approve', async (req, res) => {
  try {
    const result = await securityManager.approveConfirmation(req.params.id, req.body.adminId);
    if (!result) {
      return res.status(404).json({ error: 'Confirmation not found' });
    }
    
    if (result.approved && result.eventType) {
      const backendTimestamp = Date.now();
      pythonEventQueue.push({
        eventId: `approved_${req.params.id}`,
        type: result.eventType,
        data: result.eventData,
        backendTimestamp
      });
      
      io.emit('security-approved', {
        confirmationId: req.params.id,
        eventType: result.eventType
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/security/confirmations/:id/reject', async (req, res) => {
  try {
    const result = await securityManager.rejectConfirmation(req.params.id, req.body.adminId);
    if (!result) {
      return res.status(404).json({ error: 'Confirmation not found' });
    }
    
    io.emit('security-rejected', {
      confirmationId: req.params.id
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/security/confirmations/:id/status', async (req, res) => {
  try {
    const status = await securityManager.getConfirmationStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('offer', async ({ offer, sessionId }) => {
    sessions.set(sessionId, {
      socket,
      offer,
      answer: null
    });
    socket.broadcast.emit('offer', { offer, sessionId });
  });

  socket.on('answer', ({ answer, sessionId }) => {
    const session = sessions.get(sessionId);
    if (session) {
      session.answer = answer;
      session.socket.emit('answer', { answer, sessionId });
    }
  });

  socket.on('ice-candidate', ({ candidate, sessionId }) => {
    socket.broadcast.emit('ice-candidate', { candidate, sessionId });
  });

  socket.on('event', async (eventData) => {
    try {
      if (isDuplicateEvent(eventData.sequenceId)) {
        socket.emit('event-ack', {
          sequenceId: eventData.sequenceId,
          duplicate: true
        });
        return;
      }

      const criticalKey = securityManager.checkCriticalKey(eventData);
      if (criticalKey) {
        const confirmation = await securityManager.createConfirmation(
          eventData.type,
          eventData.data,
          criticalKey,
          eventData.sessionId
        );
        
        if (confirmation.requiresApproval) {
          socket.emit('security-confirmation-required', {
            ...confirmation,
            criticalKey
          });
          
          io.emit('security-pending', {
            confirmationId: confirmation.confirmationId,
            keyCombination: criticalKey,
            sessionId: eventData.sessionId
          });
          
          return;
        }
      }

      if (macroManager.isRecording(eventData.sessionId)) {
        macroManager.recordEvent(
          eventData.sessionId,
          eventData.type,
          eventData.data
        );
      }

      const backendTimestamp = Date.now();
      const frontendToBackend = backendTimestamp - eventData.frontendTimestamp;

      const eventDoc = {
        type: eventData.type,
        data: eventData.data,
        frontendTimestamp: eventData.frontendTimestamp,
        backendTimestamp,
        sessionId: eventData.sessionId,
        sequenceId: eventData.sequenceId,
        retryCount: eventData.retryCount || 0,
        latency: {
          frontendToBackend,
          backendToPython: 0,
          total: frontendToBackend
        }
      };

      const event = new Event(eventDoc);
      eventBuffer.addToBuffer({
        _id: event._id,
        ...eventDoc
      });

      pythonEventQueue.push({
        eventId: event._id,
        type: eventData.type,
        data: eventData.data,
        backendTimestamp
      });

      socket.emit('event-ack', {
        eventId: event._id,
        sequenceId: eventData.sequenceId,
        backendTimestamp,
        latency: frontendToBackend
      });
    } catch (error) {
      console.error('Error processing event:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await eventBuffer.flushAll();
  eventBuffer.destroy();
  pythonEventQueue.destroy();
  edgeNodeManager.stopMonitoring();
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
