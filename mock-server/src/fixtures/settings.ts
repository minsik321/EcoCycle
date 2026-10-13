import type { DeviceType } from '@ecocycle/shared';

// `update_setting`으로 바꿀 수 있는 설정. 실제 설정 키 목록은 서버 담당과 정한다 (docs/questions.md B17).
export interface SettingDef {
  key: string;
  min: number;
  max: number;
  default: number;
}

export const SETTING_DEFS: Record<DeviceType, SettingDef[]> = {
  tank: [{ key: 'cautionThresholdPercent', min: 1, max: 94, default: 80 }],
  robot: [{ key: 'speedPercent', min: 10, max: 100, default: 100 }],
  conveyor: [{ key: 'speedPercent', min: 10, max: 100, default: 100 }],
  compressor: [{ key: 'pressureLimitMpa', min: 10, max: 40, default: 35 }],
};
