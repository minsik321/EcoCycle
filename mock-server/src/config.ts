export const SCENARIOS = [
  'normal',
  'tank-alarm',
  'disconnect',
  'robot-error',
  'token-expiry',
  'slow-network',
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

export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** 쉼표로 구분한 허용 출처. 비어 있으면 모두 허용(개발용). 배포 시 Vercel 주소를 넣는다. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  scenario: parseScenario(process.argv.slice(2)),
  /** 액세스 토큰 유효 시간(초). token-expiry 시나리오에서는 짧게 한다. */
  accessTokenTtlSec: 900,
  refreshTokenTtlSec: 60 * 60 * 24 * 7,
  wsTicketTtlSec: 30,
};

if (config.scenario === 'token-expiry') config.accessTokenTtlSec = 20;
