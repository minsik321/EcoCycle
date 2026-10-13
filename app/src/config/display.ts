import type { DeviceId, DeviceStatus, DeviceType, Phase, RobotMode, RobotStatus, Role } from '@ecocycle/shared';

// 표시용 문구·기호·형식. 상태 색은 styles/index.css의 토큰(--color-status-*)을 쓴다.
// 상태 판정(status)은 서버가 하고 화면은 표시만 한다. 색만으로 구분하지 않도록 기호와 글자를 함께 쓴다.

export const STATUS_TEXT: Record<DeviceStatus, string> = {
  normal: '정상',
  caution: '주의',
  alarm: '알람',
  offline: '연결 끊김',
};

export const STATUS_SYMBOL: Record<DeviceStatus, string> = {
  normal: '✓',
  caution: '▲',
  alarm: '✕',
  offline: '–',
};

export const ROBOT_STATUS_TEXT: Record<RobotStatus, string> = {
  idle: '대기',
  running: '작동 중',
  paused: '일시정지',
  stopped: '정지',
  error: '오류',
  offline: '연결 끊김',
};

/** 로봇 상태를 기기 상태 색으로 옮긴다 (정지·오류·연결 끊김은 눈에 띄게) */
export const ROBOT_STATUS_TONE: Record<RobotStatus, DeviceStatus> = {
  idle: 'normal',
  running: 'normal',
  paused: 'caution',
  stopped: 'caution',
  error: 'alarm',
  offline: 'offline',
};

export const ROBOT_MODE_TEXT: Record<RobotMode, string> = {
  auto: '자동',
  manual: '수동',
};

// 권한 종류는 대표님과 확정 전이다 (docs/questions.md A4). 표시 이름만 둔다. 화면 분기에는 쓰지 않는다.
export const ROLE_TEXT: Record<Role, string> = {
  admin: '관리자',
  operator: '작업자',
  viewer: '열람자',
};

export const DEVICE_NAMES: Record<DeviceId, string> = {
  'tank-a1': '탱크 A1',
  'tank-a2': '탱크 A2',
  'tank-b1': '탱크 B1',
  'tank-b2': '탱크 B2',
  'robot-1': '로봇팔',
  'conveyor-z': '컨베이어 Section Z',
  'compressor-1': '압축기',
};

/**
 * 홈 하단 단계 바: 집기, 이동, 놓기, 압축.
 * 압축은 서버의 로봇 `phase`(idle/pick/move/place)에 없어서 연결할 값이 아직 정해지지 않았다.
 * 압축기 `running`으로 대신할지 서버에 확인한다 (docs/questions.md).
 */
export const PHASE_STEPS: ReadonlyArray<{ key: string; label: string; phase: Phase | null }> = [
  { key: 'pick', label: '집기', phase: 'pick' },
  { key: 'move', label: '이동', phase: 'move' },
  { key: 'place', label: '놓기', phase: 'place' },
  { key: 'compress', label: '압축', phase: null },
];

// 값 표시 형식: 단위는 %, m³, MPa, °C, 도. 무게는 쓰지 않는다.
const oneDecimal = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

export const formatPercent = (value: number): string => `${oneDecimal.format(value)}%`;
export const formatVolumeM3 = (value: number): string => `${oneDecimal.format(value)} m³`;
export const formatPressureMpa = (value: number): string => `${oneDecimal.format(value)} MPa`;
export const formatTemperatureC = (value: number): string => `${oneDecimal.format(value)} °C`;
export const formatAngleDeg = (value: number): string => `${oneDecimal.format(value)}°`;
export const formatLoadPercent = (value: number): string => `${integer.format(value)}%`;

/** ISO 8601 UTC 문자열을 현지 시각으로 (표시할 때만 변환한다). 잘못된 값이면 "-" */
export function formatLocalTime(iso: string | null | undefined, withSeconds = true): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

// --- 이력 그래프 (기기 페이지) ---
// 센서값을 그때그때 보는 용도라 상세할 필요가 없다. 한 번에 한 구간만 요청하고, 구간마다 점이 수백 개 이하로 유지된다.

export type HistoryUnitKey = 'day' | 'week' | 'month';

export interface HistoryUnit {
  label: string;
  /** 구간 길이(ms) */
  spanMs: number;
  /** 서버에 요청할 간격 */
  interval: string;
  /** 구간 안의 점 수(참고) */
  points: number;
  /** x축 눈금 형식: 시각 또는 날짜 */
  tick: 'time' | 'date';
}

export const HISTORY_UNIT_ORDER: readonly HistoryUnitKey[] = ['day', 'week', 'month'];

export const HISTORY_UNITS: Record<HistoryUnitKey, HistoryUnit> = {
  day: { label: '일', spanMs: 24 * 3_600_000, interval: '10m', points: 144, tick: 'time' },
  week: { label: '주', spanMs: 7 * 24 * 3_600_000, interval: '1h', points: 168, tick: 'date' },
  month: { label: '월', spanMs: 30 * 24 * 3_600_000, interval: '6h', points: 120, tick: 'date' },
};

export interface HistoryMetric {
  /** 서버 `metric` 값. 이름은 서버와 확정 전이다 (docs/questions.md B12). */
  key: string;
  label: string;
  unit: string;
  /** y축 범위. 퍼센트는 0~100으로 고정하고 나머지는 자동 */
  domain: readonly [number, number] | 'auto';
}

export const HISTORY_METRICS: Record<DeviceType, readonly HistoryMetric[]> = {
  tank: [
    { key: 'level', label: '적재율', unit: '%', domain: [0, 100] },
    { key: 'moisture', label: '수분', unit: '%', domain: [0, 100] },
    { key: 'volume', label: '부피', unit: 'm³', domain: 'auto' },
  ],
  robot: [],
  conveyor: [{ key: 'load', label: '적재 정도', unit: '%', domain: [0, 100] }],
  compressor: [
    { key: 'pressure', label: '압력', unit: 'MPa', domain: 'auto' },
    { key: 'temperature', label: '온도', unit: '°C', domain: 'auto' },
  ],
};

/** 점이 하나도 없는 구간에 보여 줄 안내 */
export const HISTORY_EMPTY_TEXT = '이 구간에는 기록된 값이 없습니다.';
