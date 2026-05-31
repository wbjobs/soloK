import React, { useMemo, useRef, useEffect, useState } from "react";
import Plot from "react-plotly.js";
import { RingBuffer } from "../utils/RingBuffer";
import { Artifact } from "../hooks/useBCIStream";

interface WaterfallProps {
  buffer: RingBuffer | null;
  displaySrate: number;
  chanLabels: string[];
  artifacts?: Artifact[];
  displaySeconds?: number;
}

export const WaterfallPlot: React.FC<WaterfallProps> = ({
  buffer,
  displaySrate,
  chanLabels,
  artifacts = [],
  displaySeconds = 10,
}) => {
  const nSamples = Math.min(buffer?.count || 0, Math.ceil(displaySeconds * displaySrate));
  const nChan = chanLabels.length;
  const [renderTrigger, setRenderTrigger] = useState(0);
  const rafRef = useRef<number>();
  const lastRenderRef = useRef<number>(0);

  // Use requestAnimationFrame to throttle re-renders to ~30 FPS max
  useEffect(() => {
    const tick = (now: number) => {
      if (now - lastRenderRef.current > 33) {
        lastRenderRef.current = now;
        setRenderTrigger((x) => x + 1);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const figure = useMemo(() => {
    if (!buffer || nChan === 0 || nSamples === 0) {
      return {
        data: [],
        layout: {
          title: "Waiting for data...",
          paper_bgcolor: "#020617",
          plot_bgcolor: "#020617",
          font: { color: "#e2e8f0" },
          height: 600,
        },
        config: { displayModeBar: false },
      };
    }

    const data = buffer.readLast(nSamples);
    const timeBase = Array.from({ length: nSamples }, (_, i) => (i - nSamples) / displaySrate);

    // Plot each channel as a separate Scattergl trace (WebGL-accelerated)
    // Channels are stacked vertically with spacing
    const ySpacing = 15; // microvolts between channels
    const traces: any[] = [];

    for (let ch = nChan - 1; ch >= 0; ch--) {
      const yOffset = ch * ySpacing;
      const yData = new Float32Array(nSamples);
      const chData = data[ch];
      for (let i = 0; i < nSamples; i++) {
        yData[i] = chData[i] + yOffset;
      }
      traces.push({
        type: "scattergl",
        mode: "lines",
        x: timeBase,
        y: Array.from(yData),
        name: chanLabels[ch] || `Ch${ch}`,
        line: { width: 1, color: "#38bdf8" },
        hoverinfo: "y+name",
        showlegend: false,
      });
    }

    // Highlight artifact regions
    for (const art of artifacts) {
      if (art.channel < 0 || art.channel >= nChan) continue;
      const ch = art.channel;
      const yOffset = ch * ySpacing;
      const tStart = Math.max(art.start - displaySeconds, -displaySeconds);
      const tEnd = Math.min(art.end - displaySeconds, 0);
      if (tEnd < tStart) continue;
      traces.push({
        type: "scattergl",
        mode: "lines",
        x: [tStart, tStart, tEnd, tEnd, tStart],
        y: [yOffset - 5, yOffset + 5, yOffset + 5, yOffset - 5, yOffset - 5],
        fill: "toself",
        fillcolor: art.kind === "EMG" ? "rgba(239,68,68,0.3)" : "rgba(251,191,36,0.3)",
        line: { color: art.kind === "EMG" ? "#ef4444" : "#fbbf24", width: 1 },
        hovertext: `${art.kind} artifact (severity=${art.severity.toFixed(1)})`,
        hoverinfo: "text",
        showlegend: false,
      });
    }

    const yTickVals = Array.from({ length: nChan }, (_, i) => i * ySpacing);
    const yTickTexts = chanLabels.slice().reverse();

    return {
      data: traces,
      layout: {
        title: `EEG 时域波形 (${nChan}ch, ${displaySrate} Hz 显示率)`,
        paper_bgcolor: "#020617",
        plot_bgcolor: "#020617",
        font: { color: "#e2e8f0", size: 11 },
        height: Math.max(600, nChan * 24),
        margin: { l: 60, r: 20, t: 50, b: 40 },
        xaxis: {
          title: "时间 (秒)",
          gridcolor: "#1e293b",
          zerolinecolor: "#334155",
          range: [-displaySeconds, 0],
          color: "#e2e8f0",
        },
        yaxis: {
          tickvals: yTickVals,
          ticktext: yTickTexts,
          gridcolor: "#1e293b",
          zeroline: false,
          color: "#e2e8f0",
        },
        hovermode: "closest",
      },
      config: { displayModeBar: true, displaylogo: false, responsive: true },
    };
  }, [buffer, nSamples, nChan, displaySrate, chanLabels, artifacts, displaySeconds, renderTrigger]);

  return <Plot data={figure.data} layout={figure.layout as any} config={figure.config as any} style={{ width: "100%", height: "100%" }} />;
};
