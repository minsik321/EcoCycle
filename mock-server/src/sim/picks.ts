import type { PickRecord, SectorGrade, TankId, TankState } from '@ecocycle/shared';
import { ROBOT_MODES, TANK_IDS } from '@ecocycle/shared';
import { devices } from './state';

/** 한 번 집는 부피 범위(m³, 예시). 그리퍼 한 번에 크라프트 파지 덩어리 하나 */
export const PICK_VOLUME_M3 = { min: 0.06, max: 0.14 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * 한 번에 집히는 부피. 더미가 높을수록 그리퍼가 깊이 들어가 많이 집히고(적재율 0% → 약 0.07, 100% → 약 0.12 m³),
 * 등급 C(잡지·혼합)는 덩어리가 성겨 부피가 조금 더 크고 A(골판지 압착분)는 조금 작다. 나머지는 매번 달라지는 잡음.
 */
export function pickVolumeM3(fillPercent: number, grade: SectorGrade, random: () => number = Math.random): number {
  const byFill = 0.07 + 0.05 * clamp(fillPercent / 100, 0, 1);
  const byGrade = grade === 'C' ? 0.012 : -0.005;
  const noise = (random() - 0.5) * 0.03;
  return Math.round(clamp(byFill + byGrade + noise, PICK_VOLUME_M3.min, PICK_VOLUME_M3.max) * 1000) / 1000;
}

/** 시작할 때 채워 두는 지난 집기 기록이 매번 같게 고정 씨앗 난수 */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const now = Date.now();
const seedRandom = seeded(20261015);
export const pickRecords: PickRecord[] = Array.from({ length: 96 }, (_, i) => {
  const sectorId = TANK_IDS[i % TANK_IDS.length] as TankId;
  const sector = devices[sectorId] as TankState;
  // 지난 기록이라 그때의 적재율을 알 수 없으므로 지금 적재율 근처에서 흔든다
  const fill = clamp(sector.fillPercent + (seedRandom() - 0.5) * 40, 5, 95);
  return {
    id: `pick-seed-${i}`,
    pickedAt: new Date(now - (i + 1) * 300_000).toISOString(),
    mode: ROBOT_MODES[i % ROBOT_MODES.length]!,
    sectorId,
    volumeM3: pickVolumeM3(fill, sector.grade, seedRandom),
    conveyorId: 'conveyor-z',
    batchId: `batch-${String(408 - Math.floor(i / 8)).padStart(4, '0')}`,
  };
});
let seq = 0;
export function recordPick(record: Omit<PickRecord, 'id' | 'pickedAt'>): void {
  pickRecords.unshift({ ...record, id: `pick-${++seq}`, pickedAt: new Date().toISOString() });
  if (pickRecords.length > 10000) pickRecords.pop();
}
