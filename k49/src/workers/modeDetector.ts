export type DetectedMode = 'stable' | 'oscillator' | 'glider' | 'chaos' | 'unknown';

export interface ModeDetectionResult {
    mode: DetectedMode;
    oscillatorPeriod: number | null;
    confidence: number;
}

const MAX_HISTORY = 120;
const OSCILLATOR_SEARCH_LIMIT = 60;

function hashState(data: Uint8Array): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 4) {
        h ^= data[i];
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

function countAlive(data: Uint8Array): number {
    let c = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 128) c++;
    }
    return c;
}

function centroid(data: Uint8Array, width: number): [number, number] {
    let sx = 0, sy = 0, c = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 128) {
            const idx = i / 4;
            sx += idx % width;
            sy += Math.floor(idx / width);
            c++;
        }
    }
    return c > 0 ? [sx / c, sy / c] : [0, 0];
}

function entropy(data: Uint8Array): number {
    let alive = 0;
    const total = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 128) alive++;
    }
    if (alive === 0 || alive === total) return 0;
    const p = alive / total;
    return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

export function detectMode(
    history: { hash: number; centroid: [number, number]; alive: number; entropy: number }[],
): ModeDetectionResult {
    if (history.length < 2) return { mode: 'unknown', oscillatorPeriod: null, confidence: 0 };

    const cur = history[history.length - 1];

    if (cur.alive === 0) return { mode: 'stable', oscillatorPeriod: null, confidence: 1 };

    if (history.length >= 2 && cur.hash === history[history.length - 2].hash) {
        return { mode: 'stable', oscillatorPeriod: null, confidence: 0.95 };
    }

    for (let period = 2; period <= Math.min(OSCILLATOR_SEARCH_LIMIT, history.length - 1); period++) {
        const prev = history[history.length - 1 - period];
        if (cur.hash === prev.hash) {
            let valid = true;
            if (history.length > period + 1) {
                const check = history[history.length - 2];
                const checkPrev = history[history.length - 2 - period];
                if (check.hash !== checkPrev.hash) valid = false;
            }
            if (valid) {
                return { mode: 'oscillator', oscillatorPeriod: period, confidence: 0.9 };
            }
        }
    }

    if (history.length >= 10) {
        const recent = history.slice(-10);
        let dx = 0, dy = 0, consistent = true;
        for (let i = 1; i < recent.length; i++) {
            const ddx = recent[i].centroid[0] - recent[i - 1].centroid[0];
            const ddy = recent[i].centroid[1] - recent[i - 1].centroid[1];
            if (i === 1) { dx = ddx; dy = ddy; }
            else {
                const signX = Math.sign(ddx) === Math.sign(dx);
                const signY = Math.sign(ddy) === Math.sign(dy);
                if (Math.abs(dx) > 0.5 && !signX) consistent = false;
                if (Math.abs(dy) > 0.5 && !signY) consistent = false;
            }
        }
        const avgDrift = Math.sqrt(dx * dx + dy * dy);
        if (consistent && avgDrift > 0.3) {
            return { mode: 'glider', oscillatorPeriod: null, confidence: 0.75 };
        }
    }

    if (history.length >= 20) {
        const recent = history.slice(-20);
        const hashes = new Set(recent.map(h => h.hash));
        if (hashes.size >= 15 && cur.entropy > 0.01) {
            return { mode: 'chaos', oscillatorPeriod: null, confidence: 0.7 };
        }
    }

    return { mode: 'unknown', oscillatorPeriod: null, confidence: 0.3 };
}

const workerCode = `
${hashState.toString()}
${countAlive.toString()}
${centroid.toString()}
${entropy.toString()}
${detectMode.toString()}

const history = [];

self.onmessage = function(e) {
    const { data, width, generation } = e.data;
    const view = new Uint8Array(data);
    const h = hashState(view);
    const c = centroid(view, width);
    const a = countAlive(view);
    const ent = entropy(view);

    history.push({ hash: h, centroid: c, alive: a, entropy: ent });
    if (history.length > ${MAX_HISTORY}) history.shift();

    const result = detectMode(history);
    self.postMessage({ ...result, generation });
};
`;

export function createModeDetectorWorker(): Worker {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    return worker;
}
