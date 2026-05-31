(function () {
  'use strict';

  const FPS = 30;
  const SYNC_INTERVAL = 200;
  const SPEED_MIN = 0.95;
  const SPEED_MAX = 1.05;
  const SPEED_KP = 0.002;
  const MAX_CHART_POINTS = 300;
  const DB_NAME = 'av-sync-calibrator';
  const DB_VERSION = 1;
  const STORE_NAME = 'history';

  let ws = null;
  let pc = null;
  let dc = null;
  let role = null;
  let roomCode = null;
  let isHost = false;

  let playing = false;
  let frameIndex = 0;
  let playStartTime = 0;
  let playOffset = 0;
  let playbackRate = 1.0;
  let animFrameId = null;

  let remoteFrameIndex = 0;
  let remoteTimestamp = 0;
  let localTimestamp = 0;

  let syncIntervalId = null;
  let chartData = [];
  let calibrationStartTime = 0;
  let lastSaveTime = 0;
  const AUTO_SAVE_INTERVAL = 15000;
  let hasCalibrationStarted = false;
  let reconnectTimer = null;
  const RECONNECT_DELAY = 3000;
  let isReconnecting = false;

  const FINGERPRINT_BINS = 16;
  const FINGERPRINT_INTERVAL = 500;
  const FINGERPRINT_HISTORY_MAX = 60;

  let audioCtx = null;
  let analyser = null;
  let audioStream = null;
  let audioActive = false;
  let fingerprintIntervalId = null;
  let localFingerprint = null;
  let remoteFingerprint = null;
  let remoteFingerprintTime = 0;
  let fingerprintMatchHistory = [];
  let localFreqData = null;
  let remoteFreqData = null;

  const canvas = document.getElementById('test-canvas');
  const ctx = canvas.getContext('2d');
  const chartCanvas = document.getElementById('chart-canvas');
  const chartCtx = chartCanvas.getContext('2d');

  const btnCreate = document.getElementById('btn-create');
  const btnJoin = document.getElementById('btn-join');
  const inputRoomCode = document.getElementById('input-room-code');
  const roomStatus = document.getElementById('room-status');
  const roomLabel = document.getElementById('room-label');
  const connectionStatus = document.getElementById('connection-status');
  const videoSection = document.getElementById('video-section');
  const syncSection = document.getElementById('sync-section');
  const chartSection = document.getElementById('chart-section');
  const btnPlay = document.getElementById('btn-play');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');
  const currentSpeedEl = document.getElementById('current-speed');
  const localFrameEl = document.getElementById('local-frame');
  const remoteFrameEl = document.getElementById('remote-frame');
  const frameDiffEl = document.getElementById('frame-diff');
  const latencyEl = document.getElementById('latency-est');
  const calibrationRateEl = document.getElementById('calibration-rate');
  const historyList = document.getElementById('history-list');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const audioSection = document.getElementById('audio-section');
  const btnAudioStart = document.getElementById('btn-audio-start');
  const btnAudioStop = document.getElementById('btn-audio-stop');
  const audioStatusBadge = document.getElementById('audio-status-badge');
  const localSpectrumCanvas = document.getElementById('local-spectrum-canvas');
  const localSpectrumCtx = localSpectrumCanvas.getContext('2d');
  const remoteSpectrumCanvas = document.getElementById('remote-spectrum-canvas');
  const remoteSpectrumCtx = remoteSpectrumCanvas.getContext('2d');
  const fingerprintMatchEl = document.getElementById('fingerprint-match');
  const audioLatencyEl = document.getElementById('audio-latency');
  const fingerprintHistoryCanvas = document.getElementById('fingerprint-history-canvas');
  const fingerprintHistoryCtx = fingerprintHistoryCanvas.getContext('2d');

  function wsUrl() {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + loc.host;
  }

  function connectSignaling() {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        resolve(ws);
        return;
      }
      ws = new WebSocket(wsUrl());
      ws.onopen = () => resolve(ws);
      ws.onerror = (e) => reject(e);
      ws.onmessage = handleSignalingMessage;
      ws.onclose = () => {
        setConnectionStatus('disconnected', '未连接');
      };
    });
  }

  function handleSignalingMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'created':
        roomCode = msg.roomCode;
        isHost = true;
        role = 'host';
        roomLabel.textContent = '房间码: ' + roomCode;
        showRoomStatus();
        setConnectionStatus('connecting', '等待对端加入...');
        break;

      case 'joined':
        roomCode = msg.roomCode;
        isHost = false;
        role = 'peer';
        roomLabel.textContent = '房间码: ' + roomCode;
        showRoomStatus();
        setConnectionStatus('connecting', '已加入，正在建立连接...');
        break;

      case 'peer_joined':
        setConnectionStatus('connecting', '对端已加入，正在建立连接...');
        initiateWebRTC();
        break;

      case 'signal':
        handleSignal(msg.payload);
        break;

      case 'peer_left':
        setConnectionStatus('error', '对端已离开');
        cleanupPeer();
        break;

      case 'error':
        setConnectionStatus('error', msg.message);
        break;
    }
  }

  function sendSignal(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'signal', payload }));
    }
  }

  function showRoomStatus() {
    roomStatus.classList.remove('hidden');
  }

  function setConnectionStatus(state, text) {
    connectionStatus.textContent = text;
    connectionStatus.className = 'badge';
    if (state === 'connected') connectionStatus.classList.add('connected');
    else if (state === 'connecting') connectionStatus.classList.add('connecting');
    else if (state === 'error') connectionStatus.classList.add('error');
  }

  function showSections() {
    videoSection.classList.remove('hidden');
    syncSection.classList.remove('hidden');
    audioSection.classList.remove('hidden');
    chartSection.classList.remove('hidden');
  }

  async function createRoom() {
    try {
      await connectSignaling();
      ws.send(JSON.stringify({ type: 'create' }));
    } catch (e) {
      setConnectionStatus('error', '连接信令服务器失败');
    }
  }

  async function joinRoom() {
    const code = inputRoomCode.value.trim().toUpperCase();
    if (code.length !== 6) {
      alert('请输入6位房间码');
      return;
    }
    try {
      await connectSignaling();
      ws.send(JSON.stringify({ type: 'join', roomCode: code }));
    } catch (e) {
      setConnectionStatus('error', '连接信令服务器失败');
    }
  }

  async function initiateWebRTC() {
    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    pc = new RTCPeerConnection(config);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: 'ice-candidate', candidate: e.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionStatus('connected', '已连接');
        showSections();
        startSync();
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setConnectionStatus('error', '连接断开');
        stopSync();
      }
    };

    if (isHost) {
      dc = pc.createDataChannel('sync', {
        ordered: false,
        maxRetransmits: 0
      });
      setupDataChannel(dc);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'sdp', sdp: pc.localDescription });
      } catch (e) {
        console.error('Create offer error:', e);
      }
    } else {
      pc.ondatachannel = (e) => {
        dc = e.channel;
        setupDataChannel(dc);
      };
    }
  }

  async function handleSignal(payload) {
    if (!pc) {
      if (payload.type === 'sdp' && payload.sdp.type === 'offer') {
        await initiateWebRTC();
      }
    }

    if (payload.type === 'sdp') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        if (payload.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: 'sdp', sdp: pc.localDescription });
        }
      } catch (e) {
        console.error('SDP error:', e);
      }
    } else if (payload.type === 'ice-candidate') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch (e) {
        console.error('ICE candidate error:', e);
      }
    }
  }

  function setupDataChannel(channel) {
    channel.onopen = () => {
      setConnectionStatus('connected', '已连接');
      showSections();
      isReconnecting = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      startSync();
    };

    channel.onclose = () => {
      setConnectionStatus('error', '数据通道已关闭，尝试重连...');
      stopSync();
      scheduleReconnect();
    };

    channel.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'audio_fingerprint') {
          remoteFingerprint = data.fingerprint;
          remoteFreqData = data.freqData;
          remoteFingerprintTime = performance.now();
          updateAudioFingerprintDisplay();
        } else {
          remoteFrameIndex = data.frameIndex;
          remoteTimestamp = data.timestamp;
          localTimestamp = performance.now();
          updateSyncDisplay();
        }
      } catch {}
    };
  }

  function cleanupPeer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    isReconnecting = false;
    if (dc) {
      dc.close();
      dc = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    stopSync();
  }

  function scheduleReconnect() {
    if (isReconnecting || reconnectTimer) return;
    if (!roomCode) return;

    isReconnecting = true;
    reconnectTimer = setTimeout(() => {
      setConnectionStatus('connecting', '正在重新建立连接...');
      if (pc) {
        pc.close();
        pc = null;
      }
      dc = null;
      initiateWebRTC();
      reconnectTimer = null;
      isReconnecting = false;
    }, RECONNECT_DELAY);
  }

  function startSync() {
    if (syncIntervalId) return;

    if (!hasCalibrationStarted) {
      calibrationStartTime = performance.now();
      chartData = [];
      hasCalibrationStarted = true;
    } else {
      const elapsed = (performance.now() - calibrationStartTime) / 1000;
      chartData.push({ t: elapsed, event: 'reconnect' });
    }

    syncIntervalId = setInterval(sendSyncData, SYNC_INTERVAL);
  }

  function stopSync() {
    if (hasCalibrationStarted && chartData.length > 0) {
      const elapsed = (performance.now() - calibrationStartTime) / 1000;
      chartData.push({ t: elapsed, event: 'disconnect' });
    }
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
  }

  function sendSyncData() {
    if (!dc || dc.readyState !== 'open') return;
    const data = {
      frameIndex: frameIndex,
      timestamp: performance.now()
    };
    dc.send(JSON.stringify(data));
  }

  function updateSyncDisplay() {
    localFrameEl.textContent = frameIndex;
    remoteFrameEl.textContent = remoteFrameIndex;

    const diff = frameIndex - remoteFrameIndex;
    frameDiffEl.textContent = (diff >= 0 ? '+' : '') + diff;

    const latencyMs = (diff / FPS) * 1000;
    latencyEl.textContent = latencyMs.toFixed(1) + ' ms';
    calibrationRateEl.textContent = playbackRate.toFixed(3) + 'x';

    if (remoteFrameIndex > 0) {
      const elapsed = (performance.now() - calibrationStartTime) / 1000;
      chartData.push({ t: elapsed, delay: latencyMs, speed: playbackRate });
      if (chartData.length > MAX_CHART_POINTS) {
        chartData.shift();
      }
      drawChart();

      const now = Date.now();
      if (now - lastSaveTime > AUTO_SAVE_INTERVAL) {
        lastSaveTime = now;
        saveCalibration();
      }
    }

    adjustPlaybackRate(diff);
  }

  function adjustPlaybackRate(frameDiff) {
    const correction = SPEED_KP * frameDiff;
    playbackRate = Math.max(SPEED_MIN, Math.min(SPEED_MAX, 1.0 + correction));
    currentSpeedEl.textContent = playbackRate.toFixed(3) + 'x';
  }

  function drawTestFrame() {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    const t = frameIndex / FPS;
    const seconds = Math.floor(t);
    const ms = Math.floor((t - seconds) * 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr =
      String(minutes).padStart(2, '0') + ':' +
      String(secs).padStart(2, '0') + '.' +
      String(ms).padStart(3, '0');

    ctx.save();
    ctx.fillStyle = '#0f3460';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 80, 0, Math.PI * 2);
    ctx.fill();

    const angle = (t * Math.PI * 2) / 4;
    const handLen = 60;
    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(
      w / 2 + Math.cos(angle) * handLen,
      h / 2 + Math.sin(angle) * handLen
    );
    ctx.stroke();

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI * 2) / 4 - Math.PI / 2;
      const x1 = w / 2 + Math.cos(a) * 68;
      const y1 = h / 2 + Math.sin(a) * 68;
      const x2 = w / 2 + Math.cos(a) * 78;
      const y2 = h / 2 + Math.sin(a) * 78;
      ctx.strokeStyle = '#533483';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#e94560';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, w / 2, h / 2 + 130);
    ctx.restore();

    ctx.save();
    ctx.font = '16px monospace';
    ctx.fillStyle = '#533483';
    ctx.textAlign = 'left';
    ctx.fillText('FRAME: ' + frameIndex, 16, 24);
    ctx.fillText('FPS: ' + FPS, 16, 46);
    ctx.fillText('RATE: ' + playbackRate.toFixed(3) + 'x', 16, 68);
    ctx.textAlign = 'right';
    ctx.fillText('ROOM: ' + (roomCode || '--'), w - 16, 24);
    ctx.fillText('ROLE: ' + (role || '--'), w - 16, 46);
    ctx.restore();

    const barW = w - 60;
    const barH = 8;
    const barX = 30;
    const barY = h - 30;
    ctx.fillStyle = '#16213e';
    ctx.fillRect(barX, barY, barW, barH);

    const totalFrames = FPS * 60;
    const progress = (frameIndex % totalFrames) / totalFrames;
    ctx.fillStyle = '#e94560';
    ctx.fillRect(barX, barY, barW * progress, barH);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#533483';
    ctx.textAlign = 'center';
    ctx.fillText(
      ((frameIndex % totalFrames) / FPS).toFixed(1) + 's / 60.0s',
      w / 2,
      barY - 4
    );
  }

  function gameLoop(timestamp) {
    if (!playing) return;

    const elapsed = timestamp - playStartTime;
    const adjustedElapsed = playOffset + elapsed * playbackRate;
    frameIndex = Math.floor((adjustedElapsed / 1000) * FPS);

    drawTestFrame();
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function startPlaying() {
    if (playing) return;
    playing = true;
    playStartTime = performance.now();
    btnPlay.disabled = true;
    btnPause.disabled = false;
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function pausePlaying() {
    if (!playing) return;
    playing = false;
    playOffset += (performance.now() - playStartTime) * playbackRate;
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    btnPlay.disabled = false;
    btnPause.disabled = true;
  }

  function resetPlaying() {
    pausePlaying();
    frameIndex = 0;
    playOffset = 0;
    playbackRate = 1.0;
    currentSpeedEl.textContent = '1.000x';
    drawTestFrame();
  }

  function drawChart() {
    const w = chartCanvas.width;
    const h = chartCanvas.height;

    chartCtx.clearRect(0, 0, w, h);

    const padL = 60;
    const padR = 20;
    const padT = 20;
    const padB = 40;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    chartCtx.fillStyle = '#0f1117';
    chartCtx.fillRect(0, 0, w, h);

    const dataPoints = chartData.filter((d) => d.delay !== undefined);
    const eventPoints = chartData.filter((d) => d.event !== undefined);

    if (dataPoints.length < 2 && eventPoints.length === 0) {
      chartCtx.font = '14px sans-serif';
      chartCtx.fillStyle = '#8b90a5';
      chartCtx.textAlign = 'center';
      chartCtx.fillText('等待校准数据...', w / 2, h / 2);
      return;
    }

    let maxDelay = 200;
    if (dataPoints.length > 0) {
      maxDelay = Math.max(200, ...dataPoints.map((d) => Math.abs(d.delay)));
    }
    const delayRange = maxDelay * 1.2;
    const tMin = chartData.length > 0 ? chartData[0].t : 0;
    const tMax = chartData.length > 0 ? chartData[chartData.length - 1].t : 1;
    const tRange = Math.max(tMax - tMin, 1);

    chartCtx.strokeStyle = '#2e3347';
    chartCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      chartCtx.beginPath();
      chartCtx.moveTo(padL, y);
      chartCtx.lineTo(padL + plotW, y);
      chartCtx.stroke();

      const val = delayRange - (2 * delayRange * i) / 4;
      chartCtx.font = '11px monospace';
      chartCtx.fillStyle = '#8b90a5';
      chartCtx.textAlign = 'right';
      chartCtx.fillText(val.toFixed(0) + 'ms', padL - 6, y + 4);
    }

    chartCtx.strokeStyle = '#2e3347';
    chartCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = padL + (plotW * i) / 4;
      chartCtx.beginPath();
      chartCtx.moveTo(x, padT);
      chartCtx.lineTo(x, padT + plotH);
      chartCtx.stroke();

      const val = tMin + (tRange * i) / 4;
      chartCtx.font = '11px monospace';
      chartCtx.fillStyle = '#8b90a5';
      chartCtx.textAlign = 'center';
      chartCtx.fillText(val.toFixed(1) + 's', x, padT + plotH + 16);
    }

    const zeroY = padT + plotH / 2;
    chartCtx.strokeStyle = '#533483';
    chartCtx.lineWidth = 1;
    chartCtx.setLineDash([4, 4]);
    chartCtx.beginPath();
    chartCtx.moveTo(padL, zeroY);
    chartCtx.lineTo(padL + plotW, zeroY);
    chartCtx.stroke();
    chartCtx.setLineDash([]);

    eventPoints.forEach((ep) => {
      const x = padL + ((ep.t - tMin) / tRange) * plotW;
      if (ep.event === 'disconnect') {
        chartCtx.strokeStyle = '#ff6b6b';
        chartCtx.lineWidth = 2;
        chartCtx.setLineDash([6, 3]);
      } else if (ep.event === 'reconnect') {
        chartCtx.strokeStyle = '#00b894';
        chartCtx.lineWidth = 2;
        chartCtx.setLineDash([6, 3]);
      }
      chartCtx.beginPath();
      chartCtx.moveTo(x, padT);
      chartCtx.lineTo(x, padT + plotH);
      chartCtx.stroke();
      chartCtx.setLineDash([]);

      chartCtx.save();
      chartCtx.translate(x, padT + 6);
      chartCtx.rotate(-Math.PI / 4);
      chartCtx.font = '9px sans-serif';
      chartCtx.textAlign = 'left';
      chartCtx.fillStyle = ep.event === 'disconnect' ? '#ff6b6b' : '#00b894';
      chartCtx.fillText(ep.event === 'disconnect' ? '断开' : '重连', 2, 0);
      chartCtx.restore();
    });

    if (dataPoints.length >= 2) {
      chartCtx.strokeStyle = '#e94560';
      chartCtx.lineWidth = 2;
      chartCtx.beginPath();
      let firstDataPoint = true;
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i];
        if (d.delay === undefined) {
          firstDataPoint = true;
          continue;
        }
        const x = padL + ((d.t - tMin) / tRange) * plotW;
        const y = padT + ((delayRange - d.delay) / (2 * delayRange)) * plotH;
        if (firstDataPoint) {
          chartCtx.moveTo(x, y);
          firstDataPoint = false;
        } else {
          chartCtx.lineTo(x, y);
        }
      }
      chartCtx.stroke();

      if (dataPoints.length > 1) {
        chartCtx.fillStyle = 'rgba(233, 69, 96, 0.15)';
        chartCtx.beginPath();
        firstDataPoint = true;
        let firstX = 0, lastX = 0;
        for (let i = 0; i < chartData.length; i++) {
          const d = chartData[i];
          if (d.delay === undefined) {
            firstDataPoint = true;
            continue;
          }
          const x = padL + ((d.t - tMin) / tRange) * plotW;
          const y = padT + ((delayRange - d.delay) / (2 * delayRange)) * plotH;
          if (firstDataPoint) {
            if (i > 0) {
              chartCtx.lineTo(x, zeroY);
            }
            chartCtx.moveTo(x, zeroY);
            chartCtx.lineTo(x, y);
            firstX = x;
            firstDataPoint = false;
          } else {
            chartCtx.lineTo(x, y);
          }
          lastX = x;
        }
        chartCtx.lineTo(lastX, zeroY);
        chartCtx.closePath();
        chartCtx.fill();
      }

      chartCtx.strokeStyle = '#00cec9';
      chartCtx.lineWidth = 1.5;
      chartCtx.beginPath();
      firstDataPoint = true;
      for (let i = 0; i < chartData.length; i++) {
        const d = chartData[i];
        if (d.delay === undefined) {
          firstDataPoint = true;
          continue;
        }
        const x = padL + ((d.t - tMin) / tRange) * plotW;
        const speedNorm = (d.speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
        const y = padT + plotH - speedNorm * plotH;
        if (firstDataPoint) {
          chartCtx.moveTo(x, y);
          firstDataPoint = false;
        } else {
          chartCtx.lineTo(x, y);
        }
      }
      chartCtx.stroke();
    }

    chartCtx.font = '12px sans-serif';
    chartCtx.fillStyle = '#e94560';
    chartCtx.textAlign = 'left';
    chartCtx.fillText('● 延迟 (ms)', padL + 8, padT + 14);
    chartCtx.fillStyle = '#00cec9';
    chartCtx.fillText('● 速率', padL + 100, padT + 14);
    chartCtx.fillStyle = '#ff6b6b';
    chartCtx.fillText('▏断开', padL + 160, padT + 14);
    chartCtx.fillStyle = '#00b894';
    chartCtx.fillText('▏重连', padL + 220, padT + 14);
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveCalibration() {
    const dataPoints = chartData.filter((d) => d.delay !== undefined);
    if (dataPoints.length === 0) return;
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const avgDelay =
        dataPoints.reduce((s, d) => s + Math.abs(d.delay), 0) / dataPoints.length;
      const lastDataPoint = dataPoints[dataPoints.length - 1];
      const record = {
        roomCode: roomCode || '--',
        role: role || '--',
        timestamp: Date.now(),
        avgDelay: avgDelay,
        finalSpeed: lastDataPoint.speed,
        dataPoints: dataPoints.length,
        duration: dataPoints.length > 1
          ? (lastDataPoint.t - dataPoints[0].t).toFixed(1)
          : '0'
      };
      store.add(record);
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = rej;
      });
      loadHistory();
    } catch (e) {
      console.error('Save calibration error:', e);
    }
  }

  async function loadHistory() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        renderHistory(req.result);
      };
    } catch (e) {
      console.error('Load history error:', e);
    }
  }

  function renderHistory(records) {
    if (!records || records.length === 0) {
      historyList.innerHTML = '<p class="empty-hint">暂无历史记录</p>';
      return;
    }

    records.sort((a, b) => b.timestamp - a.timestamp);

    historyList.innerHTML = records
      .map((r) => {
        const date = new Date(r.timestamp);
        const dateStr =
          date.getFullYear() + '-' +
          String(date.getMonth() + 1).padStart(2, '0') + '-' +
          String(date.getDate()).padStart(2, '0') + ' ' +
          String(date.getHours()).padStart(2, '0') + ':' +
          String(date.getMinutes()).padStart(2, '0') + ':' +
          String(date.getSeconds()).padStart(2, '0');
        return (
          '<div class="history-item">' +
          '<div class="hi-left">' +
          '<span class="hi-room">房间 ' + r.roomCode + ' (' + r.role + ')</span>' +
          '<span class="hi-time">' + dateStr + ' · ' + r.duration + 's · ' + r.dataPoints + '点</span>' +
          '</div>' +
          '<div class="hi-stats">' +
          '平均延迟 ' + r.avgDelay.toFixed(1) + 'ms<br>' +
          '最终速率 ' + r.finalSpeed.toFixed(3) + 'x' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  async function clearHistory() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = rej;
      });
      loadHistory();
    } catch (e) {
      console.error('Clear history error:', e);
    }
  }

  async function startAudioCapture() {
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      const source = audioCtx.createMediaStreamSource(audioStream);
      source.connect(analyser);

      audioActive = true;
      btnAudioStart.disabled = true;
      btnAudioStop.disabled = false;
      audioStatusBadge.textContent = '采集中';
      audioStatusBadge.className = 'badge connected';

      fingerprintIntervalId = setInterval(computeAndSendFingerprint, FINGERPRINT_INTERVAL);
      requestAnimationFrame(drawSpectrumLoop);
    } catch (e) {
      console.error('Audio capture error:', e);
      audioStatusBadge.textContent = '麦克风不可用';
      audioStatusBadge.className = 'badge error';
    }
  }

  function stopAudioCapture() {
    audioActive = false;
    if (fingerprintIntervalId) {
      clearInterval(fingerprintIntervalId);
      fingerprintIntervalId = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach((t) => t.stop());
      audioStream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    analyser = null;
    localFingerprint = null;
    localFreqData = null;
    btnAudioStart.disabled = false;
    btnAudioStop.disabled = true;
    audioStatusBadge.textContent = '已停止';
    audioStatusBadge.className = 'badge';
  }

  function computeFingerprint(freqData) {
    const bins = new Float32Array(FINGERPRINT_BINS);
    const binSize = Math.floor(freqData.length / FINGERPRINT_BINS);
    for (let i = 0; i < FINGERPRINT_BINS; i++) {
      let sum = 0;
      for (let j = 0; j < binSize; j++) {
        sum += freqData[i * binSize + j];
      }
      bins[i] = sum / binSize;
    }
    const maxVal = Math.max(...bins, 1);
    const fingerprint = new Uint8Array(FINGERPRINT_BINS);
    for (let i = 0; i < FINGERPRINT_BINS; i++) {
      fingerprint[i] = Math.round((bins[i] / maxVal) * 255);
    }
    return Array.from(fingerprint);
  }

  function computeAndSendFingerprint() {
    if (!analyser || !audioActive) return;
    if (!dc || dc.readyState !== 'open') return;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    localFreqData = Array.from(freqData);
    localFingerprint = computeFingerprint(freqData);

    dc.send(JSON.stringify({
      type: 'audio_fingerprint',
      fingerprint: localFingerprint,
      freqData: localFingerprint,
      timestamp: performance.now()
    }));
  }

  function computeFingerprintSimilarity(fp1, fp2) {
    if (!fp1 || !fp2 || fp1.length !== fp2.length) return 0;
    let sumSqDiff = 0;
    let sumSq1 = 0;
    let sumSq2 = 0;
    for (let i = 0; i < fp1.length; i++) {
      const diff = fp1[i] - fp2[i];
      sumSqDiff += diff * diff;
      sumSq1 += fp1[i] * fp1[i];
      sumSq2 += fp2[i] * fp2[i];
    }
    const denom = Math.sqrt(sumSq1 * sumSq2);
    if (denom === 0) return 0;
    return Math.max(0, 1 - sumSqDiff / (2 * denom));
  }

  function updateAudioFingerprintDisplay() {
    if (!localFingerprint || !remoteFingerprint) return;

    const similarity = computeFingerprintSimilarity(localFingerprint, remoteFingerprint);
    const pct = (similarity * 100).toFixed(1);

    fingerprintMatchEl.textContent = pct + '%';
    fingerprintMatchEl.className = '';
    if (similarity >= 0.7) fingerprintMatchEl.classList.add('match-high');
    else if (similarity >= 0.4) fingerprintMatchEl.classList.add('match-mid');
    else fingerprintMatchEl.classList.add('match-low');

    fingerprintMatchHistory.push(similarity);
    if (fingerprintMatchHistory.length > FINGERPRINT_HISTORY_MAX) {
      fingerprintMatchHistory.shift();
    }

    if (remoteFingerprintTime > 0) {
      const audioLat = (performance.now() - remoteFingerprintTime).toFixed(0);
      audioLatencyEl.textContent = audioLat + ' ms';
    }

    drawFingerprintHistory();
    drawRemoteSpectrum();
  }

  function drawSpectrumLoop() {
    if (!audioActive || !analyser) return;
    drawLocalSpectrum();
    requestAnimationFrame(drawSpectrumLoop);
  }

  function drawLocalSpectrum() {
    if (!analyser) return;
    const w = localSpectrumCanvas.width;
    const h = localSpectrumCanvas.height;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    localSpectrumCtx.fillStyle = '#0f1117';
    localSpectrumCtx.fillRect(0, 0, w, h);

    const barCount = 64;
    const step = Math.floor(freqData.length / barCount);
    const barW = w / barCount - 1;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += freqData[i * step + j];
      }
      const val = sum / step / 255;
      const barH = val * (h - 4);
      const hue = 270 - val * 90;
      localSpectrumCtx.fillStyle = 'hsl(' + hue + ', 70%, 55%)';
      localSpectrumCtx.fillRect(
        i * (barW + 1),
        h - barH,
        barW,
        barH
      );
    }
  }

  function drawRemoteSpectrum() {
    if (!remoteFreqData) return;
    const w = remoteSpectrumCanvas.width;
    const h = remoteSpectrumCanvas.height;

    remoteSpectrumCtx.fillStyle = '#0f1117';
    remoteSpectrumCtx.fillRect(0, 0, w, h);

    const barCount = Math.min(remoteFreqData.length, 64);
    const barW = w / barCount - 1;

    for (let i = 0; i < barCount; i++) {
      const val = remoteFreqData[i] / 255;
      const barH = val * (h - 4);
      const hue = 170 - val * 50;
      remoteSpectrumCtx.fillStyle = 'hsl(' + hue + ', 70%, 55%)';
      remoteSpectrumCtx.fillRect(
        i * (barW + 1),
        h - barH,
        barW,
        barH
      );
    }
  }

  function drawFingerprintHistory() {
    const w = fingerprintHistoryCanvas.width;
    const h = fingerprintHistoryCanvas.height;

    fingerprintHistoryCtx.fillStyle = '#0f1117';
    fingerprintHistoryCtx.fillRect(0, 0, w, h);

    if (fingerprintMatchHistory.length < 2) {
      fingerprintHistoryCtx.font = '11px sans-serif';
      fingerprintHistoryCtx.fillStyle = '#8b90a5';
      fingerprintHistoryCtx.textAlign = 'center';
      fingerprintHistoryCtx.fillText('等待比对数据...', w / 2, h / 2);
      return;
    }

    const padL = 30;
    const padR = 8;
    const padT = 8;
    const padB = 14;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    fingerprintHistoryCtx.strokeStyle = '#2e3347';
    fingerprintHistoryCtx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      fingerprintHistoryCtx.beginPath();
      fingerprintHistoryCtx.moveTo(padL, y);
      fingerprintHistoryCtx.lineTo(padL + plotW, y);
      fingerprintHistoryCtx.stroke();

      const val = 100 - (100 * i) / 4;
      fingerprintHistoryCtx.font = '9px monospace';
      fingerprintHistoryCtx.fillStyle = '#8b90a5';
      fingerprintHistoryCtx.textAlign = 'right';
      fingerprintHistoryCtx.fillText(val.toFixed(0) + '%', padL - 4, y + 3);
    }

    fingerprintHistoryCtx.strokeStyle = '#6c5ce7';
    fingerprintHistoryCtx.lineWidth = 2;
    fingerprintHistoryCtx.beginPath();
    for (let i = 0; i < fingerprintMatchHistory.length; i++) {
      const x = padL + (i / (FINGERPRINT_HISTORY_MAX - 1)) * plotW;
      const y = padT + plotH - fingerprintMatchHistory[i] * plotH;
      if (i === 0) fingerprintHistoryCtx.moveTo(x, y);
      else fingerprintHistoryCtx.lineTo(x, y);
    }
    fingerprintHistoryCtx.stroke();

    const lastIdx = fingerprintMatchHistory.length - 1;
    const lastX = padL + (lastIdx / (FINGERPRINT_HISTORY_MAX - 1)) * plotW;
    const lastY = padT + plotH - fingerprintMatchHistory[lastIdx] * plotH;
    fingerprintHistoryCtx.beginPath();
    fingerprintHistoryCtx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    fingerprintHistoryCtx.fillStyle = '#6c5ce7';
    fingerprintHistoryCtx.fill();
  }

  window.addEventListener('beforeunload', () => {
    if (chartData.length > 0) {
      saveCalibration();
    }
    stopAudioCapture();
    if (dc) dc.close();
    if (pc) pc.close();
    if (ws) ws.close();
  });

  btnCreate.addEventListener('click', createRoom);
  btnJoin.addEventListener('click', joinRoom);
  btnPlay.addEventListener('click', startPlaying);
  btnPause.addEventListener('click', pausePlaying);
  btnReset.addEventListener('click', resetPlaying);
  btnClearHistory.addEventListener('click', clearHistory);
  btnAudioStart.addEventListener('click', startAudioCapture);
  btnAudioStop.addEventListener('click', stopAudioCapture);

  inputRoomCode.addEventListener('input', () => {
    inputRoomCode.value = inputRoomCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  inputRoomCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  drawTestFrame();
  drawChart();
  drawFingerprintHistory();
  loadHistory();
})();
