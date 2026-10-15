import { COMMAND_RULES } from '@ecocycle/shared';
import type { CommandStatus, CommandType, DeviceType, Permission } from '@ecocycle/shared';

// 화면에 보일 조작과 위치. 위험도·필요 권한·대상은 shared의 COMMAND_RULES가 기준이고 여기서는 표시만 정한다.
// 조작 목록은 프로토타입 피드백으로 확정한다 (docs/questions.md A3).

/** quick: 홈·확대 화면(간단한 조작), devicePage: 기기 페이지(신중한 조작 포함) */
export type ControlPlace = 'quick' | 'devicePage';

export interface ControlText {
  label: string;
  /** 확인 단계(confirm: true)가 필요한 조작에 보여 줄 안내 */
  confirmMessage?: string;
}

export const CONTROL_TEXT: Record<CommandType, ControlText> = {
  set_batch_mix: { label: '배합 변경', confirmMessage: '선택한 배치를 변경합니다. 계속할까요?' },
  set_batch_pressure: { label: '압력 변경', confirmMessage: '선택한 배치를 변경합니다. 계속할까요?' },
  pause_batch: { label: '배치 일시정지', confirmMessage: '선택한 배치를 변경합니다. 계속할까요?' },
  resume_batch: { label: '배치 재개', confirmMessage: '선택한 배치를 변경합니다. 계속할까요?' },
  skip_batch: { label: '배치 건너뛰기', confirmMessage: '선택한 배치를 변경합니다. 계속할까요?' },
  start: { label: '시작' },
  pause: { label: '일시정지' },
  resume: { label: '재개' },
  stop: { label: '정지' },
  set_mode: { label: '모드 전환', confirmMessage: '운전 모드를 바꿉니다. 계속할까요?' },
  pick_from: { label: '섹터 지정 집기', confirmMessage: '선택한 섹터에서 파지를 집어 옮깁니다. 계속할까요?' },
  update_setting: { label: '설정 변경', confirmMessage: '설정값을 바꿉니다. 계속할까요?' },
  ack_alarm: { label: '알람 확인' },
};

/** 버튼이 놓이는 순서 */
export const CONTROL_ORDER: readonly CommandType[] = [
  'set_batch_mix',
  'set_batch_pressure',
  'pause_batch',
  'resume_batch',
  'skip_batch',

  'start',
  'pause',
  'resume',
  'stop',
  'set_mode',
  'pick_from',
  'update_setting',
  'ack_alarm',
];

/** 위험도가 낮으면 홈·확대 화면과 기기 페이지 모두, 높으면 기기 페이지에서만 둔다. */
export function controlPlaces(type: CommandType): readonly ControlPlace[] {
  return COMMAND_RULES[type].risk === 'low' ? ['quick', 'devicePage'] : ['devicePage'];
}

/** 이 위치의 이 대상에 놓을 조작 목록. 알람에 거는 조작은 대상으로 'alarm'을 넘긴다. */
export function controlsFor(place: ControlPlace, target: DeviceType | 'alarm'): CommandType[] {
  return CONTROL_ORDER.filter(
    (type) => !type.includes('batch') && COMMAND_RULES[type].targets.includes(target) && controlPlaces(type).includes(place),
  );
}

/**
 * 이 권한 목록으로 버튼을 활성화할지. 편의 기능일 뿐이고 차단은 서버가 한다.
 * 비활성화된 버튼도 눌렀을 때 서버가 403을 줄 수 있어야 한다.
 */
export function canUse(permissions: readonly Permission[], type: CommandType): boolean {
  return permissions.includes(COMMAND_RULES[type].permission);
}

/** 명령 처리 결과 표시 문구 (홈에서도 조작 결과를 바로 보여 준다) */
export const COMMAND_STATUS_TEXT: Record<CommandStatus, string> = {
  accepted: '접수됨',
  rejected: '거부됨',
  completed: '완료',
  failed: '실패',
};
