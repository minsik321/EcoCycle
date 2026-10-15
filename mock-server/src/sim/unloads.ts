import type { TankId, UnloadRecord } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import type { TruckFixture } from '../fixtures/process';
import { COMPANIES, FILL_PERCENT_PER_TON, UNLOAD_HISTORY } from '../fixtures/process';

// 섹터 하역 기록 (GET /devices/{id}/unloads/records). 차량 흐름(sim/process)이 출차 계량을 마칠 때마다 한 줄씩 쌓고,
// 기간 고르기·쪽 넘기기를 볼 수 있게 시작할 때 지난 며칠치를 같은 규칙으로 채워 둔다. 회사·번호판은 가상이다.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 현장 시각(한국) = UTC + 9 */
const SITE_OFFSET = 9 * HOUR;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, width: number) => String(n).padStart(width, '0');
const siteDate = (ms: number) => new Date(ms + SITE_OFFSET).toISOString().slice(0, 10).replaceAll('-', '');

const records: UnloadRecord[] = [];

/** 계중대 무게 한 번: 공차는 등록 공차 ±0.06 t, 순중량은 범위 안에서. 계중대 눈금은 10 kg */
export function weighTruck(truck: TruckFixture): { grossT: number; tareT: number; netT: number } {
  const tareT = round2(truck.tareT + rnd(-0.06, 0.06));
  const netT = round2(rnd(truck.netT[0], truck.netT[1]));
  return { grossT: round2(tareT + netT), tareT, netT };
}

/** 순중량만큼 오르는 적재율 %p (예시 환산) */
export const fillGainPercent = (netT: number): number => netT * FILL_PERCENT_PER_TON;

/** 하역 기록 한 줄을 남긴다. 오래된 기록은 버린다 */
export function addUnloadRecord(record: UnloadRecord): void {
  records.push(record);
  const keepFrom = Date.now() - UNLOAD_HISTORY.keepDays * DAY;
  while (records[0] && Date.parse(records[0].unloadedAt) < keepFrom) records.shift();
}

export const unloadRecords = (sectorId: TankId): UnloadRecord[] => records.filter((r) => r.sectorId === sectorId);

/** 지난 며칠치: 섹터마다 하루 몇 대, 작업 시간 안에 흩어서. `until` 이후는 차량 흐름이 채운다 */
function seedHistory(until: number): void {
  const seeded: UnloadRecord[] = [];
  const todaySite = Math.floor((until + SITE_OFFSET) / DAY) * DAY - SITE_OFFSET; // 오늘 0시(현장)의 UTC ms
  const [openH, closeH] = UNLOAD_HISTORY.workHours;
  const [minN, maxN] = UNLOAD_HISTORY.perSectorPerDay;
  for (let day = UNLOAD_HISTORY.seedDays; day >= 0; day -= 1) {
    const dayStart = todaySite - day * DAY;
    for (const sectorId of TANK_IDS) {
      const companies = COMPANIES.filter((c) => c.sectorId === sectorId);
      const count = minN + Math.floor(Math.random() * (maxN - minN + 1));
      const times = Array.from({ length: count }, () => dayStart + rnd(openH, closeH) * HOUR)
        .filter((t) => t < until)
        .sort((a, b) => a - b);
      let fill = rnd(18, 40);
      for (const at of times) {
        const company = pick(companies);
        const truck = pick(company.trucks);
        const weight = weighTruck(truck);
        const before = round1(fill);
        const after = round1(Math.min(100, fill + fillGainPercent(weight.netT)));
        seeded.push({
          id: '',
          vehicleId: '',
          sectorId,
          plate: truck.plate,
          companyName: company.name,
          unloadedAt: new Date(at).toISOString(),
          ...weight,
          fillBeforePercent: before,
          fillAfterPercent: after,
        });
        // 다음 차량이 올 때까지 로봇이 집어 가서 적재율이 내려간다
        fill = Math.max(8, after - rnd(6, 16));
      }
    }
  }
  seeded.sort((a, b) => a.unloadedAt.localeCompare(b.unloadedAt));
  // 차량 번호는 현장 날짜마다 1부터
  const seqByDay = new Map<string, number>();
  for (const r of seeded) {
    const date = siteDate(Date.parse(r.unloadedAt));
    const seq = (seqByDay.get(date) ?? 0) + 1;
    seqByDay.set(date, seq);
    r.vehicleId = `veh-${date}-h${pad(seq, 3)}`;
    r.id = `unl-${date}-h${pad(seq, 3)}`;
  }
  records.push(...seeded);
}

// 최근 40여 분은 sim/process의 지난 예시 차량과 이어지는 차량 흐름이 채운다
seedHistory(Date.now() - 45 * 60_000);
