import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import type { InstancedMesh, Mesh } from 'three';
import { C, UNKNOWN_STRIPE, companyStripe } from '../theme';
import { MAT, chunkGeometry, disposeTree } from '../three/kit';
import { blobShadow } from '../three/bakedShadow';
import type { Director } from '../sim/director';
import { FORKLIFT_SCALE, TRUCK, YARD_FRAME, groundY } from '../world/layout';
import type { TruckModel } from './build';
import { buildBale, buildForklift, buildTruck, buildWorker } from './build';

// 스스로 움직이는 것들을 그린다. 위치·자세는 모두 Director가 정하고 여기서는 옮겨 적기만 한다.
// (Director가 멈추면 이 컴포넌트들도 같은 값을 다시 적을 뿐이라 화면이 멈춘다.)

const GROUND_Y = 0.03;
const BED_MAX = 0.84;
const POUR_PER_TRUCK = 28;

interface ActorProps {
  director: Director;
  onSelect: (key: string) => void;
  /** 실시간 그림자가 없는 단계(low): 차량 아래에 둥근 그림자를 단다 */
  blobs?: boolean;
}

const stop = (e: ThreeEvent<MouseEvent>, fn: () => void) => {
  e.stopPropagation();
  fn();
};

/** 트럭 칸마다 덤프(입고)와 윙바디(상차) 모형을 하나씩 두고, 서버 kind에 맞는 쪽만 보인다. 모형은 TRUCK.scale배로 그린다 */
interface TruckPair {
  dump: TruckModel;
  wing: TruckModel;
}

/** 쏟아지는 파지 칸(동시에 쏟는 트럭 수). 쏟는 자리는 더미 앞 둘뿐이라 넉넉히 넷: 쏟는 트럭에만 차례로 준다 */
const POUR_SLOTS = 4;

function makePair(i: number): TruckPair {
  const pair = { dump: buildTruck(i, 'dump'), wing: buildTruck(i, 'wing') };
  for (const m of [pair.dump, pair.wing]) {
    m.root.scale.setScalar(TRUCK.scale);
    m.root.rotation.order = 'YZX';
    m.root.userData.truckIndex = i;
    m.root.visible = false;
  }
  return pair;
}

export function Trucks({ director, onSelect, blobs = false }: ActorProps) {
  // 트럭 칸은 서버의 회사 안 차량 수만큼 늘어난다(Director.trucks): 모자라면 이 자리에서 모형을 더 만든다 (상한 없음)
  const [count, setCount] = useState(director.trucks.length);
  const pairsRef = useRef<TruckPair[]>([]);
  const pairs = useMemo(() => {
    const list = pairsRef.current;
    while (list.length < count) list.push(makePair(list.length));
    return list.slice(0, count);
  }, [count]);
  useEffect(() => {
    const list = pairsRef.current;
    return () => {
      list.forEach((p) =>
        [p.dump, p.wing].forEach((m) => {
          disposeTree(m.root);
          m.stripe.dispose();
        }),
      );
      list.length = 0;
    };
  }, []);
  const models = useMemo(() => pairs.flatMap((p) => [p.dump, p.wing]), [pairs]);
  useEffect(() => {
    if (!blobs) return;
    const added = models.map((m) => {
      const b = blobShadow(2.9, 1.16);
      m.root.add(b);
      return b;
    });
    return () => added.forEach((b) => b.removeFromParent());
  }, [models, blobs]);
  const pour = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => chunkGeometry(0.2, 0.1, 0.15, 0.03), []);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(), axis: new Vector3(0.6, 0.5, 0.62).normalize(), color: new Color() }), []);

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
    let slot = 0;
    director.trucks.forEach((sim, i) => {
      const pair = pairs[i];
      if (!pair) return;
      const model = sim.outbound ? pair.wing : pair.dump;
      (sim.outbound ? pair.dump : pair.wing).root.visible = false;
      model.root.visible = sim.active;
      if (sim.active) {
        // 경사로·비탈 도로: 앞뒤 바퀴 자리의 바닥 높이로 차체를 기울인다
        const fx = Math.cos(sim.heading) * 1.45;
        const fz = -Math.sin(sim.heading) * 1.45;
        const yf = groundY(sim.x + fx, sim.z + fz);
        const yb = groundY(sim.x - fx, sim.z - fz);
        model.root.position.set(sim.x, GROUND_Y + (yf + yb) / 2, sim.z);
        model.root.rotation.set(0, sim.heading, Math.atan2(yf - yb, 2.9));
        model.stripe.color.set(sim.company ? companyStripe(sim.company) : UNKNOWN_STRIPE);
        model.wings.forEach((w, side) => {
          w.rotation.x = (side === 0 ? 1 : -1) * sim.wing * 1.25;
        });
        const angle = sim.bedTilt * BED_MAX;
        model.bed.rotation.z = angle;
        model.gate.rotation.z = -angle * 1.3;
        model.load.visible = sim.load > 0.02;
        model.load.scale.set(1, Math.max(0.08, sim.load), 1);
        model.load.position.x = -(1 - sim.load) * 0.3;
        for (const w of model.wheels) w.rotation.z = -sim.wheel;
        model.beacon.visible = sim.speed > 0.05 && Math.sin(director.t * 9) > 0;
      }
      if (!mesh || !sim.active || !sim.pouring || slot >= POUR_SLOTS) return;
      // 쏟아지는 파지: 꼬리에서 뒤로 미끄러져 떨어진다
      const base = slot * POUR_PER_TRUCK;
      slot += 1;
      const fx = Math.cos(sim.heading);
      const fz = -Math.sin(sim.heading);
      for (let j = 0; j < POUR_PER_TRUCK; j += 1) {
        const u = (sim.pourT * 0.9 + j / POUR_PER_TRUCK) % 1;
        const side = ((j * 37) % 17) / 17 - 0.5;
        const back = (1.5 + u * 0.95) * TRUCK.scale;
        tmp.p.set(sim.x - fx * back - fz * side * 1.15, (0.95 - u * u * 0.75 + Math.sin(j * 2.1) * 0.05) * TRUCK.scale, sim.z - fz * back + fx * side * 1.15);
        tmp.q.setFromAxisAngle(tmp.axis, u * 7 + j);
        const scale = (0.7 + ((j * 13) % 7) / 10) * TRUCK.scale;
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
    </>
  );
}

export function Forklifts({ director, onSelect, blobs = false }: ActorProps) {
  // 지게차는 1~2대(설정). 한 대마다 모형 하나
  const models = useMemo(() => {
    const list = director.forklifts.map(() => buildForklift());
    for (const m of list) m.root.scale.setScalar(FORKLIFT_SCALE);
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
      model.jaws.forEach((jaw, side) => {
        jaw.position.z = (side === 0 ? -1 : 1) * (0.415 - sim.clamp * 0.025);
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
  const models = useMemo(() => director.workers.map((w, i) => buildWorker(i, w.pose === 'tablet')), [director]);
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
