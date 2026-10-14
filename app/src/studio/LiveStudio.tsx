import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PLANT_METRICS } from '@ecocycle/shared';
import type { DeviceId, PlantMetric } from '@ecocycle/shared';
import { getPlantHistory } from '../api';
import { DeviceControls } from '../components/controls/DeviceControls';
import { USE_MOCK } from '../config/env';
import { devicePagePath } from '../config/navigation';
import { useRobotModel } from '../features/robot/useRobot';
import { demoSource, liveSource } from '../scene/robot/jointSource';
import { useAppSelector } from '../store/hooks';
import { getJointBuffer } from '../store/realtimeClient';
import { selectConnection, selectIsDisconnected, selectOpenAlarms, selectPlantSummary } from '../store/selectors';
import { useRobotJointsSubscription } from '../store/useRealtime';
import { StudioView } from './StudioView';
import type { StudioData } from './types';

const DAY_MS = 24 * 3_600_000;
const REFRESH_MS = 5 * 60_000;

/** 지표 카드의 추이선: 서버의 `GET /plant/history`(최근 24시간, 1시간 간격)를 받아 그대로 쓴다. 실패하면 그리지 않는다 */
function usePlantTrends(enabled: boolean): StudioData['trends'] {
  const [trends, setTrends] = useState<StudioData['trends']>({});
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    const load = () => {
      const to = new Date();
      const from = new Date(to.getTime() - DAY_MS);
      PLANT_METRICS.forEach((metric: PlantMetric) => {
        getPlantHistory({ metric, from: from.toISOString(), to: to.toISOString(), interval: '1h' }, abort.signal)
          .then((res) => setTrends((prev) => ({ ...prev, [metric]: res.points.map((p) => p.value) })))
          .catch(() => undefined);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [enabled]);
  return trends;
}

/**
 * 홈의 스튜디오 탭: 기존 store·실시간 계층의 값을 그대로 스튜디오 화면에 넘긴다.
 * 조작은 기존 조작 컴포넌트(홈용: 위험도 낮은 것만)와 기기 페이지 링크만 쓴다. 권한·차단은 그 컴포넌트와 서버가 맡는다.
 */
export function LiveStudio({ tabs, onFailed }: { tabs?: ReactNode; onFailed: () => void }) {
  useRobotJointsSubscription();
  const devices = useAppSelector((state) => state.devices.byId);
  const summary = useAppSelector(selectPlantSummary);
  const process = useAppSelector((state) => state.process);
  const alarms = useAppSelector(selectOpenAlarms);
  const connection = useAppSelector(selectConnection);
  const disconnected = useAppSelector(selectIsDisconnected);
  const cctvOpen = useAppSelector((state) => state.ui.cctvOpen);
  const model = useRobotModel();
  const trends = usePlantTrends(!disconnected);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  // 주소에 ?demo=1 이 있으면 서버의 관절 값 대신 정해진 시연 동작을 보여 준다 (기본 탭과 같은 규칙)
  const jointSource = useMemo(() => (demo ? demoSource(Date.now()) : liveSource(getJointBuffer)), [demo]);
  const data = useMemo<StudioData>(
    () => ({ devices, summary, vehicles: process.vehicles, batches: process.batches, bales: process.bales, alarms, trends }),
    [devices, summary, process, alarms, trends],
  );

  return (
    <StudioView
      data={data}
      jointSource={jointSource}
      robotModel={model}
      disconnected={disconnected}
      lastReceivedAt={connection.lastReceivedAt}
      paused={!visible || cctvOpen}
      example={USE_MOCK}
      tabs={tabs}
      onFailed={onFailed}
      deviceActions={(id: DeviceId) => (
        <>
          <DeviceControls deviceId={id} context="home" />
          <Link to={devicePagePath(id)} className="st-link">
            상세 보기
          </Link>
        </>
      )}
    />
  );
}
