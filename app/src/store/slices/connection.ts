import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ConnectionState } from '../../realtime';

// 실시간 연결 상태. 화면과 로봇팔은 이 값을 보고 "연결 끊김"을 표시하고 멈춘다.
// 마지막 수신 시각은 상태가 바뀔 때만 기록한다 (메시지마다 store를 갱신하지 않는다).
const initialState: ConnectionState = { status: 'offline', lastReceivedAt: null };

const slice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    connectionChanged: (_state, action: PayloadAction<ConnectionState>) => action.payload,
  },
});

export const { connectionChanged } = slice.actions;
export default slice.reducer;
