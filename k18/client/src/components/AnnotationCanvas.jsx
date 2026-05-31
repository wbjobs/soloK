import React, { useRef, useEffect, useState } from 'react';
import { TOOL_TYPES } from '../config';
import useRoomStore from '../store/roomStore';
import socketService from '../services/socket';
import { v4 as uuidv4 } from 'uuid';

export default function AnnotationCanvas({
  videoElement,
  canvasWidth,
  canvasHeight,
  isFrozen,
  onDeleteAnnotation,
}) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [tempShape, setTempShape] = useState(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);

  const selectedTool = useRoomStore((s) => s.selectedTool);
  const selectedColor = useRoomStore((s) => s.selectedColor);
  const selectedAnnotation = useRoomStore((s) => s.selectedAnnotation);
  const setSelectedAnnotation = useRoomStore((s) => s.setSelectedAnnotation);
  const annotations = useRoomStore((s) => s.annotations);
  const myAnnotations = useRoomStore((s) => s.myAnnotations);
  const addAnnotation = useRoomStore((s) => s.addAnnotation);
  const measurements = useRoomStore((s) => s.measurements);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvasWidth,
      y: ((e.clientY - rect.top) / rect.height) * canvasHeight,
    };
  };

  const createAnnotation = (type, points, extra = {}) => ({
    id: uuidv4(),
    type,
    points,
    color: selectedColor,
    ...extra,
  });

  const isPointInArrow = (point, start, end, threshold = 8) => {
    const dist = pointToLineDistance(point, start, end);
    return dist <= threshold;
  };

  const pointToLineDistance = (point, lineStart, lineEnd) => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const isPointInRectangle = (point, start, end, threshold = 5) => {
    const minX = Math.min(start.x, end.x) - threshold;
    const maxX = Math.max(start.x, end.x) + threshold;
    const minY = Math.min(start.y, end.y) - threshold;
    const maxY = Math.max(start.y, end.y) + threshold;

    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  };

  const isPointInEllipse = (point, start, end, threshold = 5) => {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2 + threshold;
    const ry = Math.abs(end.y - start.y) / 2 + threshold;

    if (rx === 0 || ry === 0) return false;

    const normalized = ((point.x - cx) ** 2) / (rx ** 2) + ((point.y - cy) ** 2) / (ry ** 2);
    return normalized <= 1;
  };

  const isPointInFreehand = (point, points, threshold = 8) => {
    for (let i = 0; i < points.length - 1; i++) {
      const dist = pointToLineDistance(point, points[i], points[i + 1]);
      if (dist <= threshold) return true;
    }
    return false;
  };

  const isPointInPolygon = (point, points, threshold = 8) => {
    for (let i = 0; i < points.length - 1; i++) {
      const dist = pointToLineDistance(point, points[i], points[i + 1]);
      if (dist <= threshold) return true;
    }
    const dist = pointToLineDistance(point, points[points.length - 1], points[0]);
    return dist <= threshold;
  };

  const hitTestAnnotation = (annotation, point) => {
    if (!annotation.points || annotation.points.length === 0) return false;

    switch (annotation.type) {
      case 'arrow':
      case 'distance':
        if (annotation.points.length >= 2) {
          return isPointInArrow(point, annotation.points[0], annotation.points[annotation.points.length - 1]);
        }
        return false;
      case 'rectangle':
        if (annotation.points.length >= 2) {
          return isPointInRectangle(point, annotation.points[0], annotation.points[1]);
        }
        return false;
      case 'ellipse':
        if (annotation.points.length >= 2) {
          return isPointInEllipse(point, annotation.points[0], annotation.points[1]);
        }
        return false;
      case 'freehand':
        return isPointInFreehand(point, annotation.points);
      case 'area':
      case 'angle':
        return isPointInPolygon(point, annotation.points);
      default:
        return false;
    }
  };

  const findAnnotationAtPoint = (point) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const ann = annotations[i];
      const isMine = ann.expertId === socketService.id || myAnnotations.has(ann.id);
      if (isMine && hitTestAnnotation(ann, point)) {
        return ann;
      }
    }
    return null;
  };

  const handleMouseDown = (e) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (selectedTool === TOOL_TYPES.SELECT) {
      const hitAnnotation = findAnnotationAtPoint(coords);
      if (hitAnnotation) {
        setSelectedAnnotation(hitAnnotation);
      } else {
        setSelectedAnnotation(null);
      }
      return;
    }

    if (selectedTool === 'eraser') {
      const hitAnnotation = findAnnotationAtPoint(coords);
      if (hitAnnotation) {
        onDeleteAnnotation?.(hitAnnotation.id);
      }
      return;
    }

    if (!selectedTool) return;

    setDrawing(true);
    setCurrentPoints([coords]);

    if (selectedTool === TOOL_TYPES.FREEHAND) {
      setTempShape({
        type: 'freehand',
        points: [coords],
        color: selectedColor,
      });
    } else if ([TOOL_TYPES.ARROW, TOOL_TYPES.RECTANGLE, TOOL_TYPES.ELLIPSE].includes(selectedTool)) {
      setTempShape({
        type: selectedTool,
        startPoint: coords,
        endPoint: coords,
        color: selectedColor,
      });
    } else if ([TOOL_TYPES.DISTANCE, TOOL_TYPES.AREA, TOOL_TYPES.ANGLE].includes(selectedTool)) {
      setTempShape({
        type: selectedTool,
        points: [coords],
        color: selectedColor,
      });
    }
  };

  const handleMouseMove = (e) => {
    const coords = getCanvasCoords(e);
    if (!coords) return;

    if (!drawing) {
      const hitAnnotation = findAnnotationAtPoint(coords);
      setHoveredAnnotation(hitAnnotation?.id || null);
      return;
    }

    if (!tempShape) return;

    if (tempShape.type === TOOL_TYPES.FREEHAND) {
      setTempShape({
        ...tempShape,
        points: [...tempShape.points, coords],
      });
    } else if ([TOOL_TYPES.ARROW, TOOL_TYPES.RECTANGLE, TOOL_TYPES.ELLIPSE].includes(tempShape.type)) {
      setTempShape({
        ...tempShape,
        endPoint: coords,
      });
    } else if ([TOOL_TYPES.DISTANCE, TOOL_TYPES.AREA, TOOL_TYPES.ANGLE].includes(tempShape.type)) {
      setTempShape({
        ...tempShape,
        points: tempShape.points.length < 3 ? [...tempShape.points, coords] : [...tempShape.points.slice(0, -1), coords],
      });
    }
  };

  const handleDoubleClick = (e) => {
    if (selectedTool === TOOL_TYPES.SELECT) {
      const coords = getCanvasCoords(e);
      if (!coords) return;

      const hitAnnotation = findAnnotationAtPoint(coords);
      if (hitAnnotation && onDeleteAnnotation) {
        onDeleteAnnotation(hitAnnotation.id);
      }
    }
  };

  const handleMouseUp = () => {
    if (!drawing || !tempShape) {
      setDrawing(false);
      return;
    }

    if (tempShape.type === TOOL_TYPES.FREEHAND && tempShape.points.length > 2) {
      addAnnotation(createAnnotation('freehand', tempShape.points));
    } else if ([TOOL_TYPES.ARROW, TOOL_TYPES.RECTANGLE, TOOL_TYPES.ELLIPSE].includes(tempShape.type)) {
      const dist = Math.hypot(
        tempShape.endPoint.x - tempShape.startPoint.x,
        tempShape.endPoint.y - tempShape.endPoint.y
      );
      if (dist > 10) {
        addAnnotation(createAnnotation(tempShape.type, [tempShape.startPoint, tempShape.endPoint]));
      }
    } else if ([TOOL_TYPES.DISTANCE, TOOL_TYPES.AREA, TOOL_TYPES.ANGLE].includes(tempShape.type)) {
      addAnnotation(createAnnotation(tempShape.type, tempShape.points));
    }

    setDrawing(false);
    setTempShape(null);
    setCurrentPoints([]);
  };

  const drawArrow = (ctx, start, end, color) => {
    const headLen = 15;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle - Math.PI / 6),
      end.y - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLen * Math.cos(angle + Math.PI / 6),
      end.y - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  };

  const drawRectangle = (ctx, start, end, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
  };

  const drawEllipse = (ctx, start, end, color) => {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  };

  const drawFreehand = (ctx, points, color) => {
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  };

  const drawDistance = (ctx, points, color) => {
    if (points.length < 2) return;
    const start = points[0];
    const end = points[points.length - 1];
    const dist = Math.hypot(end.x - start.x, end.y - start.y);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.fillStyle = color;
    ctx.font = '14px Arial';
    ctx.fillText(`${dist.toFixed(1)}px`, midX, midY - 10);
  };

  const drawArea = (ctx, points, color) => {
    if (points.length < 3) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;

    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    ctx.fillStyle = color;
    ctx.font = '14px Arial';
    ctx.fillText(`${area.toFixed(1)}px²`, cx, cy);
  };

  const drawAngle = (ctx, points, color) => {
    if (points.length < 3) return;
    const [p1, p2, p3] = points;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();

    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    const angle = Math.acos(Math.min(1, Math.max(-1, dot / (mag1 * mag2))));
    const angleDeg = (angle * 180) / Math.PI;

    ctx.fillStyle = color;
    ctx.font = '14px Arial';
    ctx.fillText(`${angleDeg.toFixed(1)}°`, p2.x + 15, p2.y);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    annotations.forEach((ann) => {
      const isSelected = selectedAnnotation?.id === ann.id;
      const isHovered = hoveredAnnotation === ann.id;
      const color = ann.color || '#FF6B6B';

      ctx.save();
      if (isSelected) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 3;
      } else if (isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.lineWidth = 2.5;
      }

      if (ann.type === 'arrow' && ann.points?.length >= 2) {
        drawArrow(ctx, ann.points[0], ann.points[1], color);
      } else if (ann.type === 'rectangle' && ann.points?.length >= 2) {
        drawRectangle(ctx, ann.points[0], ann.points[1], color);
      } else if (ann.type === 'ellipse' && ann.points?.length >= 2) {
        drawEllipse(ctx, ann.points[0], ann.points[1], color);
      } else if (ann.type === 'freehand' && ann.points?.length > 2) {
        drawFreehand(ctx, ann.points, color);
      } else if (ann.type === 'distance' && ann.points?.length >= 2) {
        drawDistance(ctx, ann.points, color);
      } else if (ann.type === 'area' && ann.points?.length >= 3) {
        drawArea(ctx, ann.points, color);
      } else if (ann.type === 'angle' && ann.points?.length >= 3) {
        drawAngle(ctx, ann.points, color);
      }

      ctx.restore();

      if (ann.expertName) {
        ctx.fillStyle = color;
        ctx.font = 'bold 12px Arial';
        const labelX = ann.points?.[0]?.x || 10;
        const labelY = (ann.points?.[0]?.y || 20) - 18;
        ctx.fillText(ann.expertName, labelX, labelY);
      }
    });

    if (tempShape) {
      if (tempShape.type === TOOL_TYPES.FREEHAND) {
        drawFreehand(ctx, tempShape.points, tempShape.color);
      } else if ([TOOL_TYPES.ARROW, TOOL_TYPES.RECTANGLE, TOOL_TYPES.ELLIPSE].includes(tempShape.type)) {
        if (tempShape.type === TOOL_TYPES.ARROW) {
          drawArrow(ctx, tempShape.startPoint, tempShape.endPoint, tempShape.color);
        } else if (tempShape.type === TOOL_TYPES.RECTANGLE) {
          drawRectangle(ctx, tempShape.startPoint, tempShape.endPoint, tempShape.color);
        } else if (tempShape.type === TOOL_TYPES.ELLIPSE) {
          drawEllipse(ctx, tempShape.startPoint, tempShape.endPoint, tempShape.color);
        }
      } else if (tempShape.type === TOOL_TYPES.DISTANCE) {
        drawDistance(ctx, tempShape.points, tempShape.color);
      } else if (tempShape.type === TOOL_TYPES.AREA) {
        drawArea(ctx, tempShape.points, tempShape.color);
      } else if (tempShape.type === TOOL_TYPES.ANGLE) {
        drawAngle(ctx, tempShape.points, tempShape.color);
      }
    }
  }, [annotations, tempShape, canvasWidth, canvasHeight, myAnnotations, selectedAnnotation, hoveredAnnotation]);

  const getCursorStyle = () => {
    if (selectedTool === 'eraser') return 'pointer';
    if (selectedTool === TOOL_TYPES.SELECT) return hoveredAnnotation ? 'pointer' : 'default';
    return 'crosshair';
  };

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 10, cursor: getCursorStyle() }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
  );
}
