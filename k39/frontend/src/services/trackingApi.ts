import { get } from './api';
import type { TrackingData, FrameData, PlayerStats } from '../types';

export const trackingApi = {
  getTrackingData: (matchId: string): Promise<TrackingData[]> => {
    return get(`/matches/${matchId}/tracking`);
  },

  getFrameData: (
    matchId: string,
    frameNumber: number,
    cameraType?: 'main' | 'goal_left' | 'goal_right'
  ): Promise<FrameData> => {
    const params: Record<string, any> = { frameNumber };
    if (cameraType) {
      params.camera = cameraType;
    }
    return get(`/matches/${matchId}/tracking/frame`, { params });
  },

  getPlayerStats: (matchId: string, playerId?: string): Promise<PlayerStats | PlayerStats[]> => {
    const params: Record<string, any> = {};
    if (playerId) {
      params.playerId = playerId;
    }
    return get(`/matches/${matchId}/tracking/players/stats`, { params });
  },
};

export default trackingApi;
