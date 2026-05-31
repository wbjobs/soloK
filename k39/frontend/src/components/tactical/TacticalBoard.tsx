import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { fabric } from 'fabric';
import type { FormationType, PlayerPosition, FrameData } from '../../types';
import { FormationType as FormationTypeEnum } from '../../types';

export interface TacticalBoardProps {
  width?: number;
  height?: number;
  formation?: FormationType;
  players?: PlayerPosition[];
  onPlayerMove?: (player: PlayerPosition) => void;
  onPlayerSelect?: (player: PlayerPosition | null) => void;
  onCanvasReady?: (canvas: fabric.Canvas) => void;
}

export interface TacticalBoardHandle {
  loadFormation: (type: FormationType) => void;
  loadFrameData: (frameData: FrameData) => void;
  exportAsImage: () => string;
  clearAnnotations: () => void;
  getPlayerPositions: () => PlayerPosition[];
  getCanvas: () => fabric.Canvas | null;
}

const FIELD_WIDTH = 105;
const FIELD_HEIGHT = 68;
const PLAYER_RADIUS = 16;
const BALL_RADIUS = 8;
const PADDING = 40;

const FORMATIONS: Record<FormationType, { role: string; x: number; y: number }[]> = {
  [FormationTypeEnum.F442]: [
    { role: 'GK', x: 10, y: 34 },
    { role: 'LB', x: 27, y: 6 }, { role: 'CB', x: 25, y: 22 }, { role: 'CB', x: 25, y: 46 }, { role: 'RB', x: 27, y: 62 },
    { role: 'LM', x: 50, y: 6 }, { role: 'CM', x: 48, y: 22 }, { role: 'CM', x: 48, y: 46 }, { role: 'RM', x: 50, y: 62 },
    { role: 'ST', x: 75, y: 24 }, { role: 'ST', x: 75, y: 44 },
  ],
  [FormationTypeEnum.F433]: [
    { role: 'GK', x: 10, y: 34 },
    { role: 'LB', x: 27, y: 6 }, { role: 'CB', x: 25, y: 22 }, { role: 'CB', x: 25, y: 46 }, { role: 'RB', x: 27, y: 62 },
    { role: 'CM', x: 45, y: 18 }, { role: 'CDM', x: 42, y: 34 }, { role: 'CM', x: 45, y: 50 },
    { role: 'LW', x: 72, y: 10 }, { role: 'ST', x: 75, y: 34 }, { role: 'RW', x: 72, y: 58 },
  ],
  [FormationTypeEnum.F352]: [
    { role: 'GK', x: 10, y: 34 },
    { role: 'CB', x: 23, y: 16 }, { role: 'CB', x: 22, y: 34 }, { role: 'CB', x: 23, y: 52 },
    { role: 'LWB', x: 40, y: 4 }, { role: 'CM', x: 42, y: 20 }, { role: 'CM', x: 40, y: 34 }, { role: 'CM', x: 42, y: 48 }, { role: 'RWB', x: 40, y: 64 },
    { role: 'ST', x: 72, y: 24 }, { role: 'ST', x: 72, y: 44 },
  ],
  [FormationTypeEnum.F532]: [
    { role: 'GK', x: 10, y: 34 },
    { role: 'LWB', x: 27, y: 4 }, { role: 'CB', x: 24, y: 18 }, { role: 'CB', x: 23, y: 34 }, { role: 'CB', x: 24, y: 50 }, { role: 'RWB', x: 27, y: 64 },
    { role: 'CM', x: 45, y: 18 }, { role: 'CM', x: 43, y: 34 }, { role: 'CM', x: 45, y: 50 },
    { role: 'ST', x: 72, y: 24 }, { role: 'ST', x: 72, y: 44 },
  ],
  [FormationTypeEnum.F4231]: [
    { role: 'GK', x: 10, y: 34 },
    { role: 'LB', x: 27, y: 6 }, { role: 'CB', x: 25, y: 22 }, { role: 'CB', x: 25, y: 46 }, { role: 'RB', x: 27, y: 62 },
    { role: 'CDM', x: 40, y: 26 }, { role: 'CDM', x: 40, y: 42 },
    { role: 'LAM', x: 58, y: 10 }, { role: 'CAM', x: 56, y: 34 }, { role: 'RAM', x: 58, y: 58 },
    { role: 'ST', x: 78, y: 34 },
  ],
};

function scaleX(fieldX: number, canvasWidth: number): number {
  return PADDING + (fieldX / FIELD_WIDTH) * (canvasWidth - PADDING * 2);
}

function scaleY(fieldY: number, canvasHeight: number): number {
  return PADDING + (fieldY / FIELD_HEIGHT) * (canvasHeight - PADDING * 2);
}

function unscaleX(canvasX: number, canvasWidth: number): number {
  return ((canvasX - PADDING) / (canvasWidth - PADDING * 2)) * FIELD_WIDTH;
}

function unscaleY(canvasY: number, canvasHeight: number): number {
  return ((canvasY - PADDING) / (canvasHeight - PADDING * 2)) * FIELD_HEIGHT;
}

function drawField(canvas: fabric.Canvas): void {
  const w = canvas.getWidth();
  const h = getHeight(w);
  canvas.setHeight(h);

  const left = PADDING;
  const top = PADDING;
  const fw = w - PADDING * 2;
  const fh = h - PADDING * 2;

  const fieldBg = new fabric.Rect({
    left, top, width: fw, height: fh,
    fill: '#2d8c4e',
    selectable: false, evented: false,
  });
  canvas.add(fieldBg);

  const stripeWidth = fw / 12;
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) continue;
    const stripe = new fabric.Rect({
      left: left + i * stripeWidth, top, width: stripeWidth, height: fh,
      fill: 'rgba(255,255,255,0.03)',
      selectable: false, evented: false,
    });
    canvas.add(stripe);
  }

  const lineProps: fabric.IRectOptions = {
    fill: 'transparent', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2,
    selectable: false, evented: false,
  };

  canvas.add(new fabric.Rect({ ...lineProps, left, top, width: fw, height: fh }));

  canvas.add(new fabric.Line([left + fw / 2, top, left + fw / 2, top + fh], {
    stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2, selectable: false, evented: false,
  }));

  canvas.add(new fabric.Circle({
    left: left + fw / 2 - 50, top: top + fh / 2 - 50, radius: 50,
    fill: 'transparent', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2,
    selectable: false, evented: false,
  }));

  canvas.add(new fabric.Circle({
    left: left + fw / 2 - 3, top: top + fh / 2 - 3, radius: 3,
    fill: 'rgba(255,255,255,0.8)', selectable: false, evented: false,
  }));

  const penW = fw * 0.16;
  const penH = fh * 0.44;
  const penTop = top + (fh - penH) / 2;
  canvas.add(new fabric.Rect({ ...lineProps, left, top: penTop, width: penW, height: penH }));

  const goalW = fw * 0.06;
  const goalH = fh * 0.22;
  const goalTop = top + (fh - goalH) / 2;
  canvas.add(new fabric.Rect({ ...lineProps, left, top: goalTop, width: goalW, height: goalH }));

  const penArcR = 50 * (fh / FIELD_HEIGHT);
  canvas.add(new fabric.Circle({
    left: left + penW - penArcR, top: top + fh / 2 - penArcR, radius: penArcR,
    fill: 'transparent', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2,
    selectable: false, evented: false,
    clipPath: new fabric.Rect({ left: 0, top: 0, width: penArcR, height: penArcR * 2 }),
  }));

  const rightPenLeft = left + fw - penW;
  canvas.add(new fabric.Rect({ ...lineProps, left: rightPenLeft, top: penTop, width: penW, height: penH }));

  const rightGoalLeft = left + fw - goalW;
  canvas.add(new fabric.Rect({ ...lineProps, left: rightGoalLeft, top: goalTop, width: goalW, height: goalH }));

  const rightPenArcR = 50 * (fh / FIELD_HEIGHT);
  canvas.add(new fabric.Circle({
    left: rightPenLeft - rightPenArcR, top: top + fh / 2 - rightPenArcR, radius: rightPenArcR,
    fill: 'transparent', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2,
    selectable: false, evented: false,
    clipPath: new fabric.Rect({ left: rightPenArcR, top: 0, width: rightPenArcR, height: rightPenArcR * 2 }),
  }));

  const cornerR = 10 * (fh / FIELD_HEIGHT);
  [
    { cx: left, cy: top, sa: 0, se: 90 },
    { cx: left + fw, cy: top, sa: 90, se: 180 },
    { cx: left + fw, cy: top + fh, sa: 180, se: 270 },
    { cx: left, cy: top + fh, sa: 270, se: 360 },
  ].forEach((c) => {
    const arc = new fabric.Circle({
      left: c.cx - cornerR, top: c.cy - cornerR, radius: cornerR,
      fill: 'transparent', stroke: 'rgba(255,255,255,0.8)', strokeWidth: 2,
      selectable: false, evented: false,
    });
    canvas.add(arc);
  });
}

function getHeight(width: number): number {
  return Math.round(width * (FIELD_HEIGHT / FIELD_WIDTH));
}

function createPlayerObject(
  player: PlayerPosition,
  canvasWidth: number,
  canvasHeight: number,
  onMove?: (p: PlayerPosition) => void,
  onSelect?: (p: PlayerPosition | null) => void,
): fabric.Group {
  const cx = scaleX(player.x, canvasWidth);
  const cy = scaleY(player.y, canvasHeight);
  const color = player.teamId === 'home' ? '#3B82F6' : '#EF4444';
  const strokeColor = player.isSelected ? '#FCD34D' : 'rgba(255,255,255,0.6)';
  const strokeWidth = player.isSelected ? 3 : 1;

  const circle = new fabric.Circle({
    radius: PLAYER_RADIUS,
    fill: color,
    stroke: strokeColor,
    strokeWidth,
    originX: 'center',
    originY: 'center',
  });

  const numberText = new fabric.Text(String(player.jerseyNumber), {
    fontSize: 14,
    fill: '#FFFFFF',
    fontFamily: 'Arial, sans-serif',
    fontWeight: 'bold',
    originX: 'center',
    originY: 'center',
  });

  const nameText = new fabric.Text(player.name, {
    fontSize: 10,
    fill: '#FFFFFF',
    fontFamily: 'Arial, sans-serif',
    originX: 'center',
    originY: 'center',
    top: PLAYER_RADIUS + 8,
  });

  const group = new fabric.Group([circle, numberText, nameText], {
    left: cx - PLAYER_RADIUS,
    top: cy - PLAYER_RADIUS,
    hasControls: false,
    hasBorders: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    borderColor: '#FCD34D',
  });

  (group as any)._playerId = player.id;
  (group as any)._teamId = player.teamId;

  if (onMove) {
    group.on('moved', () => {
      const newX = unscaleX(group.left! + PLAYER_RADIUS, canvasWidth);
      const newY = unscaleY(group.top! + PLAYER_RADIUS, canvasHeight);
      onMove({
        ...player,
        x: Math.max(0, Math.min(FIELD_WIDTH, newX)),
        y: Math.max(0, Math.min(FIELD_HEIGHT, newY)),
      });
    });
  }

  if (onSelect) {
    group.on('selected', () => {
      onSelect(player);
    });
    group.on('deselected', () => {
      onSelect(null);
    });
  }

  return group;
}

function createBallObject(x: number, y: number, canvasWidth: number, canvasHeight: number): fabric.Circle {
  const cx = scaleX(x, canvasWidth);
  const cy = scaleY(y, canvasHeight);

  return new fabric.Circle({
    left: cx - BALL_RADIUS,
    top: cy - BALL_RADIUS,
    radius: BALL_RADIUS,
    fill: '#FBBF24',
    stroke: '#FFFFFF',
    strokeWidth: 2,
    hasControls: false,
    hasBorders: false,
    selectable: true,
  });
}

const TacticalBoard = forwardRef<TacticalBoardHandle, TacticalBoardProps>(
  ({ width = 900, formation, players = [], onPlayerMove, onPlayerSelect, onCanvasReady }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const playerObjectsRef = useRef<fabric.Group[]>([]);
    const ballRef = useRef<fabric.Circle | null>(null);

    const canvasHeight = getHeight(width);

    const clearPlayers = useCallback(() => {
      playerObjectsRef.current.forEach((obj) => {
        fabricRef.current?.remove(obj);
      });
      playerObjectsRef.current = [];
      if (ballRef.current) {
        fabricRef.current?.remove(ballRef.current);
        ballRef.current = null;
      }
    }, []);

    const renderPlayers = useCallback(
      (playerList: PlayerPosition[]) => {
        if (!fabricRef.current) return;
        clearPlayers();
        const cw = fabricRef.current.getWidth();
        const ch = fabricRef.current.getHeight();

        playerList.forEach((player) => {
          const obj = createPlayerObject(player, cw, ch, onPlayerMove, onPlayerSelect);
          playerObjectsRef.current.push(obj);
          fabricRef.current!.add(obj);
        });

        fabricRef.current.renderAll();
      },
      [clearPlayers, onPlayerMove, onPlayerSelect],
    );

    const loadFormation = useCallback(
      (type: FormationType) => {
        if (!fabricRef.current) return;
        const positions = FORMATIONS[type];
        if (!positions) return;

        const homePlayers: PlayerPosition[] = positions.map((pos, i) => ({
          id: `home-${i}`,
          teamId: 'home',
          jerseyNumber: i + 1,
          name: pos.role,
          x: pos.x,
          y: pos.y,
        }));

        const awayPositions = FORMATIONS[type] || positions;
        const awayPlayers: PlayerPosition[] = awayPositions.map((pos, i) => ({
          id: `away-${i}`,
          teamId: 'away',
          jerseyNumber: i + 1,
          name: pos.role,
          x: FIELD_WIDTH - pos.x,
          y: FIELD_HEIGHT - pos.y,
        }));

        renderPlayers([...homePlayers, ...awayPlayers]);
      },
      [renderPlayers],
    );

    const loadFrameData = useCallback(
      (frameData: FrameData) => {
        if (!fabricRef.current) return;
        renderPlayers(frameData.trackingData.players);

        if (frameData.trackingData.ball) {
          if (ballRef.current) {
            fabricRef.current.remove(ballRef.current);
          }
          const ball = createBallObject(
            frameData.trackingData.ball.x,
            frameData.trackingData.ball.y,
            fabricRef.current.getWidth(),
            fabricRef.current.getHeight(),
          );
          (ball as any)._isBall = true;
          ballRef.current = ball;
          fabricRef.current.add(ball);
          fabricRef.current.renderAll();
        }
      },
      [renderPlayers],
    );

    const exportAsImage = useCallback((): string => {
      if (!fabricRef.current) return '';
      return fabricRef.current.toDataURL({ format: 'png', quality: 1 });
    }, []);

    const clearAnnotations = useCallback(() => {
      if (!fabricRef.current) return;
      const objects = fabricRef.current.getObjects();
      const toRemove = objects.filter((obj) => {
        const isFieldBg = obj instanceof fabric.Rect && (obj as any)._isField;
        const isFieldLine = obj instanceof fabric.Line;
        const isFieldCircle = obj instanceof fabric.Circle && !(obj as any)._isBall && !(obj as any)._playerId;
        const isFieldRect = obj instanceof fabric.Rect && (obj.fill === 'transparent' || obj.fill === 'rgba(255,255,255,0.03)');
        const isPlayerGroup = obj instanceof fabric.Group && (obj as any)._playerId;
        const isBall = (obj as any)._isBall;
        const isStripe = obj instanceof fabric.Rect && obj.fill === 'rgba(255,255,255,0.03)';

        return !(isFieldBg || isFieldLine || isFieldCircle || isFieldRect || isPlayerGroup || isBall || isStripe);
      });
      toRemove.forEach((obj) => fabricRef.current!.remove(obj));
      fabricRef.current.renderAll();
    }, []);

    const getPlayerPositions = useCallback((): PlayerPosition[] => {
      if (!fabricRef.current) return [];
      const cw = fabricRef.current.getWidth();
      const ch = fabricRef.current.getHeight();

      return playerObjectsRef.current.map((group) => {
        const playerId = (group as any)._playerId as string;
        const teamId = (group as any)._teamId as 'home' | 'away';
        const existing = players.find((p) => p.id === playerId);
        return {
          id: playerId,
          playerId: existing?.playerId,
          teamId,
          jerseyNumber: existing?.jerseyNumber ?? 0,
          name: existing?.name ?? '',
          x: unscaleX(group.left! + PLAYER_RADIUS, cw),
          y: unscaleY(group.top! + PLAYER_RADIUS, ch),
        };
      });
    }, [players]);

    const getCanvas = useCallback(() => fabricRef.current, []);

    useImperativeHandle(ref, () => ({
      loadFormation,
      loadFrameData,
      exportAsImage,
      clearAnnotations,
      getPlayerPositions,
      getCanvas,
    }), [loadFormation, loadFrameData, exportAsImage, clearAnnotations, getPlayerPositions, getCanvas]);

    useEffect(() => {
      if (!canvasRef.current) return;

      const canvas = new fabric.Canvas(canvasRef.current, {
        width,
        height: canvasHeight,
        backgroundColor: '#1a5c2e',
        selection: false,
      });

      fabricRef.current = canvas;

      drawField(canvas);
      canvas.renderAll();

      canvas.on('mouse:wheel', (opt) => {
        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        zoom = Math.max(0.5, Math.min(3, zoom));
        canvas.zoomToPoint(new fabric.Point(opt.e.offsetX, opt.e.offsetY), zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
      });

      let isPanning = false;
      let lastPosX = 0;
      let lastPosY = 0;

      canvas.on('mouse:down', (opt) => {
        if (opt.e.altKey || (opt.e.button === 1)) {
          isPanning = true;
          lastPosX = opt.e.clientX;
          lastPosY = opt.e.clientY;
          canvas.selection = false;
        }
      });

      canvas.on('mouse:move', (opt) => {
        if (isPanning) {
          const vpt = canvas.viewportTransform!;
          vpt[4] += opt.e.clientX - lastPosX;
          vpt[5] += opt.e.clientY - lastPosY;
          lastPosX = opt.e.clientX;
          lastPosY = opt.e.clientY;
          canvas.requestRenderAll();
        }
      });

      canvas.on('mouse:up', () => {
        isPanning = false;
        canvas.selection = false;
      });

      onCanvasReady?.(canvas);

      return () => {
        canvas.dispose();
        fabricRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (formation && fabricRef.current) {
        loadFormation(formation);
      }
    }, [formation, loadFormation]);

    useEffect(() => {
      if (players.length > 0 && fabricRef.current) {
        renderPlayers(players);
      }
    }, [players, renderPlayers]);

    return (
      <div className="relative inline-block bg-gray-900 rounded-xl overflow-hidden shadow-lg">
        <canvas ref={canvasRef} />
        <div className="absolute bottom-2 right-2 text-xs text-white/40 select-none">
          Alt+拖拽平移 · 滚轮缩放
        </div>
      </div>
    );
  }
);

TacticalBoard.displayName = 'TacticalBoard';

export default TacticalBoard;
