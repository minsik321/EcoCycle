import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Color, DoubleSide, Matrix4, MeshBasicMaterial, PMREMGenerator, Quaternion, RingGeometry, Vector3 } from 'three';
import type { InstancedMesh, Mesh, PerspectiveCamera } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sceneStats } from '../../scene/stats';
import type { Director } from '../sim/director';
import { samplePath } from '../sim/paths';
import { C } from '../theme';
import { chunkGeometry } from './kit';
import { studioStats } from './stats';

// 장면의 연출 요소: 시간 진행, 환경광, 선택 고리, 경로 점선, 핀 투영.

/** 월드 시계를 돌린다. 끊기면(frozen) 돌리지 않아 모든 움직임이 멈춘다 */
export function Sim({ director, frozen }: { director: Director; frozen: boolean }) {
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
  useFrame((_, delta) => {
    sceneStats.frames += 1;
    sceneStats.lastFrameMs = performance.now();
    // 지난 프레임에 그린 양을 적어 두고 다시 센다
    studioStats.calls = gl.info.render.calls;
    studioStats.triangles = gl.info.render.triangles;
    studioStats.geometries = gl.info.memory.geometries;
    studioStats.textures = gl.info.memory.textures;
    gl.info.reset();
    if (!frozen) director.step(delta);
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

  useFrame(() => {
    const found = focusKey !== null && director.anchor(focusKey, anchor, 'focus');
    const base = focusKey?.startsWith('dev:tank') ? 1.55 : focusKey?.startsWith('dev:compressor') ? 1.9 : focusKey?.startsWith('dev:conveyor') ? 1.7 : focusKey?.startsWith('bale') ? 0.9 : 1.35;
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

const DASHES = 160;
const DASH_GAP = 0.55;

/** 움직이는 차량의 남은 경로를 흐르는 점선으로 그린다 */
export function Routes({ director, keys }: { director: Director; keys: MutableRefObject<string[]> }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => chunkGeometry(0.3, 0.02, 0.085, 0.009), []);
  const material = useMemo(() => new MeshBasicMaterial({ color: new Color(C.blue).multiplyScalar(1.35), toneMapped: false }), []);
  const tmp = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), p: new Vector3(), s: new Vector3(1, 1, 1), up: new Vector3(0, 1, 0), pose: { x: 0, z: 0, heading: 0 } }), []);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let n = 0;
    const flow = (director.t * 0.9) % DASH_GAP;
    for (const key of keys.current) {
      const route = director.route(key);
      if (!route) continue;
      for (let s = route.from + 1.9 + (DASH_GAP - flow); s < route.path.total - 0.2 && n < DASHES; s += DASH_GAP) {
        samplePath(route.path, s, tmp.pose);
        tmp.q.setFromAxisAngle(tmp.up, tmp.pose.heading);
        mesh.setMatrixAt(n, tmp.m.compose(tmp.p.set(tmp.pose.x, 0.05, tmp.pose.z), tmp.q, tmp.s));
        n += 1;
      }
      // 목적지 표시
      if (n < DASHES) {
        samplePath(route.path, route.path.total, tmp.pose);
        tmp.q.setFromAxisAngle(tmp.up, director.t * 1.5);
        mesh.setMatrixAt(n, tmp.m.compose(tmp.p.set(tmp.pose.x, 0.05, tmp.pose.z), tmp.q, tmp.s.set(1.3, 1, 3.6)));
        tmp.s.set(1, 1, 1);
        n += 1;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geometry, material, DASHES]} frustumCulled={false} />;
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
    const level = pxPerUnit < 36 ? 'far' : 'near';
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
