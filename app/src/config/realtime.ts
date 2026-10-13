// 실시간 연결 설정. 실서버 특성에 따라 조정한다 (3단계).

/** 이 시간 동안 아무 메시지도 받지 못하면 "연결 끊김"으로 표시하고 로봇팔을 멈춘다 (ms) */
export const DISCONNECT_TIMEOUT_MS = 15_000;

/** 끊김 감지를 확인하는 주기 (ms) */
export const DISCONNECT_CHECK_INTERVAL_MS = 1_000;

/** 재연결 간격: 처음 값에서 시작해 두 배씩 늘리고 상한에서 멈춘다 (ms) */
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 15_000;

/** 관절 값을 이만큼 늦춰서 그리면 도착 간격이 들쭉날쭉해도 부드럽다 (초) */
export const JOINT_DELAY_SEC = 0.15;

/** 저빈도 값(기기 상태 등)을 store에 모아서 반영하는 주기 (ms). 값이 올 때마다 그리지 않는다. */
export const STORE_BATCH_MS = 250;

/** 로봇 관절 값을 구독하는 화면: 홈과 로봇 확대 화면에 있을 때만 구독하고 나머지에서는 해제한다. */
export const JOINT_SUBSCRIBE_VIEWS = ['home', 'robotZoom'] as const;
