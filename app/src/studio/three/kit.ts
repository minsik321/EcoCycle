import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C } from '../theme';

// 스튜디오의 "찰흙 조립 도구". 둥근 모서리 상자·원통·공을 색과 함께 쌓고, 재질별로 메시 하나씩으로 합친다.
// 색은 꼭짓점 색으로 넣어 재질은 종류별 하나만 쓴다 (그리는 횟수를 줄인다).

export type MatKey = 'clay' | 'gloss' | 'metal' | 'glass' | 'glow';

export const MAT: Record<MatKey, Material> = {
  /** 무광 찰흙: 건물·바닥·소품 */
  clay: new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
  /** 장난감 플라스틱: 차량·로봇 */
  gloss: new MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
  metal: new MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.75 }),
  glass: new MeshPhysicalMaterial({ color: C.glass, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.42, envMapIntensity: 1.6, depthWrite: false }),
  /** 스스로 빛나는 것(등·표시등). 색을 밝게 넣으면 빛 번짐이 생긴다 */
  glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
};

export type Vec3 = readonly [number, number, number];

export interface PartOptions {
  /** 모서리 둥글기 (상자) */
  r?: number;
  /** 바닥 중심을 기준으로 한 회전 (라디안) */
  rot?: Vec3;
  mat?: MatKey;
  seg?: number;
  /** 원통이 눕는 축. x·z면 위치는 원통의 중심이다 */
  axis?: 'x' | 'y' | 'z';
  /** 빛나는 정도 (glow) */
  glow?: number;
  scale?: Vec3;
}

const color = new Color();
const euler = new Euler();
const quat = new Quaternion();
const ONE = new Vector3(1, 1, 1);
const pos = new Vector3();
const local = new Matrix4();
const lift = new Matrix4();

function paint(geometry: BufferGeometry, hex: string, gain = 1): BufferGeometry {
  color.set(hex);
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    data[i * 3] = color.r * gain;
    data[i * 3 + 1] = color.g * gain;
    data[i * 3 + 2] = color.b * gain;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(data, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

/** 바닥에 그림자를 드리울 조각의 바닥 투영 (미리 굽는 바닥 그림자용, 월드 좌표) */
export interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 아래·위 높이 */
  y0: number;
  y1: number;
}

export class Kit {
  /** 기록을 켜면(footprints 배열을 주면) 서 있는 조각마다 바닥 투영을 적는다 */
  footprints: Footprint[] | null = null;
  private readonly parts: Record<MatKey, BufferGeometry[]> = { clay: [], gloss: [], metal: [], glass: [], glow: [] };
  private readonly stack: Matrix4[] = [new Matrix4()];
  private readonly defaultMat: MatKey;

  constructor(defaultMat: MatKey = 'clay') {
    this.defaultMat = defaultMat;
  }

  private get top(): Matrix4 {
    return this.stack[this.stack.length - 1]!;
  }

  /** 위치·방향을 옮긴 자리에서 조립한다 (하위 조립을 여러 곳에 놓을 때) */
  at(position: Vec3, rotY: number, build: () => void, scale = 1): this {
    const m = new Matrix4().compose(pos.set(...position), quat.setFromEuler(euler.set(0, rotY, 0)), new Vector3(scale, scale, scale));
    this.stack.push(this.top.clone().multiply(m));
    build();
    this.stack.pop();
    return this;
  }

  private add(source: BufferGeometry, hex: string, base: Vec3, height: number, o: PartOptions): void {
    // 둥근 상자는 색인이 없는 지오메트리라, 합치려면 나머지도 색인을 푼다
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    const rot = o.rot ?? [0, 0, 0];
    local.compose(pos.set(...base), quat.setFromEuler(euler.set(rot[0], rot[1], rot[2])), o.scale ? new Vector3(...o.scale) : ONE);
    local.multiply(lift.makeTranslation(0, height, 0));
    geometry.applyMatrix4(local.premultiply(this.top));
    const mat = o.mat ?? this.defaultMat;
    if (this.footprints && mat !== 'glow') {
      geometry.computeBoundingBox();
      const b = geometry.boundingBox!;
      if (b.max.y - b.min.y > 0.22 && b.max.y > 0.3) this.footprints.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, y0: b.min.y, y1: b.max.y });
    }
    this.parts[mat].push(paint(geometry, hex, mat === 'glow' ? (o.glow ?? 2.4) : 1));
  }

  /** 상자. base는 바닥 중심 */
  box(hex: string, size: Vec3, base: Vec3, o: PartOptions = {}): this {
    const [w, h, d] = size;
    const r = Math.min(o.r ?? 0.04, Math.min(w, h, d) / 2 - 1e-4);
    const geometry = r > 0.004 ? new RoundedBoxGeometry(w, h, d, o.seg ?? 2, r) : new BoxGeometry(w, h, d);
    this.add(geometry, hex, base, h / 2, o);
    return this;
  }

  /** 원통·원뿔. radius가 [위, 아래]면 위아래 굵기가 다르다. 세운 원통의 base는 바닥 중심, 눕힌 원통은 중심 */
  cyl(hex: string, radius: number | readonly [number, number], height: number, base: Vec3, o: PartOptions = {}): this {
    const [top, bottom] = typeof radius === 'number' ? [radius, radius] : radius;
    const geometry = new CylinderGeometry(top, bottom, height, o.seg ?? 20);
    const axis = o.axis ?? 'y';
    if (axis === 'x') geometry.rotateZ(Math.PI / 2);
    if (axis === 'z') geometry.rotateX(Math.PI / 2);
    this.add(geometry, hex, base, axis === 'y' ? height / 2 : 0, o);
    return this;
  }

  /** 공(scale로 눌러 타원체로). center는 중심 */
  ball(hex: string, radius: number, center: Vec3, o: PartOptions = {}): this {
    this.add(new SphereGeometry(radius, o.seg ?? 16, Math.max(8, Math.round((o.seg ?? 16) * 0.7))), hex, center, 0, o);
    return this;
  }

  /** 재질별로 합친 메시들을 담은 그룹 */
  build(name?: string): Group {
    const group = new Group();
    if (name) group.name = name;
    (Object.keys(this.parts) as MatKey[]).forEach((key) => {
      const list = this.parts[key];
      if (list.length === 0) return;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      list.length = 0;
      if (!merged) return;
      const mesh = new Mesh(merged, MAT[key]);
      mesh.castShadow = key !== 'glass' && key !== 'glow';
      mesh.receiveShadow = key !== 'glow';
      group.add(mesh);
    });
    return group;
  }
}

/** 조립한 그룹의 지오메트리를 버린다 (재질은 공용이라 두고 쓴다) */
export function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}

/** 인스턴스로 많이 그릴 조각용 지오메트리 (흰 꼭짓점 색 → 인스턴스 색이 그대로 보인다) */
export function chunkGeometry(w: number, h: number, d: number, r: number, seg = 1): BufferGeometry {
  return paint(new RoundedBoxGeometry(w, h, d, seg, r), '#ffffff');
}
