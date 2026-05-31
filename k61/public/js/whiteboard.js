class Whiteboard {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.currentPath = [];
        this.paths = [];
        this.eraserPaths = [];
        this.tool = 'pen';
        this.color = '#000000';
        this.size = 5;
        this.lastPoint = null;
        this.lastSampleTime = 0;
        this.SAMPLE_TIME_THRESHOLD = 16;
        this.SAMPLE_DISTANCE_THRESHOLD = 3;
        this.currentSpeed = 0;
        this.lastDrawTime = 0;
        this.dynamicEraserSize = 10;
        this.pressureSensitivity = true;
        this.MIN_ERASER_SIZE = 5;
        this.MAX_ERASER_SIZE = 80;
        this.SPEED_MULTIPLIER = 0.8;

        this.onPathComplete = null;
        this.onEraserComplete = null;

        this.initCanvas();
        this.bindEvents();
    }

    initCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth - 40;
        this.canvas.height = container.clientHeight - 40;
        
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    bindEvents() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));

        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            t: Date.now()
        };
    }

    calculateDistance(p1, p2) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    shouldSamplePoint(newPoint, lastPoint) {
        if (!lastPoint) return true;
        
        const timeDiff = newPoint.t - this.lastSampleTime;
        const distance = this.calculateDistance(newPoint, lastPoint);
        
        return timeDiff >= this.SAMPLE_TIME_THRESHOLD || 
               distance >= this.SAMPLE_DISTANCE_THRESHOLD;
    }

    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.startDrawing({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }

    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        this.draw({
            clientX: touch.clientX,
            clientY: touch.clientY
        });
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.currentPath = [pos];
        this.lastPoint = pos;
        this.lastSampleTime = pos.t;
        this.lastDrawTime = pos.t;
        this.currentSpeed = 0;
        this.dynamicEraserSize = this.size * 2;

        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        
        if (this.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            const eraserSize = this.pressureSensitivity ? this.dynamicEraserSize : this.size * 2;
            this.ctx.lineWidth = eraserSize;
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
        }
        
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    calculateSpeed(pos) {
        if (!this.lastPoint) return 0;
        const distance = this.calculateDistance(pos, this.lastPoint);
        const timeDiff = Math.max(1, pos.t - this.lastDrawTime);
        return distance / timeDiff;
    }

    updateDynamicEraserSize(speed) {
        const baseSize = this.size * 2;
        const speedBonus = speed * this.SPEED_MULTIPLIER;
        this.dynamicEraserSize = Math.min(
            this.MAX_ERASER_SIZE,
            Math.max(this.MIN_ERASER_SIZE, baseSize + speedBonus)
        );
        return this.dynamicEraserSize;
    }

    draw(e) {
        if (!this.isDrawing) return;

        const pos = this.getMousePos(e);
        const speed = this.calculateSpeed(pos);
        this.currentSpeed = speed;
        this.lastDrawTime = pos.t;

        if (this.shouldSamplePoint(pos, this.lastPoint)) {
            const pointData = { x: pos.x, y: pos.y, t: pos.t };
            
            if (this.tool === 'eraser' && this.pressureSensitivity) {
                const dynamicSize = this.updateDynamicEraserSize(speed);
                pointData.pressure = dynamicSize;
                
                this.ctx.beginPath();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.lineWidth = dynamicSize;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            } else {
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            }
            
            this.currentPath.push(pointData);
            this.lastSampleTime = pos.t;
            this.lastPoint = pos;
        } else {
            if (this.tool === 'eraser' && this.pressureSensitivity) {
                const dynamicSize = this.updateDynamicEraserSize(speed);
                this.ctx.beginPath();
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.lineWidth = dynamicSize;
                this.ctx.lineCap = 'round';
                this.ctx.lineJoin = 'round';
                this.ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            } else {
                this.ctx.lineTo(pos.x, pos.y);
                this.ctx.stroke();
            }
            this.lastPoint = pos;
        }
    }

    interpolatePath(points, minDistance = 2) {
        if (points.length < 2) return points;
        
        const result = [points[0]];
        
        for (let i = 1; i < points.length; i++) {
            const prev = result[result.length - 1];
            const curr = points[i];
            const dist = this.calculateDistance(prev, curr);
            
            if (dist > minDistance) {
                const steps = Math.ceil(dist / minDistance);
                for (let j = 1; j < steps; j++) {
                    const ratio = j / steps;
                    result.push({
                        x: prev.x + (curr.x - prev.x) * ratio,
                        y: prev.y + (curr.y - prev.y) * ratio,
                        t: prev.t + (curr.t - prev.t) * ratio
                    });
                }
            }
            
            result.push(curr);
        }
        
        return result;
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.currentPath.length > 0) {
            if (this.lastPoint && this.currentPath.length > 0) {
                const lastInPath = this.currentPath[this.currentPath.length - 1];
                if (lastInPath.x !== this.lastPoint.x || lastInPath.y !== this.lastPoint.y) {
                    this.currentPath.push({ 
                        x: this.lastPoint.x, 
                        y: this.lastPoint.y, 
                        t: Date.now() 
                    });
                }
            }
        }

        if (this.currentPath.length >= 2) {
            const interpolatedPoints = this.interpolatePath(this.currentPath, this.SAMPLE_DISTANCE_THRESHOLD);
            
            if (this.tool === 'eraser') {
                const eraserPath = {
                    type: 'eraser',
                    points: interpolatedPoints,
                    size: this.pressureSensitivity ? this.dynamicEraserSize : this.size * 2,
                    pressureSensitivity: this.pressureSensitivity,
                    timestamp: Date.now()
                };
                this.eraserPaths.push(eraserPath);
                if (this.onEraserComplete) {
                    this.onEraserComplete(eraserPath);
                }
            } else {
                const path = {
                    type: 'pen',
                    points: interpolatedPoints,
                    color: this.color,
                    size: this.size,
                    timestamp: Date.now()
                };
                this.paths.push(path);
                if (this.onPathComplete) {
                    this.onPathComplete(path);
                }
            }
        } else if (this.currentPath.length === 1) {
            const point = this.currentPath[0];
            const singlePointPath = [
                point,
                { x: point.x + 0.1, y: point.y + 0.1, t: point.t + 1 }
            ];
            
            if (this.tool === 'eraser') {
                const eraserPath = {
                    type: 'eraser',
                    points: singlePointPath,
                    size: this.pressureSensitivity ? this.dynamicEraserSize : this.size * 2,
                    pressureSensitivity: this.pressureSensitivity,
                    timestamp: Date.now()
                };
                this.eraserPaths.push(eraserPath);
                if (this.onEraserComplete) {
                    this.onEraserComplete(eraserPath);
                }
            } else {
                const path = {
                    type: 'pen',
                    points: singlePointPath,
                    color: this.color,
                    size: this.size,
                    timestamp: Date.now()
                };
                this.paths.push(path);
                if (this.onPathComplete) {
                    this.onPathComplete(path);
                }
            }
        }

        this.currentPath = [];
        this.ctx.globalCompositeOperation = 'source-over';
    }

    drawPath(path) {
        if (!path || !path.points || path.points.length < 2) return;

        if (path.type === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            if (path.pressureSensitivity && path.points[0].pressure !== undefined) {
                for (let i = 1; i < path.points.length; i++) {
                    this.ctx.beginPath();
                    this.ctx.lineWidth = path.points[i].pressure || path.size || 10;
                    this.ctx.moveTo(path.points[i - 1].x, path.points[i - 1].y);
                    this.ctx.lineTo(path.points[i].x, path.points[i].y);
                    this.ctx.stroke();
                }
            } else {
                this.ctx.beginPath();
                this.ctx.moveTo(path.points[0].x, path.points[0].y);
                this.ctx.lineWidth = path.size || 10;
                for (let i = 1; i < path.points.length; i++) {
                    this.ctx.lineTo(path.points[i].x, path.points[i].y);
                }
                this.ctx.stroke();
            }
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = path.color || '#000000';
            this.ctx.lineWidth = path.size || 5;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) {
                this.ctx.lineTo(path.points[i].x, path.points[i].y);
            }
            this.ctx.stroke();
        }
        
        this.ctx.globalCompositeOperation = 'source-over';
    }

    redrawAll() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.paths.forEach(path => this.drawPath(path));
        this.eraserPaths.forEach(path => this.drawPath(path));
    }

    setTool(tool) {
        this.tool = tool;
        if (tool === 'eraser') {
            this.canvas.classList.add('eraser');
        } else {
            this.canvas.classList.remove('eraser');
        }
    }

    setColor(color) {
        this.color = color;
    }

    setSize(size) {
        this.size = size;
    }

    setPressureSensitivity(enabled) {
        this.pressureSensitivity = enabled;
    }

    clear() {
        this.paths = [];
        this.eraserPaths = [];
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    loadState(paths, eraserPaths) {
        this.paths = paths || [];
        this.eraserPaths = eraserPaths || [];
        this.redrawAll();
    }

    addRemotePath(path) {
        this.paths.push(path);
        this.drawPath(path);
    }

    addRemoteEraserPath(path) {
        this.eraserPaths.push(path);
        this.drawPath(path);
    }

    async playReplayAnimation(snapshots, speed = 1, onProgress = null) {
        if (!snapshots || snapshots.length === 0) return;

        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        let allEvents = [];
        
        for (const snapshot of snapshots) {
            if (!snapshot.data) continue;
            const { paths = [], eraserPaths = [] } = snapshot.data;
            const snapshotTime = new Date(snapshot.createdAt).getTime();

            for (const path of paths) {
                allEvents.push({ type: 'pen', path, time: snapshotTime + (path.timestamp || 0) });
            }
            for (const ePath of eraserPaths) {
                allEvents.push({ type: 'eraser', path: ePath, time: snapshotTime + (ePath.timestamp || 0) });
            }
        }

        allEvents.sort((a, b) => a.time - b.time);

        if (allEvents.length === 0) return;

        const startTime = allEvents[0].time;
        const totalDuration = allEvents[allEvents.length - 1].time - startTime;
        const playbackDuration = totalDuration / speed;
        const playbackStart = Date.now();

        let eventIndex = 0;

        return new Promise((resolve) => {
            const animate = () => {
                const elapsed = (Date.now() - playbackStart) * speed;
                const currentTime = startTime + elapsed;

                while (eventIndex < allEvents.length && allEvents[eventIndex].time <= currentTime) {
                    const event = allEvents[eventIndex];
                    this.drawPath(event.path);

                    if (event.type === 'eraser') {
                        this.eraserPaths.push(event.path);
                    } else {
                        this.paths.push(event.path);
                    }

                    eventIndex++;
                }

                if (onProgress) {
                    const progress = totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 1;
                    onProgress(progress);
                }

                if (eventIndex < allEvents.length) {
                    this._replayAnimationId = requestAnimationFrame(animate);
                } else {
                    if (onProgress) onProgress(1);
                    this._replayAnimationId = null;
                    resolve();
                }
            };

            this._replayAnimationId = requestAnimationFrame(animate);
        });
    }

    stopReplayAnimation() {
        if (this._replayAnimationId) {
            cancelAnimationFrame(this._replayAnimationId);
            this._replayAnimationId = null;
        }
    }

    resize() {
        const container = this.canvas.parentElement;
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        
        this.canvas.width = container.clientWidth - 40;
        this.canvas.height = container.clientHeight - 40;
        
        this.ctx.putImageData(imageData, 0, 0);
    }
}
