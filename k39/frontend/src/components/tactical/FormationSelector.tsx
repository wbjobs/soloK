import { useState } from 'react';
import { FormationType } from '../../types';

export interface FormationSelectorProps {
  value: FormationType;
  onChange: (formation: FormationType) => void;
}

const FORMATION_OPTIONS: { type: FormationType; label: string; positions: { row: number; cols: number[] }[] }[] = [
  {
    type: FormationType.F442,
    label: '4-4-2',
    positions: [
      { row: 0, cols: [50] },
      { row: 1, cols: [15, 38, 62, 85] },
      { row: 2, cols: [15, 38, 62, 85] },
      { row: 3, cols: [35, 65] },
    ],
  },
  {
    type: FormationType.F433,
    label: '4-3-3',
    positions: [
      { row: 0, cols: [50] },
      { row: 1, cols: [15, 38, 62, 85] },
      { row: 2, cols: [25, 50, 75] },
      { row: 3, cols: [20, 50, 80] },
    ],
  },
  {
    type: FormationType.F352,
    label: '3-5-2',
    positions: [
      { row: 0, cols: [50] },
      { row: 1, cols: [25, 50, 75] },
      { row: 2, cols: [10, 30, 50, 70, 90] },
      { row: 3, cols: [35, 65] },
    ],
  },
  {
    type: FormationType.F532,
    label: '5-3-2',
    positions: [
      { row: 0, cols: [50] },
      { row: 1, cols: [10, 30, 50, 70, 90] },
      { row: 2, cols: [25, 50, 75] },
      { row: 3, cols: [35, 65] },
    ],
  },
  {
    type: FormationType.F4231,
    label: '4-2-3-1',
    positions: [
      { row: 0, cols: [50] },
      { row: 1, cols: [15, 38, 62, 85] },
      { row: 2, cols: [35, 65] },
      { row: 3, cols: [20, 50, 80] },
      { row: 4, cols: [50] },
    ],
  },
];

function MiniField({ positions }: { positions: { row: number; cols: number[] }[] }) {
  const rowHeight = 100 / (positions.length);
  return (
    <svg viewBox="0 0 100 120" className="w-full h-full">
      <rect x="0" y="0" width="100" height="120" rx="3" fill="#2d8c4e" />
      <rect x="2" y="2" width="96" height="116" rx="2" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      <line x1="50" y1="2" x2="50" y2="118" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      <circle cx="50" cy="60" r="8" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
      {positions.map((row, ri) =>
        row.cols.map((col) => (
          <circle
            key={`${ri}-${col}`}
            cx={col}
            cy={10 + ri * rowHeight + rowHeight / 2}
            r="3.5"
            fill="#3B82F6"
            stroke="white"
            strokeWidth="0.5"
          />
        ))
      )}
    </svg>
  );
}

const FormationSelector = ({ value, onChange }: FormationSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const currentFormation = FORMATION_OPTIONS.find((f) => f.type === value);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-3 py-2 hover:border-blue-400 transition-colors shadow-sm"
      >
        <div className="w-8 h-8">
          {currentFormation && <MiniField positions={currentFormation.positions} />}
        </div>
        <span className="text-sm font-medium text-gray-700">{currentFormation?.label || '选择阵型'}</span>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20">
            <div className="p-2">
              <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">选择阵型</p>
            </div>
            <div className="px-2 pb-2 space-y-1">
              {FORMATION_OPTIONS.map((formation) => {
                const isActive = value === formation.type;
                return (
                  <button
                    key={formation.type}
                    onClick={() => {
                      onChange(formation.type);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-12 h-12 flex-shrink-0">
                      <MiniField positions={formation.positions} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-bold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                        {formation.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formation.positions.map((r) => r.cols.length).join('-')}
                      </p>
                    </div>
                    {isActive && (
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FormationSelector;
