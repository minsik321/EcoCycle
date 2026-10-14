import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { Group, InstancedMesh, Mesh } from 'three';
import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, DeviceStatus, SectorGrade, TankId } from '@ecocycle/shared';
import { buildLump } from '../actors/build';
import type { Director } from '../sim/director';
import { C } from '../theme';
import { Kit, MAT, chunkGeometry, disposeTree } from '../three/kit';
import { BALER, BAY, BAY_Z, CONVEYOR, GATE, HALL, ROAD, deviceCenter } from './layout';
import { buildWorld } from './buildWorld';

// 월드의 고정물과, 기기 값에 따라 움직이는 부분(벨트·램·더미·차단기).

const HIT = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/** 고정물. 카메라 쪽을 향한 본관 벽은 숨겨 안이 보이게 한다 */
export function World() {
  const world = useMemo(buildWorld, []);
  const camera = useThree((s) => s.camera);
  useEffect(
    () => () => {
      disposeTree(world.base);
      world.walls.forEach((w) => disposeTree(w.group));
    },
    [world],
  );
  useFrame(() => {
    const cx = (HALL.minX + HALL.maxX) / 2;
    const dx = camera.position.x - cx;
    const dz = camera.position.z;
    const len = Math.hypot(dx, dz) || 1;
    for (const wall of world.walls) wall.group.visible = (wall.nx * dx + wall.nz * dz) / len < 0.18;
  });
  return (
    <>
      <primitive object={world.base} />
      {world.walls.map((w) => (
        <primitive key={w.group.name} object={w.group} />
      ))}
    </>
  );
}

// ── 섹터의 파지 더미 ──────────────────────────────────────────────────

const PER_BAY = 300;
const PILE_TONES: Record<SectorGrade, string[]> = {
  // 등급은 서버 값이다. 화면은 등급에 따라 색 섞임만 달리한다
  A: [C.paper, C.paper, C.paperGrey, C.kraftLight, '#ffffff', C.paper],
  C: [C.kraft, C.kraftLight, C.kraftDark, C.kraft, C.paperGrey, C.kraftLight],
};

interface Chunk {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
}

/** 칸 하나의 조각 자리: 아래층부터 차곡차곡, 위로 갈수록 좁아지는 더미 */
function pileChunks(id: TankId, seed0: number): Chunk[] {
  let seed = seed0;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const [z0, z1] = BAY_Z[id];
  const out: Chunk[] = [];
  const layers = 7;
  const weights = Array.from({ length: layers }, (_, i) => (layers - i * 0.72) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  for (let layer = 0; layer < layers; layer += 1) {
    const count = Math.round((weights[layer]! / total) * PER_BAY);
    const inset = layer * 0.11;
    for (let i = 0; i < count && out.length < PER_BAY; i += 1) {
      out.push({
        x: BAY.minX + 0.22 + inset * 0.7 + rnd() * (BAY.maxX - BAY.minX - 0.5 - inset * 2.2),
        y: 0.14 + layer * (BAY.pileMaxH / layers) + rnd() * 0.07,
        z: z0 + 0.2 + inset + rnd() * (z1 - z0 - 0.4 - inset * 2),
        rx: (rnd() - 0.5) * 0.9,
        ry: rnd() * Math.PI,
        rz: (rnd() - 0.5) * 0.9,
        s: 0.8 + rnd() * 0.55,
      });
    }
  }
  return out;
}

export function Piles({ director, grades }: { director: Director; grades: Partial<Record<TankId, SectorGrade>> }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => chunkGeometry(0.34, 0.2, 0.27, 0.05), []);
  const chunks = useMemo(() => TANK_IDS.map((id, i) => pileChunks(id, 11 + i * 101)), []);
  const shown = useRef<number[]>([-1, -1, -1, -1]);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(), e: new Color() }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const gradeKey = TANK_IDS.map((id) => grades[id] ?? '-').join('');
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    TANK_IDS.forEach((id, b) => {
      const tones = PILE_TONES[grades[id] ?? 'C'];
      for (let i = 0; i < PER_BAY; i += 1) mesh.setColorAt(b * PER_BAY + i, tmp.e.set(tones[(i * 7 + b) % tones.length]!));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // gradeKey(등급 묶음)가 바뀔 때만 다시 칠한다
  }, [gradeKey, tmp]);

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
        if (i < count) {
          tmp.q.setFromAxisAngle(tmp.p.set(c.rx, 1, c.rz).normalize(), c.ry);
          mesh.setMatrixAt(b * PER_BAY + i, tmp.m.compose(tmp.p.set(c.x, c.y, c.z), tmp.q, tmp.s.setScalar(c.s)));
        } else {
          mesh.setMatrixAt(b * PER_BAY + i, tmp.m.makeScale(0, 0, 0));
        }
      });
    });
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, MAT.clay, PER_BAY * TANK_IDS.length]} castShadow receiveShadow frustumCulled={false} />;
}

// ── 컨베이어 벨트와 뭉치 ──────────────────────────────────────────────

const SLAT_GAP = 0.24;

export function Belt({ director }: { director: Director }) {
  const length = CONVEYOR.startX - CONVEYOR.endX;
  const count = Math.floor(length / SLAT_GAP);
  const slats = useRef<InstancedMesh>(null);
  const body = useMemo(() => {
    const k = new Kit('clay');
    k.box('#434b5a', [length, 0.07, CONVEYOR.width], [(CONVEYOR.startX + CONVEYOR.endX) / 2, CONVEYOR.topY - 0.075, CONVEYOR.z], { r: 0.03 });
    return k.build('belt');
  }, [length]);
  const slatGeometry = useMemo(() => chunkGeometry(0.07, 0.012, CONVEYOR.width - 0.1, 0.004), []);
  const lumps = useMemo(() => director.lumps.map((_, i) => buildLump(i + 1)), [director]);
  const m = useMemo(() => new Matrix4(), []);
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
    const tone = new Color('#5d6676');
    for (let i = 0; i < count; i += 1) mesh.setColorAt(i, tone);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count]);

  useFrame(() => {
    const mesh = slats.current;
    if (mesh) {
      const span = count * SLAT_GAP;
      for (let i = 0; i < count; i += 1) {
        const d = (i * SLAT_GAP + director.beltOffset) % span;
        mesh.setMatrixAt(i, m.makeTranslation(CONVEYOR.startX - 0.06 - d * ((length - 0.12) / span), CONVEYOR.topY - 0.002, CONVEYOR.z));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    director.lumps.forEach((sim, i) => {
      const lump = lumps[i]!;
      lump.visible = sim.active;
      if (!sim.active) return;
      const d = sim.drop;
      lump.position.set(d > 0 ? CONVEYOR.endX - d * 0.4 : sim.x, CONVEYOR.topY + 0.02 - d * d * 0.75, CONVEYOR.z + (((sim.seed * 31) % 9) / 9 - 0.5) * 0.3);
      lump.rotation.set(d * 1.5, sim.seed * 1.3, 0);
      lump.scale.setScalar(1 - d * 0.35);
    });
  });

  return (
    <>
      <primitive object={body} />
      <instancedMesh ref={slats} args={[slatGeometry, MAT.clay, count]} frustumCulled={false} />
      {lumps.map((lump, i) => (
        <primitive key={i} object={lump} />
      ))}
    </>
  );
}

// ── 압축기의 움직이는 부분 ────────────────────────────────────────────

const LIGHTS: Array<{ key: Exclude<DeviceStatus, 'offline'>; on: string; y: number }> = [
  { key: 'alarm', on: '#ff5a4a', y: 0.3 },
  { key: 'caution', on: '#ffb347', y: 0.18 },
  { key: 'normal', on: '#5fdc8a', y: 0.06 },
];

export function BalerParts({ director, status }: { director: Director; status: DeviceStatus }) {
  const ram = useRef<Group>(null);
  const paper = useRef<Group>(null);
  const lights = useRef<Array<Mesh | null>>([]);
  const parts = useMemo(() => {
    const r = new Kit('gloss');
    r.box(C.yellow, [BALER.halfX * 2 - 0.34, 0.74, 0.12], [0, 0.2, 0], { r: 0.04, seg: 3 });
    r.box(C.yellowDeep, [BALER.halfX * 2 - 0.5, 0.1, 0.16], [0, 0.86, 0], { r: 0.03 });
    r.cyl(C.steelLight, 0.11, 1.5, [0, 0.56, 0.8], { axis: 'z', mat: 'metal' });
    const p = new Kit('clay');
    p.box(C.kraft, [BALER.halfX * 2 - 0.36, 1, 1], [0, 0, 0], { r: 0.08, seg: 3 });
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
    <>
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
    </>
  );
}

// ── 정문 차단기 ───────────────────────────────────────────────────────

export function GateArms({ director }: { director: Director }) {
  const inArm = useRef<Group>(null);
  const outArm = useRef<Group>(null);
  const arm = useMemo(() => {
    const k = new Kit('gloss');
    const len = (ROAD.maxZ - ROAD.minZ) / 2 - 0.05;
    k.box(C.white, [0.07, 0.09, len], [0, -0.045, len / 2 + 0.1], { r: 0.03 });
    for (let i = 0; i < 4; i += 1) k.box(C.yellow, [0.075, 0.095, 0.16], [0, -0.0475, 0.36 + i * 0.36], { r: 0.03 });
    k.box(C.dark, [0.2, 0.26, 0.26], [0, -0.13, 0], { r: 0.06, mat: 'clay' });
    return k.build('gate-arm');
  }, []);
  const arm2 = useMemo(() => arm.clone(), [arm]);
  useEffect(() => () => disposeTree(arm), [arm]);
  useFrame(() => {
    if (inArm.current) inArm.current.rotation.x = -director.gateIn * 1.4;
    if (outArm.current) outArm.current.rotation.x = -director.gateOut * 1.4;
  });
  return (
    <>
      <group ref={inArm} position={[GATE.x, 1.0, ROAD.minZ - 0.02]}>
        <primitive object={arm} />
      </group>
      {/* 나가는 차로 쪽은 반대편 기둥에서 뻗는다 */}
      <group position={[GATE.x, 1.0, ROAD.maxZ + 0.02]} rotation={[0, Math.PI, 0]}>
        <group ref={outArm}>
          <primitive object={arm2} />
        </group>
      </group>
    </>
  );
}

// ── 기기를 누르는 영역 ────────────────────────────────────────────────

const HITS: Array<{ id: DeviceId; size: [number, number, number]; lift: number }> = [
  ...TANK_IDS.map((id) => ({ id, size: [BAY.maxX - BAY.minX, 1.9, BAY.width - 0.1] as [number, number, number], lift: 0.4 })),
  { id: 'conveyor-z', size: [CONVEYOR.startX - CONVEYOR.endX, 1.7, CONVEYOR.width + 0.3], lift: -0.55 },
  { id: 'compressor-1', size: [2.1, 2.0, 5.2], lift: 0.25 },
];

export function DeviceHits({ onSelect }: { onSelect: (key: string) => void }) {
  const gl = useThree((s) => s.gl);
  return (
    <>
      {HITS.map((hit) => {
        const [x, y, z] = deviceCenter(hit.id);
        return (
          <mesh
            key={hit.id}
            material={HIT}
            position={[x, y + hit.lift, hit.id === 'compressor-1' ? z + 0.2 : z]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect(`dev:${hit.id}`);
            }}
            onPointerOver={() => void (gl.domElement.style.cursor = 'pointer')}
            onPointerOut={() => void (gl.domElement.style.cursor = '')}
          >
            <boxGeometry args={hit.size} />
          </mesh>
        );
      })}
    </>
  );
}
