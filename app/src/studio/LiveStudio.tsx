import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DeviceId } from '@ecocycle/shared';
import { DeviceControls } from '../components/controls/DeviceControls';
import { useImmersiveShell } from '../components/layout/shellChrome';
import { USE_MOCK } from '../config/env';
import { batchRecordPath, devicePagePath, recordsPath, vehicleRecordPath } from '../config/navigation';
import { useRobotModel } from '../features/robot/useRobot';
import { demoSource, liveSource } from './robot/jointSource';
import { useAppSelector } from '../store/hooks';
import { usePlantTrends } from '../store/usePlantTrends';
import { getJointBuffer } from '../store/realtimeClient';
import { selectConnection, selectIsDisconnected, selectOpenAlarms, selectPlantSummary } from '../store/selectors';
import { useRobotJointsSubscription } from '../store/useRealtime';
import { StudioView } from './StudioView';
import { StudioAccount } from './overlay/Account';
import { useStudioTier } from './useStudioTier';
import type { RecordLink, StudioData } from './types';

/** 공정 기록 화면으로 가는 링크 (패널은 주소를 모르고, 앱의 주소 규칙은 config/navigation에 있다) */
const recordLink: RecordLink = (target, label, className) => {
  const to = target.kind === 'list' ? recordsPath(target.tab) : target.kind === 'vehicle' ? vehicleRecordPath(target.id) : batchRecordPath(target.id);
  return (
    <Link to={to} className={className}>
      {label}
    </Link>
  );
};

/**
 * 3D 홈: 기존 store·실시간 계층의 값을 그대로 스튜디오 화면에 넘긴다.
 * 조작은 기존 조작 컴포넌트(홈용: 위험도 낮은 것만)와 기기 페이지 링크만 쓴다. 권한·차단은 그 컴포넌트와 서버가 맡는다.
 * 열려 있는 동안 앱 틀의 상단 바를 넘겨받아(shellChrome) 상단 바 하나로 화면을 쓴다(앱의 주 메뉴는 그대로 남아 접힌다).
 * 그 대신 틀의 상단 바가 하던 알람·CCTV·사용자를 스튜디오 상단 바 오른쪽 끝에 둔다.
 */
export function LiveStudio({ switcher, onFailed }: { switcher?: ReactNode; onFailed: () => void }) {
  useRobotJointsSubscription();
  const chrome = useImmersiveShell();
  const devices = useAppSelector((state) => state.devices.byId);
  const summary = useAppSelector(selectPlantSummary);
  const process = useAppSelector((state) => state.process);
  const alarms = useAppSelector(selectOpenAlarms);
  const connection = useAppSelector(selectConnection);
  const disconnected = useAppSelector(selectIsDisconnected);
  const cctvOpen = useAppSelector((state) => state.ui.cctvOpen);
  // 화질: 직접 고른 값은 그대로, 측정값은 기기 종류 기본값(폰 low·태블릿 standard·데스크톱 high)에서 한 단계까지만
  const qualityMode = useAppSelector((state) => state.ui.qualityMode);
  const qualityAuto = useAppSelector((state) => state.ui.qualityAuto);
  const qualityChosen = useAppSelector((state) => state.ui.qualityChosen);
  const { tier } = useStudioTier(qualityAuto || qualityChosen ? null : qualityMode, qualityChosen ? qualityMode : null);
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

  // 주소에 ?demo=1 이 있으면 서버의 관절 값 대신 정해진 시연 동작을 보여 준다 (명세의 최후 수단)
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
      tier={tier}
      disconnected={disconnected}
      lastReceivedAt={connection.lastReceivedAt}
      paused={!visible || cctvOpen}
      example={USE_MOCK}
      switcher={switcher}
      account={chrome ? <StudioAccount extra={chrome.extra} /> : undefined}
      onFailed={onFailed}
      recordLink={recordLink}
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
