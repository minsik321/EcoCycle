import type { Batch, RobotState } from '@ecocycle/shared';
import { DEVICE_NAMES, ROBOT_STATUS_TEXT } from '../../config/display';
import { SECTOR_LABEL, mixPercentText, shortId } from '../../config/processDisplay';

// 로봇팔 화면의 문장. 서버가 준 값(로봇 상태·단계·작업 섹터·모드, 배치 stage)을 옮겨 적기만 한다.

/** 주요 수치 칸의 "현재 작업": 태블릿의 좁은 반 칸에도 들어가는 짧은 말 (자세한 문장은 맨 위 "지금 하는 일") */
export function robotTaskShort(robot: RobotState): string {
  if (robot.status !== 'running') return ROBOT_STATUS_TEXT[robot.status];
  const sector = robot.targetTankId ? SECTOR_LABEL[robot.targetTankId] : null;
  switch (robot.phase) {
    case 'pick':
      return sector ? `${sector} 집기` : '집기';
    case 'move':
      return '옮기는 중';
    case 'place':
      return '놓는 중';
    case 'idle':
      if (robot.heldSectorId) return `${SECTOR_LABEL[robot.heldSectorId]} 놓기 대기`;
      return robot.mode === 'manual' ? '명령 대기' : '대기';
  }
}

/** 맨 위 "지금 하는 일" 한 줄 */
export function robotActivity(robot: RobotState): string {
  if (robot.status !== 'running') return `${ROBOT_STATUS_TEXT[robot.status]} 상태입니다`;
  const sector = robot.targetTankId ? DEVICE_NAMES[robot.targetTankId] : null;
  switch (robot.phase) {
    case 'pick':
      return sector ? `${sector}에서 파지를 집는 중` : '파지를 집는 중';
    case 'move':
      return sector ? `${sector} 파지를 컨베이어로 옮기는 중` : '컨베이어로 옮기는 중';
    case 'place':
      return '컨베이어에 파지를 놓는 중';
    case 'idle':
      if (robot.heldSectorId) return `${DEVICE_NAMES[robot.heldSectorId]}에서 집음 · 컨베이어에 놓기를 기다리는 중`;
      return robot.mode === 'manual' ? '수동 모드 · 집기 명령을 기다리는 중' : '다음 집기를 기다리는 중';
  }
}

export interface RobotNowNext {
  now: string | null;
  next: string | null;
}

/**
 * 공정 흐름 안에서 로봇팔의 지금과 다음.
 * 지금: 작업 중인 섹터 → 컨베이어(배합 중인 배치가 있으면 그 배치).
 * 다음: 모드가 정한다 — 자동은 배합 중인 배치의 배합비, 섹터 지정은 지정 섹터 차례, 수동은 명령 대기.
 */
export function robotNowNext(robot: RobotState, batches: readonly Batch[]): RobotNowNext {
  const mixing = batches.find((b) => b.stage === 'mixing');
  const planned = batches.find((b) => b.stage === 'planned');
  const working = robot.status === 'running' && robot.phase !== 'idle' && robot.targetTankId;
  const now = working
    ? `${DEVICE_NAMES[robot.targetTankId!]} → 컨베이어${mixing ? ` · 배치 ${shortId(mixing.id)}` : ''}`
    : robot.heldSectorId
      ? `${DEVICE_NAMES[robot.heldSectorId]} 파지를 들고 있음`
      : null;

  if (robot.status !== 'running') return { now, next: null };
  let next: string | null = null;
  if (robot.mode === 'manual') next = robot.heldSectorId ? '컨베이어에 놓기를 기다립니다' : '집기 명령을 기다립니다';
  else if (robot.mode === 'auto_pinned' && robot.pinnedSectors.length > 0)
    next = `지정 섹터 ${robot.pinnedSectors.map((id) => SECTOR_LABEL[id]).join('·')} 차례로`;
  else if (mixing) next = `배치 ${shortId(mixing.id)} 배합대로 (${mixPercentText(mixing)})`;
  else if (planned) next = `배치 ${shortId(planned.id)} 배합 시작을 기다림`;
  return { now, next };
}
