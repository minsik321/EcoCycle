import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, RobotModel, SectorGrade, TankId } from '@ecocycle/shared';
import { chainSpecFor } from '../scene/robot/chain';
import type { JointSource } from '../scene/robot/jointSource';
import { Stage } from './Stage';
import { Detail, DisconnectBanner, Kpis, Pins, Tables, TopBar, Tracker } from './overlay/Panels';
import { Director } from './sim/director';
import type { PinElements } from './three/Fx';
import type { RigApi } from './three/Rig';
import type { StudioData } from './types';
import type { ViewPreset } from './world/layout';
import './studio.css';

/** 3D를 그리다 오류가 나면 화면 전체가 죽지 않게 받아서 알린다 (홈이 "기본" 탭으로 돌아간다) */
class StageBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface StudioViewProps {
  data: StudioData;
  /** 로봇 관절 값을 주는 곳 (기존 jointSource: 실시간 / 시연) */
  jointSource: JointSource;
  robotModel?: RobotModel;
  /** 연결이 끊겼다: 모든 움직임을 멈추고 "연결 끊김"과 마지막 수신 시각을 보여 준다 */
  disconnected: boolean;
  lastReceivedAt: string | null;
  /** 화면이 숨겨졌거나 CCTV가 열렸다: 그리기를 멈춘다 */
  paused: boolean;
  /** 값이 예시(모의 서버·시연)다 */
  example: boolean;
  /** 상단 바에 넣을 탭 전환 (기본 / 스튜디오) */
  tabs?: ReactNode;
  /** 기기 상세 패널에 넣을 조작 영역. 기존 조작 컴포넌트를 그대로 끼운다 */
  deviceActions?: (id: DeviceId) => ReactNode;
  onFailed: () => void;
}

const INSET = { right: 334, bottom: 150, top: 190 };

/**
 * 스튜디오 화면: 가득 찬 3D 무대와 그 위의 유리 패널. 데이터는 모두 props로 받는다
 * (store 연결은 LiveStudio, 서버 없는 시연은 DemoStudio).
 */
export function StudioView({ data, jointSource, robotModel, disconnected, lastReceivedAt, paused, example, tabs, deviceActions, onFailed }: StudioViewProps) {
  const director = useMemo(() => new Director(), []);
  const [selection, setSelection] = useState<string | null>(null);
  const [view, setView] = useState('all');
  const pins = useRef<PinElements>({});
  const routeKeys = useRef<string[]>([]);
  const rig = useRef<RigApi | null>(null);
  const robotSpec = useMemo(() => chainSpecFor(robotModel), [robotModel]);

  // 서버 값이 바뀌면 연출 감독에게 알린다. 끊긴 동안에는 알리지 않는다 (받지 못한 값을 추측해 움직이지 않는다)
  useEffect(() => {
    if (!disconnected) director.sync(data, Date.now());
  }, [director, data, disconnected]);

  routeKeys.current = [...data.vehicles.filter((v) => v.stage !== 'departed').map((v) => `veh:${v.id}`), 'forklift'];

  const gradeKey = TANK_IDS.map((id) => {
    const d = data.devices[id];
    return d?.type === 'tank' ? d.grade : '-';
  }).join('');
  const grades = useMemo(() => {
    const out: Partial<Record<TankId, SectorGrade>> = {};
    TANK_IDS.forEach((id, i) => {
      const g = gradeKey[i];
      if (g === 'A' || g === 'C') out[id] = g;
    });
    return out;
  }, [gradeKey]);

  const select = useCallback((key: string | null) => setSelection(key), []);
  const goView = useCallback((preset: ViewPreset) => {
    setSelection(null);
    setView(preset.key);
    rig.current?.view(preset);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const compressor = data.devices['compressor-1'];
  const common = { data, disconnected, selection, onSelect: select };

  return (
    <section className="st-root" aria-label="스튜디오 3D 장면" data-frozen={disconnected || undefined} data-paused={paused || undefined}>
      <div className="st-canvas">
        <StageBoundary onError={onFailed}>
          <Stage
            director={director}
            jointSource={jointSource}
            robotSpec={robotSpec}
            frozen={disconnected}
            paused={paused}
            selection={selection}
            onSelect={select}
            pins={pins}
            routeKeys={routeKeys}
            rig={rig}
            inset={INSET}
            balerStatus={compressor?.type === 'compressor' ? compressor.status : 'offline'}
            grades={grades}
          />
        </StageBoundary>
      </div>
      <Pins {...common} pins={pins} />
      <TopBar
        tabs={tabs}
        status={data.summary?.status ?? null}
        disconnected={disconnected}
        lastReceivedAt={lastReceivedAt}
        example={example}
        alarmCount={data.alarms.filter((a) => a.state === 'active').length}
        view={selection ? '' : view}
        onView={goView}
      />
      {disconnected && <DisconnectBanner lastReceivedAt={lastReceivedAt} />}
      <Kpis data={data} disconnected={disconnected} />
      <Detail {...common} deviceActions={deviceActions} />
      <Tracker {...common} />
      <Tables {...common} />
      {jointSource.kind === 'demo' && <p className="st-demo-note">로봇팔은 시연 동작입니다 (실제 로봇 값이 아닙니다)</p>}
    </section>
  );
}
