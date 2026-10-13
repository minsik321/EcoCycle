import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeviceId } from '@ecocycle/shared';

export type QualityMode = 'standard' | 'low';

export interface UiState {
  /** 홈에서 확대해서 보고 있는 기기 */
  selectedDeviceId: DeviceId | null;
  cctvOpen: boolean;
  /** 화질 모드. 저사양 태블릿에서는 low (3D 홈, 2단계에서 사용) */
  qualityMode: QualityMode;
}

const initialState: UiState = { selectedDeviceId: null, cctvOpen: false, qualityMode: 'standard' };

const slice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    deviceSelected(state, action: PayloadAction<DeviceId | null>) {
      state.selectedDeviceId = action.payload;
    },
    cctvToggled(state, action: PayloadAction<boolean>) {
      state.cctvOpen = action.payload;
    },
    qualityModeChanged(state, action: PayloadAction<QualityMode>) {
      state.qualityMode = action.payload;
    },
  },
});

export const { deviceSelected, cctvToggled, qualityModeChanged } = slice.actions;
export default slice.reducer;
