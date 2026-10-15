import type { Batch, RobotState, TankId, TankState, Vehicle } from '@ecocycle/shared';
import { formatPercent } from '../../config/display';
import { shortId } from '../../config/processDisplay';

// 섹터 화면의 문장. 서버가 준 값(섹터 상태, 차량·배치 stage, 로봇 작업 섹터)을 옮겨 적기만 한다.

/** 섹터 그림의 화면 읽기용 설명 */
export function binLabel(name: string, tank: TankState, disconnected: boolean): string {
  if (disconnected) return `${name} 그림, 연결 끊김`;
  return `${name} 적재율 ${formatPercent(tank.fillPercent)}, 주의 기준 ${Math.round(tank.cautionThresholdPercent)}%`;
}

export interface SectorActivity {
  /** 지금 이 섹터에서 일어나는 일. 없으면 null */
  now: string | null;
  /** 이 섹터에 다음으로 올 일. 없으면 null */
  next: string | null;
}

const vehicleText = (v: Vehicle) => [v.plate, v.companyName].filter(Boolean).join(' ');
const share = (batch: Batch, id: TankId) => batch.mix.find((m) => m.sectorId === id)?.percent;

/**
 * 공정 흐름 안에서 이 섹터의 지금과 다음.
 * 지금: 하역 중인 차량 → 로봇팔이 이 섹터를 작업 중 → 배합 중인 배치가 이 섹터를 쓴다.
 * 다음: 이 섹터로 오는 인식된 차량 → 이 섹터를 쓰는 계획된 배치.
 */
export function sectorActivity(id: TankId, vehicles: readonly Vehicle[], batches: readonly Batch[], robot: RobotState | null): SectorActivity {
  const mine = vehicles.filter((v) => v.sectorId === id);
  const unloading = mine.find((v) => v.stage === 'unloading');
  const coming = mine.find((v) => v.stage === 'identified');
  const mixing = batches.find((b) => b.stage === 'mixing' && share(b, id) !== undefined);
  const planned = batches.find((b) => b.stage === 'planned' && share(b, id) !== undefined);
  const robotHere = robot && robot.targetTankId === id && robot.status === 'running';

  let now: string | null = null;
  if (unloading) now = `${vehicleText(unloading)} 하역 중`;
  else if (robotHere) now = '로봇팔이 집는 중';
  else if (mixing) now = `배치 ${shortId(mixing.id)}에 ${share(mixing, id)}% 사용 중`;

  let next: string | null = null;
  if (coming) next = `${vehicleText(coming)} 하역 예정`;
  else if (planned) next = `배치 ${shortId(planned.id)}에 ${share(planned, id)}% 사용 예정`;

  return { now, next };
}
