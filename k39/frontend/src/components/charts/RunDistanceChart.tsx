import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { PlayerRunData } from '../../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface RunDistanceChartProps {
  players: PlayerRunData[];
}

const RUN_TYPE_COLORS: Record<string, string> = {
  walk: '#93C5FD',
  jog: '#3B82F6',
  run: '#F59E0B',
  sprint: '#EF4444',
};

const RUN_TYPE_LABELS: Record<string, string> = {
  walk: '走',
  jog: '慢跑',
  run: '跑',
  sprint: '冲刺',
};

const RunDistanceChart = ({ players }: RunDistanceChartProps) => {
  const chartData = useMemo(() => {
    const labels = players.map((p) => p.playerName);
    const runTypes = ['walk', 'jog', 'run', 'sprint'] as const;

    const datasets = runTypes.map((type) => ({
      label: RUN_TYPE_LABELS[type],
      data: players.map((p) => {
        const totalDist = p.runs
          .filter((r) => r.type === type)
          .reduce((sum, r) => sum + r.distance, 0);
        return Math.round(totalDist);
      }),
      backgroundColor: RUN_TYPE_COLORS[type],
      borderRadius: 2,
      borderSkipped: false as const,
    }));

    return { labels, datasets };
  }, [players]);

  const options = useMemo(
    () => ({
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            text: '距离 (m)',
            font: { size: 12 },
          },
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: {
            font: { size: 12 },
          },
        },
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            padding: 16,
            usePointStyle: true,
            pointStyle: 'rectRounded' as const,
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context: { dataset?: { label?: string }; parsed?: { x?: number } }) => {
              const label = context.dataset?.label || '';
              const value = context.parsed?.x || 0;
              return `${label}: ${(value / 1000).toFixed(2)} km`;
            },
          },
        },
      },
    }),
    []
  );

  const chartHeight = Math.max(200, players.length * 40 + 80);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">跑动距离分布</h3>
      <div style={{ height: chartHeight }}>
        <Bar data={chartData} options={options} />
      </div>

      <div className="flex justify-center space-x-6 mt-4">
        {(['walk', 'jog', 'run', 'sprint'] as const).map((type) => (
          <div key={type} className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: RUN_TYPE_COLORS[type] }} />
            <span className="text-sm text-gray-600">{RUN_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RunDistanceChart;
