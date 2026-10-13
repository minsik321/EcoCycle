import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceId, DeviceState } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { QUALITY_PROFILES } from '../../config/quality';
import { sceneStats } from '../../scene/stats';
import { demoPose, demoSource } from '../../scene/robot/jointSource';
import type { QualityMode } from '../../store';
import { SceneView } from './SceneView';
import { supportsWebGL, useDocumentVisible } from './sceneSupport';

// 서버·로그인 없이 3D 장면만 보여 주는 시연·측정 페이지 (/scene-demo).
//  - 값은 모두 가짜이고 로봇팔은 정해진 시연 동작이다. 화면에 그렇게 표시한다.
//  - 실제 태블릿에서 프레임(초당 그리는 횟수)을 재는 데 쓴다. 2단계 완료 기준: 초당 30프레임 안정, 30분 이상 끊김·발열 없음.

const NOW = () => new Date().toISOString();

/** 시연용 기기 상태. 탱크 수위는 천천히 오르내려 파지 조각 수가 바뀌는 것을 볼 수 있다. */
function fakeDevices(tSec: number): Partial<Record<DeviceId, DeviceState>> {
  const tank = (id: 'tank-a1' | 'tank-a2' | 'tank-b1' | 'tank-b2', section: 'A1' | 'A2' | 'B1' | 'B2', base: number, speed: number): DeviceState => {
    const fill = Math.round((base + 22 * Math.sin(tSec / speed)) * 10) / 10;
    return {
      id,
      type: 'tank',
      section,
      status: fill >= 95 ? 'alarm' : fill >= 80 ? 'caution' : 'normal',
      fillPercent: fill,
      volumeM3: Math.round(fill * 0.8) / 10,
      capacityM3: 8,
      moisturePercent: 11.5,
      updatedAt: NOW(),
    };
  };
  const pose = demoPose(tSec);
  return {
    'tank-a1': tank('tank-a1', 'A1', 68, 17),
    'tank-a2': tank('tank-a2', 'A2', 45, 23),
    'tank-b1': tank('tank-b1', 'B1', 32, 29),
    'tank-b2': tank('tank-b2', 'B2', 60, 13),
    'robot-1': { id: 'robot-1', type: 'robot', status: 'running', mode: 'auto', phase: pose.phase, targetTankId: pose.targetTankId, gripper: pose.gripper, updatedAt: NOW() },
    'conveyor-z': { id: 'conveyor-z', type: 'conveyor', status: 'normal', running: true, loadPercent: 50, updatedAt: NOW() },
    'compressor-1': { id: 'compressor-1', type: 'compressor', status: 'normal', running: true, pressureMpa: 28.7, temperatureC: 42.3, updatedAt: NOW() },
  };
}

interface Measure {
  fps: number;
  min: number;
  avg: number;
  seconds: number;
  heapMb: number | null;
}

/** 1초마다 그린 횟수를 세어 현재·최저·평균 프레임을 낸다 */
function useFrameMeasure(resetKey: unknown): Measure {
  const [measure, setMeasure] = useState<Measure>({ fps: 0, min: 0, avg: 0, seconds: 0, heapMb: null });
  useEffect(() => {
    let last = sceneStats.frames;
    let total = 0;
    let seconds = 0;
    let min = Infinity;
    const timer = setInterval(() => {
      const fps = sceneStats.frames - last;
      last = sceneStats.frames;
      seconds += 1;
      // 처음 2초는 불러오는 시간이라 최저값에서 뺀다
      if (seconds > 2) {
        total += fps;
        min = Math.min(min, fps);
      }
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setMeasure({
        fps,
        min: Number.isFinite(min) ? min : 0,
        avg: seconds > 2 ? Math.round((total / (seconds - 2)) * 10) / 10 : 0,
        seconds,
        heapMb: memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : null,
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resetKey]);
  return measure;
}

export function SceneDemoPage() {
  const [quality, setQuality] = useState<QualityMode>('standard');
  const [selectedId, setSelectedId] = useState<DeviceId | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const visible = useDocumentVisible();
  const startedAt = useRef(Date.now());
  const jointSource = useMemo(() => demoSource(startedAt.current), []);
  const measure = useFrameMeasure(quality);

  // 저빈도 값은 실제처럼 1초에 한 번만 바꾼다
  useEffect(() => {
    if (disconnected) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [disconnected]);
  // tick이 바뀔 때(1초마다)만 값을 새로 만든다
  const devices = useMemo(() => fakeDevices(tick), [tick]);

  const elapsed = `${Math.floor(measure.seconds / 60)}분 ${measure.seconds % 60}초`;
  const target = QUALITY_PROFILES[quality].maxFps;

  return (
    <main className="flex min-h-full flex-col gap-3 bg-slate-50 p-4 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">3D 홈 시안 (시연·측정)</h1>
          <p className="text-sm text-slate-600">서버 없이 장면만 보여 줍니다. 값은 모두 가짜이고 로봇팔은 정해진 시연 동작입니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="화질 모드" className="flex gap-2">
            {(['standard', 'low'] as const).map((mode) => (
              <Button key={mode} variant={quality === mode ? 'primary' : 'secondary'} aria-pressed={quality === mode} onClick={() => setQuality(mode)}>
                {mode === 'standard' ? '기본' : '저사양'}
              </Button>
            ))}
          </div>
          <Button aria-pressed={disconnected} variant={disconnected ? 'primary' : 'secondary'} onClick={() => setDisconnected((v) => !v)}>
            연결 끊김 흉내
          </Button>
          <Button onClick={() => setSelectedId(null)} disabled={selectedId === null}>
            전체 보기
          </Button>
        </div>
      </header>

      {!supportsWebGL() || failed ? (
        <p role="alert" className="rounded-lg border border-status-alarm bg-red-50 p-4 text-status-alarm">
          이 기기에서는 3D 장면을 표시할 수 없습니다. 홈 화면은 2D 카드로 보입니다.
        </p>
      ) : (
        <SceneView
          devices={devices}
          selectedId={selectedId}
          onSelect={setSelectedId}
          jointSource={jointSource}
          qualityMode={quality}
          disconnected={disconnected}
          paused={!visible}
          onFailed={() => setFailed(true)}
          className="h-[70vh]"
        />
      )}

      <section aria-label="프레임 측정" className="rounded-xl border border-slate-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-5">
          <div>
            <dt className="text-xs text-slate-500">지금 (초당)</dt>
            <dd className="text-2xl font-bold">{measure.fps}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">평균</dt>
            <dd className="text-2xl font-bold">{measure.avg}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">최저</dt>
            <dd className="text-2xl font-bold">{measure.min}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">측정 시간</dt>
            <dd className="text-2xl font-bold">{elapsed}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">메모리</dt>
            <dd className="text-2xl font-bold">{measure.heapMb === null ? '–' : `${measure.heapMb} MB`}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          이 화질 모드의 상한은 초당 {target}번입니다(그 이상은 일부러 그리지 않습니다). 평균과 최저가 상한 가까이 유지되면 끊김이 없는 것입니다.
          30분 이상 켜 두고 최저값과 메모리가 유지되는지, 기기가 뜨거워지지 않는지 확인하세요.
        </p>
      </section>
    </main>
  );
}
