const socket = io();

let currentUserId = null;
let currentRoomId = null;
let currentUsers = new Set();
let peerConnections = new Map();
let dataChannels = new Map();
let useRelayMode = false;

let messageIdCounter = 0;
const sentMessages = new Map();
const typingUsers = new Map();
let typingTimeout = null;
let isTyping = false;

const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

function generateMessageId() {
  return `${currentUserId}-${Date.now()}-${++messageIdCounter}`;
}

function showError(msg) {
  const errorEl = document.getElementById('errorMsg');
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
  setTimeout(() => {
    errorEl.style.display = 'none';
  }, 3000);
}

function createRoom() {
  const userId = document.getElementById('userId').value.trim();
  const roomId = document.getElementById('roomId').value.trim();
  
  if (!userId || !roomId) {
    showError('请输入用户ID和房间ID');
    return;
  }

  currentUserId = userId;
  currentRoomId = roomId;
  socket.emit('create-room', { roomId, userId });
}

function joinRoom() {
  const userId = document.getElementById('userId').value.trim();
  const roomId = document.getElementById('roomId').value.trim();
  
  if (!userId || !roomId) {
    showError('请输入用户ID和房间ID');
    return;
  }

  currentUserId = userId;
  currentRoomId = roomId;
  socket.emit('join-room', { roomId, userId });
}

function leaveRoom() {
  socket.emit('leave-room');
  
  for (const dc of dataChannels.values()) {
    try { dc.close(); } catch(e) {}
  }
  for (const pc of peerConnections.values()) {
    try { pc.close(); } catch(e) {}
  }
  peerConnections.clear();
  dataChannels.clear();
  currentUsers.clear();
  sentMessages.clear();
  typingUsers.clear();
  currentUserId = null;
  currentRoomId = null;

  document.getElementById('loginPanel').style.display = 'block';
  document.getElementById('chatPanel').style.display = 'none';
  document.getElementById('chatPanel').style.flexDirection = 'none';
  document.getElementById('messages').innerHTML = '';
  document.getElementById('typingIndicator').textContent = '';
}

function enterChat() {
  document.getElementById('loginPanel').style.display = 'none';
  document.getElementById('chatPanel').style.display = 'flex';
  document.getElementById('currentRoom').textContent = currentRoomId;
  updateUsersList();
  setConnectionStatus(true);
}

function updateUsersList() {
  const listEl = document.getElementById('usersList');
  listEl.innerHTML = '<span>在线用户: </span>';
  for (const user of currentUsers) {
    const span = document.createElement('span');
    span.textContent = user;
    if (user === currentUserId) {
      span.textContent += ' (你)';
    }
    listEl.appendChild(span);
  }
}

function setConnectionStatus(isRelay) {
  useRelayMode = isRelay;
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('connectionStatus');
  
  if (isRelay) {
    indicator.className = 'status-indicator relay';
    statusText.textContent = '服务器中继模式';
  } else {
    indicator.className = 'status-indicator p2p';
    statusText.textContent = 'P2P 直连模式';
  }
}

function updateTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  const typingList = Array.from(typingUsers.keys());
  
  if (typingList.length === 0) {
    indicator.textContent = '';
  } else if (typingList.length === 1) {
    indicator.textContent = `${typingList[0]} 正在输入...`;
  } else if (typingList.length === 2) {
    indicator.textContent = `${typingList[0]} 和 ${typingList[1]} 正在输入...`;
  } else {
    indicator.textContent = `${typingList.length} 人正在输入...`;
  }
}

function addMessage(from, message, via = 'p2p', timestamp = Date.now(), messageId = null) {
  const messagesEl = document.getElementById('messages');
  const div = document.createElement('div');
  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString();
  
  const isSelf = from === currentUserId;
  div.className = `message ${isSelf ? 'self' : 'other'}`;
  div.dataset.messageId = messageId || '';
  div.dataset.sender = from;
  
  div.innerHTML = `
    ${!isSelf ? `<div class="message-sender">${from}</div>` : ''}
    <div>${message}</div>
    <div class="message-via">via: ${via}</div>
    <div class="message-time">${timeStr}</div>
    ${isSelf ? `<div class="read-status" id="read-${messageId}">未读</div>` : ''}
  `;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  if (isSelf && messageId) {
    sentMessages.set(messageId, { elementId: `read-${messageId}`, readers: new Set() });
  }
  
  if (!isSelf && messageId) {
    sendReadReceipt(messageId, from);
  }
  
  return div;
}

function addSystemMessage(text) {
  const messagesEl = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  
  if (!message) return;
  
  input.value = '';
  sendTypingState(false);
  
  const timestamp = Date.now();
  const messageId = generateMessageId();
  const p2pSentUsers = new Set();

  const msgData = {
    type: 'message',
    messageId,
    from: currentUserId,
    message,
    timestamp,
    via: 'p2p'
  };

  for (const [userId, dc] of dataChannels) {
    if (dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify(msgData));
        p2pSentUsers.add(userId);
      } catch(e) {
        console.error('P2P send failed:', e);
      }
    }
  }

  if (useRelayMode || p2pSentUsers.size === 0) {
    socket.emit('relay-message', {
      to: null,
      from: currentUserId,
      message,
      timestamp
    });
  } else {
    const relayTargets = Array.from(currentUsers).filter(
      u => u !== currentUserId && !p2pSentUsers.has(u)
    );
    for (const targetUser of relayTargets) {
      socket.emit('relay-message', {
        to: targetUser,
        from: currentUserId,
        message,
        timestamp
      });
    }
  }

  addMessage(currentUserId, message, 'p2p/relay', timestamp, messageId);
}

function handleKeyPress(e) {
  if (e.key === 'Enter') {
    sendMessage();
  }
}

function handleInput() {
  const input = document.getElementById('messageInput');
  if (input.value.trim()) {
    sendTypingState(true);
  } else {
    sendTypingState(false);
  }
}

function sendTypingState(isTypingNow) {
  if (isTypingNow === isTyping) return;
  isTyping = isTypingNow;
  
  const data = JSON.stringify({
    type: 'typing',
    userId: currentUserId,
    isTyping: isTypingNow
  });
  
  for (const [userId, dc] of dataChannels) {
    if (dc.readyState === 'open') {
      try {
        dc.send(data);
      } catch(e) {}
    }
  }
  
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
  
  if (isTypingNow) {
    typingTimeout = setTimeout(() => {
      sendTypingState(false);
    }, 3000);
  }
}

function sendReadReceipt(messageId, toUserId) {
  const data = JSON.stringify({
    type: 'read',
    messageId,
    readerId: currentUserId
  });
  
  const dc = dataChannels.get(toUserId);
  if (dc && dc.readyState === 'open') {
    try {
      dc.send(data);
    } catch(e) {}
  }
}

function handleDataChannelMessage(data) {
  switch (data.type) {
    case 'message':
      addMessage(data.from, data.message, data.via || 'p2p', data.timestamp, data.messageId);
      break;
      
    case 'typing':
      if (data.userId !== currentUserId) {
        if (data.isTyping) {
          typingUsers.set(data.userId, true);
        } else {
          typingUsers.delete(data.userId);
        }
        updateTypingIndicator();
      }
      break;
      
    case 'read':
      const msgInfo = sentMessages.get(data.messageId);
      if (msgInfo) {
        msgInfo.readers.add(data.readerId);
        const readEl = document.getElementById(msgInfo.elementId);
        if (readEl) {
          const totalOthers = Array.from(currentUsers).filter(u => u !== currentUserId).length;
          if (msgInfo.readers.size >= totalOthers) {
            readEl.textContent = '已读';
          } else {
            readEl.textContent = `已读 (${msgInfo.readers.size}/${totalOthers})`;
          }
        }
      }
      break;
  }
}

async function createPeerConnection(targetUserId) {
  if (peerConnections.has(targetUserId)) {
    return peerConnections.get(targetUserId);
  }

  const pc = new RTCPeerConnection(iceServers);
  peerConnections.set(targetUserId, pc);

  const dc = pc.createDataChannel('chat');
  setupDataChannel(dc, targetUserId);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', {
        to: targetUserId,
        from: currentUserId,
        candidate: event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'connected') {
      socket.emit('p2p-connected', { userId: currentUserId });
      setConnectionStatus(false);
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      socket.emit('p2p-disconnected', { userId: currentUserId });
      setConnectionStatus(true);
    }
  };

  pc.ondatachannel = (event) => {
    setupDataChannel(event.channel, targetUserId);
  };

  return pc;
}

function setupDataChannel(dc, targetUserId) {
  dataChannels.set(targetUserId, dc);

  dc.onopen = () => {
    console.log('Data channel opened with', targetUserId);
    setConnectionStatus(false);
    addSystemMessage(`与 ${targetUserId} P2P 连接已建立`);
  };

  dc.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleDataChannelMessage(data);
    } catch(e) {
      console.error('Parse error:', e);
    }
  };

  dc.onclose = () => {
    console.log('Data channel closed');
    typingUsers.delete(targetUserId);
    updateTypingIndicator();
    setConnectionStatus(true);
    addSystemMessage(`与 ${targetUserId} P2P 连接已断开，切换到中继模式`);
  };

  dc.onerror = (error) => {
    console.error('Data channel error:', error);
  };
}

async function initiateConnection(targetUserId) {
  const pc = await createPeerConnection(targetUserId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit('offer', {
    to: targetUserId,
    from: currentUserId,
    offer
  });
}

socket.on('room-created', () => {
  currentUsers.add(currentUserId);
  enterChat();
  addSystemMessage('房间创建成功，等待其他用户加入...');
});

socket.on('room-exists', () => {
  showError('房间已存在');
});

socket.on('room-joined', ({ otherUsers }) => {
  currentUsers.add(currentUserId);
  otherUsers.forEach(u => currentUsers.add(u));
  enterChat();
  addSystemMessage('成功加入房间');
  
  otherUsers.forEach(user => {
    initiateConnection(user);
  });
});

socket.on('room-not-found', () => {
  showError('房间不存在');
});

socket.on('user-joined', ({ userId }) => {
  currentUsers.add(userId);
  updateUsersList();
  addSystemMessage(`${userId} 加入了房间`);
});

socket.on('user-left', ({ userId }) => {
  currentUsers.delete(userId);
  updateUsersList();
  typingUsers.delete(userId);
  updateTypingIndicator();
  addSystemMessage(`${userId} 离开了房间`);
  
  if (peerConnections.has(userId)) {
    peerConnections.get(userId).close();
    peerConnections.delete(userId);
  }
  if (dataChannels.has(userId)) {
    dataChannels.delete(userId);
  }
});

socket.on('offer', async ({ from, offer }) => {
  const pc = await createPeerConnection(from);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  
  socket.emit('answer', {
    to: from,
    from: currentUserId,
    answer
  });
});

socket.on('answer', async ({ from, answer }) => {
  const pc = peerConnections.get(from);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = peerConnections.get(from);
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
});

socket.on('receive-message', ({ from, message, via, timestamp }) => {
  if (from !== currentUserId) {
    addMessage(from, message, via, timestamp);
  }
});

socket.on('offline-messages', ({ messages }) => {
  addSystemMessage('收到离线消息:');
  messages.forEach(msg => {
    addMessage(msg.from, msg.message, msg.via, msg.timestamp);
  });
});

socket.on('p2p-status', ({ userId, connected }) => {
  if (connected) {
    addSystemMessage(`${userId} P2P 已连接`);
  } else {
    addSystemMessage(`${userId} P2P 已断开`);
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  addSystemMessage('与服务器断开连接');
});
