import { combineReducers, configureStore } from '@reduxjs/toolkit';
import type { UnknownAction } from '@reduxjs/toolkit';
import alarms from './slices/alarms';
import auth, { logoutUser, sessionLost } from './slices/auth';
import commands from './slices/commands';
import connection from './slices/connection';
import devices from './slices/devices';
import plant from './slices/plant';
import process from './slices/process';
import ui, { saveHomeMode, saveQualityChosen, saveQualityMode } from './slices/ui';

const appReducer = combineReducers({ auth, plant, process, devices, alarms, connection, commands, ui });

/** 로그아웃하거나 세션이 끝나면 모든 슬라이스를 처음 상태로 되돌린다. auth는 이어서 loggedOut이 된다. */
const rootReducer = (state: ReturnType<typeof appReducer> | undefined, action: UnknownAction) =>
  logoutUser.fulfilled.match(action) || sessionLost.match(action)
    ? appReducer(undefined, action)
    : appReducer(state, action);

export function createAppStore() {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ serializableCheck: true, immutableCheck: true }),
  });
  // 화질 단계와 홈 표시 모드가 바뀌면 기기에 기억해 둔다 (자동으로 고르는 중이면 기억한 값을 지운다)
  let savedMode = store.getState().ui.qualityMode;
  let savedAuto = store.getState().ui.qualityAuto;
  let savedChosen = store.getState().ui.qualityChosen;
  let savedHome = store.getState().ui.homeMode;
  store.subscribe(() => {
    const { qualityMode, qualityAuto, qualityChosen, homeMode } = store.getState().ui;
    if (qualityChosen !== savedChosen) {
      savedChosen = qualityChosen;
      saveQualityChosen(qualityChosen);
    }
    if (qualityMode !== savedMode || qualityAuto !== savedAuto) {
      savedMode = qualityMode;
      savedAuto = qualityAuto;
      saveQualityMode(qualityAuto ? null : qualityMode);
    }
    if (homeMode !== savedHome) {
      savedHome = homeMode;
      saveHomeMode(homeMode);
    }
  });
  return store;
}

export type AppStore = ReturnType<typeof createAppStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

/** 앱이 쓰는 store. 테스트는 createAppStore()로 새로 만든다. */
export const store = createAppStore();

export * from './slices/alarms';
export * from './slices/auth';
export * from './slices/commands';
export * from './slices/connection';
export * from './slices/devices';
export * from './slices/plant';
export * from './slices/process';
export * from './slices/ui';
