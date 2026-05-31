import { get, post, put, del } from './api';
import type { Event, EventType } from '../types';

export interface AddEventRequest {
  matchId: string;
  type: EventType;
  timestamp: number;
  half: 1 | 2;
  minute: number;
  second: number;
  teamId: 'home' | 'away';
  playerId?: string;
  playerName?: string;
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  outcome: 'success' | 'failed';
  notes?: string;
}

export const eventApi = {
  getEvents: (
    matchId: string,
    eventType?: EventType,
    teamId?: 'home' | 'away'
  ): Promise<Event[]> => {
    const params: Record<string, any> = {};
    if (eventType) {
      params.type = eventType;
    }
    if (teamId) {
      params.teamId = teamId;
    }
    return get(`/matches/${matchId}/events`, { params });
  },

  addEvent: (eventData: AddEventRequest): Promise<Event> => {
    return post(`/matches/${eventData.matchId}/events`, eventData);
  },

  updateEvent: (eventId: string, eventData: Partial<AddEventRequest>): Promise<Event> => {
    return put(`/events/${eventId}`, eventData);
  },

  deleteEvent: (eventId: string): Promise<void> => {
    return del(`/events/${eventId}`);
  },
};

export default eventApi;
