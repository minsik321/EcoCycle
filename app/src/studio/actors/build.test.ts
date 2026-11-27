import type { Mesh, Object3D } from 'three';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildTruck } from './build';

describe('덤프 트럭 모형 (S2n)', () => {
  it('차체 조각이 빈 적재함 바닥을 뚫고 올라오지 않는다 (전에는 뒷바퀴 흙받이가 검은 띠로 비쳤다)', () => {
    for (let variant = 0; variant < 4; variant += 1) {
      const m = buildTruck(variant);
      m.root.updateMatrixWorld(true);
      const [px, py] = m.pivot;
      const floorTop = py + 0.08;
      const inBed = (o: Object3D) => {
        for (let p: Object3D | null = o; p; p = p.parent) if (p === m.bed) return true;
        return false;
      };
      const v = new Vector3();
      let worst = -Infinity;
      m.root.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || inBed(mesh)) return;
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 1) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          // 적재함 안쪽(앞판·옆판 두께 뺌) 위로 보이는 꼭짓점
          if (v.x > px + 0.05 && v.x < px + 1.83 && Math.abs(v.z) < 0.5) worst = Math.max(worst, v.y);
        }
      });
      expect(worst).toBeLessThanOrEqual(floorTop);
    }
  });
});
