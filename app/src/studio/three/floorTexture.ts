import { CanvasTexture, Mesh, MeshStandardMaterial, SRGBColorSpace, Shape, ShapeGeometry, Vector2 } from 'three';
import type { P2 } from '../sim/paths';
import { C } from '../theme';

// 마당 콘크리트 바닥: 줄눈(일정한 칸)과 얼룩을 캔버스 한 장에 한 번 굽고 마당 윤곽 모양의 판 하나에 입힌다.
// 그리기 횟수는 판 하나(1번)뿐이고 low 단계도 같은 텍스처라 바닥 재질이 읽힌다 (현장 사진 from-gate-inside·entrance의 줄눈).

const PX_PER_M = 40;
/** 줄눈 칸 크기(월드 단위, 사진에서 약 4~5m) */
const JOINT = 2.3;

export interface FloorSpec {
  /** 마당 윤곽 (월드 x, z) */
  outline: readonly P2[];
  /** 줄눈 방향(월드 라디안, 마당 좌표계 축) */
  axis: number;
  /** 얼룩: 가운데 (월드 x, z)·반지름·진하기 */
  stains: ReadonlyArray<readonly [number, number, number, number]>;
  /** 판 높이 */
  y: number;
}

/** 줄눈·얼룩을 구운 바닥 판. 캔버스를 쓸 수 없으면 null */
export function buildFloor(spec: FloorSpec): Mesh | null {
  if (typeof document === 'undefined') return null;
  const xs = spec.outline.map((p) => p[0]);
  const zs = spec.outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const w = Math.min(4096, Math.round((maxX - minX) * PX_PER_M));
  const h = Math.min(4096, Math.round((maxZ - minZ) * PX_PER_M));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const sx = w / (maxX - minX);
  const sz = h / (maxZ - minZ);
  const px = (x: number) => (x - minX) * sx;
  const pz = (z: number) => (z - minZ) * sz;

  ctx.fillStyle = C.concrete;
  ctx.fillRect(0, 0, w, h);
  // 판마다 살짝 다른 밝기 (줄눈 칸 단위로 칠한다)
  let seed = 9;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const cos = Math.cos(spec.axis);
  const sin = Math.sin(spec.axis);
  const span = Math.hypot(maxX - minX, maxZ - minZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  ctx.save();
  ctx.translate(px(cx), pz(cz));
  // 축 방향: 월드 (cos, −sin)이 마당 +x, (sin, cos)이 마당 +z
  ctx.transform(cos * sx, -sin * sz, sin * sx, cos * sz, 0, 0);
  const n = Math.ceil(span / JOINT);
  for (let i = -n; i < n; i += 1) {
    for (let j = -n; j < n; j += 1) {
      const v = rnd();
      ctx.fillStyle = v < 0.33 ? 'rgba(255,255,255,0.05)' : v < 0.66 ? 'rgba(60,64,72,0.04)' : 'rgba(0,0,0,0)';
      ctx.fillRect(i * JOINT, j * JOINT, JOINT, JOINT);
    }
  }
  // 줄눈: 가는 어두운 선
  ctx.strokeStyle = 'rgba(70,76,88,0.42)';
  ctx.lineWidth = 0.045;
  for (let i = -n; i <= n; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * JOINT, -n * JOINT);
    ctx.lineTo(i * JOINT, n * JOINT);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-n * JOINT, i * JOINT);
    ctx.lineTo(n * JOINT, i * JOINT);
    ctx.stroke();
  }
  ctx.restore();
  // 얼룩: 부드러운 짙은 반점 (타이어 자국·물기·흙)
  for (const [x, z, r, a] of spec.stains) {
    const g = ctx.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), r * sx);
    g.addColorStop(0, `rgba(70,62,52,${a})`);
    g.addColorStop(1, 'rgba(70,62,52,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px(x), pz(z), r * sx, r * 0.7 * sz, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  // 모양은 (x, −z)로 그리고 x축으로 −90° 돌려 눕힌다. UV는 바닥 위치를 캔버스에 맞춘다
  const shape = new Shape(spec.outline.map(([x, z]) => new Vector2(x, -z)));
  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i += 1) uv.setXY(i, (pos.getX(i) - minX) / (maxX - minX), 1 - (pos.getZ(i) - minZ) / (maxZ - minZ));
  uv.needsUpdate = true;
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 }));
  mesh.position.y = spec.y;
  mesh.receiveShadow = true;
  mesh.name = 'yard-floor';
  return mesh;
}

export function disposeFloor(mesh: Mesh): void {
  mesh.geometry.dispose();
  const m = mesh.material as MeshStandardMaterial;
  m.map?.dispose();
  m.dispose();
}
