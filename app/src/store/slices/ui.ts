import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeviceId } from '@ecocycle/shared';

export type QualityMode = 'standard' | 'low';
/** 홈 표시 모드: scene(3D 장면) 또는 cards(2D 카드) */
export type HomeView = 'scene' | 'cards';

export interface UiState {
  /** 홈에서 확대해서 보고 있는 기기 */
  selectedDeviceId: DeviceId | null;
  cctvOpen: boolean;
  /** 화질 모드. 저사양 태블릿에서는 low (3D 홈, 2단계에서 사용) */
  qualityMode: QualityMode;
  /** 홈을 3D 장면으로 볼지 2D 카드로 볼지 (기기에 기억). 3D를 그릴 수 없는 기기에서는 값과 상관없이 2D로 보여 준다 */
  homeView: HomeView;
}

const QUALITY_KEY = 'ecocycle.qualityMode';

/** 화질 모드는 기기마다 기억해 둔다 (표시 설정일 뿐 토큰 같은 비밀이 아니다). 저장소를 못 쓰면 기본값. */
export function loadQualityMode(): QualityMode {
  try {
    return localStorage.getItem(QUALITY_KEY) === 'low' ? 'low' : 'standard';
  } catch {
    return 'standard';
  }
}

export function saveQualityMode(mode: QualityMode): void {
  try {
    localStorage.setItem(QUALITY_KEY, mode);
  } catch {
    // 저장소를 못 써도 앱은 동작한다
  }
}

const HOME_VIEW_KEY = 'ecocycle.homeView';

export function loadHomeView(): HomeView {
  try {
    return localStorage.getItem(HOME_VIEW_KEY) === 'cards' ? 'cards' : 'scene';
  } catch {
    return 'scene';
  }
}

export function saveHomeView(view: HomeView): void {
  try {
    localStorage.setItem(HOME_VIEW_KEY, view);
  } catch {
    // 저장소를 못 써도 앱은 동작한다
  }
}

// 로그아웃으로 초기화될 때도 기억해 둔 화질 모드를 그대로 쓰도록 함수로 만든다
const initialState = (): UiState => ({ selectedDeviceId: null, cctvOpen: false, qualityMode: loadQualityMode(), homeView: loadHomeView() });

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
    homeViewChanged(state, action: PayloadAction<HomeView>) {
      state.homeView = action.payload;
    },
  },
});

export const { deviceSelected, cctvToggled, qualityModeChanged, homeViewChanged } = slice.actions;
export default slice.reducer;
