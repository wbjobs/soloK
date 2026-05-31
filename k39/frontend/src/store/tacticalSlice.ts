import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type {
  TacticalBoard,
  PlayerPosition,
  Annotation,
  FormationType,
} from '../types';

interface TacticalState {
  boards: TacticalBoard[];
  currentBoard: TacticalBoard | null;
  selectedPlayer: PlayerPosition | null;
  isDrawing: boolean;
  currentAnnotationType: Annotation['type'] | null;
  currentColor: string;
  zoom: number;
  pan: { x: number; y: number };
  isPlaying: boolean;
  currentTime: number;
  playbackSpeed: number;
  showPlayerNames: boolean;
  showTrails: boolean;
  selectedTeam: 'home' | 'away' | 'both';
}

const initialState: TacticalState = {
  boards: [],
  currentBoard: null,
  selectedPlayer: null,
  isDrawing: false,
  currentAnnotationType: null,
  currentColor: '#ef4444',
  zoom: 1,
  pan: { x: 0, y: 0 },
  isPlaying: false,
  currentTime: 0,
  playbackSpeed: 1,
  showPlayerNames: true,
  showTrails: false,
  selectedTeam: 'both',
};

const tacticalSlice = createSlice({
  name: 'tactical',
  initialState,
  reducers: {
    createBoard: (
      state: TacticalState,
      action: PayloadAction<{
        name: string;
        matchId?: string;
        formation: FormationType;
      }>
    ) => {
      const newBoard: TacticalBoard = {
        id: `board-${Date.now()}`,
        name: action.payload.name,
        matchId: action.payload.matchId,
        formation: action.payload.formation,
        players: [],
        annotations: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      state.boards.push(newBoard);
      state.currentBoard = newBoard;
    },

    setCurrentBoard: (state: TacticalState, action: PayloadAction<TacticalBoard | null>) => {
      state.currentBoard = action.payload;
    },

    updateBoard: (
      state: TacticalState,
      action: PayloadAction<Partial<TacticalBoard>>
    ) => {
      if (state.currentBoard) {
        state.currentBoard = {
          ...state.currentBoard,
          ...action.payload,
          updatedAt: new Date(),
        };
        const index = state.boards.findIndex(
          (b: TacticalBoard) => b.id === state.currentBoard!.id
        );
        if (index !== -1) {
          state.boards[index] = state.currentBoard;
        }
      }
    },

    deleteBoard: (state: TacticalState, action: PayloadAction<string>) => {
      state.boards = state.boards.filter((b: TacticalBoard) => b.id !== action.payload);
      if (state.currentBoard?.id === action.payload) {
        state.currentBoard = null;
      }
    },

    addPlayer: (state: TacticalState, action: PayloadAction<PlayerPosition>) => {
      if (state.currentBoard) {
        state.currentBoard.players.push(action.payload);
        state.currentBoard.updatedAt = new Date();
      }
    },

    updatePlayer: (
      state: TacticalState,
      action: PayloadAction<{ id: string; updates: Partial<PlayerPosition> }>
    ) => {
      if (state.currentBoard) {
        const index = state.currentBoard.players.findIndex(
          (p: PlayerPosition) => p.id === action.payload.id
        );
        if (index !== -1) {
          state.currentBoard.players[index] = {
            ...state.currentBoard.players[index],
            ...action.payload.updates,
          };
          state.currentBoard.updatedAt = new Date();
        }
      }
    },

    removePlayer: (state: TacticalState, action: PayloadAction<string>) => {
      if (state.currentBoard) {
        state.currentBoard.players = state.currentBoard.players.filter(
          (p: PlayerPosition) => p.id !== action.payload
        );
        state.currentBoard.updatedAt = new Date();
      }
    },

    selectPlayer: (state: TacticalState, action: PayloadAction<PlayerPosition | null>) => {
      state.selectedPlayer = action.payload;
      if (state.currentBoard) {
        state.currentBoard.players = state.currentBoard.players.map((p: PlayerPosition) => ({
          ...p,
          isSelected: p.id === action.payload?.id,
        }));
      }
    },

    addAnnotation: (state: TacticalState, action: PayloadAction<Annotation>) => {
      if (state.currentBoard) {
        state.currentBoard.annotations.push(action.payload);
        state.currentBoard.updatedAt = new Date();
      }
    },

    updateAnnotation: (
      state: TacticalState,
      action: PayloadAction<{ id: string; updates: Partial<Annotation> }>
    ) => {
      if (state.currentBoard) {
        const index = state.currentBoard.annotations.findIndex(
          (a: Annotation) => a.id === action.payload.id
        );
        if (index !== -1) {
          state.currentBoard.annotations[index] = {
            ...state.currentBoard.annotations[index],
            ...action.payload.updates,
          };
          state.currentBoard.updatedAt = new Date();
        }
      }
    },

    removeAnnotation: (state: TacticalState, action: PayloadAction<string>) => {
      if (state.currentBoard) {
        state.currentBoard.annotations = state.currentBoard.annotations.filter(
          (a: Annotation) => a.id !== action.payload
        );
        state.currentBoard.updatedAt = new Date();
      }
    },

    clearAnnotations: (state: TacticalState) => {
      if (state.currentBoard) {
        state.currentBoard.annotations = [];
        state.currentBoard.updatedAt = new Date();
      }
    },

    setIsDrawing: (state: TacticalState, action: PayloadAction<boolean>) => {
      state.isDrawing = action.payload;
    },

    setCurrentAnnotationType: (
      state: TacticalState,
      action: PayloadAction<Annotation['type'] | null>
    ) => {
      state.currentAnnotationType = action.payload;
    },

    setCurrentColor: (state: TacticalState, action: PayloadAction<string>) => {
      state.currentColor = action.payload;
    },

    setZoom: (state: TacticalState, action: PayloadAction<number>) => {
      state.zoom = Math.max(0.5, Math.min(3, action.payload));
    },

    setPan: (state: TacticalState, action: PayloadAction<{ x: number; y: number }>) => {
      state.pan = action.payload;
    },

    resetView: (state: TacticalState) => {
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
    },

    setIsPlaying: (state: TacticalState, action: PayloadAction<boolean>) => {
      state.isPlaying = action.payload;
    },

    setCurrentTime: (state: TacticalState, action: PayloadAction<number>) => {
      state.currentTime = Math.max(0, action.payload);
    },

    setPlaybackSpeed: (state: TacticalState, action: PayloadAction<number>) => {
      state.playbackSpeed = Math.max(0.25, Math.min(4, action.payload));
    },

    togglePlayerNames: (state: TacticalState) => {
      state.showPlayerNames = !state.showPlayerNames;
    },

    toggleTrails: (state: TacticalState) => {
      state.showTrails = !state.showTrails;
    },

    setSelectedTeam: (
      state: TacticalState,
      action: PayloadAction<'home' | 'away' | 'both'>
    ) => {
      state.selectedTeam = action.payload;
    },

    setFormation: (state: TacticalState, action: PayloadAction<FormationType>) => {
      if (state.currentBoard) {
        state.currentBoard.formation = action.payload;
        state.currentBoard.updatedAt = new Date();
      }
    },

    clearTactical: (state: TacticalState) => {
      state.boards = [];
      state.currentBoard = null;
      state.selectedPlayer = null;
      state.isDrawing = false;
      state.currentAnnotationType = null;
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      state.isPlaying = false;
      state.currentTime = 0;
    },
  },
});

export const {
  createBoard,
  setCurrentBoard,
  updateBoard,
  deleteBoard,
  addPlayer,
  updatePlayer,
  removePlayer,
  selectPlayer,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  clearAnnotations,
  setIsDrawing,
  setCurrentAnnotationType,
  setCurrentColor,
  setZoom,
  setPan,
  resetView,
  setIsPlaying,
  setCurrentTime,
  setPlaybackSpeed,
  togglePlayerNames,
  toggleTrails,
  setSelectedTeam,
  setFormation,
  clearTactical,
} = tacticalSlice.actions;

export default tacticalSlice.reducer;
