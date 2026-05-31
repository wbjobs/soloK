import { useRef, useEffect, useState, useCallback } from 'react';
import type { PassNetwork } from '../../types';

interface PassNetworkChartProps {
  data: PassNetwork;
  width?: number;
  height?: number;
}

interface HoveredNode {
  playerId: string;
  playerName: string;
  jerseyNumber: number;
  passesMade: number;
  passesReceived: number;
  x: number;
  y: number;
}

interface HoveredEdge {
  from: string;
  to: string;
  count: number;
  successRate: number;
}

const HOME_COLOR = '#3B82F6';
const AWAY_COLOR = '#EF4444';
const NODE_RADIUS = 18;
const EDGE_ARROW_SIZE = 8;

const PassNetworkChart = ({ data, width = 700, height = 500 }: PassNetworkChartProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<HoveredNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdge | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const pitchPadding = 40;

  const getNodeColor = useCallback(
    (nodeId: string) => {
      const node = data.nodes.find((n) => n.playerId === nodeId);
      if (!node) return HOME_COLOR;
      const homeNodes = data.nodes.slice(0, Math.ceil(data.nodes.length / 2));
      return homeNodes.some((n) => n.playerId === nodeId) ? HOME_COLOR : AWAY_COLOR;
    },
    [data.nodes]
  );

  const drawPitch = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = '#1a7a3a';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.5;

      const p = pitchPadding;
      const pw = width - p * 2;
      const ph = height - p * 2;

      ctx.strokeRect(p, p, pw, ph);
      ctx.beginPath();
      ctx.moveTo(width / 2, p);
      ctx.lineTo(width / 2, p + ph);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(pw, ph) * 0.12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fill();

      const penW = pw * 0.17;
      const penH = ph * 0.35;
      ctx.strokeRect(p, height / 2 - penH / 2, penW, penH);
      ctx.strokeRect(p + pw - penW, height / 2 - penH / 2, penW, penH);

      const goalW = pw * 0.06;
      const goalH = ph * 0.18;
      ctx.strokeRect(p, height / 2 - goalH / 2, goalW, goalH);
      ctx.strokeRect(p + pw - goalW, height / 2 - goalH / 2, goalW, goalH);
    },
    [width, height]
  );

  const mapPosition = useCallback(
    (x: number, y: number) => ({
      px: pitchPadding + x * (width - pitchPadding * 2),
      py: pitchPadding + y * (height - pitchPadding * 2),
    }),
    [width, height]
  );

  const drawArrow = useCallback(
    (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, thickness: number, color: string) => {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) return;

      const nx = dx / dist;
      const ny = dy / dist;

      const endX = toX - nx * (NODE_RADIUS + 4);
      const endY = toY - ny * (NODE_RADIUS + 4);
      const startX = fromX + nx * (NODE_RADIUS + 4);
      const startY = fromY + ny * (NODE_RADIUS + 4);

      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const arrowX = endX + nx * 2;
      const arrowY = endY + ny * 2;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - nx * EDGE_ARROW_SIZE - ny * EDGE_ARROW_SIZE * 0.5, arrowY - ny * EDGE_ARROW_SIZE + nx * EDGE_ARROW_SIZE * 0.5);
      ctx.lineTo(arrowX - nx * EDGE_ARROW_SIZE + ny * EDGE_ARROW_SIZE * 0.5, arrowY - ny * EDGE_ARROW_SIZE - nx * EDGE_ARROW_SIZE * 0.5);
      ctx.closePath();
      ctx.fill();
    },
    []
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    drawPitch(ctx);

    const maxCount = Math.max(...data.edges.map((e) => e.count), 1);
    const nodePositions = new Map<string, { px: number; py: number }>();
    data.nodes.forEach((node) => {
      const pos = mapPosition(node.x, node.y);
      nodePositions.set(node.playerId, pos);
    });

    data.edges.forEach((edge) => {
      const from = nodePositions.get(edge.fromPlayerId);
      const to = nodePositions.get(edge.toPlayerId);
      if (!from || !to) return;

      const thickness = 1 + (edge.count / maxCount) * 5;
      const baseColor = getNodeColor(edge.fromPlayerId);
      const alpha = 0.3 + (edge.count / maxCount) * 0.5;

      const r = parseInt(baseColor.slice(1, 3), 16);
      const g = parseInt(baseColor.slice(3, 5), 16);
      const b = parseInt(baseColor.slice(5, 7), 16);

      const isHoveredEdge =
        hoveredEdge &&
        hoveredEdge.from === edge.fromPlayerId &&
        hoveredEdge.to === edge.toPlayerId;
      const isRelatedToHoveredNode =
        hoveredNode &&
        (edge.fromPlayerId === hoveredNode.playerId || edge.toPlayerId === hoveredNode.playerId);

      if (isHoveredEdge || isRelatedToHoveredNode) {
        drawArrow(ctx, from.px, from.py, to.px, to.py, thickness + 1, `rgba(${r},${g},${b},${Math.min(alpha + 0.3, 1)})`);
      } else if (!hoveredNode && !hoveredEdge) {
        drawArrow(ctx, from.px, from.py, to.px, to.py, thickness, `rgba(${r},${g},${b},${alpha})`);
      } else {
        drawArrow(ctx, from.px, from.py, to.px, to.py, thickness * 0.5, `rgba(${r},${g},${b},${alpha * 0.3})`);
      }
    });

    data.nodes.forEach((node) => {
      const pos = nodePositions.get(node.playerId);
      if (!pos) return;

      const color = getNodeColor(node.playerId);
      const isHovered = hoveredNode && hoveredNode.playerId === node.playerId;
      const radius = isHovered ? NODE_RADIUS + 4 : NODE_RADIUS;

      ctx.beginPath();
      ctx.arc(pos.px, pos.py, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.fillStyle = '#fff';
      ctx.font = `bold ${isHovered ? 12 : 11}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${node.jerseyNumber}`, pos.px, pos.py);

      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(node.playerName, pos.px, pos.py + radius + 12);
    });
  }, [data, width, height, hoveredNode, hoveredEdge, drawPitch, mapPosition, getNodeColor, drawArrow]);

  useEffect(() => {
    draw();
  }, [draw]);

  const findNodeAtPosition = useCallback(
    (mx: number, my: number) => {
      for (const node of data.nodes) {
        const pos = mapPosition(node.x, node.y);
        const dist = Math.sqrt((mx - pos.px) ** 2 + (my - pos.py) ** 2);
        if (dist <= NODE_RADIUS + 4) {
          return {
            playerId: node.playerId,
            playerName: node.playerName,
            jerseyNumber: node.jerseyNumber,
            passesMade: node.passesMade,
            passesReceived: node.passesReceived,
            x: node.x,
            y: node.y,
          };
        }
      }
      return null;
    },
    [data.nodes, mapPosition]
  );

  const findEdgeAtPosition = useCallback(
    (mx: number, my: number) => {
      let closest: HoveredEdge | null = null;
      let closestDist = 8;

      const nodePositions = new Map<string, { px: number; py: number }>();
      data.nodes.forEach((node) => {
        const pos = mapPosition(node.x, node.y);
        nodePositions.set(node.playerId, pos);
      });

      for (const edge of data.edges) {
        const from = nodePositions.get(edge.fromPlayerId);
        const to = nodePositions.get(edge.toPlayerId);
        if (!from || !to) continue;

        const dx = to.px - from.px;
        const dy = to.py - from.py;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) continue;

        const t = Math.max(0, Math.min(1, ((mx - from.px) * dx + (my - from.py) * dy) / (len * len)));
        const projX = from.px + t * dx;
        const projY = from.py + t * dy;
        const dist = Math.sqrt((mx - projX) ** 2 + (my - projY) ** 2);

        if (dist < closestDist) {
          closestDist = dist;
          closest = { from: edge.fromPlayerId, to: edge.toPlayerId, count: edge.count, successRate: edge.successRate };
        }
      }
      return closest;
    },
    [data, mapPosition]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const node = findNodeAtPosition(mx, my);
      if (node) {
        setHoveredNode(node);
        setHoveredEdge(null);
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        canvas.style.cursor = 'pointer';
        return;
      }

      const edge = findEdgeAtPosition(mx, my);
      if (edge) {
        setHoveredNode(null);
        setHoveredEdge(edge);
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        canvas.style.cursor = 'pointer';
        return;
      }

      setHoveredNode(null);
      setHoveredEdge(null);
      setTooltipPos(null);
      canvas.style.cursor = 'default';
    },
    [findNodeAtPosition, findEdgeAtPosition]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredNode(null);
    setHoveredEdge(null);
    setTooltipPos(null);
  }, []);

  const getPlayerName = useCallback(
    (playerId: string) => {
      return data.nodes.find((n) => n.playerId === playerId)?.playerName || playerId;
    },
    [data.nodes]
  );

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">传球网络</h3>
      <div className="relative inline-block">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />

        {hoveredNode && tooltipPos && (
          <div
            className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10"
            style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 12 }}
          >
            <p className="font-semibold">{hoveredNode.playerName} (#{hoveredNode.jerseyNumber})</p>
            <p>传出: {hoveredNode.passesMade} 次</p>
            <p>接收: {hoveredNode.passesReceived} 次</p>
          </div>
        )}

        {hoveredEdge && tooltipPos && (
          <div
            className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10"
            style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 12 }}
          >
            <p className="font-semibold">
              {getPlayerName(hoveredEdge.from)} → {getPlayerName(hoveredEdge.to)}
            </p>
            <p>传球: {hoveredEdge.count} 次</p>
            <p>成功率: {(hoveredEdge.successRate * 100).toFixed(1)}%</p>
          </div>
        )}
      </div>

      <div className="flex justify-center space-x-6 mt-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-sm text-gray-600">主队</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm text-gray-600">客队</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-0.5 bg-gray-500" />
          <span className="text-sm text-gray-600">传球方向</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-1 h-1 rounded-full bg-gray-500" />
          <span className="text-sm text-gray-600">—</span>
          <div className="w-3 h-0.5 bg-gray-500" />
          <span className="text-sm text-gray-600">线条粗细=传球数</span>
        </div>
      </div>
    </div>
  );
};

export default PassNetworkChart;
