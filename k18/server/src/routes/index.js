const express = require('express');
const router = express.Router();
const { generateToken, authMiddleware } = require('../middleware/auth');
const roomManager = require('../services/roomManager');
const pacsService = require('../services/pacs');
const recordingService = require('../services/recording');
const networkAdapter = require('../services/networkAdapter');
const { v4: uuidv4 } = require('uuid');

router.post('/auth/login', (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const userId = uuidv4();
  const token = generateToken(userId, role, username);

  res.json({
    token,
    user: {
      id: userId,
      username,
      role,
    },
  });
});

router.post('/auth/verify', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

router.get('/rooms', authMiddleware, (req, res) => {
  const rooms = roomManager.getAllActiveRooms();
  res.json({ rooms });
});

router.get('/rooms/:roomId', authMiddleware, (req, res) => {
  const state = roomManager.getRoomState(req.params.roomId);
  if (!state) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ room: state });
});

router.post('/rooms', authMiddleware, (req, res) => {
  const { userId, name } = req.user;
  const room = roomManager.createRoom(userId, name);
  res.json({ room: roomManager.getRoomState(room.id) });
});

router.get('/rooms/:roomId/state', authMiddleware, (req, res) => {
  const state = roomManager.getRoomState(req.params.roomId);
  if (!state) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ state });
});

router.get('/rooms/:roomId/experts', authMiddleware, (req, res) => {
  const state = roomManager.getRoomState(req.params.roomId);
  if (!state) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({ experts: state.experts });
});

router.post('/rooms/:roomId/keyframes', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { frameData, diagnosis, report } = req.body;
    const { userId, name } = req.user;

    const keyframe = await pacsService.saveKeyframe(
      roomId,
      userId,
      name,
      frameData,
      diagnosis,
      report
    );

    res.json({ keyframe });
  } catch (err) {
    console.error('[API] Keyframe save error:', err);
    res.status(500).json({ error: 'Failed to save keyframe' });
  }
});

router.get('/rooms/:roomId/keyframes', authMiddleware, async (req, res) => {
  try {
    const keyframes = await pacsService.getRoomKeyframeUrls(req.params.roomId);
    res.json({ keyframes });
  } catch (err) {
    console.error('[API] Keyframes list error:', err);
    res.status(500).json({ error: 'Failed to list keyframes' });
  }
});

router.get('/keyframes/:keyframeId', authMiddleware, async (req, res) => {
  try {
    const keyframe = await pacsService.getKeyframeUrl(req.params.keyframeId);
    if (!keyframe) {
      return res.status(404).json({ error: 'Keyframe not found' });
    }
    res.json({ keyframe });
  } catch (err) {
    console.error('[API] Keyframe get error:', err);
    res.status(500).json({ error: 'Failed to get keyframe' });
  }
});

router.put('/keyframes/:keyframeId/report', authMiddleware, async (req, res) => {
  try {
    const { diagnosis, report } = req.body;
    const keyframe = await pacsService.updateReport(
      req.params.keyframeId,
      diagnosis,
      report
    );
    if (!keyframe) {
      return res.status(404).json({ error: 'Keyframe not found' });
    }
    res.json({ keyframe });
  } catch (err) {
    console.error('[API] Report update error:', err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

router.get('/rooms/:roomId/recordings', authMiddleware, async (req, res) => {
  try {
    const recordings = await recordingService.getRecordingList(req.params.roomId);
    res.json({ recordings });
  } catch (err) {
    console.error('[API] Recordings list error:', err);
    res.status(500).json({ error: 'Failed to list recordings' });
  }
});

router.get('/recordings/:fileName/url', authMiddleware, async (req, res) => {
  try {
    const url = await recordingService.getRecordingUrl(req.params.fileName);
    if (!url) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    res.json({ url });
  } catch (err) {
    console.error('[API] Recording URL error:', err);
    res.status(500).json({ error: 'Failed to get recording URL' });
  }
});

router.get('/rooms/:roomId/network-stats', authMiddleware, (req, res) => {
  const clients = networkAdapter.getRoomClients(req.params.roomId);
  res.json({ clients });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    activeRooms: roomManager.rooms ? roomManager.getAllActiveRooms().length : 0,
  });
});

module.exports = router;
