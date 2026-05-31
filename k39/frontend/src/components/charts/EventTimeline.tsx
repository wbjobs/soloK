import { useState, useMemo, useCallback } from 'react';
import type { Event, EventType } from '../../types';

interface EventTimelineProps {
  events: Event[];
  duration: number;
  onEventClick?: (event: Event) => void;
}

const EVENT_ICONS: Record<EventType, string> = {
  goal: '⚽',
  shot: '🎯',
  pass: '📊',
  tackle: '🛡️',
  offside: '🚩',
  foul: '⚠️',
};

const EVENT_LABELS: Record<EventType, string> = {
  goal: '进球',
  shot: '射门',
  pass: '传球',
  tackle: '抢断',
  offside: '越位',
  foul: '犯规',
};

const EVENT_BG: Record<EventType, string> = {
  goal: 'bg-yellow-100 border-yellow-400',
  shot: 'bg-orange-100 border-orange-400',
  pass: 'bg-blue-100 border-blue-400',
  tackle: 'bg-green-100 border-green-400',
  offside: 'bg-purple-100 border-purple-400',
  foul: 'bg-red-100 border-red-400',
};

const TEAM_COLORS = {
  home: { line: 'bg-blue-500', dot: 'bg-blue-600', marker: 'border-blue-600' },
  away: { line: 'bg-red-500', dot: 'bg-red-600', marker: 'border-red-600' },
};

const EventTimeline = ({ events, duration, onEventClick }: EventTimelineProps) => {
  const [hoveredEvent, setHoveredEvent] = useState<Event | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const homeEvents = useMemo(
    () => events.filter((e) => e.teamId === 'home').sort((a, b) => a.timestamp - b.timestamp),
    [events]
  );

  const awayEvents = useMemo(
    () => events.filter((e) => e.teamId === 'away').sort((a, b) => a.timestamp - b.timestamp),
    [events]
  );

  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    const step = duration <= 90 ? 15 : 30;
    for (let t = 0; t <= duration; t += step) {
      markers.push(t);
    }
    return markers;
  }, [duration]);

  const getPositionPercent = useCallback(
    (timestamp: number) => {
      return Math.min((timestamp / (duration * 60)) * 100, 100);
    },
    [duration]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent, event: Event) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: -10 });
      setHoveredEvent(event);
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredEvent(null);
    setTooltipPos(null);
  }, []);

  const renderEventMarker = useCallback(
    (event: Event) => {
      const left = getPositionPercent(event.timestamp);
      const icon = EVENT_ICONS[event.type] || '📌';
      const bgClass = EVENT_BG[event.type] || 'bg-gray-100 border-gray-400';

      return (
        <div
          key={event.id}
          className="absolute flex flex-col items-center cursor-pointer group"
          style={{ left: `${left}%`, transform: 'translateX(-50%)', top: 0 }}
          onMouseMove={(e) => handleMouseMove(e, event)}
          onMouseLeave={handleMouseLeave}
          onClick={() => onEventClick?.(event)}
        >
          <div className={`px-1.5 py-0.5 rounded text-xs border ${bgClass} whitespace-nowrap shadow-sm transition-transform group-hover:scale-110`}>
            <span>{icon}</span>
            <span className="ml-0.5">{event.minute}'</span>
          </div>
          <div className={`w-0.5 h-2 ${event.teamId === 'home' ? 'bg-blue-400' : 'bg-red-400'}`} />
        </div>
      );
    },
    [getPositionPercent, handleMouseMove, handleMouseLeave, onEventClick]
  );

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-6">事件时间线</h3>

      <div className="relative">
        <div className="flex items-center space-x-4 mb-3">
          <div className="w-12 text-right">
            <span className="text-xs font-medium text-blue-600">主队</span>
          </div>
          <div className="flex-1 relative h-16">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-blue-200" />
            {homeEvents.map(renderEventMarker)}
          </div>
        </div>

        <div className="flex items-center space-x-4 mb-3">
          <div className="w-12 text-right">
            <span className="text-xs font-medium text-red-600">客队</span>
          </div>
          <div className="flex-1 relative h-16">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-200" />
            {awayEvents.map(renderEventMarker)}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="w-12" />
          <div className="flex-1 relative h-6">
            <div className="absolute top-0 left-0 right-0 h-px bg-gray-300" />
            {timeMarkers.map((t) => (
              <div
                key={t}
                className="absolute flex flex-col items-center"
                style={{ left: `${(t / duration) * 100}%`, transform: 'translateX(-50%)' }}
              >
                <div className="w-px h-3 bg-gray-400" />
                <span className="text-xs text-gray-500 mt-0.5">{t}'</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hoveredEvent && tooltipPos && (
        <div
          className="absolute z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex items-center space-x-2 mb-1">
            <span>{EVENT_ICONS[hoveredEvent.type]}</span>
            <span className="font-semibold">{EVENT_LABELS[hoveredEvent.type]}</span>
            <span className="text-gray-400">{hoveredEvent.minute}'{hoveredEvent.second}"</span>
          </div>
          {hoveredEvent.playerName && (
            <p className="text-gray-300">{hoveredEvent.playerName}</p>
          )}
          <p className="text-gray-400">
            {hoveredEvent.teamId === 'home' ? '主队' : '客队'} · {hoveredEvent.outcome === 'success' ? '成功' : '失败'}
          </p>
          {hoveredEvent.notes && (
            <p className="text-gray-400 mt-1">{hoveredEvent.notes}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3 mt-6">
        {(Object.keys(EVENT_LABELS) as EventType[]).map((type) => (
          <div key={type} className="flex items-center space-x-1.5">
            <span className="text-sm">{EVENT_ICONS[type]}</span>
            <span className="text-xs text-gray-600">{EVENT_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventTimeline;
