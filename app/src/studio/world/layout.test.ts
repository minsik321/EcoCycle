import { describe, expect, it } from 'vitest';
import { TANK_IDS } from '@ecocycle/shared';
import type { TankId } from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../../config/robotCycle';
import { roundedPath, samplePath } from '../sim/paths';
import type { P2, Pose } from '../sim/paths';
import {
  BALE,
  BALER_HOUSE,
  BALE_AREAS,
  BALE_AREA_PX,
  FORK_REACH,
  HOLD,
  HOLD_REVERSE,
  HOLD_TO_SCALE,
  OFFICE,
  PICK,
  PILES,
  PLACE,
  PLATEAU_PX,
  QUEUE,
  RAIL_FRAME,
  RAMP_PX,
  ROAD_TO_SCALE,
  SCALE,
  SCALE_REVERSE_IN,
  SCALE_REVERSE_OUT,
  SCALE_STOP,
  SCALE_STOP_EAST,
  SCALE_TO_HOLD,
  SCALE_TO_EXIT,
  EXIT_HOLD,
  SCALE_TO_QUEUE,
  SITE_ANCHORS,
  SITE_SCALE,
  SHED,
  TIP,
  TRUCK,
  TRUCK_IN,
  YARD,
  centroid,
  clampToSite,
  groundY,
  inside,
  railPx,
  sitePx,
  siteHeading,
  truckQueueToTip,
  truckReverse,
  truckTipToScale,
  truckToTip,
  worldToPx,
  yardToWorld,
  staticBaleCells,
} from './layout';

// 위성사진 → 월드 변환(sitePx)은 닮음 변환 하나다: 로봇이 원점, 레일 방향이 θc, 같은 배율, 뒤집지 않음.
// 그 위에 놓은 자리·경로를 트럭 외곽선(1.4배 모형, TRUCK)으로 견준다: 서 있는 자리끼리, 경로와 고정물이 겹치지 않는다.

const DEG = Math.PI / 180;
const dir = (heading: number): [number, number] => [Math.cos(heading), -Math.sin(heading)];
const dot = (a: readonly [number, number], b: readonly [number, number]) => a[0] * b[0] + a[1] * b[1];
const sub = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [a[0] - b[0], a[1] - b[1]];

/** 트럭 외곽선(바닥 직사각형의 네 모서리와 변 위 점들) */
function hull(p: Pose, grow = 0): P2[] {
  const hl = TRUCK.length / 2 + grow;
  const hw = TRUCK.width / 2 + grow;
  const [fx, fz] = dir(p.heading);
  const out: P2[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const a = -hl + (2 * hl * i) / 8;
    for (const b of [-hw, hw]) out.push([p.x + fx * a - fz * b, p.z + fz * a + fx * b]);
  }
  for (let i = 1; i < 4; i += 1) {
    const b = -hw + (2 * hw * i) / 4;
    for (const a of [-hl, hl]) out.push([p.x + fx * a - fz * b, p.z + fz * a + fx * b]);
  }
  return out;
}
/** 직사각형(자세) 안에 점이 있는가 */
function inRect(q: P2, p: Pose, grow = 0): boolean {
  const [fx, fz] = dir(p.heading);
  const dx = q[0] - p.x;
  const dz = q[1] - p.z;
  return Math.abs(dx * fx + dz * fz) <= TRUCK.length / 2 + grow && Math.abs(-dx * fz + dz * fx) <= TRUCK.width / 2 + grow;
}
/** 트럭 외곽선이 다각형과 겹치는가 (외곽선 점이 안에 있거나 다각형 꼭짓점이 트럭 안에 있다) */
function hullHits(p: Pose, poly: readonly P2[]): boolean {
  return hull(p).some((q) => inside(q, poly)) || poly.some((q) => inRect(q, p));
}
function rectsHit(a: Pose, b: Pose): boolean {
  return hull(a).some((q) => inRect(q, b)) || hull(b).some((q) => inRect(q, a));
}
/** 경로를 0.2 간격으로 따라가는 트럭 자세들 */
function sweep(points: readonly P2[], reverse = false, radius = 1.3): Pose[] {
  const path = roundedPath(points, radius);
  const out: Pose[] = [];
  for (let s = 0; s <= path.total; s += 0.2) out.push({ ...samplePath(path, s, { x: 0, z: 0, heading: 0 }, reverse) });
  return out;
}
const box = (cx: number, cz: number, w: number, d: number, rot: number): P2[] => {
  const [fx, fz] = dir(rot);
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([a, b]) => [cx + fx * a! - fz * b!, cz + fz * a! + fx * b!] as P2);
};
const HOUSE = [BALER_HOUSE.main, BALER_HOUSE.annex].map((h) => [railPx(h.u0, h.w0), railPx(h.u0, h.w1), railPx(h.u1, h.w1), railPx(h.u1, h.w0)]);
const OFFICE_POLY = box(OFFICE.center[0], OFFICE.center[1], OFFICE.w, OFFICE.d, siteHeading(1, 0));
const SHED_POLY = box(SHED.center[0], SHED.center[1], SHED.w, SHED.d, siteHeading(1, 0));
const FIXED: Record<string, readonly P2[]> = {
  '섹터 A 더미': PILES['sector-a'],
  '섹터 C 더미': PILES['sector-c'],
  '북서 적치 구역': BALE_AREAS.nw,
  '남동 적치 구역': BALE_AREAS.se,
  '압축기 본동': HOUSE[0]!,
  '압축기 옆동': HOUSE[1]!,
  사무실: OFFICE_POLY,
  '흰 창고': SHED_POLY,
};

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

  it('배율은 어디서나 같다 (1px = SITE_SCALE = 0.072, 위성사진 실측) 그리고 되돌리면 같은 사진 좌표다', () => {
    expect(SITE_SCALE).toBe(0.072);
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
    expect(Math.sign(east[0] * north[1] - east[1] * north[0])).toBe(-1);
    expect(siteHeading(0, -1) - siteHeading(1, 0)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('크기 비율: 베일 줄 간격이 사진(13.3 × 13.8px)과 ±3% 안, 트럭(56px)은 계근대(67px) 안에 들어간다', () => {
    expect((BALE.w + 0.06) / SITE_SCALE / 13.3).toBeCloseTo(1, 1);
    expect(Math.abs((BALE.d + 0.06) / SITE_SCALE / 13.8 - 1)).toBeLessThan(0.03);
    expect(TRUCK.length).toBeLessThan(SCALE.length);
    expect(TRUCK.length / SITE_SCALE).toBeGreaterThan(52);
  });

  it('북서 베일 구역은 남동 구역보다 북쪽·서쪽, 사무실은 북동, 계근대는 사무실 바로 아래, 입구 경사로는 계근대와 남동 구역 사이', () => {
    const nw = centroid(BALE_AREAS.nw);
    const se = centroid(BALE_AREAS.se);
    const north = dir(siteHeading(0, -1));
    const east = dir(siteHeading(1, 0));
    expect(dot(sub(nw, se), north)).toBeGreaterThan(5);
    expect(dot(sub(nw, se), east)).toBeLessThan(-2);
    expect(dot(sub(OFFICE.center, se), north)).toBeGreaterThan(10);
    expect(dot(sub(OFFICE.center, SCALE.center), north)).toBeGreaterThan(5);
    const ramp = centroid(RAMP_PX.map(([x, y]) => sitePx(x, y)));
    expect(dot(sub(ramp, SCALE.center), north)).toBeLessThan(0);
    expect(dot(sub(ramp, sitePx(...BALE_AREA_PX.se[0]!)), north)).toBeGreaterThan(0);
  });
});

describe('지형: 마당·계근대 단은 도로보다 높고, 도로는 남쪽으로 오른다', () => {
  it('마당은 높이 0, 도로는 북쪽이 가장 낮고 남쪽으로 오르며, 경사로는 그 사이다', () => {
    expect(groundY(...SCALE.center)).toBe(0);
    expect(groundY(0, 0)).toBe(0);
    const north = groundY(...sitePx(590, 10));
    const atRamp = groundY(...sitePx(528, 306));
    const south = groundY(...sitePx(470, 470));
    expect(north).toBeLessThan(-1.2);
    expect(north).toBeLessThan(atRamp);
    expect(atRamp).toBeLessThan(south);
    expect(south).toBeLessThan(0);
    const mid = groundY(...sitePx(498, 306));
    expect(mid).toBeLessThan(0);
    expect(mid).toBeGreaterThan(atRamp);
  });
});

describe('섹터 더미·레일은 로봇 관절 값에서 나온 자리에 맞춰 놓였다', () => {
  it('레일을 볼 때 오른쪽이 A(θc − 90°), 왼쪽이 C(θc + 90°)이고, 집는 자리는 각 더미 안에 있다', () => {
    const rail = dir(DEMO_CYCLE.conveyorBaseDeg * DEG);
    const right = dir((DEMO_CYCLE.conveyorBaseDeg - 90) * DEG);
    expect(TANK_BASE_DEG['sector-a']).toBe(DEMO_CYCLE.conveyorBaseDeg - 90);
    const a: [number, number] = [PICK['sector-a'][0], PICK['sector-a'][2]];
    const c: [number, number] = [PICK['sector-c'][0], PICK['sector-c'][2]];
    expect(dot(a, right)).toBeGreaterThan(2);
    expect(dot(c, right)).toBeLessThan(-2);
    expect(Math.abs(dot(a, rail))).toBeLessThan(0.1);
    for (const id of TANK_IDS) expect(inside([PICK[id][0], PICK[id][2]], PILES[id])).toBe(true);
    const north = dir(siteHeading(0, -1));
    expect(dot(sub(centroid(PILES['sector-a']), centroid(PILES['sector-c'])), north)).toBeGreaterThan(0);
    expect(dot([PLACE[0], PLACE[2]], rail)).toBeGreaterThan(2);
  });

  it('섹터 대칭: 두 더미(중심·윤곽)와 쏟는 자리가 레일 축에 거울 대칭이다 (축까지 거리 차·레일 방향 성분 차 0.1m 이하)', () => {
    const u = RAIL_FRAME.u;
    const w = RAIL_FRAME.w;
    const [ca, cc] = [centroid(PILES['sector-a']), centroid(PILES['sector-c'])];
    expect(Math.abs(Math.abs(dot(ca, w)) - Math.abs(dot(cc, w)))).toBeLessThan(0.1);
    expect(Math.abs(dot(ca, u) - dot(cc, u))).toBeLessThan(0.1);
    expect(dot(ca, w)).toBeLessThan(0);
    expect(dot(cc, w)).toBeGreaterThan(0);
    PILES['sector-a'].forEach((p, i) => {
      const q = PILES['sector-c'][i]!;
      expect(dot(p, u)).toBeCloseTo(dot(q, u), 6);
      expect(dot(p, w)).toBeCloseTo(-dot(q, w), 6);
    });
    const ta: P2 = [TIP['sector-a'].x, TIP['sector-a'].z];
    const tc: P2 = [TIP['sector-c'].x, TIP['sector-c'].z];
    expect(dot(ta, u)).toBeCloseTo(dot(tc, u), 6);
    expect(dot(ta, w)).toBeCloseTo(-dot(tc, w), 6);
  });

  it('더미 윤곽은 레일·옆동·건물과 겹치지 않는다 (외곽 기준)', () => {
    for (const id of TANK_IDS) {
      for (const house of HOUSE) {
        expect(PILES[id].some((p) => inside(p, house))).toBe(false);
        expect(house.some((p) => inside(p, PILES[id]))).toBe(false);
      }
      // 레일(폭 0.95, 레일 축 w = 0)과 0.3m 넘게 떨어져 있다
      expect(Math.min(...PILES[id].map((p) => Math.abs(dot(p, RAIL_FRAME.w))))).toBeGreaterThan(0.47 + 0.3);
    }
  });

  it('트럭이 쏟는 자리는 더미 밖, 적재함 뒤가 더미 쪽이다', () => {
    for (const id of TANK_IDS) {
      const tip = TIP[id];
      expect(hullHits(tip, PILES[id])).toBe(false);
      const back: [number, number] = [tip.x - Math.cos(tip.heading) * 2.2, tip.z + Math.sin(tip.heading) * 2.2];
      const toPile = sub(centroid(PILES[id]), [tip.x, tip.z]);
      expect(dot(sub(back, [tip.x, tip.z]), toPile)).toBeGreaterThan(0);
    }
  });
});

describe('트럭 자리·경로 (1.4배 트럭의 외곽선 기준)', () => {
  const SPOTS: Record<string, Pose> = { '쏟는 자리 A': TIP['sector-a'], '쏟는 자리 C': TIP['sector-c'], '대기 자리': QUEUE, '상차 자리': HOLD, 계근대: SCALE_STOP, '출차 대기': EXIT_HOLD };

  it('서 있는 자리(쏟는 자리 둘·대기·상차·계근대)는 서로, 그리고 더미·적치 구역·건물·사무실·트레일러와 겹치지 않는다', () => {
    const names = Object.keys(SPOTS);
    names.forEach((a, i) => {
      for (const b of names.slice(i + 1)) expect(rectsHit(SPOTS[a]!, SPOTS[b]!), `${a} × ${b}`).toBe(false);
      for (const [name, poly] of Object.entries(FIXED)) expect(hullHits(SPOTS[a]!, poly), `${a} × ${name}`).toBe(false);
    });
  });

  it('계근대 위 트럭은 노란 테두리 안에 다 들어간다 (서쪽을 볼 때·동쪽을 볼 때)', () => {
    for (const p of [SCALE_STOP, SCALE_STOP_EAST]) {
      const scale = box(SCALE.center[0], SCALE.center[1], SCALE.length + 0.05, SCALE.width + 0.4, SCALE.heading);
      expect(hull(p).every((q) => inside(q, scale))).toBe(true);
    }
  });

  const parkedExcept = (skip: string[]): Array<[string, Pose]> => Object.entries(SPOTS).filter(([k]) => !skip.includes(k));
  const PATHS: Array<[string, P2[], boolean, string[]]> = [
    ['도로 → 경사로 → 계근대 서쪽', ROAD_TO_SCALE, false, ['계근대']],
    ['후진으로 계근대에 오름', SCALE_REVERSE_IN, true, ['계근대']],
    ['계근대 → 더미 A 앞', truckToTip('sector-a'), false, ['계근대', '쏟는 자리 A']],
    ['더미 A로 후진', truckReverse('sector-a'), true, ['쏟는 자리 A']],
    ['계근대 → 더미 C 앞', truckToTip('sector-c'), false, ['계근대', '쏟는 자리 C']],
    ['더미 C로 후진', truckReverse('sector-c'), true, ['쏟는 자리 C']],
    ['계근대 → 대기 자리', SCALE_TO_QUEUE, false, ['계근대', '대기 자리']],
    ['대기 자리 → 더미 A 앞', truckQueueToTip('sector-a'), false, ['대기 자리', '쏟는 자리 A']],
    ['대기 자리 → 더미 C 앞', truckQueueToTip('sector-c'), false, ['대기 자리', '쏟는 자리 C']],
    ['더미 A → 계근대(출차 계근)', truckTipToScale('sector-a'), false, ['쏟는 자리 A', '계근대']],
    ['더미 C → 계근대(출차 계근)', truckTipToScale('sector-c'), false, ['쏟는 자리 C', '계근대']],
    ['후진으로 계근대에서 내려옴', SCALE_REVERSE_OUT, true, ['계근대']],
    ['계근대 → 경사로 위 출차 대기', SCALE_TO_EXIT, false, ['계근대', '출차 대기']],
    ['계근대 → 상차 자리', SCALE_TO_HOLD, false, ['계근대', '상차 자리']],
    ['상차 자리에서 후진', HOLD_REVERSE, true, ['상차 자리']],
    ['상차 뒤 계근대로', HOLD_TO_SCALE, false, ['상차 자리', '계근대']],
  ];

  it.each(PATHS)('%s: 지나는 동안 트럭 외곽선이 더미·적치 구역·건물에 닿지 않는다', (_name, points, reverse) => {
    for (const p of sweep(points, reverse)) {
      for (const [name, poly] of Object.entries(FIXED)) expect(hullHits(p, poly), `${name} @ ${worldToPx(p.x, p.z).map((v) => v.toFixed(0))}`).toBe(false);
    }
  });

  it('쏟는 자리·상차 자리에 선 차는 다른 길을 막지 않는다 (마당 차례로 나누지 않는 길: 도로 → 계근대, 계근대 오르내림, 출차)', () => {
    const free = PATHS.filter(([name]) => ['도로 → 경사로 → 계근대 서쪽', '후진으로 계근대에 오름', '후진으로 계근대에서 내려옴', '계근대 → 경사로 위 출차 대기'].includes(name));
    for (const [name, points, reverse, skip] of free) {
      for (const p of sweep(points, reverse)) {
        // (출차 대기 자리의 차는 계근대 차례를 쥐고 있어 들어오는 차와 함께 있지 않다)
        for (const [spot, pose] of parkedExcept([...skip, '대기 자리', '출차 대기'])) expect(rectsHit(p, pose), `${name} × ${spot}`).toBe(false);
      }
    }
  });

  it('계근대는 마당 쪽에서만 오르내린다: 어느 경로도 계근대 동쪽 끝(옹벽)을 넘지 않는다', () => {
    const scale = box(SCALE.center[0], SCALE.center[1], SCALE.length + 0.6, SCALE.width + 1.2, SCALE.heading);
    for (const [, points, reverse] of PATHS) {
      for (const p of sweep(points, reverse)) {
        if (!hull(p).some((q) => inside(q, scale))) continue;
        expect(Math.max(...hull(p).map((q) => worldToPx(q[0], q[1])[0]))).toBeLessThan(496);
      }
    }
  });

  it('차가 드나드는 곳은 입구 경사로 하나다: 도로와 마당 사이를 넘는 곳은 모두 경사로 안이다', () => {
    const ramp = RAMP_PX.map(([x, y]) => sitePx(x, y));
    const ins = (p: P2) => inside(worldToPx(p[0], p[1]), PLATEAU_PX);
    for (const points of [TRUCK_IN, ROAD_TO_SCALE, SCALE_TO_EXIT]) {
      const poses = sweep(points);
      for (let i = 1; i < poses.length; i += 1) {
        const a: P2 = [poses[i - 1]!.x, poses[i - 1]!.z];
        const b: P2 = [poses[i]!.x, poses[i]!.z];
        if (ins(a) !== ins(b)) expect(inside(a, ramp) || inside(b, ramp), `${worldToPx(...b).map((v) => v.toFixed(0))}`).toBe(true);
      }
    }
  });
});

describe('베일 칸·받침대·저울·지게차 길 (마당 좌표계)', () => {
  const corners = (x: number, z: number): P2[] => {
    const w = { x: 0, z: 0 };
    return [
      [-BALE.w / 2, -BALE.d / 2],
      [BALE.w / 2, -BALE.d / 2],
      [-BALE.w / 2, BALE.d / 2],
      [BALE.w / 2, BALE.d / 2],
    ].map(([dx, dz]) => {
      yardToWorld(x + dx!, z + dz!, w);
      return [w.x, w.z] as P2;
    });
  };

  it('남동 칸은 모두 남동 구역 안, 북서 칸은 모두 북서 구역 안이다 (네 모서리)', () => {
    for (const x of YARD.seXs) for (const c of corners(x, YARD.slotZ)) expect(inside(c, BALE_AREAS.se)).toBe(true);
    for (const x of YARD.nwXs) for (const c of corners(x, YARD.nwSlotZ)) expect(inside(c, BALE_AREAS.nw)).toBe(true);
  });

  it('받침대는 압축기 건물 남동 벽 배출구(사진 165~215, 480~525px)에서 마당 쪽으로 나오고, 저울은 그 마당 쪽 곁에 있다', () => {
    const w = { x: 0, z: 0 };
    for (const z of YARD.stand.slots) {
      yardToWorld(YARD.stand.x, z, w);
      const [px, py] = worldToPx(w.x, w.z);
      expect(px).toBeGreaterThan(165);
      expect(px).toBeLessThan(215);
      expect(py).toBeGreaterThan(480);
      expect(py).toBeLessThan(525);
      expect(inside([w.x, w.z], BALE_AREAS.se)).toBe(false);
    }
    yardToWorld(YARD.scale.x, YARD.scale.z, w);
    expect(HOUSE.some((h) => inside([w.x, w.z], h))).toBe(false);
    for (const id of TANK_IDS as readonly TankId[]) expect(inside([w.x, w.z], PILES[id])).toBe(false);
    // 저울은 받침대보다 마당 쪽(레일 축 반대, 북동)이다
    expect(YARD.scale.x).toBeGreaterThan(YARD.stand.x);
  });

  it('칸 앞 자리의 지게차는 길에 걸치지 않는다 (칸·길 사이 거리)', () => {
    expect(YARD.slotZ - YARD.laneZ - FORK_REACH - 0.62 * 1.15).toBeGreaterThan(0.6);
    expect(YARD.nwLaneZ - YARD.nwSlotZ - FORK_REACH - 0.62 * 1.15).toBeGreaterThan(0.6);
  });
});

describe('카메라가 보는 점은 부지 밖으로 나가지 않는다 (clampToSite)', () => {
  it('부지 밖 먼 점은 사진 사각형 가장자리로 들어오고, 안의 점은 그대로다', () => {
    const out = { x: 0, z: 0 };
    for (const [x, z] of [
      [43.56, 41.15],
      [-80, 5],
      [5, -80],
      [200, 200],
    ] as const) {
      clampToSite(x, z, out);
      const [px, py] = worldToPx(out.x, out.z);
      expect(px).toBeGreaterThanOrEqual(-1e-6);
      expect(px).toBeLessThanOrEqual(613 + 1e-6);
      expect(py).toBeGreaterThanOrEqual(-1e-6);
      expect(py).toBeLessThanOrEqual(616 + 1e-6);
    }
    const [ix, iz] = sitePx(300, 300);
    clampToSite(ix, iz, out);
    expect(out.x).toBeCloseTo(ix, 9);
    expect(out.z).toBeCloseTo(iz, 9);
  });
});

describe('남동 베일 벽 (바탕 베일 + 칸 줄)', () => {
  it('울타리 쪽 긴 변을 따라 끊기지 않고 이어지며 4~5단이다', () => {
    const se = staticBaleCells('se');
    expect(se.every((c) => c.levels >= 4 && c.levels <= 5)).toBe(true);
    // 칸 줄 뒤(울타리 쪽) 한 줄: 칸 줄 7열 모두 뒤가 채워져 있다
    for (const x of YARD.seXs) expect(se.some((c) => Math.abs(c.x - x) < 0.01 && c.z > YARD.slotZ + 0.5), `칸 x=${x.toFixed(2)} 뒤`).toBe(true);
    // 칸 줄 서쪽 끝 너머도 같은 줄로 이어진다
    expect(se.some((c) => c.x < YARD.seXs[0]! - 0.5 && Math.abs(c.z - YARD.slotZ) < 0.01)).toBe(true);
    // 벽은 지게차 길(칸 줄 앞)을 막지 않는다
    expect(se.every((c) => !(c.x > YARD.laneStart && c.x < YARD.laneEnd && c.z < YARD.slotZ - 0.5 && c.z > YARD.laneZ - 2))).toBe(true);
  });
});
