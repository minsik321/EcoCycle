import type { PickRecord } from '@ecocycle/shared';
import { ROBOT_MODES, TANK_IDS } from '@ecocycle/shared';

const now = Date.now();
export const pickRecords: PickRecord[] = Array.from({ length: 96 }, (_, i) => ({
  id: `pick-seed-${i}`, pickedAt: new Date(now - (i + 1) * 300_000).toISOString(),
  mode: ROBOT_MODES[i % ROBOT_MODES.length]!, sectorId: TANK_IDS[i % TANK_IDS.length]!,
  volumeM3: Math.round((0.48 + (i % 4) * 0.06) * 1000) / 1000, conveyorId: 'conveyor-z', batchId: `batch-${String(408 - Math.floor(i / 8)).padStart(4, '0')}`,
}));
let seq = 0;
export function recordPick(record: Omit<PickRecord, 'id' | 'pickedAt'>): void {
  pickRecords.unshift({ ...record, id: `pick-${++seq}`, pickedAt: new Date().toISOString() });
  if (pickRecords.length > 10000) pickRecords.pop();
}
