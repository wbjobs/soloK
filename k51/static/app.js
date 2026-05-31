const API_BASE = '/api';

let currentAnalysisData = null;
let currentFileId = null;
let audioContext = null;
let activeOscillators = [];
let isPlaying = false;
let playStartTime = 0;
let scheduledEvents = [];

let trackStates = {};
let soloEnabled = false;
let currentBpmScale = 1.0;
let originalBpm = 120;

const TRACK_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8', '#00b894', '#e17055', '#0984e3', '#6c5ce7', '#a29bfe', '#dfe6e9', '#00cec9', '#fab1a0', '#81ecec'];

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const browseBtn = document.getElementById('browse-btn');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const resultsSection = document.getElementById('results-section');

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    initDragAndDrop();
    initControls();
});

function initDragAndDrop() {
    dropZone.addEventListener('click', () => fileInput.click());
    browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            uploadFile(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
}

function initControls() {
    document.getElementById('instrument-filter').addEventListener('change', (e) => {
        if (e.target.value && currentFileId) {
            filterByInstrument(e.target.value);
        } else if (currentAnalysisData) {
            renderAnalysis(currentAnalysisData);
        }
    });

    document.getElementById('export-btn').addEventListener('click', exportMeasures);
    document.getElementById('play-btn').addEventListener('click', playMidi);
    document.getElementById('stop-btn').addEventListener('click', stopPlayback);
    document.getElementById('report-btn').addEventListener('click', generateReport);

    const bpmSlider = document.getElementById('bpm-slider');
    const bpmValue = document.getElementById('bpm-value');
    const bpmReset = document.getElementById('bpm-reset');

    bpmSlider.addEventListener('input', (e) => {
        const bpm = parseInt(e.target.value);
        bpmValue.textContent = bpm;
        currentBpmScale = originalBpm / bpm;
    });

    bpmReset.addEventListener('click', () => {
        bpmSlider.value = Math.round(originalBpm);
        bpmValue.textContent = Math.round(originalBpm);
        currentBpmScale = 1.0;
    });
}

async function uploadFile(file) {
    if (!file.name.toLowerCase().endsWith('.mid') && !file.name.toLowerCase().endsWith('.midi')) {
        showError('请上传 .mid 或 .midi 格式的文件');
        return;
    }

    showLoading();
    hideError();
    hideResults();

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            currentAnalysisData = result.data;
            currentFileId = extractFileId(result);
            renderAnalysis(currentAnalysisData);
            loadHistory();
        } else {
            showError(result.error || '上传失败');
        }
    } catch (err) {
        showError('网络错误: ' + err.message);
    } finally {
        hideLoading();
    }
}

function extractFileId(result) {
    return result.data && result.data.id ? result.data.id : null;
}

async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/files`);
        const files = await response.json();
        const historyList = document.getElementById('history-list');
        
        if (files.length === 0) {
            historyList.innerHTML = '<p style="color: #888; text-align: center;">暂无历史文件</p>';
            return;
        }

        historyList.innerHTML = files.map(file => `
            <div class="history-item" data-id="${file.id}" data-filename="${file.filename}">
                <span class="history-filename">${file.filename}</span>
                <span class="history-date">${new Date(file.uploaded_at).toLocaleString('zh-CN')}</span>
            </div>
        `).join('');

        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', async () => {
                const fileId = parseInt(item.dataset.id);
                await loadFileById(fileId);
            });
        });
    } catch (err) {
        console.error('加载历史失败:', err);
    }
}

async function loadFileById(fileId) {
    showLoading();
    try {
        const response = await fetch(`${API_BASE}/files/${fileId}`);
        const data = await response.json();
        if (response.ok) {
            currentAnalysisData = data;
            currentFileId = fileId;
            renderAnalysis(data);
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        } else {
            showError(data.error || '加载失败');
        }
    } catch (err) {
        showError('网络错误: ' + err.message);
    } finally {
        hideLoading();
    }
}

async function filterByInstrument(instrumentName) {
    if (!currentFileId) return;
    
    try {
        const response = await fetch(`${API_BASE}/filter/instrument`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: currentFileId, instrument: instrumentName })
        });
        const data = await response.json();
        if (response.ok) {
            currentAnalysisData = data;
            renderAnalysis(data);
        } else {
            showError(data.error || '筛选失败');
        }
    } catch (err) {
        showError('网络错误: ' + err.message);
    }
}

async function exportMeasures() {
    if (!currentFileId) return;
    
    const startMeasure = parseInt(document.getElementById('start-measure').value);
    const endMeasure = parseInt(document.getElementById('end-measure').value);
    
    if (!startMeasure || !endMeasure) {
        showError('请输入有效的小节范围');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/export/measures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                file_id: currentFileId, 
                start_measure: startMeasure, 
                end_measure: endMeasure 
            })
        });
        const data = await response.json();
        if (response.ok) {
            currentAnalysisData = data;
            renderAnalysis(data);
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `measures_${startMeasure}_${endMeasure}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            showError(data.error || '导出失败');
        }
    } catch (err) {
        showError('网络错误: ' + err.message);
    }
}

async function generateReport() {
    if (!currentFileId) return;
    
    try {
        const response = await fetch(`${API_BASE}/report/${currentFileId}`);
        const report = await response.json();
        if (response.ok) {
            renderReport(report);
        } else {
            showError(report.error || '生成报告失败');
        }
    } catch (err) {
        showError('网络错误: ' + err.message);
    }
}

function renderAnalysis(data) {
    currentAnalysisData = data;
    
    originalBpm = data.tempo_bpm || 120;
    const bpmSlider = document.getElementById('bpm-slider');
    const bpmValue = document.getElementById('bpm-value');
    bpmSlider.value = Math.round(originalBpm);
    bpmValue.textContent = Math.round(originalBpm);
    currentBpmScale = 1.0;
    
    initTrackStates(data);
    renderTrackMixer(data);
    
    renderFileInfo(data);
    renderInstrumentFilter(data);
    renderPianoRoll(data);
    renderVelocityChart(data);
    renderTracks(data);
    
    document.getElementById('start-measure').max = data.total_measures;
    document.getElementById('end-measure').max = data.total_measures;
    document.getElementById('end-measure').value = data.total_measures;
    
    showResults();
}

function initTrackStates(data) {
    trackStates = {};
    soloEnabled = false;
    data.tracks.forEach(track => {
        trackStates[track.track_index] = {
            muted: false,
            solo: false
        };
    });
}

function renderTrackMixer(data) {
    const mixerEl = document.getElementById('track-mixer');
    
    mixerEl.innerHTML = data.tracks.map(track => {
        const trackIdx = track.track_index;
        const state = trackStates[trackIdx];
        const color = TRACK_COLORS[trackIdx % TRACK_COLORS.length];
        const isMuted = state.muted;
        const isSolo = state.solo;
        
        let trackClass = 'mixer-track';
        if (isMuted) trackClass += ' muted';
        if (soloEnabled && isSolo) trackClass += ' solo-active';
        if (soloEnabled && !isSolo) trackClass += ' solo-inactive';
        
        const instruments = [...new Set(track.instruments.map(i => i.name))].join(', ') || '未指定';
        
        return `
            <div class="${trackClass}" data-track="${trackIdx}">
                <div class="mixer-track-color" style="background: ${color}"></div>
                <div class="mixer-track-info">
                    <div class="mixer-track-name" title="${track.name}">${track.name || `音轨 ${trackIdx}`}</div>
                    <div class="mixer-track-notes">${track.note_count} 音符 · ${instruments}</div>
                </div>
                <div class="mixer-controls">
                    <button class="mixer-btn mixer-btn-solo ${isSolo ? 'active' : ''}" data-track="${trackIdx}" data-action="solo" title="独奏">S</button>
                    <button class="mixer-btn mixer-btn-mute ${isMuted ? 'active' : ''}" data-track="${trackIdx}" data-action="mute" title="静音">M</button>
                </div>
            </div>
        `;
    }).join('');
    
    mixerEl.querySelectorAll('.mixer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const trackIdx = parseInt(e.currentTarget.dataset.track);
            const action = e.currentTarget.dataset.action;
            handleTrackControl(trackIdx, action, data);
        });
    });
}

function handleTrackControl(trackIdx, action, data) {
    if (action === 'mute') {
        trackStates[trackIdx].muted = !trackStates[trackIdx].muted;
    } else if (action === 'solo') {
        trackStates[trackIdx].solo = !trackStates[trackIdx].solo;
        soloEnabled = Object.values(trackStates).some(s => s.solo);
    }
    renderTrackMixer(data);
}

function renderFileInfo(data) {
    const fileInfoEl = document.getElementById('file-info');
    const infoItems = [
        { label: '总音符数', value: data.total_notes },
        { label: '总小节数', value: data.total_measures },
        { label: '拍号', value: data.time_signature },
        { label: 'BPM', value: Math.round(data.tempo_bpm) },
        { label: '时长', value: formatDuration(data.duration_seconds) },
        { label: '音轨数', value: data.tracks.length },
        { label: '每拍tick', value: data.ticks_per_beat }
    ];

    fileInfoEl.innerHTML = infoItems.map(item => `
        <div class="info-item">
            <div class="info-label">${item.label}</div>
            <div class="info-value">${item.value}</div>
        </div>
    `).join('');
}

function renderInstrumentFilter(data) {
    const select = document.getElementById('instrument-filter');
    const currentValue = select.value;
    select.innerHTML = '<option value="">全部乐器</option>';
    
    if (data.instrument_types) {
        data.instrument_types.forEach(inst => {
            const option = document.createElement('option');
            option.value = inst;
            option.textContent = inst;
            if (inst === data.filtered_instrument) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }
}

function renderPianoRoll(data) {
    const canvas = document.getElementById('piano-roll');
    const ctx = canvas.getContext('2d');
    
    if (!data.notes || data.notes.length === 0) {
        canvas.width = 800;
        canvas.height = 400;
        ctx.fillStyle = '#16213e';
        ctx.fillRect(0, 0, 800, 400);
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无音符数据', 400, 200);
        return;
    }

    const PIXELS_PER_TICK = 0.05;
    const NOTE_HEIGHT = 12;
    const KEYBOARD_WIDTH = 60;
    const MIN_NOTE = 21;
    const MAX_NOTE = 108;
    const NOTE_RANGE = MAX_NOTE - MIN_NOTE + 1;
    
    const totalTicks = data.total_ticks || 1000;
    const width = KEYBOARD_WIDTH + (totalTicks * PIXELS_PER_TICK) + 50;
    const height = NOTE_RANGE * NOTE_HEIGHT + 40;

    canvas.width = Math.max(width, 800);
    canvas.height = Math.max(height, 400);

    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    for (let i = MIN_NOTE; i <= MAX_NOTE; i++) {
        const y = (MAX_NOTE - i) * NOTE_HEIGHT;
        const noteIdx = i % 12;
        const isBlack = [1, 3, 6, 8, 10].includes(noteIdx);
        
        ctx.fillStyle = isBlack ? '#2a2a4a' : '#3a3a5a';
        ctx.fillRect(KEYBOARD_WIDTH, y, canvas.width - KEYBOARD_WIDTH, NOTE_HEIGHT - 1);
        
        ctx.fillStyle = isBlack ? '#444' : '#fff';
        ctx.fillRect(0, y, KEYBOARD_WIDTH - 1, NOTE_HEIGHT - 1);
        
        ctx.fillStyle = isBlack ? '#888' : '#333';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        const octave = Math.floor(i / 12) - 1;
        ctx.fillText(notes[noteIdx] + octave, KEYBOARD_WIDTH - 5, y + NOTE_HEIGHT - 4);
    }

    const ticksPerMeasure = data.ticks_per_measure || (data.ticks_per_beat * 4);
    for (let m = 0; m * ticksPerMeasure <= totalTicks; m++) {
        const x = KEYBOARD_WIDTH + (m * ticksPerMeasure * PIXELS_PER_TICK);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x, 0, 1, canvas.height);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('M' + (m + 1), x, 15);
    }

    const trackColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8', '#00b894'];

    data.notes.forEach(note => {
        if (note.note < MIN_NOTE || note.note > MAX_NOTE) return;
        
        const x = KEYBOARD_WIDTH + (note.start_time * PIXELS_PER_TICK);
        const y = (MAX_NOTE - note.note) * NOTE_HEIGHT;
        const w = Math.max(note.duration * PIXELS_PER_TICK, 2);
        const h = NOTE_HEIGHT - 2;
        
        const color = trackColors[note.track % trackColors.length];
        const alpha = 0.5 + (note.velocity / 255) * 0.5;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, w, h);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        
        ctx.globalAlpha = 1;
    });
}

function renderVelocityChart(data) {
    const canvas = document.getElementById('velocity-chart');
    const ctx = canvas.getContext('2d');
    
    if (!data.notes || data.notes.length === 0) {
        canvas.width = 800;
        canvas.height = 200;
        ctx.fillStyle = '#16213e';
        ctx.fillRect(0, 0, 800, 200);
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无数据', 400, 100);
        return;
    }

    const notes = data.notes;
    const PIXELS_PER_TICK = 0.08;
    const totalTicks = data.total_ticks || 1000;
    const width = Math.max(totalTicks * PIXELS_PER_TICK + 60, 800);
    const height = 250;
    const CHART_HEIGHT = 200;
    const CHART_TOP = 30;
    const CHART_LEFT = 50;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i <= 4; i++) {
        const y = CHART_TOP + (CHART_HEIGHT / 4) * i;
        ctx.fillRect(CHART_LEFT, y, canvas.width - CHART_LEFT - 10, 1);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        const velocityValue = 127 - Math.round((127 / 4) * i);
        ctx.fillText(velocityValue.toString(), CHART_LEFT - 5, y + 3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    }

    const barWidth = Math.max(1, (PIXELS_PER_TICK * data.ticks_per_beat) / 8);
    const trackColors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8', '#00b894'];

    notes.forEach(note => {
        const x = CHART_LEFT + (note.start_time * PIXELS_PER_TICK);
        const barHeight = (note.velocity / 127) * CHART_HEIGHT;
        const y = CHART_TOP + CHART_HEIGHT - barHeight;
        
        const color = trackColors[note.track % trackColors.length];
        const alpha = 0.6 + (note.velocity / 255) * 0.4;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(x, y, barWidth, barHeight);
        ctx.globalAlpha = 1;
    });

    const ticksPerMeasure = data.ticks_per_measure || (data.ticks_per_beat * 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let m = 0; m * ticksPerMeasure <= totalTicks; m++) {
        const x = CHART_LEFT + (m * ticksPerMeasure * PIXELS_PER_TICK);
        ctx.fillRect(x, CHART_TOP, 1, CHART_HEIGHT);
    }
}

function renderTracks(data) {
    const tracksList = document.getElementById('tracks-list');
    
    tracksList.innerHTML = data.tracks.map(track => {
        const instruments = [...new Set(track.instruments.map(i => i.name))];
        return `
            <div class="track-item">
                <div class="track-header">
                    <span class="track-name">${track.name || `音轨 ${track.track_index}`}</span>
                    <span class="track-meta">${track.note_count} 个音符</span>
                </div>
                ${instruments.length > 0 ? `
                    <div class="track-instruments">
                        ${instruments.map(inst => `<span class="instrument-tag">${inst}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderReport(report) {
    const reportSection = document.getElementById('report-section');
    const reportContent = document.getElementById('report-content');
    
    const summary = report.summary;
    const velocityStats = report.velocity_stats || {};
    const noteDist = report.note_distribution || {};
    
    const sortedNotes = Object.entries(noteDist).sort((a, b) => {
        const getNoteValue = (name) => {
            const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const match = name.match(/^([A-G]#?)(-?\d+)$/);
            if (!match) return 0;
            return (parseInt(match[2]) + 1) * 12 + notes.indexOf(match[1]);
        };
        return getNoteValue(a[0]) - getNoteValue(b[0]);
    });

    let html = `
        <div class="file-info">
            <div class="info-item">
                <div class="info-label">总音符数</div>
                <div class="info-value">${summary.total_notes}</div>
            </div>
            <div class="info-item">
                <div class="info-label">总小节数</div>
                <div class="info-value">${summary.total_measures}</div>
            </div>
            <div class="info-item">
                <div class="info-label">时长</div>
                <div class="info-value">${formatDuration(summary.duration_seconds)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">BPM</div>
                <div class="info-value">${Math.round(summary.tempo_bpm)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">拍号</div>
                <div class="info-value">${summary.time_signature}</div>
            </div>
            <div class="info-item">
                <div class="info-label">音轨数</div>
                <div class="info-value">${summary.track_count}</div>
            </div>
        </div>

        <h3>使用乐器 (${report.instruments.length})</h3>
        <div class="track-instruments">
            ${report.instruments.map(inst => `<span class="instrument-tag">${inst}</span>`).join('')}
        </div>

        <h3>力度统计</h3>
        <ul>
            <li>最小力度: ${velocityStats.min || 0}</li>
            <li>最大力度: ${velocityStats.max || 0}</li>
            <li>平均力度: ${velocityStats.avg ? velocityStats.avg.toFixed(1) : 0}</li>
        </ul>
    `;

    if (velocityStats.distribution) {
        html += '<h3>力度分布</h3><ul>';
        const sortedDist = Object.entries(velocityStats.distribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        sortedDist.forEach(([bucket, count]) => {
            const bucketNum = parseInt(bucket);
            html += `<li>${bucketNum}-${bucketNum + 15}: ${count} 个音符</li>`;
        });
        html += '</ul>';
    }

    if (sortedNotes.length > 0) {
        html += '<h3>音符分布</h3><ul>';
        sortedNotes.forEach(([note, count]) => {
            html += `<li>${note}: ${count} 次</li>`;
        });
        html += '</ul>';
    }

    html += '<h3>音轨详情</h3>';
    report.tracks.forEach(track => {
        html += `
            <div class="track-item" style="margin-bottom: 10px;">
                <div class="track-header">
                    <span class="track-name">${track.name}</span>
                    <span class="track-meta">${track.note_count} 个音符</span>
                </div>
                ${track.instruments.length > 0 ? `
                    <div class="track-instruments">
                        ${track.instruments.map(inst => `<span class="instrument-tag">${inst}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });

    reportContent.innerHTML = html;
    reportSection.classList.remove('hidden');
    reportSection.scrollIntoView({ behavior: 'smooth' });
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function noteToFrequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

const DRUM_KIT = {
    35: { name: 'Bass Drum', freq: 60, decay: 0.3, noise: 0.2, filterFreq: 150 },
    36: { name: 'Bass Drum', freq: 65, decay: 0.3, noise: 0.2, filterFreq: 150 },
    37: { name: 'Side Stick', freq: 800, decay: 0.05, noise: 0.8, filterFreq: 3000 },
    38: { name: 'Snare', freq: 200, decay: 0.15, noise: 0.7, filterFreq: 5000 },
    39: { name: 'Hand Clap', freq: 300, decay: 0.1, noise: 0.9, filterFreq: 2000 },
    40: { name: 'Electric Snare', freq: 180, decay: 0.12, noise: 0.6, filterFreq: 4000 },
    41: { name: 'Low Tom', freq: 100, decay: 0.25, noise: 0.3, filterFreq: 500 },
    42: { name: 'Closed Hi-Hat', freq: 800, decay: 0.05, noise: 0.95, filterFreq: 8000 },
    43: { name: 'High Tom', freq: 130, decay: 0.2, noise: 0.3, filterFreq: 700 },
    44: { name: 'Pedal Hi-Hat', freq: 700, decay: 0.08, noise: 0.9, filterFreq: 7000 },
    45: { name: 'Mid Tom', freq: 160, decay: 0.2, noise: 0.3, filterFreq: 900 },
    46: { name: 'Open Hi-Hat', freq: 800, decay: 0.25, noise: 0.95, filterFreq: 8000 },
    47: { name: 'Low-Mid Tom', freq: 120, decay: 0.2, noise: 0.3, filterFreq: 600 },
    48: { name: 'High-Mid Tom', freq: 170, decay: 0.18, noise: 0.3, filterFreq: 1000 },
    49: { name: 'Crash Cymbal', freq: 400, decay: 0.8, noise: 0.95, filterFreq: 6000 },
    50: { name: 'High Tom', freq: 200, decay: 0.15, noise: 0.3, filterFreq: 1200 },
    51: { name: 'Ride Cymbal', freq: 500, decay: 0.6, noise: 0.85, filterFreq: 7000 },
    52: { name: 'Chinese Cymbal', freq: 350, decay: 0.7, noise: 0.9, filterFreq: 5000 },
    53: { name: 'Ride Bell', freq: 600, decay: 0.5, noise: 0.7, filterFreq: 8000 },
    54: { name: 'Tambourine', freq: 700, decay: 0.2, noise: 0.9, filterFreq: 9000 },
    55: { name: 'Splash Cymbal', freq: 450, decay: 0.4, noise: 0.9, filterFreq: 7000 },
    56: { name: 'Cowbell', freq: 800, decay: 0.15, noise: 0.3, filterFreq: 4000 },
    57: { name: 'Crash Cymbal 2', freq: 380, decay: 0.75, noise: 0.95, filterFreq: 5500 },
    58: { name: 'Vibraslap', freq: 500, decay: 0.3, noise: 0.5, filterFreq: 3000 },
    59: { name: 'Ride Cymbal 2', freq: 520, decay: 0.55, noise: 0.85, filterFreq: 7500 },
    60: { name: 'High Bongo', freq: 300, decay: 0.1, noise: 0.4, filterFreq: 2000 },
    61: { name: 'Low Bongo', freq: 200, decay: 0.12, noise: 0.4, filterFreq: 1500 },
    62: { name: 'Mute High Conga', freq: 260, decay: 0.08, noise: 0.3, filterFreq: 1800 },
    63: { name: 'Open High Conga', freq: 280, decay: 0.12, noise: 0.35, filterFreq: 2000 },
    64: { name: 'Low Conga', freq: 150, decay: 0.15, noise: 0.3, filterFreq: 1000 },
    65: { name: 'High Timbale', freq: 350, decay: 0.1, noise: 0.4, filterFreq: 2500 },
    66: { name: 'Low Timbale', freq: 220, decay: 0.12, noise: 0.4, filterFreq: 1800 },
    67: { name: 'High Agogo', freq: 900, decay: 0.08, noise: 0.2, filterFreq: 5000 },
    68: { name: 'Low Agogo', freq: 650, decay: 0.08, noise: 0.2, filterFreq: 4000 },
    69: { name: 'Cabasa', freq: 600, decay: 0.15, noise: 0.95, filterFreq: 6000 },
    70: { name: 'Maracas', freq: 700, decay: 0.1, noise: 0.95, filterFreq: 7000 },
    71: { name: 'Short Whistle', freq: 1200, decay: 0.08, noise: 0.1, filterFreq: 4000 },
    72: { name: 'Long Whistle', freq: 1000, decay: 0.2, noise: 0.1, filterFreq: 3500 },
    73: { name: 'Short Guiro', freq: 500, decay: 0.06, noise: 0.8, filterFreq: 3000 },
    74: { name: 'Long Guiro', freq: 450, decay: 0.15, noise: 0.8, filterFreq: 2500 },
    75: { name: 'Claves', freq: 1100, decay: 0.04, noise: 0.3, filterFreq: 6000 },
    76: { name: 'High Woodblock', freq: 800, decay: 0.04, noise: 0.4, filterFreq: 5000 },
    77: { name: 'Low Woodblock', freq: 550, decay: 0.04, noise: 0.4, filterFreq: 3500 },
    78: { name: 'Mute Cuica', freq: 400, decay: 0.06, noise: 0.3, filterFreq: 3000 },
    79: { name: 'Open Cuica', freq: 380, decay: 0.15, noise: 0.35, filterFreq: 2800 },
    80: { name: 'Mute Triangle', freq: 1800, decay: 0.05, noise: 0.2, filterFreq: 10000 },
    81: { name: 'Open Triangle', freq: 1700, decay: 0.2, noise: 0.25, filterFreq: 9000 }
};

function createNoiseBuffer(duration) {
    const sampleRate = audioContext.sampleRate;
    const length = Math.max(Math.ceil(sampleRate * duration), 1);
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

function playDrumNote(noteNumber, startTime, velocity) {
    if (!audioContext) return;

    const drumInfo = DRUM_KIT[noteNumber] || {
        name: 'Percussion',
        freq: 200 + (noteNumber * 5),
        decay: 0.15,
        noise: 0.5,
        filterFreq: 3000
    };

    const volume = (velocity / 127) * 0.4;
    const duration = drumInfo.decay;

    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.003);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(volume * 0.001, 0.0001), startTime + duration);

    if (drumInfo.noise > 0.1) {
        const noiseBuffer = createNoiseBuffer(duration + 0.1);
        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const noiseFilter = audioContext.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.value = drumInfo.filterFreq * 0.5;

        const noiseGain = audioContext.createGain();
        noiseGain.gain.setValueAtTime(volume * drumInfo.noise, startTime);
        noiseGain.gain.exponentialRampToValueAtTime(Math.max(volume * drumInfo.noise * 0.001, 0.0001), startTime + duration);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(gainNode);

        noiseSource.start(startTime);
        noiseSource.stop(startTime + duration + 0.05);
        activeOscillators.push({ osc: noiseSource, gainNode: noiseGain });
    }

    if (drumInfo.noise < 0.95) {
        const osc = audioContext.createOscillator();
        osc.type = drumInfo.freq < 150 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(drumInfo.freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(drumInfo.freq * 0.3, 20), startTime + duration);

        const oscGain = audioContext.createGain();
        oscGain.gain.setValueAtTime(volume * (1 - drumInfo.noise), startTime);
        oscGain.gain.exponentialRampToValueAtTime(Math.max(volume * (1 - drumInfo.noise) * 0.001, 0.0001), startTime + duration);

        osc.connect(oscGain);
        oscGain.connect(gainNode);

        osc.start(startTime);
        osc.stop(startTime + duration + 0.05);
        activeOscillators.push({ osc, gainNode: oscGain });
    }

    gainNode.connect(audioContext.destination);
}

function playMelodicNote(note, startTime, duration, velocity, channel, trackIndex) {
    if (!audioContext) return;

    const minDuration = 0.02;
    const safeDuration = Math.max(duration, minDuration);

    const osc = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    const channelWaveforms = ['sine', 'triangle', 'sawtooth', 'square', 'sine',
        'triangle', 'sawtooth', 'square', 'sine', 'triangle',
        'sawtooth', 'square', 'sine', 'triangle', 'sawtooth', 'square'];
    const waveform = channelWaveforms[(channel || 0) % channelWaveforms.length];
    osc.type = waveform;

    filter.type = 'lowpass';
    filter.frequency.value = 1500 + (velocity * 8);
    filter.Q.value = 1;

    osc.frequency.value = noteToFrequency(note);

    const volume = (velocity / 127) * 0.25;
    const attackTime = 0.01;
    const releaseStart = Math.max(safeDuration - 0.02, safeDuration * 0.7);

    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + attackTime);
    gainNode.gain.setValueAtTime(volume * 0.85, startTime + releaseStart);
    gainNode.gain.linearRampToValueAtTime(0, startTime + safeDuration);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);

    osc.start(startTime);
    osc.stop(startTime + safeDuration + 0.05);

    activeOscillators.push({ osc, gainNode });
}

function isTrackPlayable(trackIdx) {
    const state = trackStates[trackIdx];
    if (!state) return true;
    if (state.muted) return false;
    if (soloEnabled && !state.solo) return false;
    return true;
}

async function playMidi() {
    if (!currentAnalysisData || !currentAnalysisData.notes) return;

    initAudioContext();
    stopPlayback();
    isPlaying = true;

    const notes = currentAnalysisData.notes;
    playStartTime = audioContext.currentTime + 0.15;

    let latestEndTime = 0;

    notes.forEach(noteData => {
        const startSeconds = noteData.start_seconds;
        const durationSeconds = noteData.duration_seconds;
        const isDrum = noteData.is_drum || noteData.channel === 9;
        const trackIdx = noteData.track;

        if (!isTrackPlayable(trackIdx)) {
            return;
        }

        if (startSeconds === undefined || startSeconds === null) {
            return;
        }

        const scaledStartSeconds = startSeconds * currentBpmScale;
        const scaledDuration = (durationSeconds || 0.1) * currentBpmScale;

        const startTime = playStartTime + scaledStartSeconds;
        const duration = Math.max(scaledDuration, 0.01);
        const velocity = noteData.velocity;
        const track = noteData.track;

        if (isDrum) {
            playDrumNote(noteData.note, startTime, velocity);
        } else {
            playMelodicNote(noteData.note, startTime, duration, velocity, noteData.channel, track);
        }

        const noteEnd = startTime + duration;
        if (noteEnd > latestEndTime) {
            latestEndTime = noteEnd;
        }
    });

    const totalDurationMs = (latestEndTime - playStartTime) * 1000;
    setTimeout(() => {
        isPlaying = false;
    }, totalDurationMs + 500);
}

function stopPlayback() {
    activeOscillators.forEach(({ osc, gainNode }) => {
        try {
            gainNode.gain.cancelScheduledValues(audioContext.currentTime);
            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            osc.stop();
        } catch (e) {
        }
    });
    activeOscillators = [];
    isPlaying = false;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showLoading() {
    loadingEl.classList.remove('hidden');
}

function hideLoading() {
    loadingEl.classList.add('hidden');
}

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
}

function hideError() {
    errorEl.classList.add('hidden');
}

function showResults() {
    resultsSection.classList.remove('hidden');
}

function hideResults() {
    resultsSection.classList.add('hidden');
    document.getElementById('report-section').classList.add('hidden');
}
