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

const KENNEY = {
  licence: 'CC0 1.0 (Kenney, www.kenney.nl)',
  source: 'https://kenney.nl/assets/car-kit',
  note: 'Car Kit 3.1의 GLB를 gltf-transform meshopt로 압축(텍스처 포함). 색은 불러올 때 스튜디오 색으로 바꾼다.',
  scale: 0.54,
  rotation: [0, Math.PI / 2, 0],
  pivot: [0, 0, 0],
} as const;

export const MODELS = {
  'car-sedan': { ...KENNEY, file: 'kenney-car-kit/sedan.glb', triangles: 2032 },
  'car-suv': { ...KENNEY, file: 'kenney-car-kit/suv.glb', triangles: 2474 },
  'car-hatchback': { ...KENNEY, file: 'kenney-car-kit/hatchback-sports.glb', triangles: 2088 },
  'car-van': { ...KENNEY, file: 'kenney-car-kit/van.glb', triangles: 2082 },
  'car-suv-luxury': { ...KENNEY, file: 'kenney-car-kit/suv-luxury.glb', triangles: 2086 },
  'car-sedan-sports': { ...KENNEY, file: 'kenney-car-kit/sedan-sports.glb', triangles: 2088 },
} as const satisfies Record<string, ModelEntry>;

export type ModelKey = keyof typeof MODELS;
