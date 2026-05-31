import React, { useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { AnalysisMsg } from "../hooks/useBCIStream";

interface ConnectivityGraphProps {
  analysis: AnalysisMsg | null;
  topK?: number;
}

export const ConnectivityGraph: React.FC<ConnectivityGraphProps> = ({ analysis, topK = 10 }) => {
  const [selectedK, setSelectedK] = useState(topK);

  const figure = useMemo(() => {
    const conn = analysis?.connectivity;
    if (!conn || !conn.edges || !conn.node_positions || !conn.node_labels) {
      return {
        data: [],
        layout: {
          title: "等待功能连接数据...",
          paper_bgcolor: "#020617",
          plot_bgcolor: "#020617",
          font: { color: "#e2e8f0" },
          height: 500,
        },
      };
    }

    const edges = conn.edges as { i: number; j: number; weight: number }[];
    const positions = conn.node_positions as number[][];
    const labels = conn.node_labels as string[];

    // Filter to top K edges
    const filteredEdges = edges.slice(0, Math.min(selectedK, edges.length));

    const x = positions.map((p) => p[0]);
    const y = positions.map((p) => p[1]);

    // Build edge traces
    const edgeTraces: any[] = [];
    for (const e of filteredEdges) {
      const thickness = 1 + e.weight * 6; // scale thickness by PLV
      const color = e.weight > 0.7 ? "#22d3ee" : e.weight > 0.5 ? "#38bdf8" : "#64748b";
      edgeTraces.push({
        type: "scatter",
        mode: "lines",
        x: [x[e.i], x[e.j]],
        y: [y[e.i], y[e.j]],
        line: { color, width: thickness },
        hovertext: `${labels[e.i]} — ${labels[e.j]}<br>PLV: ${e.weight.toFixed(3)}`,
        hoverinfo: "text",
        showlegend: false,
      });
    }

    // Node trace
    const nodeTrace = {
      type: "scatter",
      mode: "markers+text",
      x,
      y,
      text: labels,
      textposition: "top center",
      textfont: { color: "#e2e8f0", size: 9 },
      marker: {
        size: 14,
        color: "#0ea5e9",
        line: { color: "#e2e8f0", width: 1 },
      },
      hovertemplate: "%{text}<extra></extra>",
      showlegend: false,
    };

    edgeTraces.push(nodeTrace);

    const band = analysis?.band || "Alpha";

    return {
      data: edgeTraces,
      layout: {
        title: `功能连接图 (PLV) · ${band} 频带 · Top ${selectedK}`,
        paper_bgcolor: "#020617",
        plot_bgcolor: "#020617",
        font: { color: "#e2e8f0", size: 11 },
        height: 550,
        xaxis: { visible: false, showgrid: false, zeroline: false },
        yaxis: { visible: false, showgrid: false, zeroline: false, scaleanchor: "x" },
        margin: { l: 20, r: 20, t: 60, b: 20 },
        hovermode: "closest",
        showlegend: false,
      },
    };
  }, [analysis, selectedK]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2 justify-end">
        <label className="text-xs text-slate-400">Top 边数：</label>
        <select
          value={selectedK}
          onChange={(e) => setSelectedK(Number(e.target.value))}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
        >
          {[5, 10, 15, 20, 30].map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>
      <Plot
        data={figure.data as any}
        layout={figure.layout as any}
        style={{ width: "100%", height: "100%", flex: 1 }}
      />
    </div>
  );
};
