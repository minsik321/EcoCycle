import type { QualityMode } from '../store';

// 3D 화질 모드. 저사양 태블릿에서는 그리는 횟수와 오브젝트 수를 줄인다 (scene/CLAUDE.md 성능 원칙).
// 실기기 테스트 결과로 이 값을 조정한다 (명세 4절: 가장 낮은 사양에서 30분 이상 구동해 끊김·발열 확인).

export interface QualityProfile {
  /** 초당 최대 그리기 횟수. 센서 값이 빨라도 이 이상 그리지 않는다. */
  maxFps: number;
  /** 화면 배율 상한. 높을수록 선명하지만 무겁다. */
  maxPixelRatio: number;
  antialias: boolean;
  /** 탱크 하나에 그릴 파지 조각의 최대 수 (가득 찼을 때) */
  maxChunksPerTank: number;
  /** 컨베이어 벨트 위에 움직이는 줄무늬 수 */
  beltSlats: number;
}

export const QUALITY_PROFILES: Record<QualityMode, QualityProfile> = {
  standard: { maxFps: 30, maxPixelRatio: 1.5, antialias: true, maxChunksPerTank: 96, beltSlats: 24 },
  low: { maxFps: 20, maxPixelRatio: 1, antialias: false, maxChunksPerTank: 36, beltSlats: 12 },
};
