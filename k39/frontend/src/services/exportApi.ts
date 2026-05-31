import { get } from './api';

export interface ExportReportOptions {
  format: 'pdf' | 'excel' | 'word';
  includeHeatmap?: boolean;
  includePassNetwork?: boolean;
  includePlayerStats?: boolean;
  includeEvents?: boolean;
  language?: 'zh' | 'en';
}

export interface ExportTacticalAnimationOptions {
  startTime: number;
  endTime: number;
  format: 'mp4' | 'gif' | 'webm';
  quality?: 'low' | 'medium' | 'high';
  fps?: number;
  showPlayerNames?: boolean;
  showTrails?: boolean;
  teamId?: 'home' | 'away' | 'both';
}

export const exportApi = {
  exportReport: (
    matchId: string,
    options: ExportReportOptions
  ): Promise<Blob> => {
    return get(`/matches/${matchId}/export/report`, {
      params: options,
      responseType: 'blob',
    });
  },

  exportTacticalAnimation: (
    matchId: string,
    options: ExportTacticalAnimationOptions
  ): Promise<Blob> => {
    return get(`/matches/${matchId}/export/tactical-animation`, {
      params: options,
      responseType: 'blob',
    });
  },
};

export default exportApi;
