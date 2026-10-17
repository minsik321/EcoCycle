import { Suspense, lazy, useEffect, useState } from 'react';
import { frameStats } from '../../studio/three/stats';
import { supportsWebGL, useDocumentVisible } from './sceneSupport';

// 서버·로그인 없이 3D 홈(스튜디오)만 보여 주는 시연·측정 페이지 (/scene-demo).
//  - 값은 모두 예시이고 로봇팔은 정해진 시연 동작이다. 화면에 그렇게 표시한다.
//  - 실제 태블릿에서 프레임(초당 그리는 횟수)을 재는 데 쓴다. 2단계 완료 기준: 초당 30프레임 안정, 30분 이상 끊김·발열 없음.

const DemoStudio = lazy(() => import('../../studio').then((m) => ({ default: m.DemoStudio })));
// 포스터 찍기(?poster=1): 빈 장면만, 패널·글자 없이 (scripts/poster.mjs)
const PosterStudio = lazy(() => import('../../studio').then((m) => ({ default: m.PosterStudio })));

interface Measure {
  fps: number;
  min: number;
  avg: number;
  seconds: number;
  heapMb: number | null;
}

/** 1초마다 그린 장 수를 세어 현재·최저·평균 프레임을 낸다 */
function useFrameMeasure(): Measure {
  const [measure, setMeasure] = useState<Measure>({ fps: 0, min: 0, avg: 0, seconds: 0, heapMb: null });
  useEffect(() => {
    let last = frameStats.frames;
    let total = 0;
    let seconds = 0;
    let min = Infinity;
    const timer = setInterval(() => {
      const fps = frameStats.frames - last;
      last = frameStats.frames;
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
  }, []);
  return measure;
}

export function SceneDemoPage() {
  const [disconnected, setDisconnected] = useState(false);
  const [failed, setFailed] = useState(false);
  const visible = useDocumentVisible();
  const measure = useFrameMeasure();
  const elapsed = `${Math.floor(measure.seconds / 60)}분 ${measure.seconds % 60}초`;

  if (!supportsWebGL() || failed) {
    return (
      <main className="flex min-h-full flex-col gap-3 bg-paper p-4 text-ink">
        <h1 className="text-xl font-bold">3D 홈 시안 (시연·측정)</h1>
        <p role="alert" className="rounded-card border border-status-alarm bg-surface p-4 text-status-alarm">
          이 기기에서는 3D 장면을 표시할 수 없습니다. 홈은 대시보드로 보입니다.
        </p>
      </main>
    );
  }

  if (new URLSearchParams(window.location.search).get('poster') === '1') {
    return (
      <main className="h-full bg-paper">
        <Suspense fallback={null}>
          <PosterStudio onFailed={() => setFailed(true)} />
        </Suspense>
      </main>
    );
  }

  // 스튜디오는 화면 전체를 쓴다. 시연용 버튼과 프레임 수치는 스튜디오 상단 바 안에 둔다
  return (
    <main className="h-full bg-paper text-ink">
      <h1 className="sr-only">3D 홈 시안 (시연·측정)</h1>
      <Suspense
        fallback={
          <div role="status" className="flex h-full items-center justify-center text-ink-soft">
            3D 장면을 불러오는 중…
          </div>
        }
      >
        <DemoStudio
          disconnected={disconnected}
          paused={!visible}
          onFailed={() => setFailed(true)}
          tabs={
            <>
              <button type="button" className="st-aux" aria-pressed={disconnected} onClick={() => setDisconnected((v) => !v)}>
                연결 끊김 흉내
              </button>
              <span className="st-fps" role="status" aria-label="프레임 측정">
                {measure.fps}fps · 평균 {measure.avg} · 최저 {measure.min} · {measure.heapMb === null ? '메모리 –' : `${measure.heapMb}MB`} · {elapsed}
              </span>
            </>
          }
        />
      </Suspense>
    </main>
  );
}
