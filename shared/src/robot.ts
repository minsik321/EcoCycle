/** 로봇 동작 단계. 홈 하단 단계 바(집기·이동·놓기)에 연결된다. */
export const PHASES = ['idle', 'pick', 'move', 'place'] as const;
export type Phase = (typeof PHASES)[number];

/** 로봇 상태. 정지·오류·연결 끊김은 화면에서 색으로 강조한다. */
export const ROBOT_STATUSES = ['idle', 'running', 'paused', 'stopped', 'error', 'offline'] as const;
export type RobotStatus = (typeof ROBOT_STATUSES)[number];

export const ROBOT_MODES = ['auto', 'manual'] as const;
export type RobotMode = (typeof ROBOT_MODES)[number];

/**
 * GET /robots/{id}/model — 관절 값을 화면에 맞추는 정보. 관절 값 배열 순서는 `joints` 순서를 따른다.
 * ⚠ 명세에 응답 예시가 없어 형식은 제안안이다(항목은 명세의 축 수·관절 순서·링크 길이·각도 범위·영점).
 * 기본값은 앱 `config/robotModel.ts`에 두고 이 응답으로 덮어쓴다.
 */
export interface RobotJointModel {
  name: string;
  /** 각도 범위(도) */
  minDeg: number;
  maxDeg: number;
  /** 영점(도) */
  zeroDeg: number;
}

export interface RobotModel {
  deviceId: 'robot-1';
  axisCount: number;
  joints: RobotJointModel[];
  /** 링크 길이(m) */
  linkLengthsM: number[];
}
