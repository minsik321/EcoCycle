import { useEffect, useMemo, useRef } from 'react';
import type { RobotModel } from '@ecocycle/shared';
import { chainSpecFor } from './robot/chain';
import { Stage } from './Stage';
import type { StageProps } from './Stage';
import { Director } from './sim/director';
import type { StudioData } from './types';
import { PHOTO_VIEWS } from './world/views';
import { onSiteVehicles } from './overlay/text';

// 3D 장면 조각: three.js와 무대·연출 감독은 모두 여기서부터 불러온다.
// StudioView(패널, three 없음)가 이 파일만 lazy로 불러온다. 그래서 패널은 three를 기다리지 않고 바로 그려진다.

export interface StudioSceneProps extends Omit<StageProps, 'director' | 'robotSpec'> {
  data: StudioData;
  robotModel?: RobotModel;
  /** 남동 적치 칸이 다 차서 압축기가 기다리기 시작하거나 멈췄을 때 (바뀔 때만) */
  onYardFull?: (full: boolean) => void;
}

export default function StudioScene({ data, robotModel, onYardFull, ...stage }: StudioSceneProps) {
  const { rig } = stage;
  // 점검용: 표의 "차량 N"과 같은 선택자로 센 회사 안 차량 수를 장면 트럭 대수와 견준다
  const latest = useRef(data);
  latest.current = data;
  const director = useMemo(() => new Director(), []);
  const robotSpec = useMemo(() => chainSpecFor(robotModel), [robotModel]);

  // 서버 값이 바뀌면 연출 감독에게 알린다. 끊긴 동안에는 알리지 않는다 (받지 못한 값을 추측해 움직이지 않는다)
  useEffect(() => {
    if (!stage.frozen) director.sync(data, Date.now());
  }, [director, data, stage.frozen]);

  useEffect(() => {
    director.yard.events.onFull = onYardFull;
    onYardFull?.(director.yardFull);
    return () => {
      director.yard.events.onFull = undefined;
      onYardFull?.(false);
    };
  }, [director, onYardFull]);

  // 점검용: 주소에 ?yardprobe가 있거나 세션 저장소에 점검 표시가 있으면 베일 적치의 겹침·칸 정합과 트럭끼리의 겹침을 읽는 함수를 내준다 (scripts/yardSoak.mjs). 화면 값에는 영향이 없다
  useEffect(() => {
    // (실제 홈은 로그인 뒤 주소가 바뀌므로 점검 스크립트가 세션 저장소에 'ecocycle.yardprobe'를 넣어 켠다)
    if (!new URLSearchParams(window.location.search).has('yardprobe') && sessionStorage.getItem('ecocycle.yardprobe') !== '1') return;
    const probe = window as unknown as { __yardAudit?: () => unknown; __studioView?: (key: string) => boolean };
    probe.__yardAudit = () => ({ t: director.t, ...director.yard.audit(director.trucks), truckOnTruck: director.truckOverlaps(), trucksOnSite: director.truckCount(), vehiclesOnSite: onSiteVehicles(latest.current.vehicles).length, ...director.yard.stats });
    // 사진과 같은 방향의 화면으로 카메라를 옮긴다 (점검 스크립트의 스크린샷용, world/views의 PHOTO_VIEWS)
    probe.__studioView = (key) => {
      const preset = PHOTO_VIEWS[key];
      if (!preset || !rig.current) return false;
      rig.current.view(preset);
      return true;
    };
    return () => {
      delete probe.__yardAudit;
      delete probe.__studioView;
    };
  }, [director, rig]);

  return <Stage director={director} robotSpec={robotSpec} {...stage} />;
}
