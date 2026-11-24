// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RobotState, ServerMessage } from '@ecocycle/shared';
import {
  DEVICE_IDS,
  DEVICE_SEARCH_NAMES,
  PINNED_SECTORS_MAX,
  PINNED_SECTORS_MIN,
  TANK_IDS,
  deviceTypeOf,
  isValidPinnedSectors,
  matchesSearch,
  sectorSearchTerms,
} from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../config/robotCycle';
import { DEFAULT_ROBOT_MODEL } from '../config/robotModel';
import { DEVICE_NAMES } from '../config/display';
import { SECTOR_LABEL } from '../config/processDisplay';
import { ROBOT_MODEL } from '../../../mock-server/src/fixtures/robotModel';
import { demoPose } from '../studio/robot/jointSource';

// 섹터 2곳 계약 (명세 6절 "공통 규칙"의 기기 ID·섹터 이름, docs/decisions.md 2026-11-24 "실제 부지 배치와 섹터 2곳")

describe('섹터 2곳: 기기 ID와 이름', () => {
  it('기기 ID는 sector-a, sector-c, robot-1, conveyor-z, compressor-1이다', () => {
    expect(TANK_IDS).toEqual(['sector-a', 'sector-c']);
    expect(DEVICE_IDS).toEqual(['sector-a', 'sector-c', 'robot-1', 'conveyor-z', 'compressor-1']);
  });

  it('deviceTypeOf: sector-* 는 기기 종류 tank (ID 앞부분과 종류가 달라도)', () => {
    expect(deviceTypeOf('sector-a')).toBe('tank');
    expect(deviceTypeOf('sector-c')).toBe('tank');
    expect(deviceTypeOf('robot-1')).toBe('robot');
    expect(deviceTypeOf('conveyor-z')).toBe('conveyor');
    expect(deviceTypeOf('compressor-1')).toBe('compressor');
  });

  it('짧은 이름 A·C, 화면 이름 "섹터 A"·"섹터 C", 검색은 세 이름을 모두 찾는다', () => {
    expect(SECTOR_LABEL).toEqual({ 'sector-a': 'A', 'sector-c': 'C' });
    for (const id of TANK_IDS) {
      expect(DEVICE_NAMES[id]).toBe(`섹터 ${SECTOR_LABEL[id]}`);
      expect(DEVICE_SEARCH_NAMES[id]).toBe(DEVICE_NAMES[id]);
      const terms = sectorSearchTerms(id);
      expect(terms).toEqual([id, SECTOR_LABEL[id], DEVICE_NAMES[id]]);
      for (const q of terms) expect(matchesSearch(q, terms), q).toBe(true);
    }
    expect(matchesSearch('섹터 C', sectorSearchTerms('sector-a'))).toBe(false);
  });
});

describe('auto_pinned 지정 섹터: 중복 없는 유효 섹터 1~2개', () => {
  it('범위는 1~2개', () => {
    expect([PINNED_SECTORS_MIN, PINNED_SECTORS_MAX]).toEqual([1, 2]);
  });

  it.each([[['sector-a']], [['sector-c']], [['sector-a', 'sector-c']], [['sector-c', 'sector-a']]])('받는다: %j', (pins) => {
    expect(isValidPinnedSectors(pins)).toBe(true);
  });

  it.each([
    [[]],
    [['sector-a', 'sector-c', 'sector-a']],
    [['sector-a', 'sector-c', 'robot-1']],
    [['sector-a', 'sector-a']],
    [['tank-a1']],
    [['sector-b']],
    [null],
    ['sector-a'],
  ])('거부한다: %j', (pins) => {
    expect(isValidPinnedSectors(pins)).toBe(false);
  });
});

describe('로봇 집는 각도: 앱 설정과 모의 서버가 같다', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('레일 150°, A = 150 − 90 = 60°, C = 150 + 90 = 240°이고 모의 서버 값과 같다', async () => {
    const mock = await import('../../../mock-server/src/sim/robot');
    expect(DEMO_CYCLE.conveyorBaseDeg).toBe(150);
    expect(TANK_BASE_DEG).toEqual({ 'sector-a': 60, 'sector-c': 240 });
    expect(mock.TANK_BASE_DEG).toEqual(TANK_BASE_DEG);
    expect(mock.CONVEYOR_BASE_DEG).toBe(DEMO_CYCLE.conveyorBaseDeg);
  });

  it('base 관절 범위(앱 기본 모델·모의 서버 모델)가 두 섹터와 레일 각도를 모두 품는다', () => {
    for (const model of [DEFAULT_ROBOT_MODEL, ROBOT_MODEL]) {
      const base = model.joints[0]!;
      expect(base.name).toBe('base');
      for (const deg of [...Object.values(TANK_BASE_DEG), DEMO_CYCLE.conveyorBaseDeg]) {
        expect(deg).toBeGreaterThanOrEqual(base.minDeg);
        expect(deg).toBeLessThanOrEqual(base.maxDeg);
      }
    }
  });

  it('시연 동작: C(240°) ↔ 레일(150°)은 짧은 쪽으로 돌고 A(60°) 쪽을 지나지 않는다', () => {
    const cycle = DEMO_CYCLE.pickSec + DEMO_CYCLE.moveSec + DEMO_CYCLE.placeSec + DEMO_CYCLE.idleSec;
    const cIndex = TANK_IDS.indexOf('sector-c');
    for (let t = cIndex * cycle; t < (cIndex + 1) * cycle; t += 0.1) {
      const base = demoPose(t).joints[0]!;
      expect(base, `t=${t.toFixed(1)}`).toBeGreaterThanOrEqual(150 - 1e-9);
      expect(base, `t=${t.toFixed(1)}`).toBeLessThanOrEqual(240 + 1e-9);
    }
  });

  it('모의 서버 수동 집기·놓기: C에서 집어 레일에 놓고 다시 C로 갈 때 base가 150°~240° 사이로만 움직인다', async () => {
    const { devices } = await import('../../../mock-server/src/sim/state');
    const robot = await import('../../../mock-server/src/sim/robot');
    const { onMessage } = await import('../../../mock-server/src/sim/bus');
    const bases: number[] = [];
    onMessage((message: ServerMessage) => {
      if (message.type === 'robot.joints') bases.push(message.joints[0]!);
    });
    const state = devices['robot-1'] as RobotState;
    state.mode = 'manual';
    state.status = 'running';
    const advance = (seconds: number) => {
      for (let i = 0; i < seconds * 10; i++) {
        vi.advanceTimersByTime(100);
        robot.tickRobot();
      }
    };
    // 처음 자세(0°)에서 C로 가는 첫 집기는 빼고, 놓은 뒤(레일 위)부터 본다
    expect(robot.requestManualPick('sector-c', 'tester')).toBe(true);
    advance(20);
    expect(state.heldSectorId).toBe('sector-c');
    expect(robot.requestManualPlace('tester')).toBe(true);
    const from = bases.length;
    advance(25);
    expect(state.heldSectorId).toBeNull();
    expect(robot.requestManualPick('sector-c', 'tester')).toBe(true);
    advance(20);
    const path = bases.slice(from);
    expect(Math.min(...path)).toBeGreaterThanOrEqual(150 - 0.1);
    expect(Math.max(...path)).toBeLessThanOrEqual(240 + 0.1);
    expect(path).toContain(150);
    expect(path.at(-1)).toBe(240);
  });
});
