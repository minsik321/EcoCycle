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
  skin: '#f0c4a0',
  /** 작업자 조끼도 안전 노랑 */
  vest: '#ffc31f',
  vestStripe: '#ffffff',
  helmet: '#ffffff',
  trousers: '#6c7488',
  red: '#ff6b5e',
  amber: '#ffb347',
  white: '#ffffff',
  /** 섹터 바닥 등급 색: A 옅은 파랑, C 옅은 호박색 */
  gradeA: '#e3ecfb',
  gradeC: '#fbebd3',
} as const;

/** 주차된 승용차: 흰색·은색 사이에 산호색·청록·남색·파랑 몇 대 (첫 스튜디오 시안의 색) */
export const CAR_PAINTS = [C.white, '#f08a7e', '#6fc7bb', '#7d8fb5', '#d9dde3', C.blue] as const;

/**
 * 트럭 회사별 띠 색 (차분한 색). 회사 이름은 서버 값이고, 여기서는 이름 → 색을 고르기만 한다.
 * 번호판 인식 전(회사 null)에는 회색 띠.
 */
export const COMPANY_STRIPES = ['#2563eb', '#159a86', '#e0773a', '#7c5cd6', '#d9475d', '#3f9d4b'] as const;
export const UNKNOWN_STRIPE = '#aab3bf';

export function companyStripe(name: string | null): string {
  if (!name) return UNKNOWN_STRIPE;
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COMPANY_STRIPES[h % COMPANY_STRIPES.length]!;
}

export type ColorName = keyof typeof C;
