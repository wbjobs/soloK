class WhiteboardApp {
    constructor() {
        this.whiteboard = new Whiteboard('whiteboard');
        this.ws = null;
        this.roomId = 'default';
        this.compressionMode = 'lossy';
        this.isReplaying = false;
        this.stats = {
            totalOriginalSize: 0,
            totalCompressedSize: 0,
            totalTransferred: 0,
            history: []
        };

        this.initUI();
        this.connectWebSocket();
    }

    initUI() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.whiteboard.setTool(e.target.dataset.tool);
            });
        });

        document.getElementById('colorPicker').addEventListener('change', (e) => {
            this.whiteboard.setColor(e.target.value);
        });

        document.getElementById('sizePicker').addEventListener('input', (e) => {
            this.whiteboard.setSize(parseInt(e.target.value));
            document.getElementById('sizeValue').textContent = e.target.value;
        });

        document.getElementById('joinBtn').addEventListener('click', () => {
            const newRoomId = document.getElementById('roomId').value.trim();
            if (newRoomId) {
                this.joinRoom(newRoomId);
            }
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            this.sendClear();
        });

        document.getElementById('replayBtn').addEventListener('click', () => {
            this.startReplay();
        });

        document.getElementById('stopReplayBtn').addEventListener('click', () => {
            this.stopReplay();
        });

        const pressureToggle = document.getElementById('pressureToggle');
        if (pressureToggle) {
            pressureToggle.addEventListener('change', (e) => {
                this.whiteboard.setPressureSensitivity(e.target.checked);
            });
        }

        document.querySelectorAll('input[name="compressionMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.setCompressionMode(e.target.value);
            });
        });

        this.whiteboard.onPathComplete = (path) => {
            this.sendDraw(path);
        };

        this.whiteboard.onEraserComplete = (path) => {
            this.sendErase(path);
        };

        window.addEventListener('resize', () => {
            this.whiteboard.resize();
        });
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.updateConnectionStatus(true);
            this.joinRoom(this.roomId);
        };

        this.ws.onmessage = (event) => {
            this.handleMessage(JSON.parse(event.data));
            this.stats.totalTransferred += new TextEncoder().encode(event.data).length;
            this.updateStatsDisplay();
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateConnectionStatus(false);
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus(false);
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'init':
                this.handleInit(message);
                break;
            case 'draw':
                this.handleDraw(message);
                break;
            case 'erase':
                this.handleErase(message);
                break;
            case 'clear':
                if (!this.isReplaying) this.whiteboard.clear();
                break;
            case 'userCount':
                document.getElementById('userCount').textContent = `在线: ${message.count}`;
                break;
            case 'replay':
                this.handleReplayData(message);
                break;
            case 'compressionMode':
                this.compressionMode = message.mode;
                const modeRadio = document.querySelector(`input[name="compressionMode"][value="${message.mode}"]`);
                if (modeRadio) modeRadio.checked = true;
                break;
        }
    }

    handleInit(message) {
        this.roomId = message.roomId;
        this.whiteboard.loadState(message.paths, message.eraserPaths);
    }

    handleDraw(message) {
        const path = diffDecompress(message.path);
        if (path) {
            this.whiteboard.addRemotePath(path);
            if (message.compressionStats) {
                this.updateCompressionStats(message.compressionStats, '画笔');
            }
        }
    }

    handleErase(message) {
        const path = diffDecompress(message.eraserPath);
        if (path) {
            this.whiteboard.addRemoteEraserPath(path);
            if (message.compressionStats) {
                this.updateCompressionStats(message.compressionStats, '橡皮擦');
            }
        }
    }

    joinRoom(roomId) {
        this.roomId = roomId;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'join',
                roomId: roomId
            }));
        }
    }

    sendDraw(path) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'draw',
                roomId: this.roomId,
                path: path,
                compressionMode: this.compressionMode
            }));
        }
    }

    sendErase(path) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'erase',
                roomId: this.roomId,
                eraserPath: path,
                compressionMode: this.compressionMode
            }));
        }
    }

    sendClear() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.whiteboard.clear();
            this.ws.send(JSON.stringify({
                type: 'clear',
                roomId: this.roomId
            }));
        }
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (connected) {
            statusEl.textContent = '已连接';
            statusEl.classList.add('connected');
        } else {
            statusEl.textContent = '未连接';
            statusEl.classList.remove('connected');
        }
    }

    updateCompressionStats(stats, toolType) {
        this.stats.totalOriginalSize += stats.originalSize;
        this.stats.totalCompressedSize += stats.compressedSize;

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        
        this.stats.history.unshift({
            time: timeStr,
            tool: toolType,
            original: stats.originalSize,
            compressed: stats.compressedSize,
            ratio: stats.ratio,
            mode: stats.mode || this.compressionMode
        });

        if (this.stats.history.length > 20) {
            this.stats.history.pop();
        }

        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        document.getElementById('originalSize').textContent = formatBytes(this.stats.totalOriginalSize);
        document.getElementById('compressedSize').textContent = formatBytes(this.stats.totalCompressedSize);
        
        const overallRatio = this.stats.totalOriginalSize > 0 
            ? calculateCompressionRatio(this.stats.totalOriginalSize, this.stats.totalCompressedSize)
            : 0;
        document.getElementById('compressionRatio').textContent = `${overallRatio}%`;
        
        document.getElementById('totalTransferred').textContent = formatBytes(this.stats.totalTransferred);

        const logEl = document.getElementById('compressionLog');
        logEl.innerHTML = this.stats.history.map(item => `
            <li>
                ${item.time} - ${item.tool} [${item.mode || 'lossy'}]: ${formatBytes(item.original)} → ${formatBytes(item.compressed)} (${item.ratio}%)
            </li>
        `).join('');
    }

    async startReplay() {
        if (this.isReplaying) return;

        const hours = parseFloat(document.getElementById('replayHours')?.value) || 1;
        const speed = parseFloat(document.getElementById('replaySpeed')?.value) || 4;
        
        this.isReplaying = true;
        const replayBtn = document.getElementById('replayBtn');
        const stopReplayBtn = document.getElementById('stopReplayBtn');
        const replayProgress = document.getElementById('replayProgress');
        
        if (replayBtn) replayBtn.disabled = true;
        if (stopReplayBtn) stopReplayBtn.disabled = false;

        try {
            const response = await fetch(`/api/snapshots/${this.roomId}?hours=${hours}`);
            const result = await response.json();

            if (!result.success || !result.snapshots || result.snapshots.length === 0) {
                alert('没有找到回放数据');
                return;
            }

            await this.whiteboard.playReplayAnimation(result.snapshots, speed, (progress) => {
                if (replayProgress) {
                    replayProgress.value = progress * 100;
                    replayProgress.textContent = `${Math.round(progress * 100)}%`;
                }
            });
        } catch (error) {
            console.error('Replay error:', error);
            alert('回放失败: ' + error.message);
        } finally {
            this.isReplaying = false;
            if (replayBtn) replayBtn.disabled = false;
            if (stopReplayBtn) stopReplayBtn.disabled = true;
            if (replayProgress) {
                replayProgress.value = 0;
                replayProgress.textContent = '0%';
            }
        }
    }

    stopReplay() {
        this.whiteboard.stopReplayAnimation();
        this.isReplaying = false;
        
        const replayBtn = document.getElementById('replayBtn');
        const stopReplayBtn = document.getElementById('stopReplayBtn');
        const replayProgress = document.getElementById('replayProgress');
        
        if (replayBtn) replayBtn.disabled = false;
        if (stopReplayBtn) stopReplayBtn.disabled = true;
        if (replayProgress) {
            replayProgress.value = 0;
            replayProgress.textContent = '0%';
        }
        
        this.whiteboard.redrawAll();
    }

    handleReplayData(message) {
        if (message.snapshots && message.snapshots.length > 0) {
            this.whiteboard.playReplayAnimation(message.snapshots, 4, (progress) => {
                const replayProgress = document.getElementById('replayProgress');
                if (replayProgress) {
                    replayProgress.value = progress * 100;
                    replayProgress.textContent = `${Math.round(progress * 100)}%`;
                }
            });
        }
    }

    setCompressionMode(mode) {
        this.compressionMode = mode;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'setCompressionMode',
                mode: mode
            }));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WhiteboardApp();
});
