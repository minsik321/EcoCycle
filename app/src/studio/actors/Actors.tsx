import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Color, Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { InstancedMesh, Mesh } from 'three';
import { C, TRUCK_STRIPE } from '../theme';
import { MAT, chunkGeometry, disposeTree } from '../three/kit';
import { blobShadow } from '../three/bakedShadow';
import type { Director } from '../sim/director';
import { BALE, CLAMP_SCALE, CLAMP_SHIFT, FORKLIFT_SCALE, LOAD_TRUCK, TRUCK, WORKER_SCALE, YARD_FRAME, groundY } from '../world/layout';
import type { TruckModel } from './build';
import { CLAMP_H, MAST_H, buildBale, buildCargoTruck, buildForklift, buildTruck, buildWorker } from './build';
import { BEAM_OUT, FOOT_DROP, TINE_COUNT, TINE_HINGE_R, TINE_HINGE_Y, buildGrappleTruck, tineGeometry } from './grappleTruck';
import type { GrappleModel } from './grappleTruck';
import { DROP_SEC, GRAPPLE_TRUCK } from '../sim/grapple';
import type { TruckSim } from '../sim/director';

// 스스로 움직이는 것들을 그린다. 위치·자세는 모두 Director가 정하고 여기서는 옮겨 적기만 한다.
// (Director가 멈추면 이 컴포넌트들도 같은 값을 다시 적을 뿐이라 화면이 멈춘다.)

const GROUND_Y = 0.03;
const BED_MAX = 0.84;
/** 카고 옆판을 다 내렸을 때 돈 각도 (거의 수직으로 매달리되 바퀴에 닿지 않게 조금 바깥으로) */
const SIDE_DROP = Math.PI * 0.97;
/** 클램프 판을 넓혀 베일 끝면(긴 쪽 1.5 m)을 잡을 때의 판 자리 (클램프 모형 좌표, 돌려 잡기 S2j) */
const JAW_WIDE_Z = (BALE.d / 2) * 1.03 / CLAMP_SCALE + 0.0125 + 0.025;
/** 클램프 위 끝 높이(지게차 모형 좌표, 클램프 배율을 곱한 값) */
const CLAMP_TOP = (CLAMP_H * CLAMP_SCALE) / FORKLIFT_SCALE;
const POUR_PER_TRUCK = 28;
const tmpEuler = new Euler();

interface ActorProps {
  director: Director;
  onSelect: (key: string) => void;
  /** 실시간 그림자가 없는 단계(low): 차량 아래에 둥근 그림자를 단다 */
  blobs?: boolean;
  /** low: 집게차의 크레인·집게를 상자 몇 개로 (갈퀴 인스턴스 없음) */
  lite?: boolean;
}

const stop = (e: ThreeEvent<MouseEvent>, fn: () => void) => {
  e.stopPropagation();
  fn();
};

/** 트럭 칸마다 덤프(입고)와 25톤 카고(상차) 모형을 하나씩 두고, 서버 kind에 맞는 쪽만 보인다. 덤프는 축마다 TRUCK.sx·sy·sz배, 카고는 월드 크기 그대로 */
interface TruckPair {
  dump: TruckModel;
  cargo: TruckModel;
  /** 입고 집게차 (S2m). low와 그 밖의 단계는 모형이 달라 단계가 바뀌면 다시 만든다 */
  grapple: GrappleModel;
}

/** 갈퀴 인스턴스 칸: 집게차 한 대에 TINE_COUNT개, 이만큼의 집게차까지 (넘는 차는 갈퀴 없이 머리만) */
const TINE_TRUCKS = 12;

// 차량 띠 색(TRUCK_STRIPE)은 번호판 인식 전후로 같다(S2n). 전에는 인식 뒤 서버 회사 이름으로 띠 색(빨강 등)을 바꿔
// 같은 차가 계근대에서 갑자기 다른 차처럼 보였다(사용자 지적 2026-11-27). 회사는 핀·패널 글자로 알린다

function makeGrapple(i: number, lite: boolean): GrappleModel {
  const g = buildGrappleTruck(i, lite);
  g.stripe.color.set(TRUCK_STRIPE);
  g.root.rotation.order = 'YZX';
  g.root.userData.truckIndex = i;
  g.root.visible = false;
  return g;
}

/** 집게차 마디에 크레인 자세·받침다리·집게를 옮겨 적는다 */
function poseGrapple(model: GrappleModel, sim: TruckSim): void {
  const c = sim.crane;
  model.column.rotation.y = c.pose.slew;
  model.boom1.rotation.z = c.pose.a1;
  model.boom2.rotation.z = c.pose.a2;
  model.mid.position.x = c.pose.ext / 2;
  model.ext.position.x = c.pose.ext;
  // 집게는 늘 아래로 매달린다
  model.head.rotation.z = -(c.pose.a1 + c.pose.a2);
  model.held.visible = c.holding;
  const out = Math.min(1, c.legs * 2);
  const down = Math.max(0, c.legs * 2 - 1);
  model.beams.forEach((b, side) => {
    b.position.z = (side === 0 ? -1 : 1) * (GRAPPLE_TRUCK.width / 2 - 0.2 + out * BEAM_OUT);
  });
  for (const f of model.feet) f.position.y = -down * FOOT_DROP + 0.02;
  model.jaws.forEach((jaw, side) => {
    jaw.rotation.z = (side === 0 ? -1 : 1) * (1 - c.jaw) * 0.7;
  });
}

/** 쏟아지는 파지 칸(동시에 쏟는 트럭 수). 쏟는 자리는 더미 앞 둘뿐이라 넉넉히 넷: 쏟는 트럭에만 차례로 준다 */
const POUR_SLOTS = 4;

function makePair(i: number, lite: boolean): TruckPair {
  const pair = { dump: buildTruck(i), cargo: buildCargoTruck(i), grapple: makeGrapple(i, lite) };
  for (const m of [pair.dump, pair.cargo]) m.stripe.color.set(TRUCK_STRIPE);
  // 상차 트럭(25톤 카고)은 월드 단위로 만들었다(배율 1). 덤프만 축마다 배율을 준다
  pair.cargo.root.rotation.order = 'YZX';
  pair.cargo.root.userData.truckIndex = i;
  pair.cargo.root.visible = false;
  for (const m of [pair.dump]) {
    m.root.scale.set(TRUCK.sx, TRUCK.sy, TRUCK.sz);
    // 길이 배율이 높이 배율보다 커서 바퀴가 타원이 된다: 바퀴마다 받침을 끼워 앞뒤 배율을 되돌린다 (돌리는 것은 안쪽 그룹)
    for (const w of m.wheels) {
      const holder = new Group();
      holder.position.copy(w.position);
      holder.scale.set(TRUCK.sy / TRUCK.sx, 1, 1);
      w.position.set(0, 0, 0);
      m.root.remove(w);
      holder.add(w);
      m.root.add(holder);
    }
    m.root.rotation.order = 'YZX';
    m.root.userData.truckIndex = i;
    m.root.visible = false;
  }
  return pair;
}

export function Trucks({ director, onSelect, blobs = false, lite = false }: ActorProps) {
  // 트럭 칸은 서버의 회사 안 차량 수만큼 늘어난다(Director.trucks): 모자라면 이 자리에서 모형을 더 만든다 (상한 없음)
  const [count, setCount] = useState(director.trucks.length);
  const pairsRef = useRef<TruckPair[]>([]);
  const pairs = useMemo(() => {
    const list = pairsRef.current;
    // 화질 단계가 low와 그 밖 사이로 바뀌면 집게차 모형만 다시 만든다
    list.forEach((p, i) => {
      if (p.grapple.lite === lite) return;
      disposeTree(p.grapple.root);
      p.grapple.stripe.dispose();
      p.grapple = makeGrapple(i, lite);
    });
    while (list.length < count) list.push(makePair(list.length, lite));
    return list.slice(0, count);
  }, [count, lite]);
  useEffect(() => {
    const list = pairsRef.current;
    return () => {
      list.forEach((p) =>
        [p.dump, p.cargo, p.grapple].forEach((m) => {
          disposeTree(m.root);
          m.stripe.dispose();
        }),
      );
      list.length = 0;
    };
  }, []);
  const models = useMemo(() => pairs.flatMap((p) => [p.dump, p.cargo, p.grapple]), [pairs]);
  useEffect(() => {
    if (!blobs) return;
    const added = models.map((m) => {
      // 덤프는 모형 크기(그룹 배율로 커진다), 카고는 월드 크기
      const b = pairs.some((p) => p.cargo === m)
        ? blobShadow(LOAD_TRUCK.length, LOAD_TRUCK.width)
        : pairs.some((p) => p.grapple === m)
          ? blobShadow(GRAPPLE_TRUCK.length, GRAPPLE_TRUCK.width)
          : blobShadow(2.9, 1.16);
      m.root.add(b);
      return b;
    });
    return () => added.forEach((b) => b.removeFromParent());
  }, [models, pairs, blobs]);
  const pour = useRef<InstancedMesh>(null);
  const tines = useRef<InstancedMesh>(null);
  const tine = useMemo(() => tineGeometry(), []);
  useEffect(() => () => tine.dispose(), [tine]);
  const geometry = useMemo(() => chunkGeometry(0.2, 0.1, 0.15, 0.03), []);
  const tmp = useMemo(() => ({ m: new Matrix4(), m2: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(), axis: new Vector3(0.6, 0.5, 0.62).normalize(), color: new Color() }), []);

  useEffect(() => {
    const tones = [C.kraft, C.kraftLight, C.paper, C.kraftDark, C.paperGrey];
    const mesh = pour.current;
    if (mesh) {
      for (let i = 0; i < mesh.count; i += 1) mesh.setColorAt(i, tmp.color.set(tones[i % tones.length]!));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return () => geometry.dispose();
  }, [geometry, tmp]);

  useFrame(() => {
    if (director.trucks.length > count) setCount(director.trucks.length);
    const mesh = pour.current;
    const tineMesh = tines.current;
    let slot = 0;
    let tineSlot = 0;
    director.trucks.forEach((sim, i) => {
      const pair = pairs[i];
      if (!pair) return;
      const model = sim.outbound ? pair.cargo : sim.grapple ? pair.grapple : pair.dump;
      // 보이지 않는 모형은 장면 그래프의 행렬 갱신도 건너뛴다 (트럭 칸마다 모형이 셋이라 숨은 쪽이 매 장 부담이 된다)
      for (const m of [pair.dump, pair.cargo, pair.grapple]) {
        if (m === model) continue;
        m.root.visible = false;
        m.root.matrixWorldAutoUpdate = false;
      }
      model.root.visible = sim.active;
      model.root.matrixWorldAutoUpdate = sim.active;
      if (sim.active) {
        // 경사로·비탈 도로: 앞뒤 바퀴 자리의 바닥 높이로 차체를 기울인다
        const axle = sim.outbound ? LOAD_TRUCK.length * 0.38 : sim.grapple ? GRAPPLE_TRUCK.length * 0.36 : 1.45;
        const fx = Math.cos(sim.heading) * axle;
        const fz = -Math.sin(sim.heading) * axle;
        const yf = groundY(sim.x + fx, sim.z + fz);
        const yb = groundY(sim.x - fx, sim.z - fz);
        model.root.position.set(sim.x, GROUND_Y + (yf + yb) / 2, sim.z);
        model.root.rotation.set(0, sim.heading, Math.atan2(yf - yb, axle * 2));
        // 낮은 카고의 옆판: 아래 모서리를 축으로 바깥 아래로 내려간다 (sides[0]은 −z 쪽)
        model.sides.forEach((w, side) => {
          w.rotation.x = (side === 0 ? -1 : 1) * sim.sides * SIDE_DROP;
        });
        const angle = sim.bedTilt * BED_MAX;
        model.bed.rotation.z = angle;
        model.gate.rotation.z = -angle * 1.3;
        model.load.visible = sim.load > 0.02;
        model.load.scale.set(1, Math.max(0.08, sim.load), 1);
        if (model === pair.grapple) {
          poseGrapple(pair.grapple, sim);
          if (tineMesh && !lite && tineSlot < TINE_TRUCKS) {
            // 갈퀴 여섯 개: 집게 머리의 월드 행렬 × (둘레 자리 · 벌림 각)
            model.root.updateMatrixWorld(true);
            const open = (1 - sim.crane.jaw) * 0.75 - 0.08;
            for (let j = 0; j < TINE_COUNT; j += 1) {
              const a = (j / TINE_COUNT) * Math.PI * 2;
              tmp.q.setFromEuler(tmpEuler.set(0, a, open, 'YZX'));
              tmp.p.set(Math.cos(a) * TINE_HINGE_R, TINE_HINGE_Y, -Math.sin(a) * TINE_HINGE_R);
              tmp.m2.compose(tmp.p, tmp.q, tmp.s.setScalar(1));
              tineMesh.setMatrixAt(tineSlot * TINE_COUNT + j, tmp.m.multiplyMatrices(pair.grapple.head.matrixWorld, tmp.m2));
            }
            tineSlot += 1;
          }
        } else model.load.position.x = -(1 - sim.load) * 0.3;
        for (const w of model.wheels) w.rotation.z = -sim.wheel;
        model.beacon.visible = sim.speed > 0.05 && Math.sin(director.t * 9) > 0;
      }
      if (!mesh || !sim.active || !sim.pouring || slot >= POUR_SLOTS) return;
      // 쏟아지는 파지: 꼬리에서 뒤로 미끄러져 떨어진다
      const base = slot * POUR_PER_TRUCK;
      slot += 1;
      const fx = Math.cos(sim.heading);
      const fz = -Math.sin(sim.heading);
      if (sim.grapple) {
        // 집게차: 벌린 집게 아래에서 파지 뭉치가 섹터 쪽 바닥으로 떨어진다 (트럭 좌표 → 월드: 앞 (fx, fz), 옆 +z (−fz, fx))
        const d = sim.crane.drop;
        const wx = sim.x + fx * d.x - fz * d.z;
        const wz = sim.z + fz * d.x + fx * d.z;
        for (let j = 0; j < POUR_PER_TRUCK; j += 1) {
          const a = j * 2.39996;
          const rr = ((j * 37) % 11) / 11;
          const lag = ((j * 13) % 5) / 25;
          const v = Math.max(0, Math.min(1, (sim.crane.dropT - lag) / DROP_SEC));
          const spread = 0.05 + v * 0.3;
          tmp.p.set(wx + Math.cos(a) * rr * spread, Math.max(0.2, d.y - 0.1 - v * v * (d.y - 0.2)), wz + Math.sin(a) * rr * spread);
          tmp.q.setFromAxisAngle(tmp.axis, v * 5 + j);
          tmp.s.setScalar(j < 18 && v < 1 ? (0.6 + ((j * 13) % 7) / 10) * 0.55 : 0);
          mesh.setMatrixAt(base + j, tmp.m.compose(tmp.p, tmp.q, tmp.s));
        }
        return;
      }
      for (let j = 0; j < POUR_PER_TRUCK; j += 1) {
        const u = (sim.pourT * 0.9 + j / POUR_PER_TRUCK) % 1;
        const side = ((j * 37) % 17) / 17 - 0.5;
        const back = (1.5 + u * 0.95) * TRUCK.sx;
        tmp.p.set(sim.x - fx * back - fz * side * 1.15, (0.95 - u * u * 0.75 + Math.sin(j * 2.1) * 0.05) * TRUCK.sy, sim.z - fz * back + fx * side * 1.15);
        tmp.q.setFromAxisAngle(tmp.axis, u * 7 + j);
        const scale = (0.7 + ((j * 13) % 7) / 10) * TRUCK.sy;
        tmp.s.setScalar(scale * Math.min(1, u * 8) * Math.min(1, (1 - u) * 5));
        mesh.setMatrixAt(base + j, tmp.m.compose(tmp.p, tmp.q, tmp.s));
      }
    });
    if (mesh) {
      // 쓰지 않은 칸은 지운다
      tmp.m.makeScale(0, 0, 0);
      for (let k = slot * POUR_PER_TRUCK; k < POUR_SLOTS * POUR_PER_TRUCK; k += 1) mesh.setMatrixAt(k, tmp.m);
    }
    if (mesh) mesh.instanceMatrix.needsUpdate = true;
    if (tineMesh) {
      tmp.m.makeScale(0, 0, 0);
      for (let k = tineSlot * TINE_COUNT; k < TINE_TRUCKS * TINE_COUNT; k += 1) tineMesh.setMatrixAt(k, tmp.m);
      tineMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {models.map((model, k) => (
        <primitive
          key={k}
          object={model.root}
          onClick={(e: ThreeEvent<MouseEvent>) =>
            stop(e, () => {
              const t = director.trucks[model.root.userData.truckIndex as number];
              if (t?.active) onSelect(`veh:${t.id}`);
            })
          }
        />
      ))}
      <instancedMesh ref={pour} args={[geometry, MAT.clay, POUR_SLOTS * POUR_PER_TRUCK]} castShadow frustumCulled={false} />
      {!lite && <instancedMesh name="grapple-tines" ref={tines} args={[tine, MAT.metal, TINE_TRUCKS * TINE_COUNT]} castShadow frustumCulled={false} />}
    </>
  );
}

export function Forklifts({ director, onSelect, blobs = false }: ActorProps) {
  // 지게차는 1~2대(설정). 한 대마다 모형 하나
  const models = useMemo(() => {
    const list = director.forklifts.map(() => buildForklift());
    for (const m of list) {
      m.root.scale.setScalar(FORKLIFT_SCALE);
      // 클램프는 베일에 맞춘 크기(CLAMP_SCALE)로, 줄인 마스트 앞에 붙도록 뒤로 당긴다
      m.carriage.scale.setScalar(CLAMP_SCALE / FORKLIFT_SCALE);
      m.carriage.position.x = -CLAMP_SHIFT / FORKLIFT_SCALE;
    }
    return list;
  }, [director]);
  useEffect(() => () => models.forEach((m) => disposeTree(m.root)), [models]);
  useEffect(() => {
    if (!blobs) return;
    const added = models.map((m) => {
      const b = blobShadow(1.3, 0.8);
      m.root.add(b);
      return b;
    });
    return () => added.forEach((b) => b.removeFromParent());
  }, [models, blobs]);

  useFrame(() => {
    director.forklifts.forEach((sim, i) => {
      const model = models[i]!;
      model.root.position.set(sim.x, GROUND_Y, sim.z);
      model.root.rotation.y = sim.heading;
      // 포크 높이는 월드 값(sim.fork): 모형은 FORKLIFT_SCALE배로 그리므로 모형 좌표로 나눈다
      model.carriage.position.y = (sim.fork + 0.02) / FORKLIFT_SCALE;
      // 클램프 위 끝이 바깥 마스트 위로 오르면 가운데·안쪽 마스트가 늘어나 클램프를 받친다 (마스트 위로 클램프가 삐져나오지 않게)
      const ext = Math.max(0, model.carriage.position.y + CLAMP_TOP + 0.05 - MAST_H);
      model.mastStages[0]!.position.y = ext / 2;
      model.mastStages[1]!.position.y = ext;
      model.jaws.forEach((jaw, side) => {
        jaw.position.z = (side === 0 ? -1 : 1) * (0.415 + sim.wide * (JAW_WIDE_Z - 0.415) - sim.clamp * 0.025);
      });
      for (const w of model.wheels) w.rotation.z = -sim.wheel;
      model.beacon.visible = (sim.legs.length > 0 || sim.speed > 0.05) && Math.sin(director.t * 9) > 0;
    });
  });

  // 지게차 좌표는 마당 좌표계다 (sim/yard): 그룹 하나로 월드에 옮긴다
  return (
    <group position={[YARD_FRAME.x, 0, YARD_FRAME.z]} rotation-y={YARD_FRAME.rotY}>
      {models.map((model, i) => (
        <primitive key={i} object={model.root} onClick={(e: ThreeEvent<MouseEvent>) => stop(e, () => onSelect(`forklift:${i + 1}`))} />
      ))}
    </group>
  );
}

/** 베일은 모두 한 지오메트리의 인스턴스다: 칸 수 + 여유만큼 만들어 두고, 쓰지 않는 것은 크기 0으로 접는다. 좌표는 마당 좌표계 */
export function Bales({ director, onSelect }: ActorProps) {
  const source = useMemo(() => {
    const group = buildBale();
    const meshes: Mesh[] = [];
    group.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    return { group, meshes };
  }, []);
  const refs = useRef<Array<InstancedMesh | null>>([]);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(1, 1, 1), zero: new Vector3(0, 0, 0), up: new Vector3(0, 1, 0) }), []);
  // 첫 장 전에 모든 인스턴스를 접어 둔다 (기본 행렬은 원점에 크기 1이라 그대로 두면 한 장 동안 원점에 보인다)
  useEffect(() => {
    for (const mesh of refs.current) {
      if (!mesh) continue;
      for (let i = 0; i < director.bales.length; i += 1) mesh.setMatrixAt(i, tmp.m.compose(tmp.p.set(0, -10, 0), tmp.q.identity(), tmp.zero));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }, [director, tmp]);
  useEffect(() => () => disposeTree(source.group), [source]);

  useFrame(() => {
    const bales = director.bales;
    for (const mesh of refs.current) {
      if (!mesh) continue;
      for (let i = 0; i < bales.length; i += 1) {
        const sim = bales[i]!;
        if (!sim.active) {
          mesh.setMatrixAt(i, tmp.m.compose(tmp.p.set(0, -10, 0), tmp.q.identity(), tmp.zero));
          continue;
        }
        tmp.q.setFromAxisAngle(tmp.up, sim.rot);
        mesh.setMatrixAt(i, tmp.m.compose(tmp.p.set(sim.x, sim.y + (sim.state === 'stack' ? 0.03 : 0.02), sim.z), tmp.q, tmp.s));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    const sim = e.instanceId === undefined ? undefined : director.bales[e.instanceId];
    // 이름 없는 재고·상차 차량에 실린 베일(아이디 없음)은 고르지 않는다
    if (sim?.active && sim.id) stop(e, () => onSelect(`bale:${sim.id}`));
  };

  return (
    <group position={[YARD_FRAME.x, 0, YARD_FRAME.z]} rotation-y={YARD_FRAME.rotY}>
      {source.meshes.map((mesh, k) => (
        <instancedMesh
          key={k}
          ref={(el) => void (refs.current[k] = el)}
          args={[mesh.geometry, mesh.material, director.bales.length]}
          castShadow={mesh.castShadow}
          receiveShadow={mesh.receiveShadow}
          frustumCulled={false}
          onClick={pick}
        />
      ))}
    </group>
  );
}

export function Workers({ director }: { director: Director }) {
  const models = useMemo(
    () =>
      director.workers.map((w, i) => {
        const m = buildWorker(i, w.pose === 'tablet');
        m.root.scale.setScalar(WORKER_SCALE);
        return m;
      }),
    [director],
  );
  useEffect(() => () => models.forEach((m) => disposeTree(m.root)), [models]);

  useFrame(() => {
    const t = director.t;
    director.workers.forEach((sim, i) => {
      const m = models[i]!;
      m.root.position.set(sim.x, GROUND_Y + 0.07, sim.z);
      m.root.rotation.y = sim.heading;
      const swing = sim.moving ? Math.sin(sim.stride) * 0.6 : 0;
      m.legL.rotation.z = swing;
      m.legR.rotation.z = -swing;
      m.body.position.y = 0.42 + (sim.moving ? Math.abs(Math.cos(sim.stride)) * 0.018 : Math.sin(t * 1.6 + i) * 0.004);
      m.head.rotation.y = sim.moving ? 0 : sim.look;
      m.head.rotation.z = 0;
      m.armL.rotation.set(0, 0, -swing * 0.8);
      m.armR.rotation.set(0, 0, swing * 0.8);
      if (sim.pose === 'tablet') {
        m.armR.rotation.z = 0.95;
        m.armL.rotation.z = 0.8 + Math.sin(t * 2.2 + i) * 0.08;
        m.head.rotation.y = 0;
        m.head.rotation.z = -0.28;
      } else if (sim.pose === 'wave') {
        m.armR.rotation.z = 2.5;
        m.armR.rotation.x = Math.sin(t * 4.5) * 0.45;
      }
    });
  });

  return (
    <>
      {models.map((m, i) => (
        <primitive key={i} object={m.root} />
      ))}
    </>
  );
}
