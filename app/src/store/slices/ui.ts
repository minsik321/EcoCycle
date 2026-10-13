import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeviceId } from '@ecocycle/shared';
import { QUALITY_TIERS } from '../../config/quality';
import type { QualityTier } from '../../config/quality';

/** 화질 단계(high/standard/low). 값의 뜻은 config/quality.ts */
export type QualityMode = QualityTier;
/** 홈 표시 모드: scene(3D 장면) 또는 cards(2D 카드) */
export type HomeView = 'scene' | 'cards';

export interface UiState {
  /** 홈에서 확대해서 보고 있는 기기 */
  selectedDeviceId: DeviceId | null;
  cctvOpen: boolean;
  /** 화질 단계. 저사양 태블릿에서는 low */
  qualityMode: QualityMode;
  /** 이 기기에서 아직 고른 적이 없다. 접속할 때 짧게 프레임을 재서 자동으로 고른다 */
  qualityAuto: boolean;
  /** 홈을 3D 장면으로 볼지 2D 카드로 볼지 (기기에 기억). 3D를 그릴 수 없는 기기에서는 값과 상관없이 2D로 보여 준다 */
  homeView: HomeView;
}

const QUALITY_KEY = 'ecocycle.qualityMode';

/** 화질 모드는 기기마다 기억해 둔다 (표시 설정일 뿐 토큰 같은 비밀이 아니다). 저장소를 못 쓰면 기본값. */
function loadSavedQuality(): QualityMode | null {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    return (QUALITY_TIERS as readonly string[]).includes(saved ?? '') ? (saved as QualityMode) : null;
  } catch {
    return null;
  }
}

export const loadQualityMode = (): QualityMode => loadSavedQuality() ?? 'standard';

/** null이면 기억한 값을 지운다 (다음에 열 때 다시 자동으로 고른다) */
export function saveQualityMode(mode: QualityMode | null): void {
  try {
    if (mode === null) localStorage.removeItem(QUALITY_KEY);
    else localStorage.setItem(QUALITY_KEY, mode);
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
const initialState = (): UiState => ({
  selectedDeviceId: null,
  cctvOpen: false,
  qualityMode: loadQualityMode(),
  qualityAuto: loadSavedQuality() === null,
  homeView: loadHomeView(),
});

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
    /** 사용자가 설정에서 직접 골랐다 */
    qualityModeChanged(state, action: PayloadAction<QualityMode>) {
      state.qualityMode = action.payload;
      state.qualityAuto = false;
    },
    /** 자동 측정 결과. 그사이 사용자가 직접 골랐으면 무시한다 */
    qualityProbed(state, action: PayloadAction<QualityMode>) {
      if (!state.qualityAuto) return;
      state.qualityMode = action.payload;
      state.qualityAuto = false;
    },
    /** 자동으로 다시 고르기: 기억한 값을 버리고 다시 잰다 */
    qualityAutoRequested(state) {
      state.qualityAuto = true;
    },
    homeViewChanged(state, action: PayloadAction<HomeView>) {
      state.homeView = action.payload;
    },
  },
});

export const { deviceSelected, cctvToggled, qualityModeChanged, qualityProbed, qualityAutoRequested, homeViewChanged } = slice.actions;
export default slice.reducer;
