import type { RobotState } from '@ecocycle/shared';
import type { Alarm } from '@ecocycle/shared';
import { config } from '../config';
import { clearAlarm, raiseAlarm } from '../sim/alarmOps';
import { commandDelay } from '../sim/commands';
import { setFillRateFactor, setTankFill } from '../sim/plant';
import { publishDevice, publishSummary } from '../sim/publish';
import { excludeFromRotation, resetRobotCycle } from '../sim/robot';
import { devices } from '../sim/state';
import { streamGate } from './gate';

const log = (message: string) => console.log(`[scenario:${config.scenario}] ${message}`);

/** tank-alarm: A1 탱크가 곧 80%를 넘고 계속 올라 95%에서 alarm이 된다 (로봇이 A1을 건너뛴다) */
function tankAlarm(): void {
  setTankFill('tank-a1', 79.5);
  setFillRateFactor('tank-a1', 5);
  excludeFromRotation('tank-a1');
  log('tank-a1 적재율 79.5%에서 시작, 곧 caution, 약 2~3분 뒤 alarm');
}

/** disconnect: 연결은 열어 둔 채 25초 동안 아무 메시지도 보내지 않는다 (35초 정상 → 25초 침묵 반복) */
function disconnect(): void {
  const SILENT_MS = 25_000;
  const NORMAL_MS = 35_000;
  const cycle = () => {
    setTimeout(() => {
      streamGate.muted = true;
      log(`WebSocket 침묵 시작 (${SILENT_MS / 1000}초). 앱은 15초 뒤 "연결 끊김"을 표시해야 한다`);
      setTimeout(() => {
        streamGate.muted = false;
        log('WebSocket 복구. 앱은 REST로 현재 상태를 다시 받아야 한다');
        cycle();
      }, SILENT_MS);
    }, NORMAL_MS);
  };
  cycle();
}

/** robot-error: 25초 뒤 로봇이 error가 되고 알람이 열린다. 45초 뒤 stopped로 복구되고 알람이 해제된다 (반복) */
function robotError(): void {
  const FIRST_MS = 25_000;
  const ERROR_MS = 45_000;
  const REPEAT_GAP_MS = 60_000;
  const robot = () => devices['robot-1'] as RobotState;
  const cycle = (waitMs: number) => {
    setTimeout(() => {
      const r = robot();
      r.status = 'error';
      const alarm: Alarm = raiseAlarm('robot-1', 'alarm', '로봇 오류: 그리퍼 센서 이상');
      publishDevice(r, true);
      publishSummary(true);
      log('로봇 error. 명령은 409로 거부된다');
      setTimeout(() => {
        r.status = 'stopped';
        resetRobotCycle();
        clearAlarm(alarm);
        publishDevice(r, true);
        publishSummary(true);
        log('로봇 복구 (stopped). start 명령으로 다시 시작할 수 있다');
        cycle(REPEAT_GAP_MS);
      }, ERROR_MS);
    }, waitMs);
  };
  cycle(FIRST_MS);
}

/** token-expiry: 액세스 토큰이 20초 만에 만료된다 (config.ts에서 설정). 401 TOKEN_EXPIRED → 리프레시 확인용 */
function tokenExpiry(): void {
  log(`액세스 토큰 유효 시간 ${config.accessTokenTtlSec}초`);
}

/** slow-network: REST 응답과 WebSocket 메시지가 느려지고, 명령 결과도 늦게 온다 */
function slowNetwork(): void {
  streamGate.latencyMs = 1000;
  streamGate.jitterMs = 700;
  commandDelay.minMs = 2000;
  commandDelay.maxMs = 4000;
  log('REST 0.8~2.5초, WebSocket 1~1.7초, 명령 결과 2~4초 지연');
}

/** REST 응답 지연 (slow-network에서만). 0이면 지연 없음 */
export function restDelayMs(): number {
  return config.scenario === 'slow-network' ? 800 + Math.random() * 1700 : 0;
}

export function startScenario(): void {
  switch (config.scenario) {
    case 'normal':
      return;
    case 'tank-alarm':
      return tankAlarm();
    case 'disconnect':
      return disconnect();
    case 'robot-error':
      return robotError();
    case 'token-expiry':
      return tokenExpiry();
    case 'slow-network':
      return slowNetwork();
  }
}
