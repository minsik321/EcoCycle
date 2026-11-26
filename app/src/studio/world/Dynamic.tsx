import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Group, InstancedMesh, Mesh } from 'three';
import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, DeviceStatus, SectorGrade, TankId } from '@ecocycle/shared';
import { buildLump } from '../actors/build';
import type { Director } from '../sim/director';
import type { P2 } from '../sim/paths';
import { C } from '../theme';
import { Kit, MAT, chunkGeometry, disposeTree } from '../three/kit';
import { useClockWaker } from '../three/motion';
import { BALER, PILES, PLATE_CAMERA, PILE_MAX_H, PLATEAU, RAIL, RAIL_FRAME, RAIL_LEN, RAIL_SLOPE, SITE, TIP, YARD_FRAME, centroid, railAt, railY, sitePx } from './layout';
import { buildFloor, disposeFloor } from '../three/floorTexture';
import { bakeGroundShadow, disposeBaked } from '../three/bakedShadow';
import { buildWorld, edgeDistance, inside } from './buildWorld';

// 월드의 고정물과, 기기 값에 따라 움직이는 부분(벨트·램·더미). 입구는 열린 경사로다(차가 멈추지 않고 그대로 지난다).

const HIT = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
/** 압축기 건물의 파란 지붕을 걷는 카메라 거리 (부지 전체에서는 사진처럼 덮여 보이고, 구역 거리부터는 안이 보인다) */
const ROOF_HIDE_DIST = 75;
/** 카메라가 이보다 낮으면 땅에서 보는 화면으로 본다(m). 구역(mid)·대상(close) 보기는 이보다 높다 */
const GROUND_VIEW_Y = 10;

/** 마당 바닥 얼룩: 계근대 앞·트럭 길·쏟는 자리·배출구 앞 (월드 x, z, 반지름, 진하기) */
const STAINS: ReadonlyArray<readonly [number, number, number, number]> = [
  ...([
    [400, 258, 1.6, 0.2],
    [360, 298, 2.0, 0.16],
    [318, 300, 1.8, 0.14],
    [288, 270, 1.4, 0.12],
    [440, 300, 1.4, 0.16],
    [212, 486, 1.2, 0.22],
    [330, 258, 1.2, 0.1],
    [372, 330, 1.6, 0.12],
  ] as const).map(([x, y, r, a]) => [...sitePx(x, y), r, a] as const),
  ...Object.values(TIP).map((s) => [s.x, s.z, 1.6, 0.2] as const),
];

/** 고정물. 카메라 쪽을 향한 압축기 건물 벽은 숨겨 안이 보이게 한다. baked면 미리 구운 바닥 그림자를 얹는다 (low 단계) */
export function World({ baked = false }: { baked?: boolean }) {
  // low(baked)는 같은 배치를 가볍게 (나무·언덕·능선·베일 띠·파지 조각)
  const world = useMemo(() => buildWorld(baked), [baked]);
  const floor = useMemo(() => buildFloor({ outline: PLATEAU, axis: YARD_FRAME.rotY, stains: STAINS, y: 0.004 }), []);
  useEffect(() => () => {
    if (floor) disposeFloor(floor);
  }, [floor]);
  const shadow = useMemo(() => (baked ? bakeGroundShadow(world.footprints, { minX: SITE.minX - 4, maxX: SITE.maxX + 4, minZ: SITE.minZ - 4, maxZ: SITE.maxZ + 4 }) : null), [baked, world]);
  useEffect(() => () => {
    if (shadow) disposeBaked(shadow);
  }, [shadow]);
  const camera = useThree((s) => s.camera);
  useEffect(
    () => () => {
      disposeTree(world.base);
      disposeTree(world.roof);
      world.walls.forEach((w) => disposeTree(w.group));
    },
    [world],
  );
  useFrame(() => {
    const [cx, cz] = world.houseCenter;
    const dx = camera.position.x - cx;
    const dz = camera.position.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    // 사람 눈높이(사진 방향 화면 등)에서는 건물을 밖에서 본 그대로 둔다: 벽·지붕(물탱크)을 걷지 않는다
    const ground = camera.position.y < GROUND_VIEW_Y;
    for (const wall of world.walls) wall.group.visible = ground || (wall.nx * dx + wall.nz * dz) / len < 0.18;
    world.roof.visible = ground || Math.hypot(dx, camera.position.y, dz) > ROOF_HIDE_DIST;
  });
  return (
    <>
      <primitive object={world.base} />
      {floor && <primitive object={floor} />}
      {shadow && <primitive object={shadow} />}
      <primitive object={world.roof} />
      {world.walls.map((w) => (
        <primitive key={w.group.name} object={w.group} />
      ))}
    </>
  );
}

// ── 섹터의 노천 파지 더미 ─────────────────────────────────────────────

const PER_PILE = 560;
const LAYERS = 8;
const PILE_TONES: Record<SectorGrade, string[]> = {
  // 등급은 서버 값이다. 화면은 등급에 따라 색 섞임만 달리한다
  A: [C.kraftLight, C.paper, C.kraft, C.kraftLight, C.paperGrey, C.paper],
  C: [C.kraft, C.kraftLight, C.kraftDark, C.kraft, C.paperGrey, C.kraftDark],
};
/** 더미 바닥의 등급 색 (theme의 A·C 등급 색) */
const GRADE_FLOOR: Record<SectorGrade, string> = { A: C.gradeA, C: C.gradeC };
const NO_GRADE = C.concreteDark;

interface Chunk {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

/** 더미 하나의 조각 자리: 아래층부터 차곡차곡, 위로 갈수록 테두리에서 안쪽으로 물러나는 둔덕 (적재율만큼 앞에서부터 보인다) */
export function pileChunks(id: TankId, seed0: number): Chunk[] {
  let seed = seed0;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const poly = PILES[id];
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let deepest = 0;
  for (let i = 0; i < 400; i += 1) {
    const p: P2 = [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)];
    if (inside(p, poly)) deepest = Math.max(deepest, edgeDistance(p, poly));
  }
  const weights = Array.from({ length: LAYERS }, (_, i) => (LAYERS - i * 0.8) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const out: Chunk[] = [];
  for (let layer = 0; layer < LAYERS; layer += 1) {
    const count = Math.round((weights[layer]! / total) * PER_PILE);
    // 층이 오를수록 테두리에서 그만큼 안쪽에만 놓는다
    const inset = 0.18 + (layer / LAYERS) * deepest * 0.92;
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 40 && out.length < PER_PILE; tries += 1) {
      const p: P2 = [x0 + rnd() * (x1 - x0), z0 + rnd() * (z1 - z0)];
      if (!inside(p, poly) || edgeDistance(p, poly) < inset) continue;
      out.push({ x: p[0], y: 0.1 + layer * (PILE_MAX_H / LAYERS) + rnd() * 0.08, z: p[1], rx: (rnd() - 0.5) * 0.9, ry: rnd() * Math.PI, rz: (rnd() - 0.5) * 0.9, s: 0.85 + rnd() * 0.6 });
      placed += 1;
    }
  }
  while (out.length < PER_PILE) out.push({ ...out[out.length - 1]!, s: 0 });
  return out;
}

/** 더미 바닥(등급 색) 판: 윤곽을 조금 넓혀 깐다 */
function pileFloor(id: TankId): BufferGeometry {
  const poly = PILES[id];
  const [cx, cz] = centroid(poly);
  const k = new Kit();
  k.flat(C.white, poly.map(([x, z]) => [cx + (x - cx) * 1.08, cz + (z - cz) * 1.08] as P2), 0.0, 0.05);
  const mesh = k.build().children[0] as Mesh;
  return mesh.geometry;
}

export function Piles({ director, grades, lite = false }: { director: Director; grades: Partial<Record<TankId, SectorGrade>>; lite?: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  // low(lite): 모서리를 둥글리지 않은 상자 조각 (조각 하나 12면, 둥근 조각은 108면이라 더미 둘에 십만 개 넘게 든다)
  const geometry = useMemo(() => (lite ? chunkGeometry(0.46, 0.26, 0.36, 0, 0) : chunkGeometry(0.46, 0.26, 0.36, 0.06)), [lite]);
  const chunks = useMemo(() => TANK_IDS.map((id, i) => pileChunks(id, 11 + i * 101)), []);
  const floors = useMemo(() => TANK_IDS.map((id) => ({ geometry: pileFloor(id), material: new MeshStandardMaterial({ color: NO_GRADE, roughness: 0.85, vertexColors: true }) })), []);
  const shown = useRef<number[]>(TANK_IDS.map(() => -1));
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(), e: new Color() }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      floors.forEach((f) => {
        f.geometry.dispose();
        f.material.dispose();
      });
    },
    [geometry, floors],
  );

  const gradeKey = TANK_IDS.map((id) => grades[id] ?? '-').join('');
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    TANK_IDS.forEach((id, b) => {
      const tones = PILE_TONES[grades[id] ?? 'C'];
      for (let i = 0; i < PER_PILE; i += 1) mesh.setColorAt(b * PER_PILE + i, tmp.e.set(tones[(i * 7 + b) % tones.length]!));
      const grade = grades[id];
      floors[b]!.material.color.set(grade ? GRADE_FLOOR[grade] : NO_GRADE);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // gradeKey(등급 묶음)가 바뀔 때만 다시 칠한다
  }, [gradeKey, tmp, floors]);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let changed = false;
    TANK_IDS.forEach((id, b) => {
      const list = chunks[b]!;
      const count = Math.round((Math.min(100, Math.max(0, director.fill[id])) / 100) * list.length);
      if (count === shown.current[b]) return;
      shown.current[b] = count;
      changed = true;
      list.forEach((c, i) => {
        if (i < count && c.s > 0) {
          tmp.q.setFromAxisAngle(tmp.p.set(c.rx, 1, c.rz).normalize(), c.ry);
          mesh.setMatrixAt(b * PER_PILE + i, tmp.m.compose(tmp.p.set(c.x, c.y, c.z), tmp.q, tmp.s.setScalar(c.s)));
        } else {
          mesh.setMatrixAt(b * PER_PILE + i, tmp.m.makeScale(0, 0, 0));
        }
      });
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={ref} args={[geometry, MAT.clay, PER_PILE * TANK_IDS.length]} castShadow receiveShadow frustumCulled={false} />
      {floors.map((f, i) => (
        <mesh key={TANK_IDS[i]} geometry={f.geometry} material={f.material} receiveShadow />
      ))}
    </>
  );
}

// ── 경사 레일의 벨트와 뭉치 (레일 좌표계: 로컬 x = u) ─────────────────

const SLAT_GAP = 0.24;

export function Belt({ director }: { director: Director }) {
  const count = Math.floor(RAIL_LEN / SLAT_GAP);
  const slats = useRef<InstancedMesh>(null);
  const body = useMemo(() => {
    const k = new Kit('clay');
    const um = (RAIL.startU + RAIL.endU) / 2;
    k.box('#9aa3b1', [RAIL_LEN, 0.07, RAIL.width], [um, railY(um) - 0.075, 0], { r: 0.03, rot: [0, 0, RAIL_SLOPE] });
    return k.build('belt');
  }, []);
  const slatGeometry = useMemo(() => chunkGeometry(0.07, 0.012, RAIL.width - 0.1, 0.004), []);
  const lumps = useMemo(() => director.lumps.map((_, i) => buildLump(i + 1)), [director]);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), RAIL_SLOPE), p: new Vector3(), s: new Vector3(1, 1, 1) }), []);
  useEffect(
    () => () => {
      disposeTree(body);
      slatGeometry.dispose();
      lumps.forEach(disposeTree);
    },
    [body, slatGeometry, lumps],
  );
  useEffect(() => {
    const mesh = slats.current;
    if (!mesh) return;
    const tone = new Color('#b9c0cb');
    for (let i = 0; i < count; i += 1) mesh.setColorAt(i, tone);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count]);

  useFrame(() => {
    const mesh = slats.current;
    if (mesh) {
      const span = count * SLAT_GAP;
      const du = RAIL.endU - RAIL.startU - 0.12;
      for (let i = 0; i < count; i += 1) {
        // 벨트 윗면은 투입구 쪽(+u)으로 오르며 흐른다
        const d = (i * SLAT_GAP + director.beltOffset) % span;
        const u = RAIL.startU + 0.06 + (d / span) * du;
        mesh.setMatrixAt(i, tmp.m.compose(tmp.p.set(u, railY(u) - 0.002, 0), tmp.q, tmp.s));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    director.lumps.forEach((sim, i) => {
      const lump = lumps[i]!;
      lump.visible = sim.active;
      if (!sim.active) return;
      const d = sim.drop;
      const u = d > 0 ? RAIL.endU + d * 0.4 : sim.u;
      lump.position.set(u, (d > 0 ? RAIL.endY : railY(u)) + 0.02 - d * d * 1.2, (((sim.seed * 31) % 9) / 9 - 0.5) * 0.3);
      lump.rotation.set(d * 1.5, sim.seed * 1.3, d > 0 ? 0 : RAIL_SLOPE);
      lump.scale.setScalar(1 - d * 0.35);
    });
  });

  return (
    <group rotation-y={RAIL_FRAME.heading}>
      <primitive object={body} />
      <instancedMesh ref={slats} args={[slatGeometry, MAT.clay, count]} frustumCulled={false} />
      {lumps.map((lump, i) => (
        <primitive key={i} object={lump} />
      ))}
    </group>
  );
}

// ── 압축기의 움직이는 부분 (레일 좌표계) ──────────────────────────────

const LIGHTS: Array<{ key: Exclude<DeviceStatus, 'offline'>; on: string; y: number }> = [
  { key: 'alarm', on: '#ff5a4a', y: 0.3 },
  { key: 'caution', on: '#ffb347', y: 0.18 },
  { key: 'normal', on: '#5fdc8a', y: 0.06 },
];

export function BalerParts({ director, status }: { director: Director; status: DeviceStatus }) {
  // 경고등 깜빡임은 경보일 때만 그리기를 깨운다
  useClockWaker(director, () => status === 'alarm');
  const ram = useRef<Group>(null);
  const paper = useRef<Group>(null);
  const lights = useRef<Array<Mesh | null>>([]);
  const parts = useMemo(() => {
    const r = new Kit('gloss');
    r.box(C.yellow, [BALER.halfX * 2 - 0.34, 0.74, 0.12], [0, 0.2, 0], { r: 0.04, seg: 3 });
    r.box(C.yellowDeep, [BALER.halfX * 2 - 0.5, 0.1, 0.16], [0, 0.86, 0], { r: 0.03 });
    r.cyl(C.steelLight, 0.11, 1.5, [0, 0.56, 0.8], { axis: 'z', mat: 'metal' });
    const p = new Kit('clay');
    p.box(C.kraft, [BALER.halfX * 2 - 0.3, 1, 1], [0, 0, 0], { r: 0.08, seg: 3 });
    for (let i = 0; i < 9; i += 1) p.box(i % 2 ? C.paper : C.kraftLight, [0.3, 0.12, 0.22], [((i * 37) % 10) / 10 - 0.5, 0.96, ((i * 53) % 10) / 12 - 0.4], { r: 0.03, rot: [i, i * 2, i * 0.5] });
    const tower = new Kit('clay');
    tower.cyl(C.steelLight, 0.03, 0.9, [0, 0, 0], { seg: 10, mat: 'metal' });
    tower.cyl(C.dark, 0.06, 0.05, [0, 0.9, 0], { seg: 12 });
    tower.cyl(C.dark, 0.06, 0.04, [0, 1.36, 0], { seg: 12 });
    return { ram: r.build('ram'), paper: p.build('chamber-paper'), tower: tower.build('tower') };
  }, []);
  const lamps = useMemo(() => LIGHTS.map(() => new MeshBasicMaterial({ toneMapped: false })), []);
  useEffect(
    () => () => {
      disposeTree(parts.ram);
      disposeTree(parts.paper);
      disposeTree(parts.tower);
      lamps.forEach((l) => l.dispose());
    },
    [parts, lamps],
  );

  useFrame(() => {
    const plateZ = BALER.maxZ - 0.22 - director.ram * 0.95;
    if (ram.current) ram.current.position.z = plateZ;
    if (paper.current) {
      const from = BALER.minZ + 0.16;
      const len = Math.max(0.05, plateZ - 0.07 - from);
      const level = Math.min(1, director.hopper + (director.pressing ? 0.45 : 0));
      paper.current.visible = level > 0.03;
      paper.current.position.z = from + len / 2;
      paper.current.scale.set(1, 0.16 + level * 0.56, len);
    }
    LIGHTS.forEach((light, i) => {
      const lit = status === light.key && (light.key !== 'alarm' || Math.sin(director.t * 8) > -0.2);
      lamps[i]!.color.set(lit ? light.on : '#8a919c').multiplyScalar(lit ? 2.6 : 0.55);
    });
  });

  const y0 = 0.1;
  return (
    <group rotation-y={RAIL_FRAME.heading}>
      <group ref={ram} position={[BALER.x, y0, BALER.maxZ - 0.22]}>
        <primitive object={parts.ram} />
      </group>
      <group ref={paper} position={[BALER.x, y0 + 0.08, 0]}>
        <primitive object={parts.paper} />
      </group>
      <group position={[BALER.x + BALER.halfX + 0.32, 0.06, BALER.minZ + 0.2]}>
        <primitive object={parts.tower} />
        {LIGHTS.map((light, i) => (
          <mesh key={light.key} ref={(mesh) => void (lights.current[i] = mesh)} material={lamps[i]} position={[0, 0.95 + light.y + 0.06, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.1, 14]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ── 번호판 인식 장면 ──────────────────────────────────────────────────

const SCAN_BEAM = new MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
const SCAN_SPOT = new MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });

/**
 * 계근대 위에 선 차의 번호판을 카메라 기둥이 비추는 빛줄기와 번호판 위 밝은 테 (입차·출차 계근 때마다).
 * 번호판 글자는 서버 값만 패널 쪽 표시(핀)에 적는다. 움직임은 월드 시계(director.t)를 따른다(끊기면 멈춘다)
 */
export function PlateScanFx({ director }: { director: Director }) {
  const beam = useRef<Mesh>(null);
  const spot = useRef<Mesh>(null);
  const head = useMemo(() => {
    const [x, z] = PLATE_CAMERA.at;
    const h = PLATE_CAMERA.heading;
    return new Vector3(x + Math.cos(h) * 0.8, 2.5, z - Math.sin(h) * 0.8);
  }, []);
  const tmp = useMemo(() => ({ to: new Vector3(), mid: new Vector3(), up: new Vector3(0, 1, 0), q: new Quaternion(), d: new Vector3() }), []);
  useFrame(() => {
    const s = director.plateScan;
    const show = s.active && s.t > 0.2;
    if (beam.current) beam.current.visible = show;
    if (spot.current) spot.current.visible = show;
    if (!show || !beam.current || !spot.current) return;
    tmp.to.set(s.x, 0.55, s.z);
    tmp.d.subVectors(tmp.to, head);
    const len = tmp.d.length();
    tmp.mid.addVectors(head, tmp.to).multiplyScalar(0.5);
    beam.current.position.copy(tmp.mid);
    tmp.q.setFromUnitVectors(tmp.up, tmp.d.normalize());
    beam.current.quaternion.copy(tmp.q);
    // 인식 전에는 빛줄기가 훑고(깜빡임), 서버가 번호판을 주면 고정된다
    const sweep = s.plate ? 1 : 0.6 + 0.4 * Math.sin(director.t * 9);
    beam.current.scale.set(sweep, len, sweep);
    spot.current.position.copy(tmp.to);
    spot.current.lookAt(head);
    (spot.current.material as MeshBasicMaterial).opacity = s.plate ? 0.7 : 0.3 + 0.3 * Math.abs(Math.sin(director.t * 6));
  });
  return (
    <>
      <mesh ref={beam} material={SCAN_BEAM} visible={false}>
        <cylinderGeometry args={[0.32, 0.04, 1, 16, 1, true]} />
      </mesh>
      <mesh ref={spot} material={SCAN_SPOT.clone()} visible={false}>
        <planeGeometry args={[0.7, 0.32]} />
      </mesh>
    </>
  );
}

// ── 기기를 누르는 영역 ────────────────────────────────────────────────

interface Hit {
  id: DeviceId;
  size: [number, number, number];
  at: [number, number, number];
  rotY: number;
}

function railAtY(u: number, w: number, y: number): [number, number, number] {
  const [x, z] = railAt(u, w);
  return [x, y, z];
}

function pileHit(id: TankId): Hit {
  const poly = PILES[id];
  const [cx, cz] = centroid(poly);
  const r = Math.max(...poly.map(([x, z]) => Math.hypot(x - cx, z - cz)));
  return { id, size: [r * 1.5, 1.9, r * 1.5], at: [cx, 0.95, cz], rotY: 0 };
}

const RAIL_MID = (RAIL.startU + RAIL.endU) / 2;
const HITS: Hit[] = [
  ...TANK_IDS.map(pileHit),
  { id: 'conveyor-z', size: [RAIL.endU - RAIL.startU, 1.4, RAIL.width + 0.3], at: railAtY(RAIL_MID, 0, railY(RAIL_MID) - 0.3), rotY: RAIL_FRAME.heading },
  { id: 'compressor-1', size: [2.1, 2.2, BALER.backZ - BALER.outletZ], at: railAtY(BALER.x, -(BALER.backZ + BALER.outletZ) / 2, 1.1), rotY: RAIL_FRAME.heading },
];

export function DeviceHits({ onSelect }: { onSelect: (key: string) => void }) {
  const gl = useThree((s) => s.gl);
  return (
    <>
      {HITS.map((hit) => (
        <mesh
          key={hit.id}
          material={HIT}
          position={hit.at}
          rotation-y={hit.rotY}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelect(`dev:${hit.id}`);
          }}
          onPointerOver={() => void (gl.domElement.style.cursor = 'pointer')}
          onPointerOut={() => void (gl.domElement.style.cursor = '')}
        >
          <boxGeometry args={hit.size} />
        </mesh>
      ))}
    </>
  );
}
