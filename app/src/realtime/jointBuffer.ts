import type { Gripper, Phase, RobotJointsMessage, TankId } from '@ecocycle/shared';
import { JOINT_DELAY_SEC } from '../config/realtime';

// 로봇 관절 값 버퍼. 초당 10~20회 들어오는 값을 store(Redux)에 넣으면 리렌더가 계속 일어나므로 store 밖에 둔다.
// 화면(scene)은 매 프레임 sample(now)로 보간된 값을 읽는다.
// 값을 그대로 저장한다: 관절 순서·단위·영점 변환은 여기서 하지 않는다 (/robots/{id}/model 또는 config/robotModel).

export interface JointSample {
  joints: number[];
  gripper: Gripper;
  phase: Phase;
  targetTankId: TankId | null;
}

interface Frame extends JointSample {
  /** 서버 시각(ms). 순서는 seq와 같다. */
  serverMs: number;
}

const CAPACITY = 64; // 15Hz에서 약 4초
const OFFSET_WINDOW = 60; // 시계 차이를 추정할 최근 수신 수

export interface JointBuffer {
  /** 새 프레임을 넣는다. seq가 이전보다 작거나 같거나 시각이 거꾸로면 버리고 false를 돌려준다. */
  push(message: RobotJointsMessage, receivedAtMs: number): boolean;
  /**
   * 지금 그려야 할 값. 지연(기본 0.15초)만큼 과거 시점을 기준으로 앞뒤 프레임을 보간한다.
   * 마지막 프레임보다 뒤이면 마지막 값을 그대로 유지한다(예측해서 움직이지 않는다). 비어 있으면 null.
   */
  sample(nowMs: number): JointSample | null;
  /**
   * sample과 같은 값을 받아 온 객체에 채워 넣는다(새 객체를 만들지 않는다). 3D 장면이 매 프레임 부른다.
   * 비어 있으면 out을 건드리지 않고 false를 돌려준다.
   */
  sampleInto(nowMs: number, out: JointSample): boolean;
  /** 마지막 프레임을 받은 뒤 지난 시간(ms). 받은 적이 없으면 null */
  ageMs(nowMs: number): number | null;
  /**
   * 마지막 프레임이 가장 빨리 온 경우보다 얼마나 늦게 왔는지(ms, 서버 `ts`와 받은 시각으로 계산). 받은 적이 없으면 null.
   * 지연이 재생 지연(기본 150ms)보다 크게 늘어나면 보간 대신 멈칫할 수 있어 진단에 쓴다.
   */
  lagMs(): number | null;
  /** 재연결·구독 해제 때 비운다. 서버가 다시 시작하면 seq가 처음으로 돌아가므로 새 연결마다 비워야 한다. */
  clear(): void;
}

export function createJointBuffer(options: { delaySec?: number } = {}): JointBuffer {
  const delayMs = (options.delaySec ?? JOINT_DELAY_SEC) * 1000;
  let frames: Frame[] = [];
  let lastSeq = -Infinity;
  let lastReceivedMs: number | null = null;
  // 서버와 내 시계가 다르므로 (받은 시각 - 서버 시각)의 최솟값으로 가장 빨리 온 경우의 차이를 추정한다.
  let offsets: number[] = [];
  // 매 프레임(30fps)마다 sample을 부르므로 최솟값은 push할 때 한 번만 계산해 둔다
  let minOffset = 0;
  let lastLagMs: number | null = null;

  const offset = () => minOffset;

  /** a 프레임의 값을 out에 옮긴다. b가 있으면 관절 각도를 a→b 사이 k(0~1)로 보간한다. */
  function write(out: JointSample, a: Frame, b: Frame | null, k: number): void {
    const n = a.joints.length;
    out.joints.length = n;
    const blend = b !== null && b.joints.length === n;
    for (let j = 0; j < n; j += 1) {
      const v = a.joints[j]!;
      out.joints[j] = blend ? v + (b.joints[j]! - v) * k : v;
    }
    out.gripper.closed = a.gripper.closed;
    out.gripper.holding = a.gripper.holding;
    out.phase = a.phase;
    out.targetTankId = a.targetTankId;
  }

  function fill(nowMs: number, out: JointSample): boolean {
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (!first || !last) return false;

    const target = nowMs - offset() - delayMs;
    if (target <= first.serverMs) {
      write(out, first, null, 0);
      return true;
    }
    if (target >= last.serverMs) {
      write(out, last, null, 0);
      return true;
    }
    for (let i = 0; i < frames.length - 1; i += 1) {
      const a = frames[i]!;
      const b = frames[i + 1]!;
      if (target < a.serverMs || target >= b.serverMs) continue;
      write(out, a, b, (target - a.serverMs) / (b.serverMs - a.serverMs));
      return true;
    }
    write(out, last, null, 0);
    return true;
  }

  return {
    push(message, receivedAtMs) {
      const serverMs = Date.parse(message.ts);
      if (message.seq <= lastSeq || Number.isNaN(serverMs)) return false;
      const last = frames[frames.length - 1];
      if (last && serverMs <= last.serverMs) return false;

      lastSeq = message.seq;
      lastReceivedMs = receivedAtMs;
      const thisOffset = receivedAtMs - serverMs;
      offsets.push(thisOffset);
      if (offsets.length > OFFSET_WINDOW) offsets.shift();
      minOffset = Math.min(...offsets);
      lastLagMs = thisOffset - minOffset;

      frames.push({
        serverMs,
        joints: [...message.joints],
        gripper: { ...message.gripper },
        phase: message.phase,
        targetTankId: message.targetTankId,
      });
      if (frames.length > CAPACITY) frames.shift();
      return true;
    },

    sample(nowMs) {
      const out: JointSample = { joints: [], gripper: { closed: false, holding: false }, phase: 'idle', targetTankId: null };
      return fill(nowMs, out) ? out : null;
    },

    sampleInto: (nowMs, out) => fill(nowMs, out),

    ageMs(nowMs) {
      return lastReceivedMs === null ? null : nowMs - lastReceivedMs;
    },

    lagMs: () => lastLagMs,

    clear() {
      frames = [];
      offsets = [];
      minOffset = 0;
      lastLagMs = null;
      lastSeq = -Infinity;
      lastReceivedMs = null;
    },
  };
}
