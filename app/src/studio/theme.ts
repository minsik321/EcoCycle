// 스튜디오 탭의 색. 기존 장면의 palette·디자인 토큰과 무관하다 (studio/CLAUDE.md).
// 구역마다 밝기 단계가 분명해야 한다 (참고 화면 docs/reference/): 도로(중간 회청색) < 마당 콘크리트(옅은 회색) < 건물 바닥(거의 흰색),
// 가장자리의 옅은 녹지. 강조는 파랑 하나 + 차량·로봇의 안전 노랑 + 파지·베일의 크라프트 갈색. 회색 화면은 연결 끊김에만 쓴다.

export const C = {
  /** 부지 밖 바닥: 부지 판보다 살짝 밝고 차갑다 */
  bg: '#eceff3',
  floor: '#e9ecf0',
  /** 부지 판 (마당 콘크리트와 같은 층) */
  pad: '#b9bec7',
  padEdge: '#bcc1c9',
  /** 바깥 마당 콘크리트: 건물 바닥보다 분명히 어둡다 */
  concrete: '#b9bec7',
  concreteDark: '#aab1bb',
  /** 도로 아스팔트: 중간 회청색 */
  asphalt: '#9aa5b4',
  asphaltDark: '#8b97a7',
  /** 건물 안 바닥: 거의 흰색 */
  hallFloor: '#f5f6f8',
  /** 지붕·벽 위 덮개: 옅은 회색 (바닥 위에서 지붕선이 보이게) */
  roof: '#d9dee6',
  /** 가장자리 녹지 */
  lawn: '#c3e4b4',
  lawnEdge: '#a6d297',
  line: '#ffffff',
  wall: '#fcfcfd',
  wallShade: '#f1f3f6',
  trim: '#e6e9ee',
  steel: '#bcc4cf',
  steelLight: '#d9dee5',
  dark: '#3a4250',
  rubber: '#2a2f38',
  /** 강조 파랑 하나 */
  blue: '#2f6bff',
  blueDeep: '#1f4fd6',
  blueSoft: '#b9cdff',
  bluePale: '#e3ebff',
  /** 안전 노랑: 차량·로봇·안전 표시에만 */
  yellow: '#ffc31f',
  yellowDeep: '#f2a900',
  /** 크라프트: 파지·베일·팔레트에만 */
  kraft: '#c99a62',
  kraftLight: '#dfbb8b',
  kraftDark: '#ab7c45',
  paper: '#f4eee3',
  paperGrey: '#dcd7ce',
  glass: '#c4d6f2',
  /** 나무 (녹지 띠에 적당히) */
  green: '#8fd383',
  greenDeep: '#6abd68',
  greenLight: '#b4e3a0',
  trunk: '#c9b29a',
  /** 북서쪽 숲: 숲 바닥과 짙은 수관 */
  forestFloor: '#93c886',
  forest: '#5aa85c',
  /** 압축기 건물의 파란 지붕 (사진의 파란 지붕): 본동, 옆동·골판 줄 */
  roofBlue: '#4f8fe0',
  roofBlueDeep: '#2f6fc4',
  /** 사무실 지붕: 사진처럼 짙은 회색 */
  roofOffice: '#8e98a7',
  skin: '#f0c4a0',
  /** 작업자 조끼도 안전 노랑 */
  vest: '#ffc31f',
  vestStripe: '#ffffff',
  helmet: '#ffffff',
  trousers: '#6c7488',
  red: '#ff6b5e',
  amber: '#ffb347',
  white: '#ffffff',
  /** 현장 사진(2026-11-25)의 재질: 사무실 짙은 회색 골판과 골, 1층 차양, 블록 옹벽과 줄눈, 쇠 난간, 녹색 그물망, 회색 철판 울타리 */
  officeWall: '#3f444c',
  officeRib: '#4c525b',
  canopy: '#8c6c4c',
  blockWall: '#cfccc4',
  blockJoint: '#aeaaa1',
  coping: '#e2dfd8',
  railing: '#5d6672',
  net: '#2f8f55',
  fenceGrey: '#a3aab2',
  /** 압축기 건물의 회색 벽 */
  factoryWall: '#c9ced5',
  /** 부지 밖: 도로 아래 땅, 숲 언덕, 먼 산 능선 */
  earth: '#b9ae99',
  grass: '#a5c993',
  hill: '#86b679',
  hillDark: '#6f9f66',
  ridge: '#a8bdb6',
  ridgeFar: '#bfcdc9',
  pole: '#8d8478',
  wire: '#3a3f46',
  extinguisher: '#e0403a',
  cone: '#ff6a2b',
  /** 섹터 바닥 등급 색: A 옅은 파랑, C 옅은 호박색 */
  gradeA: '#e3ecfb',
  gradeC: '#fbebd3',
} as const;


/** 트럭 띠 색: 번호판 인식 전후로 같은 회색 (S2n, 회사는 핀·패널 글자로 알린다) */
export const TRUCK_STRIPE = '#aab3bf';

export type ColorName = keyof typeof C;
