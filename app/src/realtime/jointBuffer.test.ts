import { describe, expect, it } from 'vitest';
import type { RobotJointsMessage } from '@ecocycle/shared';
import { createJointBuffer } from './jointBuffer';

const T0 = Date.parse('2026-10-13T05:00:00.000Z');

function frame(seq: number, offsetMs: number, joints: number[], extra: Partial<RobotJointsMessage> = {}): RobotJointsMessage {
  return {
    type: 'robot.joints',
    deviceId: 'robot-1',
    seq,
    ts: new Date(T0 + offsetMs).toISOString(),
    joints,
    gripper: { closed: false, holding: false },
    phase: 'move',
    targetTankId: 'tank-a1',
    ...extra,
  };
}

// 서버 시각 T0+x 의 프레임이 내 시계로도 T0+x 에 도착한다고 보면(시계 차이 0, 지연 0) 지연 150ms를 두고 재생된다.
const make = () => createJointBuffer({ delaySec: 0.15 });

describe('jointBuffer', () => {
  it('비어 있으면 null', () => {
    expect(make().sample(T0)).toBeNull();
    expect(make().ageMs(T0)).toBeNull();
  });

  it('지연 시점을 기준으로 앞뒤 프레임을 보간한다', () => {
    const b = make();
    b.push(frame(1, 0, [0, 100]), T0);
    b.push(frame(2, 100, [10, 90]), T0 + 100);
    b.push(frame(3, 200, [20, 80]), T0 + 200);
    // now=T0+200 → 재생 시점 T0+50 → 1번과 2번 프레임의 절반
    expect(b.sample(T0 + 200)!.joints).toEqual([5, 95]);
    // now=T0+250 → 재생 시점 T0+100 → 2번 프레임
    expect(b.sample(T0 + 250)!.joints).toEqual([10, 90]);
  });

  it('seq가 이전보다 작거나 같은 프레임은 버린다', () => {
    const b = make();
    expect(b.push(frame(5, 0, [1]), T0)).toBe(true);
    expect(b.push(frame(5, 50, [2]), T0 + 50)).toBe(false);
    expect(b.push(frame(4, 100, [3]), T0 + 100)).toBe(false);
    expect(b.push(frame(6, 100, [4]), T0 + 100)).toBe(true);
  });

  it('서버 시각이 거꾸로 가는 프레임은 버린다', () => {
    const b = make();
    b.push(frame(1, 100, [1]), T0 + 100);
    expect(b.push(frame(2, 50, [2]), T0 + 120)).toBe(false);
  });

  it('마지막 프레임보다 뒤이면 마지막 값을 유지한다 (예측해서 움직이지 않는다)', () => {
    const b = make();
    b.push(frame(1, 0, [0]), T0);
    b.push(frame(2, 100, [10]), T0 + 100);
    expect(b.sample(T0 + 10_000)!.joints).toEqual([10]);
  });

  it('처음 프레임보다 앞이면 처음 값을, 프레임이 하나뿐이면 그 값을 쓴다', () => {
    const b = make();
    b.push(frame(1, 1000, [7]), T0 + 1000);
    expect(b.sample(T0)!.joints).toEqual([7]);
    expect(b.sample(T0 + 5000)!.joints).toEqual([7]);
  });

  it('서버와 내 시계가 달라도 가장 빨리 온 프레임 기준으로 맞춘다', () => {
    const b = make();
    const skew = 60_000; // 내 시계가 서버보다 1분 빠르다
    b.push(frame(1, 0, [0]), T0 + skew + 80); // 지연 80ms
    b.push(frame(2, 100, [10]), T0 + skew + 100 + 20); // 지연 20ms (가장 빠름)
    b.push(frame(3, 200, [20]), T0 + skew + 200 + 50);
    // 오프셋 = skew + 20 → now = T0+skew+20+100+150 이면 재생 시점은 서버 시각 T0+100+... 계산: now - offset - delay = T0+100+150-150 = T0+100
    expect(b.sample(T0 + skew + 20 + 100 + 150)!.joints).toEqual([10]);
  });

  it('그리퍼·단계·목표 탱크는 이전 프레임 값을 쓴다', () => {
    const b = make();
    b.push(frame(1, 0, [0], { phase: 'pick', gripper: { closed: false, holding: false } }), T0);
    b.push(frame(2, 100, [10], { phase: 'move', gripper: { closed: true, holding: true } }), T0 + 100);
    const s = b.sample(T0 + 200)!; // 재생 시점 T0+50 → 1번 프레임 쪽
    expect(s.phase).toBe('pick');
    expect(s.gripper.closed).toBe(false);
    expect(b.sample(T0 + 1000)!.phase).toBe('move');
  });

  it('돌려준 값을 바꿔도 버퍼 안의 값은 바뀌지 않는다', () => {
    const b = make();
    b.push(frame(1, 0, [1, 2]), T0);
    b.sample(T0)!.joints[0] = 99;
    expect(b.sample(T0)!.joints).toEqual([1, 2]);
  });

  it('용량을 넘으면 오래된 프레임부터 버린다', () => {
    const b = make();
    for (let i = 1; i <= 200; i += 1) b.push(frame(i, i * 66, [i]), T0 + i * 66);
    expect(b.sample(T0)!.joints[0]).toBeGreaterThan(100);
  });

  it('clear하면 seq 기준도 처음으로 돌아간다 (서버가 다시 시작했을 때)', () => {
    const b = make();
    b.push(frame(900, 0, [1]), T0);
    b.clear();
    expect(b.sample(T0)).toBeNull();
    expect(b.push(frame(1, 5000, [2]), T0 + 5000)).toBe(true);
  });

  it('마지막 수신 뒤 지난 시간을 알려 준다', () => {
    const b = make();
    b.push(frame(1, 0, [1]), T0);
    expect(b.ageMs(T0 + 1234)).toBe(1234);
  });
});
