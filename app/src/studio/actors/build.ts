import { Group, MeshPhysicalMaterial } from 'three';
import type { Mesh } from 'three';
import { C } from '../theme';
import { Kit, MAT } from '../three/kit';
import { BALE } from '../world/layout';
import { bale as baleParts } from '../world/props';

// 움직이는 것들의 모형. 움직이는 마디(적재함·바퀴·포크·팔다리)마다 그룹을 따로 만들어 돌려준다.
// 모두 +X를 앞으로 보고, 원점은 바닥 중심이다.

const WHEEL_R = 0.26;

function wheel(radius = WHEEL_R, width = 0.2): Group {
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
  wheels: Group[];
  beacon: Group;
  /** 적재함이 도는 축의 위치 (트럭 좌표) */
  pivot: [number, number, number];
  /** 회사 띠의 재질 (트럭마다 하나). 색은 Actors가 회사 이름으로 정한다 */
  stripe: MeshPhysicalMaterial;
}

/** 흰 꼭짓점 색으로 조립한 띠에 트럭 전용 재질을 입힌다 (재질 색이 곧 띠 색) */
function stripeGroup(k: Kit, material: MeshPhysicalMaterial): Group {
  const group = k.build();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) mesh.material = material;
  });
  return group;
}

// 운전석·적재함은 흰색, 회사마다 색 띠 하나 (참고 화면의 흰 트럭 + 색 띠)
const BED_PAINT = C.wall;
const CAB_PAINT = C.wall;

export function buildTruck(variant: number): TruckModel {
  const root = new Group();
  const k = new Kit('gloss');

  // 차대 (옅은 회색: 큰 어두운 면을 두지 않는다)
  k.box(C.steel, [2.72, 0.14, 0.62], [0, 0.3, 0], { r: 0.04, mat: 'clay' });
  k.box(C.steel, [0.2, 0.2, 1.0], [-1.0, 0.24, 0], { r: 0.05, mat: 'clay' });
  k.cyl(C.steelLight, 0.15, 0.55, [0.12, 0.33, 0.47], { axis: 'x', mat: 'metal' });
  k.box(C.steel, [0.3, 0.22, 0.2], [0.1, 0.24, -0.47], { r: 0.05, mat: 'clay' });
  // 뒷바퀴 흙받이
  for (const dz of [-0.5, 0.5]) k.box(C.steel, [1.12, 0.06, 0.26], [-0.8, 0.56, dz], { r: 0.03, mat: 'clay' });

  const stripe = (MAT.gloss as MeshPhysicalMaterial).clone();
  const band = new Kit('gloss');

  // 운전석 (흰색) + 아래쪽 회사 띠
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
  k.box(C.steelLight, [0.5, 0.12, 0.96], [0.9, 1.34, 0], { r: 0.05, seg: 3 });
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
  const paint = BED_PAINT;
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
  b.box(C.steel, [1.2, 0.1, 0.5], [L / 2, -0.08, 0], { r: 0.03, mat: 'clay' });
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

  return { root, bed, gate, load, wheels, beacon, pivot, stripe };
}

export interface ForkliftModel {
  root: Group;
  carriage: Group;
  wheels: Group[];
  beacon: Group;
}

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

  // 포크 받침 (위아래로 움직인다)
  const carriage = new Group();
  const c = new Kit('metal');
  c.box(C.dark, [0.05, 0.42, 0.66], [0.6, 0, 0], { r: 0.02, mat: 'clay' });
  c.box(C.dark, [0.05, 0.05, 0.7], [0.6, 0.42, 0], { r: 0.02, mat: 'clay' });
  for (const dz of [-0.2, 0.2]) {
    c.box(C.steel, [0.78, 0.04, 0.1], [0.98, -0.045, dz], { r: 0.015 });
    c.box(C.steel, [0.05, 0.36, 0.1], [0.615, -0.045, dz], { r: 0.015 });
  }
  carriage.add(c.build('forklift-forks'));
  root.add(carriage);
  return { root, carriage, wheels, beacon };
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

/** 움직이는 베일 하나 (지게차가 나른다) */
export function buildBale(): Group {
  const k = new Kit('clay');
  baleParts(k, 0, 0, 0, 0);
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
