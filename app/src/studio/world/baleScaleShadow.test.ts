import { Box3, Group, Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import { describe, expect, it, vi } from 'vitest';
import * as layout from './layout';
import { sitePx, staticBaleCells } from './layout';
import { WALL_BAND, WALL_HIDE_DOT, ROOF_HIDE_DIST, ROOF_SHOW_DIST, applyWall, roofShown, wallParts, wallShown } from './houseHide';

// S2o: 베일 모양 하나, 계근대 인식 기둥 없음, 압축기 건물 벽·지붕 걷기(그림자 깜빡임)

const calls: Array<{ lite: boolean }> = [];
vi.mock('./props', async (importOriginal) => {
  const real = await importOriginal<typeof import('./props')>();
  return {
    ...real,
    bale: (...args: Parameters<typeof real.bale>) => {
      calls.push({ lite: Boolean(args[5]) });
      return real.bale(...args);
    },
  };
});

const { buildWorld } = await import('./buildWorld');
const { buildBale } = await import('../actors/build');

/** 그룹의 메시들: 재질 이름 → 꼭짓점 색 목록(합친 메시는 색을 꼭짓점에 칠한다) */
function summary(group: Group) {
  const box = new Box3().setFromObject(group);
  const mats = new Set<string>();
  const colors = new Set<string>();
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mats.add((mesh.material as MeshStandardMaterial).name || (mesh.material as MeshStandardMaterial).type);
    const c = (mesh.geometry as BufferGeometry).getAttribute('color');
    if (c) for (let i = 0; i < c.count; i += 1) colors.add(`${c.getX(i).toFixed(3)},${c.getY(i).toFixed(3)},${c.getZ(i).toFixed(3)}`);
  });
  const size = box.getSize(box.min.clone());
  return { size: size.toArray().map((v) => v.toFixed(3)), mats: [...mats].sort(), colors: [...colors].sort() };
}

describe('S2o 베일 모양 하나', () => {
  it('바탕 재고 벽(북서·남동·북쪽 줄)의 베일은 모두 움직이는 베일과 같은 bale()로 조립한다', () => {
    calls.length = 0;
    buildWorld(false);
    const cells = [...staticBaleCells('nw'), ...staticBaleCells('se')].reduce((n, c) => n + c.levels, 0);
    expect(calls.length).toBeGreaterThan(cells); // 칸 줄 + 북쪽 줄
    expect(calls.every((c) => !c.lite)).toBe(true);
    calls.length = 0;
    buildWorld(true);
    expect(calls.length).toBeGreaterThan(cells);
    expect(calls.every((c) => c.lite)).toBe(true);
  });

  it('움직이는 베일은 단계마다 같은 치수·재질·색이다 (low는 둥글림만 뺀다)', () => {
    const full = summary(buildBale(false));
    const lite = summary(buildBale(true));
    expect(lite.size).toEqual(full.size);
    expect(lite.mats).toEqual(full.mats);
    expect(lite.colors).toEqual(full.colors);
    // 치수는 BALE (끈·층이 조금 나온다)
    const [d, h, w] = full.size.map(Number);
    expect(d).toBeCloseTo(layout.BALE.d + 0.016, 2);
    expect(h).toBeCloseTo(layout.BALE.h + 0.02, 2);
    expect(w).toBeCloseTo(layout.BALE.w + 0.02, 2);
  });
});

describe('S2o 계근대 인식 기둥 없음', () => {
  it('layout에 인식 카메라 자리가 없고, 옛 기둥 자리(사진 470, 268px)에 높이 1.5 넘는 조각이 없다', () => {
    expect('PLATE_CAMERA' in layout).toBe(false);
    const world = buildWorld(false);
    const [x0, z0] = sitePx(470, 268);
    let tall = 0;
    world.base.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const p = (mesh.geometry as BufferGeometry).getAttribute('position');
      for (let i = 0; i < p.count; i += 1) if (Math.hypot(p.getX(i) - x0, p.getZ(i) - z0) < 1.2 && p.getY(i) > 1.5) tall += 1;
    });
    expect(tall).toBe(0);
  });
});

describe('S2o 압축기 건물 벽·지붕 걷기', () => {
  it('문턱에 여유가 있어 문턱 근처에서 흔들려도 한 번만 바뀐다', () => {
    let shown = true;
    let flips = 0;
    for (let i = 0; i < 200; i += 1) {
      const dot = WALL_HIDE_DOT - WALL_BAND + Math.sin(i) * WALL_BAND * 0.9;
      const next = wallShown(shown, dot + (i > 100 ? 0.2 : 0));
      if (next !== shown) flips += 1;
      shown = next;
    }
    expect(flips).toBe(1);
    let roof = true;
    flips = 0;
    for (let i = 0; i < 200; i += 1) {
      const next = roofShown(roof, (ROOF_HIDE_DIST + ROOF_SHOW_DIST) / 2 + Math.sin(i) * 4.5 - (i > 100 ? 20 : 0));
      if (next !== roof) flips += 1;
      roof = next;
    }
    expect(flips).toBe(1);
  });

  it('걷힌 벽은 숨기고 세우면 원래 재질로 보인다. 벽·지붕은 실시간 그림자를 드리우지 않는다 (S2r)', () => {
    const world = buildWorld(false);
    const parts = wallParts(world.walls[0]!.group);
    applyWall(parts, false);
    expect(parts.every((p) => !p.mesh.visible)).toBe(true);
    applyWall(parts, true);
    for (const p of parts) {
      expect(p.mesh.visible).toBe(true);
      expect(p.mesh.material).toBe(p.material);
    }
    for (const g of [world.roof, ...world.walls.map((w) => w.group)]) {
      g.traverse((o) => {
        if ((o as Mesh).isMesh) expect((o as Mesh).castShadow).toBe(false);
      });
    }
  });
});
