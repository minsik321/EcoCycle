import { describe, expect, it } from 'vitest';
import type { RobotModel } from '@ecocycle/shared';
import { DEFAULT_JOINT_AXES, DEFAULT_ROBOT_MODEL, mergeRobotModel } from './robotModel';

describe('robotModel', () => {
  it('기본 모델은 6축이고 관절 수·링크·회전축이 서로 맞다', () => {
    expect(DEFAULT_ROBOT_MODEL.axisCount).toBe(6);
    expect(DEFAULT_ROBOT_MODEL.joints).toHaveLength(6);
    expect(DEFAULT_JOINT_AXES).toHaveLength(DEFAULT_ROBOT_MODEL.axisCount);
    for (const j of DEFAULT_ROBOT_MODEL.joints) expect(j.minDeg).toBeLessThan(j.maxDeg);
  });

  it('서버 값이 없으면 기본값을 쓴다', () => {
    expect(mergeRobotModel(DEFAULT_ROBOT_MODEL, null)).toBe(DEFAULT_ROBOT_MODEL);
    expect(mergeRobotModel(DEFAULT_ROBOT_MODEL, undefined)).toBe(DEFAULT_ROBOT_MODEL);
  });

  it('서버 값이 일관되면 서버 값으로 덮어쓴다', () => {
    const server: RobotModel = {
      deviceId: 'robot-1',
      axisCount: 4,
      joints: [0, 1, 2, 3].map((i) => ({ name: `j${i}`, minDeg: -90, maxDeg: 90, zeroDeg: 0 })),
      linkLengthsM: [0.5, 0.5, 0.3, 0.1],
    };
    expect(mergeRobotModel(DEFAULT_ROBOT_MODEL, server)).toBe(server);
  });

  it('축 수와 관절 목록이 맞지 않는 서버 값은 버리고 기본값을 쓴다', () => {
    const broken: RobotModel = { ...DEFAULT_ROBOT_MODEL, axisCount: 5 };
    expect(mergeRobotModel(DEFAULT_ROBOT_MODEL, broken)).toBe(DEFAULT_ROBOT_MODEL);
  });
});
