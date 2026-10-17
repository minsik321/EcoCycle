import { describe, expect, it } from 'vitest';
import { DEVICE_IDS, DEVICE_STATUSES, ROBOT_STATUSES } from '@ecocycle/shared';
import {
  DEVICE_NAMES,
  PHASE_STEPS,
  ROBOT_STATUS_TEXT,
  ROBOT_STATUS_TONE,
  STATUS_SYMBOL,
  STATUS_TEXT,
  formatLocalTime,
  formatPercent,
  formatPressureMpa,
  formatVolumeM3,
} from './display';

describe('display', () => {
  it('모든 상태에 글자와 기호가 있다 (색만으로 구분하지 않는다)', () => {
    for (const s of DEVICE_STATUSES) {
      expect(STATUS_TEXT[s]).toBeTruthy();
      expect(STATUS_SYMBOL[s]).toBeTruthy();
    }
    expect(new Set(DEVICE_STATUSES.map((s) => STATUS_SYMBOL[s])).size).toBe(DEVICE_STATUSES.length);
  });

  it('모든 로봇 상태에 문구와 색 대응이 있다', () => {
    for (const s of ROBOT_STATUSES) {
      expect(ROBOT_STATUS_TEXT[s]).toBeTruthy();
      expect(DEVICE_STATUSES).toContain(ROBOT_STATUS_TONE[s]);
    }
    expect(ROBOT_STATUS_TONE.error).toBe('alarm');
    expect(ROBOT_STATUS_TONE.offline).toBe('offline');
  });

  it('모든 기기에 표시 이름이 있다', () => {
    for (const id of DEVICE_IDS) expect(DEVICE_NAMES[id]).toBeTruthy();
  });

  it('단계 바는 집기·이동·놓기·압축 순서다', () => {
    expect(PHASE_STEPS.map((s) => s.label)).toEqual(['집기', '이동', '놓기', '압축']);
  });

  it('값은 소수 첫째 자리와 단위로 표시한다', () => {
    expect(formatPercent(72.4)).toBe('72.4%');
    expect(formatPercent(80)).toBe('80.0%');
    expect(formatVolumeM3(5.8)).toBe('5.8 m³');
    expect(formatPressureMpa(28.7)).toBe('28.7 MPa');
  });

  it('시각은 ISO 문자열을 현지 시각으로 바꾸고 잘못된 값은 -로 둔다', () => {
    expect(formatLocalTime('2026-10-13T05:23:11.250Z')).toMatch(/\d{2}\.\s?\d{2}\.\s?\d{2}:\d{2}:\d{2}/);
    expect(formatLocalTime(null)).toBe('-');
    expect(formatLocalTime('not-a-date')).toBe('-');
  });
});
