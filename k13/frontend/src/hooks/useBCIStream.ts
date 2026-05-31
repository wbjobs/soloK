import { useEffect, useRef, useState, useCallback } from "react";
import { RingBuffer } from "../utils/RingBuffer";

export interface Artifact {
  channel: number;
  start: number;
  end: number;
  kind: string;
  severity: number;
}

export interface AnalysisMsg {
  type: "analysis";
  band: string;
  freqs: number[];
  psd: number[][];
  band_power: number[];
  artifacts: Artifact[];
  topo: {
    xs: number[]; ys: number[]; z: number[][]; verts: number[][]; v3d: number[][] };
  erp_avg: Record<string, number[][]>;
  events: any[];
  source?: {
    positions: number[][];
    faces: number[][];
    density: number[];
    density_raw: number[];
    n_sources: number;
  };
  connectivity?: {
    plv: number[][];
    edges: { i: number; j: number; weight: number }[];
    node_positions: number[][];
    node_labels: string[];
  };
}

export interface EEGDeltaMsg {
  type: "eeg_delta";
  n_chan: number;
  display_srate: number;
  n_samples: number;
  samples_b64: string;
}

export interface EEGSnapshotMsg {
  type: "eeg_snapshot";
  n_chan: number;
  display_srate: number;
  n_samples: number;
  samples_b64: string;
  full_srate: number;
  chan_labels: string[];
}

export type StreamStatus = "connecting" | "connected" | "disconnected" | "error";

function decodeB64Float32(b64: string): Float32Array[] {
  // Decode base64 -> bytes -> np.save format -> extract the array
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  // Parse .npy format: magic string (6 bytes) + version (2 bytes) + header length (2 bytes) + header + data
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 6));
  if (magic !== "\x93NUMPY") {
    throw new Error("Invalid npy magic");
  }
  const headerLen = view.getUint16(8, true);
  const dataOffset = 10 + headerLen;
  const dataBytes = bytes.subarray(dataOffset);
  const floatView = new Float32Array(
    dataBytes.buffer,
    dataBytes.byteOffset,
    dataBytes.byteLength / 4
  );
  return [floatView]; // will be reshaped by caller
}

function reshapeFlat(flat: Float32Array, nChan: number, nSamples: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (let ch = 0; ch < nChan; ch++) {
    const row = new Float32Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      row[i] = flat[ch * nSamples + i];
    }
    out.push(row);
  }
  return out;
}

export interface UseBCIStreamOpts {
  sessionId: string;
  displaySeconds?: number;
  onAnalysis?: (msg: AnalysisMsg) => void;
}

export function useBCIStream({ sessionId, displaySeconds = 10, onAnalysis }: UseBCIStreamOpts) {
  const [status, setStatus] = useState<StreamStatus>("disconnected");
  const [displaySrate, setDisplaySrate] = useState<number>(200);
  const [chanLabels, setChanLabels] = useState<string[]>([]);
  const bufferRef = useRef<RingBuffer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const latestAnalysisRef = useRef<AnalysisMsg | null>(null);
  const [, forceRender] = useState(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setStatus("connecting");
    const ws = new WebSocket(`/ws/${sessionId}`);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus("connected");
      // Request initial snapshot
      ws.send(JSON.stringify({ action: "snapshot", seconds: displaySeconds }));
      // Configure stream: 200 Hz display, 50ms send interval
      ws.send(
        JSON.stringify({
          action: "configure_stream",
          display_srate: 200,
          send_interval: 0.05,
        })
      );
      // Start requesting analysis at 2 Hz
      const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "analysis", band: "Alpha" }));
        }
      }, 500);
      (ws as any)._analysisInterval = interval;
    };
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === "eeg_snapshot") {
        const m = msg as EEGSnapshotMsg;
        const flat = decodeB64Float32(m.samples_b64)[0];
        const shaped = reshapeFlat(flat, m.n_chan, m.n_samples);
        const maxSamples = Math.max(m.n_samples, Math.ceil(displaySeconds * m.display_srate));
        const buf = new RingBuffer(m.n_chan, maxSamples);
        buf.push(shaped);
        bufferRef.current = buf;
        setDisplaySrate(m.display_srate);
        setChanLabels(m.chan_labels);
        forceRender((x) => x + 1);
      } else if (msg.type === "eeg_delta") {
        const m = msg as EEGDeltaMsg;
        if (!bufferRef.current) {
          // No snapshot received yet; request one
          ws.send(JSON.stringify({ action: "snapshot", seconds: displaySeconds }));
          return;
        }
        const flat = decodeB64Float32(m.samples_b64)[0];
        const shaped = reshapeFlat(flat, m.n_chan, m.n_samples);
        bufferRef.current.push(shaped);
        forceRender((x) => x + 1);
      } else if (msg.type === "analysis") {
        const m = msg as AnalysisMsg;
        latestAnalysisRef.current = m;
        onAnalysis?.(m);
        forceRender((x) => x + 1);
      }
    };
    ws.onclose = () => {
      setStatus("disconnected");
      if ((ws as any)._analysisInterval) {
        clearInterval((ws as any)._analysisInterval);
      }
    };
    ws.onerror = () => setStatus("error");
  }, [sessionId, displaySeconds, onAnalysis]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setStatus("disconnected");
  }, []);

  const setBand = useCallback((band: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "analysis", band }));
    }
  }, []);

  const sendEvent = useCallback((event: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "event", event }));
    }
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return {
    status,
    connect,
    disconnect,
    buffer: bufferRef.current,
    displaySrate,
    chanLabels,
    latestAnalysis: latestAnalysisRef.current,
    setBand,
    sendEvent,
  };
}
