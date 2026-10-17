import { describe, expect, it } from 'vitest';
import { COMMAND_RULES } from '@ecocycle/shared';
import type { CommandType } from '@ecocycle/shared';
import { CONTROL_ORDER, CONTROL_TEXT, canUse, controlPlaces, controlsFor } from './controls';

const allTypes = Object.keys(COMMAND_RULES) as CommandType[];

describe('controls', () => {
  it('모든 명령에 표시 문구와 순서가 있다', () => {
    for (const type of allTypes) {
      expect(CONTROL_TEXT[type].label).toBeTruthy();
      expect(CONTROL_ORDER).toContain(type);
    }
    expect(new Set(CONTROL_ORDER).size).toBe(allTypes.length);
  });

  it('위험도가 높은 조작은 기기 페이지에만, 확인 문구가 있다', () => {
    for (const type of allTypes) {
      const high = COMMAND_RULES[type].risk === 'high';
      expect(controlPlaces(type).includes('quick')).toBe(!high);
      if (COMMAND_RULES[type].requiresConfirm) expect(CONTROL_TEXT[type].confirmMessage).toBeTruthy();
    }
  });

  it('로봇의 홈 조작은 시작·일시정지·재개·정지뿐이다', () => {
    expect(controlsFor('quick', 'robot')).toEqual(['start', 'pause', 'resume', 'stop']);
  });

  it('로봇 기기 페이지에는 위험 조작이 더해진다', () => {
    expect(controlsFor('devicePage', 'robot')).toEqual([
      'start',
      'pause',
      'resume',
      'stop',
      'set_mode',
      'pick_from',
      'place_on_conveyor',
      'update_setting',
    ]);
  });

  it('탱크에는 설정 변경만 있고 알람 확인은 알람 대상이다', () => {
    expect(controlsFor('devicePage', 'tank')).toEqual(['update_setting']);
    expect(controlsFor('quick', 'tank')).toEqual([]);
    expect(controlsFor('quick', 'alarm')).toEqual(['ack_alarm']);
  });

  it('권한 목록으로 버튼 활성 여부를 정한다', () => {
    expect(canUse(['robot.control'], 'start')).toBe(true);
    expect(canUse(['robot.control'], 'set_mode')).toBe(false);
    expect(canUse([], 'ack_alarm')).toBe(false);
    expect(canUse(['alarm.ack'], 'ack_alarm')).toBe(true);
  });
});
