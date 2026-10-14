import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, RobotModel, SectorGrade, TankId } from '@ecocycle/shared';
import { chainSpecFor } from './robot/chain';
import type { JointSource } from './robot/jointSource';
import type { QualityTier } from '../config/quality';
import { Stage } from './Stage';
import { Detail, DisconnectBanner, Kpis, MapTools, PhoneSheet, Pins, Tables, TopBar, Tracker } from './overlay/Panels';
import { Director } from './sim/director';
import type { PinElements } from './three/Fx';
import type { RigApi } from './three/Rig';
import type { StudioData } from './types';
import { DEFAULT_VIEW } from './world/layout';
import type { ViewPreset } from './world/layout';
import './studio.css';

/** 3D를 그리다 오류가 나면 화면 전체가 죽지 않게 받아서 알린다 (홈이 대시보드로 돌아간다) */
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
  /** 화질 단계 (studio/quality.ts). 패널 흐림과 3D 그리기가 이 단계를 따른다 */
  tier: QualityTier;
  /** 첫 장을 그려 포스터를 걷었을 때 (측정 화면이 첫 화면까지 걸린 시간을 적는다) */
  onFirstFrame?: (ms: number) => void;
  /** 연결이 끊겼다: 모든 움직임을 멈추고 "연결 끊김"과 마지막 수신 시각을 보여 준다 */
  disconnected: boolean;
  lastReceivedAt: string | null;
  /** 화면이 숨겨졌거나 CCTV가 열렸다: 그리기를 멈춘다 */
  paused: boolean;
  /** 값이 예시(모의 서버·시연)다 */
  example: boolean;
  /** 상단 바의 홈 전환(3D | 대시보드). 어느 폭에서도 바로 보인다 */
  switcher?: ReactNode;
  /** 상단 바의 보조 영역 (시연 화면의 측정 버튼 등, 폰에서는 "더 보기" 안) */
  tabs?: ReactNode;
  /** 상단 바 오른쪽 끝: 앱 틀을 넘겨받았을 때의 알람·CCTV·사용자·메뉴 (LiveStudio가 채운다) */
  account?: ReactNode;
  /** 기기 상세 패널에 넣을 조작 영역. 기존 조작 컴포넌트를 그대로 끼운다 */
  deviceActions?: (id: DeviceId) => ReactNode;
  onFailed: () => void;
}

type Layout = 'wide' | 'narrow' | 'phone';

/** 패널이 가리는 화면 가장자리(px). 카메라가 그만큼 비켜서 대상을 잡는다 */
const INSET: Record<Layout, { right: number; bottom: number; top: number }> = {
  wide: { right: 320, bottom: 140, top: 150 },
  // 좁은 세로 화면(태블릿 세로): 아래에 표와 공정 추적이 쌓인다
  narrow: { right: 0, bottom: 300, top: 170 },
  // 폰: 위에 상단 바와 지표 한 줄, 아래에 접힌 시트
  phone: { right: 0, bottom: 120, top: 110 },
};
const NARROW_PX = 1000;
const PHONE_PX = 600;

/** 화면 폭으로 패널 배치를 고른다 (폰 먼저: 600px 미만은 폰 배치) */
function useLayout(ref: RefObject<HTMLElement | null>): Layout {
  const [layout, setLayout] = useState<Layout>('wide');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 1440;
      setLayout(width < PHONE_PX ? 'phone' : width < NARROW_PX ? 'narrow' : 'wide');
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return layout;
}

/**
 * 스튜디오 화면: 가득 찬 3D 무대와 그 위의 유리 패널. 데이터는 모두 props로 받는다
 * (store 연결은 LiveStudio, 서버 없는 시연은 DemoStudio).
 */
export function StudioView({ data, jointSource, robotModel, tier, onFirstFrame, disconnected, lastReceivedAt, paused, example, switcher, tabs, account, deviceActions, onFailed }: StudioViewProps) {
  const director = useMemo(() => new Director(), []);
  const [selection, setSelection] = useState<string | null>(null);
  const [view, setView] = useState(DEFAULT_VIEW.key);
  const root = useRef<HTMLElement>(null);
  const layout = useLayout(root);
  const pins = useRef<PinElements>({});
  const routeKeys = useRef<string[]>([]);
  const rig = useRef<RigApi | null>(null);
  const robotSpec = useMemo(() => chainSpecFor(robotModel), [robotModel]);
  // 셰이더를 미리 컴파일하는 동안 포스터를 보여 준다 (단계가 바뀌면 무대를 새로 만들므로 다시 덮는다)
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(false), [tier]);
  const firstFrame = useRef(onFirstFrame);
  firstFrame.current = onFirstFrame;
  const onReady = useCallback(() => {
    setReady(true);
    firstFrame.current?.(performance.now());
  }, []);

  // 서버 값이 바뀌면 연출 감독에게 알린다. 끊긴 동안에는 알리지 않는다 (받지 못한 값을 추측해 움직이지 않는다)
  useEffect(() => {
    if (!disconnected) director.sync(data, Date.now());
  }, [director, data, disconnected]);

  // 경로 점선과 목적지 핀은 고른 차량(또는 지게차)에만 그린다 (참고 화면 10)
  routeKeys.current = selection && (selection.startsWith('veh:') || selection === 'forklift') ? [selection] : [];

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
  const zoom = useCallback((dir: 1 | -1) => {
    // 대상을 보고 있다가 멀어지면 고르기를 풀고 구역으로 돌아간다
    if (dir < 0 && selection) {
      setSelection(null);
      return;
    }
    const preset = rig.current?.zoom(dir);
    if (preset) setView(preset.key);
  }, [selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const compressor = data.devices['compressor-1'];
  const phone = layout === 'phone';
  const common = { data, disconnected, selection, onSelect: select };

  return (
    <section ref={root} className={`st-root st-layout-${layout}`} aria-label="스튜디오 3D 장면" data-tier={tier} data-frozen={disconnected || undefined} data-paused={paused || undefined}>
      <div className="st-canvas">
        <StageBoundary onError={onFailed}>
          <Stage
            director={director}
            jointSource={jointSource}
            robotSpec={robotSpec}
            tier={tier}
            onReady={onReady}
            frozen={disconnected}
            paused={paused}
            selection={selection}
            onSelect={select}
            pins={pins}
            routeKeys={routeKeys}
            rig={rig}
            inset={INSET[layout]}
            balerStatus={compressor?.type === 'compressor' ? compressor.status : 'offline'}
            grades={grades}
          />
        </StageBoundary>
      </div>
      {!ready && (
        <div className="st-poster" role="status" aria-label="3D 장면을 준비하는 중">
          <picture>
            <source media="(orientation: portrait)" srcSet="/studio/poster-tall.jpg" />
            <img src="/studio/poster-wide.jpg" alt="" />
          </picture>
          <span className="st-poster-note">3D 장면을 준비하는 중…</span>
        </div>
      )}
      <Pins {...common} pins={pins} />
      <TopBar data={data} switcher={switcher} tabs={tabs} account={account} disconnected={disconnected} lastReceivedAt={lastReceivedAt} example={example} view={view} onView={goView} onSelect={select} compact={phone} />
      {disconnected && <DisconnectBanner lastReceivedAt={lastReceivedAt} />}
      <Kpis data={data} disconnected={disconnected} />
      <MapTools onZoom={zoom} onRotate={(deg) => rig.current?.rotate(deg)} onHome={() => goView(DEFAULT_VIEW)} />
      {phone ? (
        <PhoneSheet {...common} deviceActions={deviceActions} />
      ) : (
        <>
          <Detail {...common} deviceActions={deviceActions} collapsible={layout === 'narrow'} />
          <Tracker {...common} />
          <Tables {...common} />
        </>
      )}
      {jointSource.kind === 'demo' && <p className="st-demo-note">로봇팔은 시연 동작입니다 (실제 로봇 값이 아닙니다)</p>}
    </section>
  );
}
