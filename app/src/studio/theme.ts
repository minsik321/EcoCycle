// 스튜디오 탭의 색. 기존 장면의 palette·디자인 토큰과 무관하다 (studio/CLAUDE.md).
// 구역마다 밝기 단계가 분명해야 한다 (참고 화면 docs/reference/): 도로(중간 회청색) < 마당 콘크리트(옅은 회색) < 건물 바닥(거의 흰색),
// 가장자리의 옅은 녹지. 강조는 파랑 하나 + 차량·로봇의 안전 노랑 + 파지·베일의 크라프트 갈색. 회색 화면은 연결 끊김에만 쓴다.

export const C = {
  /** 부지 밖 바닥: 부지 판보다 살짝 밝고 차갑다 */
  bg: '#eceff3',
  floor: '#e9ecf0',
  /** 부지 판 (마당 콘크리트와 같은 층) */
  pad: '#ced2d9',
  padEdge: '#cfd4db',
  /** 바깥 마당 콘크리트: 건물 바닥보다 분명히 어둡다 */
  concrete: '#ced2d9',
  concreteDark: '#c0c6ce',
  /** 도로 아스팔트: 중간 회청색 */
  asphalt: '#b9c1cc',
  asphaltDark: '#a9b2be',
  /** 건물 안 바닥: 거의 흰색 */
  hallFloor: '#f5f6f8',
  /** 지붕·벽 위 덮개: 옅은 회색 (바닥 위에서 지붕선이 보이게) */
  roof: '#d9dee6',
  /** 가장자리 녹지 */
  lawn: '#cfe3c8',
  lawnEdge: '#bcd6b3',
  line: '#ffffff',
  wall: '#fcfcfd',
  wallShade: '#f1f3f6',
  trim: '#e6e9ee',
  steel: '#bcc4cf',
  steelLight: '#d9dee5',
  dark: '#5a6273',
  rubber: '#3b414c',
  /** 강조 파랑 하나 */
  blue: '#2563eb',
  blueDeep: '#1d4fd8',
  blueSoft: '#bfd0fa',
  bluePale: '#e5ecfd',
  /** 안전 노랑: 차량·로봇·안전 표시에만 */
  yellow: '#f8c12c',
  yellowDeep: '#e9a90c',
  /** 크라프트: 파지·베일·팔레트에만 */
  kraft: '#c99a62',
  kraftLight: '#dfbb8b',
  kraftDark: '#ab7c45',
  paper: '#f4eee3',
  paperGrey: '#dcd7ce',
  glass: '#c4d6f2',
  /** 나무 (녹지 띠에 적당히) */
  green: '#9fcf8f',
  greenDeep: '#7fb873',
  greenLight: '#b8dcaa',
  trunk: '#c9b29a',
  skin: '#f0c4a0',
  /** 작업자 조끼도 안전 노랑 */
  vest: '#f8c12c',
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

/** 주차된 승용차: 흰색과 차분한 색 몇 가지 */
export const CAR_PAINTS = [C.white, '#8fa3bf', '#c7b9a3', '#9fb8ae', '#d9dde3', '#b7a3b2'] as const;

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
