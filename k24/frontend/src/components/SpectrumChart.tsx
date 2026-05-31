import React from 'react';
import Plot from 'react-plotly.js';
import { Box, Typography } from '@mui/material';

interface SpectrumChartProps {
  wavelengths: number[];
  spectra: {
    name: string;
    values: number[];
    color?: string;
    std?: number[];
  }[];
  title?: string;
  xlabel?: string;
  ylabel?: string;
  showLegend?: boolean;
  highlightRegions?: {
    start: number;
    end: number;
    color: string;
    opacity?: number;
  }[];
}

const SpectrumChart: React.FC<SpectrumChartProps> = ({
  wavelengths,
  spectra,
  title = '光谱曲线',
  xlabel = '波长 (nm)',
  ylabel = '反射率',
  showLegend = true,
  highlightRegions = [],
}) => {
  const traces = spectra.flatMap((spec) => {
    const trace = {
      x: wavelengths,
      y: spec.values,
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: spec.name,
      line: {
        color: spec.color,
        width: 2,
      },
    };

    if (spec.std) {
      const upperStd = {
        x: wavelengths,
        y: spec.values.map((v, i) => v + spec.std![i]),
        type: 'scatter' as const,
        mode: 'lines' as const,
        line: { width: 0 },
        showlegend: false,
        name: `${spec.name} 上边界`,
      };

      const lowerStd = {
        x: wavelengths,
        y: spec.values.map((v, i) => v - spec.std![i]),
        type: 'scatter' as const,
        mode: 'lines' as const,
        fill: 'tonexty' as const,
        fillcolor: `${spec.color}33` || 'rgba(0, 128, 128, 0.2)',
        line: { width: 0 },
        showlegend: false,
        name: `${spec.name} 下边界`,
      };

      return [trace, upperStd, lowerStd];
    }

    return [trace];
  });

  const shapes = highlightRegions.map((region) => ({
    type: 'rect' as const,
    xref: 'x' as const,
    yref: 'paper' as const,
    x0: region.start,
    y0: 0,
    x1: region.end,
    y1: 1,
    fillcolor: region.color,
    opacity: region.opacity || 0.1,
    line: { width: 0 },
  }));

  return (
    <Box>
      {title && (
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
      )}
      <Plot
        data={traces}
        layout={{
          xaxis: { title: xlabel },
          yaxis: { title: ylabel },
          showlegend: showLegend,
          legend: { x: 1.05, y: 1 },
          margin: { t: 10, r: 100 },
          shapes,
          hovermode: 'x unified',
        }}
        style={{ width: '100%', height: '400px' }}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
        }}
      />
    </Box>
  );
};

export default SpectrumChart;
