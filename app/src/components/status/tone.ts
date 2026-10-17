import type { DeviceStatus } from '@ecocycle/shared';

// 상태 색 클래스. Tailwind가 클래스 이름을 찾을 수 있게 문자열 전체를 그대로 적는다.
// 색 토큰(--color-status-*)은 styles/index.css에 있고, 색만으로 구분하지 않도록 기호와 글자를 함께 쓴다.
export const TONE_CLASS: Record<DeviceStatus, string> = {
  normal: 'border-status-normal/30 bg-status-normal-soft text-status-normal',
  caution: 'border-status-caution/30 bg-status-caution-soft text-status-caution',
  alarm: 'border-status-alarm/30 bg-status-alarm-soft text-status-alarm',
  offline: 'border-status-offline/30 bg-status-offline-soft text-status-offline',
};

/** 수위 막대 등 채워지는 부분의 색 */
export const BAR_CLASS: Record<DeviceStatus, string> = {
  normal: "bg-status-normal",
  caution: "bg-status-caution",
  alarm: "bg-status-alarm",
  offline: "bg-status-offline",
};
