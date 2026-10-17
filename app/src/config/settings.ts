import type { DeviceType } from '@ecocycle/shared';

// 기기 페이지에서 바꿀 수 있는 설정(`update_setting`). 키 이름과 허용 범위는 서버와 확정 전이다 (docs/questions.md B17, B18).
// 범위는 화면에서 먼저 걸러 주는 편의이고, 값이 맞는지는 서버가 다시 검증한다(422).

export interface SettingField {
  /** 서버 설정 키 */
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  help: string;
}

export const DEVICE_SETTINGS: Record<DeviceType, readonly SettingField[]> = {
  tank: [
    {
      key: 'cautionThresholdPercent',
      label: '주의 기준 적재율',
      unit: '%',
      min: 1,
      max: 94,
      step: 1,
      help: '섹터 적재율이 이 값 이상이면 서버가 "주의"로 판정합니다.',
    },
  ],
  robot: [{ key: 'speedPercent', label: '동작 속도', unit: '%', min: 10, max: 100, step: 5, help: '로봇팔 동작 속도입니다. 100%가 기본입니다.' }],
  conveyor: [{ key: 'speedPercent', label: '이송 속도', unit: '%', min: 10, max: 100, step: 5, help: '컨베이어 이송 속도입니다. 100%가 기본입니다.' }],
  compressor: [{ key: 'pressureLimitMpa', label: '압력 상한', unit: 'MPa', min: 10, max: 40, step: 0.5, help: '압축기 압력의 허용 상한입니다.' }],
};

/** 입력 문자열을 검사한다. 맞으면 숫자, 틀리면 안내 문구 */
export function validateSetting(field: SettingField, text: string): { value: number } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { error: `${field.label} 값을 입력하세요.` };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: '숫자로 입력하세요.' };
  if (value < field.min || value > field.max) return { error: `${field.min}${field.unit} ~ ${field.max}${field.unit} 사이로 입력하세요.` };
  return { value };
}
