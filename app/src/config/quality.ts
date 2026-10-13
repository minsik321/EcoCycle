// 화질 3단계 (docs/decisions.md 2026-10-13 "홈 3D 재설계").
// `low`는 저사양 태블릿의 안전판이다: 불투명 저폴리, 미리 그린 그림자, 블러 없는 단색 패널, 줄인 오브젝트 수.
// 실기기 테스트 결과로 이 값을 조정한다 (명세 4절: 가장 낮은 사양에서 30분 이상 구동해 끊김·발열 확인).

export const QUALITY_TIERS = ['high', 'standard', 'low'] as const;
export type QualityTier = (typeof QUALITY_TIERS)[number];

export interface QualityProfile {
  /** 초당 최대 그리기 횟수. 센서 값이 빨라도 이 이상 그리지 않는다 (명세: 30 이하). */
  maxFps: number;
  /** 화면 배율 상한. 높을수록 선명하지만 무겁다. */
  maxPixelRatio: number;
  antialias: boolean;
  /** 그림자: baked 바닥에 미리 그린 그림자, single 그림자 조명 하나(낮은 해상도), soft 실시간 부드러운 그림자 */
  shadows: 'baked' | 'single' | 'soft';
  /** 그림자 지도 한 변의 픽셀 수 (baked에서는 쓰지 않는다) */
  shadowMapSize: number;
  /** 빛 번짐 */
  bloom: boolean;
  /** UI 패널 블러: none 단색, main 주요 패널만, all 전체 (styles/index.css의 .glass 규칙과 같다) */
  panelBlur: 'none' | 'main' | 'all';
  /** 주변 소품(나무·가로등·주차 차량·작업자 등)을 얼마나 그릴지. 0 최소, 1 중간, 2 전부 */
  detail: 0 | 1 | 2;
  /** 날씨 입자(비·먼지)를 그릴지 */
  particles: boolean;
  /** 탱크(섹터) 하나에 그릴 파지 조각의 최대 수 (가득 찼을 때) */
  maxChunksPerTank: number;
  /** 컨베이어 벨트 위에 움직이는 줄무늬 수 */
  beltSlats: number;
}

export const QUALITY_PROFILES: Record<QualityTier, QualityProfile> = {
  high: {
    maxFps: 30,
    maxPixelRatio: 2,
    antialias: true,
    shadows: 'soft',
    shadowMapSize: 2048,
    bloom: true,
    panelBlur: 'all',
    detail: 2,
    particles: true,
    maxChunksPerTank: 140,
    beltSlats: 28,
  },
  standard: {
    maxFps: 30,
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: 'single',
    shadowMapSize: 1024,
    bloom: false,
    panelBlur: 'main',
    detail: 1,
    particles: true,
    maxChunksPerTank: 96,
    beltSlats: 24,
  },
  low: {
    maxFps: 20,
    maxPixelRatio: 1,
    antialias: false,
    shadows: 'baked',
    shadowMapSize: 0,
    bloom: false,
    panelBlur: 'none',
    detail: 0,
    particles: false,
    maxChunksPerTank: 36,
    beltSlats: 12,
  },
};

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

/**
 * 측정한 초당 프레임 수로 화질 단계를 고른다. 측정하지 못했으면(null) 기본 단계.
 * 처리 코어가 적은 기기는 측정이 잘 나와도 고화질로 올리지 않는다(오래 돌리면 발열로 느려진다).
 */
export function tierFromProbe(fps: number | null, cpuCores?: number): QualityTier {
  if (fps === null) return 'standard';
  if (fps < PROBE_FPS_FOR_STANDARD) return 'low';
  if (fps < PROBE_FPS_FOR_HIGH) return 'standard';
  return cpuCores !== undefined && cpuCores <= 4 ? 'standard' : 'high';
}
