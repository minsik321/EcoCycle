import { QUALITY_TIERS } from '../config/quality';
import type { QualityTier } from '../config/quality';

// 스튜디오의 화질 단계 (studio/CLAUDE.md 고정 규칙 6). 앱 전체의 단계 이름(high/standard/low)을 그대로 쓰고,
// 단계마다 스튜디오가 무엇을 그릴지는 여기서만 정한다.
// 휴대폰 먼저: 기본 단계는 기기 종류로 고른다 (폰 low, 태블릿 standard, 데스크톱 high). 접속 때 프레임 측정이 한 단계까지 조정한다.

export interface StudioProfile {
  /** 화면 배율 상한 */
  maxDpr: number;
  /** 초당 최대 그리기 횟수. 0이면 상한 없음(화면 주사율까지) */
  maxFps: number;
  /** 실시간 그림자 지도 한 변. 0이면 실시간 그림자 없이 미리 구운 바닥 그림자만 */
  shadowMap: 0 | 1024 | 2048;
  /** 주변 차폐: baked 미리 구운 바닥 텍스처, n8ao-half 낮은 품질·반 해상도, n8ao 높은 품질 */
  ao: 'baked' | 'n8ao-half' | 'n8ao';
  /** 후처리 묶음(EffectComposer)을 쓰는지. low는 후처리 없이 렌더러의 톤 매핑만 쓴다 */
  post: boolean;
  bloom: boolean;
  tiltShift: boolean;
  /** 패널 뒤 흐림: none 단색, main 주요 패널만 약하게, all 전체 */
  panelBlur: 'none' | 'main' | 'all';
}

export const STUDIO_PROFILES: Record<QualityTier, StudioProfile> = {
  high: { maxDpr: 2, maxFps: 0, shadowMap: 2048, ao: 'n8ao', post: true, bloom: true, tiltShift: true, panelBlur: 'all' },
  standard: { maxDpr: 1.5, maxFps: 30, shadowMap: 2048, ao: 'n8ao-half', post: true, bloom: false, tiltShift: false, panelBlur: 'main' },
  low: { maxDpr: 1, maxFps: 30, shadowMap: 0, ao: 'baked', post: false, bloom: false, tiltShift: false, panelBlur: 'none' },
};

export type DeviceClass = 'phone' | 'tablet' | 'desktop';

/** 휴대폰·태블릿용 그래픽 칩 이름 (WEBGL_debug_renderer_info로 읽을 수 있을 때만) */
const MOBILE_GPU = /adreno|mali|powervr|apple gpu|immortalis|xclipse|videocore|tegra/i;

export interface DeviceHints {
  width: number;
  height: number;
  /** 손가락 입력이 주된 기기 (pointer: coarse) */
  coarse: boolean;
  /** 그래픽 칩 이름. 알 수 없으면 '' */
  gpu: string;
}

/**
 * 화면 크기와 그래픽 칩으로 기기 종류를 고른다.
 * - 폰: 짧은 변이 600px 미만
 * - 태블릿: 폭 1000px 미만(세로 태블릿), 또는 긴 변 1366px 이하이면서 손가락 입력·모바일 칩
 * - 그 밖은 데스크톱
 */
export function deviceClass({ width, height, coarse, gpu }: DeviceHints): DeviceClass {
  if (Math.min(width, height) < 600) return 'phone';
  if (width < 1000) return 'tablet';
  if (Math.max(width, height) <= 1366 && (coarse || MOBILE_GPU.test(gpu))) return 'tablet';
  return 'desktop';
}

export const DEVICE_DEFAULT_TIER: Record<DeviceClass, QualityTier> = { phone: 'low', tablet: 'standard', desktop: 'high' };

const rank = (tier: QualityTier): number => QUALITY_TIERS.length - 1 - QUALITY_TIERS.indexOf(tier); // low 0, standard 1, high 2
const fromRank = (r: number): QualityTier => QUALITY_TIERS[QUALITY_TIERS.length - 1 - Math.max(0, Math.min(2, r))]!;

/**
 * 스튜디오가 쓸 단계.
 * - 사용자가 직접 고른 값이 있으면 그대로
 * - 측정값이 있으면 기기 종류 기본값에서 그쪽으로 한 단계까지만 움직인다
 * - 아무것도 없으면 기기 종류 기본값
 */
export function studioTier(device: DeviceClass, probed: QualityTier | null, chosen: QualityTier | null): QualityTier {
  if (chosen) return chosen;
  const base = rank(DEVICE_DEFAULT_TIER[device]);
  if (!probed) return fromRank(base);
  return fromRank(base + Math.sign(rank(probed) - base));
}

/** 지금 기기의 단서 (브라우저에서만). 그래픽 칩 이름은 한 번만 읽는다 */
let gpuName: string | null = null;
export function readDeviceHints(): DeviceHints {
  if (gpuName === null) {
    gpuName = '';
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      if (gl && ext) gpuName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      gpuName = '';
    }
  }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return { width: window.innerWidth, height: window.innerHeight, coarse, gpu: gpuName };
}

export const TIER_LABEL: Record<QualityTier, string> = { high: '고화질', standard: '기본', low: '저사양' };
