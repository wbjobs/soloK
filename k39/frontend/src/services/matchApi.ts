import { get, post, del } from './api';
import type { Match, AnalysisResult } from '../types';

export interface UploadVideoResponse {
  matchId: string;
  uploadUrl: string;
}

export interface StartAnalysisResponse {
  analysisId: string;
  status: 'pending' | 'processing';
}

export const matchApi = {
  uploadVideo: (
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<UploadVideoResponse> => {
    const formData = new FormData();
    formData.append('video', file);

    return post('/matches/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(progress);
        }
      },
    });
  },

  getMatches: (): Promise<Match[]> => {
    return get('/matches');
  },

  getMatch: (matchId: string): Promise<Match> => {
    return get(`/matches/${matchId}`);
  },

  deleteMatch: (matchId: string): Promise<void> => {
    return del(`/matches/${matchId}`);
  },

  startAnalysis: (matchId: string): Promise<StartAnalysisResponse> => {
    return post(`/matches/${matchId}/analyze`);
  },

  getAnalysisStatus: (matchId: string): Promise<AnalysisResult> => {
    return get(`/matches/${matchId}/analysis/status`);
  },
};

export default matchApi;
