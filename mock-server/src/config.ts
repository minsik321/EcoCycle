export const SCENARIOS = [
  'normal',
  'tank-alarm',
  'disconnect',
  'robot-error',
  'token-expiry',
  'slow-network',
  'refresh-expiry',
  'refresh-reuse',
  'server-restart',
] as const;
export type Scenario = (typeof SCENARIOS)[number];

function parseScenario(argv: string[]): Scenario {
  const arg = argv.find((a) => a.startsWith('--scenario='));
  if (!arg) return 'normal';
  const value = arg.slice('--scenario='.length);
  if ((SCENARIOS as readonly string[]).includes(value)) return value as Scenario;
  console.error(`알 수 없는 시나리오: ${value} (사용 가능: ${SCENARIOS.join(', ')})`);
  process.exit(1);
}

/** 쿠키를 쓰는 요청은 출처를 명시해야 한다(credentials). CORS_ORIGINS가 없으면 로컬 Vite 개발 주소만 허용한다. */
const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function parseSameSite(value: string | undefined): 'lax' | 'none' {
  if (value === undefined || value === '' || value === 'lax') return 'lax';
  if (value === 'none') return 'none';
  console.error(`REFRESH_COOKIE_SAMESITE는 lax 또는 none이어야 합니다: ${value}`);
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** 쉼표로 구분한 허용 출처(쿠키를 보내는 출처). 비어 있으면 로컬 Vite 개발 주소. 배포 시 Vercel 주소를 넣는다. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /**
   * 리프레시 토큰 쿠키의 SameSite. 앱과 API가 같은 사이트면 lax(기본),
   * 다른 사이트(Vercel + Render)면 none(+Secure, Partitioned). REFRESH_COOKIE_SAMESITE=none
   */
  refreshCookieSameSite: parseSameSite(process.env.REFRESH_COOKIE_SAMESITE),
  scenario: parseScenario(process.argv.slice(2)),
  /** 액세스 토큰 유효 시간(초). token-expiry 시나리오에서는 짧게 한다. */
  accessTokenTtlSec: 900,
  /** 자동 로그인(remember) 리프레시 토큰 유효 시간(초). 리프레시할 때마다 다시 시작한다. */
  refreshTokenTtlSec: 60 * 60 * 24 * 14,
  /** 자동 로그인을 끈 세션의 리프레시 토큰 유효 시간(초). 쿠키는 세션 쿠키(브라우저를 닫으면 사라짐) */
  sessionRefreshTokenTtlSec: 60 * 60 * 12,
  wsTicketTtlSec: 30,
};

if (config.corsOrigins.length === 0) config.corsOrigins = DEV_ORIGINS;
if (config.scenario === 'token-expiry') config.accessTokenTtlSec = 20;
if (config.scenario === 'refresh-expiry') {
  config.accessTokenTtlSec = 10;
  config.refreshTokenTtlSec = 30;
  config.sessionRefreshTokenTtlSec = 30;
}
if (config.scenario === 'refresh-reuse') config.accessTokenTtlSec = 20;
