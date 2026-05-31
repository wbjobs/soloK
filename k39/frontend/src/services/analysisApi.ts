import { get } from './api';
import type { HeatmapCell, PassNetwork, Formation, PlayerRunData } from '../types';

export const analysisApi = {
  getHeatmap: (
    matchId: string,
    teamId?: 'home' | 'away',
    playerId?: string
  ): Promise<HeatmapCell[]> => {
    const params: Record<string, any> = {};
    if (teamId) {
      params.teamId = teamId;
    }
    if (playerId) {
      params.playerId = playerId;
    }
    return get(`/matches/${matchId}/analysis/heatmap`, { params });
  },

  getPassNetwork: (
    matchId: string,
    teamId: 'home' | 'away'
  ): Promise<PassNetwork> => {
    return get(`/matches/${matchId}/analysis/pass-network`, {
      params: { teamId },
    });
  },

  getFormation: (
    matchId: string,
    teamId: 'home' | 'away',
    period?: 'all' | 'first' | 'second'
  ): Promise<Formation> => {
    const params: Record<string, any> = { teamId };
    if (period) {
      params.period = period;
    }
    return get(`/matches/${matchId}/analysis/formation`, { params });
  },

  getPossession: (
    matchId: string,
    interval?: number
  ): Promise<{
    home: number; away: number; timeline: { timestamp: number; home: number; away: number }[] }> => {
    const params: Record<string, any> = {};
    if (interval) {
      params.interval = interval;
    }
    return get(`/matches/${matchId}/analysis/possession`, { params });
  },

  getPlayerRunData: (
    matchId: string,
    playerId: string
  ): Promise<PlayerRunData> => {
    return get(`/matches/${matchId}/analysis/players/${playerId}/runs`);
  },
};

export default analysisApi;
