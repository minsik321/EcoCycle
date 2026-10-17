import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { PlantSummary } from '@ecocycle/shared';

// 상단 카드 요약. 서버가 준 값을 그대로 둔다 (status 판정도 서버가 한다).
export interface PlantState {
  summary: PlantSummary | null;
}

const initialState: PlantState = { summary: null };

const slice = createSlice({
  name: 'plant',
  initialState,
  reducers: {
    plantReceived(state, action: PayloadAction<PlantSummary>) {
      // REST 재동기화 응답이 더 최신인 WebSocket 값보다 늦게 도착해도 덮어쓰지 않는다 (ISO 시각은 문자열 비교가 곧 시간순)
      if (state.summary && action.payload.updatedAt < state.summary.updatedAt) return;
      state.summary = action.payload;
    },
  },
});

export const { plantReceived } = slice.actions;
export default slice.reducer;
