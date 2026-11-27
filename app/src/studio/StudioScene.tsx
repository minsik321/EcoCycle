import { useEffect, useMemo, useRef } from 'react';
import type { RobotModel } from '@ecocycle/shared';
import { chainSpecFor } from './robot/chain';
import { Stage } from './Stage';
import type { StageProps } from './Stage';
import { Director } from './sim/director';
import type { StudioData } from './types';
import { PHOTO_VIEWS, VIEWS } from './world/views';
import { worldToPx } from './world/layout';
import type { ViewPreset } from './world/views';
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
  // 점검용: 연출 감독에게 마지막으로 넘긴 차량 목록 (표와 장면이 같은 값을 보고 있는지)
  const synced = useRef<StudioSceneProps['data']['vehicles'] | null>(null);
  const director = useMemo(() => new Director(), []);
  const robotSpec = useMemo(() => chainSpecFor(robotModel), [robotModel]);

  // 서버 값이 바뀌면 연출 감독에게 알린다. 끊긴 동안에는 알리지 않는다 (받지 못한 값을 추측해 움직이지 않는다)
  useEffect(() => {
    if (stage.frozen) return;
    director.sync(data, Date.now());
    synced.current = data.vehicles;
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
    const probe = window as unknown as { __yardAudit?: () => unknown; __studioView?: (key: string | ViewPreset) => boolean; __cameraError?: () => number; __trucks?: () => unknown; __step?: (sec: number) => number };
    probe.__yardAudit = () => ({ t: director.t, ...director.yard.audit(director.trucks), truckOnTruck: director.truckOverlaps(), trucksOnSite: director.truckCount(), vehiclesOnSite: onSiteVehicles(latest.current.vehicles).length, countStable: synced.current === latest.current.vehicles, ...director.yard.stats });
    // 사진과 같은 방향의 화면으로 카메라를 옮긴다 (점검 스크립트의 스크린샷용, world/views의 PHOTO_VIEWS)
    // 지역 보기(VIEWS의 key: site·top·process·inbound·baler·bales)도 같은 함수로 옮긴다. 미끄러지지 않고 바로 옮긴다(느린 화면에서도 목표에 닿은 화면을 찍게)
    probe.__studioView = (key) => {
      // 점검 스크립트가 보기 하나를 직접 줄 수도 있다 (상차 장면처럼 정해 둔 보기가 없는 곳, S2j)
      const preset = typeof key === 'object' ? key : (PHOTO_VIEWS[key] ?? VIEWS.find((v) => v.key === key));
      if (!preset || !rig.current) return false;
      rig.current.jump(preset);
      return true;
    };
    // 트럭 단계와 번호판 인식 장면 (점검 스크립트가 출차 계근·출차·계근 장면을 기다려 찍는다, S2i)
    probe.__trucks = () => ({
      scan: { active: director.plateScan.active, out: director.plateScan.out, t: director.plateScan.t, plate: director.plateScan.plate },
      trucks: director.trucks.filter((x) => x.active).map((x) => ({ id: x.id, phase: x.phase, stage: x.stage, outbound: x.outbound, leaving: x.leaving, s: x.s, x: x.x, z: x.z, px: worldToPx(x.x, x.z), heading: x.heading, grapple: x.grapple, crane: x.crane.mode, holding: x.crane.holding, grabs: x.crane.grabs, seg: x.crane.seg })),
      // 지게차가 하는 일과 든 베일 (상차·계근 장면을 기다려 찍는다, S2j)
      forklifts: director.forklifts.map((f) => ({ task: f.task?.kind ?? null, carrying: Boolean(f.carrying), cross: f.cross, wide: f.wide, fork: f.fork, clamp: f.clamp, legs: f.legs.length, x: f.x, z: f.z, heading: f.heading, speed: f.speed, leg: f.legs[0]?.kind ?? null })),
      t: director.t,
      ground: director.bales.filter((b) => b.active && b.state === 'ground').length,
      loaded: director.bales.filter((b) => b.active && b.state === 'loaded').length,
    });
    // 월드 시계를 sec초 앞당긴다 (느린 점검 브라우저에서 상차 장면을 기다리지 않고 찍는다, S2j). 서버 값은 그대로다
    probe.__step = (sec) => {
      for (let i = 0; i * 0.05 < sec; i += 1) director.step(0.05);
      return director.t;
    };
    // 카메라가 목표에서 떨어진 정도 (점검 스크립트는 이 값이 0에 가까워질 때까지 기다린 뒤 찍는다)
    probe.__cameraError = () => rig.current?.error() ?? Infinity;
    return () => {
      delete probe.__yardAudit;
      delete probe.__studioView;
      delete probe.__cameraError;
      delete probe.__trucks;
      delete probe.__step;
    };
  }, [director, rig]);

  return <Stage director={director} robotSpec={robotSpec} {...stage} />;
}
