import { describe, expect, it } from 'vitest';
import { createAppStore, qualityAutoRequested, qualityModeChanged, qualityProbed } from '../store';
import { PROBE_FPS_FOR_HIGH, PROBE_FPS_FOR_STANDARD, tierFromProbe } from './quality';

describe('자동 선택 (tierFromProbe)', () => {
  it('잰 프레임 수로 단계를 고른다', () => {
    expect(tierFromProbe(PROBE_FPS_FOR_STANDARD - 1, 8)).toBe('low');
    expect(tierFromProbe(PROBE_FPS_FOR_STANDARD, 8)).toBe('standard');
    expect(tierFromProbe(PROBE_FPS_FOR_HIGH - 1, 8)).toBe('standard');
    expect(tierFromProbe(PROBE_FPS_FOR_HIGH, 8)).toBe('high');
  });

  it('잴 수 없었으면 기본 단계로 둔다', () => {
    expect(tierFromProbe(null)).toBe('standard');
  });

  it('처리 코어가 2개 이하인 기기는 잘 나와도 고화질로 올리지 않는다', () => {
    expect(tierFromProbe(60, 2)).toBe('standard');
    expect(tierFromProbe(60, 4)).toBe('high');
    expect(tierFromProbe(60, undefined)).toBe('high');
  });
});

describe('화질 단계 기억', () => {
  it('고른 적이 없으면 자동이고, 측정 결과가 들어오면 그 값을 기억한다', () => {
    const store = createAppStore();
    expect(store.getState().ui).toMatchObject({ qualityMode: 'high', qualityAuto: true });
    store.dispatch(qualityProbed('high'));
    expect(store.getState().ui).toMatchObject({ qualityMode: 'high', qualityAuto: false });
    expect(localStorage.getItem('ecocycle.qualityMode')).toBe('high');
    expect(createAppStore().getState().ui).toMatchObject({ qualityMode: 'high', qualityAuto: false });
  });

  it('사용자가 직접 고른 뒤에 늦게 온 측정 결과는 무시한다', () => {
    const store = createAppStore();
    store.dispatch(qualityModeChanged('low'));
    store.dispatch(qualityProbed('high'));
    expect(store.getState().ui.qualityMode).toBe('low');
  });

  it('자동으로 다시 고르기를 누르면 기억한 값을 지운다', () => {
    const store = createAppStore();
    store.dispatch(qualityModeChanged('low'));
    store.dispatch(qualityAutoRequested());
    expect(store.getState().ui.qualityAuto).toBe(true);
    expect(localStorage.getItem('ecocycle.qualityMode')).toBeNull();
  });
});
