import { addBuilding, addInterior } from './building';
import { addGate, addWeighbridge } from './inbound';
import { PartList } from './parts';
import type { Part } from './parts';
import { addCompressorBody, addConveyorFrame, addSectorBays } from './process';
import { addSurroundings } from './surroundings';
import { addYard } from './yard';

/**
 * 부지 전체의 고정물 조각. detail은 화질 단계의 소품 수준(config/quality의 `detail`: 0 최소, 1 중간, 2 전부)이다.
 * 설비 몸체와 건물은 어느 단계에서나 같고, 소품(나무·차·작업자·장식)의 수만 달라진다.
 */
export function worldParts(detail: 0 | 1 | 2): Part[] {
  const list = new PartList();
  addBuilding(list, detail);
  addInterior(list, detail);
  addSectorBays(list);
  addConveyorFrame(list);
  addCompressorBody(list, detail);
  addGate(list, detail);
  addWeighbridge(list, detail);
  addYard(list, detail);
  addSurroundings(list, detail);
  return list.parts;
}
