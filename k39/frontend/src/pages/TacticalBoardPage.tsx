import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { fetchMatches } from '../store/matchSlice';
import { FormationType } from '../types';

const formations: Record<FormationType, { role: string; x: number; y: number }[]> = {
  [FormationType.F442]: [
    { role: 'GK', x: 50, y: 90 },
    { role: 'RB', x: 15, y: 70 }, { role: 'CB', x: 35, y: 75 }, { role: 'CB', x: 65, y: 75 }, { role: 'LB', x: 85, y: 70 },
    { role: 'RM', x: 15, y: 45 }, { role: 'CM', x: 35, y: 50 }, { role: 'CM', x: 65, y: 50 }, { role: 'LM', x: 85, y: 45 },
    { role: 'ST', x: 35, y: 20 }, { role: 'ST', x: 65, y: 20 },
  ],
  [FormationType.F433]: [
    { role: 'GK', x: 50, y: 90 },
    { role: 'RB', x: 15, y: 70 }, { role: 'CB', x: 35, y: 75 }, { role: 'CB', x: 65, y: 75 }, { role: 'LB', x: 85, y: 70 },
    { role: 'CM', x: 30, y: 50 }, { role: 'CM', x: 50, y: 55 }, { role: 'CM', x: 70, y: 50 },
    { role: 'RW', x: 20, y: 20 }, { role: 'ST', x: 50, y: 15 }, { role: 'LW', x: 80, y: 20 },
  ],
  [FormationType.F352]: [
    { role: 'GK', x: 50, y: 90 },
    { role: 'CB', x: 25, y: 75 }, { role: 'CB', x: 50, y: 78 }, { role: 'CB', x: 75, y: 75 },
    { role: 'RM', x: 10, y: 55 }, { role: 'CM', x: 30, y: 50 }, { role: 'CM', x: 50, y: 55 }, { role: 'CM', x: 70, y: 50 }, { role: 'LM', x: 90, y: 55 },
    { role: 'ST', x: 35, y: 20 }, { role: 'ST', x: 65, y: 20 },
  ],
  [FormationType.F532]: [
    { role: 'GK', x: 50, y: 90 },
    { role: 'RB', x: 15, y: 72 }, { role: 'CB', x: 30, y: 78 }, { role: 'CB', x: 50, y: 80 }, { role: 'CB', x: 70, y: 78 }, { role: 'LB', x: 85, y: 72 },
    { role: 'CM', x: 30, y: 50 }, { role: 'CM', x: 50, y: 55 }, { role: 'CM', x: 70, y: 50 },
    { role: 'ST', x: 35, y: 20 }, { role: 'ST', x: 65, y: 20 },
  ],
  [FormationType.F4231]: [
    { role: 'GK', x: 50, y: 90 },
    { role: 'RB', x: 15, y: 70 }, { role: 'CB', x: 35, y: 75 }, { role: 'CB', x: 65, y: 75 }, { role: 'LB', x: 85, y: 70 },
    { role: 'CDM', x: 35, y: 58 }, { role: 'CDM', x: 65, y: 58 },
    { role: 'RM', x: 15, y: 40 }, { role: 'CAM', x: 50, y: 40 }, { role: 'LM', x: 85, y: 40 },
    { role: 'ST', x: 50, y: 15 },
  ],
};

const TacticalBoardPage = () => {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedFormation, setSelectedFormation] = useState<FormationType>(FormationType.F442);
  const [selectedTool, setSelectedTool] = useState<'select' | 'line' | 'arrow' | 'circle' | 'rectangle' | 'text'>('select');
  const [selectedColor, setSelectedColor] = useState('#3B82F6');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [boardName, setBoardName] = useState('新战术板');

  const { matches } = useAppSelector((state) => state.match);
  const currentMatch = matches.find((m) => m.id === matchId);

  useEffect(() => {
    dispatch(fetchMatches());
  }, [dispatch]);

  useEffect(() => {
    drawPitch();
  }, [selectedFormation, annotations, selectedPlayer]);

  const drawPitch = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;

    ctx.strokeRect(10, 10, width - 20, height - 20);

    ctx.beginPath();
    ctx.moveTo(width / 2, 10);
    ctx.lineTo(width / 2, height - 10);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 60, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeRect(width / 2 - 80, height - 10, 160, 80);
    ctx.strokeRect(width / 2 - 160, height - 10, 320, 160);
    ctx.strokeRect(width / 2 - 80, 10, 160, -80);
    ctx.strokeRect(width / 2 - 160, 10, 320, -160);

    ctx.beginPath();
    ctx.arc(width / 2, height - 10, 60, Math.PI * 0.75, Math.PI * 0.25, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width / 2, 10, 60, Math.PI * 1.25, Math.PI * 0.75, true);
    ctx.stroke();

    const currentFormation = formations[selectedFormation];
    currentFormation.forEach((player, index) => {
      const x = (player.x / 100) * width;
      const y = (player.y / 100) * height;

      ctx.beginPath();
      ctx.arc(x, y, selectedPlayer === index ? 22 : 20, 0, Math.PI * 2);
      ctx.fillStyle = selectedPlayer === index ? '#2563EB' : '#3B82F6';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), x, y);
    });

    annotations.forEach((ann) => {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 3;
      ctx.beginPath();

      if (ann.type === 'line' || ann.type === 'arrow') {
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        ctx.lineTo(ann.points[1].x, ann.points[1].y);
        ctx.stroke();

        if (ann.type === 'arrow') {
          const angle = Math.atan2(ann.points[1].y - ann.points[0].y, ann.points[1].x - ann.points[0].x);
          ctx.beginPath();
          ctx.moveTo(ann.points[1].x, ann.points[1].y);
          ctx.lineTo(
            ann.points[1].x - 15 * Math.cos(angle - Math.PI / 6),
            ann.points[1].y - 15 * Math.sin(angle - Math.PI / 6)
          );
          ctx.moveTo(ann.points[1].x, ann.points[1].y);
          ctx.lineTo(
            ann.points[1].x - 15 * Math.cos(angle + Math.PI / 6),
            ann.points[1].y - 15 * Math.sin(angle + Math.PI / 6)
          );
          ctx.stroke();
        }
      } else if (ann.type === 'circle') {
        const radius = Math.sqrt(
          Math.pow(ann.points[1].x - ann.points[0].x, 2) + Math.pow(ann.points[1].y - ann.points[0].y, 2)
        );
        ctx.arc(ann.points[0].x, ann.points[0].y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ann.type === 'rectangle') {
        const rectWidth = ann.points[1].x - ann.points[0].x;
        const rectHeight = ann.points[1].y - ann.points[0].y;
        ctx.strokeRect(ann.points[0].x, ann.points[0].y, rectWidth, rectHeight);
      }
    });
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);

    if (selectedTool === 'select') {
      const currentFormation = formations[selectedFormation];
      const canvas = canvasRef.current;
      if (canvas) {
        for (let i = 0; i < currentFormation.length; i++) {
          const player = currentFormation[i];
          const x = (player.x / 100) * canvas.width;
          const y = (player.y / 100) * canvas.height;
          const dist = Math.sqrt(Math.pow(coords.x - x, 2) + Math.pow(coords.y - y, 2));
          if (dist < 25) {
            setSelectedPlayer(i);
            return;
          }
        }
      }
      setSelectedPlayer(null);
    } else {
      setIsDrawing(true);
      setDrawStart(coords);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing && drawStart && selectedTool !== 'select' && selectedTool !== 'text') {
      const coords = getCanvasCoords(e);
      const newAnnotation = {
        id: Date.now().toString(),
        type: selectedTool,
        color: selectedColor,
        points: [drawStart, coords],
      };
      setAnnotations([...annotations, newAnnotation]);
    }
    setIsDrawing(false);
    setDrawStart(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing && drawStart) {
      drawPitch();
      const coords = getCanvasCoords(e);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();

      if (selectedTool === 'line' || selectedTool === 'arrow') {
        ctx.moveTo(drawStart.x, drawStart.y);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
      } else if (selectedTool === 'circle') {
        const radius = Math.sqrt(
          Math.pow(coords.x - drawStart.x, 2) + Math.pow(coords.y - drawStart.y, 2)
        );
        ctx.arc(drawStart.x, drawStart.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (selectedTool === 'rectangle') {
        const width = coords.x - drawStart.x;
        const height = coords.y - drawStart.y;
        ctx.strokeRect(drawStart.x, drawStart.y, width, height);
        ctx.stroke();
      }

      ctx.setLineDash([]);
    }
  };

  const clearAnnotations = () => {
    setAnnotations([]);
  };

  const undoAnnotation = () => {
    setAnnotations(annotations.slice(0, -1));
  };

  const saveBoard = () => {
    const boardData = {
      name: boardName,
      formation: selectedFormation,
      annotations,
      createdAt: new Date(),
    };
    localStorage.setItem(`tactical_board_${Date.now()}`, JSON.stringify(boardData));
    alert('战术板已保存！');
  };

  const colors = ['#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6', '#EC4899', '#FFFFFF'];

  const tools = [
    { id: 'select', icon: '✋', label: '选择' },
    { id: 'arrow', icon: '➡️', label: '箭头' },
    { id: 'line', icon: '📏', label: '直线' },
    { id: 'circle', icon: '⭕', label: '圆形' },
    { id: 'rectangle', icon: '⬜', label: '矩形' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate(matchId ? `/matches/${matchId}` : '/matches')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">战术板</h1>
            {currentMatch && (
              <p className="text-sm text-gray-500 mt-1">
                {currentMatch.homeTeam} vs {currentMatch.awayTeam}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="战术板名称"
          />
          <button
            onClick={saveBoard}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            <span>保存</span>
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-64 space-y-6 flex-shrink-0">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">阵型选择</h3>
            <div className="space-y-2">
              {Object.entries(formations).map(([key, _value]) => (
                <button
                  key={key}
                  onClick={() => setSelectedFormation(key as FormationType)}
                  className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedFormation === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {key as FormationType}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">绘图工具</h3>
            <div className="grid grid-cols-3 gap-2">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setSelectedTool(tool.id as typeof selectedTool)}
                  className={`p-3 rounded-lg text-center transition-colors ${
                    selectedTool === tool.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <div className="text-xl">{tool.icon}</div>
                  <div className="text-xs mt-1">{tool.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">颜色选择</h3>
            <div className="grid grid-cols-4 gap-2">
              {colors.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-10 h-10 rounded-lg border-2 transition-transform ${
                    selectedColor === color
                      ? 'border-gray-800 scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">操作</h3>
            <div className="space-y-2">
              <button
                onClick={undoAnnotation}
                disabled={annotations.length === 0}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                <span>撤销</span>
              </button>
              <button
                onClick={clearAnnotations}
                disabled={annotations.length === 0}
                className="w-full px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>清除全部</span>
              </button>
            </div>
          </div>

          {selectedPlayer !== null && (
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-800 mb-3">球员信息</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                    {selectedPlayer + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">
                      {formations[selectedFormation][selectedPlayer].role}
                    </p>
                    <p className="text-sm text-gray-500">球员 {selectedPlayer + 1}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <canvas
              ref={canvasRef}
              width={900}
              height={600}
              className="w-full rounded-lg cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => {
                setIsDrawing(false);
                setDrawStart(null);
                drawPitch();
              }}
            />
          </div>

          <div className="mt-4 bg-white rounded-xl shadow-sm p-4">
            <h3 className="font-semibold text-gray-800 mb-3">图例</h3>
            <div className="flex flex-wrap gap-4">
              {formations[selectedFormation].map((player, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <span className="text-sm text-gray-600">{player.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TacticalBoardPage;
