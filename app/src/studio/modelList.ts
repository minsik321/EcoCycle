// 스튜디오가 쓰는 모델 파일 목록 (파일·배율·회전·원점·라이선스·출처·삼각형 수). three를 쓰지 않는다:
// 로그인 화면에서 미리 받을 파일을 고를 때(preload.ts)도 이 목록을 읽는다. 불러오기는 models.ts.

/** 모델 파일이 놓인 곳 (app/public/models) */
export const MODEL_BASE = '/models/';

export interface ModelEntry {
  /** app/public/models 아래 경로 */
  file: string;
  /** 장면 크기에 맞추는 배율 */
  scale: number;
  /** 장면 방향(+X가 앞)에 맞추는 회전 (라디안, XYZ) */
  rotation: readonly [number, number, number];
  /** 원점을 옮길 양 (배율·회전 뒤, 장면 단위). 바닥 중심이 원점이 되게 한다 */
  pivot: readonly [number, number, number];
  licence: string;
  source: string;
  triangles: number;
  /** 원본 대비 바꾼 것 */
  note: string;
  /** Draco로 압축된 파일이면 true (불러올 때 Draco 디코더를 따로 내려받는다) */
  draco?: boolean;
}

/**
 * 지금 장면이 쓰는 모델 파일은 없다: 실제 부지 배치(2026-11-24)에서 주차 차량(Kenney Car Kit)을 없앴고,
 * 트럭·지게차·작업자·나무·소품·건물은 모두 코드로 만든 모형이다. 모델을 다시 쓰게 되면 여기에 적고 불러오기를 붙인다(studio/CLAUDE.md "모델").
 * 미리 받기(preload.ts)는 이 목록의 파일만 받으므로, 비어 있는 동안에는 모델 파일을 받지 않는다.
 */
export const MODELS: Readonly<Record<string, ModelEntry>> = {};
