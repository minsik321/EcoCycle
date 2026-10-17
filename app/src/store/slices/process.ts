import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Bale, Batch, ProcessState, Vehicle } from '@ecocycle/shared';

// 공정 흐름(차량·배치·베일). 서버가 보낸 대상 전체 상태를 그대로 둔다. 단계·배정·배합·압력은 서버가 정한다.
// 목록은 오래된 것부터 최신 순이고 종류별로 최근 것만 남긴다.

const KEEP = 20;

export interface ProcessSliceState {
  vehicles: Vehicle[];
  batches: Batch[];
  bales: Bale[];
  /** 한 번이라도 값을 받았는가 */
  loaded: boolean;
}

const initialState: ProcessSliceState = { vehicles: [], batches: [], bales: [], loaded: false };

/** 같은 ID는 더 새 값으로만 바꾸고, 새 대상은 뒤에 붙인다 */
function upsert<T extends { id: string; updatedAt: string }>(list: T[], incoming: T): void {
  const index = list.findIndex((x) => x.id === incoming.id);
  if (index < 0) {
    list.push(incoming);
    if (list.length > KEEP) list.shift();
    return;
  }
  const current = list[index];
  // 더 오래된 값(늦게 도착한 REST 응답 등)으로 덮어쓰지 않는다
  if (current && incoming.updatedAt < current.updatedAt) return;
  list[index] = incoming;
}

const slice = createSlice({
  name: 'process',
  initialState,
  reducers: {
    vehicleReceived(state, action: PayloadAction<Vehicle>) {
      upsert(state.vehicles, action.payload);
      state.loaded = true;
    },
    batchReceived(state, action: PayloadAction<Batch>) {
      upsert(state.batches, action.payload);
      state.loaded = true;
    },
    baleReceived(state, action: PayloadAction<Bale>) {
      upsert(state.bales, action.payload);
      state.loaded = true;
    },
    /** REST 재동기화: 받은 상태를 하나씩 반영한다 (그사이 WebSocket으로 온 더 새 값은 지키려고 통째로 바꾸지 않는다) */
    processSynced(state, action: PayloadAction<ProcessState>) {
      for (const v of action.payload.vehicles) upsert(state.vehicles, v);
      for (const b of action.payload.batches) upsert(state.batches, b);
      for (const b of action.payload.bales) upsert(state.bales, b);
      state.loaded = true;
    },
  },
});

export const { vehicleReceived, batchReceived, baleReceived, processSynced } = slice.actions;
export default slice.reducer;
