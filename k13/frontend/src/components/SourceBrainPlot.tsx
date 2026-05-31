import React, { useMemo } from "react";
import Plot from "react-plotly.js";
import { AnalysisMsg } from "../hooks/useBCIStream";

interface SourceBrainPlotProps {
  analysis: AnalysisMsg | null;
}

export const SourceBrainPlot: React.FC<SourceBrainPlotProps> = ({ analysis }) => {
  const figure = useMemo(() => {
    const src = analysis?.source;
    if (!src || !src.positions || !src.faces || !src.density) {
      return {
        data: [],
        layout: {
          title: "等待 sLORETA 源定位数据...",
          paper_bgcolor: "#020617",
          plot_bgcolor: "#020617",
          font: { color: "#e2e8f0" },
          height: 500,
        },
      };
    }

    const positions = src.positions as number[][];
    const faces = src.faces as number[][];
    const density = src.density as number[];

    const x = positions.map((p) => p[0]);
    const y = positions.map((p) => p[1]);
    const z = positions.map((p) => p[2]);
    const i = faces.map((f) => f[0]);
    const j = faces.map((f) => f[1]);
    const k = faces.map((f) => f[2]);

    const band = analysis.band || "Alpha";

    return {
      data: [
        {
          type: "mesh3d",
          x,
          y,
          z,
          i,
          j,
          k,
          intensity: density,
          colorscale: "Hot",
          cmin: 0,
          cmax: 1,
          showscale: true,
          colorbar: {
            title: "电流密度",
            tickfont: { color: "#e2e8f0" },
            titlefont: { color: "#e2e8f0" },
          },
          flatshading: true,
          lighting: {
            ambient: 0.6,
            diffuse: 0.8,
            specular: 0.2,
            roughness: 0.5,
          },
          hovertemplate: "源 %{i}<br>密度: %{intensity:.3f}<extra></extra>",
        },
      ],
      layout: {
        title: `sLORETA 皮层电流密度 · ${band} 频带`,
        paper_bgcolor: "#020617",
        plot_bgcolor: "#020617",
        font: { color: "#e2e8f0", size: 11 },
        height: 550,
        scene: {
          xaxis: { visible: false, showbackground: false },
          yaxis: { visible: false, showbackground: false },
          zaxis: { visible: false, showbackground: false },
          bgcolor: "#020617",
          camera: {
            eye: { x: 1.5, y: 1.5, z: 1.2 },
            center: { x: 0, y: 0, z: 0 },
          },
        },
        margin: { l: 10, r: 60, t: 50, b: 10 },
      },
    };
  }, [analysis]);

  return <Plot data={figure.data as any} layout={figure.layout as any} style={{ width: "100%", height: "100%" }} />;
};
