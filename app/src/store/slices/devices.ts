import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeviceId, DeviceState } from '@ecocycle/shared';

// 기기 ID별 최신 상태. 서버가 보낸 DeviceState를 그대로 둔다.
export interface DevicesState {
  byId: Partial<Record<DeviceId, DeviceState>>;
}

const initialState: DevicesState = { byId: {} };

const slice = createSlice({
  name: 'devices',
  initialState,
  reducers: {
    /** 상태 여러 개를 한 번에 반영한다 (WebSocket은 모아서, REST 재동기화는 전체를 한 번에) */
    devicesReceived(state, action: PayloadAction<DeviceState[]>) {
      for (const incoming of action.payload) {
        const current = state.byId[incoming.id];
        // 더 오래된 값(늦게 도착한 REST 응답 등)으로 덮어쓰지 않는다
        if (current && incoming.updatedAt < current.updatedAt) continue;
        state.byId[incoming.id] = incoming;
      }
    },
  },
});

export const { devicesReceived } = slice.actions;
export default slice.reducer;
