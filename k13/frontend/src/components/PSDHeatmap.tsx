import React, { useMemo } from "react";
import Plot from "react-plotly.js";
import { AnalysisMsg } from "../hooks/useBCIStream";

interface PSDHeatmapProps {
  analysis: AnalysisMsg | null;
  chanLabels: string[];
}

export const PSDHeatmap: React.FC<PSDHeatmapProps> = ({ analysis, chanLabels }) => {
  const figure = useMemo(() => {
    if (!analysis || !analysis.psd || analysis.psd.length === 0) {
      return {
        data: [],
        layout: { title: "等待 PSD 数据...", paper_bgcolor: "#020617", plot_bgcolor: "#020617", font: { color: "#e2e8f0" }, height: 400 },
      };
    }
    // Plot log(PSD) for better visibility
    const logPsd = analysis.psd.map((row) =>
      row.map((v) => (v > 0 ? Math.log10(v) : -10))
    );
    return {
      data: [
        {
          type: "heatmap",
          z: logPsd,
          x: analysis.freqs,
          y: chanLabels.slice(0, logPsd.length),
          colorscale: "Viridis",
          showscale: true,
          zmin: -3,
          zmax: 3,
          colorbar: {
            title: "log10(PSD)",
            tickfont: { color: "#e2e8f0" },
            titlefont: { color: "#e2e8f0" },
          },
        },
      ],
      layout: {
        title: `功率谱密度 (PSD) · ${analysis.band} 带功率突出`,
        paper_bgcolor: "#020617",
        plot_bgcolor: "#020617",
        font: { color: "#e2e8f0", size: 11 },
        height: 400,
        margin: { l: 60, r: 60, t: 50, b: 40 },
        xaxis: { title: "频率 (Hz)", gridcolor: "#1e293b", color: "#e2e8f0" },
        yaxis: { gridcolor: "#1e293b", color: "#e2e8f0" },
      },
    };
  }, [analysis, chanLabels]);

  return <Plot data={figure.data as any} layout={figure.layout as any} style={{ width: "100%", height: "100%" }} />;
};
