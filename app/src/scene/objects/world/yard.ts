import { COMPRESSOR, YARD } from '../../../config/sceneLayout';
import { PALETTE as P } from '../../palette';
import type { PartList } from './parts';
import { BALE_SIZE, bale, lamp, worker } from './props';

/** 적치 칸마다 쌓인 단 수(시안용 고정 모양). 실제 베일 수 연동은 출하 연출 단계에서 한다 */
const STACK_HEIGHTS = [
  [3, 3, 2, 3, 1],
  [2, 3, 2, 1, 0],
] as const;

/** 출하장: 쌓인 베일, 상차 구역의 차막이, 통로 끝 표지 기둥 */
export function addYard(list: PartList, detail: number): void {
  const { stack, loading, aisleZ, aisleWidth } = YARD;
  const rows = detail === 0 ? 1 : stack.rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < stack.columns; column += 1) {
      const height = STACK_HEIGHTS[row]?.[column] ?? 0;
      const x = stack.x + column * stack.stepX;
      const z = stack.z - row * stack.stepZ;
      for (let level = 0; level < height; level += 1) bale(list, x, level * BALE_SIZE.y, z, 0, detail >= 1);
    }
  }

  // 배출 슬라이드 끝에 막 나온 베일
  bale(list, COMPRESSOR.x, 0, COMPRESSOR.slideEndZ - 0.45, Math.PI / 2, detail >= 1);

  // 상차 구역 차막이
  for (const z of [loading.minZ + 0.3, loading.maxZ - 0.3]) {
    list.box(P.hazard, [loading.minX + 0.1, 0, z], [0.12, 0.1, 0.36], { shadow: false });
  }
  // 통로 양 끝의 표지 기둥
  for (const x of [YARD.minX + 0.5, loading.minX - 0.35]) {
    for (const side of [-1, 1]) {
      list.box(P.hazard, [x, 0, aisleZ + side * (aisleWidth / 2 + 0.08)], [0.08, 0.34, 0.08], { shadow: false });
    }
  }

  lamp(list, YARD.minX + 0.3, YARD.minZ + 0.2, -Math.PI / 2);
  if (detail >= 1) {
    lamp(list, loading.maxX + 0.3, YARD.minZ + 0.2, -Math.PI / 2);
    worker(list, loading.minX - 0.7, loading.maxZ - 0.1, -0.6);
  }
}
