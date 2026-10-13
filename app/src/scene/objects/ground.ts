import { CanvasTexture, SRGBColorSpace } from 'three';
import { TANK_IDS } from '@ecocycle/shared';
import { APRON, BUILDING, COMPRESSOR, GATE, GROUND, OFFICE, PARKING, ROAD, ROBOT, SECTOR, SECTOR_Z, SUN, WEIGHBRIDGE, YARD } from '../../config/sceneLayout';
import { PALETTE as P } from '../palette';
import type { Part } from './world/parts';

// 바닥 그림: 잔디·도로·차선·바닥 표시선을 캔버스 한 장에 그려 바닥 판 하나에 입힌다 (그리는 횟수 1번).
// 저사양(low)에서는 고정물의 그림자도 여기에 미리 그려 실시간 그림자를 대신한다.

type Point = readonly [number, number];

/** 높이 1만큼 올라갈 때 그림자가 바닥에서 밀리는 양 (해의 반대쪽) */
export const SHADOW_SHIFT: Point = [-SUN.direction[0] / SUN.direction[1], -SUN.direction[2] / SUN.direction[1]];

/** 볼록 껍질 (점들을 감싸는 다각형) */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (input: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** 조각 하나가 바닥에 드리우는 그림자의 윤곽 (장면의 x, z). 기울인 조각은 기울이지 않은 것으로 어림한다 */
export function shadowOutline(part: Part): Point[] {
  const cos = Math.cos(part.ry);
  const sin = Math.sin(part.ry);
  const bottom = Math.max(0, part.y - part.sy / 2);
  const top = part.y + part.sy / 2;
  const points: Point[] = [];
  const push = (dx: number, dz: number, height: number) => {
    points.push([part.x + dx * cos + dz * sin + SHADOW_SHIFT[0] * height, part.z - dx * sin + dz * cos + SHADOW_SHIFT[1] * height]);
  };
  for (const sx of [-0.5, 0.5]) {
    for (const sz of [-0.5, 0.5]) {
      push(sx * part.sx, sz * part.sz, bottom);
      // 원뿔은 꼭대기가 한 점이다
      if (part.shape !== 'cone') push(sx * part.sx, sz * part.sz, top);
    }
  }
  if (part.shape === 'cone') push(0, 0, top);
  return convexHull(points);
}

interface Painter {
  ctx: CanvasRenderingContext2D;
  scale: number;
}

const px = ({ scale }: Painter, x: number) => (x - GROUND.minX) * scale;
const pz = ({ scale }: Painter, z: number) => (z - GROUND.minZ) * scale;

function rect(p: Painter, color: string, minX: number, minZ: number, maxX: number, maxZ: number): void {
  p.ctx.fillStyle = color;
  p.ctx.fillRect(px(p, minX), pz(p, minZ), (maxX - minX) * p.scale, (maxZ - minZ) * p.scale);
}

function line(p: Painter, color: string, width: number, x0: number, z0: number, x1: number, z1: number, dash?: readonly [number, number]): void {
  const { ctx, scale } = p;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * scale);
  ctx.setLineDash(dash ? [dash[0] * scale, dash[1] * scale] : []);
  ctx.beginPath();
  ctx.moveTo(px(p, x0), pz(p, z0));
  ctx.lineTo(px(p, x1), pz(p, z1));
  ctx.stroke();
  ctx.restore();
}

function outline(p: Painter, color: string, width: number, minX: number, minZ: number, maxX: number, maxZ: number, dash?: readonly [number, number]): void {
  line(p, color, width, minX, minZ, maxX, minZ, dash);
  line(p, color, width, maxX, minZ, maxX, maxZ, dash);
  line(p, color, width, maxX, maxZ, minX, maxZ, dash);
  line(p, color, width, minX, maxZ, minX, minZ, dash);
}

/** 빗금 친 네모 (상차 구역, 계중대 둘레) */
function hatched(p: Painter, color: string, minX: number, minZ: number, maxX: number, maxZ: number, gap: number): void {
  const { ctx } = p;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px(p, minX), pz(p, minZ), (maxX - minX) * p.scale, (maxZ - minZ) * p.scale);
  ctx.clip();
  const span = maxZ - minZ;
  for (let x = minX - span; x < maxX; x += gap) line(p, color, 0.05, x, maxZ, x + span, minZ);
  ctx.restore();
  outline(p, color, 0.06, minX, minZ, maxX, maxZ);
}

function paintOutdoors(p: Painter): void {
  const { ctx } = p;
  rect(p, P.grass, GROUND.minX, GROUND.minZ, GROUND.maxX, GROUND.maxZ);
  // 잔디 얼룩 (단조롭지 않게)
  ctx.fillStyle = P.grassDark;
  for (let i = 0; i < 26; i += 1) {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12543.123;
    const x = GROUND.minX + (a - Math.floor(a)) * (GROUND.maxX - GROUND.minX);
    const z = GROUND.minZ + (b - Math.floor(b)) * (GROUND.maxZ - GROUND.minZ);
    ctx.beginPath();
    ctx.ellipse(px(p, x), pz(p, z), (0.5 + (i % 3) * 0.25) * p.scale, (0.3 + (i % 2) * 0.2) * p.scale, i, 0, Math.PI * 2);
    ctx.fill();
  }

  // 부지 밖 도로와 정문 진입로
  rect(p, P.asphaltDark, ROAD.publicMinX, GROUND.minZ, ROAD.publicMaxX, GROUND.maxZ);
  const publicCenter = (ROAD.publicMinX + ROAD.publicMaxX) / 2;
  line(p, P.laneMark, 0.06, publicCenter, GROUND.minZ, publicCenter, GROUND.maxZ, [0.5, 0.5]);
  rect(p, P.asphalt, GATE.x, ROAD.minZ, ROAD.publicMinX, ROAD.maxZ);

  // 포장면: 본관 둘레, 출하장, 사무동 앞
  rect(p, P.concrete, BUILDING.minX - 0.5, BUILDING.minZ - 0.1, BUILDING.maxX, BUILDING.maxZ + 0.5);
  rect(p, P.concrete, YARD.minX, YARD.minZ, YARD.maxX, YARD.maxZ);
  rect(p, P.concrete, YARD.minX, ROAD.maxZ, YARD.maxX, YARD.minZ);
  rect(p, P.concrete, OFFICE.minX - 0.3, APRON.maxZ, OFFICE.maxX + 0.3, OFFICE.maxZ + 0.2);

  // 부지 안 도로, 연결로, 하역 마당, 주차장
  rect(p, P.asphalt, ROAD.minX, ROAD.minZ, ROAD.maxX, ROAD.maxZ);
  rect(p, P.asphalt, ROAD.connectorMinX, ROAD.maxZ, ROAD.connectorMaxX, APRON.minZ);
  rect(p, P.asphalt, APRON.minX, APRON.minZ, APRON.maxX, APRON.maxZ);
  rect(p, P.asphalt, PARKING.minX, PARKING.minZ - 0.2, PARKING.maxX, PARKING.maxZ + 0.2);

  // 차선: 가운데 점선, 가장자리 실선, 정문 정지선
  const laneZ = (ROAD.minZ + ROAD.maxZ) / 2;
  line(p, P.laneMark, 0.05, ROAD.minX + 0.3, laneZ, ROAD.maxX - 0.9, laneZ, [0.45, 0.35]);
  line(p, P.laneMark, 0.04, ROAD.minX, ROAD.minZ + 0.06, ROAD.maxX, ROAD.minZ + 0.06);
  line(p, P.laneMark, 0.04, ROAD.minX, ROAD.maxZ - 0.06, ROAD.connectorMinX, ROAD.maxZ - 0.06);
  line(p, P.laneMark, 0.04, ROAD.connectorMaxX, ROAD.maxZ - 0.06, ROAD.maxX, ROAD.maxZ - 0.06);
  line(p, P.laneMark, 0.1, ROAD.maxX - 0.8, ROAD.minZ + 0.1, ROAD.maxX - 0.8, laneZ - 0.05);

  // 계중대 둘레 빗금
  hatched(p, P.hazard, WEIGHBRIDGE.minX - 0.3, WEIGHBRIDGE.z - WEIGHBRIDGE.width / 2 - 0.2, WEIGHBRIDGE.maxX + 0.3, WEIGHBRIDGE.z + WEIGHBRIDGE.width / 2 + 0.2, 0.22);

  // 하역 마당: 섹터 문마다 후진 안내선과 정지선
  for (const id of TANK_IDS) {
    const [z0, z1] = SECTOR_Z[id];
    const center = (z0 + z1) / 2;
    for (const side of [-1, 1]) {
      line(p, P.laneMark, 0.04, APRON.minX + 0.1, center + side * (SECTOR.doorWidth / 2), APRON.minX + 2.5, center + side * (SECTOR.doorWidth / 2));
    }
    line(p, P.hazard, 0.07, APRON.minX + 0.12, z0 + 0.2, APRON.minX + 0.12, z1 - 0.2);
  }

  // 주차 칸
  const slot = (PARKING.maxZ - PARKING.minZ) / PARKING.slots;
  for (let i = 0; i <= PARKING.slots; i += 1) {
    const z = PARKING.minZ + slot * i;
    line(p, P.laneMark, 0.04, PARKING.maxX - 1.4, z, PARKING.maxX - 0.08, z);
  }

  // 출하장: 배출 자리, 적치 구역, 지게차 통로, 상차 구역
  const landing = COMPRESSOR.slideEndZ;
  outline(p, P.hazard, 0.06, COMPRESSOR.x - 0.6, landing - 0.95, COMPRESSOR.x + 0.6, landing + 0.1);
  const { stack, loading, aisleZ, aisleWidth } = YARD;
  outline(p, P.laneMark, 0.05, stack.x - 0.5, stack.z - (stack.rows - 1) * stack.stepZ - 0.45, stack.x + (stack.columns - 1) * stack.stepX + 0.5, stack.z + 0.42);
  for (const side of [-1, 1]) {
    line(p, P.hazard, 0.05, YARD.minX + 0.5, aisleZ + side * (aisleWidth / 2), loading.minX - 0.35, aisleZ + side * (aisleWidth / 2), [0.6, 0.25]);
  }
  hatched(p, P.hazard, loading.minX, loading.minZ, loading.maxX, loading.maxZ, 0.4);
}

function paintBuildingFloor(p: Painter): void {
  const { ctx } = p;
  rect(p, P.floor, BUILDING.minX, BUILDING.minZ, BUILDING.maxX, BUILDING.maxZ);

  // 섹터 칸 바닥
  for (const id of TANK_IDS) {
    const [z0, z1] = SECTOR_Z[id];
    rect(p, P.floorZone, SECTOR.minX, z0, BUILDING.maxX, z1);
  }

  // 로봇 작업 반경: 노란 원 (섹터 쪽은 벽이 있어 그리지 않는다)
  ctx.save();
  ctx.beginPath();
  ctx.rect(px(p, BUILDING.minX), pz(p, BUILDING.minZ), (SECTOR.minX - 0.1 - BUILDING.minX) * p.scale, (BUILDING.maxZ - BUILDING.minZ) * p.scale);
  ctx.clip();
  ctx.strokeStyle = P.hazard;
  ctx.lineWidth = 0.07 * p.scale;
  ctx.setLineDash([0.3 * p.scale, 0.18 * p.scale]);
  ctx.beginPath();
  ctx.arc(px(p, ROBOT.position[0]), pz(p, ROBOT.position[2]), 2.45 * p.scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = P.floorZone;
  ctx.beginPath();
  ctx.arc(px(p, ROBOT.position[0]), pz(p, ROBOT.position[2]), ROBOT.pedestalRadius * ROBOT.scale * 1.45 * p.scale, 0, Math.PI * 2);
  ctx.fill();

  // 작업자 통로 (초록 띠): 셔터 문 앞에서 제어실 쪽으로
  rect(p, P.walkway, BUILDING.minX + 0.9, 0.15, -1.45, 0.6);
  line(p, P.laneMark, 0.03, BUILDING.minX + 0.9, 0.15, -1.45, 0.15);
  line(p, P.laneMark, 0.03, BUILDING.minX + 0.9, 0.6, -1.45, 0.6);
  // 압축기 둘레 안전선
  outline(p, P.hazard, 0.05, COMPRESSOR.x - COMPRESSOR.width / 2 - 0.3, COMPRESSOR.z - COMPRESSOR.depth / 2 - 0.6, COMPRESSOR.x + COMPRESSOR.width / 2 + 0.3, 1.2);
}

function paintShadows(p: Painter, parts: readonly Part[]): void {
  const { ctx } = p;
  // 그림자끼리 겹쳐도 더 진해지지 않게, 먼저 따로 한 장에 불투명하게 모은 뒤 반투명으로 얹는다
  const layer = document.createElement('canvas');
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const layerCtx = layer.getContext('2d');
  if (!layerCtx) return;
  layerCtx.fillStyle = '#1e2a3d';
  const q: Painter = { ctx: layerCtx, scale: p.scale };
  for (const part of parts) {
    if (!part.shadow) continue;
    const points = shadowOutline(part);
    if (points.length < 3) continue;
    layerCtx.beginPath();
    points.forEach(([x, z], i) => (i === 0 ? layerCtx.moveTo(px(q, x), pz(q, z)) : layerCtx.lineTo(px(q, x), pz(q, z))));
    layerCtx.closePath();
    layerCtx.fill();
  }
  ctx.save();
  ctx.globalAlpha = 0.3;
  // 가장자리를 조금 흐린다 (지원하지 않는 브라우저에서는 또렷한 채로 그려진다)
  ctx.filter = `blur(${(0.05 * p.scale).toFixed(1)}px)`;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/**
 * 바닥 텍스처를 만든다. shadowParts를 주면 그 조각들의 그림자를 함께 그려 넣는다(미리 그린 그림자).
 * 캔버스를 쓸 수 없는 환경(테스트 등)에서는 null을 돌려주고 바닥은 단색으로 그린다.
 */
export function createGroundTexture(pxPerM: number, shadowParts: readonly Part[] | null): CanvasTexture | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((GROUND.maxX - GROUND.minX) * pxPerM);
    canvas.height = Math.round((GROUND.maxZ - GROUND.minZ) * pxPerM);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const painter: Painter = { ctx, scale: pxPerM };
    paintOutdoors(painter);
    paintBuildingFloor(painter);
    if (shadowParts) paintShadows(painter, shadowParts);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}
