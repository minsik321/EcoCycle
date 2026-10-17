// 화질 3단계 (docs/decisions.md 2026-10-13 "홈 3D 재설계").
// `low`는 저사양 기기의 안전판이다: 끊김 없이 도는 것이 유일한 기준이다.
// 단계별로 무엇을 어떻게 그리는지는 3D 홈이 정한다(studio/quality.ts의 STUDIO_PROFILES). 여기에는 단계 이름·문구와 자동 선택 기준만 둔다.
// 실기기 테스트 결과로 이 값을 조정한다 (명세 4절: 가장 낮은 사양에서 30분 이상 구동해 끊김·발열 확인).

export const QUALITY_TIERS = ['high', 'standard', 'low'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export const QUALITY_TEXT: Record<QualityTier, { label: string; help: string }> = {
  high: { label: '고화질', help: '부드러운 그림자, 빛 번짐, 유리 패널까지 모두 켭니다. 성능 여유가 있는 기기용입니다.' },
  standard: { label: '기본', help: '그림자를 가볍게 그리고 주요 패널만 유리로 보여 줍니다.' },
  low: { label: '저사양', help: '연출과 그리는 횟수를 줄여 태블릿의 발열과 끊김을 낮춥니다. 패널은 단색으로 보입니다.' },
};

/** 자동 선택 기준: 짧은 측정에서 나온 초당 프레임 수가 이 값 이상이면 그 단계를 고른다 */
export const PROBE_FPS_FOR_HIGH = 50;
export const PROBE_FPS_FOR_STANDARD = 28;
/** 측정 시간(ms)과 시작 전 버리는 시간(ms) */
export const PROBE_MEASURE_MS = 1200;
export const PROBE_WARMUP_MS = 300;
/** 앱이 뜨는 동안의 프레임 저하를 피하려고 측정을 시작하기 전에 기다리는 시간(ms) */
export const PROBE_START_DELAY_MS = 1500;

/**
 * 측정한 초당 프레임 수로 화질 단계를 고른다. 측정하지 못했으면(null) 기본 단계.
 * 처리 코어가 2개 이하인 기기는 측정이 잘 나와도 고화질로 올리지 않는다(오래 돌리면 발열로 느려진다).
 * 아이폰 같은 기기는 코어 수를 적게 알려 줄 수 있어 4개 이하로 막으면 고화질에 닿지 못했다(2026-10-17).
 */
export function tierFromProbe(fps: number | null, cpuCores?: number): QualityTier {
  if (fps === null) return 'standard';
  if (fps < PROBE_FPS_FOR_STANDARD) return 'low';
  if (fps < PROBE_FPS_FOR_HIGH) return 'standard';
  return cpuCores !== undefined && cpuCores <= 2 ? 'standard' : 'high';
}
