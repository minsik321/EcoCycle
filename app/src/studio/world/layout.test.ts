import { describe, expect, it } from 'vitest';
import { TANK_IDS } from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../../config/robotCycle';
import { inside } from './buildWorld';
import {
  BALE,
  BALE_AREAS,
  BALE_AREA_PX,
  BALE_REST,
  GATE,
  HOLD,
  OFFICE,
  PICK,
  PILES,
  PLACE,
  SCALE,
  SITE_ANCHORS,
  SITE_SCALE,
  TIP,
  YARD,
  centroid,
  sitePx,
  siteHeading,
  worldToPx,
  yardToWorld,
} from './layout';

// 위성사진 → 월드 변환(sitePx)은 닮음 변환 하나다: 로봇이 원점, 레일 방향이 θc, 같은 배율, 뒤집지 않음.

const DEG = Math.PI / 180;
const dir = (heading: number): [number, number] => [Math.cos(heading), -Math.sin(heading)];
const dot = (a: readonly [number, number], b: readonly [number, number]) => a[0] * b[0] + a[1] * b[1];
const sub = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]];

describe('사진 → 월드 변환 (sitePx)', () => {
  it('로봇 자리(사진 빨간 원)가 월드 원점이다', () => {
    const [x, z] = sitePx(...SITE_ANCHORS.robot);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it('로봇 → 레일이 건물로 들어가는 곳(사진 남서)의 방향이 레일 쪽 base 각도 θc의 3D 방향 (cos θc, −sin θc)이다', () => {
    const [x, z] = sitePx(...SITE_ANCHORS.railEntry);
    const len = Math.hypot(x, z);
    const [cx, cz] = dir(DEMO_CYCLE.conveyorBaseDeg * DEG);
    expect(x / len).toBeCloseTo(cx, 9);
    expect(z / len).toBeCloseTo(cz, 9);
  });

  it('배율은 어디서나 같다 (1px = SITE_SCALE) 그리고 되돌리면 같은 사진 좌표다', () => {
    const pairs: Array<[[number, number], [number, number]]> = [
      [[0, 0], [613, 0]],
      [[100, 500], [450, 40]],
      [[420, 233], [493, 261]],
    ];
    for (const [a, b] of pairs) {
      const wa = sitePx(...a);
      const wb = sitePx(...b);
      expect(Math.hypot(wb[0] - wa[0], wb[1] - wa[1])).toBeCloseTo(Math.hypot(b[0] - a[0], b[1] - a[1]) * SITE_SCALE, 9);
      const back = worldToPx(...wa);
      expect(back[0]).toBeCloseTo(a[0], 9);
      expect(back[1]).toBeCloseTo(a[1], 9);
    }
  });

  it('뒤집지 않는다: 사진에서 동 → 북으로 도는 방향이 월드에서도 같다 (회전만 했다)', () => {
    const o = sitePx(300, 300);
    const east = sub(sitePx(301, 300), o);
    const north = sub(sitePx(300, 299), o);
    // 사진 좌표(x 오른쪽, y 아래)에서 (1, 0) × (0, −1) = −1. 월드 (x, z)에서도 같은 부호여야 한다
    expect(Math.sign(east[0] * north[1] - east[1] * north[0])).toBe(-1);
    // 사진 방향 → 월드 방향은 한 각도만큼 돈 것이다
    expect(siteHeading(0, -1) - siteHeading(1, 0)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('북서 베일 구역은 남동 구역보다 북쪽·서쪽에 있다 (사진과 같은 방향)', () => {
    const nw = centroid(BALE_AREAS.nw);
    const se = centroid(BALE_AREAS.se);
    const north = dir(siteHeading(0, -1));
    const east = dir(siteHeading(1, 0));
    expect(dot(sub(nw, se), north)).toBeGreaterThan(5);
    expect(dot(sub(nw, se), east)).toBeLessThan(-2);
    // 사무실은 북동, 계근대는 사무실 바로 아래(남쪽), 입구는 계근대와 남동 구역 사이
    const office = OFFICE.center;
    expect(dot(sub(office, se), north)).toBeGreaterThan(10);
    expect(dot(sub(office, SCALE.center), north)).toBeGreaterThan(5);
    const gate = [(GATE.north[0] + GATE.south[0]) / 2, (GATE.north[1] + GATE.south[1]) / 2] as const;
    expect(dot(sub(gate, SCALE.center), north)).toBeLessThan(0);
    expect(dot(sub(gate, sitePx(...BALE_AREA_PX.se[0]!)), north)).toBeGreaterThan(0);
  });
});

describe('섹터 더미·레일은 로봇 관절 값에서 나온 자리에 맞춰 놓였다', () => {
  it('레일을 볼 때 오른쪽이 A(θc − 90°), 왼쪽이 C(θc + 90°)이고, 집는 자리는 각 더미 안에 있다', () => {
    const rail = dir(DEMO_CYCLE.conveyorBaseDeg * DEG);
    // 오른쪽 = 진행 방향을 시계 방향으로 90° 돌린 쪽 (위에서 볼 때)
    const right = dir((DEMO_CYCLE.conveyorBaseDeg - 90) * DEG);
    expect(TANK_BASE_DEG['sector-a']).toBe(DEMO_CYCLE.conveyorBaseDeg - 90);
    const a: [number, number] = [PICK['sector-a'][0], PICK['sector-a'][2]];
    const c: [number, number] = [PICK['sector-c'][0], PICK['sector-c'][2]];
    expect(dot(a, right)).toBeGreaterThan(2);
    expect(dot(c, right)).toBeLessThan(-2);
    expect(Math.abs(dot(a, rail))).toBeLessThan(0.1);
    for (const id of TANK_IDS) expect(inside([PICK[id][0], PICK[id][2]], PILES[id])).toBe(true);
    // A는 사진 북서의 갈색 더미, C는 남동의 흰 더미 쪽이다
    const north = dir(siteHeading(0, -1));
    expect(dot(sub(centroid(PILES['sector-a']), centroid(PILES['sector-c'])), north)).toBeGreaterThan(0);
    // 놓는 자리는 레일 방향
    expect(dot([PLACE[0], PLACE[2]], rail)).toBeGreaterThan(2);
  });

  it('트럭이 쏟는 자리는 더미 밖, 적재함 뒤가 더미 쪽이다', () => {
    for (const id of TANK_IDS) {
      const tip = TIP[id];
      expect(inside([tip.x, tip.z], PILES[id])).toBe(false);
      const back: [number, number] = [tip.x - Math.cos(tip.heading) * 2.2, tip.z + Math.sin(tip.heading) * 2.2];
      const toPile = sub(centroid(PILES[id]), [tip.x, tip.z]);
      expect(dot(sub(back, [tip.x, tip.z]), toPile)).toBeGreaterThan(0);
    }
  });
});

describe('남동 마당: 서버 베일 칸은 ㄴ자 구역 안에 있다', () => {
  it('모든 칸(네 모서리)과 지게차 대기 자리가 남동 구역 안이고, 상차 자리·배출구는 구역 밖이다', () => {
    const w = { x: 0, z: 0 };
    for (const x of YARD.slotXs) {
      for (const [dx, dz] of [
        [-BALE.w / 2, -BALE.d / 2],
        [BALE.w / 2, -BALE.d / 2],
        [-BALE.w / 2, BALE.d / 2],
        [BALE.w / 2, BALE.d / 2],
      ] as const) {
        yardToWorld(x + dx, YARD.slotZ + dz, w);
        expect(inside([w.x, w.z], BALE_AREAS.se)).toBe(true);
      }
    }
    for (const [hx, hz] of YARD.homes) {
      yardToWorld(hx, hz + 0.6, w);
      expect(inside([w.x, w.z], BALE_AREAS.se)).toBe(true);
    }
    expect(inside([HOLD.x, HOLD.z], BALE_AREAS.se)).toBe(false);
    expect(inside([BALE_REST[0], BALE_REST[2]], BALE_AREAS.se)).toBe(false);
    // 배출구는 사진의 압축기 건물 남동 모서리(165~190, 480~500px) 근처
    const [px, py] = worldToPx(BALE_REST[0], BALE_REST[2]);
    expect(px).toBeGreaterThan(160);
    expect(px).toBeLessThan(200);
    expect(py).toBeGreaterThan(475);
    expect(py).toBeLessThan(505);
  });
});
