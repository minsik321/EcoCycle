import { Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { buildWorld } from './buildWorld';
import { sitePx } from './layout';

// S2r: 압축기 건물은 실시간 그림자를 만들지 않는다(바닥에 구운 그림자만), 섹터 A 옆 높은 철 기둥 없음

function meshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

describe('압축기 건물 그림자 (S2r)', () => {
  it('건물 고정물·벽·지붕은 실시간 그림자를 드리우지 않고(받기는 한다), 구울 바닥 투영은 있다', () => {
    for (const lite of [false, true]) {
      const world = buildWorld(lite);
      const fixed = [world.house, world.roof, ...world.walls.map((w) => w.group)];
      for (const g of fixed) for (const m of meshes(g)) expect(m.castShadow).toBe(false);
      expect(meshes(world.house).some((m) => m.receiveShadow)).toBe(true);
      // 벽 넷·옆동·압축기 몸체가 바닥 투영을 남긴다 (레일 축 좌표라 벽 하나가 건물 전체 네모가 되지 않는다)
      expect(world.houseFootprints.length).toBeGreaterThan(20);
      const big = world.houseFootprints.filter((f) => (f.x1 - f.x0) > 2 && (f.z1 - f.z0) > 2 && f.y1 - f.y0 > 2);
      // 서 있는 큰 덩어리는 닫힌 옆동 하나뿐
      expect(big.length).toBe(1);
    }
  });
});

describe('섹터 A 옆 높은 철 기둥 (S2r)', () => {
  it('숲 쪽 높은 철 기둥(사진 px 126, 276, 높이 11)이 없다: 그 둘레 4단위 안 고정물은 가로등 높이를 넘지 않는다', () => {
    const world = buildWorld(false);
    world.base.updateMatrixWorld(true);
    const [mx, mz] = sitePx(126, 276);
    const v = new Vector3();
    let top = -Infinity;
    for (const m of meshes(world.base)) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i += 1) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (Math.hypot(v.x - mx, v.z - mz) < 4) top = Math.max(top, v.y);
      }
    }
    // 숲 나무·그물망은 있어도 된다 (나무 수관 꼭대기 약 5)
    expect(top).toBeLessThan(7);
  });
});
