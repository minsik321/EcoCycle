import type { DeviceId, TankId } from '@ecocycle/shared';

// 3D 홈 장면(공장 부지 전체)의 배치와 치수. 길이 단위는 장면 단위(m로 읽되 실제 치수가 아닌 모형 비율), 각도 단위는 도.
// 좌표: Y가 위, 로봇 받침대 중심이 원점. 화면에서는 +X가 왼쪽 아래, -X가 오른쪽 위, -Z가 오른쪽 아래, +Z가 왼쪽 위다.
// 흐름: 정문(+X 끝) → 계중대 → 하역 마당 → 수납 섹터 4곳 → 로봇팔 → 컨베이어(-X 방향) → 압축기 → 출하장(-Z 쪽 마당).
// 장면 구성이 바뀌면(명세 7절 "장면 구성" 가정) 이 파일만 고친다. 위치 계산은 scene/layout.ts가 한다.

/** 부지(울타리) 범위. 전체 보기와 카메라 이동 한계의 기준 */
export const SITE = {
  minX: -8.8,
  maxX: 9.6,
  minZ: -8.7,
  maxZ: 5.6,
  /** 전체 보기 확대를 정할 때 부지 위로 잡는 높이 */
  viewHeight: 3,
} as const;

/** 바닥 그림(도로·표시선)을 그리는 범위. 부지보다 조금 넓다 (바깥 도로 포함) */
export const GROUND = { minX: -13, maxX: 14.5, minZ: -12, maxZ: 9.5 } as const;

/**
 * 해가 있는 방향(길이는 상관없음). 실시간 그림자와 미리 그린 그림자가 같은 값을 쓴다.
 * 카메라와 같은 쪽에 두면 그림자가 물체 뒤로 숨으므로 카메라 옆(화면 왼쪽)에 둔다.
 */
export const SUN = { direction: [6, 12, 3.5] as const } as const;

/** 본관: 지붕을 잘라낸 건물. 카메라에서 먼 두 면(+Z, -X)은 전체 높이 벽, 가까운 두 면은 낮게 자른 벽 */
export const BUILDING = {
  minX: -7.6,
  maxX: 3.0,
  minZ: -3.0,
  maxZ: 3.0,
  wallHeight: 3.0,
  wallThickness: 0.16,
  /** 가까운 쪽 벽을 잘라 남긴 높이 */
  stubHeight: 0.3,
} as const;

/** 로봇 받침대와 팔 */
export const ROBOT = {
  position: [0, 0, 0] as const,
  pedestalHeight: 0.9,
  pedestalRadius: 0.5,
  /**
   * 로봇 관절 값의 0도가 장면에서 가리키는 방향(+X 기준)을 돌리는 각. 0이면 섹터 네 곳이 +X 쪽에 부채꼴로,
   * 컨베이어 쪽 관절 값(150도)이 -X·-Z 쪽에 놓인다. 실제 로봇이 정해지면 다시 맞춘다.
   */
  yawOffsetDeg: 0,
  /**
   * 장면에서 로봇을 키워 그리는 배율(모형 연출). 링크 길이(로봇 모델, 서버 값)는 그대로 두고 그릴 때만 곱한다.
   * 섹터 한 칸에 트럭이 들어갈 폭을 만들려고 키웠다. 집는 자리·놓는 자리도 이 배율을 따른다.
   */
  scale: 1.3,
} as const;

/** 섹터(탱크)가 놓이는 곳은 로봇이 집으러 가는 관절 값(아래)에서 계산한다. 이 각도는 서버의 `base` 관절 값이다. */
export const TANK_BASE_DEG: Record<TankId, number> = {
  'tank-a1': -60,
  'tank-a2': -25,
  'tank-b1': 25,
  'tank-b2': 60,
};

/** 수납 섹터(벙커형 칸). 칸은 Z 방향으로 나란히 놓이고 트럭은 +X 쪽 문으로 후진해 들어온다 */
export const SECTOR = {
  /** 로봇 쪽 낮은 벽 */
  minX: 0.8,
  /** 트럭 쪽 입구 */
  maxX: 2.85,
  wallHeight: 0.8,
  backWallHeight: 0.5,
  wallThickness: 0.1,
  /** 적재율 100%일 때 파지 더미의 높이. 로봇이 집으러 내려오는 높이보다 낮아야 한다 */
  pileMaxHeight: 1.45,
  /** 본관 벽의 트럭 문 폭 */
  doorWidth: 1.1,
} as const;

/** 섹터별 칸의 Z 범위 [min, max]. 로봇이 집는 자리(scene/layout의 tankPosition)가 이 안에 있어야 한다 */
export const SECTOR_Z: Record<TankId, readonly [number, number]> = {
  'tank-a1': [1.4, 2.8],
  'tank-a2': [0, 1.4],
  'tank-b1': [-1.4, 0],
  'tank-b2': [-2.8, -1.4],
};

/** 컨베이어(Section Z): 로봇이 내려놓는 자리에서 -X 쪽으로 길게 이어져 압축기 투입구 위에서 끝난다. */
export const CONVEYOR = {
  startX: -1.45,
  endX: -5.75,
  z: -1.06,
  width: 0.8,
  /** 벨트 윗면 높이. 로봇이 내려놓는 높이(약 1.87) 바로 아래여야 한다 */
  topY: 1.7,
  thickness: 0.18,
  legSpacing: 1.3,
} as const;

/** 압축기: 투입구(위) → 압축실 → 결속부 → 배출 슬라이드(-Z 쪽, 본관 밖 출하장으로). 램은 +Z 쪽에서 민다 */
export const COMPRESSOR = {
  x: -6.3,
  z: -1.06,
  /** 압축실 X 길이 */
  width: 1.5,
  /** 압축실 Z 길이 */
  depth: 1.6,
  /** 압축실 높이 */
  height: 1.25,
  /** 투입구 윗면 높이. 컨베이어 벨트보다 낮아야 한다 */
  hopperTopY: 1.5,
  /** 램이 보이는 틈의 길이(압축실과 유압 장치 사이) */
  ramGap: 0.5,
  /** 결속부 Z 길이 */
  strapDepth: 0.44,
  /** 배출 슬라이드가 끝나는 곳 */
  slideEndZ: -3.7,
} as const;

/** 하역 마당: 트럭이 섹터 문으로 후진하는 곳 */
export const APRON = { minX: 3.0, maxX: 6.6, minZ: -3.0, maxZ: 3.0 } as const;

/** 부지 안 도로(X 방향)와 하역 마당으로 올라가는 연결로, 부지 밖 도로 */
export const ROAD = {
  minX: -7.6,
  maxX: 9.6,
  minZ: -8.0,
  maxZ: -6.2,
  connectorMinX: 3.6,
  connectorMaxX: 5.6,
  publicMinX: 10.4,
  publicMaxX: 12.4,
} as const;

/** 정문과 경비실 */
export const GATE = {
  x: 9.6,
  guardHouse: { x: 8.7, z: -5.5, width: 1.0, depth: 0.9, height: 1.15 },
} as const;

/** 계중대: 들어오는 차로 위. 번호판 카메라와 표시판이 옆에 선다 (무게 숫자는 표시하지 않는다) */
export const WEIGHBRIDGE = { minX: 5.9, maxX: 8.3, z: -7.55, width: 0.86 } as const;

/** 출하장: 압축기 배출 슬라이드 앞 마당. 베일 적치, 지게차 통로, 상차 구역 */
export const YARD = {
  minX: -7.6,
  maxX: 3.6,
  minZ: -6.0,
  maxZ: -3.0,
  /** 베일 적치: 첫 칸 중심과 칸 간격 */
  stack: { x: -4.9, z: -3.5, stepX: 0.68, stepZ: 0.56, columns: 5, rows: 2 },
  /** 지게차 통로 중심선 */
  aisleZ: -4.75,
  aisleWidth: 0.9,
  /** 상차 구역 */
  loading: { minX: -0.6, maxX: 2.6, minZ: -5.9, maxZ: -4.5 },
} as const;

export const OFFICE = { minX: 4.4, maxX: 8.0, minZ: 3.6, maxZ: 5.1, height: 1.9 } as const;

/** 주차장: 하역 마당 옆. 칸은 Z 방향으로 나란하고 차는 +X를 보고 선다 */
export const PARKING = { minX: 6.6, maxX: 8.9, minZ: -2.4, maxZ: 2.4, slots: 6 } as const;

/** 로봇이 집기·놓기를 할 때의 관절 값. 모의 서버(mock-server/src/sim/robot.ts)와 같은 값이어야 시연 동작이 서버와 비슷하다. */
export const DEMO_CYCLE = {
  pickSec: 4,
  moveSec: 4,
  placeSec: 3,
  idleSec: 1,
  conveyorBaseDeg: 150,
  home: [0, 10, -20, 0, 10, 0],
} as const;

/** 핀이 붙는 높이(장면 단위). 장면 위에 올리는 HTML 핀의 기준점 */
export const PIN_HEIGHT: Record<'robot' | 'conveyor' | 'compressor', number> = {
  robot: 3.7,
  conveyor: 2.4,
  compressor: 2.5,
};

/** 섹터 핀 높이 */
export const SECTOR_PIN_HEIGHT: Record<TankId, number> = {
  'tank-a1': 1.8,
  'tank-a2': 1.8,
  'tank-b1': 1.8,
  'tank-b2': 1.8,
};

/** 기기를 눌렀을 때 카메라가 확대하는 정도(전체 보기 대비 배율) */
export const FOCUS_ZOOM: Record<'tank' | 'robot' | 'conveyor' | 'compressor', number> = {
  tank: 3.2,
  robot: 2.6,
  conveyor: 2.4,
  compressor: 3.0,
};

/** 아이소메트릭 카메라가 보는 방향 */
export const CAMERA = {
  /**
   * 장면 중심에서 카메라까지의 방향(길이는 상관없음). +X·-Z 쪽 위에서 본다.
   * 본관의 전체 높이 벽은 카메라 반대쪽 두 면에만 세운다 (scene/objects/world/building).
   */
  direction: [1, 0.95, -1] as const,
  distance: 40,
  /** 전체 보기에서 부지가 화면에 꽉 차지 않게 두는 여백 비율 */
  margin: 0.94,
  /** 카메라가 이동하는 속도 (클수록 빠르다, 초당 비율) */
  damping: 7,
} as const;

export const BELT = { speedMps: 0.35 } as const;

export const DEVICE_ORDER: readonly DeviceId[] = [
  'tank-a1',
  'tank-a2',
  'tank-b1',
  'tank-b2',
  'robot-1',
  'conveyor-z',
  'compressor-1',
];
