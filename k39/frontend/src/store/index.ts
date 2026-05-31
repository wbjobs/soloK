import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import matchReducer from './matchSlice';
import analysisReducer from './analysisSlice';
import tacticalReducer from './tacticalSlice';

export const store = configureStore({
  reducer: {
    match: matchReducer,
    analysis: analysisReducer,
    tactical: tacticalReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
