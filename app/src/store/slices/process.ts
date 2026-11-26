import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Bale, Batch, ProcessState, Vehicle } from '@ecocycle/shared';

// 공정 흐름(차량·배치·베일). 서버가 보낸 대상 전체 상태를 그대로 둔다. 단계·배정·배합·압력은 서버가 정한다.
// 목록은 오래된 것부터 최신 순이고 종류별로 최근 것만 남긴다. 단 적치(created) 베일은 진행 중이라 모두 남긴다
// (명세 GET /process/state "진행 중 + 종류별 최근 20건". 3D 마당은 목록에서 빠진 베일을 출하로 보므로, S2q).

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
function upsert<T extends { id: string; updatedAt: string }>(list: T[], incoming: T, keep?: (x: T) => boolean): void {
  const index = list.findIndex((x) => x.id === incoming.id);
  if (index < 0) {
    list.push(incoming);
    trim(list, keep);
    return;
  }
  const current = list[index];
  // 더 오래된 값(늦게 도착한 REST 응답 등)으로 덮어쓰지 않는다
  if (current && incoming.updatedAt < current.updatedAt) return;
  list[index] = incoming;
  trim(list, keep);
}

/** KEEP건이 넘으면 오래된 것부터 뺀다. keep이 참인 것(진행 중)은 빼지 않고 세지도 않는다 */
function trim<T>(list: T[], keep?: (x: T) => boolean): void {
  if (!keep) {
    while (list.length > KEEP) list.shift();
    return;
  }
  let extra = list.filter((x) => !keep(x)).length - KEEP;
  for (let i = 0; i < list.length && extra > 0; ) {
    if (keep(list[i] as T)) i += 1;
    else {
      list.splice(i, 1);
      extra -= 1;
    }
  }
}

const inYard = (b: Bale) => b.stage === 'created';

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
      upsert(state.bales, action.payload, inYard);
      state.loaded = true;
    },
    /** REST 재동기화: 받은 상태를 하나씩 반영한다 (그사이 WebSocket으로 온 더 새 값은 지키려고 통째로 바꾸지 않는다) */
    processSynced(state, action: PayloadAction<ProcessState>) {
      for (const v of action.payload.vehicles) upsert(state.vehicles, v);
      for (const b of action.payload.batches) upsert(state.batches, b);
      for (const b of action.payload.bales) upsert(state.bales, b, inYard);
      state.loaded = true;
    },
  },
});

export const { vehicleReceived, batchReceived, baleReceived, processSynced } = slice.actions;
export default slice.reducer;
