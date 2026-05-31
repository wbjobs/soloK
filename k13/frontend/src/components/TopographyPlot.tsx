import React, { useMemo } from "react";
import Plot from "react-plotly.js";
import { AnalysisMsg } from "../hooks/useBCIStream";

interface TopographyProps {
  analysis: AnalysisMsg | null;
  mode?: "2D" | "3D";
}

export const TopographyPlot: React.FC<TopographyProps> = ({ analysis, mode = "2D" }) => {
  const figure = useMemo(() => {
    const topo = analysis?.topo;
    if (!topo || !topo.xs || !topo.ys || !topo.z) {
      return {
        data: [],
        layout: {
          title: "等待脑电地形图数据...",
          paper_bgcolor: "#020617",
          plot_bgcolor: "#020617",
          font: { color: "#e2e8f0" },
          height: 400,
        },
      };
    }

    if (mode === "2D") {
      return {
        data: [
          {
            type: "contour",
            x: topo.xs,
            y: topo.ys,
            z: topo.z,
            colorscale: "RdBu_r",
            contours: { coloring: "heatmap" },
            line: { smoothing: 1 },
            colorbar: {
              title: "功率",
              tickfont: { color: "#e2e8f0" },
              titlefont: { color: "#e2e8f0" },
            },
          },
          {
            type: "scatter",
            mode: "lines",
            x: Array.from({ length: 101 }, (_, i) => Math.cos((2 * Math.PI * i) / 100)),
            y: Array.from({ length: 101 }, (_, i) => Math.sin((2 * Math.PI * i) / 100)),
            line: { color: "#64748b", width: 2 },
            showlegend: false,
            hoverinfo: "skip",
          },
        ],
        layout: {
          title: `头皮电压分布图 · ${analysis.band} 频带`,
          paper_bgcolor: "#020617",
          plot_bgcolor: "#020617",
          font: { color: "#e2e8f0", size: 11 },
          height: 400,
          width: 400,
          xaxis: { range: [-1.1, 1.1], zeroline: false, showgrid: false, showticklabels: false },
          yaxis: { range: [-1.1, 1.1], zeroline: false, showgrid: false, showticklabels: false, scaleanchor: "x" },
          margin: { l: 10, r: 60, t: 50, b: 10 },
        },
      };
    } else {
      // 3D Surface
      const verts = topo.verts as number[][];
      const v3d = topo.v3d as number[][];
      const x = verts.map((v) => v[0]);
      const y = verts.map((v) => v[1]);
      const z = verts.map((v) => v[2]);
      return {
        data: [
          {
            type: "surface",
            x: v3d.map((row, i) => row.map((_, j) => x[i * v3d[0].length + j])),
            y: v3d.map((row, i) => row.map((_, j) => y[i * v3d[0].length + j])),
            z: v3d.map((row, i) => row.map((_, j) => z[i * v3d[0].length + j])),
            surfacecolor: v3d,
            colorscale: "RdBu_r",
            showscale: true,
            colorbar: {
              title: "功率",
              tickfont: { color: "#e2e8f0" },
              titlefont: { color: "#e2e8f0" },
            },
          },
        ],
        layout: {
          title: `3D 头皮曲面图 · ${analysis.band} 频带`,
          paper_bgcolor: "#020617",
          plot_bgcolor: "#020617",
          font: { color: "#e2e8f0", size: 11 },
          height: 500,
          scene: {
            xaxis: { visible: false },
            yaxis: { visible: false },
            zaxis: { visible: false },
            bgcolor: "#020617",
          },
          margin: { l: 10, r: 60, t: 50, b: 10 },
        },
      };
    }
  }, [analysis, mode]);

  return <Plot data={figure.data as any} layout={figure.layout as any} style={{ width: "100%", height: "100%" }} />;
};
