import { useState, useCallback, useMemo } from 'react';

interface ExtendedPlayerStats {
  playerId: string;
  jerseyNumber: number;
  name: string;
  teamId: 'home' | 'away';
  totalDistance: number;
  highIntensityRatio: number;
  passes: number;
  passSuccessRate: number;
  shots: number;
  tackles: number;
}

interface PlayerStatsTableProps {
  stats: ExtendedPlayerStats[];
  onPlayerSelect?: (playerId: string | null) => void;
  selectedPlayerId?: string | null;
}

type SortField = 'jerseyNumber' | 'name' | 'totalDistance' | 'highIntensityRatio' | 'passes' | 'passSuccessRate' | 'shots' | 'tackles';
type SortDirection = 'asc' | 'desc';

const COLUMNS: { key: SortField; label: string; align: 'left' | 'center' | 'right' }[] = [
  { key: 'jerseyNumber', label: '球衣号', align: 'center' },
  { key: 'name', label: '姓名', align: 'left' },
  { key: 'totalDistance', label: '跑动距离(km)', align: 'center' },
  { key: 'highIntensityRatio', label: '高速跑占比', align: 'center' },
  { key: 'passes', label: '传球数', align: 'center' },
  { key: 'passSuccessRate', label: '成功率', align: 'center' },
  { key: 'shots', label: '射门', align: 'center' },
  { key: 'tackles', label: '抢断', align: 'center' },
];

function formatValue(field: SortField, value: number): string {
  switch (field) {
    case 'totalDistance':
      return (value / 1000).toFixed(2);
    case 'highIntensityRatio':
    case 'passSuccessRate':
      return `${(value * 100).toFixed(1)}%`;
    default:
      return String(value);
  }
}

function getRateClassName(field: SortField, value: number): string {
  if (field === 'passSuccessRate') {
    if (value >= 0.8) return 'bg-green-100 text-green-700';
    if (value >= 0.6) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  }
  return '';
}

const PlayerStatsTable = ({ stats, onPlayerSelect, selectedPlayerId }: PlayerStatsTableProps) => {
  const [sortField, setSortField] = useState<SortField>('jerseyNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  const sortedStats = useMemo(() => {
    const sorted = [...stats].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [stats, sortField, sortDirection]);

  const handleRowClick = useCallback(
    (playerId: string) => {
      if (onPlayerSelect) {
        onPlayerSelect(selectedPlayerId === playerId ? null : playerId);
      }
    },
    [onPlayerSelect, selectedPlayerId]
  );

  const exportCSV = useCallback(() => {
    const headers = COLUMNS.map((c) => c.label).join(',');
    const rows = sortedStats.map((s) =>
      COLUMNS.map((c) => {
        const val = s[c.key];
        return typeof val === 'number' ? formatValue(c.key, val) : val;
      }).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'player_stats.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, [sortedStats]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">球员统计</h3>
        <button
          onClick={exportCSV}
          className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>导出CSV</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`py-3 px-4 font-semibold text-gray-600 cursor-pointer select-none hover:bg-gray-50 transition-colors whitespace-nowrap text-${col.align}`}
                  style={{ textAlign: col.align }}
                >
                  <span className="inline-flex items-center space-x-1">
                    <span>{col.label}</span>
                    {sortField === col.key && (
                      <svg
                        className="w-3 h-3"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        {sortDirection === 'asc' ? (
                          <path d="M5.293 9.707l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 7.414l-3.293 3.293a1 1 0 01-1.414-1.414z" />
                        ) : (
                          <path d="M14.707 10.293l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 12.586l3.293-3.293a1 1 0 111.414 1.414z" />
                        )}
                      </svg>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((player) => {
              const isSelected = selectedPlayerId === player.playerId;
              return (
                <tr
                  key={player.playerId}
                  onClick={() => handleRowClick(player.playerId)}
                  className={`border-b border-gray-100 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border-l-4 border-l-blue-600'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {COLUMNS.map((col) => {
                    const val = player[col.key];
                    const isRate = col.key === 'passSuccessRate' || col.key === 'highIntensityRatio';
                    const rateClass = isRate && typeof val === 'number' ? getRateClassName(col.key, val) : '';

                    return (
                      <td
                        key={col.key}
                        className={`py-3 px-4 whitespace-nowrap ${col.key === 'name' ? 'font-medium text-gray-800' : 'text-gray-600'}`}
                        style={{ textAlign: col.align }}
                      >
                        {col.key === 'jerseyNumber' ? (
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold ${
                              player.teamId === 'home' ? 'bg-blue-600' : 'bg-red-600'
                            }`}
                          >
                            {val}
                          </span>
                        ) : isRate && typeof val === 'number' ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${rateClass}`}>
                            {formatValue(col.key, val)}
                          </span>
                        ) : typeof val === 'number' ? (
                          formatValue(col.key, val)
                        ) : (
                          val
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {stats.length === 0 && (
        <div className="text-center py-8 text-gray-400">暂无球员数据</div>
      )}
    </div>
  );
};

export default PlayerStatsTable;
