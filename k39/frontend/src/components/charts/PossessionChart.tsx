import { useState, useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PossessionData {
  home: number;
  away: number;
}

interface PeriodData {
  firstHalf?: PossessionData;
  secondHalf?: PossessionData;
  fullMatch?: PossessionData;
}

interface PossessionChartProps {
  possession: PossessionData;
  periods?: PeriodData;
  homeTeam?: string;
  awayTeam?: string;
}

type PeriodKey = 'fullMatch' | 'firstHalf' | 'secondHalf';

const periodLabels: Record<PeriodKey, string> = {
  fullMatch: '全场',
  firstHalf: '上半场',
  secondHalf: '下半场',
};

const PossessionChart = ({ possession, periods, homeTeam = '主队', awayTeam = '客队' }: PossessionChartProps) => {
  const [activePeriod, setActivePeriod] = useState<PeriodKey>('fullMatch');

  const currentData = useMemo(() => {
    if (periods && periods[activePeriod]) {
      return periods[activePeriod]!;
    }
    return possession;
  }, [possession, periods, activePeriod]);

  const chartData = useMemo(
    () => ({
      labels: [homeTeam, awayTeam],
      datasets: [
        {
          data: [currentData.home, currentData.away],
          backgroundColor: ['#3B82F6', '#EF4444'],
          borderWidth: 0,
          hoverOffset: 8,
        },
      ],
    }),
    [currentData, homeTeam, awayTeam]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: {
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle' as const,
            font: { size: 13 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context: { label?: string; parsed: number }) => {
              return `${context.label}: ${context.parsed}%`;
            },
          },
        },
      },
    }),
    []
  );

  const hasPeriods = periods && (periods.firstHalf || periods.secondHalf);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">控球率</h3>
        {hasPeriods && (
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            {(Object.keys(periodLabels) as PeriodKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setActivePeriod(key)}
                className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${
                  activePeriod === key
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {periodLabels[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-56 h-56 mx-auto relative">
        <Doughnut data={chartData} options={options} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{currentData.home}%</p>
            <p className="text-xs text-gray-400">-</p>
            <p className="text-2xl font-bold text-gray-800">{currentData.away}%</p>
          </div>
        </div>
      </div>

      <div className="flex justify-center space-x-8 mt-4">
        <div className="text-center">
          <div className="w-3 h-3 rounded-full bg-blue-500 mx-auto mb-1" />
          <p className="text-sm text-gray-600">{homeTeam}</p>
          <p className="text-lg font-bold text-blue-600">{currentData.home}%</p>
        </div>
        <div className="text-center">
          <div className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-1" />
          <p className="text-sm text-gray-600">{awayTeam}</p>
          <p className="text-lg font-bold text-red-600">{currentData.away}%</p>
        </div>
      </div>
    </div>
  );
};

export default PossessionChart;
