import { createSlice, createAsyncThunk, PayloadAction, ActionReducerMapBuilder } from '@reduxjs/toolkit';
import type { Match, AnalysisResult } from '../types';
import { matchApi, type UploadVideoResponse, type StartAnalysisResponse } from '../services/matchApi';

interface MatchState {
  matches: Match[];
  currentMatch: Match | null;
  analysisStatus: AnalysisResult | null;
  loading: boolean;
  uploading: boolean;
  uploadProgress: number;
  error: string | null;
}

const initialState: MatchState = {
  matches: [],
  currentMatch: null,
  analysisStatus: null,
  loading: false,
  uploading: false,
  uploadProgress: 0,
  error: null,
};

export const fetchMatches = createAsyncThunk<Match[]>(
  'match/fetchMatches',
  async () => {
    return await matchApi.getMatches();
  }
);

export const fetchMatch = createAsyncThunk<Match, string>(
  'match/fetchMatch',
  async (matchId: string) => {
    return await matchApi.getMatch(matchId);
  }
);

export const uploadVideo = createAsyncThunk<
  UploadVideoResponse,
  { file: File; onProgress?: (progress: number) => void },
  { rejectValue: string }
>(
  'match/uploadVideo',
  async (
    { file, onProgress },
    { rejectWithValue }
  ) => {
    try {
      const result = await matchApi.uploadVideo(file, onProgress);
      return result;
    } catch (error) {
      return rejectWithValue(error as string);
    }
  }
);

export const deleteMatch = createAsyncThunk<string, string>(
  'match/deleteMatch',
  async (matchId: string) => {
    await matchApi.deleteMatch(matchId);
    return matchId;
  }
);

export const startAnalysis = createAsyncThunk<StartAnalysisResponse, string>(
  'match/startAnalysis',
  async (matchId: string) => {
    return await matchApi.startAnalysis(matchId);
  }
);

export const fetchAnalysisStatus = createAsyncThunk<AnalysisResult, string>(
  'match/fetchAnalysisStatus',
  async (matchId: string) => {
    return await matchApi.getAnalysisStatus(matchId);
  }
);

const matchSlice = createSlice({
  name: 'match',
  initialState,
  reducers: {
    setCurrentMatch: (state: MatchState, action: PayloadAction<Match | null>) => {
      state.currentMatch = action.payload;
    },
    setUploadProgress: (state: MatchState, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    clearError: (state: MatchState) => {
      state.error = null;
    },
  },
  extraReducers: (builder: ActionReducerMapBuilder<MatchState>) => {
    builder
      .addCase(fetchMatches.pending, (state: MatchState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMatches.fulfilled, (state: MatchState, action: PayloadAction<Match[]>) => {
        state.loading = false;
        state.matches = action.payload;
      })
      .addCase(fetchMatches.rejected, (state: MatchState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取比赛列表失败';
      })
      .addCase(fetchMatch.pending, (state: MatchState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMatch.fulfilled, (state: MatchState, action: PayloadAction<Match>) => {
        state.loading = false;
        state.currentMatch = action.payload;
      })
      .addCase(fetchMatch.rejected, (state: MatchState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取比赛详情失败';
      })
      .addCase(uploadVideo.pending, (state: MatchState) => {
        state.uploading = true;
        state.uploadProgress = 0;
        state.error = null;
      })
      .addCase(uploadVideo.fulfilled, (state: MatchState) => {
        state.uploading = false;
        state.uploadProgress = 100;
      })
      .addCase(uploadVideo.rejected, (state: MatchState, action) => {
        state.uploading = false;
        state.error = (action.payload as string) || action.error.message || '上传视频失败';
      })
      .addCase(deleteMatch.fulfilled, (state: MatchState, action: PayloadAction<string>) => {
        state.matches = state.matches.filter((m: Match) => m.id !== action.payload);
        if (state.currentMatch?.id === action.payload) {
          state.currentMatch = null;
        }
      })
      .addCase(startAnalysis.fulfilled, (state: MatchState) => {
        if (state.currentMatch) {
          state.currentMatch.status = 'processing';
        }
      })
      .addCase(fetchAnalysisStatus.pending, (state: MatchState) => {
        state.error = null;
      })
      .addCase(fetchAnalysisStatus.fulfilled, (state: MatchState, action: PayloadAction<AnalysisResult>) => {
        state.analysisStatus = action.payload;
        if (state.currentMatch) {
          state.currentMatch.status = action.payload.status;
        }
      })
      .addCase(fetchAnalysisStatus.rejected, (state: MatchState, action) => {
        state.error = (action.payload as string) || action.error.message || '获取分析状态失败';
      });
  },
});

export const { setCurrentMatch, setUploadProgress, clearError } = matchSlice.actions;

export default matchSlice.reducer;
