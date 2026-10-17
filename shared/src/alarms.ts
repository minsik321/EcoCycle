import type { IsoTimestamp } from './common';
import type { DeviceId } from './ids';

/** 명세 예시는 `caution`뿐이다. 심각도는 기기 status 값과 같은 체계를 쓴다고 가정한다. */
export type AlarmLevel = 'caution' | 'alarm';

export type AlarmState = 'active' | 'acknowledged' | 'cleared';

export interface Alarm {
  id: string;
  level: AlarmLevel;
  deviceId: DeviceId;
  message: string;
  state: AlarmState;
  ts: IsoTimestamp;
}

/** GET /alarms?state=active&from=...&to=...&q=... (모두 선택. 기간 [from, to)와 검색어 q를 함께 적용, search.ts) */
export type AlarmListResponse = Alarm[];
