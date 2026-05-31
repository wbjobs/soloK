class SingleModeEditor {
    constructor(app) {
        this.app = app;
        this.originalImage = null;
        this.originalImageUrl = null;
        this.fileId = null;
        this.referenceImageId = null;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.brushSize = 30;
        this.history = [];
        this.currentTaskId = null;
        this.generatedImageUrl = null;
        
        this.initElements();
        this.initEventListeners();
    }
    
    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.editorSection = document.getElementById('editorSection');
        
        this.imageCanvas = document.getElementById('imageCanvas');
        this.maskCanvas = document.getElementById('maskCanvas');
        this.imageCtx = this.imageCanvas.getContext('2d');
        this.maskCtx = this.maskCanvas.getContext('2d');
        
        this.brushSizeSlider = document.getElementById('brushSize');
        this.brushSizeValue = document.getElementById('brushSizeValue');
        this.clearMaskBtn = document.getElementById('clearMaskBtn');
        this.undoBtn = document.getElementById('undoBtn');
        this.showMaskToggle = document.getElementById('showMaskToggle');
        
        this.referenceUpload = document.getElementById('referenceUpload');
        this.referenceInput = document.getElementById('referenceInput');
        this.referencePreview = document.getElementById('referencePreview');
        
        this.promptInput = document.getElementById('promptInput');
        this.stepsInput = document.getElementById('stepsInput');
        this.guidanceInput = document.getElementById('guidanceInput');
        this.strengthInput = document.getElementById('strengthInput');
        this.generateBtn = document.getElementById('generateBtn');
    }
    
    initEventListeners() {
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        this.maskCanvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.maskCanvas.addEventListener('mousemove', (e) => this.draw(e));
        this.maskCanvas.addEventListener('mouseup', () => this.stopDrawing());
        this.maskCanvas.addEventListener('mouseleave', () => this.stopDrawing());
        
        this.maskCanvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.maskCanvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.maskCanvas.addEventListener('touchend', () => this.stopDrawing());
        
        this.brushSizeSlider.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            this.brushSizeValue.textContent = `${this.brushSize}px`;
        });
        
        this.clearMaskBtn.addEventListener('click', () => this.clearMask());
        this.undoBtn.addEventListener('click', () => this.undo());
        this.showMaskToggle.addEventListener('change', (e) => {
            this.maskCanvas.style.opacity = e.target.checked ? '0.7' : '0';
        });
        
        this.referenceUpload.addEventListener('click', () => this.referenceInput.click());
        this.referenceInput.addEventListener('change', (e) => this.handleReferenceSelect(e));
        
        document.querySelectorAll('.suggestion-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                this.promptInput.value = tag.dataset.prompt;
            });
        });
        
        this.generateBtn.addEventListener('click', () => this.generate());
    }
    
    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }
    
    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) this.loadImage(files[0]);
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) this.loadImage(file);
    }
    
    async loadImage(file) {
        if (!file.type.startsWith('image/')) {
            this.app.showToast('请选择图片文件', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('上传失败');
            
            const data = await response.json();
            this.fileId = data.file_id;
            this.originalImageUrl = data.url;
            
            this.originalImage = new Image();
            this.originalImage.onload = () => {
                this.setupCanvas();
                this.editorSection.style.display = 'grid';
                this.app.showToast('图片上传成功！请涂抹需要重绘的区域', 'success');
            };
            this.originalImage.src = this.originalImageUrl;
            
        } catch (error) {
            console.error('Upload error:', error);
            this.app.showToast('图片上传失败：' + error.message, 'error');
        }
    }
    
    async handleReferenceSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            this.app.showToast('请选择图片文件', 'error');
            return;
        }
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/api/upload-reference', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('上传失败');
            
            const data = await response.json();
            this.referenceImageId = data.file_id;
            
            const img = document.createElement('img');
            img.src = data.url;
            this.referencePreview.innerHTML = '';
            this.referencePreview.appendChild(img);
            
            this.app.showToast('参考图上传成功！AI将提取其风格', 'success');
            
        } catch (error) {
            console.error('Reference upload error:', error);
            this.app.showToast('参考图上传失败：' + error.message, 'error');
        }
    }
    
    setupCanvas() {
        const maxWidth = 700;
        const maxHeight = 450;
        let width = this.originalImage.width;
        let height = this.originalImage.height;
        
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
        }
        
        this.imageCanvas.width = width;
        this.imageCanvas.height = height;
        this.maskCanvas.width = width;
        this.maskCanvas.height = height;
        
        this.imageCtx.drawImage(this.originalImage, 0, 0, width, height);
        
        this.maskCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        this.maskCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        this.maskCtx.lineCap = 'round';
        this.maskCtx.lineJoin = 'round';
    }
    
    getCanvasCoords(e) {
        const rect = this.maskCanvas.getBoundingClientRect();
        const scaleX = this.maskCanvas.width / rect.width;
        const scaleY = this.maskCanvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        const coords = this.getCanvasCoords(e);
        this.lastX = coords.x;
        this.lastY = coords.y;
        this.saveHistory();
        this.maskCtx.lineWidth = this.brushSize;
        this.maskCtx.beginPath();
        this.maskCtx.arc(coords.x, coords.y, this.brushSize / 2, 0, Math.PI * 2);
        this.maskCtx.fill();
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        const coords = this.getCanvasCoords(e);
        
        this.maskCtx.lineWidth = this.brushSize;
        this.maskCtx.beginPath();
        this.maskCtx.moveTo(this.lastX, this.lastY);
        this.maskCtx.lineTo(coords.x, coords.y);
        this.maskCtx.stroke();
        
        this.maskCtx.beginPath();
        this.maskCtx.arc(coords.x, coords.y, this.brushSize / 2, 0, Math.PI * 2);
        this.maskCtx.fill();
        
        this.lastX = coords.x;
        this.lastY = coords.y;
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.startDrawing(mouseEvent);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.draw(mouseEvent);
    }
    
    saveHistory() {
        const maskData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.history.push(maskData);
        if (this.history.length > 20) this.history.shift();
    }
    
    undo() {
        if (this.history.length > 0) {
            const previousData = this.history.pop();
            this.maskCtx.putImageData(previousData, 0, 0);
        }
    }
    
    clearMask() {
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        this.history = [];
    }
    
    hasMask() {
        const imageData = this.maskCtx.getImageData(0, 0, this.maskCanvas.width, this.maskCanvas.height);
        for (let i = 3; i < imageData.data.length; i += 4) {
            if (imageData.data[i] > 0) return true;
        }
        return false;
    }
    
    getMaskData() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.maskCanvas.width;
        tempCanvas.height = this.maskCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.maskCanvas, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            if (imageData.data[i + 3] > 0) {
                imageData.data[i] = 255;
                imageData.data[i + 1] = 255;
                imageData.data[i + 2] = 255;
                imageData.data[i + 3] = 255;
            }
        }
        
        tempCtx.putImageData(imageData, 0, 0);
        return tempCanvas.toDataURL('image/png');
    }
    
    async generate() {
        if (!this.hasMask()) {
            this.app.showToast('请先用画笔涂抹需要重绘的区域', 'error');
            return;
        }
        
        const prompt = this.promptInput.value.trim();
        if (!prompt) {
            this.app.showToast('请输入提示词', 'error');
            return;
        }
        
        this.generateBtn.disabled = true;
        this.app.showProgress();
        
        const formData = new FormData();
        formData.append('original_image_id', this.fileId);
        formData.append('mask_data', this.getMaskData());
        formData.append('prompt', prompt);
        if (this.referenceImageId) {
            formData.append('reference_image_id', this.referenceImageId);
        }
        formData.append('num_inference_steps', this.stepsInput.value);
        formData.append('guidance_scale', this.guidanceInput.value);
        formData.append('strength', this.strengthInput.value);
        
        try {
            const response = await fetch('/api/inpaint', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('生成请求失败');
            
            const data = await response.json();
            this.currentTaskId = data.id;
            
        } catch (error) {
            console.error('Generate error:', error);
            this.app.showToast('生成失败：' + error.message, 'error');
            this.generateBtn.disabled = false;
            this.app.hideProgress();
        }
    }
    
    handleProgress(data) {
        if (data.task_id !== this.currentTaskId) return;
        this.app.updateProgress(data);
        
        if (data.status === 'completed' && data.generated_url) {
            this.generatedImageUrl = data.generated_url;
            setTimeout(() => {
                this.app.showResults(this.originalImageUrl, this.generatedImageUrl);
                this.generateBtn.disabled = false;
            }, 500);
        } else if (data.status === 'failed') {
            this.generateBtn.disabled = false;
            this.app.showToast('生成失败：' + (data.error || '未知错误'), 'error');
        }
    }
    
    reset() {
        this.originalImage = null;
        this.originalImageUrl = null;
        this.fileId = null;
        this.referenceImageId = null;
        this.currentTaskId = null;
        this.generatedImageUrl = null;
        this.history = [];
        
        this.editorSection.style.display = 'none';
        this.clearMask();
        this.fileInput.value = '';
        this.referencePreview.innerHTML = '<span class="reference-placeholder">点击上传参考图，AI将提取其风格</span>';
    }
}

class BatchModeEditor {
    constructor(app) {
        this.app = app;
        this.images = [];
        this.selectedIndex = 0;
        this.referenceImageId = null;
        this.batchId = null;
        this.brushSize = 30;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.history = [];
        
        this.initElements();
        this.initEventListeners();
    }
    
    initElements() {
        this.batchUploadArea = document.getElementById('batchUploadArea');
        this.batchFileInput = document.getElementById('batchFileInput');
        this.batchList = document.getElementById('batchList');
        this.batchGrid = document.getElementById('batchGrid');
        this.batchCount = document.getElementById('batchCount');
        this.batchEditor = document.getElementById('batchEditor');
        this.batchProgress = document.getElementById('batchProgress');
        
        this.batchImageCanvas = document.getElementById('batchImageCanvas');
        this.batchMaskCanvas = document.getElementById('batchMaskCanvas');
        this.batchImageCtx = this.batchImageCanvas.getContext('2d');
        this.batchMaskCtx = this.batchMaskCanvas.getContext('2d');
        
        this.batchBrushSize = document.getElementById('batchBrushSize');
        this.batchBrushSizeValue = document.getElementById('batchBrushSizeValue');
        this.batchClearMaskBtn = document.getElementById('batchClearMaskBtn');
        this.batchUndoBtn = document.getElementById('batchUndoBtn');
        
        this.batchReferenceUpload = document.getElementById('batchReferenceUpload');
        this.batchReferenceInput = document.getElementById('batchReferenceInput');
        this.batchReferencePreview = document.getElementById('batchReferencePreview');
        
        this.batchPromptInput = document.getElementById('batchPromptInput');
        this.batchGenerateBtn = document.getElementById('batchGenerateBtn');
        
        this.batchProgressFill = document.getElementById('batchProgressFill');
        this.batchProgressPercent = document.getElementById('batchProgressPercent');
        this.batchProgressStatus = document.getElementById('batchProgressStatus');
        this.batchProgressDetail = document.getElementById('batchProgressDetail');
    }
    
    initEventListeners() {
        this.batchUploadArea.addEventListener('click', () => this.batchFileInput.click());
        this.batchUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.batchUploadArea.classList.add('dragover');
        });
        this.batchUploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.batchUploadArea.classList.remove('dragover');
        });
        this.batchUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.batchUploadArea.classList.remove('dragover');
            this.handleFiles(e.dataTransfer.files);
        });
        this.batchFileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
        
        this.batchMaskCanvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.batchMaskCanvas.addEventListener('mousemove', (e) => this.draw(e));
        this.batchMaskCanvas.addEventListener('mouseup', () => this.stopDrawing());
        this.batchMaskCanvas.addEventListener('mouseleave', () => this.stopDrawing());
        
        this.batchBrushSize.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            this.batchBrushSizeValue.textContent = `${this.brushSize}px`;
        });
        
        this.batchClearMaskBtn.addEventListener('click', () => this.clearCurrentMask());
        this.batchUndoBtn.addEventListener('click', () => this.undo());
        
        this.batchReferenceUpload.addEventListener('click', () => this.batchReferenceInput.click());
        this.batchReferenceInput.addEventListener('change', (e) => this.handleReferenceSelect(e));
        
        this.batchGenerateBtn.addEventListener('click', () => this.generate());
    }
    
    async handleFiles(files) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) {
            this.app.showToast('请选择图片文件', 'error');
            return;
        }
        
        for (const file of imageFiles) {
            await this.uploadImage(file);
        }
        
        this.updateBatchGrid();
    }
    
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                this.images.push({
                    fileId: data.file_id,
                    url: data.url,
                    filename: data.filename,
                    maskData: null,
                    maskHistory: []
                });
            }
        } catch (error) {
            console.error('Upload error:', error);
        }
    }
    
    async handleReferenceSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            const response = await fetch('/api/upload-reference', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('上传失败');
            
            const data = await response.json();
            this.referenceImageId = data.file_id;
            
            const img = document.createElement('img');
            img.src = data.url;
            this.batchReferencePreview.innerHTML = '';
            this.batchReferencePreview.appendChild(img);
            
            this.app.showToast('参考图上传成功！', 'success');
            
        } catch (error) {
            this.app.showToast('参考图上传失败', 'error');
        }
    }
    
    updateBatchGrid() {
        if (this.images.length === 0) {
            this.batchList.style.display = 'none';
            this.batchEditor.style.display = 'none';
            return;
        }
        
        this.batchList.style.display = 'block';
        this.batchCount.textContent = `${this.images.length} 张`;
        
        this.batchGrid.innerHTML = this.images.map((img, idx) => `
            <div class="batch-item ${idx === this.selectedIndex ? 'active' : ''}" data-index="${idx}">
                <img src="${img.url}" alt="${img.filename}">
                <button class="batch-remove" data-index="${idx}">×</button>
            </div>
        `).join('');
        
        this.batchGrid.querySelectorAll('.batch-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('batch-remove')) {
                    this.selectImage(parseInt(item.dataset.index));
                }
            });
        });
        
        this.batchGrid.querySelectorAll('.batch-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeImage(parseInt(btn.dataset.index));
            });
        });
        
        this.batchEditor.style.display = 'grid';
        if (this.images[this.selectedIndex]) {
            this.loadImageToCanvas(this.selectedIndex);
        }
    }
    
    selectImage(index) {
        this.saveCurrentMask();
        this.selectedIndex = index;
        this.updateBatchGrid();
        this.loadImageToCanvas(index);
    }
    
    removeImage(index) {
        this.images.splice(index, 1);
        if (this.selectedIndex >= this.images.length) {
            this.selectedIndex = Math.max(0, this.images.length - 1);
        }
        this.updateBatchGrid();
    }
    
    loadImageToCanvas(index) {
        const imgData = this.images[index];
        const img = new Image();
        img.onload = () => {
            const maxWidth = 600;
            const maxHeight = 400;
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height = (maxWidth / width) * height;
                width = maxWidth;
            }
            if (height > maxHeight) {
                width = (maxHeight / height) * width;
                height = maxHeight;
            }
            
            this.batchImageCanvas.width = width;
            this.batchImageCanvas.height = height;
            this.batchMaskCanvas.width = width;
            this.batchMaskCanvas.height = height;
            
            this.batchImageCtx.drawImage(img, 0, 0, width, height);
            
            this.batchMaskCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            this.batchMaskCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            this.batchMaskCtx.lineCap = 'round';
            this.batchMaskCtx.lineJoin = 'round';
            
            this.history = imgData.maskHistory || [];
            if (imgData.maskData) {
                this.restoreMaskData(imgData.maskData);
            }
        };
        img.src = imgData.url;
    }
    
    saveCurrentMask() {
        if (this.images[this.selectedIndex]) {
            this.images[this.selectedIndex].maskData = this.getMaskData();
            this.images[this.selectedIndex].maskHistory = [...this.history];
        }
    }
    
    getCanvasCoords(e) {
        const rect = this.batchMaskCanvas.getBoundingClientRect();
        const scaleX = this.batchMaskCanvas.width / rect.width;
        const scaleY = this.batchMaskCanvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        const coords = this.getCanvasCoords(e);
        this.lastX = coords.x;
        this.lastY = coords.y;
        this.saveHistory();
        this.batchMaskCtx.lineWidth = this.brushSize;
        this.batchMaskCtx.beginPath();
        this.batchMaskCtx.arc(coords.x, coords.y, this.brushSize / 2, 0, Math.PI * 2);
        this.batchMaskCtx.fill();
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        const coords = this.getCanvasCoords(e);
        
        this.batchMaskCtx.lineWidth = this.brushSize;
        this.batchMaskCtx.beginPath();
        this.batchMaskCtx.moveTo(this.lastX, this.lastY);
        this.batchMaskCtx.lineTo(coords.x, coords.y);
        this.batchMaskCtx.stroke();
        
        this.batchMaskCtx.beginPath();
        this.batchMaskCtx.arc(coords.x, coords.y, this.brushSize / 2, 0, Math.PI * 2);
        this.batchMaskCtx.fill();
        
        this.lastX = coords.x;
        this.lastY = coords.y;
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    saveHistory() {
        const maskData = this.batchMaskCtx.getImageData(0, 0, this.batchMaskCanvas.width, this.batchMaskCanvas.height);
        this.history.push(maskData);
        if (this.history.length > 10) this.history.shift();
    }
    
    undo() {
        if (this.history.length > 0) {
            const previousData = this.history.pop();
            this.batchMaskCtx.putImageData(previousData, 0, 0);
        }
    }
    
    clearCurrentMask() {
        this.batchMaskCtx.clearRect(0, 0, this.batchMaskCanvas.width, this.batchMaskCanvas.height);
        this.history = [];
    }
    
    getMaskData() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.batchMaskCanvas.width;
        tempCanvas.height = this.batchMaskCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(this.batchMaskCanvas, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            if (imageData.data[i + 3] > 0) {
                imageData.data[i] = 255;
                imageData.data[i + 1] = 255;
                imageData.data[i + 2] = 255;
                imageData.data[i + 3] = 255;
            }
        }
        
        tempCtx.putImageData(imageData, 0, 0);
        return tempCanvas.toDataURL('image/png');
    }
    
    restoreMaskData(maskDataUrl) {
        const img = new Image();
        img.onload = () => {
            this.batchMaskCtx.clearRect(0, 0, this.batchMaskCanvas.width, this.batchMaskCanvas.height);
            this.batchMaskCtx.drawImage(img, 0, 0);
        };
        img.src = maskDataUrl;
    }
    
    hasMask() {
        const imageData = this.batchMaskCtx.getImageData(0, 0, this.batchMaskCanvas.width, this.batchMaskCanvas.height);
        for (let i = 3; i < imageData.data.length; i += 4) {
            if (imageData.data[i] > 0) return true;
        }
        return false;
    }
    
    async generate() {
        this.saveCurrentMask();
        
        const prompt = this.batchPromptInput.value.trim();
        if (!prompt) {
            this.app.showToast('请输入提示词', 'error');
            return;
        }
        
        const imagesWithMask = this.images.filter(img => img.maskData);
        if (imagesWithMask.length === 0) {
            this.app.showToast('请至少为一张图片涂抹需要重绘的区域', 'error');
            return;
        }
        
        this.batchGenerateBtn.disabled = true;
        this.batchProgress.style.display = 'block';
        this.updateBatchProgressUI(0, 0, 0, imagesWithMask.length);
        
        const tasksData = imagesWithMask.map(img => ({
            original_image_id: img.fileId,
            mask_data: img.maskData,
            prompt: prompt,
            reference_image_id: this.referenceImageId
        }));
        
        const formData = new FormData();
        formData.append('tasks_data', JSON.stringify(tasksData));
        
        try {
            const response = await fetch('/api/batch-inpaint', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('批量生成请求失败');
            
            const data = await response.json();
            this.batchId = data.batch_id;
            
            this.app.showToast(`已开始批量处理 ${data.total_tasks} 张图片`, 'info');
            
        } catch (error) {
            console.error('Batch generate error:', error);
            this.app.showToast('批量生成失败：' + error.message, 'error');
            this.batchGenerateBtn.disabled = false;
            this.batchProgress.style.display = 'none';
        }
    }
    
    handleBatchProgress(data) {
        if (data.batch_id !== this.batchId) return;
        
        this.updateBatchProgressUI(
            data.progress,
            data.completed,
            data.failed,
            data.total
        );
        
        if (data.completed + data.failed >= data.total) {
            setTimeout(() => {
                this.batchGenerateBtn.disabled = false;
                this.batchProgress.style.display = 'none';
                this.app.showToast(`批量处理完成！成功 ${data.completed} 张，失败 ${data.failed} 张`, 
                    data.failed === 0 ? 'success' : 'info');
                this.app.galleryMode.loadGallery();
            }, 1000);
        }
    }
    
    updateBatchProgressUI(progress, completed, failed, total) {
        this.batchProgressFill.style.width = `${progress}%`;
        this.batchProgressPercent.textContent = `${Math.round(progress)}%`;
        this.batchProgressDetail.textContent = `${completed + failed} / ${total} 完成 (成功: ${completed}, 失败: ${failed})`;
        this.batchProgressStatus.textContent = progress < 100 ? '处理中...' : '完成';
    }
    
    reset() {
        this.images = [];
        this.selectedIndex = 0;
        this.referenceImageId = null;
        this.batchId = null;
        this.history = [];
        
        this.updateBatchGrid();
        this.batchProgress.style.display = 'none';
        this.batchReferencePreview.innerHTML = '<span class="reference-placeholder">点击上传参考图，AI将提取其风格</span>';
    }
}

class GalleryMode {
    constructor(app) {
        this.app = app;
        this.currentPage = 1;
        this.pageSize = 12;
        this.statusFilter = '';
        this.selectedTask = null;
        
        this.initElements();
        this.initEventListeners();
    }
    
    initElements() {
        this.galleryGrid = document.getElementById('galleryGrid');
        this.galleryPagination = document.getElementById('galleryPagination');
        this.galleryPaginationInfo = document.getElementById('galleryPaginationInfo');
        this.galleryPrevBtn = document.getElementById('galleryPrevBtn');
        this.galleryNextBtn = document.getElementById('galleryNextBtn');
        this.galleryStatusFilter = document.getElementById('galleryStatusFilter');
        this.galleryPageSize = document.getElementById('galleryPageSize');
        
        this.galleryModal = document.getElementById('galleryModal');
        this.modalOverlay = document.getElementById('modalOverlay');
        this.modalClose = document.getElementById('modalClose');
        this.modalOriginal = document.getElementById('modalOriginal');
        this.modalGenerated = document.getElementById('modalGenerated');
        this.modalPrompt = document.getElementById('modalPrompt');
        this.modalDate = document.getElementById('modalDate');
        this.modalDownloadBtn = document.getElementById('modalDownloadBtn');
        this.modalRegenerateBtn = document.getElementById('modalRegenerateBtn');
        this.modalDeleteBtn = document.getElementById('modalDeleteBtn');
    }
    
    initEventListeners() {
        this.galleryStatusFilter.addEventListener('change', () => {
            this.statusFilter = this.galleryStatusFilter.value;
            this.currentPage = 1;
            this.loadGallery();
        });
        
        this.galleryPageSize.addEventListener('change', () => {
            this.pageSize = parseInt(this.galleryPageSize.value);
            this.currentPage = 1;
            this.loadGallery();
        });
        
        this.galleryPrevBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadGallery();
            }
        });
        
        this.galleryNextBtn.addEventListener('click', () => {
            this.currentPage++;
            this.loadGallery();
        });
        
        this.modalClose.addEventListener('click', () => this.closeModal());
        this.modalOverlay.addEventListener('click', () => this.closeModal());
        
        this.modalDownloadBtn.addEventListener('click', () => this.downloadGenerated());
        this.modalRegenerateBtn.addEventListener('click', () => this.regenerate());
        this.modalDeleteBtn.addEventListener('click', () => this.deleteTask());
    }
    
    async loadGallery() {
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                page_size: this.pageSize
            });
            if (this.statusFilter) {
                params.append('status', this.statusFilter);
            }
            
            const response = await fetch(`/api/tasks?${params.toString()}`);
            const data = await response.json();
            
            this.renderGallery(data.items);
            this.renderPagination(data.page, data.total_pages, data.total);
            
        } catch (error) {
            console.error('Load gallery error:', error);
        }
    }
    
    renderGallery(items) {
        if (items.length === 0) {
            this.galleryGrid.innerHTML = '<p class="empty-history">暂无历史记录</p>';
            return;
        }
        
        this.galleryGrid.innerHTML = items.map(task => {
            const imgUrl = task.generated_image_url || task.original_image_url;
            const statusClass = `status-${task.status}`;
            const statusText = {
                'completed': '已完成',
                'processing': '处理中',
                'failed': '失败',
                'pending': '等待中'
            }[task.status] || task.status;
            
            return `
                <div class="gallery-item" data-id="${task.id}">
                    <img src="${imgUrl}" alt="${task.prompt}">
                    <span class="gallery-item-status ${statusClass}">${statusText}</span>
                    <div class="gallery-item-overlay">
                        <div class="gallery-item-prompt">${task.prompt}</div>
                        <div class="gallery-item-date">${new Date(task.created_at).toLocaleDateString('zh-CN')}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        this.galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const taskId = parseInt(item.dataset.id);
                const task = items.find(t => t.id === taskId);
                if (task) this.openModal(task);
            });
        });
    }
    
    renderPagination(page, totalPages, total) {
        if (totalPages <= 1) {
            this.galleryPagination.style.display = 'none';
            return;
        }
        
        this.galleryPagination.style.display = 'flex';
        this.galleryPaginationInfo.textContent = `第 ${page} 页 / 共 ${totalPages} 页 (${total} 条)`;
        this.galleryPrevBtn.disabled = page <= 1;
        this.galleryNextBtn.disabled = page >= totalPages;
    }
    
    openModal(task) {
        this.selectedTask = task;
        
        this.modalOriginal.src = task.original_image_url;
        this.modalGenerated.src = task.generated_image_url || task.original_image_url;
        this.modalPrompt.textContent = task.prompt;
        this.modalDate.textContent = new Date(task.created_at).toLocaleString('zh-CN');
        
        this.modalRegenerateBtn.style.display = task.status === 'completed' ? 'inline-flex' : 'none';
        this.modalDeleteBtn.style.display = 'inline-flex';
        this.modalDownloadBtn.style.display = task.generated_image_url ? 'inline-flex' : 'none';
        
        this.galleryModal.style.display = 'flex';
    }
    
    closeModal() {
        this.galleryModal.style.display = 'none';
        this.selectedTask = null;
    }
    
    downloadGenerated() {
        if (!this.selectedTask?.generated_image_url) return;
        const link = document.createElement('a');
        link.href = this.selectedTask.generated_image_url;
        link.download = `inpainting_${this.selectedTask.id}.png`;
        link.click();
    }
    
    async regenerate() {
        if (!this.selectedTask) return;
        
        this.modalRegenerateBtn.disabled = true;
        
        try {
            const formData = new FormData();
            formData.append('prompt', this.selectedTask.prompt);
            
            const response = await fetch(`/api/tasks/${this.selectedTask.id}/regenerate`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) throw new Error('重新生成失败');
            
            const data = await response.json();
            this.app.showToast('已开始重新生成，请稍候...', 'info');
            this.closeModal();
            
        } catch (error) {
            console.error('Regenerate error:', error);
            this.app.showToast('重新生成失败：' + error.message, 'error');
            this.modalRegenerateBtn.disabled = false;
        }
    }
    
    async deleteTask() {
        if (!this.selectedTask) return;
        
        if (!confirm('确定要删除这条记录吗？')) return;
        
        try {
            const response = await fetch(`/api/tasks/${this.selectedTask.id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('删除失败');
            
            this.app.showToast('删除成功', 'success');
            this.closeModal();
            this.loadGallery();
            
        } catch (error) {
            console.error('Delete error:', error);
            this.app.showToast('删除失败：' + error.message, 'error');
        }
    }
}

class InpaintingApp {
    constructor() {
        this.ws = null;
        this.toast = document.getElementById('toast');
        this.progressSection = document.getElementById('progressSection');
        this.resultSection = document.getElementById('resultSection');
        this.progressFill = document.getElementById('progressFill');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressStatus = document.getElementById('progressStatus');
        this.progressText = document.getElementById('progressText');
        
        this.originalResult = document.getElementById('originalResult');
        this.generatedResult = document.getElementById('generatedResult');
        this.sliderOriginal = document.getElementById('sliderOriginal');
        this.sliderGenerated = document.getElementById('sliderGenerated');
        this.compareSlider = document.getElementById('compareSlider');
        this.sliderHandle = document.getElementById('sliderHandle');
        this.sideBySideView = document.getElementById('sideBySideView');
        this.sliderCompareView = document.getElementById('sliderCompareView');
        
        this.downloadBtn = document.getElementById('downloadBtn');
        this.newTaskBtn = document.getElementById('newTaskBtn');
        
        this.currentGeneratedUrl = null;
        
        this.singleMode = new SingleModeEditor(this);
        this.batchMode = new BatchModeEditor(this);
        this.galleryMode = new GalleryMode(this);
        
        this.initTabNavigation();
        this.initCompareControls();
        this.initResultControls();
        this.initWebSocket();
    }
    
    initTabNavigation() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                this.switchTab(mode);
            });
        });
    }
    
    switchTab(mode) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        
        document.getElementById(`${mode}Mode`).style.display = 'block';
        
        if (mode === 'gallery') {
            this.galleryMode.loadGallery();
        }
    }
    
    initCompareControls() {
        document.querySelectorAll('input[name="compareMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.switchCompareMode(e.target.value));
        });
        
        this.compareSlider.addEventListener('input', (e) => this.updateSlider(e.target.value));
    }
    
    initResultControls() {
        this.downloadBtn.addEventListener('click', () => this.downloadImage());
        this.newTaskBtn.addEventListener('click', () => this.reset());
    }
    
    initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'batch') {
                this.batchMode.handleBatchProgress(data);
            } else {
                this.singleMode.handleProgress(data);
            }
        };
        
        this.ws.onclose = () => {
            setTimeout(() => this.initWebSocket(), 3000);
        };
    }
    
    showProgress() {
        this.progressSection.style.display = 'block';
        this.resultSection.style.display = 'none';
        this.updateProgressUI(0, '准备中', '正在准备生成...');
    }
    
    hideProgress() {
        this.progressSection.style.display = 'none';
    }
    
    updateProgress(data) {
        const statusMap = {
            'loading': '加载中',
            'loading_model': '加载模型',
            'generating': '生成中',
            'completed': '完成',
            'failed': '失败'
        };
        
        const textMap = {
            'loading': '正在加载图片...',
            'loading_model': '正在加载AI模型，请稍候...',
            'generating': 'AI正在绘制，请耐心等待...',
            'completed': '生成完成！',
            'failed': '生成失败'
        };
        
        const statusText = statusMap[data.status] || data.status;
        const text = data.error || textMap[data.status] || '处理中...';
        
        this.updateProgressUI(data.progress, statusText, text);
    }
    
    updateProgressUI(progress, status, text) {
        this.progressFill.style.width = `${progress}%`;
        this.progressPercent.textContent = `${Math.round(progress)}%`;
        this.progressStatus.textContent = status;
        this.progressText.textContent = text;
    }
    
    showResults(originalUrl, generatedUrl) {
        this.currentGeneratedUrl = generatedUrl;
        this.hideProgress();
        this.resultSection.style.display = 'block';
        
        this.originalResult.src = originalUrl;
        this.generatedResult.src = generatedUrl;
        this.sliderOriginal.src = originalUrl;
        this.sliderGenerated.src = generatedUrl;
        
        this.showToast('生成完成！', 'success');
    }
    
    switchCompareMode(mode) {
        if (mode === 'side') {
            this.sideBySideView.style.display = 'grid';
            this.sliderCompareView.style.display = 'none';
        } else {
            this.sideBySideView.style.display = 'none';
            this.sliderCompareView.style.display = 'block';
        }
    }
    
    updateSlider(value) {
        const overlay = document.querySelector('.slider-overlay');
        overlay.style.width = `${value}%`;
        this.sliderHandle.style.left = `${value}%`;
    }
    
    downloadImage() {
        if (!this.currentGeneratedUrl) return;
        const link = document.createElement('a');
        link.href = this.currentGeneratedUrl;
        link.download = `inpainting_${Date.now()}.png`;
        link.click();
    }
    
    reset() {
        this.currentGeneratedUrl = null;
        this.singleMode.reset();
        this.resultSection.style.display = 'none';
        this.updateProgressUI(0, '准备中', '');
    }
    
    showToast(message, type = 'info') {
        this.toast.textContent = message;
        this.toast.className = `toast show ${type}`;
        
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new InpaintingApp();
});
