import type { Formation } from '../../types';

interface FormationDisplayProps {
  formation: Formation;
  width?: number;
  height?: number;
  homeTeam?: string;
  awayTeam?: string;
}

const FormationDisplay = ({ formation, width = 500, height = 350, homeTeam = '主队', awayTeam = '客队' }: FormationDisplayProps) => {
  const pitchPad = 20;
  const pitchW = width - pitchPad * 2;
  const pitchH = height - pitchPad * 2;
  const penW = pitchW * 0.17;
  const penH = pitchH * 0.35;
  const goalW = pitchW * 0.06;
  const goalH = pitchH * 0.18;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">阵型展示</h3>
        <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
          {formation.name}
        </span>
      </div>

      <div className="flex justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="rounded-lg overflow-hidden"
        >
          <rect width={width} height={height} fill="#1a7a3a" />

          <rect
            x={pitchPad}
            y={pitchPad}
            width={pitchW}
            height={pitchH}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />
          <line
            x1={width / 2}
            y1={pitchPad}
            x2={width / 2}
            y2={pitchPad + pitchH}
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />
          <circle
            cx={width / 2}
            cy={height / 2}
            r={Math.min(pitchW, pitchH) * 0.12}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />
          <circle cx={width / 2} cy={height / 2} r={3} fill="rgba(255,255,255,0.5)" />

          <rect
            x={pitchPad}
            y={height / 2 - penH / 2}
            width={penW}
            height={penH}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />
          <rect
            x={pitchPad + pitchW - penW}
            y={height / 2 - penH / 2}
            width={penW}
            height={penH}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />

          <rect
            x={pitchPad}
            y={height / 2 - goalH / 2}
            width={goalW}
            height={goalH}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />
          <rect
            x={pitchPad + pitchW - goalW}
            y={height / 2 - goalH / 2}
            width={goalW}
            height={goalH}
            fill="none"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
          />

          <text
            x={width / 2}
            y={pitchPad - 6}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize="11"
            fontFamily="sans-serif"
          >
            {awayTeam}
          </text>
          <text
            x={width / 2}
            y={pitchPad + pitchH + 14}
            textAnchor="middle"
            fill="rgba(255,255,255,0.7)"
            fontSize="11"
            fontFamily="sans-serif"
          >
            {homeTeam}
          </text>

          {formation.positions.map((pos, idx) => {
            const px = pitchPad + pos.x * pitchW;
            const py = pitchPad + pos.y * pitchH;
            return (
              <g key={idx}>
                <circle cx={px} cy={py} r={14} fill="#3B82F6" stroke="#fff" strokeWidth={2} />
                <text
                  x={px}
                  y={py + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                >
                  {pos.role}
                </text>
              </g>
            );
          })}

          <text
            x={pitchPad + pitchW / 2}
            y={pitchPad + pitchH + 28}
            textAnchor="middle"
            fill="rgba(255,255,255,0.6)"
            fontSize="13"
            fontWeight="bold"
            fontFamily="sans-serif"
          >
            {formation.type}
          </text>
        </svg>
      </div>

      <div className="flex justify-center space-x-6 mt-4">
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
          <span className="text-sm text-gray-600">{homeTeam}</span>
        </div>
        <div className="text-sm text-gray-400">阵型: {formation.type}</div>
      </div>
    </div>
  );
};

export default FormationDisplay;
