import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Alarm } from '@ecocycle/shared';

// 열려 있는 알람(active, acknowledged)만 둔다. 해제된 알람과 이력은 알람 화면이 REST로 조회한다.
export interface AlarmsState {
  byId: Record<string, Alarm>;
}

const initialState: AlarmsState = { byId: {} };

const slice = createSlice({
  name: 'alarms',
  initialState,
  reducers: {
    /** WebSocket `alarm`: 발생·확인·해제 때 알람 하나 */
    alarmReceived(state, action: PayloadAction<Alarm>) {
      const alarm = action.payload;
      if (alarm.state === 'cleared') delete state.byId[alarm.id];
      else state.byId[alarm.id] = alarm;
    },
    /** 연결(재연결) 뒤 REST로 받은 열린 알람 전체로 바꾼다. 그동안 놓친 발생·해제가 맞춰진다. */
    alarmsReplaced(state, action: PayloadAction<Alarm[]>) {
      state.byId = {};
      for (const alarm of action.payload) {
        if (alarm.state !== 'cleared') state.byId[alarm.id] = alarm;
      }
    },
  },
});

export const { alarmReceived, alarmsReplaced } = slice.actions;
export default slice.reducer;
