import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Group, InstancedMesh, LineSegments, Mesh, PerspectiveCamera } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Director } from '../sim/director';
import { samplePath } from '../sim/paths';
import { C } from '../theme';
import { useClockWaker } from './motion';
import { frameStats, studioStats } from './stats';

// 장면의 연출 요소: 시간 진행, 환경광, 선택 고리·선 상자, 경로 점선과 목적지 핀, 핀 투영.

/**
 * 그린 장 수와 그린 양을 센다 (측정 화면용). 월드 시계는 Stage의 Pacer가 돌린다
 * (필요할 때만 그리므로, 그리는 횟수와 시계가 따로 간다. 끊기면 Pacer가 시계를 돌리지 않는다).
 */
export function Sim() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    // 후처리가 여러 번 나눠 그리므로 프레임 단위로 직접 합산한다
    const info = gl.info;
    const before = info.autoReset;
    info.autoReset = false;
    return () => {
      info.autoReset = before;
    };
  }, [gl]);
  useFrame(() => {
    frameStats.frames += 1;
    frameStats.lastFrameMs = performance.now();
    // 지난 프레임에 그린 양을 적어 두고 다시 센다
    studioStats.calls = gl.info.render.calls;
    studioStats.triangles = gl.info.render.triangles;
    studioStats.geometries = gl.info.memory.geometries;
    studioStats.textures = gl.info.memory.textures;
    gl.info.reset();
  }, -1);
  return null;
}

/** 부드러운 환경광: 밝은 방 모양의 가상 환경을 한 번 구워 반사·간접광에 쓴다 */
export function EnvLight({ intensity = 0.55 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      target.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/** 선택한 대상 아래에서 퍼지는 고리 */
export function SelectionRing({ director, focusKey }: { director: Director; focusKey: string | null }) {
  const rings = useRef<Array<Mesh | null>>([]);
  const geometry = useMemo(() => new RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), []);
  const materials = useMemo(() => [0, 1, 2].map(() => new MeshBasicMaterial({ color: new Color(C.blue).multiplyScalar(1.6), transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })), []);
  const anchor = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((m) => m.dispose());
    },
    [geometry, materials],
  );

  useClockWaker(director, () => focusKey !== null);
  useFrame(() => {
    const found = focusKey !== null && director.anchor(focusKey, anchor, 'focus');
    const base = focusKey?.startsWith('dev:tank') ? 1.55 : focusKey?.startsWith('dev:compressor') ? 1.9 : focusKey?.startsWith('dev:conveyor') ? 1.7 : focusKey?.startsWith('bale') ? 0.8 : focusKey?.startsWith('forklift') ? 1.0 : 1.7;
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      ring.visible = found;
      if (!found) return;
      // 고리 하나는 제자리, 둘은 시간차로 퍼지며 옅어진다 (월드 시계를 쓰므로 끊기면 멈춘다)
      const u = i === 0 ? 0 : (director.t * 0.55 + (i - 1) * 0.5) % 1;
      ring.position.set(anchor.x, 0.1 + i * 0.004, anchor.z);
      ring.scale.setScalar(base * (1 + u * 0.75));
      materials[i]!.opacity = i === 0 ? 0.95 : (1 - u) * 0.6;
    });
  });

  return (
    <>
      {materials.map((material, i) => (
        <mesh key={i} ref={(mesh) => void (rings.current[i] = mesh)} geometry={geometry} material={material} visible={false} renderOrder={5} />
      ))}
    </>
  );
}

const DOTS = 120;
const DOT_GAP = 0.42;

/**
 * 고른 차량(또는 지게차)이 가는 남은 길을 흐르는 점선으로, 목적지를 지도식 핀으로 그린다 (참고 화면 10).
 * 점이 흐르는 것과 핀이 떠 있는 것은 월드 시계를 쓰므로 끊기면 멈춘다.
 */
export function Routes({ director, keys }: { director: Director; keys: MutableRefObject<string[]> }) {
  const ref = useRef<InstancedMesh>(null);
  const pin = useRef<Group>(null);
  const geometry = useMemo(() => new CylinderGeometry(0.075, 0.075, 0.02, 16), []);
  const material = useMemo(() => new MeshBasicMaterial({ color: new Color(C.blue).multiplyScalar(1.25), toneMapped: false, transparent: true, opacity: 0.9 }), []);
  const pinParts = useMemo(() => {
    const blue = new MeshStandardMaterial({ color: C.blue, roughness: 0.35, metalness: 0 });
    const white = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 });
    const halo = new MeshBasicMaterial({ color: new Color(C.blue), transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    return {
      head: new SphereGeometry(0.24, 28, 20),
      tip: new ConeGeometry(0.155, 0.36, 24).rotateX(Math.PI),
      dot: new SphereGeometry(0.09, 18, 12),
      disc: new CircleGeometry(0.32, 40).rotateX(-Math.PI / 2),
      blue,
      white,
      halo,
    };
  }, []);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(1, 1, 1), pose: { x: 0, z: 0, heading: 0 } }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      Object.values(pinParts).forEach((part) => part.dispose());
    },
    [geometry, material, pinParts],
  );

  useClockWaker(director, () => keys.current.length > 0);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    let end: { x: number; z: number } | null = null;
    const flow = (director.t * 0.8) % DOT_GAP;
    for (const key of keys.current) {
      const route = director.route(key);
      if (!route) continue;
      for (let s = route.from + 1.7 + (DOT_GAP - flow); s < route.path.total - 0.5 && n < DOTS; s += DOT_GAP) {
        samplePath(route.path, s, tmp.pose);
        mesh.setMatrixAt(n, tmp.m.compose(tmp.p.set(tmp.pose.x, 0.05, tmp.pose.z), tmp.q.identity(), tmp.s));
        n += 1;
      }
      samplePath(route.path, route.path.total, tmp.pose);
      end = { x: tmp.pose.x, z: tmp.pose.z };
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    const p = pin.current;
    if (p) {
      p.visible = end !== null;
      if (end) p.position.set(end.x, 0, end.z);
      const head = p.children[0];
      if (head) head.position.y = 0.85 + Math.sin(director.t * 2.4) * 0.05;
    }
  });

  return (
    <>
      <instancedMesh ref={ref} args={[geometry, material, DOTS]} frustumCulled={false} renderOrder={4} />
      <group ref={pin} visible={false}>
        <group>
          <mesh geometry={pinParts.head} material={pinParts.blue} castShadow />
          <mesh geometry={pinParts.tip} material={pinParts.blue} position={[0, -0.26, 0]} castShadow />
          <mesh geometry={pinParts.dot} material={pinParts.white} position={[0, 0.03, 0.18]} scale={[1, 1, 0.5]} />
        </group>
        <mesh geometry={pinParts.disc} material={pinParts.halo} position={[0, 0.04, 0]} renderOrder={4} />
      </group>
    </>
  );
}

/** 고른 대상을 감싸는 가는 선 상자 (참고 화면 06·10). 차량은 방향을 따라 돈다 */
const BOX_SIZE: Record<string, [number, number, number]> = {
  veh: [3.2, 1.95, 1.45],
  forklift: [1.55, 1.85, 1.0],
  bale: [1.1, 0.8, 0.9],
  'dev:robot-1': [2.4, 3.6, 2.4],
  'dev:conveyor-z': [8.1, 1.1, 1.4],
  'dev:compressor-1': [2.3, 2.1, 5.4],
  dev: [3.7, 2.1, 1.6],
};

export function SelectionBox({ director, focusKey }: { director: Director; focusKey: string | null }) {
  const ref = useRef<LineSegments>(null);
  const geometry = useMemo(() => new EdgesGeometry(new BoxGeometry(1, 1, 1)), []);
  const material = useMemo(() => new LineBasicMaterial({ color: new Color(C.blue).multiplyScalar(1.2), transparent: true, opacity: 0.75, toneMapped: false }), []);
  const anchor = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useClockWaker(director, () => focusKey !== null);
  useFrame(() => {
    const box = ref.current;
    if (!box) return;
    const found = focusKey !== null && director.anchor(focusKey, anchor, 'focus');
    box.visible = found;
    if (!found || !focusKey) return;
    const kind = focusKey.split(':')[0] ?? '';
    const size = BOX_SIZE[focusKey] ?? BOX_SIZE[kind] ?? BOX_SIZE.dev!;
    box.scale.set(...size);
    box.position.set(anchor.x, size[1] / 2 + 0.03, anchor.z);
    box.rotation.y = director.heading(focusKey);
    material.opacity = 0.55 + Math.sin(director.t * 3) * 0.2;
  });
  return <lineSegments ref={ref} geometry={geometry} material={material} visible={false} renderOrder={5} />;
}

export type PinElements = Record<string, HTMLElement | null>;

/** HTML 핀의 위치를 매 프레임 화면 좌표로 써 넣는다 (대상이 없으면 숨긴다) */
export function PinLayer({ director, pins }: { director: Director; pins: MutableRefObject<PinElements> }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new Vector3(), []);
  const anchor = useMemo(() => ({ x: 0, y: 0, z: 0 }), []);
  const zoom = useRef('');
  useFrame(() => {
    // 멀리서 볼 때는 핀을 작게 줄인다 (바닥 1m가 화면에서 몇 픽셀인지로 판단)
    const pxPerUnit = (size.height / (2 * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360))) / Math.max(1, camera.position.length());
    // 폰 폭에서는 섹터 핀 네 개가 붙어 겹치므로 늘 멀리 보는 모양(섹터는 적재율 고리만)
    const level = pxPerUnit < 36 || size.width < 600 ? 'far' : pxPerUnit < 60 ? 'mid' : 'near';
    if (level !== zoom.current) {
      const first = Object.values(pins.current).find((el) => el);
      const holder = first?.parentElement;
      if (holder) {
        holder.dataset.zoom = level;
        zoom.current = level;
      }
    }
    for (const key in pins.current) {
      const el = pins.current[key];
      if (!el) continue;
      if (!director.anchor(key, anchor, 'pin')) {
        el.style.visibility = 'hidden';
        continue;
      }
      v.set(anchor.x, anchor.y, anchor.z).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.2) {
        el.style.visibility = 'hidden';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.visibility = 'visible';
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.zIndex = String(Math.round((1 - v.z) * 100000));
    }
  });
  return null;
}
