import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { Footprint } from './kit';

// low 단계의 "미리 구운" 바닥 그림자. 실시간 그림자 지도·N8AO 대신, 고정물의 바닥 투영으로
// 닿는 곳의 주변 차폐(짧고 진한 번짐)와 해 반대쪽으로 늘어진 옅은 그림자를 캔버스에 한 번 그려 바닥에 얹는다.
// 움직이는 차량은 아래에 둥근 그림자 한 장(blobMaterial)을 달고 다닌다.

/** 해가 있는 쪽 (Stage의 SUN과 같은 방향) */
const SUN = { x: -22, y: 38, z: -19 };
const PX_PER_M = 20;
const SHADE = '38,46,68';
/** 바닥보다 살짝 위 (건물 바닥·섹터 칸 바닥보다 높고, 서 있는 것들의 발목보다 낮다) */
const PLANE_Y = 0.097;

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function layer(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

/** 고정물의 바닥 투영으로 그림자 판을 굽는다. 캔버스를 쓸 수 없으면 null */
export function bakeGroundShadow(footprints: readonly Footprint[], bounds: Bounds): Mesh | null {
  if (typeof document === 'undefined') return null;
  const W = bounds.maxX - bounds.minX;
  const D = bounds.maxZ - bounds.minZ;
  const w = Math.round(W * PX_PER_M);
  const h = Math.round(D * PX_PER_M);
  const [out, ctx] = layer(w, h);
  const [aoCanvas, ao] = layer(w, h);
  const [sunCanvas, sun] = layer(w, h);
  if (!ctx || !ao || !sun) return null;
  const px = (x: number) => (x - bounds.minX) * PX_PER_M;
  const pz = (z: number) => (z - bounds.minZ) * PX_PER_M;

  const horiz = Math.hypot(SUN.x, SUN.z);
  const dirX = -SUN.x / horiz;
  const dirZ = -SUN.z / horiz;
  const slope = horiz / SUN.y;

  ao.fillStyle = `rgb(${SHADE})`;
  sun.fillStyle = `rgb(${SHADE})`;
  for (const f of footprints) {
    const tall = Math.min(1, (f.y1 - Math.max(0, f.y0)) / 1.5);
    // 닿는 곳의 주변 차폐: 바닥에 붙은 것만, 조금 넓혀서
    if (f.y0 < 0.4) {
      const grow = 0.08 + 0.12 * tall;
      ao.globalAlpha = 0.55 + 0.45 * tall;
      ao.fillRect(px(f.x0 - grow), pz(f.z0 - grow), (f.x1 - f.x0 + grow * 2) * PX_PER_M, (f.z1 - f.z0 + grow * 2) * PX_PER_M);
    }
    // 해 반대쪽으로 늘어진 그림자: 바닥 투영을 그림자 길이만큼 여러 번 밀어 찍는다
    const from = Math.max(0, f.y0) * slope;
    const to = f.y1 * slope;
    const steps = Math.max(2, Math.ceil(((to - from) * PX_PER_M) / 4));
    for (let i = 0; i <= steps; i += 1) {
      const d = from + ((to - from) * i) / steps;
      sun.fillRect(px(f.x0 + dirX * d), pz(f.z0 + dirZ * d), (f.x1 - f.x0) * PX_PER_M, (f.z1 - f.z0) * PX_PER_M);
    }
  }
  // 합치기: 그림자는 넓고 옅게, 주변 차폐는 짧고 조금 진하게 번진다
  ctx.filter = 'blur(7px)';
  ctx.globalAlpha = 0.16;
  ctx.drawImage(sunCanvas, 0, 0);
  ctx.filter = 'blur(4px)';
  ctx.globalAlpha = 0.3;
  ctx.drawImage(aoCanvas, 0, 0);
  ctx.filter = 'none';

  const texture = new CanvasTexture(out);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const geometry = new PlaneGeometry(W, D).rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(bounds.minX + W / 2, PLANE_Y, bounds.minZ + D / 2);
  mesh.renderOrder = -1;
  mesh.name = 'baked-ground-shadow';
  mesh.raycast = () => undefined;
  return mesh;
}

/** 굽은 판의 텍스처·지오메트리를 버린다 */
export function disposeBaked(mesh: Mesh): void {
  mesh.geometry.dispose();
  const material = mesh.material as MeshBasicMaterial;
  material.map?.dispose();
  material.dispose();
}

let blob: MeshBasicMaterial | null = null;
let blobGeometry: PlaneGeometry | null = null;

/** 움직이는 차량 아래에 다는 둥근 그림자 한 장 (가로세로 1, 배율로 크기를 맞춘다). 모든 차량이 같이 쓴다 */
export function blobShadow(length: number, width: number): Mesh {
  if (!blob) {
    const [canvas, ctx] = layer(64, 64);
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, `rgba(${SHADE},0.42)`);
    g.addColorStop(0.6, `rgba(${SHADE},0.2)`);
    g.addColorStop(1, `rgba(${SHADE},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    blob = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, fog: false });
    blobGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  const mesh = new Mesh(blobGeometry!, blob);
  mesh.scale.set(length * 1.25, 1, width * 1.5);
  mesh.position.y = 0.07;
  mesh.renderOrder = -1;
  mesh.name = 'blob-shadow';
  mesh.raycast = () => undefined;
  return mesh;
}
