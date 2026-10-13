import { describe, expect, it } from 'vitest';
import { DEVICE_SETTINGS, validateSetting } from './settings';

const tank = DEVICE_SETTINGS.tank[0]!;

describe('validateSetting', () => {
  it('범위 안의 숫자는 통과한다 (경계 포함)', () => {
    expect(validateSetting(tank, '80')).toEqual({ value: 80 });
    expect(validateSetting(tank, ' 1 ')).toEqual({ value: 1 });
    expect(validateSetting(tank, '94')).toEqual({ value: 94 });
    expect(validateSetting(DEVICE_SETTINGS.compressor[0]!, '27.5')).toEqual({ value: 27.5 });
  });

  it('비었거나 숫자가 아니거나 범위를 벗어나면 안내 문구를 돌려준다', () => {
    expect(validateSetting(tank, '')).toHaveProperty('error');
    expect(validateSetting(tank, 'abc')).toEqual({ error: '숫자로 입력하세요.' });
    expect(validateSetting(tank, '0')).toEqual({ error: '1% ~ 94% 사이로 입력하세요.' });
    expect(validateSetting(tank, '95')).toEqual({ error: '1% ~ 94% 사이로 입력하세요.' });
    expect(validateSetting(tank, 'Infinity')).toHaveProperty('error');
  });

  it('모든 기기 종류에 설정 목록이 있고 범위가 올바르다', () => {
    for (const fields of Object.values(DEVICE_SETTINGS)) {
      for (const f of fields) {
        expect(f.min).toBeLessThan(f.max);
        expect(f.step).toBeGreaterThan(0);
        expect(f.help).toBeTruthy();
      }
    }
  });
});
