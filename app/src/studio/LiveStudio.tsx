import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { DeviceId } from '@ecocycle/shared';
import { DeviceControls } from '../components/controls/DeviceControls';
import { RobotModeControl } from '../components/controls/RobotModeControl';
import { useImmersiveShell } from '../components/layout/shellChrome';
import { TopBar } from '../components/layout/TopBar';
import { batchBalePath, devicePagePath, recordsPath } from '../config/navigation';
import { PopupLink, useOpenRecordPopup } from '../components/records/recordPopup';
import { useRobotModel } from '../features/robot/useRobot';
import { demoSource, liveSource } from './robot/jointSource';
import { useAppSelector } from '../store/hooks';
import { usePlantTrends } from '../store/usePlantTrends';
import { getJointBuffer } from '../store/realtimeClient';
import { selectConnection, selectIsDisconnected, selectOpenAlarms, selectPlantSummary } from '../store/selectors';
import { useRobotJointsSubscription } from '../store/useRealtime';
import { StudioView } from './StudioView';
import { useStudioTier } from './useStudioTier';
import type { RecordLink, StudioData } from './types';

/**
 * 공정 기록으로 가는 링크 (패널은 주소를 모르고, 앱의 주소 규칙은 config/navigation에 있다).
 * 목록은 공정 기록 화면으로 가고, 차량·배치 한 건은 3D 홈 위에 기록 상세 팝업을 띄운다(열린 동안 3D 그리기는 멈춘다).
 */
const recordLink: RecordLink = (target, label, className) => {
  if (target.kind === 'list') return <Link to={recordsPath(target.tab)} className={className}>{label}</Link>;
  return (
    <>
      <PopupLink target={target} className={className}>{label}</PopupLink>
      {target.kind === 'batch' && <Link to={batchBalePath} className={className}>배치·베일 제어 →</Link>}
    </>
  );
};

/**
 * 3D 홈: 기존 store·실시간 계층의 값을 그대로 스튜디오 화면에 넘긴다.
 * 조작은 기존 조작 컴포넌트(홈용: 위험도 낮은 것만)와 기기 페이지 링크만 쓴다. 권한·차단은 그 컴포넌트와 서버가 맡는다.
 * 예외(2026-10-16 사용자 요청): 로봇 상세 패널에는 기기 페이지와 같은 운전 모드 조작(RobotModeControl: 모드·섹터 지정·수동 집기/놓기)을
 * 같은 권한·확인 단계·command.result 처리로 넣는다. 권한이 없으면 그리지 않고 상태는 패널의 행이 보여 준다.
 * 열려 있는 동안 앱 틀의 상단 바를 넘겨받아(shellChrome) 상단 바 하나로 화면을 쓴다(앱의 주 메뉴는 그대로 남아 접힌다).
 * 넘겨받은 바는 앱 전체와 같은 상단 바(components/layout/TopBar)를 3D 위에 띄우는 모양(overlay)으로 그린 것이고, 가운데 칸에 홈 전환이 들어간다.
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
  const recordPopupOpen = useAppSelector((state) => state.ui.recordPopupOpen);
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
  // 표에서 3D 장면에 없는 대상(출차한 차량, 출하된 베일, 배치)을 누르면 카메라는 두고 기록 상세 팝업만 띄운다
  const openRecord = useOpenRecordPopup();

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
      paused={!visible || cctvOpen || recordPopupOpen}
      topBar={<TopBar overlay className="st-topbar" center={switcher} extra={chrome?.extra} />}
      onFailed={onFailed}
      recordLink={recordLink}
      openRecord={openRecord}
      deviceActions={(id: DeviceId) => (
        <>
          <DeviceControls deviceId={id} context="home" />
          {id === 'robot-1' && <RobotModeControl variant="panel" />}
          <Link to={devicePagePath(id)} className="st-link">
            상세 보기
          </Link>
        </>
      )}
    />
  );
}
