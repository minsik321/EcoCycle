import { useEffect, useMemo } from 'react';
import type { RobotModel } from '@ecocycle/shared';
import { chainSpecFor } from './robot/chain';
import { Stage } from './Stage';
import type { StageProps } from './Stage';
import { Director } from './sim/director';
import type { StudioData } from './types';

// 3D 장면 조각: three.js와 무대·연출 감독은 모두 여기서부터 불러온다.
// StudioView(패널, three 없음)가 이 파일만 lazy로 불러온다. 그래서 패널은 three를 기다리지 않고 바로 그려진다.

export interface StudioSceneProps extends Omit<StageProps, 'director' | 'robotSpec'> {
  data: StudioData;
  robotModel?: RobotModel;
}

export default function StudioScene({ data, robotModel, ...stage }: StudioSceneProps) {
  const director = useMemo(() => new Director(), []);
  const robotSpec = useMemo(() => chainSpecFor(robotModel), [robotModel]);

  // 서버 값이 바뀌면 연출 감독에게 알린다. 끊긴 동안에는 알리지 않는다 (받지 못한 값을 추측해 움직이지 않는다)
  useEffect(() => {
    if (!stage.frozen) director.sync(data, Date.now());
  }, [director, data, stage.frozen]);

  return <Stage director={director} robotSpec={robotSpec} {...stage} />;
}
