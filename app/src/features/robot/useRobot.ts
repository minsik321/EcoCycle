import { useEffect, useState } from 'react';
import type { RobotModel } from '@ecocycle/shared';
import { getRobotModel } from '../../api';
import { DEFAULT_ROBOT_MODEL, mergeRobotModel } from '../../config/robotModel';
import { getJointBuffer } from '../../store/realtimeClient';
import type { JointSample } from '../../realtime';

/**
 * 로봇 모델(관절 이름·순서·각도 범위). 기본값으로 먼저 그리고, 서버가 `/robots/{id}/model`로 주면 덮어쓴다.
 * 서버 요청이 실패하거나 값이 맞지 않으면 기본값을 그대로 쓴다.
 */
export function useRobotModel(): RobotModel {
  const [model, setModel] = useState<RobotModel>(DEFAULT_ROBOT_MODEL);
  useEffect(() => {
    let cancelled = false;
    getRobotModel('robot-1')
      .then((fromServer) => {
        if (!cancelled) setModel(mergeRobotModel(DEFAULT_ROBOT_MODEL, fromServer));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return model;
}

export interface JointReading {
  sample: JointSample | null;
  /** 마지막 관절 값을 받은 뒤 지난 시간(ms). 받은 적이 없으면 null */
  ageMs: number | null;
}

/**
 * 관절 값을 초당 몇 번만 읽어서 보여 준다 (값이 들어오는 속도마다 그리지 않는다).
 * 표 같은 숫자 표시용이다. 3D 장면은 매 프레임 jointBuffer를 직접 읽는다.
 */
export function useJointReading(intervalMs = 100, now: () => number = Date.now): JointReading {
  const [reading, setReading] = useState<JointReading>({ sample: null, ageMs: null });
  useEffect(() => {
    const read = () => {
      const buffer = getJointBuffer();
      const t = now();
      setReading({ sample: buffer?.sample(t) ?? null, ageMs: buffer?.ageMs(t) ?? null });
    };
    read();
    const timer = setInterval(read, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, now]);
  return reading;
}
