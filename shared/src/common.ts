/**
 * 시각: ISO 8601 UTC 문자열 (예: `2026-10-13T05:23:11.250Z`).
 * `Date`로 바꾸는 것은 앱의 표시 계층에서만 한다.
 */
export type IsoTimestamp = string;

/**
 * 기기 상태 판정. 서버가 기준값으로 정해서 보내고 화면은 표시만 한다.
 * 앱 전체에서 이 네 가지만 같은 색 토큰으로 쓴다.
 */
export const DEVICE_STATUSES = ['normal', 'caution', 'alarm', 'offline'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/*
 * 단위 (명세 "공통 규칙"). 필드 이름에 단위를 드러내고 값은 number로 둔다.
 *   수위·수분·적재율  % (0~100)      fillPercent, moisturePercent, loadPercent
 *   부피              m³             volumeM3, capacityM3
 *   압력              MPa            pressureMpa
 *   온도              °C             temperatureC
 *   각도              도(degree)     joints
 *   무게              t              grossT, tareT, netT — 차량·하역 기록에만 (총중량·공차·순중량)
 * 기기 상태와 실시간 메시지에는 무게를 쓰지 않는다 (섹터는 적재율·부피, 로봇 집기는 부피 또는 횟수).
 */
