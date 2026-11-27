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

describe('집게차 빈 적재함 (S2r)', () => {
  it('적재함 바닥 위로 튀어나오거나 바닥과 겹치는 차체 조각이 없다 (전에는 흙받이 윗면이 바닥과 같은 높이라 검게 비쳤다)', async () => {
    const { buildGrappleTruck } = await import('./grappleTruck');
    const { GRAPPLE_TRUCK: T } = await import('../sim/grapple');
    for (const lite of [false, true]) {
      const m = buildGrappleTruck(0, lite);
      m.root.updateMatrixWorld(true);
      const body = m.root.getObjectByName('grapple-body')!;
      const v = new Vector3();
      let bad = 0;
      body.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 1) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          const inside = v.x > T.bedRear + 0.1 && v.x < T.bedFront - 0.1 && Math.abs(v.z) < T.width / 2 - 0.12;
          // 바닥 철판(윗면 deckY, 두께 0.07)의 윗면·밑면 말고 그 사이·위에 있는 꼭짓점
          if (inside && v.y > T.deckY - 0.065 && v.y < T.deckY + 0.3 && Math.abs(v.y - T.deckY) > 1e-4) bad += 1;
        }
      });
      expect(bad).toBe(0);
    }
  });
});
