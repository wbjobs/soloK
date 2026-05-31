import { createSlice, createAsyncThunk, PayloadAction, ActionReducerMapBuilder } from '@reduxjs/toolkit';
import type {
  HeatmapCell,
  PassNetwork,
  Formation,
  PlayerRunData,
  Event,
  TrackingData,
  FrameData,
  PlayerStats,
  EventType,
} from '../types';
import { analysisApi } from '../services/analysisApi';
import { eventApi, type AddEventRequest } from '../services/eventApi';
import { trackingApi } from '../services/trackingApi';

interface AnalysisState {
  heatmap: HeatmapCell[];
  passNetwork: PassNetwork | null;
  formation: Formation | null;
  possession: {
    home: number;
    away: number;
    timeline: { timestamp: number; home: number; away: number }[];
  } | null;
  playerRunData: PlayerRunData | null;
  events: Event[];
  trackingData: TrackingData[];
  currentFrame: FrameData | null;
  playerStats: PlayerStats | PlayerStats[] | null;
  loading: boolean;
  error: string | null;
}

const initialState: AnalysisState = {
  heatmap: [],
  passNetwork: null,
  formation: null,
  possession: null,
  playerRunData: null,
  events: [],
  trackingData: [],
  currentFrame: null,
  playerStats: null,
  loading: false,
  error: null,
};

export const fetchHeatmap = createAsyncThunk<
  HeatmapCell[],
  { matchId: string; teamId?: 'home' | 'away'; playerId?: string }
>(
  'analysis/fetchHeatmap',
  async ({ matchId, teamId, playerId }) => {
    return await analysisApi.getHeatmap(matchId, teamId, playerId);
  }
);

export const fetchPassNetwork = createAsyncThunk<
  PassNetwork,
  { matchId: string; teamId: 'home' | 'away' }
>(
  'analysis/fetchPassNetwork',
  async ({ matchId, teamId }) => {
    return await analysisApi.getPassNetwork(matchId, teamId);
  }
);

export const fetchFormation = createAsyncThunk<
  Formation,
  { matchId: string; teamId: 'home' | 'away'; period?: 'all' | 'first' | 'second' }
>(
  'analysis/fetchFormation',
  async ({ matchId, teamId, period }) => {
    return await analysisApi.getFormation(matchId, teamId, period);
  }
);

export const fetchPossession = createAsyncThunk<
  { home: number; away: number; timeline: { timestamp: number; home: number; away: number }[] },
  { matchId: string; interval?: number }
>(
  'analysis/fetchPossession',
  async ({ matchId, interval }) => {
    return await analysisApi.getPossession(matchId, interval);
  }
);

export const fetchPlayerRunData = createAsyncThunk<
  PlayerRunData,
  { matchId: string; playerId: string }
>(
  'analysis/fetchPlayerRunData',
  async ({ matchId, playerId }) => {
    return await analysisApi.getPlayerRunData(matchId, playerId);
  }
);

export const fetchEvents = createAsyncThunk<
  Event[],
  { matchId: string; eventType?: EventType; teamId?: 'home' | 'away' }
>(
  'analysis/fetchEvents',
  async ({ matchId, eventType, teamId }) => {
    return await eventApi.getEvents(matchId, eventType, teamId);
  }
);

export const addEvent = createAsyncThunk<Event, AddEventRequest>(
  'analysis/addEvent',
  async (eventData: AddEventRequest) => {
    return await eventApi.addEvent(eventData);
  }
);

export const updateEvent = createAsyncThunk<
  Event,
  { eventId: string; eventData: Partial<AddEventRequest> }
>(
  'analysis/updateEvent',
  async ({ eventId, eventData }) => {
    return await eventApi.updateEvent(eventId, eventData);
  }
);

export const deleteEvent = createAsyncThunk<string, string>(
  'analysis/deleteEvent',
  async (eventId: string) => {
    await eventApi.deleteEvent(eventId);
    return eventId;
  }
);

export const fetchTrackingData = createAsyncThunk<TrackingData[], string>(
  'analysis/fetchTrackingData',
  async (matchId: string) => {
    return await trackingApi.getTrackingData(matchId);
  }
);

export const fetchFrameData = createAsyncThunk<
  FrameData,
  { matchId: string; frameNumber: number; cameraType?: 'main' | 'goal_left' | 'goal_right' }
>(
  'analysis/fetchFrameData',
  async ({ matchId, frameNumber, cameraType }) => {
    return await trackingApi.getFrameData(matchId, frameNumber, cameraType);
  }
);

export const fetchPlayerStats = createAsyncThunk<
  PlayerStats | PlayerStats[],
  { matchId: string; playerId?: string }
>(
  'analysis/fetchPlayerStats',
  async ({ matchId, playerId }) => {
    return await trackingApi.getPlayerStats(matchId, playerId);
  }
);

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    clearAnalysisData: (state: AnalysisState) => {
      state.heatmap = [];
      state.passNetwork = null;
      state.formation = null;
      state.possession = null;
      state.playerRunData = null;
      state.events = [];
      state.trackingData = [];
      state.currentFrame = null;
      state.playerStats = null;
      state.error = null;
    },
    setCurrentFrame: (state: AnalysisState, action: PayloadAction<FrameData | null>) => {
      state.currentFrame = action.payload;
    },
    clearError: (state: AnalysisState) => {
      state.error = null;
    },
  },
  extraReducers: (builder: ActionReducerMapBuilder<AnalysisState>) => {
    builder
      .addCase(fetchHeatmap.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchHeatmap.fulfilled, (state: AnalysisState, action: PayloadAction<HeatmapCell[]>) => {
        state.loading = false;
        state.heatmap = action.payload;
      })
      .addCase(fetchHeatmap.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取热力图失败';
      })
      .addCase(fetchPassNetwork.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPassNetwork.fulfilled, (state: AnalysisState, action: PayloadAction<PassNetwork>) => {
        state.loading = false;
        state.passNetwork = action.payload;
      })
      .addCase(fetchPassNetwork.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取传球网络失败';
      })
      .addCase(fetchFormation.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFormation.fulfilled, (state: AnalysisState, action: PayloadAction<Formation>) => {
        state.loading = false;
        state.formation = action.payload;
      })
      .addCase(fetchFormation.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取阵型失败';
      })
      .addCase(fetchPossession.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPossession.fulfilled, (state: AnalysisState, action) => {
        state.loading = false;
        state.possession = action.payload;
      })
      .addCase(fetchPossession.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取控球率失败';
      })
      .addCase(fetchPlayerRunData.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlayerRunData.fulfilled, (state: AnalysisState, action: PayloadAction<PlayerRunData>) => {
        state.loading = false;
        state.playerRunData = action.payload;
      })
      .addCase(fetchPlayerRunData.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取球员跑动数据失败';
      })
      .addCase(fetchEvents.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state: AnalysisState, action: PayloadAction<Event[]>) => {
        state.loading = false;
        state.events = action.payload;
      })
      .addCase(fetchEvents.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取事件列表失败';
      })
      .addCase(addEvent.fulfilled, (state: AnalysisState, action: PayloadAction<Event>) => {
        state.events.push(action.payload);
      })
      .addCase(updateEvent.fulfilled, (state: AnalysisState, action: PayloadAction<Event>) => {
        const index = state.events.findIndex((e: Event) => e.id === action.payload.id);
        if (index !== -1) {
          state.events[index] = action.payload;
        }
      })
      .addCase(deleteEvent.fulfilled, (state: AnalysisState, action: PayloadAction<string>) => {
        state.events = state.events.filter((e: Event) => e.id !== action.payload);
      })
      .addCase(fetchTrackingData.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTrackingData.fulfilled, (state: AnalysisState, action: PayloadAction<TrackingData[]>) => {
        state.loading = false;
        state.trackingData = action.payload;
      })
      .addCase(fetchTrackingData.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取追踪数据失败';
      })
      .addCase(fetchFrameData.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFrameData.fulfilled, (state: AnalysisState, action: PayloadAction<FrameData>) => {
        state.loading = false;
        state.currentFrame = action.payload;
      })
      .addCase(fetchFrameData.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取帧数据失败';
      })
      .addCase(fetchPlayerStats.pending, (state: AnalysisState) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPlayerStats.fulfilled, (state: AnalysisState, action) => {
        state.loading = false;
        state.playerStats = action.payload;
      })
      .addCase(fetchPlayerStats.rejected, (state: AnalysisState, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message || '获取球员统计失败';
      });
  },
});

export const { clearAnalysisData, setCurrentFrame, clearError } = analysisSlice.actions;

export default analysisSlice.reducer;
