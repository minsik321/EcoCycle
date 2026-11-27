import { Group, MeshPhysicalMaterial } from 'three';
import type { Mesh } from 'three';
import { C } from '../theme';
import { Kit, MAT } from '../three/kit';
import { BALE, LOAD_BED_REAR, LOAD_TRUCK } from '../world/layout';
import { bale as baleParts } from '../world/props';

// 움직이는 것들의 모형. 움직이는 마디(적재함·바퀴·포크·팔다리)마다 그룹을 따로 만들어 돌려준다.
// 모두 +X를 앞으로 보고, 원점은 바닥 중심이다.

const WHEEL_R = 0.26;

export function wheel(radius = WHEEL_R, width = 0.2): Group {
  const k = new Kit('clay');
  k.cyl(C.rubber, radius, width, [0, 0, 0], { axis: 'z', seg: 22 });
  k.cyl(C.rubber, radius * 0.94, width + 0.03, [0, 0, 0], { axis: 'z', seg: 22 });
  k.cyl(C.steelLight, radius * 0.56, width + 0.045, [0, 0, 0], { axis: 'z', seg: 16, mat: 'metal' });
  k.cyl(C.dark, radius * 0.2, width + 0.06, [0, 0, 0], { axis: 'z', seg: 10 });
  // 굴러가는 것이 보이도록 휠에 볼트를 박는다
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    k.cyl(C.dark, radius * 0.07, width + 0.055, [Math.cos(a) * radius * 0.38, Math.sin(a) * radius * 0.38, 0], { axis: 'z', seg: 6 });
  }
  return k.build();
}

export interface TruckModel {
  root: Group;
  bed: Group;
  gate: Group;
  load: Group;
  /** 상차 차량(낮은 카고)의 양쪽 옆판 (덤프는 빈 배열): 바닥판 옆 아래 모서리에 매달려 바깥 아래로 내려간다 */
  sides: Group[];
  wheels: Group[];
  beacon: Group;
  /** 적재함이 도는 축의 위치 (트럭 좌표) */
  pivot: [number, number, number];
  /** 띠의 재질 (트럭마다 하나). 색은 Actors가 정하고 번호판 인식 전후로 같다(TRUCK_STRIPE, S2n) */
  stripe: MeshPhysicalMaterial;
}

/** 흰 꼭짓점 색으로 조립한 띠에 트럭 전용 재질을 입힌다 (재질 색이 곧 띠 색) */
export function stripeGroup(k: Kit, material: MeshPhysicalMaterial): Group {
  const group = k.build();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.material = material;
  });
  return group;
}

// 운전석은 안전 노랑, 적재함은 차마다 몇 가지 색 (첫 스튜디오 시안의 색). 회사 띠는 운전석 아래와 적재함 옆에 그대로 둔다
const BED_PAINTS = [C.steelLight, C.blue, C.wall, C.blueSoft];
const CAB_PAINT = C.yellow;

/**
 * 입고 트럭(덤프, 모형 크기: 장면에서는 축마다 TRUCK.sx·sy·sz배로 그린다): 들리는 적재함, 노랑 운전석.
 * 상차 차량은 buildCargoTruck(25톤 카고)
 */
export function buildTruck(variant: number): TruckModel {
  const root = new Group();
  const k = new Kit('gloss');

  // 차대
  k.box(C.dark, [2.72, 0.14, 0.62], [0, 0.3, 0], { r: 0.04, mat: 'clay' });
  k.box(C.dark, [0.2, 0.2, 1.0], [-1.0, 0.24, 0], { r: 0.05, mat: 'clay' });
  k.cyl(C.steelLight, 0.15, 0.55, [0.12, 0.33, 0.47], { axis: 'x', mat: 'metal' });
  k.box(C.dark, [0.3, 0.22, 0.2], [0.1, 0.24, -0.47], { r: 0.05, mat: 'clay' });
  // 뒷바퀴 흙받이: 적재함 바닥(0.5~0.58) 두께 안에 둔다. 전에는 0.62까지 올라와 빈 적재함 바닥에 검은 띠로 비쳤다(S2n)
  for (const dz of [-0.5, 0.5]) k.box(C.dark, [1.12, 0.045, 0.26], [-0.8, 0.525, dz], { r: 0.02, mat: 'clay' });

  const stripe = (MAT.gloss as MeshPhysicalMaterial).clone();
  const band = new Kit('gloss');

  // 운전석 (노랑) + 아래쪽 회사 띠
  k.box(CAB_PAINT, [0.92, 0.98, 1.12], [1.0, 0.38, 0], { r: 0.16, seg: 5 });
  band.box(C.white, [0.96, 0.2, 1.16], [1.0, 0.36, 0], { r: 0.08, seg: 3 });
  k.box(C.dark, [0.06, 0.4, 0.92], [1.44, 0.82, 0], { r: 0.03, mat: 'clay' });
  k.box(C.glass, [0.03, 0.34, 0.86], [1.468, 0.85, 0], { r: 0.015, mat: 'glass' });
  for (const dz of [-1, 1]) {
    k.box(C.dark, [0.5, 0.34, 0.04], [1.08, 0.84, dz * 0.55], { r: 0.02, mat: 'clay' });
    k.box(C.glass, [0.46, 0.3, 0.03], [1.08, 0.86, dz * 0.565], { r: 0.015, mat: 'glass' });
    // 거울
    k.box(C.dark, [0.04, 0.04, 0.18], [1.36, 1.0, dz * 0.64], { r: 0.015, mat: 'clay' });
    k.box(C.dark, [0.05, 0.24, 0.1], [1.38, 0.86, dz * 0.74], { r: 0.025, mat: 'clay' });
    // 전조등, 방향등
    k.box('#fff6d6', [0.04, 0.1, 0.22], [1.462, 0.5, dz * 0.36], { r: 0.02, mat: 'glow', glow: 2.2 });
    k.box(C.amber, [0.04, 0.06, 0.08], [1.462, 0.52, dz * 0.52], { r: 0.015, mat: 'glow', glow: 1.4 });
    // 발판
    k.box(C.dark, [0.4, 0.05, 0.12], [1.0, 0.3, dz * 0.6], { r: 0.02, mat: 'clay' });
  }
  k.box(C.dark, [0.05, 0.2, 0.56], [1.455, 0.56, 0], { r: 0.02, mat: 'clay' });
  k.box(C.steelLight, [0.14, 0.16, 1.16], [1.44, 0.24, 0], { r: 0.05, mat: 'metal' });
  k.box(C.white, [0.02, 0.09, 0.3], [1.515, 0.29, 0], { r: 0.01, mat: 'clay' });
  // 지붕 바람막이, 배기관
  k.box(C.yellowDeep, [0.5, 0.12, 0.96], [0.9, 1.34, 0], { r: 0.05, seg: 3 });
  k.cyl(C.steelLight, 0.045, 0.9, [0.5, 0.62, 0.44], { mat: 'metal', seg: 10 });
  k.cyl(C.dark, 0.05, 0.08, [0.5, 1.5, 0.44], { mat: 'clay', seg: 10 });
  // 후미등, 번호판
  for (const dz of [-0.4, 0.4]) k.box(C.red, [0.04, 0.08, 0.14], [-1.38, 0.34, dz], { r: 0.02, mat: 'glow', glow: 1.5 });
  k.box(C.white, [0.02, 0.09, 0.3], [-1.385, 0.36, 0], { r: 0.01, mat: 'clay' });
  root.add(k.build('truck-body'));
  root.add(stripeGroup(band, stripe));

  // 경광등 (움직일 때 깜빡인다)
  const beaconKit = new Kit('glow');
  beaconKit.cyl(C.amber, 0.05, 0.07, [1.1, 1.36, 0.3], { seg: 10, glow: 3 });
  const beacon = beaconKit.build();
  root.add(beacon);

  // 바퀴 여섯 개
  const wheels: Group[] = [];
  for (const [x, z] of [[1.0, 0.5], [1.0, -0.5], [-0.52, 0.5], [-0.52, -0.5], [-1.08, 0.5], [-1.08, -0.5]] as const) {
    const w = wheel();
    w.position.set(x, WHEEL_R, z);
    root.add(w);
    wheels.push(w);
  }

  // 적재함: 꼬리 아래 모서리를 축으로 들린다
  const pivot: [number, number, number] = [-1.42, 0.5, 0];
  const bed = new Group();
  bed.position.set(...pivot);
  const paint = BED_PAINTS[variant % BED_PAINTS.length]!;
  const b = new Kit('gloss');
  const bedBand = new Kit('gloss');
  const L = 1.9;
  b.box(paint, [L, 0.08, 1.14], [L / 2, 0, 0], { r: 0.03 });
  for (const dz of [-0.55, 0.55]) {
    b.box(paint, [L, 0.62, 0.06], [L / 2, 0.06, dz], { r: 0.025 });
    b.box(C.white, [L + 0.02, 0.07, 0.09], [L / 2, 0.64, dz], { r: 0.03 });
    bedBand.box(C.white, [L - 0.1, 0.13, 0.03], [L / 2, 0.22, dz * 1.06], { r: 0.012 });
  }
  b.box(paint, [0.07, 0.78, 1.14], [L - 0.035, 0.06, 0], { r: 0.03 });
  b.box(C.white, [0.3, 0.06, 1.14], [L + 0.08, 0.8, 0], { r: 0.025 });
  b.box(C.dark, [1.2, 0.1, 0.5], [L / 2, -0.08, 0], { r: 0.03, mat: 'clay' });
  bed.add(b.build('truck-bed'));
  bed.add(stripeGroup(bedBand, stripe));

  // 뒷문: 위쪽 경첩에 매달려 기울이면 열린다
  const gate = new Group();
  gate.position.set(0.02, 0.7, 0);
  const g = new Kit('gloss');
  g.box(paint, [0.05, 0.62, 1.1], [0, -0.64, 0], { r: 0.02 });
  g.box(C.white, [0.06, 0.07, 1.14], [0, -0.06, 0], { r: 0.025 });
  gate.add(g.build());
  bed.add(gate);

  // 실린 파지 더미
  const load = new Group();
  const p = new Kit('clay');
  const tones = [C.kraft, C.kraftLight, C.paper, C.kraftDark, C.paperGrey, C.kraftLight];
  let seed = 7 + variant * 13;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  p.box(C.kraft, [L - 0.2, 0.42, 0.98], [L / 2, 0.06, 0], { r: 0.12, seg: 3 });
  for (let i = 0; i < 26; i += 1) {
    const s = 0.16 + rnd() * 0.16;
    p.box(tones[i % tones.length]!, [s * 1.3, s * 0.7, s], [0.2 + rnd() * (L - 0.45), 0.4 + rnd() * 0.22, (rnd() - 0.5) * 0.82], { r: 0.035, rot: [rnd() * 0.8, rnd() * 3, rnd() * 0.8] });
  }
  load.add(p.build('truck-load'));
  bed.add(load);
  root.add(bed);

  return { root, bed, gate, load, sides: [], wheels, beacon, pivot, stripe };
}

/**
 * 상차 트럭: 25톤 카고(대형, S2j). 월드 단위로 바로 만든다(배율 1): 길이 LOAD_TRUCK.length, 폭 LOAD_TRUCK.width, 운전석 지붕 LOAD_TRUCK.height.
 * 흰 운전석(앞 두 축) + 낮은 적재함(뒤 두 축): 바닥판(윗면 LOAD_TRUCK.deckY) · 앞 가림판 · 아래 경첩으로 내려가는 옆판(양쪽 세 쪽씩) · 낮은 뒷문.
 * 지붕·벽이 없어 실린 베일(Bales가 그린다)이 늘 보인다. 모두 +X를 앞으로 보고, 원점은 바닥 중심이다
 */
export function buildCargoTruck(variant: number): TruckModel {
  void variant;
  const root = new Group();
  const k = new Kit('gloss');
  const { length: TL, width: TW, height: TH, bedLength: BL, bedWidth: BW, deckY: DY } = LOAD_TRUCK;
  const front = TL / 2;
  const rearX = LOAD_BED_REAR;
  const cabL = 0.95;
  const cabX0 = front - cabL;
  const wr = 0.27;
  const halfW = TW / 2;

  // 차대: 긴 두 줄 + 가로대
  for (const dz of [-0.3, 0.3]) k.box(C.dark, [TL - 0.3, 0.14, 0.1], [0, 0.34, dz], { r: 0.03, mat: 'clay' });
  for (let i = 0; i < 6; i += 1) k.box(C.dark, [0.08, 0.1, 0.62], [rearX + 0.4 + i * 0.95, 0.36, 0], { r: 0.02, mat: 'clay' });
  // 연료 탱크·공구함
  k.cyl(C.steelLight, 0.14, 0.7, [cabX0 - 0.55, 0.42, halfW - 0.3], { axis: 'x', mat: 'metal' });
  k.box(C.dark, [0.6, 0.24, 0.2], [cabX0 - 0.6, 0.32, -(halfW - 0.3)], { r: 0.04, mat: 'clay' });

  const stripe = (MAT.gloss as MeshPhysicalMaterial).clone();
  const band = new Kit('gloss');

  // 운전석 (흰색, 높은 지붕) + 아래쪽 회사 띠
  const cabH = TH - 0.5;
  k.box(C.wall, [cabL, cabH, TW - 0.04], [cabX0 + cabL / 2, 0.5, 0], { r: 0.16, seg: 5 });
  k.box(C.wall, [cabL - 0.2, 0.18, TW - 0.2], [cabX0 + cabL / 2 - 0.08, 0.5 + cabH - 0.02, 0], { r: 0.08, seg: 3 });
  band.box(C.white, [cabL + 0.04, 0.2, TW], [cabX0 + cabL / 2, 0.62, 0], { r: 0.08, seg: 3 });
  // 앞 유리·옆 창
  k.box(C.dark, [0.06, 0.62, TW - 0.3], [front - 0.02, 1.02, 0], { r: 0.03, mat: 'clay' });
  k.box(C.glass, [0.03, 0.56, TW - 0.36], [front + 0.008, 1.05, 0], { r: 0.015, mat: 'glass' });
  for (const dz of [-1, 1]) {
    k.box(C.dark, [0.5, 0.5, 0.04], [front - 0.36, 1.06, dz * (halfW - 0.01)], { r: 0.02, mat: 'clay' });
    k.box(C.glass, [0.46, 0.46, 0.03], [front - 0.36, 1.08, dz * (halfW + 0.005)], { r: 0.015, mat: 'glass' });
    // 거울
    k.box(C.dark, [0.04, 0.04, 0.22], [front - 0.1, 1.3, dz * (halfW + 0.1)], { r: 0.015, mat: 'clay' });
    k.box(C.dark, [0.05, 0.3, 0.1], [front - 0.08, 1.1, dz * (halfW + 0.22)], { r: 0.025, mat: 'clay' });
    // 전조등, 방향등
    k.box('#fff6d6', [0.04, 0.12, 0.26], [front + 0.005, 0.56, dz * (halfW - 0.24)], { r: 0.02, mat: 'glow', glow: 2.2 });
    k.box(C.amber, [0.04, 0.07, 0.1], [front + 0.005, 0.58, dz * (halfW - 0.06)], { r: 0.015, mat: 'glow', glow: 1.4 });
    // 발판
    k.box(C.dark, [0.42, 0.05, 0.14], [front - 0.42, 0.34, dz * (halfW + 0.02)], { r: 0.02, mat: 'clay' });
  }
  k.box(C.steelLight, [0.16, 0.2, TW - 0.04], [front - 0.02, 0.26, 0], { r: 0.05, mat: 'metal' });
  k.box(C.white, [0.02, 0.1, 0.34], [front + 0.07, 0.32, 0], { r: 0.01, mat: 'clay' });
  // 배기관
  k.cyl(C.steelLight, 0.05, 1.3, [cabX0 - 0.06, 0.6, -(halfW - 0.18)], { mat: 'metal', seg: 10 });
  // 후미등, 번호판, 뒤 범퍼
  k.box(C.dark, [0.08, 0.1, TW - 0.2], [-front + 0.04, 0.32, 0], { r: 0.03, mat: 'clay' });
  for (const dz of [-1, 1]) k.box(C.red, [0.04, 0.09, 0.18], [-front + 0.0, 0.42, dz * (halfW - 0.2)], { r: 0.02, mat: 'glow', glow: 1.5 });
  k.box(C.white, [0.02, 0.1, 0.34], [-front - 0.005, 0.42, 0], { r: 0.01, mat: 'clay' });
  // 바퀴 흙받이
  for (const x of [-1.85, -1.25]) for (const dz of [-1, 1]) k.box(C.dark, [0.6, 0.05, 0.3], [x, wr * 2 + 0.04, dz * (halfW - 0.15)], { r: 0.02, mat: 'clay' });
  root.add(k.build('cargo-body'));
  root.add(stripeGroup(band, stripe));

  // 경광등 (움직일 때 깜빡인다)
  const beaconKit = new Kit('glow');
  beaconKit.cyl(C.amber, 0.06, 0.08, [cabX0 + 0.3, 0.5 + cabH + 0.16, 0.3], { seg: 10, glow: 3 });
  const beacon = beaconKit.build();
  root.add(beacon);

  // 바퀴: 앞 두 축(조향), 뒤 두 축(복륜). 하나의 바퀴 그룹이 복륜 둘을 함께 그린다
  const wheels: Group[] = [];
  const axles: Array<[number, number]> = [
    [front - 0.55, 0.22],
    [front - 1.3, 0.22],
    [-1.85, 0.32],
    [-1.25, 0.32],
  ];
  for (const [x, width] of axles) {
    for (const dz of [-1, 1]) {
      const w = wheel(wr, width);
      w.position.set(x, wr, dz * (halfW - width / 2 - 0.02));
      root.add(w);
      wheels.push(w);
    }
  }

  // 적재함 (들리지 않는다: bed 그룹은 Actors가 기울이지 않는다)
  const pivot: [number, number, number] = [rearX, DY, 0];
  const bed = new Group();
  bed.position.set(...pivot);
  const b = new Kit('gloss');
  // 바닥판(윗면이 0 = DY) + 아래 틀
  b.box(C.steel, [BL, 0.08, BW], [BL / 2, -0.08, 0], { r: 0.02, mat: 'metal' });
  b.box(C.dark, [BL, 0.1, BW + 0.02], [BL / 2, -0.17, 0], { r: 0.02, mat: 'clay' });
  for (const dz of [-0.45, -0.15, 0.15, 0.45]) b.box(C.steelLight, [BL - 0.08, 0.012, 0.03], [BL / 2, 0, dz], { r: 0.005, mat: 'metal' });
  // 앞 가림판: 기둥 둘 + 가로대 넷 (운전석 뒤를 지킨다)
  const HB = 0.9;
  for (const dz of [-1, 1]) b.box(C.blue, [0.08, HB, 0.08], [BL - 0.04, 0, dz * (BW / 2 - 0.04)], { r: 0.02 });
  for (const y of [0.2, 0.42, 0.64, 0.86]) b.box(C.blue, [0.06, 0.06, BW], [BL - 0.04, y - 0.03, 0], { r: 0.015 });
  // 옆판 꽂이(기둥 자리)
  for (const dz of [-1, 1]) for (let i = 0; i <= 3; i += 1) b.box(C.dark, [0.05, 0.1, 0.025], [0.05 + (i * (BL - 0.1)) / 3, -0.1, dz * (BW / 2 + 0.01)], { r: 0.01, mat: 'clay' });
  bed.add(b.build('cargo-deck'));
  // 옆판: 바닥판 옆 아래 모서리를 축(x)으로 바깥 아래로 내려간다. sides[0]은 −z, sides[1]은 +z. 한쪽 세 쪽, 회사 띠는 바깥에
  const SH = 0.26;
  const sides = [-1, 1].map((side) => {
    const gateSide = new Group();
    gateSide.position.set(BL / 2, 0, side * (BW / 2 + 0.01));
    const w = new Kit('gloss');
    const seg = (BL - 0.12) / 3;
    for (let i = 0; i < 3; i += 1) {
      const cx = -BL / 2 + 0.06 + seg * (i + 0.5);
      w.box(C.steelLight, [seg - 0.04, SH, 0.035], [cx, 0, 0], { r: 0.012, mat: 'metal' });
      w.box(C.blue, [seg - 0.02, 0.05, 0.05], [cx, SH - 0.03, 0], { r: 0.018 });
      for (const dx of [-seg / 4, seg / 4]) w.box(C.steel, [0.012, SH - 0.06, 0.042], [cx + dx, 0.02, 0], { r: 0.004, mat: 'metal' });
    }
    gateSide.add(w.build('cargo-side'));
    const sb = new Kit('gloss');
    sb.box(C.white, [BL - 0.6, 0.07, 0.01], [0, 0.08, side * 0.024], { r: 0.004 });
    gateSide.add(stripeGroup(sb, stripe));
    bed.add(gateSide);
    return gateSide;
  });
  // 뒷문(낮음, 닫힌 채)
  const gate = new Group();
  const g = new Kit('gloss');
  g.box(C.steelLight, [0.035, SH, BW], [0.02, 0, 0], { r: 0.012, mat: 'metal' });
  g.box(C.blue, [0.05, 0.05, BW + 0.02], [0.02, SH - 0.03, 0], { r: 0.018 });
  gate.add(g.build('cargo-gate'));
  const load = new Group();
  load.visible = false;
  bed.add(gate, load);
  root.add(bed);
  return { root, bed, gate, load, sides, wheels, beacon, pivot, stripe };
}

export interface ForkliftModel {
  root: Group;
  carriage: Group;
  /** 늘어나는 마스트 두 단(가운데·안쪽): 클램프가 바깥 마스트 위로 오르면 함께 올라간다 (Actors가 높이를 정한다, S2j #10) */
  mastStages: Group[];
  jaws: Group[];
  wheels: Group[];
  beacon: Group;
}

/** 지게차 바깥 마스트 높이(모형): 바닥에서 위 가로대 위까지 */
export const MAST_H = 1.81;
/** 클램프 틀 높이(모형, 클램프 배율 전) */
export const CLAMP_H = 0.5;

export function buildForklift(): ForkliftModel {
  const root = new Group();
  const k = new Kit('gloss');
  // 차체와 평형추
  k.box(C.yellow, [1.02, 0.4, 0.74], [-0.02, 0.16, 0], { r: 0.12, seg: 4 });
  k.box(C.yellowDeep, [0.4, 0.52, 0.78], [-0.4, 0.16, 0], { r: 0.16, seg: 4 });
  k.box(C.dark, [0.5, 0.06, 0.6], [0.02, 0.56, 0], { r: 0.02, mat: 'clay' });
  // 좌석, 운전대
  k.box(C.dark, [0.3, 0.1, 0.36], [-0.14, 0.6, 0], { r: 0.04, mat: 'clay' });
  k.box(C.dark, [0.09, 0.36, 0.36], [-0.3, 0.64, 0], { r: 0.04, mat: 'clay' });
  k.cyl(C.dark, 0.022, 0.34, [0.2, 0.58, 0], { seg: 8, rot: [0, 0, 0.35], mat: 'clay' });
  k.cyl(C.dark, 0.1, 0.03, [0.14, 0.9, 0], { seg: 14, rot: [0, 0, 0.35], mat: 'clay' });
  // 머리 보호 틀
  for (const [x, z] of [[0.3, 0.33], [0.3, -0.33], [-0.42, 0.33], [-0.42, -0.33]] as const) k.box(C.dark, [0.05, 0.92, 0.05], [x, 0.56, z], { r: 0.02, mat: 'clay' });
  k.box(C.dark, [0.86, 0.05, 0.78], [-0.06, 1.46, 0], { r: 0.025, mat: 'clay' });
  for (const dz of [-0.2, 0, 0.2]) k.box(C.dark, [0.8, 0.03, 0.04], [-0.06, 1.5, dz], { r: 0.01, mat: 'clay' });
  // 마스트
  for (const dz of [-0.24, 0.24]) k.box(C.steel, [0.08, 1.75, 0.07], [0.52, 0.06, dz], { r: 0.02, mat: 'metal' });
  k.box(C.steel, [0.07, 0.07, 0.56], [0.52, 1.74, 0], { r: 0.02, mat: 'metal' });
  k.box(C.steel, [0.07, 0.07, 0.56], [0.52, 0.9, 0], { r: 0.02, mat: 'metal' });
  k.cyl(C.steelLight, 0.035, 1.3, [0.47, 0.2, 0], { seg: 10, mat: 'metal' });
  // 늘어나는 마스트(3단 마스트의 가운데·안쪽 단): 바깥 마스트 안쪽에 겹쳐 있다가 클램프를 따라 오른다
  const mastStages = [0.205, 0.17].map((dz0, i) => {
    const stage = new Group();
    const m = new Kit('metal');
    for (const dz of [-dz0, dz0]) m.box(i === 0 ? C.steelLight : C.steel, [0.06, MAST_H - 0.04, 0.05], [0.535, 0.08, dz], { r: 0.015 });
    m.box(C.steel, [0.06, 0.06, dz0 * 2 + 0.05], [0.535, MAST_H - 0.02, 0], { r: 0.015 });
    stage.add(m.build(`forklift-mast-${i}`));
    root.add(stage);
    return stage;
  });
  // 등
  for (const dz of [-0.28, 0.28]) k.box('#fff6d6', [0.04, 0.07, 0.1], [0.5, 0.42, dz], { r: 0.015, mat: 'glow', glow: 2.2 });
  for (const dz of [-0.28, 0.28]) k.box(C.red, [0.04, 0.06, 0.1], [-0.6, 0.44, dz], { r: 0.015, mat: 'glow', glow: 1.4 });

  // 운전자
  k.box(C.vest, [0.2, 0.3, 0.3], [-0.14, 0.7, 0], { r: 0.07, mat: 'clay' });
  k.box(C.vestStripe, [0.21, 0.04, 0.31], [-0.14, 0.82, 0], { r: 0.012, mat: 'clay' });
  k.ball(C.skin, 0.1, [-0.12, 1.12, 0], { mat: 'clay' });
  k.ball(C.helmet, 0.11, [-0.12, 1.17, 0], { scale: [1, 0.72, 1], mat: 'gloss' });
  k.box(C.vest, [0.3, 0.07, 0.07], [0.02, 0.86, 0.16], { r: 0.03, rot: [0, 0, -0.3], mat: 'clay' });
  k.box(C.vest, [0.3, 0.07, 0.07], [0.02, 0.86, -0.16], { r: 0.03, rot: [0, 0, -0.3], mat: 'clay' });
  k.box(C.trousers, [0.3, 0.1, 0.28], [0.0, 0.62, 0], { r: 0.04, mat: 'clay' });
  root.add(k.build('forklift-body'));

  const beaconKit = new Kit('glow');
  beaconKit.cyl(C.amber, 0.045, 0.07, [-0.3, 1.52, 0.24], { seg: 10, glow: 3 });
  const beacon = beaconKit.build();
  root.add(beacon);

  const wheels: Group[] = [];
  for (const [x, z, r] of [[0.34, 0.36, 0.2], [0.34, -0.36, 0.2], [-0.38, 0.33, 0.16], [-0.38, -0.33, 0.16]] as const) {
    const w = wheel(r, 0.14);
    w.position.set(x, r, z);
    root.add(w);
    wheels.push(w);
  }

  // 베일 클램프: 바닥 포크 없이 양옆의 판으로 잡는다.
  const carriage = new Group();
  const c = new Kit('metal');
  c.box(C.dark, [0.05, 0.42, 0.66], [0.6, 0, 0], { r: 0.02, mat: 'clay' });
  c.box(C.dark, [0.05, 0.05, 0.7], [0.6, 0.42, 0], { r: 0.02, mat: 'clay' });
  for (const y of [0.14, 0.4]) {
    c.box(C.steel, [0.06, 0.055, 0.83], [0.6, y, 0], { r: 0.01 });
    c.cyl(C.steelLight, 0.025, 0.7, [0.64, y + 0.025, 0], { axis: 'z', seg: 10 });
  }
  carriage.add(c.build('forklift-clamp-carriage'));
  const jaws = [-1, 1].map((side) => {
    const jaw = new Kit('metal');
    jaw.box(C.steel, [0.76, 0.4, 0.025], [0.99, 0.1, side * 0.0025], { r: 0.008 });
    jaw.box(C.rubber, [0.7, 0.34, 0.005], [1.0, 0.13, -side * 0.0125], { r: 0.002, mat: 'clay' });
    jaw.box(C.yellow, [0.65, 0.055, 0.005], [1.0, 0.4, side * 0.0125], { r: 0.002 });
    const group = jaw.build('forklift-clamp-jaw');
    group.position.z = side * 0.415;
    carriage.add(group);
    return group;
  });
  root.add(carriage);
  return { root, carriage, mastStages, jaws, wheels, beacon };
}

export interface WorkerModel {
  root: Group;
  body: Group;
  legL: Group;
  legR: Group;
  armL: Group;
  armR: Group;
  head: Group;
}

const VESTS = [C.vest, C.yellowDeep, C.vest, C.yellowDeep];
const HELMETS = [C.helmet, C.helmet, C.yellow, C.helmet];

export function buildWorker(index: number, withTablet: boolean): WorkerModel {
  const root = new Group();
  const vest = VESTS[index % VESTS.length]!;
  const part = (build: (k: Kit) => void, x: number, y: number, z: number): Group => {
    const k = new Kit('clay');
    build(k);
    const g = k.build();
    const holder = new Group();
    holder.position.set(x, y, z);
    holder.add(g);
    return holder;
  };

  const body = part((k) => {
    k.box(vest, [0.2, 0.34, 0.3], [0, 0, 0], { r: 0.08, seg: 3 });
    k.box(C.vestStripe, [0.21, 0.035, 0.31], [0, 0.1, 0], { r: 0.01 });
    k.box(C.vestStripe, [0.21, 0.035, 0.31], [0, 0.2, 0], { r: 0.01 });
    k.box(C.trousers, [0.19, 0.08, 0.28], [0, -0.05, 0], { r: 0.035 });
  }, 0, 0.42, 0);

  const head = part((k) => {
    k.ball(C.skin, 0.105, [0, 0.1, 0], { seg: 16 });
    k.ball(HELMETS[index % HELMETS.length]!, 0.118, [0, 0.15, 0], { scale: [1, 0.7, 1], mat: 'gloss', seg: 16 });
    k.box(HELMETS[index % HELMETS.length]!, [0.1, 0.02, 0.2], [0.1, 0.13, 0], { r: 0.008, mat: 'gloss' });
  }, 0, 0.78, 0);

  const leg = (z: number) =>
    part((k) => {
      k.box(C.trousers, [0.11, 0.36, 0.12], [0, -0.38, 0], { r: 0.045 });
      k.box(C.dark, [0.17, 0.07, 0.13], [0.03, -0.42, 0], { r: 0.03 });
    }, 0, 0.42, z);
  const arm = (z: number, tablet: boolean) =>
    part((k) => {
      k.box(vest, [0.09, 0.16, 0.09], [0, -0.15, 0], { r: 0.04 });
      k.box(C.skin, [0.075, 0.17, 0.075], [0, -0.31, 0], { r: 0.035 });
      if (tablet) k.box(C.dark, [0.02, 0.2, 0.26], [0.05, -0.36, -z], { r: 0.008, rot: [0, 0, 0.5] });
    }, 0, 0.74, z);

  const legL = leg(0.075);
  const legR = leg(-0.075);
  const armL = arm(0.19, false);
  const armR = arm(-0.19, withTablet);
  root.add(body, head, legL, legR, armL, armR);
  return { root, body, legL, legR, armL, armR, head };
}

/** 움직이는 베일 하나 (지게차가 나른다). 바탕 재고 벽과 같은 모양(props의 bale), lite는 low 단계 */
export function buildBale(lite = false): Group {
  const k = new Kit('clay');
  baleParts(k, 0, 0, 0, 0, lite);
  return k.build('bale');
}

/** 컨베이어 위·집게 안의 파지 뭉치 */
export function buildLump(seed: number): Group {
  const k = new Kit('clay');
  const tones = [C.kraft, C.paper, C.kraftLight, C.paperGrey, C.kraftDark];
  let s = seed * 97 + 3;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < 7; i += 1) {
    const size = 0.14 + rnd() * 0.12;
    k.box(tones[(i + seed) % tones.length]!, [size * 1.25, size * 0.8, size], [(rnd() - 0.5) * 0.3, rnd() * 0.16, (rnd() - 0.5) * 0.3], { r: 0.035, rot: [rnd(), rnd() * 3, rnd()] });
  }
  return k.build('lump');
}

export const BALE_SIZE = BALE;
