import { Group, MeshPhysicalMaterial } from 'three';
import type { BufferGeometry, Mesh } from 'three';
import { C } from '../theme';
import { Kit, MAT } from '../three/kit';
import { CRANE, GRAPPLE_TRUCK, HEAP_H } from '../sim/grapple';
import type { TruckModel } from './build';
import { stripeGroup, wheel } from './build';

// 입고 집게차 모형(S2m, S2n): 5톤 카고(파랑 운전석) + 망·판으로 높인 적재함(1.7 m) + 차 맨 뒤 너클 크레인(노랑) + 오렌지필 집게.
// 월드 단위로 바로 만든다(배율 1). +X가 앞, 원점은 바닥 중심. 움직이는 마디마다 그룹:
//   column(돌림 y) → boom1(올림 z) → boom2(꺾임 z) → ext(늘어남 x) → head(늘 아래로 매달림) → 갈퀴
// 갈퀴 6개는 standard·high에서만 그리고(Actors의 InstancedMesh 하나가 모든 집게차의 갈퀴를 그린다: `tineGeometry`),
// low(lite)는 크레인·집게를 둥글리지 않은 상자 몇 개로, 집게는 두 쪽 조개 모양(jaws)으로 그린다.

export interface GrappleModel extends TruckModel {
  column: Group;
  boom1: Group;
  boom2: Group;
  /** 늘어나는 끝의 가운데 마디 (ext의 절반만큼 나온다) */
  mid: Group;
  ext: Group;
  head: Group;
  /** low의 두 쪽 집게 (standard·high는 빈 배열: 갈퀴는 인스턴스로 그린다) */
  jaws: Group[];
  /** 집게에 든 파지 */
  held: Group;
  /** 받침다리: 옆으로 나오는 빔과 그 끝에서 내려가는 발 (−z, +z) */
  beams: Group[];
  feet: Group[];
  lite: boolean;
}

const T = GRAPPLE_TRUCK;
/** 높인 적재함의 철망 색 */
const NET = '#59626d';
const HALF_W = T.width / 2;
const WR = 0.23;
/** 받침다리 빔이 나오는 길이, 발이 내려가는 길이 */
export const BEAM_OUT = 0.32;
export const FOOT_DROP = 0.34;
/** 집게 머리 아래 갈퀴 축의 높이와 반지름 (head 좌표) */
export const TINE_HINGE_Y = -0.1;
export const TINE_HINGE_R = 0.1;
export const TINE_COUNT = 6;

export function buildGrappleTruck(variant: number, lite: boolean): GrappleModel {
  const root = new Group();
  const k = new Kit('gloss');
  const front = T.length / 2;
  const cabX0 = front - T.cabLength;
  const r = (v: number) => (lite ? 0 : v);

  // 차대
  for (const dz of [-0.28, 0.28]) k.box(C.dark, [T.length - 0.3, 0.13, 0.1], [0, 0.3, dz], { r: 0.03, mat: 'clay' });
  k.cyl(C.steelLight, 0.12, 0.5, [cabX0 - 0.5, 0.36, HALF_W - 0.26], { axis: 'x', mat: 'metal' });
  k.box(C.dark, [0.5, 0.2, 0.18], [cabX0 - 0.55, 0.28, -(HALF_W - 0.26)], { r: 0.04, mat: 'clay' });

  const stripe = (MAT.gloss as MeshPhysicalMaterial).clone();
  const band = new Kit('gloss');
  // 운전석 (파랑) + 아래쪽 회사 띠
  const cabH = T.cabHeight - 0.42;
  k.box(C.blue, [T.cabLength - 0.05, cabH, T.width - 0.04], [cabX0 + T.cabLength / 2, 0.42, 0], { r: 0.14, seg: 4 });
  band.box(C.white, [T.cabLength, 0.16, T.width], [cabX0 + T.cabLength / 2, 0.5, 0], { r: 0.06, seg: 3 });
  k.box(C.dark, [0.05, 0.42, T.width - 0.28], [front - 0.02, 0.86, 0], { r: 0.03, mat: 'clay' });
  k.box(C.glass, [0.03, 0.36, T.width - 0.34], [front + 0.006, 0.89, 0], { r: 0.015, mat: 'glass' });
  for (const dz of [-1, 1]) {
    k.box(C.dark, [0.46, 0.36, 0.04], [front - 0.36, 0.88, dz * (HALF_W - 0.01)], { r: 0.02, mat: 'clay' });
    k.box(C.glass, [0.42, 0.32, 0.03], [front - 0.36, 0.9, dz * (HALF_W + 0.005)], { r: 0.015, mat: 'glass' });
    k.box(C.dark, [0.04, 0.04, 0.18], [front - 0.1, 1.12, dz * (HALF_W + 0.08)], { r: 0.015, mat: 'clay' });
    k.box(C.dark, [0.05, 0.24, 0.09], [front - 0.08, 0.95, dz * (HALF_W + 0.18)], { r: 0.025, mat: 'clay' });
    k.box('#fff6d6', [0.04, 0.1, 0.22], [front + 0.005, 0.5, dz * (HALF_W - 0.22)], { r: 0.02, mat: 'glow', glow: 2.2 });
    k.box(C.amber, [0.04, 0.06, 0.08], [front + 0.005, 0.52, dz * (HALF_W - 0.06)], { r: 0.015, mat: 'glow', glow: 1.4 });
    k.box(C.dark, [0.36, 0.05, 0.12], [front - 0.4, 0.3, dz * (HALF_W + 0.02)], { r: 0.02, mat: 'clay' });
  }
  k.box(C.steelLight, [0.14, 0.18, T.width - 0.04], [front - 0.02, 0.22, 0], { r: 0.05, mat: 'metal' });
  k.box(C.white, [0.02, 0.09, 0.3], [front + 0.06, 0.27, 0], { r: 0.01, mat: 'clay' });
  k.box(C.blueDeep, [T.cabLength * 0.5, 0.1, T.width - 0.3], [cabX0 + T.cabLength * 0.45, 0.42 + cabH - 0.02, 0], { r: 0.04, seg: 3 });

  // 적재함: 망·판으로 높인 옆판(고물상 집게차, S2n). 들리지 않는다. 아래는 철판, 위는 철망(비치는 재질)이고 기둥·윗대가 잡는다
  const BL = T.bedFront - T.bedRear;
  const bx = (T.bedFront + T.bedRear) / 2;
  const DY = T.deckY;
  const SH = T.sideH;
  const PLATE = 0.3;
  k.box(C.steel, [BL, 0.07, T.width - 0.04], [bx, DY - 0.07, 0], { r: 0.02, mat: 'metal' });
  k.box(C.dark, [BL, 0.09, T.width - 0.02], [bx, DY - 0.16, 0], { r: 0.02, mat: 'clay' });
  const posts = 4;
  for (const dz of [-1, 1]) {
    const z = dz * (HALF_W - 0.04);
    k.box(C.steelLight, [BL, PLATE, 0.04], [bx, DY, z], { r: 0.012, mat: 'metal' });
    k.box(C.blue, [BL + 0.02, 0.05, 0.06], [bx, DY + PLATE - 0.02, z], { r: 0.018 });
    k.box(C.blue, [BL + 0.02, 0.05, 0.06], [bx, DY + SH - 0.04, z], { r: 0.018 });
    k.box(NET, [BL - 0.04, SH - PLATE - 0.06, 0.012], [bx, DY + PLATE + 0.02, z], { r: 0, mat: 'net' });
    for (let i = 0; i <= posts; i += 1) k.box(C.blueDeep, [0.05, SH, 0.06], [T.bedRear + 0.03 + ((BL - 0.06) * i) / posts, DY, z], { r: r(0.01) });
  }
  // 뒤판(크레인 쪽)·앞판(운전석 쪽): 아래 철판 + 위 철망, 앞판은 조금 더 높다
  for (const [x, h] of [[T.bedRear + 0.02, SH], [T.bedFront - 0.02, SH + 0.1]] as const) {
    k.box(C.steelLight, [0.04, PLATE, T.width - 0.08], [x, DY, 0], { r: 0.012, mat: 'metal' });
    k.box(NET, [0.012, h - PLATE - 0.06, T.width - 0.12], [x, DY + PLATE + 0.02, 0], { r: 0, mat: 'net' });
    k.box(C.blue, [0.06, 0.05, T.width - 0.04], [x, DY + h - 0.04, 0], { r: 0.018 });
    k.box(C.blue, [0.06, 0.05, T.width - 0.04], [x, DY + PLATE - 0.02, 0], { r: 0.018 });
  }
  // 후미등, 번호판, 흙받이
  for (const dz of [-1, 1]) k.box(C.red, [0.04, 0.07, 0.14], [-front, 0.38, dz * (HALF_W - 0.18)], { r: 0.02, mat: 'glow', glow: 1.5 });
  k.box(C.white, [0.02, 0.09, 0.3], [-front - 0.005, 0.38, 0], { r: 0.01, mat: 'clay' });
  for (const dz of [-1, 1]) k.box(C.dark, [0.9, 0.05, 0.26], [-0.95, WR * 2 + 0.05, dz * (HALF_W - 0.14)], { r: 0.02, mat: 'clay' });
  // 크레인 받침(돌지 않는 아래 틀, 적재함 뒤끝 너머 차대 위)과 받침다리 빔 상자
  k.box(C.yellowDeep, [0.36, 0.2, T.width - 0.1], [CRANE.x, 0.36, 0], { r: r(0.04) });
  k.box(C.dark, [0.2, 0.06, T.width - 0.3], [CRANE.x, 0.3, 0], { r: r(0.02), mat: 'clay' });
  root.add(k.build('grapple-body'));
  root.add(stripeGroup(band, stripe));

  // 받침다리: 빔이 옆으로 나오고(beams), 끝의 발이 땅으로 내려간다(feet)
  const beams: Group[] = [];
  const feet: Group[] = [];
  for (const side of [-1, 1]) {
    const beam = new Group();
    beam.position.set(CRANE.x, 0.42, side * (HALF_W - 0.2));
    const bk = new Kit('gloss');
    bk.box(C.yellow, [0.13, 0.1, 0.4], [0, -0.05, 0], { r: r(0.02) });
    bk.box(C.dark, [0.09, 0.2, 0.09], [0, -0.14, side * 0.2], { r: r(0.015), mat: 'clay' });
    beam.add(bk.build('grapple-beam'));
    const foot = new Group();
    foot.position.set(0, 0, side * 0.2);
    const fk = new Kit('clay');
    fk.box(C.steelLight, [0.05, 0.3, 0.05], [0, -0.38, 0], { r: 0, mat: 'metal' });
    fk.box(C.dark, [0.2, 0.04, 0.2], [0, -0.4, 0], { r: r(0.01) });
    foot.add(fk.build('grapple-foot'));
    beam.add(foot);
    root.add(beam);
    beams.push(beam);
    feet.push(foot);
  }

  // 경광등 (움직일 때 깜빡인다)
  const beaconKit = new Kit('glow');
  beaconKit.cyl(C.amber, 0.05, 0.07, [cabX0 + 0.3, 0.42 + cabH + 0.08, 0.3], { seg: 10, glow: 3 });
  const beacon = beaconKit.build();
  root.add(beacon);

  // 바퀴: 앞 한 축, 뒤 두 축
  const wheels: Group[] = [];
  for (const x of [front - 0.55, -0.7, -1.2]) {
    for (const dz of [-1, 1]) {
      const w = wheel(WR, 0.2);
      w.position.set(x, WR, dz * (HALF_W - 0.12));
      root.add(w);
      wheels.push(w);
    }
  }

  // 실린 파지 더미 (Actors가 남은 양만큼 높이를 줄인다: 바닥이 적재함 바닥에 붙은 채)
  const load = new Group();
  load.position.set(bx, DY, 0);
  const p = new Kit('clay');
  const tones = [C.kraft, C.kraftLight, C.paper, C.kraftDark, C.paperGrey, C.kraftLight];
  let seed = 11 + variant * 17;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  // 바닥에서 HEAP_H(가득 찬 높이)까지: 아래 덩어리 + 위 덩어리 + 흩어진 조각 (Actors가 남은 양만큼 y로 줄인다)
  p.box(C.kraft, [BL - 0.12, HEAP_H * 0.72, T.width - 0.16], [0, 0, 0], { r: r(0.1), seg: 3 });
  p.box(C.kraftLight, [BL - 0.45, HEAP_H * 0.2, T.width - 0.4], [0, HEAP_H * 0.68, 0], { r: r(0.08), seg: 3 });
  for (let i = 0; i < (lite ? 10 : 30); i += 1) {
    const s = 0.12 + rnd() * 0.12;
    p.box(tones[i % tones.length]!, [s * 1.3, s * 0.7, s], [(rnd() - 0.5) * (BL - 0.4), HEAP_H * (0.66 + rnd() * 0.22), (rnd() - 0.5) * (T.width - 0.4)], { r: r(0.03), rot: [rnd() * 0.8, rnd() * 3, rnd() * 0.8] });
  }
  load.add(p.build('grapple-load'));
  root.add(load);

  // 크레인 (노랑). 기둥은 돌고, 붐 1은 기둥 위 축에서 올라가고, 붐 2는 붐 1 끝에서 꺾인다
  const column = new Group();
  column.position.set(CRANE.x, 0, 0);
  const ck = new Kit('gloss');
  ck.cyl(C.yellow, 0.14, CRANE.pivotY - 0.46, [0, 0.46, 0], { seg: lite ? 8 : 18 });
  ck.box(C.yellowDeep, [0.22, 0.14, 0.26], [0, CRANE.pivotY - 0.1, 0], { r: r(0.03) });
  if (!lite) {
    // 돌림 톱니, 기둥 옆 높은 조종석(발판·의자·손잡이)
    ck.cyl(C.dark, 0.19, 0.06, [0, 0.46, 0], { seg: 18, mat: 'clay' });
    ck.box(C.dark, [0.2, 0.03, 0.2], [-0.02, CRANE.pivotY - 0.5, 0.22], { r: 0.01, mat: 'clay' });
    ck.box(C.dark, [0.14, 0.08, 0.14], [-0.04, CRANE.pivotY - 0.47, 0.22], { r: 0.03, mat: 'clay' });
    ck.box(C.dark, [0.03, 0.16, 0.14], [-0.11, CRANE.pivotY - 0.47, 0.22], { r: 0.012, mat: 'clay' });
    for (const dz of [0.16, 0.28]) ck.box(C.dark, [0.03, 0.12, 0.03], [0.07, CRANE.pivotY - 0.44, dz], { r: 0.01, mat: 'clay' });
  }
  column.add(ck.build('crane-column'));
  const boom1 = new Group();
  boom1.position.set(0, CRANE.pivotY, 0);
  const b1 = new Kit('gloss');
  b1.box(C.yellow, [CRANE.boom1 + 0.1, 0.13, 0.13], [CRANE.boom1 / 2, -0.065, 0], { r: r(0.03) });
  if (!lite) {
    // 올림 실린더 (기둥 → 붐 1 아래)
    b1.cyl(C.steelLight, 0.03, 0.75, [0.32, -0.2, 0], { axis: 'x', mat: 'metal', rot: [0, 0, 0.5] });
    b1.cyl(C.dark, 0.05, 0.16, [0, 0, 0], { axis: 'z', mat: 'clay' });
  }
  boom1.add(b1.build('crane-boom1'));
  const boom2 = new Group();
  boom2.position.set(CRANE.boom1, 0, 0.11);
  const b2 = new Kit('gloss');
  b2.box(C.yellow, [CRANE.boom2 + 0.06, 0.11, 0.11], [CRANE.boom2 / 2 - 0.03, -0.055, 0], { r: r(0.025) });
  if (!lite) b2.cyl(C.dark, 0.045, 0.14, [0, 0, 0], { axis: 'z', mat: 'clay' });
  boom2.add(b2.build('crane-boom2'));
  // 늘어나는 끝: 두 마디가 붐 2 안에 숨어 있다가 밖으로 나온다 (끝이 CRANE.boom2 + ext, 가운데 마디는 ext / 2)
  const SLEEVE = CRANE.boom2 * 0.92;
  const mid = new Group();
  const mk = new Kit('metal');
  mk.box(C.steelLight, [SLEEVE, 0.09, 0.09], [CRANE.boom2 - SLEEVE / 2, -0.045, 0], { r: r(0.015) });
  mid.add(mk.build('crane-mid'));
  boom2.add(mid);
  const ext = new Group();
  const ek = new Kit('gloss');
  ek.box(C.steel, [SLEEVE, 0.07, 0.07], [CRANE.boom2 - SLEEVE / 2, -0.035, 0], { r: r(0.012), mat: 'metal' });
  ek.box(C.yellowDeep, [0.1, 0.12, 0.12], [CRANE.boom2 + 0.02, -0.06, 0], { r: r(0.02) });
  ext.add(ek.build('crane-ext'));
  // 집게 머리: 붐 끝에 매달려 늘 아래를 본다 (Actors가 붐 각도의 합만큼 되돌린다)
  const head = new Group();
  head.position.set(CRANE.boom2 + 0.02, -0.06, 0);
  const hk = new Kit('gloss');
  hk.box(C.dark, [0.04, 0.06, 0.04], [0, -0.06, 0], { r: 0, mat: 'clay' });
  if (lite) hk.box(C.yellowDeep, [0.2, 0.06, 0.2], [0, -0.12, 0], { r: 0 });
  else {
    hk.cyl(C.dark, 0.05, 0.05, [0, -0.08, 0], { seg: 12, mat: 'clay' });
    hk.cyl(C.yellowDeep, [0.09, 0.13], 0.07, [0, TINE_HINGE_Y - 0.04, 0], { seg: 18 });
  }
  head.add(hk.build('grapple-head'));
  const jaws: Group[] = [];
  if (lite) {
    for (const side of [-1, 1]) {
      const jaw = new Group();
      jaw.position.set(side * 0.09, -0.12, 0);
      const jk = new Kit('clay');
      jk.box(C.steel, [0.04, 0.22, 0.18], [side * 0.02, -0.22, 0], { r: 0, mat: 'metal' });
      jaw.add(jk.build('grapple-jaw'));
      head.add(jaw);
      jaws.push(jaw);
    }
  }
  // 든 파지 (움켜쥔 동안만 보인다)
  const held = new Group();
  const hp = new Kit('clay');
  hp.box(C.kraft, [0.22, 0.16, 0.2], [0, -0.33, 0], { r: r(0.06), seg: 2 });
  hp.box(C.paper, [0.12, 0.08, 0.12], [0.04, -0.2, 0.03], { r: r(0.03), rot: [0.3, 0.5, 0.2] });
  hp.box(C.kraftLight, [0.12, 0.07, 0.1], [-0.05, -0.22, -0.04], { r: r(0.03), rot: [0.2, 1.4, 0.4] });
  held.add(hp.build('grapple-held'));
  held.visible = false;
  head.add(held);
  ext.add(head);
  boom2.add(ext);
  boom1.add(boom2);
  column.add(boom1);
  root.add(column);

  // TruckModel 칸 맞추기: 적재함은 들리지 않고 뒷문도 없다(빈 그룹)
  const bed = new Group();
  const gate = new Group();
  bed.add(gate);
  root.add(bed);
  return { root, bed, gate, load, sides: [], wheels, beacon, pivot: [0, DY, 0], stripe, column, boom1, boom2, mid, ext, head, jaws, held, beams, feet, lite };
}

/** 갈퀴 하나(경첩이 원점, 아래로 뻗다 안쪽(−x)으로 굽는다): 모든 집게차의 갈퀴를 그리는 InstancedMesh의 지오메트리 */
export function tineGeometry(): BufferGeometry {
  const k = new Kit('metal');
  k.box(C.steel, [0.035, 0.15, 0.05], [0, -0.15, 0], { r: 0.012 });
  k.box(C.steel, [0.03, 0.13, 0.045], [-0.05, -0.27, 0], { r: 0.01, rot: [0, 0, -0.42] });
  k.box(C.dark, [0.05, 0.04, 0.06], [0, -0.03, 0], { r: 0.012 });
  const group = k.build();
  let geometry: BufferGeometry | null = null;
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && !geometry) geometry = mesh.geometry;
  });
  return geometry!;
}
