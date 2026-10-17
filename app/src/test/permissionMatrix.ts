import { COMMAND_RULES } from '@ecocycle/shared';
import type { CommandType, Permission, Role } from '@ecocycle/shared';
import { ROLE_PERMISSIONS } from '../../../mock-server/src/fixtures/accounts';

// 권한 매트릭스: "누가 무엇을 할 수 있는가"의 한 장짜리 기준표 (명세 6절 "권한 표"와 같은 줄, 같은 글).
// 세 테스트가 이 표 하나를 돈다. 줄을 더하거나 권한을 바꾸면 세 곳이 함께 깨진다.
//   - permissionMatrix.test.tsx: 화면(숨김·비활성과 이유) + api 클라이언트(권한 없으면 요청 안 함) + 명세의 표와 같은지
//   - integration/permissions.integration.test.ts: 실제 모의 서버에 HTTP로 직접 불러 403(권한 없음)·200(조회)
// 역할별 권한은 모의 서버 계정(`mock-server/src/fixtures/accounts.ts`)의 가정이고(docs/questions.md A4), 명령별 필요 권한은 shared `COMMAND_RULES`다.

export const ROLES: readonly Role[] = ['admin', 'operator', 'viewer'];

export type MatrixRowId =
  | 'view.home3d'
  | 'view.dashboard'
  | 'view.devices'
  | 'view.records'
  | 'view.batchBale'
  | 'view.alarms'
  | 'view.cctv'
  | 'view.settings'
  | 'view.robotDiagnostics'
  | 'cmd.run'
  | 'cmd.ack'
  | 'cmd.setting'
  | 'cmd.mode'
  | 'cmd.pin'
  | 'cmd.pick'
  | 'cmd.place'
  | 'cmd.batchMix'
  | 'cmd.batchPressure'
  | 'cmd.batchPause'
  | 'cmd.batchSkip';

export interface MatrixRow {
  id: MatrixRowId;
  /** 명세 권한 표의 첫 칸과 글자까지 같다 */
  label: string;
  /** 필요 권한. null이면 로그인한 모든 역할 */
  permission: Permission | null;
  /** 이 동작이 보내는 명령 (필요 권한은 COMMAND_RULES와 같아야 한다) */
  commands: readonly CommandType[];
  /**
   * 서버가 막는가. false는 화면만 가르는 표시 구분이다(서버는 같은 값을 모두에게 준다).
   * 조회 줄은 서버가 "로그인했는가"만 본다(로그인하지 않으면 401).
   */
  serverEnforced: boolean;
}

export const PERMISSION_MATRIX: readonly MatrixRow[] = [
  { id: 'view.home3d', label: '3D 홈 보기 (장면·지표·표·상세 패널)', permission: null, commands: [], serverEnforced: true },
  { id: 'view.dashboard', label: '대시보드 홈 보기 (KPI 상세 팝업 포함)', permission: null, commands: [], serverEnforced: true },
  { id: 'view.devices', label: '섹터·로봇팔·컨베이어·압축기 페이지 보기', permission: null, commands: [], serverEnforced: true },
  { id: 'view.records', label: '공정 기록과 기록 상세 팝업 보기', permission: null, commands: [], serverEnforced: true },
  { id: 'view.batchBale', label: '배치·베일 화면 보기', permission: null, commands: [], serverEnforced: true },
  { id: 'view.alarms', label: '알람 보기 (열린 알람·이력)', permission: null, commands: [], serverEnforced: true },
  { id: 'view.cctv', label: 'CCTV 보기', permission: null, commands: [], serverEnforced: true },
  { id: 'view.settings', label: '설정 화면 (화질·계정)', permission: null, commands: [], serverEnforced: true },
  { id: 'view.robotDiagnostics', label: '로봇 진단 (관절 각도 표)', permission: 'robot.manual', commands: [], serverEnforced: false },
  { id: 'cmd.run', label: '시작·일시정지·재개·정지', permission: 'robot.control', commands: ['start', 'pause', 'resume', 'stop'], serverEnforced: true },
  { id: 'cmd.ack', label: '알람 확인', permission: 'alarm.ack', commands: ['ack_alarm'], serverEnforced: true },
  { id: 'cmd.setting', label: '설정값 변경', permission: 'settings.write', commands: ['update_setting'], serverEnforced: true },
  { id: 'cmd.mode', label: '로봇 운전 모드 전환 (자동·수동)', permission: 'robot.manual', commands: ['set_mode'], serverEnforced: true },
  { id: 'cmd.pin', label: '로봇 섹터 지정 (자동 · 섹터 지정)', permission: 'robot.manual', commands: ['set_mode'], serverEnforced: true },
  { id: 'cmd.pick', label: '로봇 수동 집기', permission: 'robot.manual', commands: ['pick_from'], serverEnforced: true },
  { id: 'cmd.place', label: '로봇 컨베이어에 놓기', permission: 'robot.manual', commands: ['place_on_conveyor'], serverEnforced: true },
  { id: 'cmd.batchMix', label: '배치 배합 변경', permission: 'batch.control', commands: ['set_batch_mix'], serverEnforced: true },
  { id: 'cmd.batchPressure', label: '배치 목표 압력 변경', permission: 'batch.control', commands: ['set_batch_pressure'], serverEnforced: true },
  { id: 'cmd.batchPause', label: '배치 일시정지·재개', permission: 'batch.control', commands: ['pause_batch', 'resume_batch'], serverEnforced: true },
  { id: 'cmd.batchSkip', label: '배치 건너뛰기', permission: 'batch.control', commands: ['skip_batch'], serverEnforced: true },
];

/** 이 역할이 이 줄의 동작을 할 수 있는가 */
export const allowedFor = (row: MatrixRow, role: Role): boolean =>
  row.permission === null || ROLE_PERMISSIONS[role].includes(row.permission);

/** 명령 하나의 필요 권한 (COMMAND_RULES) */
export const commandPermission = (type: CommandType): Permission => COMMAND_RULES[type].permission;
