import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { DeviceId } from '@ecocycle/shared';
import { QUALITY_TIERS } from '../../config/quality';
import type { QualityTier } from '../../config/quality';

/** 화질 단계(high/standard/low). 값의 뜻은 config/quality.ts */
export type QualityMode = QualityTier;
/** 홈 맨 위 전환: 3d(3D 장면) 또는 dashboard(3D 없는 대시보드) */
export type HomeMode = '3d' | 'dashboard';

export interface UiState {
  /** 홈에서 확대해서 보고 있는 기기 */
  selectedDeviceId: DeviceId | null;
  cctvOpen: boolean;
  /** 기록 상세 팝업(차량·배치·베일)이 열려 있다. 열린 동안 3D 그리기를 멈춘다 */
  recordPopupOpen: boolean;
  /** 화질 단계. 저사양 태블릿에서는 low */
  qualityMode: QualityMode;
  /** 이 기기에서 아직 고른 적이 없다. 접속할 때 짧게 프레임을 재서 자동으로 고른다 */
  qualityAuto: boolean;
  /** 사용자가 설정에서 직접 골랐다 (자동 측정 결과와 구별한다: 3D 홈은 직접 고른 값만 그대로 따르고, 측정값은 기기 종류 기본값에서 한 단계까지만 반영한다) */
  qualityChosen: boolean;
  /** 홈을 3D로 볼지 대시보드로 볼지 (기기에 기억, 기본 3D). 3D를 그릴 수 없는 기기에서는 값과 상관없이 대시보드로 보여 준다 */
  homeMode: HomeMode;
}

const QUALITY_KEY = 'ecocycle.qualityMode';
const QUALITY_CHOSEN_KEY = 'ecocycle.qualityChosen';

function loadQualityChosen(): boolean {
  try {
    return localStorage.getItem(QUALITY_CHOSEN_KEY) === '1' && loadSavedQuality() !== null;
  } catch {
    return false;
  }
}

/** 직접 골랐는지 기억한다 */
export function saveQualityChosen(chosen: boolean): void {
  try {
    if (chosen) localStorage.setItem(QUALITY_CHOSEN_KEY, '1');
    else localStorage.removeItem(QUALITY_CHOSEN_KEY);
  } catch {
    // 저장소를 못 써도 앱은 동작한다
  }
}

/** 화질 모드는 기기마다 기억해 둔다 (표시 설정일 뿐 토큰 같은 비밀이 아니다). 저장소를 못 쓰면 기본값. */
function loadSavedQuality(): QualityMode | null {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    return (QUALITY_TIERS as readonly string[]).includes(saved ?? '') ? (saved as QualityMode) : null;
  } catch {
    return null;
  }
}

export const loadQualityMode = (): QualityMode => loadSavedQuality() ?? 'high';

/** null이면 기억한 값을 지운다 (다음에 열 때 다시 자동으로 고른다) */
export function saveQualityMode(mode: QualityMode | null): void {
  try {
    if (mode === null) localStorage.removeItem(QUALITY_KEY);
    else localStorage.setItem(QUALITY_KEY, mode);
  } catch {
    // 저장소를 못 써도 앱은 동작한다
  }
}

const HOME_MODE_KEY = 'ecocycle.homeMode';
/** 2026-10-14 이전의 키: 기본/스튜디오 탭(homeTab)과 3D/2D 표시 모드(homeView). 읽어서 새 전환으로 옮긴 뒤 지운다 */
const OLD_HOME_TAB_KEY = 'ecocycle.homeTab';
const OLD_HOME_VIEW_KEY = 'ecocycle.homeView';

/** 고른 적이 없을 때의 홈: 폰(짧은 변 600px 미만)은 대시보드, 그 밖은 3D (2026-10-17 사용자 요청) */
function defaultHomeMode(): HomeMode {
  return typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600 ? 'dashboard' : '3d';
}

/**
 * 기억한 홈 모드. 새 키가 없으면 옛 키를 옮긴다: 2D 카드(homeView = cards)를 골랐던 기기는 대시보드,
 * 그 밖(3D를 골랐거나 기본·스튜디오 탭만 남은 기기)은 3D. 옮긴 뒤 옛 키는 지운다.
 */
export function loadHomeMode(): HomeMode {
  const fallback = defaultHomeMode();
  try {
    const saved = localStorage.getItem(HOME_MODE_KEY);
    if (saved === '3d' || saved === 'dashboard') return saved;
    const oldView = localStorage.getItem(OLD_HOME_VIEW_KEY);
    const hadOld = oldView !== null || localStorage.getItem(OLD_HOME_TAB_KEY) !== null;
    const mode: HomeMode = oldView === 'cards' ? 'dashboard' : fallback;
    if (hadOld) {
      localStorage.setItem(HOME_MODE_KEY, mode);
      localStorage.removeItem(OLD_HOME_VIEW_KEY);
      localStorage.removeItem(OLD_HOME_TAB_KEY);
    }
    return mode;
  } catch {
    return fallback;
  }
}

export function saveHomeMode(mode: HomeMode): void {
  try {
    localStorage.setItem(HOME_MODE_KEY, mode);
  } catch {
    // 저장소를 못 써도 앱은 동작한다
  }
}

// 로그아웃으로 초기화될 때도 기억해 둔 화질 모드를 그대로 쓰도록 함수로 만든다
// 2026-10-17 화질 규칙이 바뀌었다(기본 high). 예전 규칙으로 잰 자동 값은 한 번 버려 새로 잰다. 직접 고른 값은 둔다.
const QUALITY_RULE_KEY = 'ecocycle.qualityRule';
const QUALITY_RULE = '3';
function dropStaleAutoQuality(): void {
  try {
    if (localStorage.getItem(QUALITY_RULE_KEY) === QUALITY_RULE) return;
    localStorage.setItem(QUALITY_RULE_KEY, QUALITY_RULE);
    if (localStorage.getItem(QUALITY_CHOSEN_KEY) !== '1') localStorage.removeItem(QUALITY_KEY);
  } catch {
    // 저장소를 못 써도 앱은 동작한다
  }
}

const initialState = (): UiState => {
  dropStaleAutoQuality();
  return {
    selectedDeviceId: null,
    cctvOpen: false,
    recordPopupOpen: false,
    qualityMode: loadQualityMode(),
    qualityAuto: loadSavedQuality() === null,
    qualityChosen: loadQualityChosen(),
    homeMode: loadHomeMode(),
  };
};

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
    recordPopupToggled(state, action: PayloadAction<boolean>) {
      state.recordPopupOpen = action.payload;
    },
    /** 사용자가 설정에서 직접 골랐다 */
    qualityModeChanged(state, action: PayloadAction<QualityMode>) {
      state.qualityMode = action.payload;
      state.qualityAuto = false;
      state.qualityChosen = true;
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
      state.qualityChosen = false;
    },
    homeModeChanged(state, action: PayloadAction<HomeMode>) {
      state.homeMode = action.payload;
    },
  },
});

export const { deviceSelected, cctvToggled, recordPopupToggled, qualityModeChanged, qualityProbed, qualityAutoRequested, homeModeChanged } = slice.actions;
export default slice.reducer;
